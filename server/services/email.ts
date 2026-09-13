import { logInfo } from "./logger";
import { deliverEmail, type TransportOptions } from "./email-transport";
import { dispatchTemplatedEmail } from "./email-delivery";

/**
 * Send one email with no template, no delivery record and no retry.
 *
 * Kept for the few callers that build their own HTML. Anything with a template goes through
 * `dispatchTemplatedEmail` instead, so the attempt is recorded and can be retried — a `false`
 * from here is only ever a log line.
 */
export async function sendEmail(options: TransportOptions): Promise<boolean> {
  const result = await deliverEmail(options);
  return result.sent;
}

export async function sendAccountCredentials(
  email: string,
  name: string,
  username: string,
  temporaryPassword: string
): Promise<boolean> {
  const loginUrl = process.env.APP_URL || "https://ezhalha.com";
  
  const result = await dispatchTemplatedEmail({
    slug: "account_credentials",
    to: email,
    variables: {
      client_name: name,
      username,
      temporary_password: temporaryPassword,
      login_url: loginUrl,
      year: new Date().getFullYear().toString(),
    },
  });

  return result.sent;
}

export async function sendApplicationReceived(
  email: string,
  name: string,
  applicationId: string
): Promise<boolean> {
  const result = await dispatchTemplatedEmail({
    slug: "application_received",
    to: email,
    variables: {
      client_name: name,
      application_id: applicationId,
      year: new Date().getFullYear().toString(),
    },
    entityType: "client_application",
    entityId: applicationId,
  });

  return result.sent;
}

export async function notifyAdminNewApplication(
  applicationId: string,
  applicantName: string,
  applicantEmail: string,
  companyName?: string
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    logInfo("Admin email not configured, skipping notification");
    return false;
  }

  const appUrl = process.env.APP_URL || "https://ezhalha.com";
  
  const result = await dispatchTemplatedEmail({
    slug: "admin_new_application",
    to: adminEmail,
    variables: {
      application_id: applicationId,
      applicant_name: applicantName,
      applicant_email: applicantEmail,
      company_name: companyName ? `<p><strong>Company:</strong> ${companyName}</p>` : "",
      app_url: appUrl,
      year: new Date().getFullYear().toString(),
    },
    entityType: "client_application",
    entityId: applicationId,
  });

  return result.sent;
}

export async function sendCreditInvoiceCreated(
  email: string,
  clientName: string,
  trackingNumber: string,
  amount: string,
  currency: string,
  dueDate: string,
  adminEmails?: string
): Promise<boolean> {
  const appUrl = process.env.APP_URL || "https://app.ezhalha.co";

  const variables = {
    client_name: clientName,
    tracking_number: trackingNumber,
    amount,
    currency,
    due_date: dueDate,
    app_url: appUrl,
    year: new Date().getFullYear().toString(),
  };

  const result = await dispatchTemplatedEmail({
    slug: "credit_invoice_created",
    to: email,
    variables,
    entityType: "shipment",
    entityId: trackingNumber,
  });

  if (adminEmails) {
    const adminList = adminEmails.split(",").map((e) => e.trim()).filter(Boolean);
    for (const adminEmail of adminList) {
      await dispatchTemplatedEmail({
        slug: "credit_invoice_created",
        to: adminEmail,
        variables: { ...variables, client_name: "Admin" },
        entityType: "shipment",
        entityId: trackingNumber,
      });
    }
  }

  return result.sent;
}

export async function sendCreditInvoiceReminder(
  email: string,
  clientName: string,
  trackingNumber: string,
  amount: string,
  currency: string,
  dueDate: string,
  daysInfo: string,
  isOverdue: boolean,
  adminEmails?: string
): Promise<boolean> {
  const appUrl = process.env.APP_URL || "https://app.ezhalha.co";
  const urgencyColor = isOverdue ? "#dc2626" : "#f59e0b";
  const urgencyLabel = isOverdue ? "OVERDUE" : "REMINDER";

  const variables = {
    client_name: clientName,
    tracking_number: trackingNumber,
    amount,
    currency,
    due_date: dueDate,
    days_info: daysInfo,
    urgency_label: urgencyLabel,
    urgency_color: urgencyColor,
    app_url: appUrl,
    year: new Date().getFullYear().toString(),
  };

  const result = await dispatchTemplatedEmail({
    slug: "credit_invoice_reminder",
    to: email,
    variables,
    entityType: "shipment",
    entityId: trackingNumber,
  });

  if (adminEmails) {
    const adminList = adminEmails.split(",").map((e) => e.trim()).filter(Boolean);
    for (const adminEmail of adminList) {
      await dispatchTemplatedEmail({
        slug: "credit_invoice_reminder",
        to: adminEmail,
        variables: { ...variables, client_name: "Admin" },
        entityType: "shipment",
        entityId: trackingNumber,
      });
    }
  }

  return result.sent;
}

export async function sendApplicationRejected(
  email: string,
  name: string,
  reason?: string
): Promise<boolean> {
  const result = await dispatchTemplatedEmail({
    slug: "application_rejected",
    to: email,
    variables: {
      client_name: name,
      rejection_reason: reason ? `<p><strong>Reason:</strong> ${reason}</p>` : "",
      year: new Date().getFullYear().toString(),
    },
  });

  return result.sent;
}

export async function sendShipmentExtraFeesNotification(params: {
  email: string;
  clientName: string;
  trackingNumber: string;
  amountSar: string;
  extraFeeType: "EXTRA_WEIGHT" | "EXTRA_COST";
  extraWeightValue?: string | null;
  weightUnit?: string | null;
  extraCostAmountSar?: string | null;
  invoiceNumber?: string | null;
}): Promise<boolean> {
  const appUrl = process.env.APP_URL || "https://app.ezhalha.co";
  const feeLabel =
    params.extraFeeType === "EXTRA_WEIGHT"
      ? params.weightUnit === "CBM" ? "Extra Volume" : "Extra Weight"
      : "Extra Cost";
  const detailLine =
    params.extraFeeType === "EXTRA_WEIGHT"
      ? `Additional ${params.weightUnit === "CBM" ? "billable volume" : "weight"} recorded: ${params.extraWeightValue || "0"} ${params.weightUnit || "KG"}`
      : `Additional cost recorded: SAR ${params.extraCostAmountSar || params.amountSar}`;
  const invoiceLine = params.invoiceNumber
    ? `<p><strong>Invoice:</strong> ${params.invoiceNumber}</p>`
    : "";

  const result = await dispatchTemplatedEmail({
    slug: "shipment_extra_fees",
    to: params.email,
    variables: {
      client_name: params.clientName,
      tracking_number: params.trackingNumber,
      fee_label: feeLabel,
      amount_sar: params.amountSar,
      detail_line: detailLine,
      invoice_line: invoiceLine,
      app_url: appUrl,
      year: new Date().getFullYear().toString(),
    },
    entityType: "shipment",
    entityId: params.trackingNumber,
  });

  return result.sent;
}
