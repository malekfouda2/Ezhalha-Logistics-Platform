import { storage } from "../storage";
import type { EmailTemplateSettings } from "@shared/schema";

/**
 * The operational half of an email template.
 *
 * `email_templates` owns the wording. This owns everything else: whether the email is sent,
 * how hard delivery is retried, and — for the two emails a scheduler produces rather than an
 * event — when it runs and on what ladder.
 *
 * The distinction matters in the UI. Most of these emails fire because something happened: an
 * application was approved, a fee was added, a quotation was issued. Offering a cron field for
 * those would be a control that does nothing, so each template declares its trigger and the
 * page renders only the settings that can actually change its behaviour.
 */

export type EmailTriggerKind = "event" | "scheduled";

export type EmailAudience = "client" | "admin" | "operations" | "staff";

export interface EmailConfigField {
  key: string;
  label: string;
  help: string;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  unit?: string;
}

export interface EmailTemplateDescriptor {
  slug: string;
  trigger: EmailTriggerKind;
  /** What causes this email. Shown to the admin verbatim; keep it in the reader's language. */
  triggerDescription: string;
  audience: EmailAudience;
  /** Overrides the shared attempt default for emails where a retry is worthless or harmful. */
  defaultMaxAttempts?: number;
  /** Scheduled templates only: the sweep interval and, where it matters, the hour it sends. */
  defaultIntervalMinutes?: number;
  defaultSendHourUtc?: number;
  configFields?: EmailConfigField[];
  defaultConfig?: Record<string, number | boolean>;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BACKOFF_SECONDS = 300;

const event = (
  slug: string,
  audience: EmailAudience,
  triggerDescription: string,
): EmailTemplateDescriptor => ({ slug, trigger: "event", audience, triggerDescription });

export const EMAIL_TEMPLATE_DESCRIPTORS: EmailTemplateDescriptor[] = [
  // ---- Account and access -------------------------------------------------------------
  event("account_credentials", "client", "A client account is approved and its first user is created."),
  event("password_setup", "client", "A new user is invited and needs to choose a password."),
  event("password_reset", "client", "Someone asks to reset their password."),
  {
    // One attempt, deliberately. A login code expires in minutes, so a retry five minutes later
    // delivers a code that no longer works — and a second copy of a one-time code arriving later
    // is worse than none.
    ...event("login_otp", "client", "Someone signs in with an emailed code instead of a password."),
    defaultMaxAttempts: 1,
  },
  event("staff_invitation", "staff", "An internal user is invited to the admin or operations portal."),

  // ---- Applications -------------------------------------------------------------------
  event("application_received", "client", "A company submits an application to open an account."),
  event("application_rejected", "client", "An application is rejected."),
  event("admin_new_application", "admin", "A company submits an application; the team is told to review it."),

  // ---- Money --------------------------------------------------------------------------
  event("credit_invoice_created", "client", "A shipment is settled on credit and its invoice is issued."),
  {
    slug: "credit_invoice_reminder",
    trigger: "scheduled",
    audience: "client",
    triggerDescription:
      "A scheduled sweep chases unpaid credit invoices, before and after the due date.",
    defaultIntervalMinutes: 60,
    configFields: [
      {
        key: "firstReminderDaysBefore",
        label: "First reminder",
        help: "Days before the due date the first reminder is sent.",
        type: "number",
        min: 0,
        max: 60,
        unit: "days before due",
      },
      {
        key: "secondReminderDaysBefore",
        label: "Second reminder",
        help: "Days before the due date the second reminder is sent. Must be closer to the due date than the first.",
        type: "number",
        min: 0,
        max: 60,
        unit: "days before due",
      },
      {
        key: "overdueEveryDays",
        label: "Overdue cadence",
        help: "How often the client is chased once the invoice is past due.",
        type: "number",
        min: 1,
        max: 60,
        unit: "days",
      },
      {
        key: "maxReminders",
        label: "Maximum reminders",
        help: "Total reminders per invoice, after which the system stops and leaves it to a person.",
        type: "number",
        min: 1,
        max: 20,
        unit: "emails",
      },
      {
        key: "copyAdmin",
        label: "Copy the team",
        help: "Also send each reminder to the admin notification address.",
        type: "boolean",
      },
    ],
    defaultConfig: {
      firstReminderDaysBefore: 7,
      secondReminderDaysBefore: 1,
      overdueEveryDays: 3,
      maxReminders: 6,
      copyAdmin: true,
    },
  },
  event("shipment_extra_fees", "client", "Operations records an extra weight or extra cost on a shipment."),

  // ---- Recovery -----------------------------------------------------------------------
  event("abandoned_discount_offer", "client", "An admin sends a discount offer on an abandoned shipment."),
  event("abandoned_payment_reminder", "client", "An admin nudges a client about an unpaid shipment."),

  // ---- Operations ---------------------------------------------------------------------
  event("operations_shipment_update", "client", "Operations posts an update the client should see."),
  event("operation_notification", "operations", "Any notification with no template of its own falls back to this."),

  // ---- Health -------------------------------------------------------------------------
  {
    slug: "integration_health_digest",
    trigger: "scheduled",
    audience: "admin",
    triggerDescription: "A scheduled digest of carrier and integration failures, sent to the team.",
    defaultIntervalMinutes: 24 * 60,
    // Deliberately unpinned by default. Pinning it is the better way to run a daily digest, but
    // choosing an hour here would change when every existing installation sends without anyone
    // asking for it — so it stays on the historical "every interval from startup" until an admin
    // pins it.
    defaultSendHourUtc: undefined,
    configFields: [
      {
        key: "lookbackHours",
        label: "Look back",
        help: "How far back the digest reports failures.",
        type: "number",
        min: 1,
        max: 168,
        unit: "hours",
      },
      {
        key: "skipWhenEmpty",
        label: "Skip when there is nothing to report",
        help: "Send nothing on a clean day, rather than an empty digest.",
        type: "boolean",
      },
    ],
    defaultConfig: { lookbackHours: 24, skipWhenEmpty: true },
  },
];

/**
 * In-app notifications used to funnel through one generic template, so every event — a
 * quotation being ready, a colleague mentioning you — arrived looking identical. Each type now
 * has its own template, and anything unmapped still falls back to `operation_notification`.
 */
export const NOTIFICATION_TEMPLATE_TYPES: Array<{ type: string; label: string; audience: EmailAudience; trigger: string }> = [
  { type: "quotation_created", label: "Quotation Ready", audience: "client", trigger: "A quotation is issued and the client is asked to review and pay it." },
  { type: "invoice_created", label: "Invoice Created", audience: "client", trigger: "An invoice is raised against a shipment." },
  { type: "shipment_milestone", label: "Shipment Milestone", audience: "client", trigger: "A shipment reaches a milestone worth telling the client about." },
  { type: "shipment_status", label: "Shipment Status Change", audience: "client", trigger: "A shipment's status changes." },
  { type: "operations_charge_added", label: "Charge Added", audience: "client", trigger: "A charge is added to a shipment after booking." },
  { type: "operations_client_message", label: "Message From Operations", audience: "client", trigger: "Operations sends the client a message about a shipment." },
  { type: "operations_assignment", label: "Assignment", audience: "operations", trigger: "A shipment is assigned to an operator." },
  { type: "operations_attention", label: "Needs Attention", audience: "operations", trigger: "A shipment is flagged as needing attention." },
  { type: "special_handling", label: "Special Handling", audience: "operations", trigger: "A shipment is recorded as needing special handling." },
  { type: "mention", label: "Mention", audience: "operations", trigger: "Someone is mentioned in a note." },
  { type: "express", label: "Express Shipment", audience: "client", trigger: "An express shipment event the client is told about." },
  { type: "ddp", label: "Door To Door Freight", audience: "client", trigger: "A Door To Door Freight event the client is told about." },
];

export function notificationTemplateSlug(type: string): string {
  return `notification_${type}`;
}

const NOTIFICATION_TYPE_SET = new Set(NOTIFICATION_TEMPLATE_TYPES.map((n) => n.type));

/** True when this notification type has a template of its own rather than the generic one. */
export function hasNotificationTemplate(type: string | null | undefined): boolean {
  return Boolean(type && NOTIFICATION_TYPE_SET.has(type));
}

for (const notification of NOTIFICATION_TEMPLATE_TYPES) {
  EMAIL_TEMPLATE_DESCRIPTORS.push(
    event(notificationTemplateSlug(notification.type), notification.audience, notification.trigger),
  );
}

const DESCRIPTORS_BY_SLUG = new Map(EMAIL_TEMPLATE_DESCRIPTORS.map((d) => [d.slug, d]));

export function getEmailTemplateDescriptor(slug: string): EmailTemplateDescriptor | undefined {
  return DESCRIPTORS_BY_SLUG.get(slug);
}

export interface ResolvedEmailSettings {
  slug: string;
  enabled: boolean;
  maxAttempts: number;
  retryBackoffSeconds: number;
  scheduleEnabled: boolean;
  intervalMinutes: number | null;
  sendHourUtc: number | null;
  config: Record<string, number | boolean>;
  updatedByUserId: string | null;
  updatedAt: Date | null;
}

function parseConfig(raw: string | null | undefined): Record<string, number | boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merge a stored row over the descriptor's defaults.
 *
 * A template with no row must behave exactly as it did before this feature existed, so the
 * defaults here are the values that were hardcoded in the schedulers and in `sendEmail`.
 */
export function resolveEmailSettings(
  slug: string,
  row: EmailTemplateSettings | undefined,
): ResolvedEmailSettings {
  const descriptor = getEmailTemplateDescriptor(slug);
  const defaultConfig = descriptor?.defaultConfig ?? {};

  return {
    slug,
    enabled: row?.enabled ?? true,
    maxAttempts: row?.maxAttempts ?? descriptor?.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    retryBackoffSeconds: row?.retryBackoffSeconds ?? DEFAULT_RETRY_BACKOFF_SECONDS,
    scheduleEnabled: row?.scheduleEnabled ?? descriptor?.trigger === "scheduled",
    intervalMinutes: row?.intervalMinutes ?? descriptor?.defaultIntervalMinutes ?? null,
    sendHourUtc: row?.sendHourUtc ?? descriptor?.defaultSendHourUtc ?? null,
    config: { ...defaultConfig, ...parseConfig(row?.config) },
    updatedByUserId: row?.updatedByUserId ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getEmailSettings(slug: string): Promise<ResolvedEmailSettings> {
  const row = await storage.getEmailTemplateSettings(slug).catch(() => undefined);
  return resolveEmailSettings(slug, row);
}

export async function getAllEmailSettings(): Promise<Map<string, ResolvedEmailSettings>> {
  const rows = await storage.getAllEmailTemplateSettings().catch(() => [] as EmailTemplateSettings[]);
  const bySlug = new Map(rows.map((row) => [row.templateSlug, row]));
  const resolved = new Map<string, ResolvedEmailSettings>();
  for (const descriptor of EMAIL_TEMPLATE_DESCRIPTORS) {
    resolved.set(descriptor.slug, resolveEmailSettings(descriptor.slug, bySlug.get(descriptor.slug)));
  }
  // Templates that exist in the database but have no descriptor still deserve settings; an
  // admin should never find a template they cannot switch off.
  for (const [slug, row] of bySlug) {
    if (!resolved.has(slug)) resolved.set(slug, resolveEmailSettings(slug, row));
  }
  return resolved;
}

/** Read one numeric knob, falling back to the descriptor default when a stored value is junk. */
export function configNumber(
  settings: ResolvedEmailSettings,
  key: string,
  fallback: number,
): number {
  const value = settings.config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function configBoolean(
  settings: ResolvedEmailSettings,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings.config[key];
  return typeof value === "boolean" ? value : fallback;
}
