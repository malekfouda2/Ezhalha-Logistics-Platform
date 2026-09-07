/**
 * Flags dangerous goods quotations whose validity has run out.
 *
 * The carrier held a price for a period; when that period ends, the quote is no longer a
 * price. What it is NOT is a cancellation. Nothing is booked at this point — the air waybill
 * is only raised after the client pays — so an expired quote costs nobody anything, and the
 * only correct action is to tell an operator so they can chase the client or re-confirm the
 * price with the carrier.
 *
 * Auto-cancelling here would be the wrong kind of tidy. Older shipments quoted before the
 * booking step was split out may still carry a waybill; the flag names it when one exists,
 * because that one does need unwinding by hand.
 */

import { and, eq, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { db } from "../db";
import { shipments } from "@shared/schema";
import { DG_MANUAL_FULFILLMENT_TYPE } from "@shared/dangerous-goods";
import { createAttentionFlag } from "./operations";
import { logError, logInfo } from "./logger";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 45 * 1000;

let expiryInterval: NodeJS.Timeout | null = null;

export async function flagExpiredDangerousGoodsQuotes(): Promise<number> {
  try {
    const expired = await db
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.fulfillmentType, DG_MANUAL_FULFILLMENT_TYPE),
          eq(shipments.status, "payment_pending"),
          ne(shipments.paymentStatus, "paid"),
          isNull(shipments.deletedAt),
          isNotNull(shipments.dgQuoteExpiresAt),
          lte(shipments.dgQuoteExpiresAt, new Date()),
          // Flag once, not once an hour forever.
          isNull(shipments.dgQuoteExpiryFlaggedAt),
        ),
      );

    for (const shipment of expired) {
      await createAttentionFlag({
        shipmentId: shipment.id,
        issueType: "dangerous_goods_quote_expired",
        severity: "high",
        details:
          `The dangerous goods quotation for ${shipment.trackingNumber} expired on ` +
          `${shipment.dgQuoteExpiresAt?.toISOString().slice(0, 10)} without payment. ` +
          `Re-confirm the price with ${shipment.carrierCode || "the carrier"} or close it off.` +
          (shipment.carrierTrackingNumber
            ? ` Air waybill ${shipment.carrierTrackingNumber} is still open and must be cancelled by email.`
            : " Nothing is booked with the carrier, so nothing needs unwinding."),
      });

      await db
        .update(shipments)
        .set({ dgQuoteExpiryFlaggedAt: new Date() })
        .where(eq(shipments.id, shipment.id));
    }

    if (expired.length > 0) {
      logInfo(`Flagged ${expired.length} expired dangerous goods quotation(s) for operations`);
    }

    return expired.length;
  } catch (error) {
    logError("Failed to flag expired dangerous goods quotations", error);
    return 0;
  }
}

function shouldRunScheduler(): boolean {
  if (process.env.DISABLE_DG_QUOTE_EXPIRY_SCHEDULER === "true") {
    return false;
  }
  // One worker only, matching every other scheduler here: four pm2 workers would otherwise
  // raise four attention flags for the same shipment.
  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") {
    return false;
  }
  return true;
}

export function startDangerousGoodsQuoteExpiryScheduler(): void {
  if (!shouldRunScheduler()) {
    logInfo(
      `Skipping dangerous goods quote expiry scheduler on worker ${process.env.NODE_APP_INSTANCE ?? "standalone"}`,
    );
    return;
  }

  if (expiryInterval) {
    clearInterval(expiryInterval);
  }

  logInfo("Starting dangerous goods quote expiry scheduler (hourly)");
  expiryInterval = setInterval(flagExpiredDangerousGoodsQuotes, CHECK_INTERVAL_MS);
  setTimeout(flagExpiredDangerousGoodsQuotes, FIRST_RUN_DELAY_MS);
}

export function stopDangerousGoodsQuoteExpiryScheduler(): void {
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
    logInfo("Dangerous goods quote expiry scheduler stopped");
  }
}
