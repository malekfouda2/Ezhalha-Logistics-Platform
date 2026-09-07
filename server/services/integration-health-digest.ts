import { getIntegrationHealth, type IntegrationFailureGroup } from "./integration-health";
import { CarrierRetryAdvice } from "@shared/carrier-errors";
import { sendEmail } from "./email";
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
    const report = await getIntegrationHealth({ windowHours: DIGEST_WINDOW_HOURS, limit: 15 });

    // Carrier 5xx blips resolve themselves and the schedulers retry them. Waking a human for
    // those is what turns a useful digest into noise.
    const actionable = report.failureGroups.filter(
      (group) => group.explanation.retry !== CarrierRetryAdvice.RETRY,
    );

    if (actionable.length === 0) {
      logInfo("Integration digest skipped: nothing needing attention in the last 24 hours");
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
          Last 24 hours. Transient carrier outages are excluded — everything below needs a person.
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

    const text = [
      headline,
      "",
      ...actionable.map(
        (group) =>
          `${group.serviceName} ${group.operation} — ${group.count}x: ${group.explanation.title}. ${group.explanation.action}`,
      ),
    ].join("\n");

    const sent = await sendEmail({
      to: recipient,
      subject: `Ezhalha integrations — ${headline}`,
      html,
      text,
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

  logInfo("Starting integration health digest scheduler (daily)");
  digestInterval = setInterval(sendIntegrationHealthDigest, DIGEST_INTERVAL_MS);
}

export function stopIntegrationHealthDigestScheduler(): void {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
    logInfo("Integration health digest scheduler stopped");
  }
}
