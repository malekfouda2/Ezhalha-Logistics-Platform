import { getIntegrationHealth, type IntegrationFailureGroup } from "./integration-health";
import { CarrierRetryAdvice } from "@shared/carrier-errors";
import { dispatchTemplatedEmail } from "./email-delivery";
import { configBoolean, configNumber, getEmailSettings } from "./email-settings";
import { storage } from "../storage";
import { EmailDeliveryStatus } from "@shared/schema";
import { logError, logInfo } from "./logger";

/**
 * A once-a-day summary of what the carriers refused.
 *
 * Deliberately quiet. Email volume is capped on our current Postmark plan, and a digest that
 * arrives every day saying "nothing wrong" is a digest people filter into a folder and stop
 * reading — at which point it cannot do its job on the day it matters. So it only sends when
 * something needs a person, and it leads with the failures a human can actually act on.
 */

const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DIGEST_WINDOW_HOURS = 24;

let digestInterval: NodeJS.Timeout | null = null;

function shouldRunDigestScheduler(): boolean {
  if (process.env.DISABLE_INTEGRATION_DIGEST_SCHEDULER === "true") {
    return false;
  }

  // Only one worker sends, or a four-worker cluster sends four copies.
  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") {
    return false;
  }

  return Boolean(digestRecipient());
}

function digestRecipient(): string | undefined {
  return process.env.INTEGRATION_DIGEST_EMAIL || process.env.ADMIN_EMAIL;
}

/**
 * Has today's digest already gone out?
 *
 * Answered from the delivery log rather than a new column: the log already records every send,
 * and a second source of truth for "when did this last send" is one more thing to keep honest.
 */
async function digestAlreadySentToday(): Promise<boolean> {
  const recent = await storage
    .getEmailDeliveries({ templateSlug: "integration_health_digest", status: EmailDeliveryStatus.SENT, limit: 1 })
    .catch(() => []);
  const last = recent[0]?.sentAt ?? recent[0]?.createdAt;
  if (!last) return false;
  const now = new Date();
  const lastSent = new Date(last);
  return (
    lastSent.getUTCFullYear() === now.getUTCFullYear() &&
    lastSent.getUTCMonth() === now.getUTCMonth() &&
    lastSent.getUTCDate() === now.getUTCDate()
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGroupRow(group: IntegrationFailureGroup): string {
  const retryNote =
    group.explanation.retry === CarrierRetryAdvice.RETRY
      ? "Worth retrying"
      : group.explanation.retry === CarrierRetryAdvice.AFTER_FIX
        ? "Fix before retrying"
        : "Retrying will not help";

  return `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top">
        <strong>${escapeHtml(group.serviceName)}</strong><br>
        <span style="color:#666;font-size:12px">${escapeHtml(group.operation)}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;vertical-align:top">
        <strong>${group.count.toLocaleString()}</strong>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top">
        <strong>${escapeHtml(group.explanation.title)}</strong><br>
        <span style="color:#666;font-size:12px">${escapeHtml(group.explanation.action)}</span><br>
        <span style="font-size:11px;color:#999">${escapeHtml(retryNote)}</span>
      </td>
    </tr>`;
}

/**
 * Send the digest if there is anything worth sending.
 *
 * Returns whether an email actually went out, so the scheduler can log honestly rather than
 * claiming to have sent something it suppressed.
 */
export async function sendIntegrationHealthDigest(): Promise<boolean> {
  const recipient = digestRecipient();
  if (!recipient) {
    logInfo("Integration digest skipped: no INTEGRATION_DIGEST_EMAIL or ADMIN_EMAIL configured");
    return false;
  }

  try {
    const settings = await getEmailSettings("integration_health_digest");
    if (!settings.enabled || !settings.scheduleEnabled) {
      logInfo("Integration digest is switched off in email settings");
      return false;
    }

    // A pinned hour turns the sweep into a gate: the job runs often, and only the run inside the
    // chosen hour sends. Without this the daily digest arrives at whatever time the process last
    // restarted, which is how it ends up landing at 3am after a deploy.
    if (settings.sendHourUtc !== null) {
      if (new Date().getUTCHours() !== settings.sendHourUtc) {
        return false;
      }
      if (await digestAlreadySentToday()) {
        logInfo("Integration digest already sent today");
        return false;
      }
    }

    const windowHours = Math.max(1, configNumber(settings, "lookbackHours", DIGEST_WINDOW_HOURS));
    const report = await getIntegrationHealth({ windowHours, limit: 15 });

    // Carrier 5xx blips resolve themselves and the schedulers retry them. Waking a human for
    // those is what turns a useful digest into noise.
    const actionable = report.failureGroups.filter(
      (group) => group.explanation.retry !== CarrierRetryAdvice.RETRY,
    );

    if (actionable.length === 0 && configBoolean(settings, "skipWhenEmpty", true)) {
      logInfo(`Integration digest skipped: nothing needing attention in the last ${windowHours} hours`);
      return false;
    }

    const totalActionable = actionable.reduce((sum, group) => sum + group.count, 0);
    const headline = `${totalActionable.toLocaleString()} integration ${
      totalActionable === 1 ? "failure needs" : "failures need"
    } attention`;

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:720px">
        <h2 style="margin:0 0 4px">${escapeHtml(headline)}</h2>
        <p style="color:#666;margin:0 0 16px">
          Last ${windowHours} hours. Transient carrier outages are excluded — everything below needs a person.
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <thead>
            <tr style="text-align:left;background:#fafafa">
              <th style="padding:8px 10px;border-bottom:2px solid #eee">Service</th>
              <th style="padding:8px 10px;border-bottom:2px solid #eee;text-align:right">Count</th>
              <th style="padding:8px 10px;border-bottom:2px solid #eee">What went wrong</th>
            </tr>
          </thead>
          <tbody>${actionable.map(renderGroupRow).join("")}</tbody>
        </table>
        <p style="color:#666;font-size:12px;margin-top:16px">
          Full detail, including the carriers' own responses, is on the Integration Health page.
        </p>
      </div>`;

    const { sent } = await dispatchTemplatedEmail({
      slug: "integration_health_digest",
      to: recipient,
      variables: {
        failure_count: totalActionable.toLocaleString(),
        period_text: `the last ${windowHours} hours`,
        digest_body: html,
        year: new Date().getFullYear().toString(),
      },
    });

    if (sent) {
      logInfo(`Integration digest sent to ${recipient} (${actionable.length} groups)`);
    }
    return sent;
  } catch (error) {
    logError("Failed to send integration health digest", error);
    return false;
  }
}

export function startIntegrationHealthDigestScheduler(): void {
  if (!shouldRunDigestScheduler()) {
    logInfo(
      `Skipping integration digest scheduler on worker ${process.env.NODE_APP_INSTANCE ?? "standalone"}`,
    );
    return;
  }

  if (digestInterval) {
    clearInterval(digestInterval);
  }

  // Arm on the historical daily cadence, then re-arm once the configured interval is read —
  // the scheduler must not depend on a database read to run at all.
  digestInterval = setInterval(sendIntegrationHealthDigest, DIGEST_INTERVAL_MS);
  logInfo("Starting integration health digest scheduler");

  void getEmailSettings("integration_health_digest")
    .then((settings) => {
      let minutes = Math.max(1, settings.intervalMinutes ?? DIGEST_INTERVAL_MS / 60000);
      // A pinned hour needs the sweep to come around at least hourly, or the one run per day can
      // fall outside the chosen hour and the digest never sends at all.
      if (settings.sendHourUtc !== null) minutes = Math.min(minutes, 60);
      if (minutes * 60 * 1000 === DIGEST_INTERVAL_MS) return;
      if (digestInterval) clearInterval(digestInterval);
      digestInterval = setInterval(sendIntegrationHealthDigest, minutes * 60 * 1000);
      logInfo(`Integration digest set to every ${minutes} minute(s)`);
    })
    .catch((error) => logError("Failed to read digest schedule; staying on the default", error));
}

/** Re-read the schedule after an admin changes it, without a deploy. */
export function restartIntegrationHealthDigestScheduler(): void {
  stopIntegrationHealthDigestScheduler();
  startIntegrationHealthDigestScheduler();
}

export function stopIntegrationHealthDigestScheduler(): void {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
    logInfo("Integration health digest scheduler stopped");
  }
}
