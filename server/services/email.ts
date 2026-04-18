import nodemailer from "nodemailer";
import { logInfo, logError } from "./logger";
import { getRenderedTemplate } from "./email-templates";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

function getTransporter() {
  const config: EmailConfig = {
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  };

  if (!config.auth.user || !config.auth.pass) {
    logInfo("Email service not configured - SMTP credentials missing");
    return null;
  }

  return nodemailer.createTransport(config);
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const transporter = getTransporter();
  
  if (!transporter) {
    logInfo("Email not sent - service not configured", { to: options.to, subject: options.subject });
    return false;
  }

  try {
    const fromAddress = process.env.SMTP_FROM || "noreply@ezhalha.com";
    
    await transporter.sendMail({
      from: `"ezhalha" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
    });

    logInfo("Email sent successfully", { to: options.to, subject: options.subject });
    return true;
  } catch (error) {
    logError("Failed to send email", error, { to: options.to, subject: options.subject });
    return false;
  }
}

export async function sendAccountCredentials(
  email: string,
  name: string,
  username: string,
  temporaryPassword: string
): Promise<boolean> {
  const loginUrl = process.env.APP_URL || "https://ezhalha.com";
  
  const rendered = await getRenderedTemplate("account_credentials", {
    client_name: name,
    username,
    temporary_password: temporaryPassword,
    login_url: loginUrl,
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render account_credentials template");
    return false;
  }

  return sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
  });
}

export async function sendApplicationReceived(
  email: string,
  name: string,
  applicationId: string
): Promise<boolean> {
  const rendered = await getRenderedTemplate("application_received", {
    client_name: name,
    application_id: applicationId,
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render application_received template");
    return false;
  }

  return sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
  });
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
  
  const rendered = await getRenderedTemplate("admin_new_application", {
    application_id: applicationId,
    applicant_name: applicantName,
    applicant_email: applicantEmail,
    company_name: companyName ? `<p><strong>Company:</strong> ${companyName}</p>` : "",
    app_url: appUrl,
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render admin_new_application template");
    return false;
  }

  return sendEmail({
    to: adminEmail,
    subject: rendered.subject,
    html: rendered.html,
  });
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

  const rendered = await getRenderedTemplate("credit_invoice_created", {
    client_name: clientName,
    tracking_number: trackingNumber,
    amount,
    currency,
    due_date: dueDate,
    app_url: appUrl,
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render credit_invoice_created template");
    return false;
  }

  const sent = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
  });

  if (adminEmails) {
    const adminRendered = await getRenderedTemplate("credit_invoice_created", {
      client_name: "Admin",
      tracking_number: trackingNumber,
      amount,
      currency,
      due_date: dueDate,
      app_url: appUrl,
      year: new Date().getFullYear().toString(),
    });

    if (adminRendered) {
      const adminList = adminEmails.split(",").map(e => e.trim()).filter(Boolean);
      for (const adminEmail of adminList) {
        await sendEmail({
          to: adminEmail,
          subject: `[Admin] New Credit Invoice - ${clientName} - Shipment ${trackingNumber}`,
          html: adminRendered.html,
        });
      }
    }
  }

  return sent;
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

  const rendered = await getRenderedTemplate("credit_invoice_reminder", {
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
  });

  if (!rendered) {
    logError("Failed to render credit_invoice_reminder template");
    return false;
  }

  const sent = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
  });

  if (adminEmails) {
    const adminRendered = await getRenderedTemplate("credit_invoice_reminder", {
      client_name: "Admin",
      tracking_number: trackingNumber,
      amount,
      currency,
      due_date: dueDate,
      days_info: daysInfo,
      urgency_label: urgencyLabel,
      urgency_color: urgencyColor,
      app_url: appUrl,
      year: new Date().getFullYear().toString(),
    });

    if (adminRendered) {
      const adminList = adminEmails.split(",").map(e => e.trim()).filter(Boolean);
      for (const adminEmail of adminList) {
        await sendEmail({
          to: adminEmail,
          subject: `[Admin] ${isOverdue ? "OVERDUE" : "Reminder"} - ${clientName} - Shipment ${trackingNumber}`,
          html: adminRendered.html,
        });
      }
    }
  }

  return sent;
}

export async function sendApplicationRejected(
  email: string,
  name: string,
  reason?: string
): Promise<boolean> {
  const rendered = await getRenderedTemplate("application_rejected", {
    client_name: name,
    rejection_reason: reason ? `<p><strong>Reason:</strong> ${reason}</p>` : "",
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render application_rejected template");
    return false;
  }

  return sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
  });
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
}): Promise<boolean> {
  const appUrl = process.env.APP_URL || "https://app.ezhalha.co";
  const feeLabel =
    params.extraFeeType === "EXTRA_WEIGHT" ? "Extra Weight" : "Extra Cost";
  const detailLine =
    params.extraFeeType === "EXTRA_WEIGHT"
      ? `Additional weight recorded: ${params.extraWeightValue || "0"} ${params.weightUnit || "KG"}`
      : `Additional cost recorded: SAR ${params.extraCostAmountSar || params.amountSar}`;

  return sendEmail({
    to: params.email,
    subject: `Extra fees added for shipment ${params.trackingNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Shipment Extra Fees Notice</h2>
        <p>Dear ${params.clientName},</p>
        <p>We added an extra fee to shipment <strong>${params.trackingNumber}</strong>.</p>
        <p><strong>Fee Type:</strong> ${feeLabel}</p>
        <p><strong>Amount:</strong> SAR ${params.amountSar}</p>
        <p><strong>Details:</strong> ${detailLine}</p>
        <p>You can review the full details in your payments page.</p>
        <p><a href="${appUrl}/client/payments">Open Payments Page</a></p>
        <p style="margin-top: 24px;">Best regards,<br />ezhalha Logistics</p>
      </div>
    `,
    text: [
      `Shipment Extra Fees Notice`,
      ``,
      `Dear ${params.clientName},`,
      `We added an extra fee to shipment ${params.trackingNumber}.`,
      `Fee Type: ${feeLabel}`,
      `Amount: SAR ${params.amountSar}`,
      `Details: ${detailLine}`,
      `Review it here: ${appUrl}/client/payments`,
    ].join("\n"),
  });
}
