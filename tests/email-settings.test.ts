import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { emailDeliveries, emailTemplateSettings, EmailDeliveryStatus } from "../shared/schema";
import { eq } from "drizzle-orm";
import {
  EMAIL_TEMPLATE_DESCRIPTORS,
  getEmailTemplateDescriptor,
  hasNotificationTemplate,
  notificationTemplateSlug,
  resolveEmailSettings,
} from "../server/services/email-settings";
import { DEFAULT_TEMPLATES, seedEmailTemplates } from "../server/services/email-templates";
import * as transport from "../server/services/email-transport";
import { dispatchTemplatedEmail, processEmailRetries, resendDelivery } from "../server/services/email-delivery";

/**
 * Two things are being guarded here.
 *
 * The first is that an email which fails to send leaves a trace. Until this feature, `sendEmail`
 * returned false and the caller carried on: "did the client ever receive the quotation?" had no
 * answer, and a failure could not be re-driven. Every claim below about retries is really a claim
 * that the trace exists and is accurate.
 *
 * The second is that settings only ever *relax* into the old behaviour. A template with no
 * settings row must behave exactly as it did before, or this feature silently changes how the
 * whole system emails people.
 */

const SLUG = "application_received";

beforeAll(async () => {
  await seedEmailTemplates();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(emailTemplateSettings).where(eq(emailTemplateSettings.templateSlug, SLUG));
});

function mockTransport(results: transport.TransportResult[]) {
  const spy = vi.spyOn(transport, "deliverEmail");
  for (const result of results) spy.mockResolvedValueOnce(result);
  // Anything beyond the scripted results keeps failing, so a test that loops shows up as a
  // failure rather than an accidental success.
  spy.mockResolvedValue({ sent: false, error: "unscripted attempt" });
  return spy;
}

describe("email template descriptors", () => {
  it("describes every seeded template", () => {
    // A template with no descriptor reaches the settings page with no trigger text and no
    // configurable anything — it looks broken rather than absent.
    const missing = DEFAULT_TEMPLATES.filter((template) => !getEmailTemplateDescriptor(template.slug));
    expect(missing.map((t) => t.slug)).toEqual([]);
  });

  it("marks only the genuinely scheduled emails as scheduled", () => {
    // Everything else fires on an event. Offering those a cron field would be a control that
    // changes nothing, which is the whole reason the trigger is modelled.
    const scheduled = EMAIL_TEMPLATE_DESCRIPTORS.filter((d) => d.trigger === "scheduled").map((d) => d.slug);
    expect(scheduled.sort()).toEqual(["credit_invoice_reminder", "integration_health_digest"]);
  });

  it("gives each notification type its own template, with a fallback for the rest", () => {
    expect(hasNotificationTemplate("quotation_created")).toBe(true);
    expect(notificationTemplateSlug("quotation_created")).toBe("notification_quotation_created");
    expect(DEFAULT_TEMPLATES.some((t) => t.slug === "notification_quotation_created")).toBe(true);
    // An unmapped type must not lose its email; it falls back to the generic template.
    expect(hasNotificationTemplate("something_new")).toBe(false);
  });
});

describe("resolved settings", () => {
  it("falls back to the behaviour that was hardcoded before this existed", () => {
    const resolved = resolveEmailSettings("credit_invoice_reminder", undefined);
    expect(resolved.enabled).toBe(true);
    expect(resolved.maxAttempts).toBe(3);
    expect(resolved.scheduleEnabled).toBe(true);
    expect(resolved.intervalMinutes).toBe(60);
    // The ladder that used to live in credit-reminder.ts as constants.
    expect(resolved.config).toMatchObject({
      firstReminderDaysBefore: 7,
      secondReminderDaysBefore: 1,
      overdueEveryDays: 3,
      maxReminders: 6,
    });
  });

  it("keeps defaults for knobs a stored row does not mention", async () => {
    await storage.upsertEmailTemplateSettings("credit_invoice_reminder", {
      config: JSON.stringify({ maxReminders: 2 }),
    } as any);
    const row = await storage.getEmailTemplateSettings("credit_invoice_reminder");
    const resolved = resolveEmailSettings("credit_invoice_reminder", row);
    expect(resolved.config.maxReminders).toBe(2);
    expect(resolved.config.overdueEveryDays).toBe(3);
    await db.delete(emailTemplateSettings).where(eq(emailTemplateSettings.templateSlug, "credit_invoice_reminder"));
  });
});

describe("dispatching an email", () => {
  it("records a delivery and marks it sent", async () => {
    mockTransport([{ sent: true, provider: "postmark", messageId: "<abc@test>" }]);

    const result = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "records@test.com",
      variables: { client_name: "Records", application_id: "APP-1", year: "2026" },
    });

    expect(result.sent).toBe(true);
    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.SENT);
    expect(delivery?.attempts).toBe(1);
    expect(delivery?.messageId).toBe("<abc@test>");
    expect(delivery?.sentAt).toBeTruthy();
    expect(delivery?.nextAttemptAt).toBeNull();
  });

  it("schedules a retry after a failure instead of losing the email", async () => {
    mockTransport([{ sent: false, error: "smtp timeout" }]);

    const result = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "retry@test.com",
      variables: { client_name: "Retry", application_id: "APP-2", year: "2026" },
    });

    expect(result.sent).toBe(false);
    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.FAILED);
    expect(delivery?.attempts).toBe(1);
    expect(delivery?.lastError).toContain("smtp timeout");
    expect(delivery?.nextAttemptAt).toBeTruthy();
  });

  it("abandons the email once the configured attempts are used up", async () => {
    await storage.upsertEmailTemplateSettings(SLUG, { maxAttempts: 1 } as any);
    mockTransport([{ sent: false, error: "mailbox full" }]);

    const result = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "abandon@test.com",
      variables: { client_name: "Abandon", application_id: "APP-3", year: "2026" },
    });

    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.ABANDONED);
    // Nothing further is owed, so the worker must not pick it up again.
    expect(delivery?.nextAttemptAt).toBeNull();
  });

  it("does not retry an unconfigured mail server", async () => {
    // Retrying this only burns the attempt budget and then reports "abandoned", which reads as a
    // delivery problem when the truth is that nothing was ever configured to send it.
    mockTransport([{ sent: false, notConfigured: true, error: "Email service is not configured" }]);

    const result = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "unconfigured@test.com",
      variables: { client_name: "None", application_id: "APP-4", year: "2026" },
    });

    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.SKIPPED);
    expect(delivery?.nextAttemptAt).toBeNull();
  });

  it("treats a rejected recipient as a failure, not a send", async () => {
    // The SMTP call resolves, so this used to count as success and the delivery looked fine.
    mockTransport([{ sent: false, provider: "postmark", rejected: ["nope@test.com"], error: "Recipients rejected: nope@test.com" }]);

    const result = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "nope@test.com",
      variables: { client_name: "Rejected", application_id: "APP-5", year: "2026" },
    });

    expect(result.sent).toBe(false);
    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.FAILED);
  });

  it("records a suppressed email rather than dropping it silently", async () => {
    await storage.upsertEmailTemplateSettings(SLUG, { enabled: false } as any);
    const spy = mockTransport([{ sent: true }]);

    const result = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "off@test.com",
      variables: { client_name: "Off", application_id: "APP-6", year: "2026" },
    });

    expect(result.skipped).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.SKIPPED);
    expect(delivery?.lastError).toContain("switched off");
  });
});

describe("the retry worker", () => {
  it("sends a delivery that was previously failing", async () => {
    mockTransport([
      { sent: false, error: "temporary refusal" },
      { sent: true, provider: "postmark", messageId: "<second@test>" },
    ]);

    const first = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "worker@test.com",
      variables: { client_name: "Worker", application_id: "APP-7", year: "2026" },
    });
    expect(first.sent).toBe(false);

    // The worker only picks up deliveries whose next attempt is due; bring it forward rather
    // than waiting out the real backoff.
    await storage.updateEmailDelivery(first.deliveryId!, { nextAttemptAt: new Date(Date.now() - 1000) });

    await processEmailRetries();

    const delivery = await storage.getEmailDelivery(first.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.SENT);
    expect(delivery?.attempts).toBe(2);
  });

  it("leaves a delivery alone until its backoff has elapsed", async () => {
    mockTransport([{ sent: false, error: "not yet" }]);

    const first = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "waiting@test.com",
      variables: { client_name: "Waiting", application_id: "APP-8", year: "2026" },
    });

    const due = await storage.getEmailDeliveriesDueForRetry(50);
    expect(due.map((d) => d.id)).not.toContain(first.deliveryId);
  });

  it("gives a manual resend a fresh attempt budget", async () => {
    await storage.upsertEmailTemplateSettings(SLUG, { maxAttempts: 1 } as any);
    mockTransport([
      { sent: false, error: "bad template" },
      { sent: true, provider: "postmark", messageId: "<fixed@test>" },
    ]);

    const first = await dispatchTemplatedEmail({
      slug: SLUG,
      to: "resend@test.com",
      variables: { client_name: "Resend", application_id: "APP-9", year: "2026" },
    });
    const abandoned = await storage.getEmailDelivery(first.deliveryId!);
    expect(abandoned?.status).toBe(EmailDeliveryStatus.ABANDONED);

    // An operator pressing Resend has usually just fixed the cause, so the exhausted counter
    // must not refuse the one attempt they are asking for.
    const sent = await resendDelivery(first.deliveryId!);
    expect(sent).toBe(true);
    const after = await storage.getEmailDelivery(first.deliveryId!);
    expect(after?.status).toBe(EmailDeliveryStatus.SENT);
  });
});

afterEach(async () => {
  await db.delete(emailDeliveries).where(eq(emailDeliveries.templateSlug, SLUG));
});

describe("the scheduled digest", () => {
  // The digest bails out early when it has no recipient configured, which would make both tests
  // below pass for the wrong reason. Give it one.
  const previousRecipient = process.env.INTEGRATION_DIGEST_EMAIL;
  beforeAll(() => {
    process.env.INTEGRATION_DIGEST_EMAIL = "digest@test.com";
  });
  afterAll(() => {
    if (previousRecipient === undefined) delete process.env.INTEGRATION_DIGEST_EMAIL;
    else process.env.INTEGRATION_DIGEST_EMAIL = previousRecipient;
  });

  it("only sends inside its pinned hour, once a day", async () => {
    // The hour is the whole point of the setting: a daily digest with no pinned hour arrives at
    // whatever time the process last restarted, which is how it starts landing at 3am after a
    // deploy. Pinning it means most runs must do nothing.
    const { sendIntegrationHealthDigest } = await import("../server/services/integration-health-digest");
    const wrongHour = (new Date().getUTCHours() + 5) % 24;
    await storage.upsertEmailTemplateSettings("integration_health_digest", {
      sendHourUtc: wrongHour,
      scheduleEnabled: true,
      enabled: true,
    } as any);

    const spy = mockTransport([{ sent: true }]);
    const sent = await sendIntegrationHealthDigest();

    expect(sent).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    await db
      .delete(emailTemplateSettings)
      .where(eq(emailTemplateSettings.templateSlug, "integration_health_digest"));
  });

  it("does not send at all while switched off", async () => {
    const { sendIntegrationHealthDigest } = await import("../server/services/integration-health-digest");
    await storage.upsertEmailTemplateSettings("integration_health_digest", { enabled: false } as any);

    const spy = mockTransport([{ sent: true }]);
    expect(await sendIntegrationHealthDigest()).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    await db
      .delete(emailTemplateSettings)
      .where(eq(emailTemplateSettings.templateSlug, "integration_health_digest"));
  });
});

describe("time-critical emails", () => {
  it("does not retry a login code", async () => {
    // A retry lands after the code has expired, so it delivers a code that no longer works — and
    // a second copy of a one-time code arriving later is worse than none at all.
    expect(resolveEmailSettings("login_otp", undefined).maxAttempts).toBe(1);

    mockTransport([{ sent: false, error: "smtp timeout" }]);
    const result = await dispatchTemplatedEmail({
      slug: "login_otp",
      to: "otp@test.com",
      variables: { code: "123456", expiry_text: "10 minutes", year: "2026" },
    });

    const delivery = await storage.getEmailDelivery(result.deliveryId!);
    expect(delivery?.status).toBe(EmailDeliveryStatus.ABANDONED);
    expect(delivery?.nextAttemptAt).toBeNull();

    await db.delete(emailDeliveries).where(eq(emailDeliveries.templateSlug, "login_otp"));
  });
});

describe("clearing a pinned hour", () => {
  it("keeps null as null, and keeps midnight settable", async () => {
    // The settings route parses this with a union, and unions resolve in order. With the number
    // branch first, `z.coerce.number()` turned an explicit null into 0 — so an admin unpinning the
    // digest silently pinned it to midnight instead, and it then sent once a day at 00:00 UTC.
    await storage.upsertEmailTemplateSettings("integration_health_digest", { sendHourUtc: 9 } as any);
    expect((await storage.getEmailTemplateSettings("integration_health_digest"))?.sendHourUtc).toBe(9);

    await storage.upsertEmailTemplateSettings("integration_health_digest", { sendHourUtc: null } as any);
    const cleared = await storage.getEmailTemplateSettings("integration_health_digest");
    expect(cleared?.sendHourUtc).toBeNull();
    expect(resolveEmailSettings("integration_health_digest", cleared).sendHourUtc).toBeNull();

    await storage.upsertEmailTemplateSettings("integration_health_digest", { sendHourUtc: 0 } as any);
    expect((await storage.getEmailTemplateSettings("integration_health_digest"))?.sendHourUtc).toBe(0);

    await db
      .delete(emailTemplateSettings)
      .where(eq(emailTemplateSettings.templateSlug, "integration_health_digest"));
  });

  it("leaves the digest unpinned out of the box", () => {
    // Choosing an hour by default would change when every existing installation sends.
    expect(resolveEmailSettings("integration_health_digest", undefined).sendHourUtc).toBeNull();
    expect(resolveEmailSettings("integration_health_digest", undefined).intervalMinutes).toBe(1440);
  });
});
