import nodemailer from "nodemailer";
import { logInfo, logError } from "./logger";
import { getIntegrationEnv, withShipmentIntegrationAccount } from "./integration-runtime";

/**
 * The raw outbound transport, and nothing else.
 *
 * This lives apart from `email.ts` so the delivery layer — which records attempts and retries
 * them — can reach the transport without importing the high-level senders that now go through
 * it. Anything policy-shaped (is this email enabled, how many attempts, what to do on failure)
 * belongs in `email-delivery.ts`, not here.
 */

interface ResolvedTransport {
  transporter: nodemailer.Transporter;
  provider: string;
  // Postmark routes each message through a "message stream"; the header selects it.
  messageStream?: string;
}

// Prefer Postmark (dedicated transactional IPs + delivery/bounce visibility) whenever
// POSTMARK_SERVER_TOKEN is present; otherwise fall back to generic SMTP (Hostinger) so nothing
// breaks before the token is provisioned.
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

export interface TransportResult {
  sent: boolean;
  /** True when mail is not configured at all — a retry will not help. */
  notConfigured?: boolean;
  provider?: string;
  messageId?: string;
  rejected?: string[];
  error?: string;
}

export interface TransportOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function deliverEmail(options: TransportOptions): Promise<TransportResult> {
  return withShipmentIntegrationAccount("smtp", {}, async () => {
    const resolved = getTransporter();

    if (!resolved) {
      logInfo("Email not sent - service not configured", { to: options.to, subject: options.subject });
      return { sent: false, notConfigured: true, error: "Email service is not configured" };
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
      // report can be traced against the mail server (accepted != delivered — rejects show here).
      logInfo("Email sent successfully", {
        to: options.to,
        subject: options.subject,
        provider,
        messageId: info?.messageId,
        response: info?.response,
        accepted: info?.accepted,
        rejected: info?.rejected,
      });

      const rejected = Array.isArray(info?.rejected) ? info.rejected.map(String) : [];
      if (rejected.length > 0) {
        logError("Email recipients rejected by SMTP server", undefined, {
          to: options.to,
          subject: options.subject,
          rejected,
          response: info?.response,
        });
        // A rejected recipient is a delivery failure even though the SMTP call resolved.
        return { sent: false, provider, messageId: info?.messageId, rejected, error: `Recipients rejected: ${rejected.join(", ")}` };
      }

      return { sent: true, provider, messageId: info?.messageId };
    } catch (error) {
      logError("Failed to send email", error, { to: options.to, subject: options.subject });
      return { sent: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
