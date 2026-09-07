import { storage } from "../storage";
import { decryptIntegrationPayload, encryptIntegrationPayload } from "./integration-apps";
import { getSalesChannelAdapter } from "./sales-channels";
import { logError, logInfo } from "./logger";
import type { SalesChannel } from "@shared/schema";

// Poll interval for the background sync. Each run pulls orders modified since a
// channel's lastSyncedAt, so a missed tick self-heals on the next run.
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
// First run shortly after boot so a freshly-connected store fills its inbox.
const FIRST_RUN_DELAY_MS = 45 * 1000;
// When a channel has never synced, only look back this far on the first pull to
// avoid importing a store's entire history.
const INITIAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

let syncInterval: NodeJS.Timeout | null = null;
let isSyncRunning = false;

function shouldRunScheduler(): boolean {
  if (process.env.DISABLE_SALES_CHANNEL_SYNC_SCHEDULER === "true") return false;
  // Only run on the primary PM2 worker to avoid duplicate polling.
  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") return false;
  return true;
}

function parseSyncSettings(channel: SalesChannel): Record<string, any> {
  if (!channel.syncSettings) return {};
  try {
    return JSON.parse(channel.syncSettings);
  } catch {
    return {};
  }
}

/**
 * Whether an order counts as paid, for the channel's "paid orders only" setting.
 *
 * Per platform on purpose. A WooCommerce order carries `date_paid` and a post-payment
 * status; a Zid order carries `payment_status`. Judging a Zid order by WooCommerce's rules
 * returns false every time, which would silently import nothing at all — the connection
 * would look healthy and the inbox would just stay empty.
 */
function isPaidOrder(platform: string, payload: any): boolean {
  if (platform === "zid") {
    const paymentStatus = String(
      payload?.payment_status?.code ?? payload?.payment_status?.name ?? payload?.payment_status ?? "",
    ).toLowerCase();
    if (paymentStatus) return paymentStatus === "paid";
    // Cash on delivery is never "paid" up front, and refusing to import it would hide the
    // most common order type in the market this platform serves.
    const method = String(payload?.payment_method ?? "").toLowerCase();
    return method.includes("cash");
  }

  if (payload?.date_paid) return true;
  const status = String(payload?.status || "").toLowerCase();
  return status === "processing" || status === "completed";
}

/**
 * Pull orders for a single channel over its platform API and upsert them into
 * the orders inbox. Idempotent (upsert on channel+external id) and safe to call
 * from both the scheduler and the manual "Sync now" endpoint.
 */
export async function syncSalesChannel(channel: SalesChannel): Promise<{ imported: number }> {
  const adapter = getSalesChannelAdapter(channel.platform);
  if (!adapter?.fetchOrders) {
    throw new Error(`Platform ${channel.platform} does not support order pull`);
  }
  if (adapter.requiresStoreUrl !== false && !channel.storeUrl) {
    throw new Error("Channel has no store URL configured");
  }
  if (!channel.credentialsEncrypted) {
    throw new Error("Channel has no API credentials configured");
  }

  const credentials = decryptIntegrationPayload(channel.credentialsEncrypted);
  const since = channel.lastSyncedAt
    ? new Date(channel.lastSyncedAt)
    : new Date(Date.now() - INITIAL_LOOKBACK_MS);

  const settings = parseSyncSettings(channel);
  const paidOnly = (settings.importPaidOnly || "paid") === "paid";

  // Bound the window so an incremental pull re-checks a small overlap and never
  // misses an order that was modified during the previous run.
  const runStartedAt = new Date();
  const raw = await adapter.fetchOrders({
    storeUrl: channel.storeUrl || "",
    credentials,
    since,
    // An adapter that renews its own OAuth token hands the new one back here. Without
    // persisting it the refreshed token would be used for this run and discarded, and the
    // channel would re-refresh on every sync until the original finally expired.
    onCredentialsRefreshed: async (refreshed) => {
      await storage.updateSalesChannel(channel.id, {
        credentialsEncrypted: encryptIntegrationPayload(refreshed),
      });
      logInfo(`Refreshed OAuth credentials for ${channel.platform} channel ${channel.id}`);
    },
  });

  let imported = 0;
  for (const payload of raw) {
    if (paidOnly && !isPaidOrder(channel.platform, payload)) continue;
    try {
      const normalized = adapter.normalizeOrder(payload, {
        clientAccountId: channel.clientAccountId,
        salesChannelId: channel.id,
      });
      await storage.upsertOrder(normalized);
      imported++;
    } catch (error) {
      logError("Failed to normalize/upsert pulled order", {
        channelId: channel.id,
        platform: channel.platform,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await storage.updateSalesChannel(channel.id, { lastSyncedAt: runStartedAt, status: "connected" });
  return { imported };
}

export async function syncAllSalesChannels(): Promise<number> {
  if (isSyncRunning) return 0;
  isSyncRunning = true;
  let totalImported = 0;

  try {
    const channels = await storage.listAllSalesChannels();
    for (const channel of channels) {
      const adapter = getSalesChannelAdapter(channel.platform);
      if (!adapter?.fetchOrders) continue; // no pull support (e.g. webhook-only)
      // Syncable means credentials plus — only where the platform needs one — a store URL.
      // Zid has no store URL by design.
      if (!channel.credentialsEncrypted) continue;
      if (adapter.requiresStoreUrl !== false && !channel.storeUrl) continue;
      const settings = parseSyncSettings(channel);
      if (settings.autoSync === false) continue; // client disabled auto-sync

      try {
        const { imported } = await syncSalesChannel(channel);
        totalImported += imported;
      } catch (error) {
        logError("Sales-channel auto-sync failed", {
          channelId: channel.id,
          platform: channel.platform,
          error: error instanceof Error ? error.message : String(error),
        });
        await storage.updateSalesChannel(channel.id, { status: "error" });
      }
    }

    if (totalImported > 0) {
      logInfo(`Sales-channel sync imported ${totalImported} order${totalImported === 1 ? "" : "s"}`);
    }
    return totalImported;
  } finally {
    isSyncRunning = false;
  }
}

export function startSalesChannelSyncScheduler(): void {
  if (!shouldRunScheduler()) {
    logInfo(`Skipping sales-channel sync scheduler on worker ${process.env.NODE_APP_INSTANCE ?? "standalone"}`);
    return;
  }
  if (syncInterval) clearInterval(syncInterval);
  logInfo("Starting sales-channel sync scheduler (every 5 minutes)");
  syncInterval = setInterval(syncAllSalesChannels, SYNC_INTERVAL_MS);
  setTimeout(syncAllSalesChannels, FIRST_RUN_DELAY_MS);
}

export function stopSalesChannelSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    logInfo("Sales-channel sync scheduler stopped");
  }
}
