import nodemailer from "nodemailer";
import { logInfo, logError } from "./logger";
import { getRenderedTemplate } from "./email-templates";
import { getIntegrationEnv, withShipmentIntegrationAccount } from "./integration-runtime";

interface ResolvedTransport {
  transporter: nodemailer.Transporter;
  provider: string;
  // Postmark routes each message through a "message stream"; the header selects it.
  messageStream?: string;
}

// Resolve the outbound mail transport. Prefer Postmark (dedicated transactional IPs +
// delivery/bounce visibility) whenever POSTMARK_SERVER_TOKEN is present; otherwise fall
// back to generic SMTP (Hostinger) so nothing breaks before the token is provisioned.
function getTransporter(): ResolvedTransport | null {
  const postmarkToken = getIntegrationEnv("POSTMARK_SERVER_TOKEN");
  if (postmarkToken) {
    return {
      transporter: nodemailer.createTransport({
        host: "smtp.postmarkapp.com",
        port: 587,
        secure: false, // STARTTLS is negotiated on 587
        auth: { user: postmarkToken, pass: postmarkToken },
      }),
      provider: "postmark",
      messageStream: getIntegrationEnv("POSTMARK_MESSAGE_STREAM") || "outbound",
    };
  }

  const user = getIntegrationEnv("SMTP_USER") || "";
  const pass = getIntegrationEnv("SMTP_PASS") || "";

  if (!user || !pass) {
    logInfo("Email service not configured - SMTP credentials missing");
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host: getIntegrationEnv("SMTP_HOST") || "smtp.example.com",
      port: parseInt(getIntegrationEnv("SMTP_PORT") || "587"),
      secure: getIntegrationEnv("SMTP_SECURE") === "true",
      auth: { user, pass },
    }),
    provider: "hostinger-smtp",
  };
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  return withShipmentIntegrationAccount("smtp", {}, async () => {
    const resolved = getTransporter();

    if (!resolved) {
      logInfo("Email not sent - service not configured", { to: options.to, subject: options.subject });
      return false;
    }

    const { transporter, provider, messageStream } = resolved;

    try {
      const fromAddress = getIntegrationEnv("SMTP_FROM") || "noreply@ezhalha.com";

      const info = await transporter.sendMail({
        from: `"ezhalha" <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ""),
        // Postmark selects its message stream via this header; ignored by plain SMTP.
        ...(messageStream ? { headers: { "X-PM-Message-Stream": messageStream } } : {}),
      });

      // Log the SMTP response + messageId + accepted/rejected recipients so a "didn't receive"
      // report can be traced against the mail server (accepted ≠ delivered — rejects show here).
      logInfo("Email sent successfully", {
        to: options.to,
        subject: options.subject,
        provider,
        messageId: info?.messageId,
        response: info?.response,
        accepted: info?.accepted,
        rejected: info?.rejected,
      });
      if (Array.isArray(info?.rejected) && info.rejected.length > 0) {
        logError("Email recipients rejected by SMTP server", undefined, {
          to: options.to,
          subject: options.subject,
          rejected: info.rejected,
          response: info?.response,
        });
      }
      return true;
    } catch (error) {
      logError("Failed to send email", error, { to: options.to, subject: options.subject });
      return false;
    }
  });
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
  const invoiceTextLine = params.invoiceNumber ? `Invoice: ${params.invoiceNumber}` : null;

  const rendered = await getRenderedTemplate("shipment_extra_fees", {
    client_name: params.clientName,
    tracking_number: params.trackingNumber,
    fee_label: feeLabel,
    amount_sar: params.amountSar,
    detail_line: detailLine,
    invoice_line: invoiceLine,
    app_url: appUrl,
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render shipment_extra_fees template");
    return false;
  }

  return sendEmail({
    to: params.email,
    subject: rendered.subject,
    html: rendered.html,
    text: [
      `Shipment Extra Fees Notice`,
      ``,
      `Dear ${params.clientName},`,
      `We added an extra fee to shipment ${params.trackingNumber}.`,
      `Fee Type: ${feeLabel}`,
      `Amount: SAR ${params.amountSar}`,
      `Details: ${detailLine}`,
      ...(invoiceTextLine ? [invoiceTextLine] : []),
      `Review and pay it here: ${appUrl}/client/invoices`,
    ].join("\n"),
  });
}
