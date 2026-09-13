import { storage } from "../storage";
import { logInfo } from "./logger";
import { NOTIFICATION_TEMPLATE_TYPES, notificationTemplateSlug } from "./email-settings";

export interface TemplateDefinition {
  slug: string;
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  availableVariables: string[];
}

const DEFAULT_STYLES = `
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #fe5200; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
  .header h1 { margin: 0; font-size: 22px; }
  .content { padding: 20px 24px; background: #f9f9f9; }
  .details { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e5e7eb; }
  .details h3 { margin-top: 0; }
  .credentials { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e5e7eb; }
  .button { display: inline-block; background: #fe5200; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; }
  .urgency { padding: 12px; border-radius: 5px; margin: 15px 0; font-weight: bold; text-align: center; }
  .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
`;

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  {
    slug: "account_credentials",
    name: "Account Credentials",
    description: "Sent to clients when their application is approved and account is created",
    subject: "Your ezhalha Account Has Been Approved",
    availableVariables: ["client_name", "username", "temporary_password", "login_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ezhalha</h1>
    </div>
    <div class="content">
      <p>Dear {{client_name}},</p>
      <p>Your account application has been approved! You can now access the ezhalha logistics platform.</p>
      <div class="credentials">
        <h3>Your Login Credentials</h3>
        <p><strong>Username:</strong> {{username}}</p>
        <p><strong>Temporary Password:</strong> {{temporary_password}}</p>
      </div>
      <p><strong>Important:</strong> Please change your password after your first login.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{login_url}}" class="button">Login to ezhalha</a>
      </p>
      <p>If you have any questions, please contact our support team.</p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "application_received",
    name: "Application Received",
    description: "Confirmation sent to applicants after they submit their application",
    subject: "ezhalha Application Received",
    availableVariables: ["client_name", "application_id", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Received</h1>
    </div>
    <div class="content">
      <p>Dear {{client_name}},</p>
      <p>Thank you for applying to ezhalha. We have received your application and our team will review it shortly.</p>
      <p><strong>Application Reference:</strong> {{application_id}}</p>
      <p>You will receive an email notification once your application has been reviewed. This typically takes 1-2 business days.</p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "application_rejected",
    name: "Application Rejected",
    description: "Sent to applicants when their application is rejected",
    subject: "ezhalha Application Status Update",
    availableVariables: ["client_name", "rejection_reason", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Update</h1>
    </div>
    <div class="content">
      <p>Dear {{client_name}},</p>
      <p>Thank you for your interest in ezhalha. After reviewing your application, we regret to inform you that we are unable to approve your account at this time.</p>
      {{rejection_reason}}
      <p>If you believe this was in error or would like to submit a new application with additional information, please feel free to apply again.</p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "admin_new_application",
    name: "Admin: New Application",
    description: "Notification sent to admin when a new client application is submitted",
    subject: "New Client Application: {{applicant_name}}",
    availableVariables: ["application_id", "applicant_name", "applicant_email", "company_name", "app_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Client Application</h1>
    </div>
    <div class="content">
      <p>A new client application has been submitted and requires your review.</p>
      <div class="details">
        <h3>Application Details</h3>
        <p><strong>Application ID:</strong> {{application_id}}</p>
        <p><strong>Name:</strong> {{applicant_name}}</p>
        <p><strong>Email:</strong> {{applicant_email}}</p>
        {{company_name}}
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{app_url}}/admin/applications" class="button">Review Application</a>
      </p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "credit_invoice_created",
    name: "Credit Invoice Created",
    description: "Sent to clients when a Pay Later credit invoice is created for their shipment",
    subject: "Credit Invoice Created - Shipment {{tracking_number}}",
    availableVariables: ["client_name", "tracking_number", "amount", "currency", "due_date", "app_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Credit Invoice Created</h1>
    </div>
    <div class="content">
      <p>Dear {{client_name}},</p>
      <p>A credit invoice has been created for your shipment. Payment is due within 30 days.</p>
      <div class="details">
        <h3>Invoice Details</h3>
        <p><strong>Shipment:</strong> {{tracking_number}}</p>
        <p><strong>Amount:</strong> {{currency}} {{amount}}</p>
        <p><strong>Due Date:</strong> {{due_date}}</p>
        <p><strong>Payment Method:</strong> Pay Later (Credit)</p>
      </div>
      <p>Reminders will be sent to your email as the due date approaches.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{app_url}}/client/billing" class="button">View Invoice</a>
      </p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "credit_invoice_reminder",
    name: "Credit Invoice Reminder",
    description: "Payment reminder or overdue notice for credit invoices",
    subject: "{{urgency_label}} - Shipment {{tracking_number}} - {{currency}} {{amount}}",
    availableVariables: ["client_name", "tracking_number", "amount", "currency", "due_date", "days_info", "urgency_label", "urgency_color", "app_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: {{urgency_color}}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 22px; }
    .content { padding: 20px 24px; background: #f9f9f9; }
    .details { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e5e7eb; }
    .details h3 { margin-top: 0; }
    .urgency { background: {{urgency_color}}15; border: 1px solid {{urgency_color}}; padding: 12px; border-radius: 5px; margin: 15px 0; color: {{urgency_color}}; font-weight: bold; text-align: center; }
    .button { display: inline-block; background: #fe5200; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment {{urgency_label}}</h1>
    </div>
    <div class="content">
      <p>Dear {{client_name}},</p>
      <p>This is a reminder regarding your credit invoice payment.</p>
      <div class="urgency">{{days_info}}</div>
      <div class="details">
        <h3>Invoice Details</h3>
        <p><strong>Shipment:</strong> {{tracking_number}}</p>
        <p><strong>Amount Due:</strong> {{currency}} {{amount}}</p>
        <p><strong>Due Date:</strong> {{due_date}}</p>
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{app_url}}/client/billing" class="button">View & Pay Invoice</a>
      </p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "staff_invitation",
    name: "Staff Invitation",
    description: "Sent to internal staff (admin/operations) when invited to join the platform",
    subject: "Invitation to join ezhalha",
    availableVariables: ["full_name", "role_name", "department_name", "personal_message", "accept_url", "expires_date", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You're Invited to ezhalha</h1>
    </div>
    <div class="content">
      <p>Hello {{full_name}},</p>
      <p>You were invited to join ezhalha as <strong>{{role_name}}</strong> in <strong>{{department_name}}</strong>.</p>
      {{personal_message}}
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{accept_url}}" class="button">Accept Invitation</a>
      </p>
      <p>This invitation expires on {{expires_date}}.</p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "shipment_extra_fees",
    name: "Shipment Extra Fees",
    description: "Sent to clients when an extra weight/volume or extra cost fee is added to a shipment",
    subject: "Extra fees added for shipment {{tracking_number}}",
    availableVariables: ["client_name", "tracking_number", "fee_label", "amount_sar", "detail_line", "invoice_line", "app_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Shipment Extra Fees</h1>
    </div>
    <div class="content">
      <p>Dear {{client_name}},</p>
      <p>We added an extra fee to your shipment.</p>
      <div class="details">
        <h3>Fee Details</h3>
        <p><strong>Shipment:</strong> {{tracking_number}}</p>
        <p><strong>Fee Type:</strong> {{fee_label}}</p>
        <p><strong>Amount:</strong> SAR {{amount_sar}}</p>
        <p><strong>Details:</strong> {{detail_line}}</p>
        {{invoice_line}}
      </div>
      <p>You can review and pay this invoice from your invoices page.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{app_url}}/client/invoices" class="button">Open Invoices Page</a>
      </p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "operations_shipment_update",
    name: "Operations Shipment Update",
    description: "Sent to clients when operations posts an email update on their shipment",
    subject: "Shipment update for {{tracking_number}}",
    availableVariables: ["tracking_number", "message", "action_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Shipment Update</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <div class="details">
        <p>{{message}}</p>
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{action_url}}" class="button">Open Shipment</a>
      </p>
      <p style="color: #6B7280; font-size: 12px;">This update was sent by ezhalha Operations.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "abandoned_discount_offer",
    name: "Abandoned Shipment - Discount Offer",
    description: "Discount offer sent to clients who abandoned a shipment before paying",
    subject: "Special offer for shipment {{tracking_number}}",
    availableVariables: ["tracking_number", "message", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>A Special Offer For You</h1>
    </div>
    <div class="content">
      <div class="details">
        <p>{{message}}</p>
      </div>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "abandoned_payment_reminder",
    name: "Abandoned Shipment - Payment Reminder",
    description: "Reminder sent to clients to resume payment for an abandoned shipment",
    subject: "Reminder: complete shipment {{tracking_number}}",
    availableVariables: ["tracking_number", "resume_url", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Complete Your Payment</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>You can still complete payment for shipment <strong>{{tracking_number}}</strong>.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{resume_url}}" class="button">Resume Payment</a>
      </p>
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "operation_notification",
    name: "Operations Notification",
    description: "Generic notification email sent to staff/clients for operational events (status changes, messages, assignments)",
    subject: "{{title}}",
    availableVariables: ["title", "body", "action_block", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{title}}</h1>
    </div>
    <div class="content">
      <p>{{body}}</p>
      {{action_block}}
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "password_setup",
    name: "Set Your Password",
    description: "Sent when a new user is created and needs to choose their first password",
    subject: "Welcome to ezhalha — set your password",
    availableVariables: ["recipient_name", "action_url", "expiry_text", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ezhalha</h1>
    </div>
    <div class="content">
      <p>Hello {{recipient_name}},</p>
      <p>Your account is ready. Choose a password to sign in.</p>
      <p style="text-align:center;margin:30px 0"><a href="{{action_url}}" class="button">Set my password</a></p>
      <p style="color:#888;font-size:12px">This link expires in {{expiry_text}}. If you were not expecting this, you can ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "password_reset",
    name: "Reset Your Password",
    description: "Sent when someone asks to reset their password",
    subject: "Reset your ezhalha password",
    availableVariables: ["recipient_name", "action_url", "expiry_text", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reset your password</h1>
    </div>
    <div class="content">
      <p>Hello {{recipient_name}},</p>
      <p>We received a request to reset your password. Choose a new one below.</p>
      <p style="text-align:center;margin:30px 0"><a href="{{action_url}}" class="button">Reset my password</a></p>
      <p style="color:#888;font-size:12px">This link expires in {{expiry_text}}. If you did not request this, you can ignore this email and your password stays unchanged.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "login_otp",
    name: "Login Code",
    description: "One-time code emailed to someone signing in without a password",
    subject: "Your ezhalha login code",
    availableVariables: ["code", "expiry_text", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your login code</h1>
    </div>
    <div class="content">
      <p>Use this code to sign in to ezhalha. It expires in {{expiry_text}}.</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;margin:20px 0">{{code}}</div>
      <p style="color:#888;font-size:12px">If you did not request this, you can ignore this email. Nobody can sign in without the code.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "integration_health_digest",
    name: "Integration Health Digest",
    description: "Scheduled summary of carrier and integration failures, sent to the team",
    subject: "Integration health digest — {{failure_count}} issue(s)",
    availableVariables: ["failure_count", "period_text", "digest_body", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Integration health</h1>
    </div>
    <div class="content">
      <p>{{failure_count}} issue(s) recorded in {{period_text}}.</p>
      {{digest_body}}
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
];

/**
 * Every in-app notification used to be emailed through one generic template, so a quotation
 * being ready and a colleague mentioning you arrived looking identical and could not be worded
 * differently. Each notification type now seeds its own template, generated from one shape so
 * they stay consistent until an admin edits one — at which point only that one changes.
 *
 * Anything with no template of its own still falls back to `operation_notification`.
 */
for (const notification of NOTIFICATION_TEMPLATE_TYPES) {
  DEFAULT_TEMPLATES.push({
    slug: notificationTemplateSlug(notification.type),
    name: `Notification: ${notification.label}`,
    description: notification.trigger,
    subject: "{{title}}",
    availableVariables: ["title", "body", "action_block", "year"],
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${DEFAULT_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{title}}</h1>
    </div>
    <div class="content">
      <p>{{body}}</p>
      {{action_block}}
    </div>
    <div class="footer">
      <p>&copy; {{year}} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  });
}

const HTML_SAFE_VARIABLES = new Set([
  "rejection_reason",
  "company_name",
  "personal_message",
  "invoice_line",
  "detail_line",
  "message",
  "action_block",
  "body",
  "digest_body",
  "notification_body",
]);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderTemplate(htmlBody: string, subject: string, variables: Record<string, string>): { html: string; subject: string } {
  let renderedHtml = htmlBody;
  let renderedSubject = subject;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    const safeValue = HTML_SAFE_VARIABLES.has(key) ? value : escapeHtml(value);
    renderedHtml = renderedHtml.replace(pattern, safeValue);
    renderedSubject = renderedSubject.replace(pattern, escapeHtml(value));
  }

  return { html: renderedHtml, subject: renderedSubject };
}

export async function getRenderedTemplate(
  slug: string,
  variables: Record<string, string>
): Promise<{ html: string; subject: string } | null> {
  try {
    const template = await storage.getEmailTemplateBySlug(slug);

    if (template && template.isActive) {
      return renderTemplate(template.htmlBody, template.subject, variables);
    }

    const defaultTemplate = DEFAULT_TEMPLATES.find((t) => t.slug === slug);
    if (defaultTemplate) {
      return renderTemplate(defaultTemplate.htmlBody, defaultTemplate.subject, variables);
    }

    return null;
  } catch (error) {
    const defaultTemplate = DEFAULT_TEMPLATES.find((t) => t.slug === slug);
    if (defaultTemplate) {
      return renderTemplate(defaultTemplate.htmlBody, defaultTemplate.subject, variables);
    }
    return null;
  }
}

export async function seedEmailTemplates(): Promise<void> {
  for (const template of DEFAULT_TEMPLATES) {
    const existing = await storage.getEmailTemplateBySlug(template.slug);
    if (!existing) {
      await storage.createEmailTemplate({
        slug: template.slug,
        name: template.name,
        description: template.description,
        subject: template.subject,
        htmlBody: template.htmlBody,
        availableVariables: JSON.stringify(template.availableVariables),
        isActive: true,
      });
      logInfo(`Seeded email template: ${template.slug}`);
      continue;
    }

    // Refresh defaults for templates an admin has not customized yet
    // (updatedByUserId is null), so structural/style changes to the
    // built-in templates roll out without manual resets.
    if (!existing.updatedByUserId) {
      const availableVariables = JSON.stringify(template.availableVariables);
      const needsUpdate =
        existing.subject !== template.subject ||
        existing.htmlBody !== template.htmlBody ||
        existing.name !== template.name ||
        existing.description !== template.description ||
        existing.availableVariables !== availableVariables;
      if (needsUpdate) {
        await storage.updateEmailTemplate(existing.id, {
          name: template.name,
          description: template.description,
          subject: template.subject,
          htmlBody: template.htmlBody,
          availableVariables,
        });
        logInfo(`Refreshed default email template: ${template.slug}`);
      }
    }
  }
}
