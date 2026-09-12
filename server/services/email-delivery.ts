import { EmailDeliveryStatus, type EmailDelivery } from "@shared/schema";
import { storage } from "../storage";
import { logError, logInfo } from "./logger";
import { deliverEmail } from "./email-transport";
import { getRenderedTemplate } from "./email-templates";
import { getEmailSettings } from "./email-settings";

/**
 * Every templated email goes through here.
 *
 * Before this existed, `sendEmail` tried once and returned a boolean nobody checked. A failure
 * was a log line: no record that the email was owed, no way to answer "did the client ever get
 * the quotation?", and nothing to re-drive. Each send now leaves an `email_deliveries` row that
 * carries its own attempt count and next attempt time, so the worker can pick it up later and
 * the admin page can show what happened.
 *
 * The rendered body is deliberately *not* stored. A retry re-renders from the current template,
 * because an admin who has just fixed a broken template wants the fixed one to go out.
 */

export interface DispatchParams {
  slug: string;
  to: string;
  variables: Record<string, string>;
  entityType?: string | null;
  entityId?: string | null;
  /** Used when the slug has no template row and no built-in default — legacy inline emails. */
  fallback?: { subject: string; html: string };
}

export interface DispatchResult {
  sent: boolean;
  deliveryId: string | null;
  /** The template is switched off, or mail is unconfigured. Not a failure, and never retried. */
  skipped: boolean;
  error?: string;
}

function backoffMs(attempts: number, baseSeconds: number): number {
  // Exponential, capped at six hours. A mail server that just refused us is rarely ready a
  // second later, and a tight loop against a rate-limited provider makes the problem worse.
  const seconds = Math.min(baseSeconds * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60);
  return seconds * 1000;
}

async function attemptDelivery(
  delivery: EmailDelivery,
  rendered: { subject: string; html: string },
): Promise<boolean> {
  const attempts = delivery.attempts + 1;
  const now = new Date();
  const result = await deliverEmail({ to: delivery.recipient, subject: rendered.subject, html: rendered.html });

  if (result.sent) {
    await storage.updateEmailDelivery(delivery.id, {
      status: EmailDeliveryStatus.SENT,
      attempts,
      lastAttemptAt: now,
      nextAttemptAt: null,
      sentAt: now,
      provider: result.provider ?? null,
      messageId: result.messageId ?? null,
      lastError: null,
    });
    return true;
  }

  // Unconfigured mail is not a transient failure — retrying it just burns rows until the
  // attempts run out and produces an "abandoned" that misrepresents what happened.
  const exhausted = result.notConfigured || attempts >= delivery.maxAttempts;
  const status = exhausted
    ? result.notConfigured
      ? EmailDeliveryStatus.SKIPPED
      : EmailDeliveryStatus.ABANDONED
    : EmailDeliveryStatus.FAILED;

  let nextAttemptAt: Date | null = null;
  if (!exhausted) {
    const { retryBackoffSeconds } = await getEmailSettings(delivery.templateSlug);
    nextAttemptAt = new Date(now.getTime() + backoffMs(attempts, retryBackoffSeconds));
  }

  await storage.updateEmailDelivery(delivery.id, {
    status,
    attempts,
    lastAttemptAt: now,
    nextAttemptAt,
    lastError: result.error ?? "Unknown send failure",
    provider: result.provider ?? null,
  });

  if (exhausted && !result.notConfigured) {
    logError("Email abandoned after exhausting retries", undefined, {
      deliveryId: delivery.id,
      templateSlug: delivery.templateSlug,
      to: delivery.recipient,
      attempts,
      lastError: result.error,
    });
  }

  return false;
}

export async function dispatchTemplatedEmail(params: DispatchParams): Promise<DispatchResult> {
  const settings = await getEmailSettings(params.slug);

  const rendered =
    (await getRenderedTemplate(params.slug, params.variables)) ??
    (params.fallback ? { subject: params.fallback.subject, html: params.fallback.html } : null);

  if (!rendered) {
    logError("No template available for email", undefined, { slug: params.slug, to: params.to });
    return { sent: false, deliveryId: null, skipped: false, error: `No template for ${params.slug}` };
  }

  if (!settings.enabled) {
    // Recorded rather than dropped: "why did this client not get the email" should be
    // answerable, and "an admin switched it off" is an answer.
    const skippedDelivery = await storage.createEmailDelivery({
      templateSlug: params.slug,
      recipient: params.to,
      subject: rendered.subject,
      status: EmailDeliveryStatus.SKIPPED,
      attempts: 0,
      maxAttempts: settings.maxAttempts,
      lastError: "Template is switched off in email settings",
      variables: JSON.stringify(params.variables),
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
    });
    return { sent: false, deliveryId: skippedDelivery.id, skipped: true };
  }

  const delivery = await storage.createEmailDelivery({
    templateSlug: params.slug,
    recipient: params.to,
    subject: rendered.subject,
    status: EmailDeliveryStatus.PENDING,
    attempts: 0,
    maxAttempts: settings.maxAttempts,
    variables: JSON.stringify(params.variables),
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
  });

  const sent = await attemptDelivery(delivery, rendered);
  return { sent, deliveryId: delivery.id, skipped: false };
}

/** Re-render and retry one delivery. Used by the worker and by the admin Resend button. */
export async function retryDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await storage.getEmailDelivery(deliveryId);
  if (!delivery) return false;

  const variables = (() => {
    try {
      return JSON.parse(delivery.variables || "{}") as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  })();

  const rendered = await getRenderedTemplate(delivery.templateSlug, variables);
  if (!rendered) {
    await storage.updateEmailDelivery(delivery.id, {
      status: EmailDeliveryStatus.ABANDONED,
      lastError: `No template for ${delivery.templateSlug}`,
      nextAttemptAt: null,
    });
    return false;
  }

  return attemptDelivery(delivery, rendered);
}

/**
 * A manual resend from the admin page starts a fresh attempt budget.
 *
 * An operator pressing Resend has usually just fixed whatever caused the failure — a template,
 * a mailbox, a provider token — so reusing the exhausted counter would refuse the one attempt
 * they actually want.
 */
export async function resendDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await storage.getEmailDelivery(deliveryId);
  if (!delivery) return false;

  const settings = await getEmailSettings(delivery.templateSlug);
  await storage.updateEmailDelivery(delivery.id, {
    status: EmailDeliveryStatus.PENDING,
    attempts: 0,
    maxAttempts: settings.maxAttempts,
    nextAttemptAt: null,
    lastError: null,
  });

  return retryDelivery(deliveryId);
}

const RETRY_SWEEP_INTERVAL_MS = 2 * 60 * 1000;
const RETRY_BATCH_SIZE = 25;
let retryInterval: NodeJS.Timeout | null = null;

export async function processEmailRetries(): Promise<number> {
  try {
    const due = await storage.getEmailDeliveriesDueForRetry(RETRY_BATCH_SIZE);
    if (due.length === 0) return 0;

    let sent = 0;
    for (const delivery of due) {
      // Claim the row first. Two workers sweeping at once would otherwise both send it, and a
      // client receiving the same invoice reminder twice is worse than one arriving late.
      const claimed = await storage.updateEmailDelivery(delivery.id, { nextAttemptAt: null });
      if (!claimed) continue;
      if (await retryDelivery(delivery.id)) sent += 1;
    }

    logInfo(`Email retry sweep processed ${due.length} deliveries, ${sent} sent`);
    return sent;
  } catch (error) {
    logError("Error processing email retries", error);
    return 0;
  }
}

export function startEmailRetryScheduler(): void {
  if (process.env.DISABLE_EMAIL_RETRY_SCHEDULER === "true") {
    logInfo("Email retry scheduler disabled by environment");
    return;
  }

  // Same single-worker rule as every other scheduler here: pm2 runs four of these processes,
  // and four sweeps would each claim and send the same backlog.
  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") {
    logInfo(`Skipping email retry scheduler on worker ${pm2Instance}`);
    return;
  }

  if (retryInterval) return;
  retryInterval = setInterval(processEmailRetries, RETRY_SWEEP_INTERVAL_MS);
  logInfo("Email retry scheduler started");
}

export function stopEmailRetryScheduler(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
}
