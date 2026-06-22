import { getCarrierAdapter } from "../integrations/carriers";
import type { CarrierAdapter, TrackingResponse } from "../integrations/fedex";
import { storage } from "../storage";
import { withBoundIntegrationAccount } from "./integration-runtime";
import { logError, logInfo } from "./logger";
import {
  createAttentionFlag,
  detectOperationAttentionFlags,
  getOperationShipmentKind,
  recordShipmentStatusChange,
} from "./operations";
import { OperationShipmentKind, type Shipment } from "@shared/schema";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

let expressTrackingRefreshInterval: NodeJS.Timeout | null = null;
let isRefreshRunning = false;

function shouldRunExpressTrackingRefreshScheduler(): boolean {
  if (process.env.DISABLE_EXPRESS_TRACKING_REFRESH_SCHEDULER === "true") {
    return false;
  }

  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") {
    return false;
  }

  return true;
}

function resolveCarrierCode(carrier?: string | null): string {
  return carrier?.trim() ? carrier.trim().toUpperCase() : "FEDEX";
}

function getIntegrationAppKeyForCarrier(carrierCode?: string | null): string {
  const normalized = resolveCarrierCode(carrierCode).toLowerCase();
  if (normalized === "fedex") return "fedex";
  if (normalized === "dhl") return "dhl";
  if (normalized === "aramex") return "aramex";
  return normalized;
}

function getAdapterForShipment(shipment: Shipment): CarrierAdapter {
  return getCarrierAdapter(resolveCarrierCode(shipment.carrierCode || shipment.carrierName));
}

function getShipmentIntegrationRoutingOptions(shipment: Shipment) {
  return {
    shipperCountryCode: shipment.senderCountry,
    recipientCountryCode: shipment.recipientCountry,
    clientAccountId: shipment.clientAccountId,
  };
}

// Maps a free-form carrier tracking status (e.g. FedEx `statusByLocale`,
// "Shipment information sent to FedEx") to one of our internal shipment
// statuses. Returns null when the carrier string is unrecognized so the
// caller can keep the previous status instead of writing the raw carrier
// string into `shipments.status` — a raw string there silently knocks the
// shipment out of the cancellable set and breaks cancellation.
function mapCarrierTrackingStatusToShipmentStatus(tracking: TrackingResponse): string | null {
  const status = (tracking.status || "").toLowerCase();
  if (!status.trim()) return null;
  if (status.includes("delivered")) return "delivered";
  if (status.includes("out for delivery") || status.includes("vehicle for delivery")) return "out_for_delivery";
  if (status.includes("customs") || status.includes("clearance")) return "customs_clearance";
  if (status.includes("exception") || status.includes("failed") || status.includes("error")) return "carrier_error";
  if (status.includes("picked") || status.includes("pickup")) return "picked_up";
  if (
    status.includes("transit") ||
    status.includes("departed") ||
    status.includes("arrived") ||
    status.includes("facility") ||
    status.includes("on the way")
  ) {
    return "in_transit";
  }
  // Pre-pickup phrasings: carrier has the shipment info but it is not yet
  // moving, so it must stay cancellable.
  if (
    status.includes("created") ||
    status.includes("label") ||
    status.includes("information sent") ||
    status.includes("information received") ||
    status.includes("ready for") ||
    status.includes("order processed")
  ) {
    return "created";
  }
  return null;
}

function shouldRefreshShipment(shipment: Shipment): boolean {
  if (getOperationShipmentKind(shipment) !== OperationShipmentKind.EXPRESS) return false;
  if (!shipment.carrierTrackingNumber) return false;
  if (!["paid", "unpaid"].includes(shipment.paymentStatus || "")) return false;
  if (["delivered", "cancelled"].includes(shipment.status)) return false;
  return true;
}

export async function refreshExpressCarrierStatuses(): Promise<number> {
  if (isRefreshRunning) {
    return 0;
  }

  isRefreshRunning = true;
  let updatedCount = 0;

  try {
    const allShipments = await storage.getShipments();
    const candidates = allShipments.filter(shouldRefreshShipment);

    for (const shipment of candidates) {
      try {
        const carrierAdapter = getAdapterForShipment(shipment);
        const tracking = await withBoundIntegrationAccount(
          getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
          shipment.carrierIntegrationAccountId,
          getShipmentIntegrationRoutingOptions(shipment),
          () => carrierAdapter.trackShipment(shipment.carrierTrackingNumber!),
        );
        const mappedStatus = mapCarrierTrackingStatusToShipmentStatus(tracking);
        const previousStatus = shipment.status;
        const nextStatus = mappedStatus ?? previousStatus;
        const previousCarrierStatus = shipment.carrierStatus;

        if (
          nextStatus !== previousStatus ||
          tracking.status !== previousCarrierStatus ||
          (tracking.estimatedDelivery && `${tracking.estimatedDelivery}` !== `${shipment.estimatedDelivery}`) ||
          (tracking.actualDelivery && `${tracking.actualDelivery}` !== `${shipment.actualDelivery}`)
        ) {
          const updated = await storage.updateShipment(shipment.id, {
            status: nextStatus,
            carrierStatus: tracking.status,
            estimatedDelivery: tracking.estimatedDelivery || shipment.estimatedDelivery,
            actualDelivery: tracking.actualDelivery || shipment.actualDelivery,
            carrierLastAttemptAt: new Date(),
            updatedAt: new Date(),
          });

          if (updated) {
            await recordShipmentStatusChange({
              shipment: updated,
              previousStatus,
              nextStatus,
              source: "carrier_refresh",
            });
            updatedCount++;
          }
        }
      } catch (error) {
        logError("Express tracking refresh failed for shipment", {
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          carrierTrackingNumber: shipment.carrierTrackingNumber,
          carrierCode: shipment.carrierCode,
          error: error instanceof Error ? error.message : String(error),
        });
        await createAttentionFlag({
          shipmentId: shipment.id,
          issueType: "tracking_refresh_failed",
          severity: "medium",
          details: error instanceof Error ? error.message : "Carrier tracking refresh failed.",
        });
      }
    }

    await detectOperationAttentionFlags();

    if (updatedCount > 0) {
      logInfo(`Refreshed ${updatedCount} express shipment status update${updatedCount === 1 ? "" : "s"}`);
    }

    return updatedCount;
  } finally {
    isRefreshRunning = false;
  }
}

export function startExpressTrackingRefreshScheduler(): void {
  if (!shouldRunExpressTrackingRefreshScheduler()) {
    logInfo(
      `Skipping express tracking refresh scheduler on worker ${process.env.NODE_APP_INSTANCE ?? "standalone"}`,
    );
    return;
  }

  if (expressTrackingRefreshInterval) {
    clearInterval(expressTrackingRefreshInterval);
  }

  logInfo("Starting express tracking refresh scheduler (every 10 minutes)");
  expressTrackingRefreshInterval = setInterval(refreshExpressCarrierStatuses, REFRESH_INTERVAL_MS);
  setTimeout(refreshExpressCarrierStatuses, 60 * 1000);
}

export function stopExpressTrackingRefreshScheduler(): void {
  if (expressTrackingRefreshInterval) {
    clearInterval(expressTrackingRefreshInterval);
    expressTrackingRefreshInterval = null;
    logInfo("Express tracking refresh scheduler stopped");
  }
}
