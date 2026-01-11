import nodemailer from "nodemailer";
import { logInfo, logError } from "./logger";

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
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #fe5200; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .credentials { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; background: #fe5200; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ezhalha</h1>
    </div>
    <div class="content">
      <p>Dear ${name},</p>
      <p>Your account application has been approved! You can now access the ezhalha logistics platform.</p>
      
      <div class="credentials">
        <h3>Your Login Credentials</h3>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
      </div>
      
      <p><strong>Important:</strong> Please change your password after your first login.</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" class="button">Login to ezhalha</a>
      </p>
      
      <p>If you have any questions, please contact our support team.</p>
      
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ezhalha. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: email,
    subject: "Your ezhalha Account Has Been Approved",
    html,
  });
}

export async function sendApplicationReceived(
  email: string,
  name: string,
  applicationId: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #fe5200; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Received</h1>
    </div>
    <div class="content">
      <p>Dear ${name},</p>
      <p>Thank you for applying to ezhalha. We have received your application and our team will review it shortly.</p>
      
      <p><strong>Application Reference:</strong> ${applicationId}</p>
      
      <p>You will receive an email notification once your application has been reviewed. This typically takes 1-2 business days.</p>
      
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: email,
    subject: "ezhalha Application Received",
    html,
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
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #fe5200; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .details { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; background: #fe5200; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
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
        <p><strong>Application ID:</strong> ${applicationId}</p>
        <p><strong>Name:</strong> ${applicantName}</p>
        <p><strong>Email:</strong> ${applicantEmail}</p>
        ${companyName ? `<p><strong>Company:</strong> ${companyName}</p>` : ""}
      </div>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${appUrl}/admin/applications" class="button">Review Application</a>
      </p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: adminEmail,
    subject: `New Client Application: ${applicantName}`,
    html,
  });
}

export async function sendApplicationRejected(
  email: string,
  name: string,
  reason?: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #fe5200; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Update</h1>
    </div>
    <div class="content">
      <p>Dear ${name},</p>
      <p>Thank you for your interest in ezhalha. After reviewing your application, we regret to inform you that we are unable to approve your account at this time.</p>
      
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
      
      <p>If you believe this was in error or would like to submit a new application with additional information, please feel free to apply again.</p>
      
      <p>Best regards,<br>The ezhalha Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ezhalha. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: email,
    subject: "ezhalha Application Status Update",
    html,
  });
}
