import "../load-env";
import crypto from "crypto";

import { storage } from "../storage";

export interface TapChargeCustomer {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: {
    countryCode: string;
    number: string;
  };
}

export interface CreateTapChargeParams {
  amount: number;
  currency: string;
  customer: TapChargeCustomer;
  description?: string;
  redirectUrl: string;
  postUrl: string;
  metadata?: Record<string, string>;
  reference?: {
    transaction?: string;
    order?: string;
  };
  sourceId?: string;
  saveCard?: boolean;
  customerInitiated?: boolean;
  threeDSecure?: boolean;
  paymentAgreementId?: string;
  langCode?: "en" | "ar";
}

export interface TapChargeCustomerReference {
  id?: string;
}

export interface TapChargeCard {
  id?: string;
  brand?: string;
  scheme?: string;
  funding?: string;
  last_four?: string;
  first_six?: string;
  first_eight?: string;
  exp_month?: number;
  exp_year?: number;
  name?: string;
  fingerprint?: string;
}

export interface TapPaymentAgreement {
  id?: string;
}

export interface TapCharge {
  id: string;
  object?: string;
  status: string;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
  transaction?: {
    created?: string;
    url?: string;
  };
  reference?: {
    gateway?: string;
    payment?: string;
    transaction?: string;
    order?: string;
  };
  response?: {
    code?: string;
    message?: string;
  };
  customer?: TapChargeCustomerReference;
  card?: TapChargeCard;
  payment_agreement?: TapPaymentAgreement;
}

export interface CreateTapChargeResult {
  chargeId: string;
  status: string;
  transactionUrl?: string;
  amount: number;
  currency: string;
  charge: TapCharge;
}

export interface TapSavedCardSummary {
  id: string;
  object?: string;
  brand?: string;
  scheme?: string;
  funding?: string;
  last_four?: string;
  first_six?: string;
  first_eight?: string;
  exp_month?: number;
  exp_year?: number;
  name?: string;
}

export interface CreateTapSavedCardTokenParams {
  customerId: string;
  cardId: string;
  clientIp?: string;
}

const TAP_API_BASE = "https://api.tap.company/v2";
const TAP_CARD_SDK_URL = "https://tap-sdks.b-cdn.net/card/1.0.2/index.js";
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

function getCurrencyScale(currency: string): number {
  return THREE_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 3 : 2;
}

export function formatTapAmount(amount: number, currency: string): string {
  return amount.toFixed(getCurrencyScale(currency));
}

function toTapAmountValue(amount: number, currency: string): number {
  return Number(formatTapAmount(amount, currency));
}

function normalizeTapStatus(status: string | undefined | null): string {
  return (status || "").trim().toUpperCase();
}

export class TapService {
  private secretKey = process.env.TAP_SECRET_KEY;
  private publicKey = process.env.TAP_PUBLIC_KEY;
  private merchantId = process.env.TAP_MERCHANT_ID;
  private baseUrl = (process.env.TAP_BASE_URL || TAP_API_BASE).replace(/\/+$/, "");
  private savedCardsEnabled = process.env.TAP_ENABLE_SAVED_CARDS === "true";

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  isEmbeddedCardConfigured(): boolean {
    return Boolean(this.publicKey);
  }

  getPublicKey(): string | undefined {
    return this.publicKey;
  }

  getMerchantId(): string | undefined {
    return this.merchantId || undefined;
  }

  getSdkScriptUrl(): string {
    return TAP_CARD_SDK_URL;
  }

  isSavedCardsEnabled(): boolean {
    return this.savedCardsEnabled;
  }

  private getAuthHeader(): string {
    return `Bearer ${this.secretKey}`;
  }

  isSuccessfulStatus(status: string | undefined | null): boolean {
    return ["CAPTURED", "AUTHORIZED"].includes(normalizeTapStatus(status));
  }

  isPendingStatus(status: string | undefined | null): boolean {
    return ["INITIATED", "PENDING", "IN_PROGRESS"].includes(normalizeTapStatus(status));
  }

  isFailureStatus(status: string | undefined | null): boolean {
    return ["FAILED", "DECLINED", "CANCELLED", "VOID", "VOIDED", "ABANDONED"].includes(
      normalizeTapStatus(status),
    );
  }

  async createCharge(params: CreateTapChargeParams): Promise<CreateTapChargeResult> {
    if (!this.isConfigured()) {
      const mockCharge: TapCharge = {
        id: `tap_mock_${Date.now()}`,
        object: "charge",
        status: "CAPTURED",
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        description: params.description,
        metadata: params.metadata,
      };
      return {
        chargeId: mockCharge.id,
        status: mockCharge.status,
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        charge: mockCharge,
      };
    }

    const startTime = Date.now();
    const currency = params.currency.toUpperCase();
    const payload = {
      amount: toTapAmountValue(params.amount, currency),
      currency,
      customer_initiated: params.customerInitiated ?? true,
      threeDSecure: params.threeDSecure ?? true,
      save_card: params.saveCard ?? false,
      description: params.description,
      metadata: params.metadata,
      reference: {
        transaction: params.reference?.transaction,
        order: params.reference?.order,
      },
      customer: {
        ...(params.customer.id ? { id: params.customer.id } : {}),
        first_name: params.customer.firstName,
        last_name: params.customer.lastName,
        email: params.customer.email,
        ...(params.customer.phone
          ? {
              phone: {
                country_code: params.customer.phone.countryCode,
                number: params.customer.phone.number,
              },
            }
          : {}),
      },
      ...(this.merchantId ? { merchant: { id: this.merchantId } } : {}),
      source: {
        id: params.sourceId || "src_all",
      },
      ...(params.paymentAgreementId
        ? {
            payment_agreement: {
              id: params.paymentAgreementId,
            },
          }
        : {}),
      post: {
        url: params.postUrl,
      },
      redirect: {
        url: params.redirectUrl,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/charges/`, {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
          "lang_code": params.langCode || "en",
        },
        body: JSON.stringify(payload),
      });

      const duration = Date.now() - startTime;
      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        await storage.createIntegrationLog({
          serviceName: "tap",
          operation: "create_charge",
          success: false,
          statusCode: response.status,
          errorMessage: responseData?.message || `Tap API error: ${response.status}`,
          duration,
          requestPayload: JSON.stringify({
            amount: payload.amount,
            currency,
            reference: payload.reference,
          }),
          responsePayload: JSON.stringify(responseData),
        });
        throw new Error(responseData?.message || `Tap API error: ${response.status}`);
      }

      const charge = responseData as TapCharge;

      await storage.createIntegrationLog({
        serviceName: "tap",
        operation: "create_charge",
        success: true,
        statusCode: response.status,
        duration,
        requestPayload: JSON.stringify({
          amount: payload.amount,
          currency,
          reference: payload.reference,
        }),
        responsePayload: JSON.stringify({
          chargeId: charge.id,
          status: charge.status,
          transactionUrl: charge.transaction?.url,
        }),
      });

      return {
        chargeId: charge.id,
        status: charge.status,
        transactionUrl: charge.transaction?.url,
        amount: Number(charge.amount),
        currency: charge.currency,
        charge,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      await storage.createIntegrationLog({
        serviceName: "tap",
        operation: "create_charge",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({
          amount: payload.amount,
          currency,
          reference: payload.reference,
        }),
      });
      throw error;
    }
  }

  async retrieveCharge(chargeId: string): Promise<TapCharge | null> {
    if (!this.isConfigured()) {
      if (!chargeId.startsWith("tap_mock_")) {
        return null;
      }

      return {
        id: chargeId,
        object: "charge",
        status: "CAPTURED",
        amount: 0,
        currency: "SAR",
        transaction: {
          created: Date.now().toString(),
        },
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/charges/${chargeId}`, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
        },
      });

      const duration = Date.now() - startTime;
      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        await storage.createIntegrationLog({
          serviceName: "tap",
          operation: "retrieve_charge",
          success: false,
          statusCode: response.status,
          errorMessage: responseData?.message || `Tap API error: ${response.status}`,
          duration,
          requestPayload: JSON.stringify({ chargeId }),
          responsePayload: JSON.stringify(responseData),
        });
        if (response.status === 404) {
          return null;
        }
        throw new Error(responseData?.message || `Tap API error: ${response.status}`);
      }

      await storage.createIntegrationLog({
        serviceName: "tap",
        operation: "retrieve_charge",
        success: true,
        statusCode: response.status,
        duration,
        requestPayload: JSON.stringify({ chargeId }),
        responsePayload: JSON.stringify({
          chargeId: responseData.id,
          status: responseData.status,
        }),
      });

      return responseData as TapCharge;
    } catch (error) {
      const duration = Date.now() - startTime;
      await storage.createIntegrationLog({
        serviceName: "tap",
        operation: "retrieve_charge",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({ chargeId }),
      });
      throw error;
    }
  }

  async createSavedCardToken(params: CreateTapSavedCardTokenParams): Promise<{ id: string; status?: string }> {
    if (!this.isConfigured()) {
      return {
        id: `tok_saved_mock_${Date.now()}`,
        status: "ACTIVE",
      };
    }

    const response = await fetch(`${this.baseUrl}/tokens/`, {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        saved_card: {
          card_id: params.cardId,
          customer_id: params.customerId,
        },
        client_ip: params.clientIp || "127.0.0.1",
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || `Tap API error: ${response.status}`);
    }

    return data as { id: string; status?: string };
  }

  async listSavedCards(customerId: string): Promise<TapSavedCardSummary[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const response = await fetch(`${this.baseUrl}/card/${customerId}`, {
      method: "GET",
      headers: {
        Authorization: this.getAuthHeader(),
        Accept: "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || `Tap API error: ${response.status}`);
    }

    if (Array.isArray(data)) {
      return data as TapSavedCardSummary[];
    }

    if (Array.isArray(data?.cards)) {
      return data.cards as TapSavedCardSummary[];
    }

    if (Array.isArray(data?.data)) {
      return data.data as TapSavedCardSummary[];
    }

    return [];
  }

  async deleteSavedCard(customerId: string, cardId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/card/${customerId}/${cardId}`, {
      method: "DELETE",
      headers: {
        Authorization: this.getAuthHeader(),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || `Tap API error: ${response.status}`);
    }
  }

  validateWebhookSignature(event: Record<string, any>, hashstringHeader: string | undefined): boolean {
    if (!hashstringHeader || !this.secretKey) {
      return false;
    }

    const objectType = String(event.object || "").toLowerCase();
    const id = String(event.id || "");
    const currency = String(event.currency || "").toUpperCase();
    const amount = formatTapAmount(Number(event.amount || 0), currency || "SAR");
    const status = String(event.status || "");
    const created = String(event.transaction?.created || event.created || "");

    let payloadString = "";
    if (objectType === "invoice") {
      const updated = String(event.updated || "");
      payloadString = `x_id${id}x_amount${amount}x_currency${currency}x_updated${updated}x_status${status}x_created${created}`;
    } else {
      const gatewayReference = String(event.reference?.gateway || "");
      const paymentReference = String(event.reference?.payment || "");
      payloadString = `x_id${id}x_amount${amount}x_currency${currency}x_gateway_reference${gatewayReference}x_payment_reference${paymentReference}x_status${status}x_created${created}`;
    }

    const expectedHash = crypto
      .createHmac("sha256", this.secretKey)
      .update(payloadString)
      .digest("hex");

    if (expectedHash.length !== hashstringHeader.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedHash, "utf8"),
        Buffer.from(hashstringHeader, "utf8"),
      );
    } catch {
      return false;
    }
  }
}

export const tapService = new TapService();
