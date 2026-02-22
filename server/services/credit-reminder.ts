import { storage } from "../storage";
import { logInfo, logError } from "./logger";
import { sendCreditInvoiceReminder } from "./email";

const MAX_REMINDERS = 6;

function computeNextReminderAt(dueAt: Date, remindersSent: number): Date | null {
  const now = new Date();
  const dueTime = dueAt.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (remindersSent >= MAX_REMINDERS) {
    return null;
  }

  if (remindersSent === 0) {
    const sevenBefore = new Date(dueTime - 7 * dayMs);
    if (sevenBefore > now) return sevenBefore;
  }
  if (remindersSent <= 1) {
    const oneBefore = new Date(dueTime - 1 * dayMs);
    if (oneBefore > now) return oneBefore;
  }
  if (remindersSent <= 2) {
    const onDue = new Date(dueTime);
    if (onDue > now) return onDue;
  }

  const overdueReminder = remindersSent - 2;
  const nextOverdue = new Date(dueTime + (overdueReminder * 3 + 3) * dayMs);
  return nextOverdue;
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

    const dueForReminder = await storage.getDueForReminderCreditInvoices();
    logInfo(`Found ${dueForReminder.length} credit invoices due for reminder`);

    for (const invoice of dueForReminder) {
      if (invoice.remindersSent >= MAX_REMINDERS) {
        await storage.updateCreditInvoice(invoice.id, { nextReminderAt: null });
        continue;
      }

      try {
        const account = await storage.getClientAccount(invoice.clientAccountId);
        if (!account) continue;

        const shipment = await storage.getShipment(invoice.shipmentId);
        if (!shipment) continue;

        const { daysInfo, isOverdue } = getDaysInfo(invoice.dueAt);
        const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAIL;

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
        const nextReminderAt = computeNextReminderAt(invoice.dueAt, newRemindersSent);

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

export function startCreditReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
  }

  logInfo("Starting credit reminder scheduler (hourly)");
  reminderInterval = setInterval(processCreditReminders, 60 * 60 * 1000);

  setTimeout(processCreditReminders, 30 * 1000);
}

export function stopCreditReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logInfo("Credit reminder scheduler stopped");
  }
}
