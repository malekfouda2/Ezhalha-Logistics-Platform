/**
 * Stripe Payment Integration for ezhalha
 * 
 * This module provides Stripe payment processing capabilities.
 * Configure STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in your environment.
 * 
 * To fully enable Stripe:
 * 1. Install stripe: npm install stripe
 * 2. Set STRIPE_SECRET_KEY in .env
 * 3. Set STRIPE_WEBHOOK_SECRET for webhook validation
 * 4. Configure your Stripe dashboard webhook endpoint to /api/webhooks/stripe
 */

import Stripe from "stripe";

export interface CreatePaymentIntentParams {
  amount: number; // Amount in cents
  currency: string;
  invoiceId: string;
  clientAccountId: string;
  description?: string;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export class StripeService {
  private secretKey: string | undefined;
  private stripe: Stripe | null = null;

  constructor() {
    this.secretKey = process.env.STRIPE_SECRET_KEY;
    if (this.secretKey) {
      this.stripe = new Stripe(this.secretKey);
    }
  }

  isConfigured(): boolean {
    return !!this.secretKey && !!this.stripe;
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, string>
  ): Promise<{ id: string; clientSecret: string }> {
    if (!this.isConfigured() || !this.stripe) {
      return {
        id: `pi_mock_${Date.now()}`,
        clientSecret: `pi_mock_secret_${Date.now()}`,
      };
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
    });

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret || "",
    };
  }

  async createPaymentIntentLegacy(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    if (!this.isConfigured() || !this.stripe) {
      return {
        clientSecret: `pi_mock_secret_${Date.now()}`,
        paymentIntentId: `pi_mock_${Date.now()}`,
      };
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      metadata: {
        invoiceId: params.invoiceId,
        clientAccountId: params.clientAccountId,
      },
      description: params.description,
    });

    return {
      clientSecret: paymentIntent.client_secret || "",
      paymentIntentId: paymentIntent.id,
    };
  }

  async verifyPayment(paymentIntentId: string): Promise<string> {
    if (!this.isConfigured() || !this.stripe) {
      if (paymentIntentId.startsWith("pi_mock_")) {
        return "succeeded";
      }
      return "pending";
    }

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.status;
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    if (!this.isConfigured() || !this.stripe) {
      return null;
    }

    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    if (!this.isConfigured() || !this.stripe) {
      return null;
    }

    return this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !this.stripe) return true;
    
    try {
      this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      return true;
    } catch {
      return false;
    }
  }
}

export const stripeService = new StripeService();
