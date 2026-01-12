/**
 * Moyasar Payment Integration for ezhalha
 * 
 * This module provides Moyasar payment processing capabilities.
 * Configure MOYASAR_SECRET_KEY and MOYASAR_PUBLISHABLE_KEY in your environment.
 * 
 * To fully enable Moyasar:
 * 1. Set MOYASAR_SECRET_KEY in .env (sk_test_... or sk_live_...)
 * 2. Set MOYASAR_PUBLISHABLE_KEY in .env (pk_test_... or pk_live_...)
 * 3. Configure callback_url for payment completion redirects
 * 
 * Moyasar uses HTTP Basic Auth with the secret key as username and empty password.
 * All amounts are in the smallest currency unit (e.g., 1000 = 10.00 SAR)
 */

export interface CreatePaymentParams {
  amount: number;
  currency: string;
  description?: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface MoyasarPaymentSource {
  type: string;
  company?: string;
  name?: string;
  number?: string;
  transaction_url?: string;
  message?: string;
}

export interface MoyasarPayment {
  id: string;
  status: "initiated" | "paid" | "failed" | "authorized" | "captured" | "refunded" | "voided";
  amount: number;
  fee?: number;
  currency: string;
  description?: string;
  callback_url: string;
  metadata?: Record<string, string>;
  source: MoyasarPaymentSource;
  created_at: string;
  updated_at?: string;
}

export interface CreatePaymentResult {
  paymentId: string;
  status: string;
  transactionUrl?: string;
  amount: number;
  currency: string;
}

const MOYASAR_API_BASE = "https://api.moyasar.com/v1";

export class MoyasarService {
  private secretKey: string | undefined;
  private publishableKey: string | undefined;

  constructor() {
    this.secretKey = process.env.MOYASAR_SECRET_KEY;
    this.publishableKey = process.env.MOYASAR_PUBLISHABLE_KEY;
  }

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  getPublishableKey(): string | undefined {
    return this.publishableKey;
  }

  private getAuthHeader(): string {
    return "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      const mockId = `mpy_mock_${Date.now()}`;
      return {
        paymentId: mockId,
        status: "initiated",
        transactionUrl: undefined,
        amount: params.amount,
        currency: params.currency,
      };
    }

    const response = await fetch(`${MOYASAR_API_BASE}/payments`, {
      method: "POST",
      headers: {
        "Authorization": this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
        source: {
          type: "creditcard",
          "3ds": true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Moyasar API error: ${response.status}`);
    }

    const payment: MoyasarPayment = await response.json();

    return {
      paymentId: payment.id,
      status: payment.status,
      transactionUrl: payment.source?.transaction_url,
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  async getPayment(paymentId: string): Promise<MoyasarPayment | null> {
    if (!this.isConfigured()) {
      if (paymentId.startsWith("mpy_mock_")) {
        return {
          id: paymentId,
          status: "paid",
          amount: 0,
          currency: "SAR",
          callback_url: "",
          source: { type: "creditcard", message: "Mock payment" },
          created_at: new Date().toISOString(),
        };
      }
      return null;
    }

    const response = await fetch(`${MOYASAR_API_BASE}/payments/${paymentId}`, {
      method: "GET",
      headers: {
        "Authorization": this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Moyasar API error: ${response.status}`);
    }

    return response.json();
  }

  async verifyPayment(paymentId: string): Promise<string> {
    if (!this.isConfigured()) {
      if (paymentId.startsWith("mpy_mock_")) {
        return "paid";
      }
      return "pending";
    }

    const payment = await this.getPayment(paymentId);
    return payment?.status || "unknown";
  }

  async refundPayment(paymentId: string, amount?: number): Promise<boolean> {
    if (!this.isConfigured()) {
      return true;
    }

    const response = await fetch(`${MOYASAR_API_BASE}/payments/${paymentId}/refund`, {
      method: "POST",
      headers: {
        "Authorization": this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: amount ? JSON.stringify({ amount }) : undefined,
    });

    return response.ok;
  }

  /**
   * Validates a webhook signature from Moyasar.
   * Moyasar uses HMAC-SHA256 for webhook signatures.
   * The signature is passed in the X-Moyasar-Signature header.
   * 
   * Note: The webhook secret must be configured in MOYASAR_WEBHOOK_SECRET.
   * For redirect callbacks, we validate by fetching the payment from Moyasar's API
   * instead of relying on the callback parameters (which is what verifyPayment does).
   */
  validateWebhookSignature(payload: string, signature: string | undefined): boolean {
    const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET;
    
    // If no secret is configured, log a warning but allow processing in development
    if (!webhookSecret) {
      console.warn("MOYASAR_WEBHOOK_SECRET not configured - webhook signature validation skipped");
      return true;
    }
    
    if (!signature) {
      return false;
    }
    
    try {
      const crypto = require("crypto");
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8")
      );
    } catch {
      return false;
    }
  }
}

export const moyasarService = new MoyasarService();
