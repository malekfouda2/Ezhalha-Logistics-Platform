import { AbandonedShipmentRecoveryStatus } from "@shared/schema";
import { storage } from "../storage";
import { logError, logInfo } from "./logger";

export async function processAbandonedRecoveryExpirations(): Promise<number> {
  try {
    const recoveries = await storage.getAbandonedShipmentRecoveries({ includeDismissed: true });
    const now = Date.now();
    let expiredCount = 0;

    for (const recovery of recoveries) {
      if (
        recovery.status !== AbandonedShipmentRecoveryStatus.DISCOUNT_SENT ||
        !recovery.discountExpiresAt ||
        new Date(recovery.discountExpiresAt).getTime() > now
      ) {
        continue;
      }

      await storage.updateAbandonedShipmentRecovery(recovery.id, {
        status: AbandonedShipmentRecoveryStatus.EXPIRED,
        lastAction: "discount_expired",
      });
      logInfo("Abandoned recovery offer expired", {
        source: "abandoned_recovery",
        event: "offer_expired",
        shipmentId: recovery.shipmentId,
        recoveryId: recovery.id,
        clientAccountId: recovery.clientAccountId,
        expiresAt: recovery.discountExpiresAt,
      });
      expiredCount += 1;
    }

    if (expiredCount > 0) {
      logInfo(`Expired ${expiredCount} abandoned shipment recovery discount offer${expiredCount === 1 ? "" : "s"}`);
    }

    return expiredCount;
  } catch (error) {
    logError("Error processing abandoned recovery expirations", error);
    return 0;
  }
}

let abandonedRecoveryInterval: NodeJS.Timeout | null = null;

function shouldRunAbandonedRecoveryScheduler(): boolean {
  if (process.env.DISABLE_ABANDONED_RECOVERY_SCHEDULER === "true") {
    return false;
  }

  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") {
    return false;
  }

  return true;
}

export function startAbandonedRecoveryScheduler(): void {
  if (!shouldRunAbandonedRecoveryScheduler()) {
    logInfo(
      `Skipping abandoned recovery scheduler on worker ${process.env.NODE_APP_INSTANCE ?? "standalone"}`,
    );
    return;
  }

  if (abandonedRecoveryInterval) {
    clearInterval(abandonedRecoveryInterval);
  }

  logInfo("Starting abandoned recovery scheduler (hourly)");
  abandonedRecoveryInterval = setInterval(processAbandonedRecoveryExpirations, 60 * 60 * 1000);
  setTimeout(processAbandonedRecoveryExpirations, 45 * 1000);
}

export function stopAbandonedRecoveryScheduler(): void {
  if (abandonedRecoveryInterval) {
    clearInterval(abandonedRecoveryInterval);
    abandonedRecoveryInterval = null;
    logInfo("Abandoned recovery scheduler stopped");
  }
}
