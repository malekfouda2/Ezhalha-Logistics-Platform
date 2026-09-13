import { storage } from "../storage";
import { logInfo, logError } from "./logger";
import { sendCreditInvoiceReminder } from "./email";
import { configBoolean, configNumber, getEmailSettings, type ResolvedEmailSettings } from "./email-settings";

/**
 * The chase ladder, which an admin now owns from the email settings page.
 *
 * These defaults are the values that used to be hardcoded here, so an installation that never
 * touches the settings behaves exactly as before: two reminders before the due date, then one
 * every three days once it is overdue, six in total.
 */
const DEFAULT_SWEEP_MINUTES = 60;

const DEFAULT_LADDER = {
  firstReminderDaysBefore: 7,
  secondReminderDaysBefore: 1,
  overdueEveryDays: 3,
  maxReminders: 6,
};

interface ReminderLadder {
  firstReminderDaysBefore: number;
  secondReminderDaysBefore: number;
  overdueEveryDays: number;
  maxReminders: number;
}

function ladderFrom(settings: ResolvedEmailSettings): ReminderLadder {
  return {
    firstReminderDaysBefore: configNumber(settings, "firstReminderDaysBefore", DEFAULT_LADDER.firstReminderDaysBefore),
    secondReminderDaysBefore: configNumber(settings, "secondReminderDaysBefore", DEFAULT_LADDER.secondReminderDaysBefore),
    // A zero here would schedule every overdue reminder at the same instant and chase the
    // client in a loop, so the floor is one day no matter what is stored.
    overdueEveryDays: Math.max(1, configNumber(settings, "overdueEveryDays", DEFAULT_LADDER.overdueEveryDays)),
    maxReminders: Math.max(1, configNumber(settings, "maxReminders", DEFAULT_LADDER.maxReminders)),
  };
}

function computeNextReminderAt(dueAt: Date, remindersSent: number, ladder: ReminderLadder = DEFAULT_LADDER): Date | null {
  const now = new Date();
  const dueTime = dueAt.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (remindersSent >= ladder.maxReminders) {
    return null;
  }

  if (remindersSent === 0) {
    const firstBefore = new Date(dueTime - ladder.firstReminderDaysBefore * dayMs);
    if (firstBefore > now) return firstBefore;
  }
  if (remindersSent <= 1) {
    const secondBefore = new Date(dueTime - ladder.secondReminderDaysBefore * dayMs);
    if (secondBefore > now) return secondBefore;
  }
  if (remindersSent <= 2) {
    const onDue = new Date(dueTime);
    if (onDue > now) return onDue;
  }

  const overdueReminder = remindersSent - 2;
  return new Date(dueTime + (overdueReminder * ladder.overdueEveryDays + ladder.overdueEveryDays) * dayMs);
}

function getDaysInfo(dueAt: Date): { daysInfo: string; isOverdue: boolean } {
  const now = new Date();
  const diffMs = dueAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays > 0) {
    return { daysInfo: `Payment due in ${diffDays} day${diffDays !== 1 ? "s" : ""}`, isOverdue: false };
  } else if (diffDays === 0) {
    return { daysInfo: "Payment is due TODAY", isOverdue: false };
  } else {
    const overdueDays = Math.abs(diffDays);
    return { daysInfo: `Payment is ${overdueDays} day${overdueDays !== 1 ? "s" : ""} OVERDUE`, isOverdue: true };
  }
}

export async function processCreditReminders(): Promise<void> {
  try {
    logInfo("Starting credit invoice reminder processing...");

    const overdueInvoices = await storage.getOverdueCreditInvoices();
    for (const invoice of overdueInvoices) {
      await storage.updateCreditInvoice(invoice.id, { status: "OVERDUE" });
      logInfo(`Marked credit invoice ${invoice.id} as OVERDUE`);
    }

    const settings = await getEmailSettings("credit_invoice_reminder");
    if (!settings.enabled || !settings.scheduleEnabled) {
      logInfo("Credit invoice reminders are switched off in email settings");
      return;
    }
    const ladder = ladderFrom(settings);

    const dueForReminder = await storage.getDueForReminderCreditInvoices();
    logInfo(`Found ${dueForReminder.length} credit invoices due for reminder`);

    for (const invoice of dueForReminder) {
      if (invoice.remindersSent >= ladder.maxReminders) {
        await storage.updateCreditInvoice(invoice.id, { nextReminderAt: null });
        continue;
      }

      try {
        const account = await storage.getClientAccount(invoice.clientAccountId);
        if (!account) continue;

        const shipment = await storage.getShipment(invoice.shipmentId);
        if (!shipment) continue;

        const { daysInfo, isOverdue } = getDaysInfo(invoice.dueAt);
        const adminEmails = configBoolean(settings, "copyAdmin", true)
          ? process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAIL
          : undefined;

        await sendCreditInvoiceReminder(
          account.email,
          account.name,
          shipment.trackingNumber,
          Number(invoice.amount).toFixed(2),
          invoice.currency,
          invoice.dueAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          daysInfo,
          isOverdue,
          adminEmails
        );

        const newRemindersSent = invoice.remindersSent + 1;
        const nextReminderAt = computeNextReminderAt(invoice.dueAt, newRemindersSent, ladder);

        await storage.updateCreditInvoice(invoice.id, {
          remindersSent: newRemindersSent,
          lastReminderAt: new Date(),
          nextReminderAt,
        });

        await storage.createCreditNotificationEvent({
          clientAccountId: invoice.clientAccountId,
          creditInvoiceId: invoice.id,
          type: isOverdue ? "OVERDUE_REMINDER" : "REMINDER_EMAIL",
          sentAt: new Date(),
          meta: JSON.stringify({ reminderNumber: newRemindersSent, daysInfo }),
        });

        logInfo(`Sent reminder #${newRemindersSent} for credit invoice ${invoice.id}`);
      } catch (err) {
        logError(`Failed to process reminder for credit invoice ${invoice.id}`, err);
      }
    }

    logInfo("Credit invoice reminder processing completed");
  } catch (error) {
    logError("Error in credit reminder processing", error);
  }
}

let reminderInterval: NodeJS.Timeout | null = null;

function shouldRunCreditReminderScheduler(): boolean {
  if (process.env.DISABLE_CREDIT_REMINDER_SCHEDULER === "true") {
    return false;
  }

  const pm2Instance = process.env.NODE_APP_INSTANCE;
  if (typeof pm2Instance === "string" && pm2Instance !== "0") {
    return false;
  }

  return true;
}

export function startCreditReminderScheduler(): void {
  if (!shouldRunCreditReminderScheduler()) {
    logInfo(
      `Skipping credit reminder scheduler on worker ${process.env.NODE_APP_INSTANCE ?? "standalone"}`,
    );
    return;
  }

  if (reminderInterval) {
    clearInterval(reminderInterval);
  }

  // Arm on the historical hourly cadence first, then re-arm once the configured interval has
  // been read. Settings live in the database, and the scheduler must not depend on that read
  // succeeding to run at all.
  reminderInterval = setInterval(processCreditReminders, DEFAULT_SWEEP_MINUTES * 60 * 1000);
  logInfo("Starting credit reminder scheduler");

  void getEmailSettings("credit_invoice_reminder")
    .then((settings) => {
      const minutes = Math.max(1, settings.intervalMinutes ?? DEFAULT_SWEEP_MINUTES);
      if (minutes === DEFAULT_SWEEP_MINUTES) return;
      if (reminderInterval) clearInterval(reminderInterval);
      reminderInterval = setInterval(processCreditReminders, minutes * 60 * 1000);
      logInfo(`Credit reminder sweep set to every ${minutes} minute(s)`);
    })
    .catch((error) => logError("Failed to read credit reminder schedule; staying on the default", error));

  setTimeout(processCreditReminders, 30 * 1000);
}

/** Re-read the schedule after an admin changes it, without a deploy. */
export function restartCreditReminderScheduler(): void {
  stopCreditReminderScheduler();
  startCreditReminderScheduler();
}

export function stopCreditReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logInfo("Credit reminder scheduler stopped");
  }
}
