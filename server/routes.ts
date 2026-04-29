import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import type { ClientAccount, ClientUserPermission, Invoice, Permission, Role, Shipment, User } from "@shared/schema";
import {
  ACCOUNT_MANAGER_SYSTEM_ROLE_DESCRIPTION,
  ACCOUNT_MANAGER_SYSTEM_ROLE_ID,
  ACCOUNT_MANAGER_SYSTEM_ROLE_NAME,
  AccountManagerChangeRequestStatus,
  AccountManagerChangeRequestType,
  CarrierPaymentStatus,
  CarrierPayoutBatchStatus,
  ClientPermission,
  ALL_CLIENT_PERMISSIONS,
  InvoiceType,
  shipmentTradeDocumentSchema,
  ShipmentExtraFeeType,
  type ClientPermissionValue,
} from "@shared/schema";
import { logInfo, logError, logAuditToFile, logApiRequest, logWebhook, logPricingChange, logProfileChange } from "./services/logger";
import { sendAccountCredentials, sendApplicationReceived, sendApplicationRejected, notifyAdminNewApplication, sendCreditInvoiceCreated, sendCreditInvoiceReminder, sendShipmentExtraFeesNotification } from "./services/email";
import { fedexAdapter, CarrierError } from "./integrations/fedex";
import type { CarrierAdapter, CreateShipmentRequest } from "./integrations/fedex";
import { carrierService, getCarrierAdapter } from "./integrations/carriers";
import { zohoService } from "./integrations/zoho";
import type { TapCharge } from "./integrations/tap";
import { tapService } from "./integrations/tap";
import { getIdempotencyRecord, setIdempotencyRecord } from "./services/idempotency";
import { lookupHsCode, confirmHsCode, isGenericItemName } from "./services/hsLookup";
import sanitizeHtml from "sanitize-html";
import { validateShippingAddresses, POSTAL_CODE_EXEMPT_COUNTRIES, STATE_REQUIRED_COUNTRIES, formatValidationErrors } from "./validation/shippingAddress";
import {
  calculateShipmentAccounting,
  isDdpEligibleForShipment,
} from "./services/shipment-accounting";
import {
  getCompanyApplicationDocumentLabel,
  getMissingCompanyApplicationDocumentTypes,
} from "@shared/application-documents";
import { buildFedExShipmentRequestFromShipment } from "./services/fedex-shipment";
import { buildDhlShipmentRequestFromShipment } from "./services/dhl-shipment";
import { extractInvoiceItemsFromDocument } from "./services/invoice-extraction";

const SALT_ROUNDS = 10;
const FINANCIAL_MONTH_WINDOW = 12;
const DEFAULT_TAP_SOURCE_ID = "src_card";

const COUNTRY_DIAL_CODES: Record<string, string> = {
  SA: "966",
  "SAUDI ARABIA": "966",
  AE: "971",
  "UNITED ARAB EMIRATES": "971",
  BH: "973",
  BAHRAIN: "973",
  EG: "20",
  EGYPT: "20",
  GB: "44",
  "UNITED KINGDOM": "44",
  JO: "962",
  JORDAN: "962",
  KW: "965",
  KUWAIT: "965",
  OM: "968",
  OMAN: "968",
  QA: "974",
  QATAR: "974",
  US: "1",
  "UNITED STATES": "1",
};

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function hsConfidenceFromScore(score?: number): "HIGH" | "MEDIUM" | "LOW" | "MISSING" {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return "MISSING";
  }
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

async function enrichInvoiceItemsWithHsCodes(
  items: Awaited<ReturnType<typeof extractInvoiceItemsFromDocument>>["items"],
  options: {
    clientAccountId?: string;
    destinationCountry: string;
  },
): Promise<{
  items: Awaited<ReturnType<typeof extractInvoiceItemsFromDocument>>["items"];
  autoMatchedHsCodeCount: number;
  hsCodeReviewCount: number;
}> {
  let autoMatchedHsCodeCount = 0;
  let hsCodeReviewCount = 0;

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      if (!item.itemName || !item.category || !item.countryOfOrigin) {
        return item;
      }

      try {
        const hsLookup = await lookupHsCode(
          {
            itemName: item.itemName,
            itemDescription: item.itemDescription || undefined,
            category: item.category,
            material: item.material || undefined,
            countryOfOrigin: item.countryOfOrigin,
            destinationCountry: options.destinationCountry,
          },
          options.clientAccountId,
        );

        const topCandidate = hsLookup.candidates[0];
        const confidence = hsConfidenceFromScore(topCandidate?.confidence);
        const shouldAutoAttach =
          Boolean(topCandidate) &&
          confidence === "HIGH" &&
          !isGenericItemName(item.itemName);

        if (shouldAutoAttach) {
          autoMatchedHsCodeCount += 1;
        } else if (topCandidate) {
          hsCodeReviewCount += 1;
        }

        return {
          ...item,
          hsCode: shouldAutoAttach ? topCandidate!.code : item.hsCode,
          hsCodeSource: hsLookup.source,
          hsCodeConfidence: confidence,
          hsCodeCandidates: hsLookup.candidates,
        };
      } catch (error) {
        logError("Invoice HS code enrichment failed", error);
        return item;
      }
    }),
  );

  return {
    items: enrichedItems,
    autoMatchedHsCodeCount,
    hsCodeReviewCount,
  };
}

function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const normalized = (fullName || "").trim();
  if (!normalized) {
    return {
      firstName: "Customer",
      lastName: "Account",
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: parts[0],
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizePhoneNumber(rawPhone: string | null | undefined, countryCodeHint?: string | null) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  const upperCountryCode = String(countryCodeHint || "").toUpperCase();
  const fallbackDialCode = COUNTRY_DIAL_CODES[upperCountryCode] || "966";

  if (!digits) {
    return undefined;
  }

  if (rawPhone?.trim().startsWith("+")) {
    const match = rawPhone.replace(/[^\d+]/g, "").match(/^\+(\d{1,4})(\d+)$/);
    if (match) {
      return {
        countryCode: match[1],
        number: match[2].replace(/^0+/, "") || match[2],
      };
    }
  }

  if (digits.startsWith(fallbackDialCode) && digits.length > fallbackDialCode.length) {
    return {
      countryCode: fallbackDialCode,
      number: digits.slice(fallbackDialCode.length).replace(/^0+/, "") || digits.slice(fallbackDialCode.length),
    };
  }

  return {
    countryCode: fallbackDialCode,
    number: digits.replace(/^0+/, "") || digits,
  };
}

function buildTapCustomer(account: ClientAccount) {
  const displayName =
    account.shippingContactName ||
    account.name ||
    account.companyName ||
    "Ezhalha Customer";
  const { firstName, lastName } = splitFullName(displayName);
  const phone = normalizePhoneNumber(
    account.shippingContactPhone || account.phone,
    account.shippingCountryCode || account.country,
  );

  return {
    ...(account.tapCustomerId ? { id: account.tapCustomerId } : {}),
    firstName,
    lastName,
    email: account.email,
    ...(phone ? { phone } : {}),
  };
}

function buildTapEmbedConfig(account: ClientAccount) {
  const customer = buildTapCustomer(account);

  return {
    configured: tapService.isConfigured(),
    embeddedCardEnabled: tapService.isEmbeddedCardConfigured(),
    hostedRedirectEnabled: tapService.isConfigured(),
    publicKey: tapService.getPublicKey() || null,
    merchantId: tapService.getMerchantId() || null,
    sdkScriptUrl: tapService.getSdkScriptUrl(),
    saveCardEnabled: tapService.isSavedCardsEnabled(),
    supportedBrands: ["VISA", "MASTERCARD", "AMERICAN_EXPRESS", "MADA"],
    locale: "en",
    customer: {
      tapCustomerId: account.tapCustomerId || null,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone || null,
    },
  };
}

function buildAppBaseUrl(req: Request): string {
  const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
  return `${protocol}://${host}`;
}

function resolveCarrierCode(carrier?: string | null): string {
  return carrier?.trim() ? carrier.trim().toUpperCase() : "FEDEX";
}

function getAdapterForShipment(shipment: Shipment): CarrierAdapter {
  return getCarrierAdapter(resolveCarrierCode(shipment.carrierCode || shipment.carrierName));
}

async function buildCarrierShipmentRequestFromShipment(
  shipment: Shipment,
  adapter: CarrierAdapter,
): Promise<{ carrierRequest: CreateShipmentRequest; tradeDocumentsData: string | null }> {
  if (adapter.carrierCode === "FEDEX") {
    return buildFedExShipmentRequestFromShipment(shipment, fedexAdapter);
  }

  if (adapter.carrierCode === "DHL") {
    return buildDhlShipmentRequestFromShipment(shipment);
  }

  throw new Error(`Carrier build is not supported for ${adapter.carrierCode}`);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const clientFinancialReconcileInFlight = new Map<string, Promise<void>>();

async function ensureShipmentBillingArtifacts(params: {
  shipment: Shipment;
  transactionId?: string | null;
  paymentMethod: string;
  invoiceStatus?: "paid" | "pending";
}) {
  const invoiceAmount = formatMoney(
    parseMoneyValue(params.shipment.clientTotalAmountSar ?? params.shipment.finalPrice),
  );
  const shouldMarkPaid = params.invoiceStatus !== "pending";

  let invoice = await storage.getInvoiceByShipmentId(params.shipment.id);
  if (!invoice) {
    invoice = await storage.createInvoice({
      clientAccountId: params.shipment.clientAccountId,
      shipmentId: params.shipment.id,
      invoiceType: InvoiceType.SHIPMENT,
      description: buildShipmentInvoiceDescription(params.shipment),
      amount: invoiceAmount,
      status: shouldMarkPaid ? "paid" : "pending",
      dueDate: shouldMarkPaid ? new Date() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  if (shouldMarkPaid && (!invoice.paidAt || invoice.status !== "paid")) {
    invoice =
      (await storage.updateInvoice(invoice.id, {
        status: "paid",
        paidAt: new Date(),
      })) || invoice;
  }

  if (!shouldMarkPaid || !params.transactionId) {
    return invoice;
  }

  const payments = await storage.getPaymentsByClientAccount(params.shipment.clientAccountId);
  const existingCompletedPayment = payments.find(
    (payment) =>
      payment.invoiceId === invoice.id &&
      payment.transactionId === params.transactionId &&
      payment.status === "completed",
  );

  if (existingCompletedPayment) {
    return invoice;
  }

  const existingPendingPayment = payments.find(
    (payment) =>
      payment.invoiceId === invoice.id &&
      payment.status === "pending" &&
      (!payment.transactionId || payment.transactionId === params.transactionId),
  );

  if (existingPendingPayment) {
    await storage.updatePayment(existingPendingPayment.id, {
      status: "completed",
      paymentMethod: params.paymentMethod,
      transactionId: params.transactionId,
    });
    return invoice;
  }

  await storage.createPayment({
    invoiceId: invoice.id,
    clientAccountId: params.shipment.clientAccountId,
    amount: invoiceAmount,
    paymentMethod: params.paymentMethod,
    status: "completed",
    transactionId: params.transactionId,
  });

  return invoice;
}

async function finalizePaidShipmentAfterPayment(params: {
  shipment: Shipment;
  transactionId?: string | null;
  paymentMethod: string;
  userId?: string;
  ipAddress?: string;
}) {
  const { shipment, transactionId, paymentMethod, userId, ipAddress } = params;

  if (shipment.status === "cancelled") {
    throw new Error("Cancelled shipments cannot be finalized");
  }

  if (shipment.status === "created" && shipment.carrierTrackingNumber) {
    const updatedShipment =
      shipment.paymentStatus !== "paid"
        ? ((await storage.updateShipment(shipment.id, { paymentStatus: "paid" })) || shipment)
        : shipment;

    await ensureShipmentBillingArtifacts({
      shipment: updatedShipment,
      transactionId,
      paymentMethod,
      invoiceStatus: "paid",
    });

    return updatedShipment;
  }

  const confirmAddrValidation = validateShippingAddresses(
    {
      countryCode: shipment.senderCountry,
      city: shipment.senderCity,
      addressLine1: shipment.senderAddress,
      postalCode: shipment.senderPostalCode || "",
      phone: shipment.senderPhone,
      stateOrProvince: shipment.senderStateOrProvince || "",
    },
    {
      countryCode: shipment.recipientCountry,
      city: shipment.recipientCity,
      addressLine1: shipment.recipientAddress,
      postalCode: shipment.recipientPostalCode || "",
      phone: shipment.recipientPhone,
      stateOrProvince: shipment.recipientStateOrProvince || "",
    },
  );
  if (!confirmAddrValidation.valid) {
    throw new Error(confirmAddrValidation.errors.join("; "));
  }

  let latestShipment = shipment;
  const carrierAdapter = getAdapterForShipment(latestShipment);

  try {
    const preparedShipment = await buildCarrierShipmentRequestFromShipment(latestShipment, carrierAdapter);
    if (preparedShipment.tradeDocumentsData !== latestShipment.tradeDocumentsData) {
      latestShipment =
        (await storage.updateShipment(latestShipment.id, {
          tradeDocumentsData: preparedShipment.tradeDocumentsData,
        })) || latestShipment;
    }

    const carrierResponse = await carrierAdapter.createShipment(preparedShipment.carrierRequest);
    const updatedShipment =
      (await storage.updateShipment(latestShipment.id, {
        status: "created",
        paymentStatus: "paid",
        carrierStatus: "created",
        carrierTrackingNumber: carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber,
        carrierShipmentId: carrierResponse.trackingNumber,
        labelUrl: carrierResponse.labelUrl,
        carrierLabelBase64: carrierResponse.labelData || null,
        carrierLabelMimeType: "application/pdf",
        carrierLabelFormat: "PDF",
        estimatedDelivery: carrierResponse.estimatedDelivery,
        carrierLastAttemptAt: new Date(),
        carrierAttempts: (latestShipment.carrierAttempts || 0) + 1,
      })) || latestShipment;

    await ensureShipmentBillingArtifacts({
      shipment: updatedShipment,
      transactionId,
      paymentMethod,
      invoiceStatus: "paid",
    });

    await logAudit(
      userId,
      "confirm_shipment",
      "shipment",
      updatedShipment.id,
      `Confirmed shipment ${updatedShipment.trackingNumber} with carrier tracking ${carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber}`,
      ipAddress,
    );

    return updatedShipment;
  } catch (carrierError) {
    const isCarrierErr = carrierError instanceof CarrierError;
    const errCode = isCarrierErr ? carrierError.code : "UNKNOWN";
    const errMsg = isCarrierErr ? carrierError.carrierMessage : (carrierError as Error).message;

    await storage.updateShipment(latestShipment.id, {
      status: "carrier_error",
      carrierStatus: "error",
      carrierErrorCode: errCode,
      carrierErrorMessage: errMsg,
      carrierLastAttemptAt: new Date(),
      carrierAttempts: (latestShipment.carrierAttempts || 0) + 1,
      paymentStatus: "paid",
    });

    throw carrierError;
  }
}

async function reconcilePaidShipmentsForClientAccount(clientAccountId: string, ipAddress?: string) {
  const existingRun = clientFinancialReconcileInFlight.get(clientAccountId);
  if (existingRun) {
    return existingRun;
  }

  const runPromise = (async () => {
    const [shipments, invoices, payments] = await Promise.all([
      storage.getShipmentsByClientAccount(clientAccountId),
      storage.getInvoicesByClientAccount(clientAccountId),
      storage.getPaymentsByClientAccount(clientAccountId),
    ]);

    const invoiceByShipmentId = new Map(
      invoices
        .filter((invoice) => Boolean(invoice.shipmentId))
        .map((invoice) => [invoice.shipmentId!, invoice] as const),
    );
    const completedPaymentInvoiceIds = new Set(
      payments
        .filter((payment) => payment.status === "completed")
        .map((payment) => payment.invoiceId),
    );

    for (const shipment of shipments) {
      if (shipment.status === "cancelled" || shipment.paymentStatus !== "paid" || shipment.paymentMethod === "CREDIT") {
        continue;
      }

      const existingInvoice = invoiceByShipmentId.get(shipment.id);
      const paymentMethod = shipment.paymentMethod === "CREDIT" ? "credit" : "tap";
      const needsCarrierFinalization =
        shipment.status === "payment_pending" ||
        (shipment.status === "carrier_error" && !shipment.carrierTrackingNumber) ||
        (shipment.status === "created" && !shipment.carrierTrackingNumber);
      const needsBillingArtifacts =
        !existingInvoice ||
        existingInvoice.status !== "paid" ||
        !existingInvoice.paidAt ||
        (shipment.paymentIntentId ? !completedPaymentInvoiceIds.has(existingInvoice.id) : false);

      if (!needsCarrierFinalization && !needsBillingArtifacts) {
        continue;
      }

      try {
        if (needsCarrierFinalization) {
          const finalizedShipment = await finalizePaidShipmentAfterPayment({
            shipment,
            transactionId: shipment.paymentIntentId,
            paymentMethod,
            ipAddress,
          });

          const refreshedInvoice = await storage.getInvoiceByShipmentId(finalizedShipment.id);
          if (refreshedInvoice) {
            invoiceByShipmentId.set(finalizedShipment.id, refreshedInvoice);
            if (shipment.paymentIntentId) {
              completedPaymentInvoiceIds.add(refreshedInvoice.id);
            }
          }
          continue;
        }

        const reconciledInvoice = await ensureShipmentBillingArtifacts({
          shipment,
          transactionId: shipment.paymentIntentId,
          paymentMethod,
          invoiceStatus: "paid",
        });
        invoiceByShipmentId.set(shipment.id, reconciledInvoice);
        if (shipment.paymentIntentId) {
          completedPaymentInvoiceIds.add(reconciledInvoice.id);
        }
      } catch (error) {
        logError("Failed to reconcile paid client shipment", {
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const shipment of shipments) {
      if (shipment.status === "cancelled") {
        continue;
      }

      const derivedExtraFees = getShipmentExtraFeeComponents(shipment);
      if (derivedExtraFees.length === 0) {
        continue;
      }

      try {
        await syncShipmentExtraFeeInvoices(shipment);
      } catch (error) {
        logError("Failed to reconcile shipment extra fee invoices", {
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  })()
    .finally(() => {
      clientFinancialReconcileInFlight.delete(clientAccountId);
    });

  clientFinancialReconcileInFlight.set(clientAccountId, runPromise);
  return runPromise;
}

async function processTapShipmentCharge(charge: TapCharge, ipAddress?: string) {
  const shipmentId = charge.metadata?.shipmentId;
  const shipment =
    (shipmentId ? await storage.getShipment(shipmentId) : undefined) ||
    (charge.id ? await storage.getShipmentByPaymentId(charge.id) : undefined);

  if (!shipment) {
    return;
  }

  const updates: Record<string, any> = {};
  if (shipment.paymentIntentId !== charge.id) {
    updates.paymentIntentId = charge.id;
  }

  if (tapService.isSuccessfulStatus(charge.status) && shipment.paymentStatus !== "paid") {
    updates.paymentStatus = "paid";
  } else if (tapService.isFailureStatus(charge.status) && shipment.paymentStatus !== "failed") {
    updates.paymentStatus = "failed";
  }

  let latestShipment = shipment;
  if (Object.keys(updates).length > 0) {
    latestShipment = (await storage.updateShipment(shipment.id, updates)) || shipment;
    await logAudit(
      undefined,
      "tap_charge_update",
      "shipment",
      shipment.id,
      `Tap payment updated shipment ${shipment.trackingNumber} to ${charge.status}`,
      ipAddress,
    );
  }

  if (tapService.isSuccessfulStatus(charge.status)) {
    await finalizePaidShipmentAfterPayment({
      shipment: latestShipment,
      transactionId: charge.id,
      paymentMethod: "tap",
      userId: undefined,
      ipAddress,
    });
  }
}

async function processTapInvoiceCharge(charge: TapCharge, ipAddress?: string) {
  const invoiceId = charge.metadata?.invoiceId;
  if (!invoiceId) {
    return;
  }

  const invoice = await storage.getInvoice(invoiceId);
  if (!invoice) {
    return;
  }

  const payments = await storage.getPaymentsByClientAccount(invoice.clientAccountId);
  const matchingPayment =
    payments.find((payment) => payment.invoiceId === invoice.id && payment.transactionId === charge.id) ||
    payments.find((payment) => payment.invoiceId === invoice.id && payment.status === "pending");

  if (tapService.isSuccessfulStatus(charge.status)) {
    if (invoice.status !== "paid") {
      await storage.updateInvoice(invoice.id, { status: "paid", paidAt: new Date() });
    }

    if (matchingPayment) {
      await storage.updatePayment(matchingPayment.id, {
        status: "completed",
        paymentMethod: "tap",
        transactionId: charge.id,
      });
    } else {
      await storage.createPayment({
        invoiceId: invoice.id,
        clientAccountId: invoice.clientAccountId,
        amount: formatMoney(Number(charge.amount || invoice.amount)),
        paymentMethod: "tap",
        transactionId: charge.id,
        status: "completed",
      });
    }

    await logAudit(
      undefined,
      "tap_charge_update",
      "invoice",
      invoice.id,
      `Tap payment completed for invoice ${invoice.invoiceNumber}`,
      ipAddress,
    );
    return;
  }

  if (tapService.isFailureStatus(charge.status) && matchingPayment && matchingPayment.status !== "failed") {
    await storage.updatePayment(matchingPayment.id, {
      status: "failed",
      paymentMethod: "tap",
      transactionId: charge.id,
    });
  }
}

async function syncTapSavedCardFromCharge(charge: TapCharge) {
  if (!tapService.isSuccessfulStatus(charge.status)) {
    return;
  }

  const clientAccountId = charge.metadata?.clientAccountId;
  if (!clientAccountId) {
    return;
  }

  const tapCustomerId = charge.customer?.id;
  const tapCardId = charge.card?.id;

  if (!tapCustomerId && !tapCardId) {
    return;
  }

  const clientAccount = await storage.getClientAccount(clientAccountId);
  if (!clientAccount) {
    return;
  }

  if (tapCustomerId && clientAccount.tapCustomerId !== tapCustomerId) {
    await storage.updateClientAccount(clientAccountId, {
      tapCustomerId,
    });
  }

  if (!tapCustomerId || !tapCardId) {
    return;
  }

  const existingCard = await storage.getTapSavedCardByTapCardId(clientAccountId, tapCardId);
  const baseCardFields = {
    clientAccountId,
    tapCustomerId,
    tapCardId,
    paymentAgreementId: charge.payment_agreement?.id || null,
    brand: charge.card?.brand || null,
    scheme: charge.card?.scheme || null,
    funding: charge.card?.funding || null,
    lastFour: charge.card?.last_four || null,
    firstSix: charge.card?.first_six || null,
    firstEight: charge.card?.first_eight || null,
    expMonth: charge.card?.exp_month ?? null,
    expYear: charge.card?.exp_year ?? null,
    cardholderName: charge.card?.name || null,
    fingerprint: charge.card?.fingerprint || null,
    status: "active",
  };

  if (existingCard) {
    await storage.updateTapSavedCard(existingCard.id, {
      ...baseCardFields,
      deletedAt: null,
    });
    return;
  }

  const activeCards = await storage.getTapSavedCardsByClientAccount(clientAccountId);
  await storage.createTapSavedCard({
    ...baseCardFields,
    isDefault: activeCards.length === 0,
  });
}

async function processTapChargeUpdate(charge: TapCharge, ipAddress?: string) {
  await syncTapSavedCardFromCharge(charge);
  await processTapShipmentCharge(charge, ipAddress);
  await processTapInvoiceCharge(charge, ipAddress);
}

function getShipmentAccountingInsert(snapshot: ReturnType<typeof calculateShipmentAccounting>) {
  return {
    isDdp: snapshot.isDdp,
    accountingCurrency: snapshot.accountingCurrency,
    taxScenario: snapshot.taxScenario,
    costAmountSar: formatMoney(snapshot.costAmountSar),
    costTaxAmountSar: formatMoney(snapshot.costTaxAmountSar),
    sellSubtotalAmountSar: formatMoney(snapshot.sellSubtotalAmountSar),
    sellTaxAmountSar: formatMoney(snapshot.sellTaxAmountSar),
    clientTotalAmountSar: formatMoney(snapshot.clientTotalAmountSar),
    systemCostTotalAmountSar: formatMoney(snapshot.systemCostTotalAmountSar),
    taxPayableAmountSar: formatMoney(snapshot.taxPayableAmountSar),
    revenueExcludingTaxAmountSar: formatMoney(snapshot.revenueExcludingTaxAmountSar),
  };
}

function parseMoneyValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value) || 0;
}

function isSameMonthYear(date: Date, month: number, year: number): boolean {
  return date.getMonth() + 1 === month && date.getFullYear() === year;
}

function buildMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function parseDateParam(value: string | undefined, options?: { endOfDay?: boolean }): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  const day = Number(dayString);
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  if (options?.endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function isWithinDateRange(date: Date, startDate: Date | null, endDate: Date | null): boolean {
  if (startDate && date.getTime() < startDate.getTime()) {
    return false;
  }

  if (endDate && date.getTime() > endDate.getTime()) {
    return false;
  }

  return true;
}

function buildMonthSequence(startDate: Date, endDate: Date): Date[] {
  if (startDate.getTime() > endDate.getTime()) {
    return [];
  }

  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const months: Date[] = [];

  while (cursor.getTime() <= lastMonth.getTime()) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function matchesClientPaymentFilter(
  shipment: Record<string, any>,
  clientPaymentStatus: "all" | "paid" | "not_paid",
): boolean {
  if (clientPaymentStatus === "all") {
    return true;
  }

  return clientPaymentStatus === "paid"
    ? shipment.paymentStatus === "paid"
    : shipment.paymentStatus !== "paid";
}

function matchesCarrierPaymentFilter(
  shipment: Record<string, any>,
  carrierPaymentStatus: "all" | "paid" | "not_paid",
): boolean {
  if (carrierPaymentStatus === "all") {
    return true;
  }

  return carrierPaymentStatus === "paid"
    ? shipment.carrierPaymentStatus === CarrierPaymentStatus.PAID
    : shipment.carrierPaymentStatus !== CarrierPaymentStatus.PAID;
}

function parseFinancialSearchTerms(search: string | undefined): string[] {
  const trimmed = search?.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const tokenized = trimmed
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return tokenized.length > 1 ? tokenized : [trimmed];
}

function aggregateAccounting(shipments: Array<Record<string, any>>) {
  return shipments.reduce(
    (acc, shipment) => {
      const effective = getEffectiveShipmentFinancials(shipment);
      acc.totalShipments += 1;
      acc.costAmountSar += effective.costAmountSar;
      acc.costTaxAmountSar += effective.costTaxAmountSar;
      acc.sellSubtotalAmountSar += effective.sellSubtotalAmountSar;
      acc.sellTaxAmountSar += effective.sellTaxAmountSar;
      acc.clientTotalAmountSar += effective.clientTotalAmountSar;
      acc.systemCostTotalAmountSar += effective.systemCostTotalAmountSar;
      acc.taxPayableAmountSar += effective.taxPayableAmountSar;
      acc.revenueExcludingTaxAmountSar += effective.revenueExcludingTaxAmountSar;
      acc.marginAmountSar += effective.marginAmountSar;
      acc.netProfitAmountSar += effective.netProfitAmountSar;

      const scenarioKey = shipment.taxScenario || "UNKNOWN";
      acc.scenarioCounts[scenarioKey] = (acc.scenarioCounts[scenarioKey] || 0) + 1;
      return acc;
    },
    {
      totalShipments: 0,
      costAmountSar: 0,
      costTaxAmountSar: 0,
      sellSubtotalAmountSar: 0,
      sellTaxAmountSar: 0,
      clientTotalAmountSar: 0,
      systemCostTotalAmountSar: 0,
      taxPayableAmountSar: 0,
      revenueExcludingTaxAmountSar: 0,
      marginAmountSar: 0,
      netProfitAmountSar: 0,
      scenarioCounts: {} as Record<string, number>,
    },
  );
}

function getExtraFeesRateSarPerWeight(shipment: Record<string, any>): number {
  const grossTotalAmountSar = parseMoneyValue(
    shipment.clientTotalAmountSar ?? shipment.finalPrice,
  );
  const weightValue = parseMoneyValue(shipment.weight);

  if (weightValue <= 0) {
    return 0;
  }

  return roundMoney(grossTotalAmountSar / weightValue);
}

function deriveShipmentExtraFees(shipment: Record<string, any>) {
  const storedType = typeof shipment.extraFeesType === "string" ? shipment.extraFeesType : null;
  const storedTotalAmountSar = parseMoneyValue(shipment.extraFeesAmountSar);
  const extraFeesWeightValue = parseMoneyValue(shipment.extraFeesWeightValue);
  const extraFeesRateSarPerWeight = getExtraFeesRateSarPerWeight(shipment);
  const extraWeightAmountSar = extraFeesWeightValue > 0
    ? roundMoney(extraFeesWeightValue * extraFeesRateSarPerWeight)
    : 0;

  const explicitExtraCostAmountSar = parseMoneyValue(shipment.extraFeesCostAmountSar);
  const extraFeesCostAmountSar =
    explicitExtraCostAmountSar > 0
      ? explicitExtraCostAmountSar
      : storedType === ShipmentExtraFeeType.EXTRA_COST && storedTotalAmountSar > 0
        ? storedTotalAmountSar
        : 0;

  const extraFeesAmountSar =
    extraWeightAmountSar > 0 || extraFeesCostAmountSar > 0
      ? roundMoney(extraWeightAmountSar + extraFeesCostAmountSar)
      : storedTotalAmountSar;

  let extraFeesType: string | null = null;
  if (extraWeightAmountSar > 0 && extraFeesCostAmountSar > 0) {
    extraFeesType = ShipmentExtraFeeType.COMBINED;
  } else if (extraWeightAmountSar > 0) {
    extraFeesType = ShipmentExtraFeeType.EXTRA_WEIGHT;
  } else if (extraFeesCostAmountSar > 0) {
    extraFeesType = ShipmentExtraFeeType.EXTRA_COST;
  } else if (storedType && storedTotalAmountSar > 0) {
    extraFeesType = storedType;
  }

  return {
    extraFeesType,
    extraFeesAmountSar,
    extraFeesWeightValue,
    extraWeightAmountSar,
    extraFeesCostAmountSar,
    extraFeesRateSarPerWeight,
  };
}

function getEffectiveShipmentFinancials(shipment: Record<string, any>) {
  const isCancelled = shipment.status === "cancelled";
  const derivedExtraFees = isCancelled
    ? {
        extraFeesType: null,
        extraFeesAmountSar: 0,
        extraFeesWeightValue: 0,
        extraWeightAmountSar: 0,
        extraFeesCostAmountSar: 0,
        extraFeesRateSarPerWeight: 0,
      }
    : deriveShipmentExtraFees(shipment);
  const baseCostAmountSar = isCancelled ? 0 : parseMoneyValue(shipment.costAmountSar);
  const costTaxAmountSar = isCancelled ? 0 : parseMoneyValue(shipment.costTaxAmountSar);
  const sellSubtotalAmountSar = isCancelled ? 0 : parseMoneyValue(shipment.sellSubtotalAmountSar);
  const sellTaxAmountSar = isCancelled ? 0 : parseMoneyValue(shipment.sellTaxAmountSar);
  const clientTotalAmountSar = isCancelled
    ? 0
    : parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice);
  const revenueExcludingTaxAmountSar = isCancelled
    ? 0
    : parseMoneyValue(shipment.revenueExcludingTaxAmountSar);
  const marginAmountSar = isCancelled ? 0 : parseMoneyValue(shipment.margin);
  const weightValue = parseMoneyValue(shipment.weight);
  const costAmountSar = isCancelled
    ? 0
    : roundMoney(baseCostAmountSar + derivedExtraFees.extraFeesCostAmountSar);
  const systemCostTotalAmountSar = isCancelled
    ? 0
    : roundMoney(costAmountSar + costTaxAmountSar);
  const taxPayableAmountSar = isCancelled ? 0 : parseMoneyValue(shipment.taxPayableAmountSar);
  const netProfitAmountSar = isCancelled
    ? 0
    : roundMoney(revenueExcludingTaxAmountSar - costAmountSar);

  return {
    isCancelled,
    costAmountSar,
    costTaxAmountSar,
    sellSubtotalAmountSar,
    sellTaxAmountSar,
    clientTotalAmountSar,
    systemCostTotalAmountSar,
    taxPayableAmountSar,
    revenueExcludingTaxAmountSar,
    marginAmountSar,
    extraFeesType: derivedExtraFees.extraFeesType,
    extraFeesAmountSar: derivedExtraFees.extraFeesAmountSar,
    extraFeesWeightValue: derivedExtraFees.extraFeesWeightValue,
    extraWeightAmountSar: derivedExtraFees.extraWeightAmountSar,
    extraFeesCostAmountSar: derivedExtraFees.extraFeesCostAmountSar,
    extraFeesRateSarPerWeight: derivedExtraFees.extraFeesRateSarPerWeight,
    netProfitAmountSar,
    weightValue,
  };
}

function serializeFinancialShipment(
  shipment: Record<string, any>,
  client?: { name?: string | null; accountNumber?: string | null } | null,
  relatedInvoices: Invoice[] = [],
) {
  const effective = getEffectiveShipmentFinancials(shipment);
  const carrierPaymentAmountSar =
    shipment.carrierPaymentStatus === CarrierPaymentStatus.PAID
      ? parseMoneyValue(shipment.carrierPaymentAmountSar ?? shipment.systemCostTotalAmountSar)
      : parseMoneyValue(shipment.carrierPaymentAmountSar);
  const extraWeightPaidAmountSar = roundMoney(
    relatedInvoices
      .filter(
        (invoice) =>
          invoice.invoiceType === InvoiceType.EXTRA_WEIGHT &&
          invoice.status === "paid" &&
          !invoice.deletedAt,
      )
      .reduce((sum, invoice) => sum + parseMoneyValue(invoice.amount), 0),
  );
  const extraWeightOutstandingAmountSar = roundMoney(
    Math.max(effective.extraWeightAmountSar - extraWeightPaidAmountSar, 0),
  );
  const isExtraWeightPaid =
    effective.extraWeightAmountSar > 0 && extraWeightOutstandingAmountSar <= 0;
  const extraWeightPendingInvoice = relatedInvoices.find(
    (invoice) =>
      invoice.invoiceType === InvoiceType.EXTRA_WEIGHT &&
      invoice.status !== "paid" &&
      !invoice.deletedAt,
  );
  const extraWeightInvoiceStatus =
    effective.extraWeightAmountSar <= 0
      ? null
      : isExtraWeightPaid
        ? "paid"
        : extraWeightPendingInvoice?.status || "pending";

  return {
    ...shipment,
    clientName: client?.name || "Unknown Client",
    clientAccountNumber: client?.accountNumber || null,
    costAmountSar: effective.costAmountSar,
    costTaxAmountSar: effective.costTaxAmountSar,
    sellSubtotalAmountSar: effective.sellSubtotalAmountSar,
    sellTaxAmountSar: effective.sellTaxAmountSar,
    clientTotalAmountSar: effective.clientTotalAmountSar,
    systemCostTotalAmountSar: effective.systemCostTotalAmountSar,
    taxPayableAmountSar: effective.taxPayableAmountSar,
    revenueExcludingTaxAmountSar: effective.revenueExcludingTaxAmountSar,
    extraFeesAmountSar: effective.extraFeesAmountSar,
    extraFeesType: effective.extraFeesType,
    extraFeesWeightValue: effective.extraFeesWeightValue,
    extraFeesCostAmountSar: effective.extraFeesCostAmountSar,
    extraWeightAmountSar: effective.extraWeightAmountSar,
    extraFeesRateSarPerWeight: effective.extraFeesRateSarPerWeight,
    extraFeesAddedAt: shipment.extraFeesAddedAt,
    extraFeesEmailSentAt: shipment.extraFeesEmailSentAt,
    extraWeightInvoiceStatus,
    isExtraWeightPaid,
    netProfitAmountSar: effective.netProfitAmountSar,
    weightValue: effective.weightValue,
    carrierTrackingId: shipment.carrierTrackingNumber || null,
    carrierPaymentAmountSar,
    carrierPaymentReference: shipment.carrierPaymentReference || null,
    carrierPaymentNote: shipment.carrierPaymentNote || null,
    isCancelledFinancially: effective.isCancelled,
    isClientPaid: shipment.paymentStatus === "paid",
    isCarrierPaid: shipment.carrierPaymentStatus === CarrierPaymentStatus.PAID,
    canMarkPaid: shipment.status !== "cancelled" && shipment.paymentStatus !== "paid",
    canMarkCarrierPaid:
      shipment.status !== "cancelled" &&
      shipment.carrierPaymentStatus !== CarrierPaymentStatus.PAID &&
      Boolean(shipment.carrierTrackingNumber),
    canViewCarrierPayment: shipment.carrierPaymentStatus === CarrierPaymentStatus.PAID,
    canCancel: shipment.status !== "cancelled" && shipment.status !== "delivered",
  };
}

function serializeCarrierPaymentTransaction(
  shipment: Record<string, any>,
  client?: { name?: string | null; accountNumber?: string | null } | null,
) {
  const effective = getEffectiveShipmentFinancials(shipment);

  return {
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    carrierTrackingId: shipment.carrierTrackingNumber || null,
    clientName: client?.name || "Unknown Client",
    clientAccountNumber: client?.accountNumber || null,
    carrierCode: shipment.carrierCode || null,
    carrierName: shipment.carrierName || shipment.carrierCode || "Unknown Carrier",
    taxScenario: shipment.taxScenario || null,
    carrierCostAmountSar: effective.costAmountSar,
    carrierTaxAmountSar: effective.costTaxAmountSar,
    carrierPaymentAmountSar: parseMoneyValue(
      shipment.carrierPaymentAmountSar ?? effective.systemCostTotalAmountSar,
    ),
    carrierPaymentReference: shipment.carrierPaymentReference || null,
    carrierPaymentNote: shipment.carrierPaymentNote || null,
    carrierPaidAt: shipment.carrierPaidAt,
    createdAt: shipment.createdAt,
  };
}

function getCarrierPayoutKey(shipment: Record<string, any>): string | null {
  const carrierName = shipment.carrierName?.trim();
  const carrierCode = shipment.carrierCode?.trim();

  if (!carrierName && !carrierCode) {
    return null;
  }

  return carrierCode || carrierName || null;
}

function isCarrierPayoutEligible(shipment: Record<string, any>, month: number, year: number): boolean {
  return (
    shipment.taxScenario &&
    shipment.accountingCurrency === "SAR" &&
    isSameMonthYear(new Date(shipment.createdAt), month, year) &&
    shipment.status !== "cancelled" &&
    shipment.carrierPaymentStatus === CarrierPaymentStatus.UNPAID &&
    Boolean(shipment.carrierTrackingNumber) &&
    Boolean(getCarrierPayoutKey(shipment))
  );
}

function buildCarrierPayoutCandidates(shipments: Array<Record<string, any>>) {
  const grouped = new Map<
    string,
    {
      carrierKey: string;
      carrierCode: string | null;
      carrierName: string;
      eligibleShipmentCount: number;
      totalCarrierCostSar: number;
      totalCostTaxSar: number;
      totalCarrierCostWithTaxSar: number;
    }
  >();

  for (const shipment of shipments) {
    const carrierKey = getCarrierPayoutKey(shipment);
    if (!carrierKey) {
      continue;
    }

    const effective = getEffectiveShipmentFinancials(shipment);
    const existing = grouped.get(carrierKey) || {
      carrierKey,
      carrierCode: shipment.carrierCode || null,
      carrierName: shipment.carrierName || shipment.carrierCode || "Unknown Carrier",
      eligibleShipmentCount: 0,
      totalCarrierCostSar: 0,
      totalCostTaxSar: 0,
      totalCarrierCostWithTaxSar: 0,
    };

    existing.eligibleShipmentCount += 1;
    existing.totalCarrierCostSar += effective.costAmountSar;
    existing.totalCostTaxSar += effective.costTaxAmountSar;
    existing.totalCarrierCostWithTaxSar += effective.systemCostTotalAmountSar;
    grouped.set(carrierKey, existing);
  }

  return Array.from(grouped.values())
    .map((candidate) => ({
      ...candidate,
      totalCarrierCostSar: roundMoney(candidate.totalCarrierCostSar),
      totalCostTaxSar: roundMoney(candidate.totalCostTaxSar),
      totalCarrierCostWithTaxSar: roundMoney(candidate.totalCarrierCostWithTaxSar),
    }))
    .sort((a, b) => a.carrierName.localeCompare(b.carrierName));
}

// Rate limiter for general API requests
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: { error: "Too many login attempts, please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

const hsLookupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: "Too many HS code lookup requests, please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

const fedexApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: "Too many FedEx API requests, please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

const serviceOptionsCache = new Map<string, { data: any; expiresAt: number }>();
const SERVICE_OPTIONS_CACHE_TTL = 10 * 60 * 1000;


// Track failed login attempts for additional brute-force protection
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: number }>();

function checkBruteForce(identifier: string): { blocked: boolean; remainingTime?: number } {
  const now = Date.now();
  const maxAttempts = 5;
  const lockoutTime = 15 * 60 * 1000; // 15 minutes
  
  const attempts = failedLoginAttempts.get(identifier);
  if (!attempts) return { blocked: false };
  
  // Reset if lockout period has passed
  if (now - attempts.lastAttempt > lockoutTime) {
    failedLoginAttempts.delete(identifier);
    return { blocked: false };
  }
  
  if (attempts.count >= maxAttempts) {
    return { 
      blocked: true, 
      remainingTime: Math.ceil((lockoutTime - (now - attempts.lastAttempt)) / 1000) 
    };
  }
  
  return { blocked: false };
}

function recordFailedLogin(identifier: string) {
  const now = Date.now();
  const attempts = failedLoginAttempts.get(identifier);
  
  if (attempts) {
    attempts.count++;
    attempts.lastAttempt = now;
  } else {
    failedLoginAttempts.set(identifier, { count: 1, lastAttempt: now });
  }
}

function clearFailedLogins(identifier: string) {
  failedLoginAttempts.delete(identifier);
}
import {
  loginSchema,
  applicationFormSchema,
  createShipmentSchema,
  type BrandingConfig,
  type AdminDashboardStats,
  type ClientDashboardStats,
} from "@shared/schema";
import { z } from "zod";

// Password change validation schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const createAdminUserSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleIds: z.array(z.string().min(1)).default([]),
  accountManagerClientIds: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});

const createAccountManagerSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  clientAccountIds: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});

const replaceAccountManagerAssignmentsSchema = z.object({
  clientAccountIds: z.array(z.string().min(1)).default([]),
});

const reviewAccountManagerChangeRequestSchema = z.object({
  adminNotes: z.string().trim().max(2000, "Admin notes must be 2000 characters or fewer").optional(),
});
import MemoryStore from "memorystore";
import pgSession from "connect-pg-simple";
import pg from "pg";
import { registerObjectStorageRoutes } from "./integrations/storage";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    currentUser?: User;
    currentClientAccount?: ClientAccount;
  }
}

const MemoryStoreSession = MemoryStore(session);
const PgSessionStore = pgSession(session);

function clearSession(req: Request) {
  req.currentUser = undefined;
  req.currentClientAccount = undefined;
  req.session.destroy(() => {});
}

async function ensureLegacyClientPrimaryContact(user: User): Promise<User> {
  if (user.userType !== "client" || !user.clientAccountId || user.isPrimaryContact) {
    return user;
  }

  const accountUsers = await storage.getUsersByClientAccount(user.clientAccountId);
  const activeClientUsers = accountUsers.filter(
    (accountUser) => accountUser.userType === "client" && accountUser.isActive,
  );

  if (activeClientUsers.length !== 1 || activeClientUsers[0].id !== user.id) {
    return user;
  }

  const existingPermissions = await storage.getClientUserPermissions(user.id, user.clientAccountId);
  if (existingPermissions) {
    return user;
  }

  const promotedUser = await storage.updateUser(user.id, {
    isPrimaryContact: true,
    updatedAt: new Date(),
  });

  if (promotedUser) {
    logInfo("Promoted legacy single client user to primary contact", {
      userId: promotedUser.id,
      clientAccountId: promotedUser.clientAccountId,
    });
    return promotedUser;
  }

  return user;
}

async function ensureAuthenticatedUser(req: Request, res: Response): Promise<User | null> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (!req.currentUser) {
    req.currentUser = await storage.getUser(req.session.userId);
  }

  let user = req.currentUser;
  if (!user) {
    clearSession(req);
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (!user.isActive) {
    clearSession(req);
    res.status(403).json({ error: "Account is deactivated" });
    return null;
  }

  if (user.userType === "client") {
    user = await ensureLegacyClientPrimaryContact(user);
    req.currentUser = user;

    if (!user.clientAccountId) {
      clearSession(req);
      res.status(404).json({ error: "Client account not found" });
      return null;
    }

    if (!req.currentClientAccount) {
      req.currentClientAccount = await storage.getClientAccount(user.clientAccountId);
    }

    if (!req.currentClientAccount || !req.currentClientAccount.isActive) {
      clearSession(req);
      res.status(403).json({ error: "Client account is deactivated" });
      return null;
    }
  }

  return user;
}

// Middleware to check authentication
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) {
    return;
  }
  next();
}

async function ensureAdminAccess(req: Request, res: Response): Promise<User | null> {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) {
    return null;
  }

  if (user.userType !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return user;
}

async function ensureAdminPermission(
  req: Request,
  res: Response,
  resource: string,
  action: string,
): Promise<User | null> {
  const user = await ensureAdminAccess(req, res);
  if (!user) {
    return null;
  }

  const permissionName = `${resource}:${action}`;
  const permissionNames = await getEffectiveAdminPermissionNames(user);
  const hasPermission = permissionNames.includes(permissionName);

  if (!hasPermission) {
    res.status(403).json({ error: "Permission denied" });
    return null;
  }

  return user;
}

// Middleware to check admin role
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await ensureAdminAccess(req, res);
  if (!user) {
    return;
  }
  next();
}

function requireAdminPermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await ensureAdminPermission(req, res, resource, action);
    if (!user) {
      return;
    }
    next();
  };
}

type AdminUserSummary = Pick<
  User,
  | "id"
  | "username"
  | "email"
  | "userType"
  | "isActive"
  | "isAccountManager"
  | "mustChangePassword"
  | "createdAt"
  | "updatedAt"
> & {
  roles: Role[];
  assignedClients?: Array<Pick<ClientAccount, "id" | "accountNumber" | "name" | "profile" | "isActive">>;
};

function serializeAdminUser(user: User, assignedRoles: Role[]): AdminUserSummary {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    userType: user.userType,
    isActive: user.isActive,
    isAccountManager: user.isAccountManager,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: [...assignedRoles].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

type AccountManagerSummary = AdminUserSummary & {
  assignedClients: Array<Pick<ClientAccount, "id" | "accountNumber" | "name" | "profile" | "isActive">>;
};

type AssignedAccountManagerSummary = Pick<User, "id" | "username" | "email">;

type AdminClientSummary = ClientAccount & {
  assignedAccountManager?: AssignedAccountManagerSummary | null;
};

function isAccountManagerSystemRoleId(roleId: string): boolean {
  return roleId === ACCOUNT_MANAGER_SYSTEM_ROLE_ID;
}

function isSystemRoleId(roleId: string): boolean {
  return isAccountManagerSystemRoleId(roleId);
}

function buildAccountManagerSystemRole(): Role {
  return {
    id: ACCOUNT_MANAGER_SYSTEM_ROLE_ID,
    name: ACCOUNT_MANAGER_SYSTEM_ROLE_NAME,
    description: ACCOUNT_MANAGER_SYSTEM_ROLE_DESCRIPTION,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function mergeRolesWithSystemRoles(roles: Role[]): Role[] {
  const mergedRoles = [...roles];

  if (!mergedRoles.some((role) => role.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID)) {
    mergedRoles.push(buildAccountManagerSystemRole());
  }

  return mergedRoles;
}

const ACCOUNT_MANAGER_FIXED_PERMISSION_NAMES = [
  "clients:read",
  "clients:update",
  "clients:activate",
  "shipments:read",
  "shipments:update",
  "shipments:track",
  "invoices:read",
  "invoices:download",
  "payments:read",
  "credit-invoices:read",
] as const;

function getSystemRoleById(roleId: string): Role | null {
  if (isAccountManagerSystemRoleId(roleId)) {
    return buildAccountManagerSystemRole();
  }

  return null;
}

async function getRoleWithSystemRoles(roleId: string): Promise<Role | null> {
  const systemRole = getSystemRoleById(roleId);
  if (systemRole) {
    return systemRole;
  }

  return (await storage.getRole(roleId)) || null;
}

async function validateAccountManagerClientIds(clientAccountIds: string[]): Promise<string | null> {
  if (clientAccountIds.length === 0) {
    return null;
  }

  const availableClients = await storage.getClientAccounts();
  const validClientIds = new Set(availableClients.map((client) => client.id));
  return clientAccountIds.find((clientId) => !validClientIds.has(clientId)) || null;
}

async function getValidatedAccountManagerUser(accountManagerUserId?: string | null): Promise<User | null> {
  if (!accountManagerUserId) {
    return null;
  }

  const accountManager = await storage.getUser(accountManagerUserId);
  if (!accountManager || accountManager.userType !== "admin" || !accountManager.isAccountManager) {
    return null;
  }

  return accountManager;
}

async function canReadAccountManagerAssignments(user: User): Promise<boolean> {
  if (user.isAccountManager) {
    return true;
  }

  const permissionNames = await getEffectiveAdminPermissionNames(user);
  return permissionNames.includes("account-managers:read");
}

function serializeAssignedAccountManager(user: User): AssignedAccountManagerSummary {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

async function serializeClientAccountForAdmin(
  client: ClientAccount,
  options?: { includeAssignedAccountManager?: boolean },
): Promise<AdminClientSummary> {
  if (!options?.includeAssignedAccountManager) {
    return client;
  }

  const assignedAccountManager = await storage.getPrimaryAccountManagerForClient(client.id);
  return {
    ...client,
    assignedAccountManager: assignedAccountManager ? serializeAssignedAccountManager(assignedAccountManager) : null,
  };
}

async function getEffectiveAdminPermissionNames(user: User): Promise<string[]> {
  const rolePermissions = await storage.getAdminPermissions(user.id);
  const permissionNames = new Set(rolePermissions.map((permission) => permission.name));

  if (user.isAccountManager) {
    for (const permissionName of ACCOUNT_MANAGER_FIXED_PERMISSION_NAMES) {
      permissionNames.add(permissionName);
    }
  }

  return Array.from(permissionNames).sort();
}

async function getScopedClientAccountIds(user: User): Promise<string[] | undefined> {
  if (!user.isAccountManager) {
    return undefined;
  }

  return storage.getClientIdsForAccountManager(user.id);
}

async function ensureAccountManagerClientAccess(
  user: User,
  clientAccountId: string,
  res: Response,
): Promise<boolean> {
  if (!user.isAccountManager) {
    return true;
  }

  const managedClientIds = await storage.getClientIdsForAccountManager(user.id);
  if (managedClientIds.includes(clientAccountId)) {
    return true;
  }

  res.status(403).json({ error: "Access denied to this client" });
  return false;
}

async function validateClientProfileValue(profile: string): Promise<void> {
  const pricingRules = await storage.getPricingRules();
  const validProfiles = pricingRules.map((rule) => rule.profile);
  if (!validProfiles.includes(profile)) {
    throw new Error("Invalid profile");
  }
}

function buildClientAccountUpdates(payload: Partial<ClientAccount>): Partial<ClientAccount> {
  const updates: Partial<ClientAccount> = {};
  const assignIfDefined = <K extends keyof ClientAccount>(key: K) => {
    if (payload[key] !== undefined) {
      updates[key] = payload[key];
    }
  };

  assignIfDefined("name");
  assignIfDefined("phone");
  assignIfDefined("country");
  assignIfDefined("companyName");
  assignIfDefined("crNumber");
  assignIfDefined("taxNumber");
  assignIfDefined("nationalAddressStreet");
  assignIfDefined("nationalAddressBuilding");
  assignIfDefined("nationalAddressDistrict");
  assignIfDefined("nationalAddressCity");
  assignIfDefined("nationalAddressPostalCode");
  assignIfDefined("shippingContactName");
  assignIfDefined("shippingContactPhone");
  assignIfDefined("shippingCountryCode");
  assignIfDefined("shippingStateOrProvince");
  assignIfDefined("shippingCity");
  assignIfDefined("shippingPostalCode");
  assignIfDefined("shippingAddressLine1");
  assignIfDefined("shippingAddressLine2");
  assignIfDefined("shippingShortAddress");
  assignIfDefined("nameAr");
  assignIfDefined("companyNameAr");
  assignIfDefined("nationalAddressStreetAr");
  assignIfDefined("nationalAddressBuildingAr");
  assignIfDefined("nationalAddressDistrictAr");
  assignIfDefined("nationalAddressCityAr");
  assignIfDefined("shippingContactNameAr");
  assignIfDefined("shippingContactPhoneAr");
  assignIfDefined("shippingCountryCodeAr");
  assignIfDefined("shippingStateOrProvinceAr");
  assignIfDefined("shippingCityAr");
  assignIfDefined("shippingPostalCodeAr");
  assignIfDefined("shippingAddressLine1Ar");
  assignIfDefined("shippingAddressLine2Ar");
  assignIfDefined("shippingShortAddressAr");
  assignIfDefined("profile");
  assignIfDefined("isActive");

  return updates;
}

async function applyClientAccountUpdates(
  clientAccountId: string,
  updates: Partial<ClientAccount>,
): Promise<{ currentClient: ClientAccount; updatedClient: ClientAccount } | null> {
  const currentClient = await storage.getClientAccount(clientAccountId);
  if (!currentClient) {
    return null;
  }

  const updatedClient = await storage.updateClientAccount(clientAccountId, updates);
  if (!updatedClient) {
    return null;
  }

  if (zohoService.isConfigured() && currentClient.zohoCustomerId) {
    try {
      await zohoService.updateCustomer(currentClient.zohoCustomerId, {
        name: updatedClient.name,
        email: updatedClient.email,
        phone: updatedClient.phone,
        companyName: updatedClient.companyName || undefined,
        country: updatedClient.country,
        shippingContactName: updatedClient.shippingContactName || undefined,
        shippingContactPhone: updatedClient.shippingContactPhone || undefined,
        shippingStateOrProvince: updatedClient.shippingStateOrProvince || undefined,
        shippingCity: updatedClient.shippingCity || undefined,
        shippingPostalCode: updatedClient.shippingPostalCode || undefined,
        shippingAddressLine1: updatedClient.shippingAddressLine1 || undefined,
        shippingAddressLine2: updatedClient.shippingAddressLine2 || undefined,
        nameAr: updatedClient.nameAr || undefined,
        companyNameAr: updatedClient.companyNameAr || undefined,
        shippingContactNameAr: updatedClient.shippingContactNameAr || undefined,
        shippingContactPhoneAr: updatedClient.shippingContactPhoneAr || undefined,
        shippingCountryCodeAr: updatedClient.shippingCountryCodeAr || undefined,
        shippingStateOrProvinceAr: updatedClient.shippingStateOrProvinceAr || undefined,
        shippingCityAr: updatedClient.shippingCityAr || undefined,
        shippingPostalCodeAr: updatedClient.shippingPostalCodeAr || undefined,
        shippingAddressLine1Ar: updatedClient.shippingAddressLine1Ar || undefined,
        shippingAddressLine2Ar: updatedClient.shippingAddressLine2Ar || undefined,
        shippingShortAddressAr: updatedClient.shippingShortAddressAr || undefined,
      });
    } catch (error) {
      logError("Failed to update Zoho customer", error);
    }
  }

  return { currentClient, updatedClient };
}

async function createAccountManagerSummary(user: User, availableRoles?: Role[]): Promise<AccountManagerSummary> {
  const adminSummary = await buildAdminUserSummary(user, availableRoles);

  return {
    ...adminSummary,
    assignedClients: adminSummary.assignedClients || [],
  };
}

async function getAssignedRolesForUser(user: User, availableRoles?: Role[]): Promise<Role[]> {
  const [roleAssignments, allRoles] = await Promise.all([
    storage.getUserRoles(user.id),
    availableRoles ? Promise.resolve(mergeRolesWithSystemRoles(availableRoles)) : storage.getRoles().then(mergeRolesWithSystemRoles),
  ]);
  const assignedRoleIds = new Set(roleAssignments.map((assignment) => assignment.roleId));

  if (user.isAccountManager) {
    assignedRoleIds.add(ACCOUNT_MANAGER_SYSTEM_ROLE_ID);
  }

  return allRoles.filter((role) => assignedRoleIds.has(role.id));
}

async function buildAdminUserSummary(user: User, availableRoles?: Role[]): Promise<AdminUserSummary> {
  const [assignedRoles, assignments] = await Promise.all([
    getAssignedRolesForUser(user, availableRoles),
    user.isAccountManager
      ? storage.getAccountManagerAssignments({ accountManagerUserId: user.id })
      : Promise.resolve([]),
  ]);

  let assignedClients: AdminUserSummary["assignedClients"] = undefined;

  if (user.isAccountManager) {
    const clients = await Promise.all(
      assignments.map((assignment) => storage.getClientAccount(assignment.clientAccountId)),
    );

    assignedClients = clients
      .filter((client): client is ClientAccount => Boolean(client))
      .map((client) => ({
        id: client.id,
        accountNumber: client.accountNumber,
        name: client.name,
        profile: client.profile,
        isActive: client.isActive,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    ...serializeAdminUser(user, assignedRoles),
    assignedClients,
  };
}

// Middleware to check client role
async function requireClient(req: Request, res: Response, next: NextFunction) {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  if (user.userType !== "client") {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

// Audit logging helper - writes to both database and file
async function logAudit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
  ipAddress?: string
) {
  try {
    // Write to database
    await storage.createAuditLog({
      userId: userId || null,
      action,
      entityType,
      entityId: entityId || null,
      details: details || null,
      ipAddress: ipAddress || null,
    });
    
    // Write to file for persistent storage
    logAuditToFile({
      userId: userId || "system",
      action,
      resource: entityType,
      resourceId: entityId,
      details,
      ipAddress,
    });
  } catch (error) {
    logError("Failed to create audit log", error);
  }
}

async function createCompletedPaymentRecord(params: {
  invoiceId: string;
  clientAccountId: string;
  amount: string;
  paymentMethod: string;
  transactionId: string;
}) {
  return storage.createPayment({
    invoiceId: params.invoiceId,
    clientAccountId: params.clientAccountId,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
    status: "completed",
    transactionId: params.transactionId,
  });
}

async function markCreditInvoicePaid(
  invoice: Awaited<ReturnType<typeof storage.getCreditInvoice>>,
  userId: string,
  ipAddress?: string,
) {
  if (!invoice) {
    throw new Error("Credit invoice not found");
  }

  const updatedInvoice = await storage.updateCreditInvoice(invoice.id, {
    status: "PAID",
    paidAt: new Date(),
    nextReminderAt: null,
  });

  await storage.updateShipment(invoice.shipmentId, {
    paymentStatus: "paid",
  });

  const shipment = await storage.getShipment(invoice.shipmentId);
  const invoiceAmount = formatMoney(Number(invoice.amount));
  let shipmentInvoice = await storage.getInvoiceByShipmentId(invoice.shipmentId);

  if (!shipmentInvoice && shipment) {
    shipmentInvoice = await storage.createInvoice({
      clientAccountId: invoice.clientAccountId,
      shipmentId: invoice.shipmentId,
      invoiceType: InvoiceType.SHIPMENT,
      description: shipment ? buildShipmentInvoiceDescription(shipment) : `Shipping service for shipment ${invoice.shipmentId}`,
      amount: invoiceAmount,
      status: "paid",
      dueDate: new Date(),
    });
  }

  if (shipmentInvoice) {
    shipmentInvoice =
      (await storage.updateInvoice(shipmentInvoice.id, {
        status: "paid",
        paidAt: new Date(),
      })) || shipmentInvoice;

    await createCompletedPaymentRecord({
      invoiceId: shipmentInvoice.id,
      clientAccountId: invoice.clientAccountId,
      amount: invoiceAmount,
      paymentMethod: "credit",
      transactionId: `credit-${invoice.id}-${Date.now()}`,
    });
  }

  await storage.createCreditNotificationEvent({
    clientAccountId: invoice.clientAccountId,
    creditInvoiceId: invoice.id,
    type: "MARKED_PAID",
    sentAt: new Date(),
    meta: JSON.stringify({ markedBy: userId }),
  });

  await logAudit(
    userId,
    "mark_credit_paid",
    "credit_invoice",
    invoice.id,
    `Marked credit invoice as paid for shipment ${invoice.shipmentId}`,
    ipAddress,
  );

  return {
    updatedInvoice,
    shipment: shipment ? await storage.getShipment(invoice.shipmentId) : undefined,
    paymentInvoice: shipmentInvoice,
  };
}

async function markShipmentClientPaymentPaid(shipment: Awaited<ReturnType<typeof storage.getShipment>>, userId: string, ipAddress?: string) {
  if (!shipment) {
    throw new Error("Shipment not found");
  }

  if (shipment.status === "cancelled") {
    throw new Error("Cancelled shipments cannot be marked as paid");
  }

  if (shipment.paymentStatus === "paid") {
    throw new Error("Shipment is already marked as paid");
  }

  const creditInvoice = await storage.getCreditInvoiceByShipmentId(shipment.id);
  if (creditInvoice) {
    if (creditInvoice.status === "PAID") {
      throw new Error("Credit invoice is already paid");
    }
    if (creditInvoice.status === "CANCELLED") {
      throw new Error("Cannot mark a cancelled credit invoice as paid");
    }

    const result = await markCreditInvoicePaid(creditInvoice, userId, ipAddress);
    return {
      shipment: result.shipment,
      invoice: result.paymentInvoice,
      creditInvoice: result.updatedInvoice,
    };
  }

  const invoiceAmount = formatMoney(parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice));
  let invoice = await storage.getInvoiceByShipmentId(shipment.id);

  if (!invoice) {
    invoice = await storage.createInvoice({
      clientAccountId: shipment.clientAccountId,
      shipmentId: shipment.id,
      invoiceType: InvoiceType.SHIPMENT,
      description: buildShipmentInvoiceDescription(shipment),
      amount: invoiceAmount,
      status: "paid",
      dueDate: new Date(),
    });
  }

  invoice =
    (await storage.updateInvoice(invoice.id, {
      status: "paid",
      paidAt: new Date(),
    })) || invoice;

  await createCompletedPaymentRecord({
    invoiceId: invoice.id,
    clientAccountId: shipment.clientAccountId,
    amount: invoiceAmount,
    paymentMethod: shipment.paymentMethod === "CREDIT" ? "credit" : "manual",
    transactionId: `manual-shipment-${shipment.id}-${Date.now()}`,
  });

  const updatedShipment = await storage.updateShipment(shipment.id, {
    paymentStatus: "paid",
  });

  await logAudit(
    userId,
    "mark_shipment_paid",
    "shipment",
    shipment.id,
    `Marked shipment ${shipment.trackingNumber} as client-paid`,
    ipAddress,
  );

  return {
    shipment: updatedShipment,
    invoice,
    creditInvoice: null,
  };
}

async function markShipmentCarrierPaymentPaid(
  shipment: Awaited<ReturnType<typeof storage.getShipment>>,
  userId: string,
  paymentDetails: {
    paymentReference: string;
    paymentNote?: string | null;
  },
  ipAddress?: string,
) {
  if (!shipment) {
    throw new Error("Shipment not found");
  }

  if (shipment.status === "cancelled") {
    throw new Error("Cancelled shipments cannot be marked as carrier-paid");
  }

  if (!shipment.taxScenario || shipment.accountingCurrency !== "SAR") {
    throw new Error("Shipment is not part of the SAR accounting schedule");
  }

  if (!shipment.carrierTrackingNumber) {
    throw new Error("Shipment does not have a carrier tracking number yet");
  }

  if (shipment.carrierPaymentStatus === CarrierPaymentStatus.PAID) {
    throw new Error("Shipment is already marked as carrier-paid");
  }

  const effective = getEffectiveShipmentFinancials(shipment);
  const updatedShipment = await storage.updateShipment(shipment.id, {
    carrierPaymentStatus: CarrierPaymentStatus.PAID,
    carrierPaidAt: new Date(),
    carrierPaymentAmountSar: formatMoney(effective.systemCostTotalAmountSar),
    carrierPaymentReference: paymentDetails.paymentReference,
    carrierPaymentNote: paymentDetails.paymentNote || null,
    carrierPayoutBatchId: null,
  });

  await logAudit(
    userId,
    "mark_carrier_paid",
    "shipment",
    shipment.id,
    `Marked shipment ${shipment.trackingNumber} as carrier-paid with reference ${paymentDetails.paymentReference}`,
    ipAddress,
  );

  return updatedShipment;
}

async function cancelShipmentCarrierPayment(
  shipment: Awaited<ReturnType<typeof storage.getShipment>>,
  userId: string,
  ipAddress?: string,
) {
  if (!shipment) {
    throw new Error("Shipment not found");
  }

  if (shipment.carrierPaymentStatus !== CarrierPaymentStatus.PAID) {
    throw new Error("Shipment does not have a paid carrier settlement");
  }

  const updatedShipment = await storage.updateShipment(shipment.id, {
    carrierPaymentStatus: CarrierPaymentStatus.UNPAID,
    carrierPaidAt: null,
    carrierPaymentAmountSar: null,
    carrierPaymentReference: null,
    carrierPaymentNote: null,
    carrierPayoutBatchId: null,
  });

  await logAudit(
    userId,
    "cancel_carrier_payment",
    "shipment",
    shipment.id,
    `Cancelled carrier payment for shipment ${shipment.trackingNumber}`,
    ipAddress,
  );

  return updatedShipment;
}

function serializeClientExtraFeeNotice(shipment: Record<string, any>) {
  const effective = getEffectiveShipmentFinancials(shipment);
  return {
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    carrierTrackingNumber: shipment.carrierTrackingNumber || null,
    carrierName: shipment.carrierName || shipment.carrierCode || null,
    createdAt: shipment.createdAt,
    extraFeesAmountSar: effective.extraFeesAmountSar,
    extraFeesType: effective.extraFeesType,
    extraFeesWeightValue: effective.extraFeesWeightValue,
    extraFeesCostAmountSar: effective.extraFeesCostAmountSar,
    extraWeightAmountSar: effective.extraWeightAmountSar,
    extraFeesAddedAt: shipment.extraFeesAddedAt || shipment.updatedAt,
    extraFeesEmailSentAt: shipment.extraFeesEmailSentAt || null,
    weightValue: parseMoneyValue(shipment.weight),
    weightUnit: shipment.weightUnit || "KG",
    grossTotalAmountSar: parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice),
    extraFeesRateSarPerWeight: effective.extraFeesRateSarPerWeight,
  };
}

function getInvoiceTypeLabel(invoiceType: string | null | undefined) {
  if (invoiceType === InvoiceType.EXTRA_WEIGHT) {
    return "Extra Weight";
  }
  if (invoiceType === InvoiceType.EXTRA_COST) {
    return "Extra Cost";
  }
  return "Shipment";
}

function buildExtraFeeInvoiceDescription(shipment: Record<string, any>, invoiceType: string) {
  const feeLabel = getInvoiceTypeLabel(invoiceType);
  return `${feeLabel} adjustment for shipment ${shipment.trackingNumber}`;
}

function buildShipmentInvoiceDescription(shipment: Record<string, any>) {
  return `Shipping service for shipment ${shipment.trackingNumber}`;
}

function getShipmentExtraFeeComponents(shipment: Record<string, any>) {
  const effective = getEffectiveShipmentFinancials(shipment);
  const components: Array<{
    invoiceType: string;
    amountSar: number;
    weightValue?: number;
    costAmountSar?: number;
    rateSarPerWeight?: number;
  }> = [];

  if (effective.extraWeightAmountSar > 0) {
    components.push({
      invoiceType: InvoiceType.EXTRA_WEIGHT,
      amountSar: effective.extraWeightAmountSar,
      weightValue: effective.extraFeesWeightValue,
      rateSarPerWeight: effective.extraFeesRateSarPerWeight,
    });
  }

  if (effective.extraFeesCostAmountSar > 0) {
    components.push({
      invoiceType: InvoiceType.EXTRA_COST,
      amountSar: effective.extraFeesCostAmountSar,
      costAmountSar: effective.extraFeesCostAmountSar,
    });
  }

  return components;
}

async function syncShipmentExtraFeeInvoiceForType(params: {
  shipment: Shipment;
  relatedInvoices: Invoice[];
  invoiceType: typeof InvoiceType.EXTRA_WEIGHT | typeof InvoiceType.EXTRA_COST;
  targetAmountSar: number;
}) {
  const extraFeeInvoices = params.relatedInvoices.filter(
    (invoice) => invoice.invoiceType === params.invoiceType,
  );
  const paidAmountSar = roundMoney(
    extraFeeInvoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + parseMoneyValue(invoice.amount), 0),
  );
  const pendingInvoices = extraFeeInvoices.filter((invoice) => invoice.status !== "paid");
  const outstandingAmountSar = roundMoney(Math.max(params.targetAmountSar - paidAmountSar, 0));
  const description = buildExtraFeeInvoiceDescription(params.shipment, params.invoiceType);

  if (outstandingAmountSar <= 0) {
    for (const pendingInvoice of pendingInvoices) {
      await storage.updateInvoice(pendingInvoice.id, { deletedAt: new Date() });
    }
    return pendingInvoices[0] ?? extraFeeInvoices[0] ?? null;
  }

  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let invoice = pendingInvoices[0];

  if (invoice) {
    invoice =
      (await storage.updateInvoice(invoice.id, {
        amount: formatMoney(outstandingAmountSar),
        description,
        dueDate,
        invoiceType: params.invoiceType,
      })) || invoice;

    for (const duplicateInvoice of pendingInvoices.slice(1)) {
      await storage.updateInvoice(duplicateInvoice.id, { deletedAt: new Date() });
    }

    return invoice;
  }

  return storage.createInvoice({
    clientAccountId: params.shipment.clientAccountId,
    shipmentId: params.shipment.id,
    invoiceType: params.invoiceType,
    description,
    amount: formatMoney(outstandingAmountSar),
    status: "pending",
    dueDate,
  });
}

async function syncShipmentExtraFeeInvoices(shipment: Shipment) {
  const relatedInvoices = await storage.getInvoicesByShipmentId(shipment.id);
  const componentMap = new Map(
    getShipmentExtraFeeComponents(shipment).map((component) => [component.invoiceType, component]),
  );

  const weightInvoice = await syncShipmentExtraFeeInvoiceForType({
    shipment,
    relatedInvoices,
    invoiceType: InvoiceType.EXTRA_WEIGHT,
    targetAmountSar: componentMap.get(InvoiceType.EXTRA_WEIGHT)?.amountSar ?? 0,
  });

  const costInvoice = await syncShipmentExtraFeeInvoiceForType({
    shipment,
    relatedInvoices,
    invoiceType: InvoiceType.EXTRA_COST,
    targetAmountSar: 0,
  });

  return {
    [InvoiceType.EXTRA_WEIGHT]: weightInvoice,
    [InvoiceType.EXTRA_COST]: costInvoice,
  } as const;
}

function serializeClientExtraFeeNotices(
  shipment: Record<string, any>,
  invoicesByType: Partial<Record<typeof InvoiceType.EXTRA_WEIGHT | typeof InvoiceType.EXTRA_COST, Invoice | null>>,
) {
  const effective = getEffectiveShipmentFinancials(shipment);
  const notices: Array<Record<string, any>> = [];

  if (effective.extraWeightAmountSar > 0) {
    const invoice = invoicesByType[InvoiceType.EXTRA_WEIGHT] || null;
    notices.push({
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierTrackingNumber: shipment.carrierTrackingNumber || null,
      carrierName: shipment.carrierName || shipment.carrierCode || null,
      createdAt: shipment.createdAt,
      extraFeesAmountSar: invoice ? parseMoneyValue(invoice.amount) : effective.extraWeightAmountSar,
      extraFeesType: ShipmentExtraFeeType.EXTRA_WEIGHT,
      extraFeesWeightValue: effective.extraFeesWeightValue,
      extraFeesCostAmountSar: 0,
      extraWeightAmountSar: effective.extraWeightAmountSar,
      extraFeesAddedAt: shipment.extraFeesAddedAt || shipment.updatedAt,
      extraFeesEmailSentAt: shipment.extraFeesEmailSentAt || null,
      weightValue: parseMoneyValue(shipment.weight),
      weightUnit: shipment.weightUnit || "KG",
      grossTotalAmountSar: parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice),
      extraFeesRateSarPerWeight: effective.extraFeesRateSarPerWeight,
      invoiceId: invoice?.id || null,
      invoiceNumber: invoice?.invoiceNumber || null,
      invoiceStatus: invoice?.status || null,
      invoiceDescription: invoice?.description || buildExtraFeeInvoiceDescription(shipment, InvoiceType.EXTRA_WEIGHT),
      invoiceAmountSar: invoice ? parseMoneyValue(invoice.amount) : effective.extraWeightAmountSar,
      invoiceDueDate: invoice?.dueDate || null,
    });
  }

  return notices;
}

// Default permissions for the platform
const DEFAULT_PERMISSIONS = [
  // Clients
  { resource: "clients", action: "create", description: "Create new client accounts" },
  { resource: "clients", action: "read", description: "View client information" },
  { resource: "clients", action: "update", description: "Update client details" },
  { resource: "clients", action: "delete", description: "Delete client accounts" },
  { resource: "clients", action: "activate", description: "Activate or deactivate clients" },
  
  // Shipments
  { resource: "shipments", action: "create", description: "Create new shipments" },
  { resource: "shipments", action: "read", description: "View shipment information" },
  { resource: "shipments", action: "update", description: "Update shipment details" },
  { resource: "shipments", action: "delete", description: "Delete shipments" },
  { resource: "shipments", action: "cancel", description: "Cancel shipments" },
  { resource: "shipments", action: "track", description: "Track shipment status" },
  
  // Invoices
  { resource: "invoices", action: "create", description: "Create new invoices" },
  { resource: "invoices", action: "read", description: "View invoice information" },
  { resource: "invoices", action: "update", description: "Update invoice details" },
  { resource: "invoices", action: "delete", description: "Delete invoices" },
  { resource: "invoices", action: "download", description: "Download invoice PDFs" },
  { resource: "invoices", action: "sync", description: "Sync invoices with Zoho" },
  
  // Payments
  { resource: "payments", action: "read", description: "View payment information" },
  { resource: "payments", action: "create", description: "Process payments" },
  { resource: "payments", action: "refund", description: "Issue payment refunds" },
  
  // Applications
  { resource: "applications", action: "read", description: "View client applications" },
  { resource: "applications", action: "approve", description: "Approve client applications" },
  { resource: "applications", action: "reject", description: "Reject client applications" },

  // Credit Requests
  { resource: "credit-requests", action: "read", description: "View credit access requests" },
  { resource: "credit-requests", action: "approve", description: "Approve credit access requests" },
  { resource: "credit-requests", action: "reject", description: "Reject credit access requests" },
  { resource: "credit-requests", action: "revoke", description: "Revoke approved credit access" },

  // Credit Invoices
  { resource: "credit-invoices", action: "read", description: "View credit invoices" },
  { resource: "credit-invoices", action: "update", description: "Update credit invoice status" },
  { resource: "credit-invoices", action: "cancel", description: "Cancel credit invoices" },
  
  // Pricing Rules
  { resource: "pricing-rules", action: "create", description: "Create pricing rules" },
  { resource: "pricing-rules", action: "read", description: "View pricing rules" },
  { resource: "pricing-rules", action: "update", description: "Update pricing rules" },
  { resource: "pricing-rules", action: "delete", description: "Delete pricing rules" },
  
  // System Logs
  { resource: "system-logs", action: "read", description: "View system logs" },
  { resource: "system-logs", action: "resolve", description: "Resolve system log issues" },

  // Audit Logs
  { resource: "audit-logs", action: "read", description: "View audit logs" },
  
  // Users
  { resource: "users", action: "create", description: "Create new users" },
  { resource: "users", action: "read", description: "View user information" },
  { resource: "users", action: "update", description: "Update user details" },
  { resource: "users", action: "delete", description: "Delete users" },
  { resource: "users", action: "reset-password", description: "Reset user passwords" },

  // Account Managers
  { resource: "account-managers", action: "read", description: "View account managers and assignments" },
  { resource: "account-managers", action: "create", description: "Create account manager users" },
  { resource: "account-managers", action: "assign", description: "Assign clients to account managers" },
  { resource: "account-manager-requests", action: "read", description: "View account manager change requests" },
  { resource: "account-manager-requests", action: "approve", description: "Approve account manager client changes" },
  { resource: "account-manager-requests", action: "reject", description: "Reject account manager client changes" },
  
  // Roles
  { resource: "roles", action: "create", description: "Create new roles" },
  { resource: "roles", action: "read", description: "View roles" },
  { resource: "roles", action: "update", description: "Update role details" },
  { resource: "roles", action: "delete", description: "Delete roles" },
  { resource: "roles", action: "assign", description: "Assign roles to users" },
  
  // Permissions
  { resource: "permissions", action: "create", description: "Create new permissions" },
  { resource: "permissions", action: "read", description: "View permissions" },
  { resource: "permissions", action: "delete", description: "Delete permissions" },
  { resource: "permissions", action: "assign", description: "Assign permissions to roles" },
  
  // Settings
  { resource: "settings", action: "read", description: "View system settings" },
  { resource: "settings", action: "update", description: "Update system settings" },
  
  // Integrations
  { resource: "integrations", action: "read", description: "View integration status" },
  { resource: "integrations", action: "configure", description: "Configure integrations" },
  
  // Webhooks
  { resource: "webhooks", action: "read", description: "View webhook events" },
  
  // Email Templates
  { resource: "email-templates", action: "read", description: "View email templates" },
  { resource: "email-templates", action: "update", description: "Update email templates" },

  // Policies
  { resource: "policies", action: "create", description: "Create policies" },
  { resource: "policies", action: "read", description: "View policies" },
  { resource: "policies", action: "update", description: "Update policies" },
  { resource: "policies", action: "delete", description: "Delete policies" },

  // Dashboard
  { resource: "dashboard", action: "read", description: "View admin dashboard" },
  { resource: "dashboard", action: "export", description: "Export dashboard reports" },
];

async function seedDefaultPermissions() {
  try {
    const existingPermissions = await storage.getPermissions();

    const existingNames = new Set(existingPermissions.map((permission) => permission.name));
    let seededCount = 0;

    for (const perm of DEFAULT_PERMISSIONS) {
      const permissionName = `${perm.resource}:${perm.action}`;
      if (existingNames.has(permissionName)) {
        continue;
      }

      await storage.createPermission({
        name: permissionName,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      });
      seededCount++;
    }

    if (seededCount > 0) {
      logInfo(`Seeded ${seededCount} admin permissions`);
    }
  } catch (error) {
    logError("Error seeding default permissions", error);
  }
}

async function ensureSuperAdminBootstrap() {
  try {
    const allPermissions = await storage.getPermissions();
    const allRoles = await storage.getRoles();
    let superAdminRole = allRoles.find((role) => role.name === "super_admin");

    if (!superAdminRole) {
      superAdminRole = await storage.createRole({
        name: "super_admin",
        description: "Bootstrap role with full administrative access",
        isActive: true,
      });
    } else if (!superAdminRole.isActive) {
      superAdminRole = await storage.updateRole(superAdminRole.id, { isActive: true }) || superAdminRole;
    }

    const assignedPermissions = await storage.getRolePermissions(superAdminRole.id);
    const assignedPermissionIds = new Set(assignedPermissions.map((permission) => permission.permissionId));

    for (const permission of allPermissions) {
      if (!assignedPermissionIds.has(permission.id)) {
        await storage.assignRolePermission({
          roleId: superAdminRole.id,
          permissionId: permission.id,
        });
      }
    }

    const adminUsers = await storage.getUsersByUserType("admin");
    const adminRoleAssignments = await Promise.all(
      adminUsers.map(async (adminUser) => ({
        user: adminUser,
        roles: await storage.getUserRoles(adminUser.id),
      })),
    );

    if (adminRoleAssignments.some((assignment) => assignment.roles.length > 0)) {
      return;
    }

    for (const assignment of adminRoleAssignments) {
      await storage.assignUserRole({
        userId: assignment.user.id,
        roleId: superAdminRole.id,
      });
    }
  } catch (error) {
    logError("Error bootstrapping super admin role", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed default permissions on startup
  await seedDefaultPermissions();
  await ensureSuperAdminBootstrap();
  
  // Trust proxy for rate limiting behind reverse proxy
  app.set("trust proxy", 1);

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://tap-sdks.b-cdn.net"],
          connectSrc: ["'self'", "https:"],
          frameSrc: ["'self'", "https://*.tap.company", "https://tap-sdks.b-cdn.net"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
    })
  );

  // General rate limiting
  app.use("/api/", generalLimiter);

  // Session middleware - use PostgreSQL session store in production, MemoryStore in development
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await sessionPool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    var sessionStore: any = new PgSessionStore({
        pool: sessionPool,
        tableName: "session",
        createTableIfMissing: false,
        pruneSessionInterval: 60 * 15,
      });
  } else {
    var sessionStore: any = new MemoryStoreSession({
        checkPeriod: 86400000,
      });
  }

  app.set("trust proxy", 1);

  app.use(
    session({
      secret: process.env.NODE_ENV === "production"
        ? (process.env.SESSION_SECRET || (() => { throw new Error("SESSION_SECRET is required in production"); })())
        : (process.env.SESSION_SECRET || "ezhalha-secret-key-dev"),
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        secure: process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS !== "false",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "lax",
      },
    })
  );

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      service: "ezhalha"
    });
  });

  // ============================================
  // BRANDING CONFIG
  // ============================================
  app.get("/api/config/branding", (_req, res) => {
    const config: BrandingConfig = {
      appName: "ezhalha",
      primaryColor: "#fe5200",
      logoUrl: "/assets/branding/logo.png",
    };
    res.json(config);
  });

  // ============================================
  // PUBLIC POLICY ROUTES
  // ============================================
  app.get("/api/policies", async (_req, res) => {
    try {
      const allPolicies = await storage.getPolicies();
      const published = allPolicies
        .filter(p => p.isPublished)
        .map(({ id, slug, title, updatedAt }) => ({ id, slug, title, updatedAt }));
      res.json(published);
    } catch (error) {
      logError("Error fetching public policies", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/policies/:slug", async (req, res) => {
    try {
      const policy = await storage.getPolicyBySlug(req.params.slug);
      if (!policy || !policy.isPublished) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.json(policy);
    } catch (error) {
      logError("Error fetching policy", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/policies/:slug/versions", async (req, res) => {
    try {
      const policy = await storage.getPolicyBySlug(req.params.slug);
      if (!policy || !policy.isPublished) {
        return res.status(404).json({ error: "Policy not found" });
      }
      const versions = await storage.getPolicyVersions(policy.id);
      res.json(versions.map(v => ({
        id: v.id,
        versionNumber: v.versionNumber,
        title: v.title,
        changeNote: v.changeNote,
        createdAt: v.createdAt,
      })));
    } catch (error) {
      logError("Error fetching policy versions", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/policies/:slug/versions/:versionId", async (req, res) => {
    try {
      const policy = await storage.getPolicyBySlug(req.params.slug);
      if (!policy || !policy.isPublished) {
        return res.status(404).json({ error: "Policy not found" });
      }
      const version = await storage.getPolicyVersion(req.params.versionId);
      if (!version || version.policyId !== policy.id) {
        return res.status(404).json({ error: "Version not found" });
      }
      res.json(version);
    } catch (error) {
      logError("Error fetching policy version", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // AUTH ROUTES
  // ============================================
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const identifier = req.ip || data.username;
      
      // Check brute-force protection
      const bruteForceCheck = checkBruteForce(identifier);
      if (bruteForceCheck.blocked) {
        await logAudit(undefined, "login_blocked", "security", undefined, 
          `Login blocked for ${identifier} due to brute-force protection`, req.ip);
        return res.status(429).json({ 
          error: `Too many failed attempts. Try again in ${bruteForceCheck.remainingTime} seconds.` 
        });
      }
      
      const user = await storage.getUserByUsername(data.username);

      if (!user) {
        recordFailedLogin(identifier);
        await logAudit(undefined, "login_failed", "security", undefined, 
          `Failed login attempt for username: ${data.username}`, req.ip);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.password);
      if (!passwordMatch) {
        recordFailedLogin(identifier);
        await logAudit(user.id, "login_failed", "security", user.id, 
          `Failed login attempt for user: ${user.username}`, req.ip);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "Account is deactivated" });
      }

      if (user.userType === "client") {
        if (!user.clientAccountId) {
          return res.status(404).json({ error: "Client account not found" });
        }

        const clientAccount = await storage.getClientAccount(user.clientAccountId);
        if (!clientAccount || !clientAccount.isActive) {
          return res.status(403).json({ error: "Client account is deactivated" });
        }
      }

      // Clear failed login attempts on successful login
      clearFailedLogins(identifier);
      
      req.session.userId = user.id;
      
      // Log successful login
      await logAudit(user.id, "login", "user", user.id, `User ${user.username} logged in`, req.ip);
      
      // Don't send password to client
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await ensureAuthenticatedUser(req, res);
    if (!user) {
      return;
    }
    const { password, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  });

  app.get("/api/admin/me/access", async (req, res) => {
    const user = await ensureAdminAccess(req, res);
    if (!user) {
      return;
    }

    const [permissions, managedClientIds] = await Promise.all([
      getEffectiveAdminPermissionNames(user),
      user.isAccountManager ? storage.getClientIdsForAccountManager(user.id) : Promise.resolve([]),
    ]);
    res.json({
      permissions,
      isAccountManager: user.isAccountManager,
      managedClientIds,
    });
  });

  // Change Password (requires authentication)
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      // Validate request body with Zod schema
      const validationResult = changePasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors[0].message });
      }
      
      const { currentPassword, newPassword } = validationResult.data;
      
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword, mustChangePassword: false, updatedAt: new Date() });
      
      // Clear brute-force tracking for this user on successful password change
      if (user.username) {
        clearFailedLogins(user.username);
      }
      if (user.email) {
        clearFailedLogins(user.email);
      }
      
      // Log the password change to audit log
      await logAudit(user.id, "change_password", "user", user.id, 
        `User changed their password`, req.ip);
      
      logInfo("User changed password", { userId: user.id });
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to change password", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // ============================================
  // PUBLIC ROUTES - CLIENT APPLICATIONS
  // ============================================
  app.post("/api/applications", async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }
      
      const data = applicationFormSchema.parse(req.body);
      if (data.accountType === "company") {
        const missingDocumentTypes = getMissingCompanyApplicationDocumentTypes(data.documents);
        if (missingDocumentTypes.length > 0) {
          return res.status(400).json({
            error: `Missing required company documents: ${missingDocumentTypes
              .map(getCompanyApplicationDocumentLabel)
              .join(", ")}`,
          });
        }
      }
      // Derive country from shipping country code for backwards compatibility
      const countryMap: Record<string, string> = {
        SA: "Saudi Arabia", AE: "United Arab Emirates", QA: "Qatar", KW: "Kuwait",
        BH: "Bahrain", OM: "Oman", EG: "Egypt", JO: "Jordan", LB: "Lebanon",
        US: "United States", GB: "United Kingdom", DE: "Germany", FR: "France",
      };
      const country = countryMap[data.shippingCountryCode] || data.shippingCountryCode;
      const application = await storage.createClientApplication({
        ...data,
        country,
        documents: data.documents || null,
        status: "pending",
      });
      
      // Send confirmation email to applicant
      await sendApplicationReceived(data.email, data.name, application.id);
      
      // Notify admin of new application
      await notifyAdminNewApplication(
        application.id, 
        data.name, 
        data.email, 
        data.companyName || undefined
      );
      
      // Log the application
      logInfo("New client application received", { 
        applicationId: application.id, 
        email: data.email,
        name: data.name 
      });
      
      const response = application;
      
      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 201);
      }
      
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create application", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ADMIN ROUTES
  // ============================================

  // Admin Dashboard Stats
  app.get("/api/admin/stats", requireAdminPermission("dashboard", "read"), async (_req, res) => {
    const clients = await storage.getClientAccounts();
    const shipments = await storage.getShipments();
    const applications = await storage.getClientApplications();
    const invoices = await storage.getInvoices();

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();

    const isCurrentMonth = (d: Date) => d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    const isPrevMonth = (d: Date) => d.getMonth() === prevMonth && d.getFullYear() === prevYear;

    const currentMonthShipments = shipments.filter((s) => isCurrentMonth(new Date(s.createdAt)));
    const prevMonthShipments = shipments.filter((s) => isPrevMonth(new Date(s.createdAt)));
    const currentMonthRevenue = currentMonthShipments.reduce((sum, s) => sum + Number(s.finalPrice), 0);
    const prevMonthRevenue = prevMonthShipments.reduce((sum, s) => sum + Number(s.finalPrice), 0);

    const currentMonthClients = clients.filter((c) => isCurrentMonth(new Date(c.createdAt)));
    const prevMonthClients = clients.filter((c) => isPrevMonth(new Date(c.createdAt)));

    function calcTrend(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    const shipmentsByMonth: { label: string; value: number }[] = [];
    const revenueByMonth: { label: string; value: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthShipments = shipments.filter((s) => {
        const sd = new Date(s.createdAt);
        return sd.getMonth() === m && sd.getFullYear() === y;
      });
      shipmentsByMonth.push({ label: monthNames[m], value: monthShipments.length });
      revenueByMonth.push({ label: monthNames[m], value: monthShipments.reduce((sum, s) => sum + Number(s.finalPrice), 0) });
    }

    const statusCounts: Record<string, number> = {};
    shipments.forEach((s) => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    const stats: AdminDashboardStats = {
      totalClients: clients.length,
      activeClients: clients.filter((c) => c.isActive).length,
      pendingApplications: applications.filter((a) => a.status === "pending").length,
      totalShipments: shipments.length,
      shipmentsInTransit: shipments.filter((s) => s.status === "in_transit").length,
      shipmentsDelivered: shipments.filter((s) => s.status === "delivered").length,
      totalRevenue: shipments.reduce((sum, s) => sum + Number(s.finalPrice), 0),
      monthlyRevenue: currentMonthRevenue,
      trends: {
        clients: { value: calcTrend(currentMonthClients.length, prevMonthClients.length), label: "vs last month" },
        shipments: { value: calcTrend(currentMonthShipments.length, prevMonthShipments.length), label: "vs last month" },
        revenue: { value: calcTrend(currentMonthRevenue, prevMonthRevenue), label: "vs last month" },
      },
      shipmentsByMonth,
      revenueByMonth,
      statusDistribution,
    };

    res.json(stats);
  });

  // Admin - Recent Shipments
  app.get("/api/admin/shipments/recent", requireAdminPermission("shipments", "read"), async (_req, res) => {
    const shipments = await storage.getShipments();
    res.json(shipments.slice(0, 10));
  });

  // Admin - All Shipments
  app.get("/api/admin/shipments", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const clientAccountIds = await getScopedClientAccountIds(adminUser);

      const result = await storage.getShipmentsPaginated({ page, limit, search, status, clientAccountIds });
      res.json(result);
    } catch (error) {
      logError("Error fetching shipments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Shipment Status (cancelled is handled by dedicated cancel endpoint)
  const statusUpdateSchema = z.object({
    status: z.enum(["created", "processing", "in_transit", "delivered"]),
  });

  app.patch("/api/admin/shipments/:id/status", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const { id } = req.params;
      const parseResult = statusUpdateSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      
      const { status } = parseResult.data;

      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }

      const updated = await storage.updateShipment(id, { status });
      
      // Log status change
      await logAudit(req.session.userId, "update_shipment_status", "shipment", id,
        `Changed shipment ${shipment.trackingNumber} status from ${shipment.status} to ${status}`, req.ip);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Cancel Shipment
  app.post("/api/admin/shipments/:id/cancel", requireAdminPermission("shipments", "cancel"), async (req, res) => {
    try {
      const { id } = req.params;
      
      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.status === "delivered") {
        return res.status(400).json({ error: "Cannot cancel delivered shipment" });
      }

      if (shipment.status === "cancelled") {
        return res.status(400).json({ error: "Shipment already cancelled" });
      }

      if (shipment.carrierTrackingNumber) {
        try {
          const carrierAdapter = getAdapterForShipment(shipment);
          await carrierAdapter.cancelShipment(shipment.carrierTrackingNumber, shipment.senderCountry);
        } catch (cancelError) {
          const isCarrierErr = cancelError instanceof CarrierError;
          const errCode = isCarrierErr ? (cancelError as CarrierError).code : "CANCEL_FAILED";
          const errMsg = isCarrierErr ? (cancelError as CarrierError).carrierMessage : (cancelError as Error).message;

          logError("Carrier cancel failed", cancelError);
          await storage.updateShipment(id, {
            carrierErrorCode: errCode,
            carrierErrorMessage: `Cancel failed: ${errMsg}`,
            carrierLastAttemptAt: new Date(),
          });

          return res.status(502).json({
            error: "Failed to cancel with carrier",
            carrierErrorCode: errCode,
            carrierErrorMessage: errMsg,
          });
        }
      }

      const updated = await storage.updateShipment(id, {
        status: "cancelled",
        carrierStatus: "cancelled",
      });
      
      await logAudit(req.session.userId, "cancel_shipment", "shipment", id,
        `Cancelled shipment ${shipment.trackingNumber}`, req.ip);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Retry carrier creation for failed shipments
  app.post("/api/admin/shipments/:id/retry-carrier", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const { id } = req.params;

      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.status !== "carrier_error") {
        return res.status(400).json({ error: "Shipment is not in carrier_error state" });
      }

      const retryAddrValidation = validateShippingAddresses(
        { countryCode: shipment.senderCountry, city: shipment.senderCity, addressLine1: shipment.senderAddress, postalCode: shipment.senderPostalCode || "", phone: shipment.senderPhone, stateOrProvince: shipment.senderStateOrProvince || "" },
        { countryCode: shipment.recipientCountry, city: shipment.recipientCity, addressLine1: shipment.recipientAddress, postalCode: shipment.recipientPostalCode || "", phone: shipment.recipientPhone, stateOrProvince: shipment.recipientStateOrProvince || "" }
      );
      if (!retryAddrValidation.valid) {
        return res.status(400).json({ error: "Address validation failed", details: retryAddrValidation.errors });
      }

      const carrierAdapter = getAdapterForShipment(shipment);
      let carrierResponse;
      try {
        const preparedShipment = await buildCarrierShipmentRequestFromShipment(shipment, carrierAdapter);
        if (preparedShipment.tradeDocumentsData !== shipment.tradeDocumentsData) {
          await storage.updateShipment(id, {
            tradeDocumentsData: preparedShipment.tradeDocumentsData,
          });
        }
        carrierResponse = await carrierAdapter.createShipment(preparedShipment.carrierRequest);
      } catch (carrierError) {
        const isCarrierErr = carrierError instanceof CarrierError;
        const errCode = isCarrierErr ? (carrierError as CarrierError).code : "UNKNOWN";
        const errMsg = isCarrierErr ? (carrierError as CarrierError).carrierMessage : (carrierError as Error).message;

        await storage.updateShipment(id, {
          carrierStatus: "error",
          carrierErrorCode: errCode,
          carrierErrorMessage: errMsg,
          carrierLastAttemptAt: new Date(),
          carrierAttempts: (shipment.carrierAttempts || 0) + 1,
        });

        logError("Carrier retry failed", carrierError);
        return res.status(502).json({
          error: "Carrier error on retry",
          carrierErrorCode: errCode,
          carrierErrorMessage: errMsg,
        });
      }

      const updatedShipment = await storage.updateShipment(id, {
        status: "created",
        carrierStatus: "created",
        carrierTrackingNumber: carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber,
        carrierShipmentId: carrierResponse.trackingNumber,
        labelUrl: carrierResponse.labelUrl,
        carrierLabelBase64: carrierResponse.labelData || null,
        carrierLabelMimeType: "application/pdf",
        carrierLabelFormat: "PDF",
        estimatedDelivery: carrierResponse.estimatedDelivery,
        carrierErrorCode: null,
        carrierErrorMessage: null,
        carrierLastAttemptAt: new Date(),
        carrierAttempts: (shipment.carrierAttempts || 0) + 1,
      });

      await logAudit(req.session.userId, "retry_carrier", "shipment", id,
        `Retried carrier creation for shipment ${shipment.trackingNumber}, new carrier tracking ${carrierResponse.carrierTrackingNumber}`, req.ip);

      res.json({
        shipment: updatedShipment,
        carrierTrackingNumber: carrierResponse.carrierTrackingNumber,
        labelUrl: carrierResponse.labelUrl,
        estimatedDelivery: carrierResponse.estimatedDelivery,
      });
    } catch (error) {
      logError("Failed to retry carrier creation", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/shipments/:id/label.pdf", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }
      if (!shipment.carrierLabelBase64) {
        return res.status(404).json({ error: "No label available for this shipment. The shipment may not have been created in FedEx yet." });
      }
      const pdfBuffer = Buffer.from(shipment.carrierLabelBase64, "base64");
      const trackingNum = shipment.carrierTrackingNumber || shipment.trackingNumber || "unknown";
      res.setHeader("Content-Type", shipment.carrierLabelMimeType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="fedex-label-${trackingNum}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      logError("Failed to download admin label", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Pending Applications
  app.get("/api/admin/applications/pending", requireAdminPermission("applications", "read"), async (_req, res) => {
    const applications = await storage.getClientApplications();
    res.json(applications.filter((a) => a.status === "pending"));
  });

  // Admin - All Applications
  app.get("/api/admin/applications", requireAdminPermission("applications", "read"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await storage.getClientApplicationsPaginated({ page, limit, search, status });
      res.json(result);
    } catch (error) {
      logError("Error fetching applications", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Review Application
  app.post("/api/admin/applications/:id/review", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { action, profile, notes } = req.body;

      if (action !== "approve" && action !== "reject") {
        return res.status(400).json({ error: "Invalid review action" });
      }

      if (!(await ensureAdminPermission(
        req,
        res,
        "applications",
        action === "approve" ? "approve" : "reject",
      ))) {
        return;
      }

      const application = await storage.getClientApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status !== "pending") {
        return res.status(400).json({ error: "Application already reviewed" });
      }

      if (action === "approve") {
        // Check if a user with this email already exists
        const existingUser = await storage.getUserByEmail(application.email);
        if (existingUser) {
          return res.status(400).json({ error: "A user with this email already exists" });
        }

        // Create client account with all company document fields and shipping address
        const clientAccount = await storage.createClientAccount({
          accountType: application.accountType || "company",
          name: application.name,
          email: application.email,
          phone: application.phone,
          country: application.country,
          companyName: application.companyName,
          crNumber: application.crNumber,
          taxNumber: application.taxNumber,
          nationalAddressStreet: application.nationalAddressStreet,
          nationalAddressBuilding: application.nationalAddressBuilding,
          nationalAddressDistrict: application.nationalAddressDistrict,
          nationalAddressCity: application.nationalAddressCity,
          nationalAddressPostalCode: application.nationalAddressPostalCode,
          // Default Shipping Address
          shippingContactName: application.shippingContactName,
          shippingContactPhone: application.shippingContactPhone,
          shippingCountryCode: application.shippingCountryCode,
          shippingStateOrProvince: application.shippingStateOrProvince,
          shippingCity: application.shippingCity,
          shippingPostalCode: application.shippingPostalCode,
          shippingAddressLine1: application.shippingAddressLine1,
          shippingAddressLine2: application.shippingAddressLine2,
          shippingShortAddress: application.shippingShortAddress,
          documents: application.documents,
          profile: profile || "regular",
          isActive: true,
        });

        // Create Zoho Books customer (if configured)
        if (zohoService.isConfigured()) {
          try {
            const zohoCustomerId = await zohoService.createCustomer({
              name: application.name,
              email: application.email,
              phone: application.phone,
              companyName: application.companyName || undefined,
              country: application.country,
              customerType: application.accountType === 'individual' ? 'individual' : 'business',
              billingCity: application.shippingCity || undefined,
              billingState: (application as any).shippingStateOrProvince || undefined,
              billingPostalCode: application.shippingPostalCode || undefined,
              billingStreet: application.shippingAddressLine1 || undefined,
              billingStreet2: application.shippingAddressLine2 || undefined,
            });
            if (zohoCustomerId) {
              await storage.updateClientAccount(clientAccount.id, { zohoCustomerId });
            }
          } catch (error) {
            logError("Failed to create Zoho customer", error);
          }
        }

        // Create user for client - generate unique username if needed
        let username = application.email.split("@")[0];
        let existingUsername = await storage.getUserByUsername(username);
        let counter = 1;
        while (existingUsername) {
          username = `${application.email.split("@")[0]}${counter}`;
          existingUsername = await storage.getUserByUsername(username);
          counter++;
        }
        
        // Hash the default password
        const hashedPassword = await bcrypt.hash("welcome123", SALT_ROUNDS);
        
        await storage.createUser({
          username,
          email: application.email,
          password: hashedPassword,
          userType: "client",
          clientAccountId: clientAccount.id,
          isPrimaryContact: true,
          mustChangePassword: true,
          isActive: true,
        });

        // Update application
        await storage.updateClientApplication(id, {
          status: "approved",
          reviewedBy: req.session.userId,
          reviewNotes: notes,
        });

        // Log application approval
        await logAudit(req.session.userId, "approve_application", "client_application", id, 
          `Approved application for ${application.email}, created client account`, req.ip);
        
        // Send email with credentials
        const temporaryPassword = "welcome123";
        await sendAccountCredentials(
          application.email,
          application.name,
          username,
          temporaryPassword
        );
        
        res.json({ success: true, clientAccount });
      } else if (action === "reject") {
        await storage.updateClientApplication(id, {
          status: "rejected",
          reviewedBy: req.session.userId,
          reviewNotes: notes,
        });
        
        // Log application rejection
        await logAudit(req.session.userId, "reject_application", "client_application", id,
          `Rejected application for ${application.email}`, req.ip);
        
        // Send rejection email
        await sendApplicationRejected(application.email, application.name, notes);
        
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
    } catch (error) {
      console.error("Error reviewing application:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/client-profile-options", requireAdminPermission("clients", "read"), async (_req, res) => {
    try {
      const pricingRules = await storage.getPricingRules();
      const profileOptions = pricingRules
        .map((rule) => ({ profile: rule.profile, displayName: rule.displayName || rule.profile }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      res.json(profileOptions);
    } catch (error) {
      logError("Error fetching client profile options", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - All Clients
  app.get("/api/admin/clients", requireAdminPermission("clients", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const profile = req.query.profile as string | undefined;
      const status = req.query.status as string | undefined;
      const accountManagerUserId = req.query.accountManagerUserId as string | undefined;
      const includeAssignedAccountManager = await canReadAccountManagerAssignments(adminUser);
      let clientAccountIds = await getScopedClientAccountIds(adminUser);

      if (accountManagerUserId && accountManagerUserId !== "all") {
        if (!includeAssignedAccountManager) {
          return res.status(403).json({ error: "Permission denied" });
        }

        let filteredClientIds: string[] = [];

        if (accountManagerUserId === "unassigned") {
          const [allClients, assignments] = await Promise.all([
            storage.getClientAccounts(),
            storage.getAccountManagerAssignments(),
          ]);
          const assignedClientIds = new Set(assignments.map((assignment) => assignment.clientAccountId));
          filteredClientIds = allClients
            .filter((client) => !assignedClientIds.has(client.id))
            .map((client) => client.id);
        } else {
          const accountManager = await getValidatedAccountManagerUser(accountManagerUserId);
          if (!accountManager) {
            return res.status(404).json({ error: "Account manager not found" });
          }

          filteredClientIds = await storage.getClientIdsForAccountManager(accountManagerUserId);
        }

        clientAccountIds = clientAccountIds
          ? clientAccountIds.filter((clientId) => filteredClientIds.includes(clientId))
          : filteredClientIds;
      }

      const result = await storage.getClientAccountsPaginated({
        page,
        limit,
        search,
        profile,
        status,
        clientAccountIds,
      });
      const clients = await Promise.all(
        result.clients.map((client) => serializeClientAccountForAdmin(client, { includeAssignedAccountManager })),
      );
      res.json({ ...result, clients });
    } catch (error) {
      logError("Error fetching clients", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Get Single Client
  app.get("/api/admin/clients/:id", requireAdminPermission("clients", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const includeAssignedAccountManager = await canReadAccountManagerAssignments(adminUser);
      const { id } = req.params;
      const client = await storage.getClientAccount(id);
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, client.id, res))) {
        return;
      }
      
      // Get client's user accounts
      const users = await storage.getUsersByClientAccount(id);
      
      // Get client's shipment count
      const shipments = await storage.getShipmentsByClientAccount(id);
      
      // Get client's invoice count
      const invoices = await storage.getInvoicesByClientAccount(id);
      
      res.json({
        ...(await serializeClientAccountForAdmin(client, { includeAssignedAccountManager })),
        users: users.map(u => ({ id: u.id, username: u.username, email: u.email, isActive: u.isActive })),
        shipmentCount: shipments.length,
        invoiceCount: invoices.length,
      });
    } catch (error) {
      logError("Error getting client details", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Create Client
  app.post("/api/admin/clients", requireAdminPermission("clients", "create"), async (req, res) => {
    try {
      const { 
        name, email, phone, country, companyName, documents, profile,
        assignedAccountManagerUserId,
        // Shipping address fields (optional for admin-created clients)
        shippingContactName, shippingContactPhone, shippingCountryCode,
        shippingStateOrProvince, shippingCity, shippingPostalCode, shippingAddressLine1,
        shippingAddressLine2, shippingShortAddress
      } = req.body;
      
      if (!name || !email || !phone || !country) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if user with this email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }

      const normalizedAssignedAccountManagerUserId =
        typeof assignedAccountManagerUserId === "string" && assignedAccountManagerUserId.trim().length > 0
          ? assignedAccountManagerUserId.trim()
          : null;

      let assignedAccountManager: User | null = null;
      if (assignedAccountManagerUserId !== undefined) {
        const accountManagerAssigner = await ensureAdminPermission(req, res, "account-managers", "assign");
        if (!accountManagerAssigner) {
          return;
        }

        assignedAccountManager = await getValidatedAccountManagerUser(normalizedAssignedAccountManagerUserId);
        if (normalizedAssignedAccountManagerUserId && !assignedAccountManager) {
          return res.status(400).json({ error: "Selected account manager is invalid" });
        }
      }

      const client = await storage.createClientAccount({
        name,
        email,
        phone,
        country,
        companyName: companyName || null,
        documents: documents || null,
        profile: profile || "regular",
        isActive: true,
        // Default Shipping Address (optional for admin-created clients)
        shippingContactName: shippingContactName || null,
        shippingContactPhone: shippingContactPhone || null,
        shippingCountryCode: shippingCountryCode || null,
        shippingStateOrProvince: shippingStateOrProvince || null,
        shippingCity: shippingCity || null,
        shippingPostalCode: shippingPostalCode || null,
        shippingAddressLine1: shippingAddressLine1 || null,
        shippingAddressLine2: shippingAddressLine2 || null,
        shippingShortAddress: shippingShortAddress || null,
      });

      // Create Zoho Books customer (if configured)
      if (zohoService.isConfigured()) {
        try {
          const zohoCustomerId = await zohoService.createCustomer({
            name,
            email,
            phone,
            companyName: companyName || undefined,
            country,
            billingCity: shippingCity || undefined,
            billingState: shippingStateOrProvince || undefined,
            billingPostalCode: shippingPostalCode || undefined,
            billingStreet: shippingAddressLine1 || undefined,
            billingStreet2: shippingAddressLine2 || undefined,
          });
          if (zohoCustomerId) {
            await storage.updateClientAccount(client.id, { zohoCustomerId });
          }
        } catch (error) {
          logError("Failed to create Zoho customer", error);
        }
      }

      // Create user for the client with a hashed password
      let username = email.split("@")[0];
      let existingUsername = await storage.getUserByUsername(username);
      let counter = 1;
      while (existingUsername) {
        username = `${email.split("@")[0]}${counter}`;
        existingUsername = await storage.getUserByUsername(username);
        counter++;
      }
      
      const hashedPassword = await bcrypt.hash("welcome123", SALT_ROUNDS);
      await storage.createUser({
        username,
        email,
        password: hashedPassword,
        userType: "client",
        clientAccountId: client.id,
        isPrimaryContact: true,
        mustChangePassword: true,
        isActive: true,
      });

      if (assignedAccountManagerUserId !== undefined) {
        await storage.setPrimaryAccountManagerForClient(client.id, normalizedAssignedAccountManagerUserId, req.session.userId);
      }

      // Log client creation
      await logAudit(req.session.userId, "create_client", "client_account", client.id,
        `Created client account for ${name} (${email})${assignedAccountManager ? ` and assigned ${assignedAccountManager.username} as account manager` : ""}`, req.ip);

      res.status(201).json(await serializeClientAccountForAdmin(client, { includeAssignedAccountManager: true }));
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Delete Client
  app.delete("/api/admin/clients/:id", requireAdminPermission("clients", "delete"), async (req, res) => {
    try {
      const { id } = req.params;
      const client = await storage.getClientAccount(id);
      await storage.deleteClientAccount(id);
      
      // Log client deletion
      await logAudit(req.session.userId, "delete_client", "client_account", id,
        `Deleted client account ${client?.name || id}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Client Profile
  app.patch("/api/admin/clients/:id/profile", requireAdminPermission("clients", "update"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const { id } = req.params;
      const { profile } = req.body;

      const client = await storage.getClientAccount(id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, client.id, res))) {
        return;
      }

      try {
        await validateClientProfileValue(profile);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid profile" });
      }

      if (client.profile === profile) {
        return res.status(400).json({ error: "Client already uses this profile" });
      }

      if (adminUser.isAccountManager) {
        const changeRequest = await storage.createAccountManagerClientChangeRequest({
          accountManagerUserId: adminUser.id,
          clientAccountId: client.id,
          requestType: AccountManagerChangeRequestType.PROFILE_UPDATE,
          requestedChanges: JSON.stringify({ profile }),
          status: AccountManagerChangeRequestStatus.PENDING,
        });

        await logAudit(req.session.userId, "request_client_profile_update", "account_manager_change_request", changeRequest.id,
          `Requested profile update for ${client.name} from ${client.profile} to ${profile}`, req.ip);

        return res.status(202).json({
          requiresApproval: true,
          request: changeRequest,
        });
      }
      
      const updateResult = await applyClientAccountUpdates(id, { profile });
      if (!updateResult) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Log profile change
      await logAudit(req.session.userId, "update_client_profile", "client_account", id,
        `Changed profile from ${client.profile} to ${profile} for ${client.name}`, req.ip);

      res.json(updateResult.updatedClient);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Toggle Client Status
  app.patch("/api/admin/clients/:id/status", requireAdminPermission("clients", "activate"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const { id } = req.params;
      const { isActive } = req.body;
      const client = await storage.getClientAccount(id);

      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, client.id, res))) {
        return;
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }

      if (adminUser.isAccountManager && isActive) {
        return res.status(403).json({ error: "Account managers can only deactivate clients directly" });
      }

      const updated = await storage.updateClientAccount(id, { isActive });
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }

      await logAudit(req.session.userId, isActive ? "activate_client" : "deactivate_client", "client_account", id,
        `${isActive ? "Activated" : "Deactivated"} client account ${client.name}`, req.ip);

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Full Update Client
  app.patch("/api/admin/clients/:id", requireAdminPermission("clients", "update"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const { id } = req.params;
      const { name, phone, country, companyName, crNumber, taxNumber, 
              nationalAddressStreet, nationalAddressBuilding, nationalAddressDistrict,
              nationalAddressCity, nationalAddressPostalCode, profile, isActive,
              assignedAccountManagerUserId,
              // Shipping Address fields
              shippingContactName, shippingContactPhone, shippingCountryCode,
              shippingStateOrProvince, shippingCity, shippingPostalCode,
              shippingAddressLine1, shippingAddressLine2, shippingShortAddress,
              // Arabic (Secondary Language) fields
              nameAr, companyNameAr,
              // Shipping Address Arabic fields
              shippingContactNameAr, shippingContactPhoneAr, shippingCountryCodeAr,
              shippingStateOrProvinceAr, shippingCityAr, shippingPostalCodeAr,
              shippingAddressLine1Ar, shippingAddressLine2Ar, shippingShortAddressAr } = req.body;

      const client = await storage.getClientAccount(id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, client.id, res))) {
        return;
      }

      const updates = buildClientAccountUpdates({
        name,
        phone,
        country,
        companyName,
        crNumber,
        taxNumber,
        nationalAddressStreet,
        nationalAddressBuilding,
        nationalAddressDistrict,
        nationalAddressCity,
        nationalAddressPostalCode,
        profile,
        isActive,
        shippingContactName,
        shippingContactPhone,
        shippingCountryCode,
        shippingStateOrProvince,
        shippingCity,
        shippingPostalCode,
        shippingAddressLine1,
        shippingAddressLine2,
        shippingShortAddress,
        nameAr,
        companyNameAr,
        shippingContactNameAr,
        shippingContactPhoneAr,
        shippingCountryCodeAr,
        shippingStateOrProvinceAr,
        shippingCityAr,
        shippingPostalCodeAr,
        shippingAddressLine1Ar,
        shippingAddressLine2Ar,
        shippingShortAddressAr,
      });

      if (updates.profile !== undefined) {
        try {
          await validateClientProfileValue(updates.profile);
        } catch (error) {
          return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid profile" });
        }
      }

      const hasAccountManagerAssignmentUpdate = assignedAccountManagerUserId !== undefined;
      const normalizedAssignedAccountManagerUserId =
        typeof assignedAccountManagerUserId === "string" && assignedAccountManagerUserId.trim().length > 0
          ? assignedAccountManagerUserId.trim()
          : null;
      let assignedAccountManager: User | null = null;

      if (hasAccountManagerAssignmentUpdate) {
        if (adminUser.isAccountManager) {
          return res.status(403).json({ error: "Account managers cannot reassign client ownership" });
        }

        const accountManagerAssigner = await ensureAdminPermission(req, res, "account-managers", "assign");
        if (!accountManagerAssigner) {
          return;
        }

        assignedAccountManager = await getValidatedAccountManagerUser(normalizedAssignedAccountManagerUserId);
        if (normalizedAssignedAccountManagerUserId && !assignedAccountManager) {
          return res.status(400).json({ error: "Selected account manager is invalid" });
        }
      }

      if (Object.keys(updates).length === 0 && !hasAccountManagerAssignmentUpdate) {
        return res.status(400).json({ error: "No client updates provided" });
      }

      if (adminUser.isAccountManager) {
        if (updates.isActive !== undefined) {
          return res.status(400).json({ error: "Use the status action to deactivate client accounts directly" });
        }

        const changeRequestType =
          Object.keys(updates).length === 1 && updates.profile !== undefined
            ? AccountManagerChangeRequestType.PROFILE_UPDATE
            : AccountManagerChangeRequestType.SETTINGS_UPDATE;

        const changeRequest = await storage.createAccountManagerClientChangeRequest({
          accountManagerUserId: adminUser.id,
          clientAccountId: client.id,
          requestType: changeRequestType,
          requestedChanges: JSON.stringify(updates),
          status: AccountManagerChangeRequestStatus.PENDING,
        });

        await logAudit(req.session.userId, "request_client_update", "account_manager_change_request", changeRequest.id,
          `Requested client update for ${client.name}`, req.ip);

        return res.status(202).json({
          requiresApproval: true,
          request: changeRequest,
        });
      }

      let updatedClient: ClientAccount | null = client;
      if (Object.keys(updates).length > 0) {
        const updateResult = await applyClientAccountUpdates(id, updates);
        if (!updateResult) {
          return res.status(404).json({ error: "Client not found" });
        }
        updatedClient = updateResult.updatedClient;
      }

      if (hasAccountManagerAssignmentUpdate) {
        await storage.setPrimaryAccountManagerForClient(id, normalizedAssignedAccountManagerUserId, req.session.userId);
      }

      await logAudit(req.session.userId, "update_client", "client_account", id,
        `Updated client account ${updatedClient.name}${hasAccountManagerAssignmentUpdate ? ` and ${assignedAccountManager ? `assigned ${assignedAccountManager.username} as account manager` : "cleared the account manager assignment"}` : ""}`, req.ip);

      res.json(await serializeClientAccountForAdmin(updatedClient, { includeAssignedAccountManager: true }));
    } catch (error) {
      logError("Error updating client", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - All Invoices
  app.get("/api/admin/invoices", requireAdminPermission("invoices", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const clientAccountIds = await getScopedClientAccountIds(adminUser);

      const result = await storage.getInvoicesPaginated({ page, limit, search, status, clientAccountIds });
      res.json(result);
    } catch (error) {
      logError("Error fetching invoices", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Get Single Invoice
  app.get("/api/admin/invoices/:id", requireAdminPermission("invoices", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, invoice.clientAccountId, res))) {
        return;
      }
      
      // Get client account info
      const client = await storage.getClientAccount(invoice.clientAccountId);
      
      res.json({ ...invoice, client });
    } catch (error) {
      logError("Error fetching invoice", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Download Invoice PDF
  app.get("/api/admin/invoices/:id/pdf", requireAdminPermission("invoices", "download"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, invoice.clientAccountId, res))) {
        return;
      }

      const client = await storage.getClientAccount(invoice.clientAccountId);
      
      // Generate simple HTML invoice
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Invoice ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .logo { font-size: 24px; font-weight: bold; color: #fe5200; }
            .invoice-info { text-align: right; }
            .invoice-number { font-size: 20px; font-weight: bold; }
            .client-info { margin-bottom: 30px; }
            .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            .table th { background: #f5f5f5; }
            .total-row { font-weight: bold; font-size: 18px; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
            .status-pending { background: #fef3c7; color: #92400e; }
            .status-paid { background: #d1fae5; color: #065f46; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">ezhalha</div>
            <div class="invoice-info">
              <div class="invoice-number">${invoice.invoiceNumber}</div>
              <div>Date: ${new Date(invoice.createdAt).toLocaleDateString()}</div>
              <div>Due: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
              <div class="status ${invoice.status === 'pending' ? 'status-pending' : 'status-paid'}">
                ${invoice.status === 'pending' ? 'Pending' : 'Paid'}
              </div>
            </div>
          </div>
          
          <div class="client-info">
            <strong>Bill To:</strong><br>
            ${client?.name || 'N/A'}<br>
            ${client?.companyName ? client.companyName + '<br>' : ''}
            ${client?.email || ''}<br>
            ${client?.phone || ''}
          </div>
          
          <table class="table">
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Shipping Services</td>
                <td style="text-align: right;">SAR ${Number(invoice.amount).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>Total</td>
                <td style="text-align: right;">SAR ${Number(invoice.amount).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>ezhalha Logistics - Enterprise Shipping Solutions</p>
          </div>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoiceNumber}.html"`);
      res.send(html);
    } catch (error) {
      logError("Error generating invoice PDF", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - All Payments
  app.get("/api/admin/payments", requireAdminPermission("payments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const clientAccountIds = await getScopedClientAccountIds(adminUser);

      const result = await storage.getPaymentsPaginated({ page, limit, search, status, clientAccountIds });
      res.json(result);
    } catch (error) {
      logError("Error fetching payments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/financial-statements", requireAdminPermission("payments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const now = new Date();
      const monthParam = req.query.month as string | undefined;
      const yearParam = req.query.year as string | undefined;
      const month = Math.min(Math.max(parseInt(monthParam || "") || now.getMonth() + 1, 1), 12);
      const year = parseInt(yearParam || "") || now.getFullYear();
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const searchTerms = parseFinancialSearchTerms(req.query.search as string | undefined);
      const scenario = ((req.query.scenario as string | undefined) || "all").toUpperCase();
      const startDateInput = req.query.startDate as string | undefined;
      const endDateInput = req.query.endDate as string | undefined;
      const clientPaymentStatus = ((req.query.clientPaymentStatus as string | undefined) || "all").toLowerCase();
      const carrierPaymentStatus = ((req.query.carrierPaymentStatus as string | undefined) || "all").toLowerCase();
      const carrierName = (req.query.carrierName as string | undefined)?.trim().toLowerCase();
      const clientAccountIds = await getScopedClientAccountIds(adminUser);

      if (!["all", "paid", "not_paid"].includes(clientPaymentStatus)) {
        return res.status(400).json({ error: "Invalid client payment status filter" });
      }

      if (!["all", "paid", "not_paid"].includes(carrierPaymentStatus)) {
        return res.status(400).json({ error: "Invalid carrier payment status filter" });
      }

      const startDate = parseDateParam(startDateInput);
      if (startDateInput && !startDate) {
        return res.status(400).json({ error: "Invalid start date filter" });
      }

      const endDate = parseDateParam(endDateInput, { endOfDay: true });
      if (endDateInput && !endDate) {
        return res.status(400).json({ error: "Invalid end date filter" });
      }

      if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
        return res.status(400).json({ error: "Start date cannot be after end date" });
      }

      const [allShipments, clients] = await Promise.all([
        storage.getShipments(),
        storage.getClientAccounts(),
      ]);

      const clientMap = new Map(clients.map((client) => [client.id, client]));
      const scopedShipments = allShipments.filter((shipment) =>
        !clientAccountIds || clientAccountIds.includes(shipment.clientAccountId),
      );

      const accountingShipments = scopedShipments.filter(
        (shipment) => shipment.taxScenario && shipment.accountingCurrency === "SAR",
      );
      const excludedLegacyShipmentCount = scopedShipments.length - accountingShipments.length;

      const searchedShipments = accountingShipments.filter((shipment) => {
        if (searchTerms.length === 0) return true;
        const client = clientMap.get(shipment.clientAccountId);
        const haystack = [
          shipment.trackingNumber,
          shipment.carrierTrackingNumber,
          shipment.carrierName,
          shipment.carrierCode,
          shipment.senderName,
          shipment.senderCity,
          shipment.senderCountry,
          shipment.recipientName,
          shipment.recipientCity,
          shipment.recipientCountry,
          shipment.taxScenario,
          client?.name,
          client?.accountNumber,
          client?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchTerms.some((term) => haystack.includes(term));
      });

      const scenarioFilteredShipments = searchedShipments.filter((shipment) => {
        if (scenario === "ALL") return true;
        return shipment.taxScenario === scenario;
      });

      const carrierFilteredShipments = scenarioFilteredShipments.filter((shipment) => {
        if (carrierName) {
          const carrierHaystack = [shipment.carrierName, shipment.carrierCode]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!carrierHaystack.includes(carrierName)) {
            return false;
          }
        }

        if (!matchesClientPaymentFilter(shipment, clientPaymentStatus as "all" | "paid" | "not_paid")) {
          return false;
        }

        if (!matchesCarrierPaymentFilter(shipment, carrierPaymentStatus as "all" | "paid" | "not_paid")) {
          return false;
        }

        return true;
      });

      const hasExplicitDateRange = Boolean(startDate || endDate);
      const hasExplicitPeriodFilter = hasExplicitDateRange || Boolean(monthParam || yearParam);
      const filteredRangeShipments = carrierFilteredShipments.filter((shipment) =>
        isWithinDateRange(new Date(shipment.createdAt), startDate, endDate),
      );

      const selectedPeriodShipments = hasExplicitDateRange
        ? filteredRangeShipments
        : hasExplicitPeriodFilter
          ? carrierFilteredShipments.filter((shipment) =>
              isSameMonthYear(new Date(shipment.createdAt), month, year),
            )
          : carrierFilteredShipments;

      const monthlySourceShipments = hasExplicitDateRange ? filteredRangeShipments : selectedPeriodShipments;
      const sourceDates = monthlySourceShipments.map((shipment) => new Date(shipment.createdAt));
      const selectedWindowEndMonth = new Date(year, month - 1, 1);
      const fallbackWindowStart = new Date(
        selectedWindowEndMonth.getFullYear(),
        selectedWindowEndMonth.getMonth() - (FINANCIAL_MONTH_WINDOW - 1),
        1,
      );
      const earliestSourceMonth = sourceDates.length > 0
        ? new Date(
            Math.min(...sourceDates.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime())),
          )
        : fallbackWindowStart;
      const latestSourceMonth = sourceDates.length > 0
        ? new Date(
            Math.max(...sourceDates.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime())),
          )
        : selectedWindowEndMonth;
      const monthlyWindowStart = startDate
        ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        : hasExplicitPeriodFilter
          ? fallbackWindowStart
          : earliestSourceMonth;
      const monthlyWindowEnd = endDate
        ? new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        : hasExplicitPeriodFilter
          ? selectedWindowEndMonth
          : latestSourceMonth;
      const monthlyStatements = buildMonthSequence(monthlyWindowStart, monthlyWindowEnd).map((date) => {
        const monthShipments = monthlySourceShipments.filter((shipment) =>
          isSameMonthYear(new Date(shipment.createdAt), date.getMonth() + 1, date.getFullYear()),
        );
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          label: buildMonthLabel(date),
          ...aggregateAccounting(monthShipments),
        };
      });

      const summary = aggregateAccounting(selectedPeriodShipments);
      const sortedSelectedShipments = selectedPeriodShipments.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const carrierTransactions = selectedPeriodShipments
        .filter((shipment) => shipment.carrierPaymentStatus === CarrierPaymentStatus.PAID && shipment.carrierPaidAt)
        .sort(
          (a, b) =>
            new Date(b.carrierPaidAt || b.updatedAt).getTime() -
            new Date(a.carrierPaidAt || a.updatedAt).getTime(),
        )
        .map((shipment) =>
          serializeCarrierPaymentTransaction(shipment, clientMap.get(shipment.clientAccountId)),
        );
      const offset = (page - 1) * limit;
      const paginatedShipments = sortedSelectedShipments.slice(offset, offset + limit);
      const paginatedShipmentsWithInvoices = await Promise.all(
        paginatedShipments.map(async (shipment) => ({
          shipment,
          relatedInvoices: await storage.getInvoicesByShipmentId(shipment.id),
        })),
      );

      res.json({
        month,
        year,
        startDate: startDateInput || null,
        endDate: endDateInput || null,
        clientPaymentStatus,
        carrierPaymentStatus,
        carrierName: carrierName || null,
        page,
        total: sortedSelectedShipments.length,
        totalPages: Math.ceil(sortedSelectedShipments.length / limit),
        excludedLegacyShipmentCount,
        summary,
        monthlyStatements,
        carrierTransactions,
        shipments: paginatedShipmentsWithInvoices.map(({ shipment, relatedInvoices }) =>
          serializeFinancialShipment(
            shipment,
            clientMap.get(shipment.clientAccountId),
            relatedInvoices,
          ),
        ),
      });
    } catch (error) {
      logError("Error fetching financial statements", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/carrier-payout-batches", requireAdminPermission("payments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const now = new Date();
      const month = Math.min(Math.max(parseInt(req.query.month as string) || now.getMonth() + 1, 1), 12);
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const carrierName = (req.query.carrierName as string | undefined)?.trim().toLowerCase();
      const clientAccountIds = await getScopedClientAccountIds(adminUser);
      const allShipments = await storage.getShipments();

      const scopedShipments = allShipments.filter((shipment) =>
        !clientAccountIds || clientAccountIds.includes(shipment.clientAccountId),
      );
      const carrierFilteredShipments = scopedShipments.filter((shipment) => {
        if (!carrierName) {
          return true;
        }

        const carrierHaystack = [shipment.carrierName, shipment.carrierCode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return carrierHaystack.includes(carrierName);
      });
      const eligibleShipments = carrierFilteredShipments.filter((shipment) =>
        isCarrierPayoutEligible(shipment, month, year),
      );
      const candidates = buildCarrierPayoutCandidates(eligibleShipments);

      const batches = await storage.getCarrierPayoutBatches({ month, year });
      const shipmentsByBatchId = new Map<string, Array<Record<string, any>>>();
      for (const shipment of allShipments) {
        if (!shipment.carrierPayoutBatchId) {
          continue;
        }
        const current = shipmentsByBatchId.get(shipment.carrierPayoutBatchId) || [];
        current.push(shipment);
        shipmentsByBatchId.set(shipment.carrierPayoutBatchId, current);
      }

      const visibleBatches = batches
        .filter((batch) => {
          const batchShipments = shipmentsByBatchId.get(batch.id) || [];
          if (!clientAccountIds) {
            return true;
          }
          if (batchShipments.length === 0) {
            return false;
          }
          return batchShipments.every((shipment) => clientAccountIds.includes(shipment.clientAccountId));
        })
        .filter((batch) => {
          if (!carrierName) {
            return true;
          }

          const carrierHaystack = [batch.carrierName, batch.carrierCode]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return carrierHaystack.includes(carrierName);
        })
        .map((batch) => ({
          ...batch,
          shipmentCount: Number(batch.shipmentCount) || 0,
          totalCarrierCostSar: parseMoneyValue(batch.totalCarrierCostSar),
          totalCostTaxSar: parseMoneyValue(batch.totalCostTaxSar),
          totalCarrierCostWithTaxSar: parseMoneyValue(batch.totalCarrierCostWithTaxSar),
        }));

      res.json({
        month,
        year,
        candidates,
        batches: visibleBatches,
      });
    } catch (error) {
      logError("Error fetching carrier payout batches", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/carrier-payout-batches", requireAdminPermission("payments", "create"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const bodySchema = z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        carrierKey: z.string().min(1),
        notes: z.string().trim().max(500).optional(),
      });
      const { month, year, carrierKey, notes } = bodySchema.parse(req.body);
      const clientAccountIds = await getScopedClientAccountIds(adminUser);
      const allShipments = await storage.getShipments();
      const eligibleShipments = allShipments.filter((shipment) =>
        (!clientAccountIds || clientAccountIds.includes(shipment.clientAccountId)) &&
        isCarrierPayoutEligible(shipment, month, year) &&
        getCarrierPayoutKey(shipment) === carrierKey,
      );

      if (eligibleShipments.length === 0) {
        return res.status(400).json({ error: "No eligible shipments found for this carrier and period" });
      }

      const batchTotals = eligibleShipments.reduce(
        (acc, shipment) => {
          const effective = getEffectiveShipmentFinancials(shipment);
          acc.totalCarrierCostSar += effective.costAmountSar;
          acc.totalCostTaxSar += effective.costTaxAmountSar;
          acc.totalCarrierCostWithTaxSar += effective.systemCostTotalAmountSar;
          return acc;
        },
        {
          totalCarrierCostSar: 0,
          totalCostTaxSar: 0,
          totalCarrierCostWithTaxSar: 0,
        },
      );

      const firstShipment = eligibleShipments[0];
      const batch = await storage.createCarrierPayoutBatch({
        carrierCode: firstShipment.carrierCode || null,
        carrierName: firstShipment.carrierName || firstShipment.carrierCode || "Unknown Carrier",
        month,
        year,
        status: CarrierPayoutBatchStatus.OPEN,
        shipmentCount: eligibleShipments.length,
        totalCarrierCostSar: formatMoney(roundMoney(batchTotals.totalCarrierCostSar)),
        totalCostTaxSar: formatMoney(roundMoney(batchTotals.totalCostTaxSar)),
        totalCarrierCostWithTaxSar: formatMoney(roundMoney(batchTotals.totalCarrierCostWithTaxSar)),
        notes: notes || null,
        createdByUserId: req.session.userId!,
        paidByUserId: null,
        paymentReference: null,
      });

      await Promise.all(
        eligibleShipments.map((shipment) =>
          storage.updateShipment(shipment.id, {
            carrierPaymentStatus: CarrierPaymentStatus.BATCHED,
            carrierPayoutBatchId: batch.id,
          }),
        ),
      );

      await logAudit(
        req.session.userId,
        "create_carrier_payout_batch",
        "carrier_payout_batch",
        batch.id,
        `Created carrier payout batch for ${batch.carrierName} (${month}/${year}) with ${eligibleShipments.length} shipments`,
        req.ip,
      );

      res.status(201).json({
        ...batch,
        shipmentCount: Number(batch.shipmentCount) || eligibleShipments.length,
        totalCarrierCostSar: parseMoneyValue(batch.totalCarrierCostSar),
        totalCostTaxSar: parseMoneyValue(batch.totalCostTaxSar),
        totalCarrierCostWithTaxSar: parseMoneyValue(batch.totalCarrierCostWithTaxSar),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error creating carrier payout batch", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/carrier-payout-batches/:id/mark-paid", requireAdminPermission("payments", "create"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const bodySchema = z.object({
        paymentReference: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(500).optional(),
      });
      const { paymentReference, notes } = bodySchema.parse(req.body ?? {});
      const batch = await storage.getCarrierPayoutBatch(req.params.id);

      if (!batch) {
        return res.status(404).json({ error: "Carrier payout batch not found" });
      }

      if (batch.status === CarrierPayoutBatchStatus.PAID) {
        return res.status(400).json({ error: "Carrier payout batch is already marked as paid" });
      }

      const clientAccountIds = await getScopedClientAccountIds(adminUser);
      const allShipments = await storage.getShipments();
      const batchShipments = allShipments.filter((shipment) => shipment.carrierPayoutBatchId === batch.id);

      if (batchShipments.length === 0) {
        return res.status(400).json({ error: "Carrier payout batch has no linked shipments" });
      }

      if (clientAccountIds && !batchShipments.every((shipment) => clientAccountIds.includes(shipment.clientAccountId))) {
        return res.status(403).json({ error: "Access denied to this carrier payout batch" });
      }

      const paidAt = new Date();
      const updatedBatch =
        (await storage.updateCarrierPayoutBatch(batch.id, {
          status: CarrierPayoutBatchStatus.PAID,
          paidAt,
          paidByUserId: req.session.userId!,
          paymentReference: paymentReference || batch.paymentReference,
          notes: notes || batch.notes,
        })) || batch;

      await Promise.all(
        batchShipments.map((shipment) =>
          storage.updateShipment(shipment.id, {
            carrierPaymentStatus: CarrierPaymentStatus.PAID,
            carrierPaidAt: paidAt,
            carrierPaymentAmountSar: formatMoney(getEffectiveShipmentFinancials(shipment).systemCostTotalAmountSar),
            carrierPaymentReference: paymentReference || null,
            carrierPaymentNote: notes || null,
          }),
        ),
      );

      await logAudit(
        req.session.userId,
        "mark_carrier_payout_paid",
        "carrier_payout_batch",
        batch.id,
        `Marked carrier payout batch ${batch.id} as paid`,
        req.ip,
      );

      res.json({
        ...updatedBatch,
        shipmentCount: Number(updatedBatch.shipmentCount) || batchShipments.length,
        totalCarrierCostSar: parseMoneyValue(updatedBatch.totalCarrierCostSar),
        totalCostTaxSar: parseMoneyValue(updatedBatch.totalCostTaxSar),
        totalCarrierCostWithTaxSar: parseMoneyValue(updatedBatch.totalCarrierCostWithTaxSar),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error marking carrier payout batch as paid", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/financial-statements/shipments/:id/mark-paid", requireAdminPermission("payments", "create"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }

      const result = await markShipmentClientPaymentPaid(shipment, req.session.userId!, req.ip);
      const client = await storage.getClientAccount(shipment.clientAccountId);

      res.json({
        shipment: result.shipment ? serializeFinancialShipment(result.shipment, client) : null,
        invoice: result.invoice || null,
        creditInvoice: result.creditInvoice || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      const statusCode = message === "Shipment not found" ? 404 : 400;
      if (statusCode === 400) {
        return res.status(statusCode).json({ error: message });
      }
      logError("Error marking shipment as paid from financial statements", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/financial-statements/shipments/:id/mark-carrier-paid", requireAdminPermission("payments", "create"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const bodySchema = z.object({
        paymentReference: z.string().trim().min(1, "Payment reference is required").max(200),
        paymentNote: z.string().trim().min(1, "Payment note is required").max(1000),
      });
      const { paymentReference, paymentNote } = bodySchema.parse(req.body ?? {});
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }

      const updatedShipment = await markShipmentCarrierPaymentPaid(
        shipment,
        req.session.userId!,
        {
          paymentReference,
          paymentNote,
        },
        req.ip,
      );
      const client = await storage.getClientAccount(shipment.clientAccountId);

      res.json(updatedShipment ? serializeFinancialShipment(updatedShipment, client) : null);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      const message = error instanceof Error ? error.message : "Internal server error";
      if (
        message === "Shipment not found" ||
        message === "Cancelled shipments cannot be marked as carrier-paid" ||
        message === "Shipment is not part of the SAR accounting schedule" ||
        message === "Shipment does not have a carrier tracking number yet" ||
        message === "Shipment is already marked as carrier-paid"
      ) {
        return res.status(400).json({ error: message });
      }
      logError("Error marking shipment as carrier-paid from financial statements", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/financial-statements/shipments/:id/cancel-carrier-payment", requireAdminPermission("payments", "create"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }

      const updatedShipment = await cancelShipmentCarrierPayment(shipment, req.session.userId!, req.ip);
      const client = await storage.getClientAccount(shipment.clientAccountId);

      res.json(updatedShipment ? serializeFinancialShipment(updatedShipment, client) : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      if (
        message === "Shipment not found" ||
        message === "Shipment does not have a paid carrier settlement"
      ) {
        return res.status(400).json({ error: message });
      }
      logError("Error cancelling shipment carrier payment from financial statements", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/financial-statements/shipments/:id/extra-fees", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }

      const bodySchema = z.object({
        extraFeesType: z.enum([ShipmentExtraFeeType.EXTRA_WEIGHT, ShipmentExtraFeeType.EXTRA_COST]).nullable().optional(),
        extraWeightValue: z.union([z.string(), z.number()]).nullable().optional(),
        extraCostAmountSar: z.union([z.string(), z.number()]).nullable().optional(),
        clear: z.boolean().optional(),
      });
      const { extraFeesType, extraWeightValue, extraCostAmountSar, clear } = bodySchema.parse(req.body ?? {});

      let nextExtraFeesType: string | null = null;
      let nextExtraFeesAmountSar: string | null = null;
      let nextExtraFeesWeightValue: string | null = null;
      let nextExtraFeesCostAmountSar: string | null = null;
      let nextExtraFeesAddedAt: Date | null = null;
      let nextExtraFeesEmailSentAt: Date | null = null;

      if (!clear) {
        const hasWeightInput = extraWeightValue !== undefined && extraWeightValue !== null && String(extraWeightValue).trim() !== "";
        const hasCostInput = extraCostAmountSar !== undefined && extraCostAmountSar !== null && String(extraCostAmountSar).trim() !== "";

        if (!hasWeightInput && !hasCostInput && !extraFeesType) {
          return res.status(400).json({ error: "Provide an extra weight value, an extra cost amount, or both" });
        }

        let parsedWeightValue = parseMoneyValue(shipment.extraFeesWeightValue);
        let parsedCostAmount = parseMoneyValue(shipment.extraFeesCostAmountSar);

        if (hasWeightInput) {
          parsedWeightValue =
            typeof extraWeightValue === "number" ? extraWeightValue : Number(extraWeightValue);
          if (!Number.isFinite(parsedWeightValue) || parsedWeightValue < 0) {
            return res.status(400).json({ error: "Extra weight must be a valid non-negative value" });
          }
        } else if (extraFeesType === ShipmentExtraFeeType.EXTRA_WEIGHT) {
          parsedWeightValue = 0;
        }

        if (hasCostInput) {
          parsedCostAmount =
            typeof extraCostAmountSar === "number" ? extraCostAmountSar : Number(extraCostAmountSar);
          if (!Number.isFinite(parsedCostAmount) || parsedCostAmount < 0) {
            return res.status(400).json({ error: "Extra cost must be a valid non-negative amount" });
          }
        } else if (extraFeesType === ShipmentExtraFeeType.EXTRA_COST) {
          parsedCostAmount = 0;
        }

        const ratePerWeight = getExtraFeesRateSarPerWeight(shipment);
        const extraWeightAmountSar = parsedWeightValue > 0
          ? roundMoney(parsedWeightValue * ratePerWeight)
          : 0;
        const totalExtraFeesAmountSar = roundMoney(extraWeightAmountSar + parsedCostAmount);

        if (totalExtraFeesAmountSar > 0) {
          nextExtraFeesAddedAt = new Date();
          nextExtraFeesWeightValue = parsedWeightValue > 0 ? formatMoney(parsedWeightValue) : null;
          nextExtraFeesCostAmountSar = parsedCostAmount > 0 ? formatMoney(parsedCostAmount) : null;
          nextExtraFeesAmountSar = formatMoney(totalExtraFeesAmountSar);

          if (parsedWeightValue > 0 && parsedCostAmount > 0) {
            nextExtraFeesType = ShipmentExtraFeeType.COMBINED;
          } else if (parsedWeightValue > 0) {
            nextExtraFeesType = ShipmentExtraFeeType.EXTRA_WEIGHT;
          } else if (parsedCostAmount > 0) {
            nextExtraFeesType = ShipmentExtraFeeType.EXTRA_COST;
          }
        }
      }

      const updatedShipment = await storage.updateShipment(shipment.id, {
        extraFeesAmountSar: nextExtraFeesAmountSar,
        extraFeesType: nextExtraFeesType,
        extraFeesWeightValue: nextExtraFeesWeightValue,
        extraFeesCostAmountSar: nextExtraFeesCostAmountSar,
        extraFeesAddedAt: nextExtraFeesAddedAt,
        extraFeesEmailSentAt: nextExtraFeesEmailSentAt,
      });
      const refreshedShipment = (await storage.getShipment(shipment.id)) || updatedShipment || shipment;
      const syncedExtraFeeInvoices = await syncShipmentExtraFeeInvoices(refreshedShipment);
      const client = await storage.getClientAccount(shipment.clientAccountId);

      if (
        refreshedShipment &&
        client &&
        client.email &&
        !clear
      ) {
        try {
          const feeComponents = getShipmentExtraFeeComponents(refreshedShipment);
          let sentAnyEmail = false;

          for (const component of feeComponents) {
            if (
              component.invoiceType !== InvoiceType.EXTRA_WEIGHT &&
              component.invoiceType !== InvoiceType.EXTRA_COST
            ) {
              continue;
            }

            const relatedInvoice = syncedExtraFeeInvoices[component.invoiceType];
            if (!relatedInvoice || relatedInvoice.status !== "pending") {
              continue;
            }

            const emailSent = await sendShipmentExtraFeesNotification({
              email: client.email,
              clientName: client.name,
              trackingNumber: shipment.trackingNumber,
              amountSar: formatMoney(parseMoneyValue(relatedInvoice.amount)),
              extraFeeType: component.invoiceType,
              extraWeightValue:
                component.invoiceType === InvoiceType.EXTRA_WEIGHT && component.weightValue !== undefined
                  ? formatMoney(component.weightValue)
                  : null,
              weightUnit: shipment.weightUnit,
              extraCostAmountSar:
                component.invoiceType === InvoiceType.EXTRA_COST && component.costAmountSar !== undefined
                  ? formatMoney(component.costAmountSar)
                  : null,
              invoiceNumber: relatedInvoice.invoiceNumber,
            });

            if (emailSent) {
              sentAnyEmail = true;
            }
          }

          if (sentAnyEmail) {
            nextExtraFeesEmailSentAt = new Date();
            await storage.updateShipment(shipment.id, {
              extraFeesEmailSentAt: nextExtraFeesEmailSentAt,
            });
          }
        } catch (emailError) {
          logError("Error sending shipment extra fees email", emailError, {
            shipmentId: shipment.id,
            clientAccountId: shipment.clientAccountId,
          });
        }
      }

      await logAudit(
        req.session.userId,
        "update_extra_fees",
        "shipment",
        shipment.id,
        clear
          ? `Cleared extra fees for shipment ${shipment.trackingNumber}`
          : `Updated ${nextExtraFeesType} extra fees for shipment ${shipment.trackingNumber} to SAR ${nextExtraFeesAmountSar}`,
        req.ip,
      );

      res.json(serializeFinancialShipment(refreshedShipment, client));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error updating shipment extra fees", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ADMIN - CREDIT ACCESS REQUESTS
  // ============================================

  app.get("/api/admin/credit-requests", requireAdminPermission("credit-requests", "read"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const result = await storage.getCreditAccessRequests({ status, page, limit });

      const enrichedRequests = await Promise.all(
        result.requests.map(async (request) => {
          const clientAccount = await storage.getClientAccount(request.clientAccountId);
          const requestedBy = await storage.getUser(request.requestedByUserId);
          const reviewedBy = request.reviewedByUserId ? await storage.getUser(request.reviewedByUserId) : null;
          return {
            ...request,
            clientName: clientAccount?.name || "Unknown",
            clientEmail: clientAccount?.email || "",
            accountNumber: clientAccount?.accountNumber || "",
            companyName: clientAccount?.companyName || "",
            requestedByName: requestedBy?.username || "Unknown",
            reviewedByName: reviewedBy?.username || null,
          };
        })
      );

      res.json({ ...result, requests: enrichedRequests });
    } catch (error: any) {
      logError("Error fetching credit access requests", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/credit-requests/:id/approve", requireAdminPermission("credit-requests", "approve"), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const adminUser = await storage.getUser(req.session.userId!);

      const request = await storage.updateCreditAccessRequest(id, {
        status: "approved",
        adminNotes: adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      await storage.updateClientAccount(request.clientAccountId, { creditEnabled: true } as any);

      logAuditToFile({
        userId: req.session.userId!,
        action: "approve_credit_access",
        resource: "credit_access_request",
        resourceId: id,
        details: `Admin ${adminUser?.username} approved credit access for client ${request.clientAccountId}`,
        ipAddress: req.ip || "unknown",
      });

      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error approving credit request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/credit-requests/:id/reject", requireAdminPermission("credit-requests", "reject"), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const adminUser = await storage.getUser(req.session.userId!);

      const request = await storage.updateCreditAccessRequest(id, {
        status: "rejected",
        adminNotes: adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      logAuditToFile({
        userId: req.session.userId!,
        action: "reject_credit_access",
        resource: "credit_access_request",
        resourceId: id,
        details: `Admin ${adminUser?.username} rejected credit access for client ${request.clientAccountId}`,
        ipAddress: req.ip || "unknown",
      });

      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error rejecting credit request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/credit-requests/:id/revoke", requireAdminPermission("credit-requests", "revoke"), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const adminUser = await storage.getUser(req.session.userId!);

      const request = await storage.updateCreditAccessRequest(id, {
        status: "revoked",
        adminNotes: adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      await storage.updateClientAccount(request.clientAccountId, { creditEnabled: false } as any);

      logAuditToFile({
        userId: req.session.userId!,
        action: "revoke_credit_access",
        resource: "credit_access_request",
        resourceId: id,
        details: `Admin ${adminUser?.username} revoked credit access for client ${request.clientAccountId}`,
        ipAddress: req.ip || "unknown",
      });

      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error revoking credit request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ADMIN - EMAIL TEMPLATES
  // ============================================

  app.get("/api/admin/email-templates", requireAdminPermission("email-templates", "read"), async (req, res) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json(templates);
    } catch (error: any) {
      logError("Error fetching email templates", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/email-templates/:id", requireAdminPermission("email-templates", "read"), async (req, res) => {
    try {
      const template = await storage.getEmailTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      logError("Error fetching email template", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/admin/email-templates/:id", requireAdminPermission("email-templates", "update"), async (req, res) => {
    try {
      const { z } = await import("zod");
      const updateSchema = z.object({
        subject: z.string().min(1, "Subject is required").max(500),
        htmlBody: z.string().min(1, "HTML body is required"),
        isActive: z.boolean().optional().default(true),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { subject, htmlBody, isActive } = parsed.data;

      const template = await storage.updateEmailTemplate(req.params.id, {
        subject,
        htmlBody,
        isActive,
        updatedByUserId: req.session.userId,
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      logAuditToFile({
        userId: req.session.userId!,
        action: "update_email_template",
        resource: "email_template",
        resourceId: template.id,
        details: `Updated email template: ${template.slug}`,
        ipAddress: req.ip || "unknown",
      });

      res.json(template);
    } catch (error: any) {
      logError("Error updating email template", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/email-templates/:id/reset", requireAdminPermission("email-templates", "update"), async (req, res) => {
    try {
      const template = await storage.getEmailTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const { DEFAULT_TEMPLATES } = await import("./services/email-templates");
      const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.slug === template.slug);
      if (!defaultTemplate) {
        return res.status(404).json({ error: "Default template not found for this slug" });
      }

      const updated = await storage.updateEmailTemplate(req.params.id, {
        subject: defaultTemplate.subject,
        htmlBody: defaultTemplate.htmlBody,
        isActive: true,
        updatedByUserId: req.session.userId,
      });

      logAuditToFile({
        userId: req.session.userId!,
        action: "reset_email_template",
        resource: "email_template",
        resourceId: template.id,
        details: `Reset email template to default: ${template.slug}`,
        ipAddress: req.ip || "unknown",
      });

      res.json(updated);
    } catch (error: any) {
      logError("Error resetting email template", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/email-templates/:id/preview", requireAdminPermission("email-templates", "read"), async (req, res) => {
    try {
      const { subject, htmlBody } = req.body;
      const template = await storage.getEmailTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const { renderTemplate } = await import("./services/email-templates");
      const variables: Record<string, string> = {};
      const availableVars = JSON.parse(template.availableVariables || "[]");
      for (const v of availableVars) {
        variables[v] = `[${v}]`;
      }
      variables["year"] = new Date().getFullYear().toString();
      variables["app_url"] = process.env.APP_URL || "https://app.ezhalha.co";
      variables["login_url"] = process.env.APP_URL || "https://app.ezhalha.co";
      variables["urgency_color"] = "#f59e0b";

      const rendered = renderTemplate(
        htmlBody || template.htmlBody,
        subject || template.subject,
        variables
      );

      res.json({ html: rendered.html, subject: rendered.subject });
    } catch (error: any) {
      logError("Error previewing email template", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ADMIN - CREDIT INVOICES
  // ============================================

  // Admin - List Credit Invoices
  app.get("/api/admin/credit-invoices", requireAdminPermission("credit-invoices", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const status = req.query.status as string | undefined;
      const clientId = req.query.clientId as string | undefined;
      const overdueOnly = req.query.overdueOnly === "true";
      const scopedClientAccountIds = await getScopedClientAccountIds(adminUser);

      const result = await storage.getCreditInvoices({
        page,
        limit,
        status,
        clientAccountId: clientId,
        clientAccountIds: scopedClientAccountIds,
        overdueOnly,
      });

      const enriched = await Promise.all(result.invoices.map(async (inv) => {
        const shipment = await storage.getShipment(inv.shipmentId);
        const client = await storage.getClientAccount(inv.clientAccountId);
        return {
          ...inv,
          shipment: shipment ? {
            id: shipment.id,
            trackingNumber: shipment.trackingNumber,
            carrierTrackingNumber: shipment.carrierTrackingNumber,
            status: shipment.status,
            shipmentType: shipment.shipmentType,
            serviceType: shipment.serviceType,
            carrierCode: shipment.carrierCode,
            senderName: shipment.senderName,
            senderCity: shipment.senderCity,
            senderCountry: shipment.senderCountry,
            senderPhone: shipment.senderPhone,
            senderAddress: shipment.senderAddress,
            senderPostalCode: shipment.senderPostalCode,
            recipientName: shipment.recipientName,
            recipientCity: shipment.recipientCity,
            recipientCountry: shipment.recipientCountry,
            recipientPhone: shipment.recipientPhone,
            recipientAddress: shipment.recipientAddress,
            recipientPostalCode: shipment.recipientPostalCode,
            weight: shipment.weight,
            weightUnit: shipment.weightUnit,
            numberOfPackages: shipment.numberOfPackages,
            packageType: shipment.packageType,
            baseRate: shipment.baseRate,
            marginAmount: shipment.marginAmount,
            finalPrice: shipment.finalPrice,
            currency: shipment.currency,
            paymentMethod: shipment.paymentMethod,
            paymentStatus: shipment.paymentStatus,
            itemsData: shipment.itemsData,
            createdAt: shipment.createdAt,
          } : null,
          client: client ? {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            accountNumber: client.accountNumber,
            accountType: client.accountType,
            companyName: client.companyName,
            country: client.country,
          } : null,
        };
      }));

      res.json({ ...result, invoices: enriched });
    } catch (error) {
      logError("Error fetching admin credit invoices", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Get Single Credit Invoice
  app.get("/api/admin/credit-invoices/:id", requireAdminPermission("credit-invoices", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const invoice = await storage.getCreditInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Credit invoice not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, invoice.clientAccountId, res))) {
        return;
      }

      const shipment = await storage.getShipment(invoice.shipmentId);
      const client = await storage.getClientAccount(invoice.clientAccountId);
      const events = await storage.getCreditNotificationEvents(invoice.id);

      res.json({ ...invoice, shipment, client, events });
    } catch (error) {
      logError("Error fetching credit invoice", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Mark Credit Invoice as Paid
  app.post("/api/admin/credit-invoices/:id/mark-paid", requireAdminPermission("credit-invoices", "update"), async (req, res) => {
    try {
      const invoice = await storage.getCreditInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Credit invoice not found" });
      }

      if (invoice.status === "PAID") {
        return res.status(400).json({ error: "Invoice is already paid" });
      }

      if (invoice.status === "CANCELLED") {
        return res.status(400).json({ error: "Cannot mark a cancelled invoice as paid" });
      }

      const result = await markCreditInvoicePaid(invoice, req.session.userId!, req.ip);
      res.json(result.updatedInvoice);
    } catch (error) {
      logError("Error marking credit invoice as paid", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Cancel Credit Invoice
  app.post("/api/admin/credit-invoices/:id/cancel", requireAdminPermission("credit-invoices", "cancel"), async (req, res) => {
    try {
      const invoice = await storage.getCreditInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Credit invoice not found" });
      }

      if (invoice.status === "PAID") {
        return res.status(400).json({ error: "Cannot cancel a paid invoice" });
      }

      const updated = await storage.updateCreditInvoice(invoice.id, {
        status: "CANCELLED",
        nextReminderAt: null,
      });

      await storage.createCreditNotificationEvent({
        clientAccountId: invoice.clientAccountId,
        creditInvoiceId: invoice.id,
        type: "CANCELLED",
        sentAt: new Date(),
        meta: JSON.stringify({ cancelledBy: req.session.userId }),
      });

      await logAudit(req.session.userId, "cancel_credit_invoice", "credit_invoice", invoice.id,
        `Cancelled credit invoice for shipment ${invoice.shipmentId}`, req.ip);

      res.json(updated);
    } catch (error) {
      logError("Error cancelling credit invoice", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Pricing Rules
  app.get("/api/admin/pricing", requireAdminPermission("pricing-rules", "read"), async (_req, res) => {
    const rules = await storage.getPricingRules();
    res.json(rules);
  });

  // Admin - Create Pricing Profile
  app.post("/api/admin/pricing", requireAdminPermission("pricing-rules", "create"), async (req, res) => {
    try {
      const { profile, displayName, marginPercentage } = req.body;
      
      if (!profile || !displayName) {
        return res.status(400).json({ error: "Profile key and display name are required" });
      }

      // Validate profile key format (lowercase, underscores, no spaces)
      const profileKey = profile.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (!profileKey) {
        return res.status(400).json({ error: "Invalid profile key" });
      }

      // Check if profile already exists
      const existing = await storage.getPricingRuleByProfile(profileKey);
      if (existing) {
        return res.status(400).json({ error: "A profile with this key already exists" });
      }

      const margin = parseFloat(marginPercentage || "15");
      if (isNaN(margin) || margin < 0 || margin > 100) {
        return res.status(400).json({ error: "Invalid margin percentage" });
      }

      const newRule = await storage.createPricingRule({
        profile: profileKey,
        displayName: displayName.trim(),
        marginPercentage: margin.toFixed(2),
        isActive: true,
      });

      await logAudit(req.session.userId, "create_pricing_profile", "pricing_rule", newRule.id,
        `Created pricing profile: ${displayName} with ${margin}% margin`, req.ip);

      res.status(201).json(newRule);
    } catch (error) {
      logError("Error creating pricing profile", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Pricing Rule
  app.patch("/api/admin/pricing/:id", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const { id } = req.params;
      const { marginPercentage, displayName, isActive } = req.body;
      
      const updates: { marginPercentage?: string; displayName?: string; isActive?: boolean } = {};

      if (marginPercentage !== undefined) {
        const margin = parseFloat(marginPercentage);
        if (isNaN(margin) || margin < 0 || margin > 100) {
          return res.status(400).json({ error: "Invalid margin percentage" });
        }
        updates.marginPercentage = margin.toFixed(2);
      }

      if (displayName !== undefined) {
        if (!displayName.trim()) {
          return res.status(400).json({ error: "Display name cannot be empty" });
        }
        updates.displayName = displayName.trim();
      }

      if (isActive !== undefined) {
        updates.isActive = isActive;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid updates provided" });
      }

      const updated = await storage.updatePricingRule(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Pricing rule not found" });
      }

      const changeDetails = [];
      if (updates.marginPercentage) changeDetails.push(`margin to ${updates.marginPercentage}%`);
      if (updates.displayName) changeDetails.push(`name to "${updates.displayName}"`);
      if (updates.isActive !== undefined) changeDetails.push(`active to ${updates.isActive}`);

      await logAudit(req.session.userId, "update_pricing", "pricing_rule", id,
        `Updated ${changeDetails.join(", ")}`, req.ip);

      res.json(updated);
    } catch (error) {
      logError("Error updating pricing rule", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Delete Pricing Profile
  app.delete("/api/admin/pricing/:id", requireAdminPermission("pricing-rules", "delete"), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if profile exists
      const rules = await storage.getPricingRules();
      const rule = rules.find(r => r.id === id);
      if (!rule) {
        return res.status(404).json({ error: "Pricing rule not found" });
      }

      // Don't allow deleting if there are clients using this profile
      const clients = await storage.getClientAccounts();
      const clientsUsingProfile = clients.filter(c => c.profile === rule.profile);
      if (clientsUsingProfile.length > 0) {
        return res.status(400).json({ 
          error: `Cannot delete profile. ${clientsUsingProfile.length} client(s) are using this profile.` 
        });
      }

      await storage.deletePricingRule(id);
      
      await logAudit(req.session.userId, "delete_pricing_profile", "pricing_rule", id,
        `Deleted pricing profile: ${rule.displayName}`, req.ip);

      res.json({ success: true });
    } catch (error) {
      logError("Error deleting pricing profile", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Get Pricing Tiers for a Profile
  app.get("/api/admin/pricing/:id/tiers", requireAdminPermission("pricing-rules", "read"), async (req, res) => {
    try {
      const { id } = req.params;
      const tiers = await storage.getPricingTiersByProfileId(id);
      res.json(tiers);
    } catch (error) {
      logError("Error fetching pricing tiers", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Create Pricing Tier
  const pricingTierSchema = z.object({
    minAmount: z.number().min(0, "Minimum amount must be 0 or greater"),
    marginPercentage: z.number().min(0, "Margin must be 0 or greater").max(1000, "Margin cannot exceed 1000%"),
  });

  app.post("/api/admin/pricing/:id/tiers", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const { id } = req.params;
      
      const { minAmount, marginPercentage } = pricingTierSchema.parse(req.body);

      // Verify profile exists
      const profile = await storage.getPricingRuleById(id);
      if (!profile) {
        return res.status(404).json({ error: "Pricing profile not found" });
      }

      const tier = await storage.createPricingTier({
        profileId: id,
        minAmount: String(minAmount),
        marginPercentage: String(marginPercentage),
      });

      await logAudit(req.session.userId, "create_pricing_tier", "pricing_tier", tier.id,
        `Created pricing tier for ${profile.displayName}: SAR ${minAmount}+ at ${marginPercentage}%`, req.ip);

      res.status(201).json(tier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error creating pricing tier", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Pricing Tier
  const pricingTierUpdateSchema = z.object({
    minAmount: z.number().min(0, "Minimum amount must be 0 or greater").optional(),
    marginPercentage: z.number().min(0, "Margin must be 0 or greater").max(1000, "Margin cannot exceed 1000%").optional(),
  });

  app.patch("/api/admin/pricing/tiers/:tierId", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const { tierId } = req.params;
      
      const validated = pricingTierUpdateSchema.parse(req.body);

      const updates: any = {};
      if (validated.minAmount !== undefined) updates.minAmount = String(validated.minAmount);
      if (validated.marginPercentage !== undefined) updates.marginPercentage = String(validated.marginPercentage);

      const tier = await storage.updatePricingTier(tierId, updates);
      if (!tier) {
        return res.status(404).json({ error: "Pricing tier not found" });
      }

      await logAudit(req.session.userId, "update_pricing_tier", "pricing_tier", tierId,
        `Updated pricing tier: SAR ${tier.minAmount}+ at ${tier.marginPercentage}%`, req.ip);

      res.json(tier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error updating pricing tier", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Delete Pricing Tier
  app.delete("/api/admin/pricing/tiers/:tierId", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const { tierId } = req.params;
      await storage.deletePricingTier(tierId);

      await logAudit(req.session.userId, "delete_pricing_tier", "pricing_tier", tierId,
        "Deleted pricing tier", req.ip);

      res.json({ success: true });
    } catch (error) {
      logError("Error deleting pricing tier", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - System Logs (Bugs & Errors)
  app.get("/api/admin/system-logs", requireAdminPermission("system-logs", "read"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const level = req.query.level as string | undefined;
      const source = req.query.source as string | undefined;
      const search = req.query.search as string | undefined;
      const resolved = req.query.resolved as string | undefined;

      const result = await storage.getSystemLogsPaginated({ page, limit, level, source, search, resolved });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  app.get("/api/admin/system-logs/stats", requireAdminPermission("system-logs", "read"), async (req, res) => {
    try {
      const stats = await storage.getSystemLogStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system log stats" });
    }
  });

  app.patch("/api/admin/system-logs/:id/resolve", requireAdminPermission("system-logs", "resolve"), async (req, res) => {
    try {
      const log = await storage.resolveSystemLog(req.params.id, req.session.userId!);
      if (!log) {
        return res.status(404).json({ error: "Log not found" });
      }
      await logAudit(req.session.userId!, "resolve_bug", "system_log", req.params.id,
        `Resolved system log: ${log.message.substring(0, 100)}`, req.ip);
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Failed to resolve system log" });
    }
  });

  // Admin - Audit Logs (paginated)
  app.get("/api/admin/audit-logs", requireAdminPermission("audit-logs", "read"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const entityType = req.query.entityType as string | undefined;
      const action = req.query.action as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await storage.getAuditLogsPaginated({
        page,
        limit,
        search,
        entityType,
        action,
        startDate,
        endDate,
      });

      res.json(result);
    } catch (error) {
      logError("Error fetching audit logs", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Audit Log Stats
  app.get("/api/admin/audit-logs/stats", requireAdminPermission("audit-logs", "read"), async (_req, res) => {
    try {
      const stats = await storage.getAuditLogStats();
      res.json(stats);
    } catch (error) {
      logError("Error fetching audit log stats", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Integration Logs
  app.get("/api/admin/integration-logs", requireAdminPermission("integrations", "read"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const service = req.query.service as string | undefined;
      const success = req.query.success as string | undefined;

      const result = await storage.getIntegrationLogsPaginated({ page, limit, search, service, success });
      res.json(result);
    } catch (error) {
      logError("Error fetching integration logs", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Webhook Events
  app.get("/api/admin/webhook-events", requireAdminPermission("webhooks", "read"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const source = req.query.source as string | undefined;
      const processed = req.query.processed as string | undefined;

      const result = await storage.getWebhookEventsPaginated({ page, limit, search, source, processed });
      res.json(result);
    } catch (error) {
      logError("Error fetching webhook events", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // RBAC MANAGEMENT ROUTES
  // ============================================

  // Roles CRUD
  app.get("/api/admin/roles", requireAdminPermission("roles", "read"), async (_req, res) => {
    try {
      const allRoles = await storage.getRoles();
      res.json(mergeRolesWithSystemRoles(allRoles));
    } catch (error) {
      logError("Error fetching roles", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/roles/:id", requireAdminPermission("roles", "read"), async (req, res) => {
    try {
      const role = await getRoleWithSystemRoles(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      const allPermissions = await storage.getPermissions();
      let assignedPermissions: Permission[] = [];

      if (isAccountManagerSystemRoleId(role.id)) {
        const fixedPermissionNames = new Set<string>(ACCOUNT_MANAGER_FIXED_PERMISSION_NAMES);
        assignedPermissions = allPermissions.filter((permission) => fixedPermissionNames.has(permission.name));
      } else {
        const rolePermissions = await storage.getRolePermissions(role.id);
        assignedPermissions = allPermissions.filter((permission) =>
          rolePermissions.some((rolePermission) => rolePermission.permissionId === permission.id),
        );
      }
      
      res.json({ ...role, permissions: assignedPermissions });
    } catch (error) {
      logError("Error fetching role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/roles", requireAdminPermission("roles", "create"), async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Role name is required" });
      }

      if (name.trim().toLowerCase() === ACCOUNT_MANAGER_SYSTEM_ROLE_NAME.toLowerCase()) {
        return res.status(400).json({ error: `"${ACCOUNT_MANAGER_SYSTEM_ROLE_NAME}" is a built-in system role` });
      }

      const role = await storage.createRole({ name, description });
      await logAudit(req.session.userId, "create_role", "role", role.id,
        `Created role: ${name}`, req.ip);
      
      res.status(201).json(role);
    } catch (error) {
      logError("Error creating role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/roles/:id", requireAdminPermission("roles", "update"), async (req, res) => {
    try {
      if (isSystemRoleId(req.params.id)) {
        return res.status(400).json({ error: "System roles cannot be edited" });
      }

      const { name, description, isActive } = req.body;
      const updates: { name?: string; description?: string; isActive?: boolean } = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.isActive = isActive;

      if (updates.name?.trim().toLowerCase() === ACCOUNT_MANAGER_SYSTEM_ROLE_NAME.toLowerCase()) {
        return res.status(400).json({ error: `"${ACCOUNT_MANAGER_SYSTEM_ROLE_NAME}" is reserved for the system role` });
      }

      const role = await storage.updateRole(req.params.id, updates);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      await logAudit(req.session.userId, "update_role", "role", role.id,
        `Updated role: ${role.name}`, req.ip);
      
      res.json(role);
    } catch (error) {
      logError("Error updating role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/roles/:id", requireAdminPermission("roles", "delete"), async (req, res) => {
    try {
      if (isSystemRoleId(req.params.id)) {
        return res.status(400).json({ error: "System roles cannot be deleted" });
      }

      const role = await storage.getRole(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      await storage.deleteRole(req.params.id);
      await logAudit(req.session.userId, "delete_role", "role", req.params.id,
        `Deleted role: ${role.name}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error deleting role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Permissions CRUD
  app.get("/api/admin/permissions", requireAdminPermission("permissions", "read"), async (_req, res) => {
    try {
      const allPermissions = await storage.getPermissions();
      res.json(allPermissions);
    } catch (error) {
      logError("Error fetching permissions", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/permissions", requireAdminPermission("permissions", "create"), async (req, res) => {
    try {
      const { name, description, resource, action } = req.body;
      if (!resource || !action) {
        return res.status(400).json({ error: "Resource and action are required" });
      }

      const permissionName = name || `${resource}:${action}`;
      const permission = await storage.createPermission({ name: permissionName, description, resource, action });
      await logAudit(req.session.userId, "create_permission", "permission", permission.id,
        `Created permission: ${permissionName}`, req.ip);
      
      res.status(201).json(permission);
    } catch (error) {
      logError("Error creating permission", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/permissions/:id", requireAdminPermission("permissions", "delete"), async (req, res) => {
    try {
      const permission = await storage.getPermission(req.params.id);
      if (!permission) {
        return res.status(404).json({ error: "Permission not found" });
      }

      await storage.deletePermission(req.params.id);
      await logAudit(req.session.userId, "delete_permission", "permission", req.params.id,
        `Deleted permission: ${permission.name}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error deleting permission", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Role Permissions Management
  app.post("/api/admin/roles/:roleId/permissions/:permissionId", requireAdminPermission("permissions", "assign"), async (req, res) => {
    try {
      const { roleId, permissionId } = req.params;

      if (isSystemRoleId(roleId)) {
        return res.status(400).json({ error: "System roles use fixed permissions" });
      }
      
      const role = await storage.getRole(roleId);
      const permission = await storage.getPermission(permissionId);
      
      if (!role || !permission) {
        return res.status(404).json({ error: "Role or permission not found" });
      }

      const rolePermission = await storage.assignRolePermission({ roleId, permissionId });
      await logAudit(req.session.userId, "assign_permission", "role_permission", rolePermission.id,
        `Assigned permission ${permission.name} to role ${role.name}`, req.ip);
      
      res.status(201).json(rolePermission);
    } catch (error) {
      logError("Error assigning permission to role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/roles/:roleId/permissions/:permissionId", requireAdminPermission("permissions", "assign"), async (req, res) => {
    try {
      const { roleId, permissionId } = req.params;

      if (isSystemRoleId(roleId)) {
        return res.status(400).json({ error: "System roles use fixed permissions" });
      }

      await storage.removeRolePermission(roleId, permissionId);
      
      await logAudit(req.session.userId, "remove_permission", "role_permission", undefined,
        `Removed permission ${permissionId} from role ${roleId}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error removing permission from role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Users Management
  app.get("/api/admin/users", requireAdminPermission("users", "read"), async (_req, res) => {
    try {
      const [adminUsers, allRoles] = await Promise.all([
        storage.getUsersByUserType("admin"),
        storage.getRoles(),
      ]);

      const adminUsersWithRoles = await Promise.all(
        adminUsers.map((adminUser) => buildAdminUserSummary(adminUser, allRoles)),
      );

      res.json(adminUsersWithRoles);
    } catch (error) {
      logError("Error fetching admin users", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/users", requireAdminPermission("users", "create"), async (req, res) => {
    try {
      const parsed = createAdminUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid admin user data" });
      }

      const username = parsed.data.username.trim();
      const email = parsed.data.email.trim().toLowerCase();
      const roleIds = Array.from(new Set(parsed.data.roleIds));
      const accountManagerClientIds = Array.from(new Set(parsed.data.accountManagerClientIds));
      const wantsAccountManagerRole = roleIds.includes(ACCOUNT_MANAGER_SYSTEM_ROLE_ID);
      const standardRoleIds = roleIds.filter((roleId) => !isSystemRoleId(roleId));

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      if (roleIds.length > 0) {
        const permissionUser = await ensureAdminPermission(req, res, "roles", "assign");
        if (!permissionUser) {
          return;
        }
      }

      if (wantsAccountManagerRole && standardRoleIds.length > 0) {
        return res.status(400).json({ error: "Account Manager is a standalone built-in role and cannot be combined with other roles" });
      }

      if (wantsAccountManagerRole) {
        const accountManagerCreator = await ensureAdminPermission(req, res, "account-managers", "create");
        if (!accountManagerCreator) {
          return;
        }

        if (accountManagerClientIds.length > 0) {
          const accountManagerAssigner = await ensureAdminPermission(req, res, "account-managers", "assign");
          if (!accountManagerAssigner) {
            return;
          }
        }

        const invalidClientId = await validateAccountManagerClientIds(accountManagerClientIds);
        if (invalidClientId) {
          return res.status(400).json({ error: "One or more assigned clients do not exist" });
        }
      }

      const allRoles = await storage.getRoles();
      const selectedRoles = allRoles.filter((role) => standardRoleIds.includes(role.id));

      if (selectedRoles.length !== standardRoleIds.length) {
        return res.status(400).json({ error: "One or more selected roles do not exist" });
      }

      const inactiveRole = selectedRoles.find((role) => !role.isActive);
      if (inactiveRole) {
        return res.status(400).json({ error: `Role "${inactiveRole.name}" is inactive and cannot be assigned` });
      }

      const hashedPassword = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
      const adminUser = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        userType: "admin",
        isAccountManager: wantsAccountManagerRole,
        isPrimaryContact: false,
        mustChangePassword: true,
        isActive: parsed.data.isActive,
      });

      for (const role of selectedRoles) {
        await storage.assignUserRole({
          userId: adminUser.id,
          roleId: role.id,
        });
      }

      if (wantsAccountManagerRole) {
        await storage.replaceAccountManagerAssignments(adminUser.id, accountManagerClientIds, req.session.userId);
      }

      const assignedRoleLabel = wantsAccountManagerRole
        ? ACCOUNT_MANAGER_SYSTEM_ROLE_NAME
        : selectedRoles.map((role) => role.name).join(", ");

      await logAudit(
        req.session.userId,
        "create_admin_user",
        "user",
        adminUser.id,
        `Created admin user ${username}${assignedRoleLabel ? ` with roles: ${assignedRoleLabel}` : ""}${wantsAccountManagerRole && accountManagerClientIds.length > 0 ? ` and assigned ${accountManagerClientIds.length} client(s)` : ""}`,
        req.ip,
      );

      res.status(201).json(await buildAdminUserSummary(adminUser, allRoles));
    } catch (error) {
      logError("Error creating admin user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/account-managers", requireAdminPermission("account-managers", "read"), async (_req, res) => {
    try {
      const [accountManagers, allRoles] = await Promise.all([
        storage.getAccountManagers(),
        storage.getRoles(),
      ]);

      res.json(await Promise.all(
        accountManagers.map((accountManager) => createAccountManagerSummary(accountManager, allRoles)),
      ));
    } catch (error) {
      logError("Error fetching account managers", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/account-managers", requireAdminPermission("account-managers", "create"), async (req, res) => {
    try {
      const parsed = createAccountManagerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid account manager data" });
      }

      const username = parsed.data.username.trim();
      const email = parsed.data.email.trim().toLowerCase();
      const clientAccountIds = Array.from(new Set(parsed.data.clientAccountIds));

      const [existingUsername, existingEmail, availableClients] = await Promise.all([
        storage.getUserByUsername(username),
        storage.getUserByEmail(email),
        storage.getClientAccounts(),
      ]);

      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      const validClientIds = new Set(availableClients.map((client) => client.id));
      const invalidClientId = clientAccountIds.find((clientId) => !validClientIds.has(clientId));
      if (invalidClientId) {
        return res.status(400).json({ error: "One or more assigned clients do not exist" });
      }

      const hashedPassword = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
      const accountManager = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        userType: "admin",
        isAccountManager: true,
        isPrimaryContact: false,
        mustChangePassword: true,
        isActive: parsed.data.isActive,
      });

      await storage.replaceAccountManagerAssignments(accountManager.id, clientAccountIds, req.session.userId);

      await logAudit(
        req.session.userId,
        "create_account_manager",
        "user",
        accountManager.id,
        `Created account manager ${username}${clientAccountIds.length > 0 ? ` and assigned ${clientAccountIds.length} client(s)` : ""}`,
        req.ip,
      );

      res.status(201).json(await createAccountManagerSummary(accountManager));
    } catch (error) {
      logError("Error creating account manager", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/admin/account-managers/:userId/clients", requireAdminPermission("account-managers", "assign"), async (req, res) => {
    try {
      const parsed = replaceAccountManagerAssignmentsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid assignment data" });
      }

      const accountManager = await storage.getUser(req.params.userId);
      if (!accountManager || accountManager.userType !== "admin" || !accountManager.isAccountManager) {
        return res.status(404).json({ error: "Account manager not found" });
      }

      const clientAccountIds = Array.from(new Set(parsed.data.clientAccountIds));
      const availableClients = await storage.getClientAccounts();
      const validClientIds = new Set(availableClients.map((client) => client.id));
      const invalidClientId = clientAccountIds.find((clientId) => !validClientIds.has(clientId));
      if (invalidClientId) {
        return res.status(400).json({ error: "One or more assigned clients do not exist" });
      }

      await storage.replaceAccountManagerAssignments(accountManager.id, clientAccountIds, req.session.userId);

      await logAudit(
        req.session.userId,
        "assign_account_manager_clients",
        "user",
        accountManager.id,
        `Updated assigned clients for account manager ${accountManager.username} (${clientAccountIds.length} client(s))`,
        req.ip,
      );

      res.json(await createAccountManagerSummary(accountManager));
    } catch (error) {
      logError("Error updating account manager assignments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/account-managers/change-requests", requireAdminPermission("account-manager-requests", "read"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getAccountManagerClientChangeRequests({ status });

      const enrichedRequests = await Promise.all(
        requests.map(async (requestRecord) => {
          const [accountManager, client, reviewedBy] = await Promise.all([
            storage.getUser(requestRecord.accountManagerUserId),
            storage.getClientAccount(requestRecord.clientAccountId),
            requestRecord.reviewedByUserId ? storage.getUser(requestRecord.reviewedByUserId) : Promise.resolve(undefined),
          ]);

          return {
            ...requestRecord,
            requestedChanges: JSON.parse(requestRecord.requestedChanges),
            accountManager: accountManager
              ? {
                  id: accountManager.id,
                  username: accountManager.username,
                  email: accountManager.email,
                }
              : null,
            client: client
              ? {
                  id: client.id,
                  accountNumber: client.accountNumber,
                  name: client.name,
                  profile: client.profile,
                  isActive: client.isActive,
                }
              : null,
            reviewedBy: reviewedBy
              ? {
                  id: reviewedBy.id,
                  username: reviewedBy.username,
                  email: reviewedBy.email,
                }
              : null,
          };
        }),
      );

      res.json(enrichedRequests);
    } catch (error) {
      logError("Error fetching account manager change requests", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/account-managers/change-requests/:id/approve", requireAdminPermission("account-manager-requests", "approve"), async (req, res) => {
    try {
      const parsed = reviewAccountManagerChangeRequestSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid approval data" });
      }

      const changeRequest = await storage.getAccountManagerClientChangeRequest(req.params.id);
      if (!changeRequest) {
        return res.status(404).json({ error: "Change request not found" });
      }

      if (changeRequest.status !== AccountManagerChangeRequestStatus.PENDING) {
        return res.status(400).json({ error: "Only pending change requests can be approved" });
      }

      const requestedChanges = JSON.parse(changeRequest.requestedChanges) as Partial<ClientAccount>;
      if (requestedChanges.profile !== undefined) {
        try {
          await validateClientProfileValue(requestedChanges.profile);
        } catch (error) {
          return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid profile" });
        }
      }

      const updateResult = await applyClientAccountUpdates(changeRequest.clientAccountId, requestedChanges);
      if (!updateResult) {
        return res.status(404).json({ error: "Client not found" });
      }

      const updatedRequest = await storage.updateAccountManagerClientChangeRequest(changeRequest.id, {
        status: AccountManagerChangeRequestStatus.APPROVED,
        adminNotes: parsed.data.adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });

      await logAudit(
        req.session.userId,
        "approve_account_manager_change_request",
        "account_manager_change_request",
        changeRequest.id,
        `Approved ${changeRequest.requestType} for client ${updateResult.updatedClient.name}`,
        req.ip,
      );

      res.json({
        request: updatedRequest,
        client: updateResult.updatedClient,
      });
    } catch (error) {
      logError("Error approving account manager change request", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/account-managers/change-requests/:id/reject", requireAdminPermission("account-manager-requests", "reject"), async (req, res) => {
    try {
      const parsed = reviewAccountManagerChangeRequestSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid rejection data" });
      }

      const changeRequest = await storage.getAccountManagerClientChangeRequest(req.params.id);
      if (!changeRequest) {
        return res.status(404).json({ error: "Change request not found" });
      }

      if (changeRequest.status !== AccountManagerChangeRequestStatus.PENDING) {
        return res.status(400).json({ error: "Only pending change requests can be rejected" });
      }

      const updatedRequest = await storage.updateAccountManagerClientChangeRequest(changeRequest.id, {
        status: AccountManagerChangeRequestStatus.REJECTED,
        adminNotes: parsed.data.adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });

      await logAudit(
        req.session.userId,
        "reject_account_manager_change_request",
        "account_manager_change_request",
        changeRequest.id,
        `Rejected ${changeRequest.requestType} for client ${changeRequest.clientAccountId}`,
        req.ip,
      );

      res.json({ request: updatedRequest });
    } catch (error) {
      logError("Error rejecting account manager change request", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User Roles Management
  app.get("/api/admin/users/:userId/roles", requireAdminPermission("roles", "read"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user || user.userType !== "admin") {
        return res.status(404).json({ error: "Admin user not found" });
      }

      res.json(await getAssignedRolesForUser(user));
    } catch (error) {
      logError("Error fetching user roles", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:userId/roles/:roleId", requireAdminPermission("roles", "assign"), async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      
      const user = await storage.getUser(userId);
      
      if (!user || user.userType !== "admin") {
        return res.status(404).json({ error: "Admin user not found" });
      }

      if (isAccountManagerSystemRoleId(roleId)) {
        if (user.isAccountManager) {
          return res.status(409).json({ error: "Role already assigned to user" });
        }

        const accountManagerCreator = await ensureAdminPermission(req, res, "account-managers", "create");
        if (!accountManagerCreator) {
          return;
        }

        const existingRoles = await storage.getUserRoles(userId);
        if (existingRoles.length > 0) {
          return res.status(400).json({ error: "Remove the user's existing roles before assigning Account Manager" });
        }

        const updatedUser = await storage.updateUser(userId, {
          isAccountManager: true,
          updatedAt: new Date(),
        });

        await logAudit(
          req.session.userId,
          "assign_role",
          "user_role",
          undefined,
          `Assigned role ${ACCOUNT_MANAGER_SYSTEM_ROLE_NAME} to user ${user.username}`,
          req.ip,
        );

        return res.status(201).json({
          user: await buildAdminUserSummary(updatedUser || user),
          role: buildAccountManagerSystemRole(),
        });
      }

      if (user.isAccountManager) {
        return res.status(400).json({ error: "Account managers use fixed scoped access and cannot be assigned RBAC roles" });
      }

      const role = await storage.getRole(roleId);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      if (!role.isActive) {
        return res.status(400).json({ error: "Inactive roles cannot be assigned" });
      }

      const existingRoles = await storage.getUserRoles(userId);
      if (existingRoles.some((existingRole) => existingRole.roleId === roleId)) {
        return res.status(409).json({ error: "Role already assigned to user" });
      }

      const userRole = await storage.assignUserRole({ userId, roleId });
      await logAudit(req.session.userId, "assign_role", "user_role", userRole.id,
        `Assigned role ${role.name} to user ${user.username}`, req.ip);
      
      res.status(201).json(userRole);
    } catch (error) {
      logError("Error assigning role to user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:userId/roles/:roleId", requireAdminPermission("roles", "assign"), async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const user = await storage.getUser(userId);

      if (!user || user.userType !== "admin") {
        return res.status(404).json({ error: "Admin user not found" });
      }

      if (isAccountManagerSystemRoleId(roleId)) {
        if (!user.isAccountManager) {
          return res.status(404).json({ error: "Role assignment not found" });
        }

        await storage.replaceAccountManagerAssignments(userId, [], req.session.userId);
        await storage.updateUser(userId, {
          isAccountManager: false,
          updatedAt: new Date(),
        });

        await logAudit(
          req.session.userId,
          "remove_role",
          "user_role",
          undefined,
          `Removed role ${ACCOUNT_MANAGER_SYSTEM_ROLE_NAME} from user ${user.username}`,
          req.ip,
        );

        return res.json({ success: true });
      }

      if (user.isAccountManager) {
        return res.status(400).json({ error: "Account managers use fixed scoped access and cannot be assigned RBAC roles" });
      }

      const role = await storage.getRole(roleId);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      const existingRoles = await storage.getUserRoles(userId);
      if (!existingRoles.some((existingRole) => existingRole.roleId === roleId)) {
        return res.status(404).json({ error: "Role assignment not found" });
      }

      await storage.removeUserRole(userId, roleId);
      
      await logAudit(req.session.userId, "remove_role", "user_role", undefined,
        `Removed role ${role.name} from user ${user.username}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error removing role from user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ADMIN - POLICIES MANAGEMENT
  // ============================================
  app.get("/api/admin/policies", requireAdminPermission("policies", "read"), async (_req, res) => {
    try {
      const allPolicies = await storage.getPolicies();
      res.json(allPolicies);
    } catch (error) {
      logError("Error fetching policies", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/policies/:id", requireAdminPermission("policies", "read"), async (req, res) => {
    try {
      const policy = await storage.getPolicy(req.params.id);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.json(policy);
    } catch (error) {
      logError("Error fetching policy", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const createPolicySchema = z.object({
    title: z.string().min(1, "Title is required").max(255),
    slug: z.string().min(1, "Slug is required").max(100),
    content: z.string().min(1, "Content is required"),
    isPublished: z.boolean().optional().default(true),
  });

  const updatePolicySchema = z.object({
    title: z.string().min(1).max(255).optional(),
    content: z.string().min(1).optional(),
    isPublished: z.boolean().optional(),
    changeNote: z.string().max(500).optional(),
  });

  const sanitizeOptions: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3", "h4", "h5", "h6", "img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
    },
    disallowedTagsMode: "discard",
  };

  app.post("/api/admin/policies", requireAdminPermission("policies", "create"), async (req, res) => {
    try {
      const parsed = createPolicySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const { title, slug, content, isPublished } = parsed.data;
      const normalizedSlug = slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!normalizedSlug) {
        return res.status(400).json({ error: "Invalid slug" });
      }

      const existing = await storage.getPolicyBySlug(normalizedSlug);
      if (existing) {
        return res.status(409).json({ error: "A policy with this slug already exists" });
      }

      const sanitizedContent = sanitizeHtml(content, sanitizeOptions);

      const policy = await storage.createPolicy({
        title: title.trim(),
        slug: normalizedSlug,
        content: sanitizedContent,
        isPublished,
        updatedBy: req.session.userId,
      });

      await logAudit(req.session.userId, "create_policy", "policy", policy.id, JSON.stringify({ title, slug: normalizedSlug }));
      res.status(201).json(policy);
    } catch (error) {
      logError("Error creating policy", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/policies/:id", requireAdminPermission("policies", "update"), async (req, res) => {
    try {
      const policy = await storage.getPolicy(req.params.id);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      const parsed = updatePolicySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const { title, content, isPublished, changeNote } = parsed.data;
      const hasContentChange = (title !== undefined && title.trim() !== policy.title) ||
                               (content !== undefined && content !== policy.content);

      if (hasContentChange) {
        const currentVersion = await storage.getLatestPolicyVersionNumber(req.params.id);
        await storage.createPolicyVersion({
          policyId: req.params.id,
          versionNumber: currentVersion + 1,
          title: policy.title,
          content: policy.content,
          changedBy: req.session.userId,
          changeNote: changeNote || null,
        });
      }

      const updates: Record<string, any> = { updatedBy: req.session.userId };
      if (title !== undefined) updates.title = title.trim();
      if (content !== undefined) updates.content = sanitizeHtml(content, sanitizeOptions);
      if (isPublished !== undefined) updates.isPublished = isPublished;

      const updated = await storage.updatePolicy(req.params.id, updates);
      await logAudit(req.session.userId, "update_policy", "policy", req.params.id, JSON.stringify({ title: title || policy.title }));
      res.json(updated);
    } catch (error) {
      logError("Error updating policy", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/policies/:id/versions", requireAdminPermission("policies", "read"), async (req, res) => {
    try {
      const policy = await storage.getPolicy(req.params.id);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      const versions = await storage.getPolicyVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      logError("Error fetching policy versions", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/policies/:id/versions/:versionId", requireAdminPermission("policies", "read"), async (req, res) => {
    try {
      const version = await storage.getPolicyVersion(req.params.versionId);
      if (!version || version.policyId !== req.params.id) {
        return res.status(404).json({ error: "Version not found" });
      }
      res.json(version);
    } catch (error) {
      logError("Error fetching policy version", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/policies/:id", requireAdminPermission("policies", "delete"), async (req, res) => {
    try {
      const policy = await storage.getPolicy(req.params.id);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      await storage.deletePolicy(req.params.id);
      await logAudit(req.session.userId, "delete_policy", "policy", req.params.id, JSON.stringify({ title: policy.title }));
      res.json({ success: true });
    } catch (error) {
      logError("Error deleting policy", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // CLIENT ROUTES
  // ============================================

  // Client - Get Account Info
  app.get("/api/client/account", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const account = await storage.getClientAccount(user.clientAccountId);
    if (!account) {
      return res.status(404).json({ error: "Client account not found" });
    }

    res.json(account);
  });

  // Client - Update Account Profile
  const clientProfileUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    companyName: z.string().optional(),
    // Shipping address fields
    shippingContactName: z.string().min(2).optional(),
    shippingContactPhone: z.string().min(8).optional(),
    shippingCountryCode: z.string().min(2).optional(),
    shippingStateOrProvince: z.string().min(2).optional(),
    shippingCity: z.string().min(2).optional(),
    shippingPostalCode: z.string().min(3).optional(),
    shippingAddressLine1: z.string().min(5).optional(),
    shippingAddressLine2: z.string().optional(),
    shippingShortAddress: z.string().optional(),
  });

  app.patch("/api/client/account", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = clientProfileUpdateSchema.parse(req.body);
      
      // Get current client to check for zohoCustomerId
      const currentClient = await storage.getClientAccount(user.clientAccountId);
      
      const updated = await storage.updateClientAccount(user.clientAccountId, data);
      if (!updated) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Sync to Zoho Books if configured and customer exists
      if (zohoService.isConfigured() && currentClient?.zohoCustomerId) {
        try {
          await zohoService.updateCustomer(currentClient.zohoCustomerId, {
            name: updated.name,
            email: updated.email,
            phone: updated.phone,
            companyName: updated.companyName || undefined,
            country: updated.country,
            // Shipping Address fields (Primary Language - English)
            shippingContactName: updated.shippingContactName || undefined,
            shippingContactPhone: updated.shippingContactPhone || undefined,
            shippingStateOrProvince: updated.shippingStateOrProvince || undefined,
            shippingCity: updated.shippingCity || undefined,
            shippingPostalCode: updated.shippingPostalCode || undefined,
            shippingAddressLine1: updated.shippingAddressLine1 || undefined,
            shippingAddressLine2: updated.shippingAddressLine2 || undefined,
          });
        } catch (error) {
          logError("Failed to update Zoho customer", error);
        }
      }

      await logAudit(req.session.userId, "update_profile", "client_account", user.clientAccountId,
        `Client updated their profile`, req.ip);

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // CLIENT USER MANAGEMENT (for primary contacts only)
  // ============================================

  // Middleware to check if user is primary contact
  const requirePrimaryContact = async (req: Request, res: Response, next: NextFunction) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }
    if (!user.isPrimaryContact) {
      return res.status(403).json({ error: "Only primary contacts can manage users" });
    }
    next();
  };

  // Middleware to check if user has specific permission (or is primary contact who has all permissions)
  const requireClientPermission = (permission: ClientPermissionValue) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      
      // Primary contacts have all permissions
      if (user.isPrimaryContact) {
        return next();
      }
      
      // Check permissions
      const perms = await storage.getClientUserPermissions(user.id, user.clientAccountId);
      if (!perms || !perms.permissions.includes(permission)) {
        return res.status(403).json({ error: "Permission denied" });
      }
      
      next();
    };
  };

  // Client - Get Users in Account
  app.get("/api/client/users", requireClient, requirePrimaryContact, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const users = await storage.getUsersByClientAccount(user.clientAccountId);
      const allPerms = await storage.getClientUserPermissionsByAccount(user.clientAccountId);
      
      // Build response with user info and their permissions
      const usersWithPermissions = users.map(u => {
        const userPerms = allPerms.find(p => p.userId === u.id);
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          isPrimaryContact: u.isPrimaryContact,
          permissions: u.isPrimaryContact ? ALL_CLIENT_PERMISSIONS : (userPerms?.permissions || []),
          createdAt: u.createdAt,
        };
      });

      res.json(usersWithPermissions);
    } catch (error) {
      logError("Error fetching client users", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Create User
  const createClientUserSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    permissions: z.array(z.enum([
      ClientPermission.VIEW_SHIPMENTS,
      ClientPermission.CREATE_SHIPMENTS,
      ClientPermission.VIEW_INVOICES,
      ClientPermission.VIEW_PAYMENTS,
      ClientPermission.MAKE_PAYMENTS,
      ClientPermission.MANAGE_USERS,
    ] as const)).default([]),
  });

  app.post("/api/client/users", requireClient, requirePrimaryContact, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = createClientUserSchema.parse(req.body);

      // Check if username or email already exists
      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

      // Create the user
      const newUser = await storage.createUser({
        username: data.username,
        email: data.email,
        password: hashedPassword,
        userType: "client",
        clientAccountId: user.clientAccountId,
        isPrimaryContact: false,
      });

      // Create permissions record
      await storage.createClientUserPermissions({
        userId: newUser.id,
        clientAccountId: user.clientAccountId,
        permissions: data.permissions,
      });

      await logAudit(req.session.userId, "create_client_user", "user", newUser.id,
        `Created client user: ${data.username}`, req.ip);

      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        isPrimaryContact: false,
        permissions: data.permissions,
        createdAt: newUser.createdAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error creating client user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Update User Permissions
  const updateUserPermissionsSchema = z.object({
    permissions: z.array(z.enum([
      ClientPermission.VIEW_SHIPMENTS,
      ClientPermission.CREATE_SHIPMENTS,
      ClientPermission.VIEW_INVOICES,
      ClientPermission.VIEW_PAYMENTS,
      ClientPermission.MAKE_PAYMENTS,
      ClientPermission.MANAGE_USERS,
    ] as const)),
  });

  app.patch("/api/client/users/:userId/permissions", requireClient, requirePrimaryContact, async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || !currentUser.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.clientAccountId !== currentUser.clientAccountId) {
        return res.status(404).json({ error: "User not found" });
      }

      if (targetUser.isPrimaryContact) {
        return res.status(400).json({ error: "Cannot modify primary contact permissions" });
      }

      const data = updateUserPermissionsSchema.parse(req.body);

      // Get existing permissions record
      const existingPerms = await storage.getClientUserPermissions(userId, currentUser.clientAccountId);
      
      if (existingPerms) {
        await storage.updateClientUserPermissions(existingPerms.id, {
          permissions: data.permissions,
        });
      } else {
        await storage.createClientUserPermissions({
          userId,
          clientAccountId: currentUser.clientAccountId,
          permissions: data.permissions,
        });
      }

      await logAudit(req.session.userId, "update_user_permissions", "user", userId,
        `Updated permissions for user: ${targetUser.username}`, req.ip);

      res.json({
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        isPrimaryContact: false,
        permissions: data.permissions,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error updating user permissions", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Delete User
  app.delete("/api/client/users/:userId", requireClient, requirePrimaryContact, async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || !currentUser.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.clientAccountId !== currentUser.clientAccountId) {
        return res.status(404).json({ error: "User not found" });
      }

      if (targetUser.isPrimaryContact) {
        return res.status(400).json({ error: "Cannot delete primary contact" });
      }

      if (targetUser.id === currentUser.id) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }

      // Delete permissions first
      await storage.deleteClientUserPermissions(userId, currentUser.clientAccountId);

      // Update user to remove from client account (soft delete approach)
      await storage.updateUser(userId, {
        clientAccountId: null,
      });

      await logAudit(req.session.userId, "delete_client_user", "user", userId,
        `Removed client user: ${targetUser.username}`, req.ip);

      res.json({ message: "User removed successfully" });
    } catch (error) {
      logError("Error deleting client user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Get Current User's Permissions
  app.get("/api/client/my-permissions", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Primary contacts have all permissions
      if (user.isPrimaryContact) {
        return res.json({
          permissions: ALL_CLIENT_PERMISSIONS,
          isPrimaryContact: true,
        });
      }

      const perms = await storage.getClientUserPermissions(user.id, user.clientAccountId);
      res.json({
        permissions: perms?.permissions || [],
        isPrimaryContact: false,
      });
    } catch (error) {
      logError("Error fetching user permissions", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Dashboard Stats
  app.get("/api/client/stats", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    await reconcilePaidShipmentsForClientAccount(user.clientAccountId, req.ip);

    const shipments = await storage.getShipmentsByClientAccount(user.clientAccountId);
    const invoices = await storage.getInvoicesByClientAccount(user.clientAccountId);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();

    const isCurrentMonth = (d: Date) => d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    const isPrevMonth = (d: Date) => d.getMonth() === prevMonth && d.getFullYear() === prevYear;

    const currentMonthShipments = shipments.filter((s) => isCurrentMonth(new Date(s.createdAt)));
    const prevMonthShipments = shipments.filter((s) => isPrevMonth(new Date(s.createdAt)));
    const currentMonthDelivered = shipments.filter((s) => s.status === "delivered" && isCurrentMonth(new Date(s.createdAt)));
    const prevMonthDelivered = shipments.filter((s) => s.status === "delivered" && isPrevMonth(new Date(s.createdAt)));
    const currentMonthSpent = currentMonthShipments.reduce((sum, s) => sum + Number(s.finalPrice), 0);
    const prevMonthSpent = prevMonthShipments.reduce((sum, s) => sum + Number(s.finalPrice), 0);

    function calcTrend(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    const shipmentsByMonth: { label: string; value: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthShipments = shipments.filter((s) => {
        const sd = new Date(s.createdAt);
        return sd.getMonth() === m && sd.getFullYear() === y;
      });
      shipmentsByMonth.push({ label: monthNames[m], value: monthShipments.length });
    }

    const statusCounts: Record<string, number> = {};
    shipments.forEach((s) => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    const stats: ClientDashboardStats = {
      totalShipments: shipments.length,
      shipmentsInTransit: shipments.filter((s) => s.status === "in_transit").length,
      shipmentsDelivered: shipments.filter((s) => s.status === "delivered").length,
      pendingInvoices: invoices.filter((i) => i.status === "pending").length,
      totalSpent: shipments.reduce((sum, s) => sum + Number(s.finalPrice), 0),
      trends: {
        shipments: { value: calcTrend(currentMonthShipments.length, prevMonthShipments.length), label: "vs last month" },
        delivered: { value: calcTrend(currentMonthDelivered.length, prevMonthDelivered.length), label: "vs last month" },
        spent: { value: calcTrend(currentMonthSpent, prevMonthSpent), label: "vs last month" },
      },
      shipmentsByMonth,
      statusDistribution,
    };

    res.json(stats);
  });

  // Client - Recent Shipments
  app.get("/api/client/shipments/recent", requireClient, requireClientPermission(ClientPermission.VIEW_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    await reconcilePaidShipmentsForClientAccount(user.clientAccountId, req.ip);

    const shipments = await storage.getShipmentsByClientAccount(user.clientAccountId);
    res.json(shipments.slice(0, 5));
  });

  // Client - All Shipments
  app.get("/api/client/shipments", requireClient, requireClientPermission(ClientPermission.VIEW_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    await reconcilePaidShipmentsForClientAccount(user.clientAccountId, req.ip);

    const shipments = await storage.getShipmentsByClientAccount(user.clientAccountId);
    res.json(shipments);
  });

  // Client - Get Single Shipment Details
  app.get("/api/client/shipments/:id", requireClient, requireClientPermission(ClientPermission.VIEW_SHIPMENTS), async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Verify shipment belongs to this client
      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get associated invoice if exists
      const invoices = await storage.getInvoicesByClientAccount(user.clientAccountId);
      const invoice = invoices.find(inv => inv.shipmentId === shipment.id);

      res.json({
        ...shipment,
        invoice: invoice ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          status: invoice.status,
          dueDate: invoice.dueDate,
        } : null,
      });
    } catch (error) {
      logError("Error fetching shipment details", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // NEW SHIPMENT FLOW: RATE DISCOVERY -> CHECKOUT -> CONFIRM
  // ============================================

  // Canonical Shipment Input Schema
  const COUNTRIES_REQUIRING_STATE = ["US", "CA"];

  const addressSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().min(1, "Phone is required"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    countryCode: z.string().length(2, "Country code must be 2 characters"),
    city: z.string().min(1, "City is required"),
    postalCode: z.string().min(1, "Postal code is required"),
    addressLine1: z.string().min(1, "Address is required"),
    addressLine2: z.string().optional(),
    stateOrProvince: z.string().optional(),
    shortAddress: z.string().optional(),
  }).superRefine((data, ctx) => {
    if (COUNTRIES_REQUIRING_STATE.includes(data.countryCode) && !data.stateOrProvince) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `State/Province is required for ${data.countryCode}`,
        path: ["stateOrProvince"],
      });
    }
  });

  const shipmentItemInputSchema = z.object({
    itemName: z.string().min(1),
    itemDescription: z.string().optional(),
    category: z.string().min(1),
    material: z.string().optional(),
    countryOfOrigin: z.string().length(2),
    hsCode: z.string().optional(),
    hsCodeSource: z.enum(["USER", "FEDEX", "HISTORY", "UNKNOWN"]).optional(),
    hsCodeConfidence: z.enum(["HIGH", "MEDIUM", "LOW", "MISSING"]).optional(),
    hsCodeCandidates: z.array(z.object({
      code: z.string(),
      description: z.string(),
      confidence: z.number(),
    })).optional(),
    price: z.number().nonnegative(),
    quantity: z.number().int().positive(),
    currency: z.string().optional(),
  });

  const shipmentInputSchema = z.object({
    shipmentType: z.enum(["domestic", "inbound", "outbound"]),
    isDdp: z.boolean().default(false),
    carrier: z.string().optional(),
    serviceType: z.string().optional(),
    shipper: addressSchema,
    recipient: addressSchema,
    packages: z.array(z.object({
      weight: z.number().positive("Weight must be positive"),
      length: z.number().positive("Length must be positive"),
      width: z.number().positive("Width must be positive"),
      height: z.number().positive("Height must be positive"),
    })).min(1, "At least one package is required"),
    weightUnit: z.enum(["LB", "KG"]).default("KG"),
    dimensionUnit: z.enum(["IN", "CM"]).default("CM"),
    packageType: z.string().default("YOUR_PACKAGING"),
    currency: z.string().default("SAR"),
    items: z.array(shipmentItemInputSchema).optional().default([]),
    tradeDocuments: z.array(shipmentTradeDocumentSchema).max(5).optional().default([]),
  });

  const invoiceExtractionSchema = z.object({
    shipmentType: z.enum(["domestic", "inbound", "outbound"]),
    shipperCountryCode: z.string().length(2),
    recipientCountryCode: z.string().length(2).optional(),
    fileName: z.string().min(1),
    objectPath: z.string().min(1),
    contentType: z.string().min(1),
  });

  app.post(
    "/api/client/shipments/extract-invoice-items",
    requireClient,
    requireClientPermission(ClientPermission.CREATE_SHIPMENTS),
    async (req, res) => {
      try {
        const data = invoiceExtractionSchema.parse(req.body);
        const user = await storage.getUser(req.session.userId!);
        const destinationCountry =
          data.shipmentType === "inbound"
            ? data.recipientCountryCode || "SA"
            : data.recipientCountryCode || data.shipperCountryCode || "SA";

        const extraction = await extractInvoiceItemsFromDocument(
          {
            fileName: data.fileName,
            objectPath: data.objectPath,
            contentType: data.contentType,
          },
          {
            fallbackCountryOfOrigin: data.shipperCountryCode,
            fallbackCurrency: "SAR",
          },
        );

        const hsEnrichment = await enrichInvoiceItemsWithHsCodes(extraction.items, {
          clientAccountId: user?.clientAccountId || undefined,
          destinationCountry,
        });

        const { warnings, ...clientExtraction } = extraction;

        res.json({
          ...clientExtraction,
          items: hsEnrichment.items,
          summary: {
            importedItemCount: hsEnrichment.items.length,
            aiAssisted: extraction.extractionMethod === "gemini",
            hasParsingWarnings: warnings.length > 0,
            autoMatchedHsCodeCount: hsEnrichment.autoMatchedHsCodeCount,
            hsCodeReviewCount: hsEnrichment.hsCodeReviewCount,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors[0].message });
        }

        const message = error instanceof Error ? error.message : "Failed to extract invoice items";
        res.status(422).json({ error: message });
      }
    },
  );

  // STEP 1: Rate Discovery - Get rates from all carriers
  app.post("/api/client/shipments/rates", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = shipmentInputSchema.parse(req.body);

      if (data.isDdp && !isDdpEligibleForShipment(data.shipmentType, data.recipient.countryCode)) {
        return res.status(400).json({
          error: "DDP is only available for import shipments to Saudi Arabia or the UAE",
        });
      }

      const addrValidation = validateShippingAddresses(data.shipper, data.recipient);
      if (!addrValidation.valid) {
        return res.status(400).json({ error: "Address validation failed", details: addrValidation.errors });
      }

      // Get client account for pricing
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Get pricing rule for client profile
      const pricingRule = await storage.getPricingRuleByProfile(account.profile);
      const defaultMarginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;

      const carrierAdapters = data.carrier?.trim()
        ? [getCarrierAdapter(resolveCarrierCode(data.carrier))]
        : carrierService.getSupportedCarriers();

      // Map to carrier adapter format
      const rateRequest = {
        shipper: {
          name: data.shipper.name,
          streetLine1: data.shipper.addressLine1,
          streetLine2: data.shipper.addressLine2,
          streetLine3: data.shipper.shortAddress,
          city: data.shipper.city,
          stateOrProvince: data.shipper.stateOrProvince,
          postalCode: data.shipper.postalCode,
          countryCode: data.shipper.countryCode,
          phone: data.shipper.phone,
          email: data.shipper.email,
        },
        recipient: {
          name: data.recipient.name,
          streetLine1: data.recipient.addressLine1,
          streetLine2: data.recipient.addressLine2,
          streetLine3: data.recipient.shortAddress,
          city: data.recipient.city,
          stateOrProvince: data.recipient.stateOrProvince,
          postalCode: data.recipient.postalCode,
          countryCode: data.recipient.countryCode,
          phone: data.recipient.phone,
          email: data.recipient.email,
        },
        packages: data.packages.map(pkg => ({
          weight: pkg.weight,
          weightUnit: data.weightUnit,
          dimensions: {
            length: pkg.length,
            width: pkg.width,
            height: pkg.height,
            unit: data.dimensionUnit,
          },
          packageType: data.packageType,
        })),
        serviceType: data.serviceType,
        packagingType: data.packageType,
        currency: data.currency,
      };

      const carrierRateResults = await Promise.all(
        carrierAdapters.map(async (carrierAdapter) => {
          try {
            const carrierRates = await carrierAdapter.getRates(rateRequest);
            return {
              carrierAdapter,
              carrierRates,
              error: null,
            };
          } catch (error) {
            logError("Carrier rate lookup failed", {
              carrierCode: carrierAdapter.carrierCode,
              carrierName: carrierAdapter.name,
              error: error instanceof Error ? error.message : String(error),
            });

            return {
              carrierAdapter,
              carrierRates: [] as Awaited<ReturnType<CarrierAdapter["getRates"]>>,
              error,
            };
          }
        }),
      );

      // Store quotes with pricing and return to client
      const quotes: Array<{
        quoteId: string;
        carrierCode: string;
        carrierName: string;
        serviceType: string;
        serviceName: string;
        finalPrice: number;
        currency: string;
        transitDays: number;
        estimatedDelivery?: Date;
      }> = [];

      // Quote expiration: 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      for (const { carrierAdapter, carrierRates } of carrierRateResults) {
        for (const rate of carrierRates) {
          const marginPercentage = pricingRule
            ? await storage.getMarginForAmount(pricingRule.id, rate.baseRate)
            : defaultMarginPercentage;

          const marginAmount = rate.baseRate * (marginPercentage / 100);
          const accountingSnapshot = calculateShipmentAccounting({
            shipmentType: data.shipmentType,
            isDdp: data.isDdp,
            recipientCountryCode: data.recipient.countryCode,
            baseRate: rate.baseRate,
            marginAmount,
          });

          const quoteShipmentData = {
            ...data,
            carrier: carrierAdapter.carrierCode,
            effectivePackagingType: rate.packagingType || data.packageType,
          };
          const quote = await storage.createShipmentRateQuote({
            clientAccountId: user.clientAccountId,
            shipmentData: JSON.stringify(quoteShipmentData),
            carrierCode: carrierAdapter.carrierCode,
            carrierName: carrierAdapter.name,
            serviceType: rate.serviceType,
            serviceName: rate.serviceName,
            baseRate: rate.baseRate.toFixed(2),
            marginPercentage: marginPercentage.toFixed(2),
            marginAmount: marginAmount.toFixed(2),
            finalPrice: accountingSnapshot.clientTotalAmountSar.toFixed(2),
            currency: rate.currency,
            transitDays: rate.transitDays,
            estimatedDelivery: rate.deliveryDate,
            expiresAt,
          });

          quotes.push({
            quoteId: quote.id,
            carrierCode: carrierAdapter.carrierCode,
            carrierName: carrierAdapter.name,
            serviceType: rate.serviceType,
            serviceName: rate.serviceName,
            finalPrice: accountingSnapshot.clientTotalAmountSar,
            currency: rate.currency,
            transitDays: rate.transitDays,
            estimatedDelivery: rate.deliveryDate,
          });
        }
      }

      if (quotes.length === 0) {
        return res.status(502).json({
          error: "No carrier rates were available for this shipment.",
        });
      }

      await logAudit(req.session.userId, "get_shipping_rates", "shipment", undefined,
        `Requested ${quotes.length} shipping rates`, req.ip);

      res.json({ quotes, expiresAt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get shipping rates", error);
      res.status(500).json({ error: "Failed to get shipping rates" });
    }
  });

  // STEP 2: Checkout - Create shipment draft with selected rate
  app.post("/api/client/shipments/checkout", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const checkoutSchema = z.object({
        quoteId: z.string().uuid("Invalid quote ID"),
        items: z.array(shipmentItemInputSchema).optional(),
        tradeDocuments: z.array(shipmentTradeDocumentSchema).max(5).optional(),
      });

      const { quoteId, items, tradeDocuments } = checkoutSchema.parse(req.body);

      // Verify quote exists and is valid
      const quote = await storage.getShipmentRateQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found or expired" });
      }

      // Verify quote belongs to this client
      if (quote.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Recalculate price server-side to prevent tampering
      const storedShipmentData = JSON.parse(quote.shipmentData);
      const shipmentItems =
        storedShipmentData.shipmentType === "domestic"
          ? []
          : Array.isArray(items)
            ? items
            : Array.isArray(storedShipmentData.items)
              ? storedShipmentData.items
              : [];
      const shipmentTradeDocuments =
        storedShipmentData.shipmentType === "domestic"
          ? []
          : Array.isArray(tradeDocuments)
            ? tradeDocuments
            : Array.isArray(storedShipmentData.tradeDocuments)
              ? storedShipmentData.tradeDocuments
              : [];
      const shipmentData = {
        ...storedShipmentData,
        items: shipmentItems,
        tradeDocuments: shipmentTradeDocuments,
      };

      if (shipmentData.shipmentType !== "domestic" && shipmentItems.length === 0) {
        return res.status(400).json({ error: "Please add at least one shipment item before checkout." });
      }
      if (shipmentData.isDdp && !isDdpEligibleForShipment(shipmentData.shipmentType, shipmentData.recipient.countryCode)) {
        return res.status(400).json({
          error: "DDP is only available for import shipments to Saudi Arabia or the UAE",
        });
      }
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const pricingRule = await storage.getPricingRuleByProfile(account.profile || "regular");
      const defaultMarginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;
      const baseRate = Number(quote.baseRate);
      
      // Use tiered margin if available (same logic as rate discovery)
      const marginPercentage = pricingRule 
        ? await storage.getMarginForAmount(pricingRule.id, baseRate)
        : defaultMarginPercentage;
      const recalculatedMargin = baseRate * (marginPercentage / 100);
      const accountingSnapshot = calculateShipmentAccounting({
        shipmentType: shipmentData.shipmentType,
        isDdp: shipmentData.isDdp,
        recipientCountryCode: shipmentData.recipient.countryCode,
        baseRate,
        marginAmount: recalculatedMargin,
      });
      const recalculatedFinalPrice = accountingSnapshot.clientTotalAmountSar;

      // Verify price hasn't been tampered with (use stored margin for comparison since tiered rates may vary)
      const storedFinalPrice = Number(quote.finalPrice);
      if (Math.abs(recalculatedFinalPrice - storedFinalPrice) > 0.01) {
        logError("Price mismatch in checkout", {
          baseRate,
          marginPercentage,
          recalculatedFinalPrice,
          storedFinalPrice,
          quoteMarginPercentage: quote.marginPercentage,
          diff: Math.abs(recalculatedFinalPrice - storedFinalPrice),
        });
        return res.status(400).json({ error: "Price mismatch detected" });
      }

      const totalShipmentWeight = shipmentData.packages.reduce((sum: number, p: { weight: number }) => sum + p.weight, 0);

      // Create draft shipment with payment pending status
      const shipment = await storage.createShipment({
        clientAccountId: user.clientAccountId,
        senderName: shipmentData.shipper.name,
        senderAddress: shipmentData.shipper.addressLine1,
        senderAddressLine2: shipmentData.shipper.addressLine2 || null,
        senderCity: shipmentData.shipper.city,
        senderStateOrProvince: shipmentData.shipper.stateOrProvince || null,
        senderPostalCode: shipmentData.shipper.postalCode,
        senderCountry: shipmentData.shipper.countryCode,
        senderPhone: shipmentData.shipper.phone,
        senderEmail: shipmentData.shipper.email || null,
        senderShortAddress: shipmentData.shipper.shortAddress,
        recipientName: shipmentData.recipient.name,
        recipientAddress: shipmentData.recipient.addressLine1,
        recipientAddressLine2: shipmentData.recipient.addressLine2 || null,
        recipientCity: shipmentData.recipient.city,
        recipientStateOrProvince: shipmentData.recipient.stateOrProvince || null,
        recipientPostalCode: shipmentData.recipient.postalCode,
        recipientCountry: shipmentData.recipient.countryCode,
        recipientPhone: shipmentData.recipient.phone,
        recipientEmail: shipmentData.recipient.email || null,
        recipientShortAddress: shipmentData.recipient.shortAddress,
        weight: totalShipmentWeight.toString(),
        weightUnit: shipmentData.weightUnit,
        length: shipmentData.packages[0].length.toString(),
        width: shipmentData.packages[0].width.toString(),
        height: shipmentData.packages[0].height.toString(),
        dimensionUnit: shipmentData.dimensionUnit,
        packageType: shipmentData.effectivePackagingType || shipmentData.packageType,
        numberOfPackages: shipmentData.packages.length,
        packagesData: JSON.stringify(shipmentData.packages),
        itemsData: shipmentData.items ? JSON.stringify(shipmentData.items) : undefined,
        tradeDocumentsData: shipmentData.tradeDocuments?.length
          ? JSON.stringify(shipmentData.tradeDocuments)
          : undefined,
        shipmentType: shipmentData.shipmentType,
        serviceType: quote.serviceType,
        currency: quote.currency,
        status: "payment_pending",
        baseRate: quote.baseRate,
        marginAmount: quote.marginAmount,
        margin: quote.marginAmount,
        finalPrice: quote.finalPrice,
        ...getShipmentAccountingInsert(accountingSnapshot),
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        carrierServiceType: quote.serviceType,
        paymentStatus: "pending",
        estimatedDelivery: quote.estimatedDelivery,
      });

      await logAudit(req.session.userId, "checkout_shipment", "shipment", shipment.id,
        `Created checkout for shipment ${shipment.trackingNumber}`, req.ip);

      const response = {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        amount: Number(quote.finalPrice),
        currency: quote.currency,
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        serviceType: quote.serviceType,
        serviceName: quote.serviceName,
      };

      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 200);
      }

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create checkout", error);
      res.status(500).json({ error: "Failed to create checkout" });
    }
  });

  const shipmentPaymentSchema = z.object({
    shipmentId: z.string().uuid("Invalid shipment ID"),
    tapTokenId: z.string().min(1).optional(),
    saveCardForFuture: z.boolean().optional(),
  });

  app.post("/api/client/shipments/pay", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const { shipmentId, tapTokenId, saveCardForFuture } = shipmentPaymentSchema.parse(req.body);
      const shipment = await storage.getShipment(shipmentId);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (shipment.paymentStatus === "paid") {
        return res.status(400).json({ error: "Shipment is already paid" });
      }

      if (shipment.status !== "payment_pending" && shipment.status !== "carrier_error") {
        return res.status(400).json({ error: "Shipment is not ready for payment" });
      }

      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const appBaseUrl = buildAppBaseUrl(req);
      const chargeResult = await tapService.createCharge({
        amount: parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice),
        currency: (shipment.currency || "SAR").toUpperCase(),
        description: `Shipment ${shipment.trackingNumber}`,
        redirectUrl: `${appBaseUrl}/api/payments/tap/redirect`,
        postUrl: `${appBaseUrl}/api/webhooks/tap`,
        customer: buildTapCustomer(account),
        reference: {
          transaction: shipment.trackingNumber,
          order: shipment.id,
        },
        metadata: {
          kind: "shipment",
          shipmentId: shipment.id,
          clientAccountId: user.clientAccountId,
          trackingNumber: shipment.trackingNumber,
        },
        sourceId: tapTokenId || DEFAULT_TAP_SOURCE_ID,
        saveCard: Boolean(saveCardForFuture && tapService.isSavedCardsEnabled()),
      });

      await storage.updateShipment(shipment.id, {
        paymentIntentId: chargeResult.chargeId,
      });

      if (tapService.isSuccessfulStatus(chargeResult.status)) {
        await processTapChargeUpdate(chargeResult.charge, req.ip);
      }

      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        paymentId: chargeResult.chargeId,
        transactionUrl: chargeResult.transactionUrl,
        amount: parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice),
        currency: shipment.currency || "SAR",
        paymentStatus: chargeResult.status,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create shipment payment charge", error);
      res.status(500).json({ error: "Failed to create shipment payment" });
    }
  });

  // STEP 3: Confirm - Create carrier shipment after payment success
  app.post("/api/client/shipments/confirm", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const confirmSchema = z.object({
        shipmentId: z.string().uuid("Invalid shipment ID"),
        paymentIntentId: z.string().optional(),
      });

      const { shipmentId, paymentIntentId } = confirmSchema.parse(req.body);

      // Get shipment
      const shipment = await storage.getShipment(shipmentId);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Verify shipment belongs to client
      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Use the stored payment ID from shipment if not provided
      const effectivePaymentId = paymentIntentId || shipment.paymentIntentId;

      let verifiedTapCharge: TapCharge | null = null;
      if (effectivePaymentId) {
        verifiedTapCharge = await tapService.retrieveCharge(effectivePaymentId);
        if (!verifiedTapCharge || !tapService.isSuccessfulStatus(verifiedTapCharge.status)) {
          return res.status(400).json({ error: "Payment not confirmed" });
        }
        await processTapShipmentCharge(verifiedTapCharge, req.ip);
      } else {
        logError("Confirm shipment: No payment ID available", { shipmentId });
      }

      const currentShipment = (await storage.getShipment(shipmentId)) || shipment;

      if (
        currentShipment.status !== "payment_pending" &&
        !(currentShipment.status === "created" && currentShipment.carrierTrackingNumber) &&
        currentShipment.status !== "carrier_error"
      ) {
        return res.status(400).json({ error: "Shipment cannot be confirmed in current state" });
      }

      let updatedShipment;
      try {
        updatedShipment = await finalizePaidShipmentAfterPayment({
          shipment: currentShipment,
          transactionId: effectivePaymentId,
          paymentMethod: "tap",
          userId: req.session.userId,
          ipAddress: req.ip,
        });
      } catch (carrierError) {
        const isCarrierErr = carrierError instanceof CarrierError;
        const errCode = isCarrierErr ? carrierError.code : "UNKNOWN";
        const errMsg = isCarrierErr ? carrierError.carrierMessage : (carrierError as Error).message;

        logError("Carrier error during confirm", carrierError);
        return res.status(502).json({
          error: "Carrier error, please retry",
          carrierErrorCode: errCode,
          carrierErrorMessage: errMsg,
        });
      }

      const response = {
        shipment: updatedShipment,
        carrierTrackingNumber: updatedShipment?.carrierTrackingNumber || "",
        labelUrl: updatedShipment?.labelUrl || undefined,
        estimatedDelivery: updatedShipment?.estimatedDelivery || undefined,
      };

      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 200);
      }

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to confirm shipment", error);
      res.status(500).json({ error: "Failed to confirm shipment" });
    }
  });

  // Client - Create Shipment (LEGACY - direct creation without rate discovery)
  app.post("/api/client/shipments", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }
      
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = createShipmentSchema.parse(req.body);

      // Get client account to determine pricing
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Get pricing rule for client profile
      const pricingRule = await storage.getPricingRuleByProfile(account.profile);
      const defaultMarginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;

      // Calculate pricing (simulated base rate)
      const weight = parseFloat(data.weight);
      const baseRate = 25 + weight * 5; // Base rate calculation
      
      // Get tiered margin based on the base rate amount
      const marginPercentage = pricingRule 
        ? await storage.getMarginForAmount(pricingRule.id, baseRate)
        : defaultMarginPercentage;
      
      const margin = baseRate * (marginPercentage / 100);
      const finalPrice = baseRate + margin;
      const shipment = await storage.createShipment({
        ...data,
        clientAccountId: user.clientAccountId,
        status: "processing",
        baseRate: baseRate.toFixed(2),
        margin: margin.toFixed(2),
        finalPrice: finalPrice.toFixed(2),
        carrierName: "FedEx",
      });

      // Create invoice for shipment
      const invoice = await storage.createInvoice({
        clientAccountId: user.clientAccountId,
        shipmentId: shipment.id,
        amount: finalPrice.toFixed(2),
        status: "pending",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Sync invoice to Zoho Books (if configured)
      if (zohoService.isConfigured()) {
        try {
          const clientAccount = await storage.getClientAccount(user.clientAccountId);
          if (clientAccount) {
            const zohoResult = await zohoService.syncInvoice(invoice.id, {
              customerId: clientAccount.zohoCustomerId || undefined,
              customerName: clientAccount.name,
              customerEmail: clientAccount.email,
              invoiceNumber: invoice.invoiceNumber,
              date: new Date().toISOString().split('T')[0],
              dueDate: invoice.dueDate.toISOString().split('T')[0],
              lineItems: [{
                name: `Shipment ${shipment.trackingNumber}`,
                description: `${data.senderCity} to ${data.recipientCity}`,
                quantity: 1,
                rate: Number(finalPrice),
              }],
            });
            
            if (zohoResult.zohoInvoiceId) {
              await storage.updateInvoice(invoice.id, {
                zohoInvoiceId: zohoResult.zohoInvoiceId,
                zohoInvoiceUrl: zohoResult.invoiceUrl,
              });
            }
          }
        } catch (error) {
          logError("Failed to sync invoice to Zoho", error);
          // Don't fail the shipment creation if Zoho sync fails
        }
      }

      // Log shipment creation
      await logAudit(req.session.userId, "create_shipment", "shipment", shipment.id,
        `Created shipment ${shipment.trackingNumber} for ${shipment.currency || "SAR"} ${finalPrice.toFixed(2)}`, req.ip);

      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, shipment, 201);
      }

      res.status(201).json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Cancel Shipment
  app.post("/api/client/shipments/:id/cancel", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const { id } = req.params;
      const shipment = await storage.getShipment(id);
      
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (shipment.status !== "processing" && shipment.status !== "carrier_error") {
        return res.status(400).json({ error: "Can only cancel shipments that are still processing or in carrier error" });
      }

      if (shipment.carrierTrackingNumber) {
        try {
          const carrierAdapter = getAdapterForShipment(shipment);
          await carrierAdapter.cancelShipment(shipment.carrierTrackingNumber, shipment.senderCountry);
        } catch (cancelError) {
          const isCarrierErr = cancelError instanceof CarrierError;
          const errCode = isCarrierErr ? (cancelError as CarrierError).code : "CANCEL_FAILED";
          const errMsg = isCarrierErr ? (cancelError as CarrierError).carrierMessage : (cancelError as Error).message;

          logError("Client carrier cancel failed", cancelError);
          await storage.updateShipment(id, {
            carrierErrorCode: errCode,
            carrierErrorMessage: `Cancel failed: ${errMsg}`,
            carrierLastAttemptAt: new Date(),
          });

          return res.status(502).json({
            error: "Failed to cancel with carrier",
            carrierErrorCode: errCode,
            carrierErrorMessage: errMsg,
          });
        }
      }

      const updated = await storage.updateShipment(id, {
        status: "cancelled",
        carrierStatus: "cancelled",
      });
      
      await logAudit(req.session.userId, "cancel_shipment", "shipment", id,
        `Client cancelled shipment ${shipment.trackingNumber}`, req.ip);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/client/shipments/:id/label.pdf", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!shipment.carrierLabelBase64) {
        return res.status(404).json({ error: "No label available for this shipment. The shipment may not have been created in FedEx yet." });
      }
      const pdfBuffer = Buffer.from(shipment.carrierLabelBase64, "base64");
      const trackingNum = shipment.carrierTrackingNumber || shipment.trackingNumber || "unknown";
      res.setHeader("Content-Type", shipment.carrierLabelMimeType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="fedex-label-${trackingNum}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      logError("Failed to download client label", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // CLIENT - CREDIT INVOICES (Pay Later)
  // ============================================

  app.get("/api/client/credit-access", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const clientAccount = await storage.getClientAccount(user.clientAccountId);
      const request = await storage.getCreditAccessRequestByClient(user.clientAccountId);
      res.json({
        creditEnabled: clientAccount?.creditEnabled || false,
        request: request || null,
      });
    } catch (error: any) {
      logError("Error fetching credit access status", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/client/credit-access/request", requireClient, requirePrimaryContact, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const existing = await storage.getCreditAccessRequestByClient(user.clientAccountId);
      if (existing && (existing.status === "pending" || existing.status === "approved")) {
        return res.status(400).json({ error: existing.status === "pending" ? "You already have a pending credit access request" : "Credit access is already enabled for your account" });
      }

      const { reason } = req.body;
      const request = await storage.createCreditAccessRequest({
        clientAccountId: user.clientAccountId,
        requestedByUserId: user.id,
        status: "pending",
        reason: reason || null,
      });

      logAuditToFile({
        userId: user.id,
        action: "request_credit_access",
        resource: "credit_access_request",
        resourceId: request.id,
        details: `Client ${user.username} requested credit access`,
        ipAddress: req.ip || "unknown",
      });

      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error creating credit access request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/client/shipments/:id/pay-later", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const clientAccount = await storage.getClientAccount(user.clientAccountId);
      if (!clientAccount?.creditEnabled) {
        return res.status(403).json({ error: "Credit access is not enabled for your account. Please request credit access first." });
      }

      const { id: shipmentId } = req.params;
      const shipment = await storage.getShipment(shipmentId);

      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (shipment.status !== "payment_pending") {
        return res.status(400).json({ error: "Shipment is not in a payable state" });
      }

      const existingCredit = await storage.getCreditInvoiceByShipmentId(shipmentId);
      if (existingCredit) {
        return res.status(400).json({ error: "A credit invoice already exists for this shipment" });
      }

      const now = new Date();
      const dueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const firstReminderAt = new Date(dueAt.getTime() - 7 * 24 * 60 * 60 * 1000);

      const creditInvoice = await storage.createCreditInvoice({
        clientAccountId: user.clientAccountId,
        shipmentId: shipment.id,
        amount: shipment.finalPrice,
        currency: shipment.currency || "SAR",
        status: "UNPAID",
        issuedAt: now,
        dueAt,
        paidAt: null,
        remindersSent: 0,
        lastReminderAt: null,
        nextReminderAt: firstReminderAt,
        notes: null,
      });

      await storage.updateShipment(shipmentId, {
        paymentMethod: "CREDIT",
        paymentStatus: "unpaid",
        status: "credit_pending",
      });

      const payLaterAddrValidation = validateShippingAddresses(
        { countryCode: shipment.senderCountry, city: shipment.senderCity, addressLine1: shipment.senderAddress, postalCode: shipment.senderPostalCode || "", phone: shipment.senderPhone, stateOrProvince: shipment.senderStateOrProvince || "" },
        { countryCode: shipment.recipientCountry, city: shipment.recipientCity, addressLine1: shipment.recipientAddress, postalCode: shipment.recipientPostalCode || "", phone: shipment.recipientPhone, stateOrProvince: shipment.recipientStateOrProvince || "" }
      );
      if (!payLaterAddrValidation.valid) {
        return res.status(400).json({ error: "Address validation failed", details: payLaterAddrValidation.errors });
      }

      let carrierTrackingNumber = "";
      let labelUrl = "";
      let estimatedDelivery: Date | undefined;

      try {
        const carrierAdapter = getAdapterForShipment(shipment);
        const preparedShipment = await buildCarrierShipmentRequestFromShipment(shipment, carrierAdapter);
        if (preparedShipment.tradeDocumentsData !== shipment.tradeDocumentsData) {
          await storage.updateShipment(shipmentId, {
            tradeDocumentsData: preparedShipment.tradeDocumentsData,
          });
        }
        const carrierResponse = await carrierAdapter.createShipment(preparedShipment.carrierRequest);
        carrierTrackingNumber = carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber;
        labelUrl = carrierResponse.labelUrl || "";
        estimatedDelivery = carrierResponse.estimatedDelivery;

        await storage.updateShipment(shipmentId, {
          status: "created",
          carrierStatus: "created",
          carrierTrackingNumber,
          carrierShipmentId: carrierResponse.trackingNumber,
          labelUrl: carrierResponse.labelUrl,
          carrierLabelBase64: carrierResponse.labelData || null,
          carrierLabelMimeType: "application/pdf",
          carrierLabelFormat: "PDF",
          estimatedDelivery: carrierResponse.estimatedDelivery,
          carrierLastAttemptAt: new Date(),
          carrierAttempts: (shipment.carrierAttempts || 0) + 1,
        });
      } catch (carrierError) {
        const isCarrierErr = carrierError instanceof CarrierError;
        const errCode = isCarrierErr ? (carrierError as CarrierError).code : "UNKNOWN";
        const errMsg = isCarrierErr ? (carrierError as CarrierError).carrierMessage : (carrierError as Error).message;

        logError("Failed to create carrier shipment for pay-later", carrierError);
        await storage.updateShipment(shipmentId, {
          status: "carrier_error",
          carrierStatus: "error",
          carrierErrorCode: errCode,
          carrierErrorMessage: errMsg,
          carrierLastAttemptAt: new Date(),
          carrierAttempts: (shipment.carrierAttempts || 0) + 1,
        });

        await storage.createCreditNotificationEvent({
          clientAccountId: user.clientAccountId,
          creditInvoiceId: creditInvoice.id,
          type: "INVOICE_CREATED",
          sentAt: now,
          meta: JSON.stringify({ shipmentId, amount: shipment.finalPrice }),
        });

        return res.status(502).json({
          message: "Carrier creation failed. Invoice created, but shipment was not created in FedEx yet.",
          carrierErrorCode: errCode,
          carrierErrorMessage: errMsg,
          creditInvoice,
        });
      }

      await storage.createCreditNotificationEvent({
        clientAccountId: user.clientAccountId,
        creditInvoiceId: creditInvoice.id,
        type: "INVOICE_CREATED",
        sentAt: now,
        meta: JSON.stringify({ shipmentId, amount: shipment.finalPrice }),
      });

      const account = await storage.getClientAccount(user.clientAccountId);
      if (account) {
        const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAIL;
        await sendCreditInvoiceCreated(
          account.email,
          account.name,
          shipment.trackingNumber,
          Number(shipment.finalPrice).toFixed(2),
          shipment.currency || "SAR",
          dueAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          adminEmails
        );
      }

      await logAudit(req.session.userId, "pay_later", "shipment", shipmentId,
        `Selected Pay Later for shipment ${shipment.trackingNumber}, due ${dueAt.toISOString()}`, req.ip);

      res.json({
        creditInvoice,
        shipment: await storage.getShipment(shipmentId),
        carrierTrackingNumber,
        labelUrl,
        estimatedDelivery,
      });
    } catch (error) {
      logError("Failed to process pay-later", error);
      res.status(500).json({ error: "Failed to process pay later request" });
    }
  });

  // Client - List Credit Invoices
  app.get("/api/client/credit-invoices", requireClient, requireClientPermission(ClientPermission.VIEW_INVOICES), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const status = req.query.status as string | undefined;
      const invoices = await storage.getCreditInvoicesByClientAccount(user.clientAccountId, status);

      const enriched = await Promise.all(invoices.map(async (inv) => {
        const shipment = await storage.getShipment(inv.shipmentId);
        return {
          ...inv,
          shipment: shipment ? {
            id: shipment.id,
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            createdAt: shipment.createdAt,
            senderName: shipment.senderName,
            senderCity: shipment.senderCity,
            senderCountry: shipment.senderCountry,
            recipientName: shipment.recipientName,
            recipientCity: shipment.recipientCity,
            recipientCountry: shipment.recipientCountry,
            serviceType: shipment.serviceType,
            carrierTrackingNumber: shipment.carrierTrackingNumber,
            weight: shipment.weight,
            weightUnit: shipment.weightUnit,
            numberOfPackages: shipment.numberOfPackages,
            shipmentType: shipment.shipmentType,
            itemsData: shipment.itemsData,
          } : null,
        };
      }));

      res.json(enriched);
    } catch (error) {
      logError("Error fetching client credit invoices", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Get Single Credit Invoice
  app.get("/api/client/credit-invoices/:id", requireClient, requireClientPermission(ClientPermission.VIEW_INVOICES), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const invoice = await storage.getCreditInvoice(req.params.id);
      if (!invoice || invoice.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Credit invoice not found" });
      }

      const shipment = await storage.getShipment(invoice.shipmentId);
      const events = await storage.getCreditNotificationEvents(invoice.id);

      res.json({ ...invoice, shipment, events });
    } catch (error) {
      logError("Error fetching credit invoice", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Invoices
  app.get("/api/client/invoices", requireClient, requireClientPermission(ClientPermission.VIEW_INVOICES), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    await reconcilePaidShipmentsForClientAccount(user.clientAccountId, req.ip);

    const invoices = await storage.getInvoicesByClientAccount(user.clientAccountId);
    res.json(invoices);
  });

  // Client - Invoice PDF (downloadable HTML for print)
  app.get("/api/client/invoices/:id/pdf", requireClient, requireClientPermission(ClientPermission.VIEW_INVOICES), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Verify invoice belongs to client
      if (invoice.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get shipment and client details
      const shipment = invoice.shipmentId ? await storage.getShipment(invoice.shipmentId) : null;
      const clientAccount = await storage.getClientAccount(invoice.clientAccountId);

      const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString("en-US", { 
          year: "numeric", 
          month: "long", 
          day: "numeric" 
        });
      };
      const invoiceLineTitle =
        invoice.invoiceType === InvoiceType.EXTRA_WEIGHT
          ? "Extra Weight"
          : invoice.invoiceType === InvoiceType.EXTRA_COST
            ? "Extra Cost"
            : "Shipping Service";
      const invoiceLineDescription = invoice.description || invoiceLineTitle;
      const invoiceLineDetails = shipment
        ? invoice.invoiceType === InvoiceType.SHIPMENT
          ? `
          <span style="font-size: 13px;">
            ${shipment.senderCity}, ${shipment.senderCountry} → ${shipment.recipientCity}, ${shipment.recipientCountry}<br>
            Weight: ${Number(shipment.weight).toFixed(1)} kg | Type: ${shipment.packageType}
          </span>
          `
          : `
          <span style="font-size: 13px;">
            Tracking: ${shipment.trackingNumber}<br>
            ${shipment.senderCity}, ${shipment.senderCountry} → ${shipment.recipientCity}, ${shipment.recipientCountry}
          </span>
          `
        : invoice.invoiceType === InvoiceType.SHIPMENT
          ? "Logistics Services"
          : "Shipment Adjustment";

      // Generate printable HTML invoice
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.id.slice(0, 8).toUpperCase()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #fe5200; }
    .logo { font-size: 28px; font-weight: bold; color: #fe5200; }
    .invoice-info { text-align: right; }
    .invoice-number { font-size: 24px; font-weight: bold; color: #1a1a1a; }
    .invoice-date { color: #666; margin-top: 4px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
    .status.pending { background: #fef3c7; color: #92400e; }
    .status.paid { background: #d1fae5; color: #065f46; }
    .status.overdue { background: #fee2e2; color: #991b1b; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { flex: 1; }
    .party h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.5px; }
    .party p { line-height: 1.6; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .table th { text-align: left; padding: 12px; background: #f8f8f8; border-bottom: 2px solid #e5e5e5; font-size: 12px; text-transform: uppercase; color: #666; }
    .table td { padding: 12px; border-bottom: 1px solid #e5e5e5; }
    .table .text-right { text-align: right; }
    .totals { margin-left: auto; width: 300px; }
    .totals .row { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals .row.total { font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a; padding-top: 12px; margin-top: 4px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e5e5; color: #666; font-size: 12px; text-align: center; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
    .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; background: #fe5200; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .print-btn:hover { background: #e54a00; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">ezhalha</div>
    <div class="invoice-info">
      <div class="invoice-number">Invoice #${invoice.id.slice(0, 8).toUpperCase()}</div>
      <div class="invoice-date">Issue Date: ${formatDate(invoice.createdAt)}</div>
      <div class="invoice-date">Due Date: ${formatDate(invoice.dueDate)}</div>
      <span class="status ${invoice.status}">${invoice.status}</span>
    </div>
  </div>
  
  <div class="parties">
    <div class="party">
      <h3>Bill To</h3>
      <p><strong>${clientAccount?.companyName || 'Client'}</strong></p>
      <p>${clientAccount?.name || ''}</p>
      <p>${clientAccount?.country || ''}</p>
    </div>
    <div class="party" style="text-align: right;">
      <h3>From</h3>
      <p><strong>ezhalha Logistics</strong></p>
      <p>Enterprise Shipping Solutions</p>
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Description</th>
        <th>Details</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>${invoiceLineTitle}</strong><br>
          <span style="color: #666; font-size: 13px;">
            ${invoiceLineDescription}
          </span>
        </td>
        <td>
          ${invoiceLineDetails}
        </td>
        <td class="text-right">SAR ${Number(invoice.amount).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span>Subtotal</span>
      <span>SAR ${Number(invoice.amount).toFixed(2)}</span>
    </div>
    <div class="row">
      <span>Tax (0%)</span>
      <span>SAR 0.00</span>
    </div>
    <div class="row total">
      <span>Total Due</span>
      <span>SAR ${Number(invoice.amount).toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for choosing ezhalha Logistics. Payment is due within 30 days of issue date.</p>
    <p>For questions, contact support@ezhalha.com</p>
  </div>

  <button class="print-btn no-print" onclick="window.print()">Print Invoice</button>
</body>
</html>
      `;

      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  });

  // Client - Payments
  app.get("/api/client/payments", requireClient, requireClientPermission(ClientPermission.VIEW_PAYMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    await reconcilePaidShipmentsForClientAccount(user.clientAccountId, req.ip);

    const payments = await storage.getPaymentsByClientAccount(user.clientAccountId);
    res.json(payments);
  });

  app.get("/api/client/payments/tap/config", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      res.json(buildTapEmbedConfig(account));
    } catch (error) {
      logError("Failed to fetch Tap payment config", error);
      res.status(500).json({ error: "Failed to fetch payment config" });
    }
  });

  app.get("/api/client/payments/tap/saved-cards", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const cards = await storage.getTapSavedCardsByClientAccount(user.clientAccountId);
      res.json(cards);
    } catch (error) {
      logError("Failed to fetch Tap saved cards", error);
      res.status(500).json({ error: "Failed to fetch saved cards" });
    }
  });

  app.post("/api/client/payments/tap/saved-cards/:id/default", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const card = await storage.getTapSavedCard(req.params.id);
      if (!card || card.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Saved card not found" });
      }

      const cards = await storage.getTapSavedCardsByClientAccount(user.clientAccountId);
      await Promise.all(cards.map((savedCard) =>
        storage.updateTapSavedCard(savedCard.id, {
          isDefault: savedCard.id === card.id,
        }),
      ));

      const refreshed = await storage.getTapSavedCard(card.id);
      res.json(refreshed);
    } catch (error) {
      logError("Failed to set Tap saved card default", error);
      res.status(500).json({ error: "Failed to update saved card" });
    }
  });

  app.delete("/api/client/payments/tap/saved-cards/:id", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const card = await storage.getTapSavedCard(req.params.id);
      if (!card || card.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Saved card not found" });
      }

      if (card.tapCustomerId && card.tapCardId) {
        try {
          await tapService.deleteSavedCard(card.tapCustomerId, card.tapCardId);
        } catch (error) {
          logError("Tap saved card delete failed remotely", {
            cardId: card.id,
            tapCardId: card.tapCardId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await storage.updateTapSavedCard(card.id, {
        deletedAt: new Date(),
        isDefault: false,
        status: "deleted",
      });

      const remainingCards = await storage.getTapSavedCardsByClientAccount(user.clientAccountId);
      if (remainingCards.length > 0 && !remainingCards.some((savedCard) => savedCard.isDefault)) {
        await storage.updateTapSavedCard(remainingCards[0].id, { isDefault: true });
      }

      res.json({ success: true });
    } catch (error) {
      logError("Failed to delete Tap saved card", error);
      res.status(500).json({ error: "Failed to delete saved card" });
    }
  });

  app.get("/api/client/extra-fees", requireClient, requireClientPermission(ClientPermission.VIEW_PAYMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      await reconcilePaidShipmentsForClientAccount(user.clientAccountId, req.ip);

      const [shipments, invoices] = await Promise.all([
        storage.getShipmentsByClientAccount(user.clientAccountId),
        storage.getInvoicesByClientAccount(user.clientAccountId),
      ]);
      const extraFeeInvoicesByShipmentAndType = new Map<string, Invoice>();

      for (const invoice of invoices) {
        if (
          !invoice.shipmentId ||
          (invoice.invoiceType !== InvoiceType.EXTRA_WEIGHT && invoice.invoiceType !== InvoiceType.EXTRA_COST)
        ) {
          continue;
        }

        const key = `${invoice.shipmentId}:${invoice.invoiceType}`;
        const existingInvoice = extraFeeInvoicesByShipmentAndType.get(key);
        if (!existingInvoice || (existingInvoice.status !== "pending" && invoice.status === "pending")) {
          extraFeeInvoicesByShipmentAndType.set(key, invoice);
        }
      }

      const extraFeeNotices = shipments
        .filter((shipment) =>
          shipment.status !== "cancelled" &&
          parseMoneyValue(shipment.extraFeesAmountSar) > 0,
        )
        .sort((a, b) => new Date(b.extraFeesAddedAt || b.updatedAt).getTime() - new Date(a.extraFeesAddedAt || a.updatedAt).getTime())
        .flatMap((shipment) =>
          serializeClientExtraFeeNotices(shipment, {
            [InvoiceType.EXTRA_WEIGHT]:
              extraFeeInvoicesByShipmentAndType.get(`${shipment.id}:${InvoiceType.EXTRA_WEIGHT}`) || null,
            [InvoiceType.EXTRA_COST]:
              extraFeeInvoicesByShipmentAndType.get(`${shipment.id}:${InvoiceType.EXTRA_COST}`) || null,
          }),
        );

      res.json(extraFeeNotices);
    } catch (error) {
      logError("Error fetching client extra fees", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Create Tap charge for invoice payment
  const createPaymentSchema = z.object({
    invoiceId: z.string().min(1, "Invoice ID is required"),
    tapTokenId: z.string().min(1).optional(),
    saveCardForFuture: z.boolean().optional(),
  });

  const handleCreateClientPaymentCharge = async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const { invoiceId, tapTokenId, saveCardForFuture } = createPaymentSchema.parse(req.body);
      
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      if (invoice.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied to this invoice" });
      }
      
      if (invoice.status === "paid") {
        return res.status(400).json({ error: "Invoice already paid" });
      }

      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const existingPayments = await storage.getPaymentsByClientAccount(user.clientAccountId);
      const chargeResult = await tapService.createCharge({
        amount: Number(invoice.amount),
        currency: "SAR",
        description: `Invoice ${invoice.invoiceNumber}`,
        redirectUrl: `${buildAppBaseUrl(req)}/api/payments/tap/redirect`,
        postUrl: `${buildAppBaseUrl(req)}/api/webhooks/tap`,
        customer: buildTapCustomer(account),
        reference: {
          transaction: invoice.invoiceNumber,
          order: invoice.id,
        },
        metadata: {
          kind: "invoice",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientAccountId: user.clientAccountId,
        },
        sourceId: tapTokenId || DEFAULT_TAP_SOURCE_ID,
        saveCard: Boolean(saveCardForFuture && tapService.isSavedCardsEnabled()),
      });

      for (const payment of existingPayments.filter((payment) => payment.invoiceId === invoice.id && payment.status === "pending")) {
        await storage.updatePayment(payment.id, { status: "failed" });
      }

      await storage.createPayment({
        invoiceId: invoice.id,
        clientAccountId: user.clientAccountId,
        amount: invoice.amount,
        paymentMethod: "tap",
        status: tapService.isSuccessfulStatus(chargeResult.status) ? "completed" : "pending",
        transactionId: chargeResult.chargeId,
      });

      if (tapService.isSuccessfulStatus(chargeResult.status)) {
        await processTapChargeUpdate(chargeResult.charge, req.ip);
      }

      await logAudit(req.session.userId, "create_payment_charge", "payment", chargeResult.chargeId,
        `Created Tap charge for invoice ${invoice.invoiceNumber}`, req.ip);

      res.json({
        paymentId: chargeResult.chargeId,
        transactionUrl: chargeResult.transactionUrl,
        amount: invoice.amount,
        invoiceNumber: invoice.invoiceNumber,
        paymentStatus: chargeResult.status,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create Tap payment charge", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  };

  app.post("/api/client/payments/create-charge", requireClient, requireClientPermission(ClientPermission.MAKE_PAYMENTS), handleCreateClientPaymentCharge);
  app.post("/api/client/payments/create-intent", requireClient, requireClientPermission(ClientPermission.MAKE_PAYMENTS), handleCreateClientPaymentCharge);

  // Client - Track Shipment
  app.get("/api/client/shipments/:id/track", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied to this shipment" });
      }

      // Get tracking from carrier
      const trackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
      const carrierAdapter = getAdapterForShipment(shipment);
      const tracking = await carrierAdapter.trackShipment(trackingNumber);

      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrierTrackingNumber: shipment.carrierTrackingNumber,
        status: shipment.status,
        carrier: shipment.carrierName || shipment.carrierCode || "FedEx",
        estimatedDelivery: shipment.estimatedDelivery,
        actualDelivery: shipment.actualDelivery,
        tracking,
      });
    } catch (error) {
      logError("Failed to get shipment tracking", error);
      res.status(500).json({ error: "Failed to get tracking information" });
    }
  });

  // HS Code Lookup
  app.get("/api/hs-lookup", requireAuth, hsLookupLimiter, async (req, res) => {
    try {
      const querySchema = z.object({
        itemName: z.string().min(1),
        itemDescription: z.string().optional(),
        category: z.string().min(1),
        material: z.string().optional(),
        countryOfOrigin: z.string().length(2),
        destinationCountry: z.string().length(2),
      });

      const params = querySchema.parse(req.query);

      const user = await storage.getUser(req.session.userId!);
      const clientAccountId = user?.clientAccountId || undefined;

      const result = await lookupHsCode(params, clientAccountId);

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("HS code lookup failed", error);
      res.status(500).json({ error: "HS code lookup failed" });
    }
  });

  // Confirm HS Code selection (saves to history)
  app.post("/api/client/hs-code/confirm", requireClient, async (req, res) => {
    try {
      const confirmSchema = z.object({
        itemName: z.string().min(1),
        category: z.string().min(1),
        material: z.string().optional(),
        countryOfOrigin: z.string().length(2),
        hsCode: z.string().min(4),
        description: z.string().optional(),
      });

      const data = confirmSchema.parse(req.body);

      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      await confirmHsCode(
        user.clientAccountId,
        data.itemName,
        data.category,
        data.material,
        data.countryOfOrigin,
        data.hsCode,
        data.description,
      );

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("HS code confirm failed", error);
      res.status(500).json({ error: "Failed to confirm HS code" });
    }
  });

  // Admin - Get Shipping Rates
  app.post("/api/admin/shipping/rates", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const rateRequestSchema = z.object({
        senderCity: z.string(),
        senderCountry: z.string(),
        senderPostalCode: z.string().optional(),
        recipientCity: z.string(),
        recipientCountry: z.string(),
        recipientPostalCode: z.string().optional(),
        weight: z.number().positive(),
        packageType: z.string(),
      });

      const data = rateRequestSchema.parse(req.body);

      const rates = await fedexAdapter.getRates({
        shipper: {
          name: "Origin",
          streetLine1: "",
          city: data.senderCity,
          postalCode: data.senderPostalCode || "",
          countryCode: data.senderCountry,
          phone: "",
        },
        recipient: {
          name: "Destination",
          streetLine1: "",
          city: data.recipientCity,
          postalCode: data.recipientPostalCode || "",
          countryCode: data.recipientCountry,
          phone: "",
        },
        packages: [{
          weight: data.weight,
          weightUnit: "LB",
          packageType: data.packageType,
        }],
      });

      res.json({ rates, carrier: "FedEx", isConfigured: fedexAdapter.isConfigured() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get shipping rates", error);
      res.status(500).json({ error: "Failed to get shipping rates" });
    }
  });

  // ============================================
  // SHIPMENT CARRIER API ENDPOINTS
  // ============================================

  // Validate Address
  app.post("/api/shipments/validate-address", requireAuth, async (req, res) => {
    try {
      const addressSchema = z.object({
        streetLine1: z.string().min(1),
        streetLine2: z.string().optional(),
        city: z.string().optional(),
        stateOrProvince: z.string().optional(),
        postalCode: z.string().optional(),
        countryCode: z.string().min(2).max(2),
      });

      const address = addressSchema.parse(req.body);
      const result = await fedexAdapter.validateAddress({ address });
      
      await logAudit(req.session.userId!, "validate_address", "shipment", undefined, 
        `Address validation: ${address.streetLine1}, ${address.city || 'N/A'}`, req.ip);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to validate address", error);
      res.status(500).json({ error: "Failed to validate address" });
    }
  });

  // Validate Postal Code
  app.post("/api/shipments/validate-postal-code", requireAuth, async (req, res) => {
    try {
      const postalCodeSchema = z.object({
        postalCode: z.string().min(1),
        countryCode: z.string().min(2).max(2),
        stateOrProvince: z.string().optional(),
      });

      const data = postalCodeSchema.parse(req.body);
      const result = await fedexAdapter.validatePostalCode(data);
      
      await logAudit(req.session.userId!, "validate_postal_code", "shipment", undefined, 
        `Postal code validation: ${data.postalCode}, ${data.countryCode}`, req.ip);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to validate postal code", error);
      res.status(500).json({ error: "Failed to validate postal code" });
    }
  });

  // Check Service Availability
  app.post("/api/shipments/check-service", requireAuth, async (req, res) => {
    try {
      const serviceSchema = z.object({
        origin: z.object({
          postalCode: z.string().min(1),
          countryCode: z.string().min(2).max(2),
          stateOrProvince: z.string().optional(),
        }),
        destination: z.object({
          postalCode: z.string().min(1),
          countryCode: z.string().min(2).max(2),
          stateOrProvince: z.string().optional(),
        }),
        shipDate: z.string().optional(),
      });

      const data = serviceSchema.parse(req.body);
      const result = await fedexAdapter.checkServiceAvailability(data);
      
      await logAudit(req.session.userId!, "check_service_availability", "shipment", undefined, 
        `Service check: ${data.origin.postalCode} -> ${data.destination.postalCode}`, req.ip);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to check service availability", error);
      res.status(500).json({ error: "Failed to check service availability" });
    }
  });

  // Get Shipping Rates (public for authenticated users)
  app.post("/api/shipments/rates", requireAuth, async (req, res) => {
    try {
      const rateSchema = z.object({
        shipper: z.object({
          name: z.string(),
          streetLine1: z.string(),
          streetLine2: z.string().optional(),
          city: z.string(),
          stateOrProvince: z.string().optional(),
          postalCode: z.string(),
          countryCode: z.string().min(2).max(2),
          phone: z.string(),
        }),
        recipient: z.object({
          name: z.string(),
          streetLine1: z.string(),
          streetLine2: z.string().optional(),
          city: z.string(),
          stateOrProvince: z.string().optional(),
          postalCode: z.string(),
          countryCode: z.string().min(2).max(2),
          phone: z.string(),
        }),
        packages: z.array(z.object({
          weight: z.number().positive(),
          weightUnit: z.enum(["LB", "KG"]),
          dimensions: z.object({
            length: z.number().positive(),
            width: z.number().positive(),
            height: z.number().positive(),
            unit: z.enum(["IN", "CM"]),
          }).optional(),
          packageType: z.string(),
        })),
        serviceType: z.string().optional(),
      });

      const data = rateSchema.parse(req.body);
      const rates = await fedexAdapter.getRates(data);
      
      await logAudit(req.session.userId!, "get_rates", "shipment", undefined, 
        `Rate request: ${data.shipper.city} -> ${data.recipient.city}`, req.ip);
      
      res.json({ rates, carrier: "FedEx", isConfigured: fedexAdapter.isConfigured() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get rates", error);
      res.status(500).json({ error: "Failed to get rates" });
    }
  });

  // Track Shipment
  app.get("/api/shipments/:id/track", requireAuth, async (req, res) => {
    try {
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const trackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
      const carrierAdapter = getAdapterForShipment(shipment);
      const tracking = await carrierAdapter.trackShipment(trackingNumber);
      
      await logAudit(req.session.userId!, "track_shipment", "shipment", shipment.id, 
        `Tracked shipment: ${trackingNumber}`, req.ip);
      
      res.json({ ...tracking, shipment });
    } catch (error) {
      logError("Failed to track shipment", error);
      res.status(500).json({ error: "Failed to track shipment" });
    }
  });

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // ============================================
  // WEBHOOK HANDLERS
  // ============================================

  // Webhook signature validation helper with safe comparison
  function validateWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;
    const crypto = require("crypto");
    const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    
    // Safe comparison that handles length mismatches
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSignature, "utf8"));
    } catch {
      return false;
    }
  }

  // ============================================
  // FEDEX API ENDPOINTS (Dynamic Service Discovery & Validation)
  // ============================================

  app.get("/api/fedex/service-options", requireAuth, fedexApiLimiter, async (req, res) => {
    try {
      const querySchema = z.object({
        shipperCountry: z.string().min(2).max(2),
        shipperPostal: z.string().optional().default(""),
        shipperCity: z.string().min(1),
        recipientCountry: z.string().min(2).max(2),
        recipientPostal: z.string().optional().default(""),
        recipientCity: z.string().min(1),
        packagingType: z.string().optional().default("YOUR_PACKAGING"),
        weight: z.string().optional().default("1"),
        shipDate: z.string().optional(),
      });

      const params = querySchema.parse(req.query);
      const shipperCC = params.shipperCountry.toUpperCase();
      const recipientCC = params.recipientCountry.toUpperCase();
      const isInternational = shipperCC !== recipientCC;

      if (!params.shipperPostal && !POSTAL_CODE_EXEMPT_COUNTRIES.has(shipperCC)) {
        return res.status(400).json({ message: "Shipper postal code is required to fetch FedEx services for this lane." });
      }
      if (!params.recipientPostal && !POSTAL_CODE_EXEMPT_COUNTRIES.has(recipientCC)) {
        return res.status(400).json({ message: "Recipient postal code is required to fetch FedEx services for this lane." });
      }

      const cacheKey = [
        shipperCC, params.shipperPostal, params.shipperCity,
        recipientCC, params.recipientPostal, params.recipientCity,
        params.packagingType, params.weight,
      ].join("|").toUpperCase();

      const cached = serviceOptionsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }

      let services: Array<{ serviceType: string; packagingType: string; displayName: string; isInternational: boolean; validPackagingTypes?: string[] }> = [];

      try {
        const saResult = await fedexAdapter.checkServiceAvailability({
          origin: {
            postalCode: params.shipperPostal || "",
            countryCode: shipperCC,
          },
          destination: {
            postalCode: params.recipientPostal || "",
            countryCode: recipientCC,
          },
          shipDate: params.shipDate,
        });

        if (saResult.services && saResult.services.length > 0) {
          services = saResult.services
            .filter(s => s.available !== false)
            .map(s => {
              const validPkgs = s.validPackagingTypes || [];
              const requestedPkg = params.packagingType || "YOUR_PACKAGING";
              const effectivePkg = validPkgs.length > 0
                ? (validPkgs.includes(requestedPkg) ? requestedPkg : validPkgs[0])
                : requestedPkg;
              return {
                serviceType: s.serviceType,
                packagingType: effectivePkg,
                displayName: s.serviceName || s.displayName,
                isInternational,
                validPackagingTypes: validPkgs,
              };
            });
        }
      } catch (saError) {
        logError("FedEx service availability failed, falling back to rates API", saError);
      }

      if (services.length === 0) {
        try {
          const weightNum = parseFloat(params.weight) || 1;
          const rateResult = await fedexAdapter.getRates({
            shipper: {
              name: "Origin",
              streetLine1: "",
              city: params.shipperCity,
              postalCode: params.shipperPostal || "",
              countryCode: shipperCC,
              phone: "",
            },
            recipient: {
              name: "Destination",
              streetLine1: "",
              city: params.recipientCity,
              postalCode: params.recipientPostal || "",
              countryCode: recipientCC,
              phone: "",
            },
            packages: [{
              weight: weightNum,
              weightUnit: "KG",
              packageType: params.packagingType || "YOUR_PACKAGING",
            }],
            packagingType: params.packagingType || "YOUR_PACKAGING",
          });

          const seen = new Set<string>();
          services = rateResult
            .filter(r => {
              if (seen.has(r.serviceType)) return false;
              seen.add(r.serviceType);
              return true;
            })
            .map(r => ({
              serviceType: r.serviceType,
              packagingType: params.packagingType || "YOUR_PACKAGING",
              displayName: r.serviceName,
              isInternational,
            }));
        } catch (rateError) {
          logError("FedEx rates fallback also failed", rateError);
        }
      }

      const responseData = { services };
      serviceOptionsCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + SERVICE_OPTIONS_CACHE_TTL });

      res.json(responseData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors.map(e => e.message).join(", ") });
      }
      logError("Failed to get service options", error);
      res.status(500).json({ error: "Failed to get service options" });
    }
  });

  app.post("/api/fedex/validate-address", requireAuth, fedexApiLimiter, async (req, res) => {
    try {
      const addressSchema = z.object({
        streetLine1: z.string().min(1, "Street address is required"),
        streetLine2: z.string().optional(),
        city: z.string().optional(),
        stateOrProvince: z.string().optional(),
        postalCode: z.string().optional(),
        countryCode: z.string().min(2, "Country code is required").max(2, "Country code must be 2 characters"),
      });

      const address = addressSchema.parse(req.body);

      const validationErrors: string[] = [];
      const cc = address.countryCode.toUpperCase();
      if (!POSTAL_CODE_EXEMPT_COUNTRIES.has(cc) && (!address.postalCode || address.postalCode.trim() === "")) {
        validationErrors.push(`Postal code is required for country ${cc}`);
      }
      if (STATE_REQUIRED_COUNTRIES.has(cc) && (!address.stateOrProvince || address.stateOrProvince.trim() === "")) {
        validationErrors.push(`State/Province is required for country ${cc}`);
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors.join("; "), validationErrors });
      }

      const result = await fedexAdapter.validateAddress({ address });

      await logAudit(req.session.userId!, "validate_address", "fedex", undefined,
        `Address validation: ${address.streetLine1}, ${address.city || "N/A"}, ${cc}`, req.ip);

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors.map(e => e.message).join(", ") });
      }
      if (error instanceof CarrierError) {
        return res.status(502).json({ error: error.carrierMessage });
      }
      logError("Failed to validate address", error);
      res.status(500).json({ error: "Failed to validate address" });
    }
  });

  app.get("/api/fedex/validate-postal", requireAuth, fedexApiLimiter, async (req, res) => {
    try {
      const querySchema = z.object({
        country: z.string().min(2, "Country code is required").max(2, "Country code must be 2 characters"),
        postal: z.string().min(1, "Postal code is required"),
      });

      const params = querySchema.parse(req.query);

      const result = await fedexAdapter.validatePostalCode({
        postalCode: params.postal,
        countryCode: params.country,
      });

      await logAudit(req.session.userId!, "validate_postal_code", "fedex", undefined,
        `Postal code validation: ${params.postal}, ${params.country}`, req.ip);

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors.map(e => e.message).join(", ") });
      }
      if (error instanceof CarrierError) {
        return res.status(502).json({ error: error.carrierMessage });
      }
      logError("Failed to validate postal code", error);
      res.status(500).json({ error: "Failed to validate postal code" });
    }
  });

  // FedEx Webhook Handler
  app.post("/api/webhooks/fedex", async (req, res) => {
    try {
      const webhookSecret = process.env.FEDEX_WEBHOOK_SECRET;

      if (process.env.NODE_ENV === "production" && !webhookSecret) {
        return res.status(500).json({ error: "Webhook not configured" });
      }

      const rawBody = (req as any).rawBody;
      const payload = rawBody ? rawBody.toString() : JSON.stringify(req.body);
      const signature = req.headers["x-fedex-signature"] as string | undefined;

      if (webhookSecret && !validateWebhookSignature(payload, signature, webhookSecret)) {
        await storage.createWebhookEvent({
          source: "fedex",
          eventType: "signature_validation_failed",
          payload,
          signature: signature || null,
          processed: false,
          retryCount: 0,
          errorMessage: "Invalid webhook signature",
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body;
      const eventType = event.eventType || "unknown";

      const fedexWebhookPayloadSchema = z.object({
        eventType: z.string().optional(),
        trackingNumber: z.string().optional(),
        status: z.string().optional(),
        deliveryDate: z.string().optional(),
        eventId: z.string().optional(),
      }).passthrough();

      const parseResult = fedexWebhookPayloadSchema.safeParse(event);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid webhook payload" });
      }

      const eventId = event.eventId;
      if (eventId) {
        const existingEvents = await storage.getWebhookEvents();
        const duplicate = existingEvents.find(
          e => e.source === "fedex" && e.payload.includes(eventId) && e.processed
        );
        if (duplicate) {
          return res.json({ received: true, eventId: duplicate.id, duplicate: true });
        }
      }

      const webhookEvent = await storage.createWebhookEvent({
        source: "fedex",
        eventType,
        payload,
        signature: signature || null,
        processed: false,
        retryCount: 0,
      });

      if (eventType === "shipment.status_update" && event.trackingNumber) {
        const shipments = await storage.getShipments();
        const shipment = shipments.find(s => 
          s.trackingNumber === event.trackingNumber || 
          s.carrierTrackingNumber === event.trackingNumber
        );
        
        if (shipment && event.status) {
          const statusMap: Record<string, string> = {
            "IN_TRANSIT": "in_transit",
            "DELIVERED": "delivered",
            "PROCESSING": "processing",
            "PICKED_UP": "in_transit",
            "OUT_FOR_DELIVERY": "in_transit",
          };
          
          const newStatus = statusMap[event.status] || shipment.status;
          const updates: Record<string, any> = {};
          
          if (newStatus !== shipment.status) {
            updates.status = newStatus;
          }
          
          if (newStatus === "delivered" && !shipment.actualDelivery) {
            updates.actualDelivery = event.deliveryDate ? new Date(event.deliveryDate) : new Date();
          }
          
          if (Object.keys(updates).length > 0) {
            await storage.updateShipment(shipment.id, updates);
            await logAudit(undefined, "webhook_status_update", "shipment", shipment.id,
              `FedEx webhook updated: ${JSON.stringify(updates)}`, req.ip);
          }
        }
        
        await storage.updateWebhookEvent(webhookEvent.id, { processed: true, processedAt: new Date() });
      }

      res.json({ received: true, eventId: webhookEvent.id });
    } catch (error) {
      console.error("FedEx webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  app.get("/api/payments/tap/redirect", async (req, res) => {
    try {
      const tapId = typeof req.query.tap_id === "string" ? req.query.tap_id : undefined;

      if (!tapId) {
        return res.redirect("/client/payments?paymentStatus=failed&message=missing_payment_id");
      }

      const charge = await tapService.retrieveCharge(tapId);
      if (!charge) {
        return res.redirect("/client/payments?paymentStatus=failed&message=charge_not_found");
      }

      const redirectEvent = await storage.createWebhookEvent({
        source: "tap",
        eventType: "payment_redirect",
        payload: JSON.stringify(charge),
        signature: null,
        processed: false,
        retryCount: 0,
      });

      await processTapChargeUpdate(charge, req.ip);
      await storage.updateWebhookEvent(redirectEvent.id, {
        processed: true,
        processedAt: new Date(),
      });

      const target = charge.metadata?.kind;
      const message = encodeURIComponent(charge.response?.message || "Payment was not completed");
      const shipmentCreatePath = "/client/shipments/new";

      if (target === "shipment" && charge.metadata?.shipmentId) {
        if (tapService.isSuccessfulStatus(charge.status)) {
          return res.redirect(`${shipmentCreatePath}?shipmentId=${charge.metadata.shipmentId}&paymentStatus=success`);
        }
        if (tapService.isFailureStatus(charge.status)) {
          return res.redirect(`${shipmentCreatePath}?shipmentId=${charge.metadata.shipmentId}&paymentStatus=failed&message=${message}`);
        }
        return res.redirect(`${shipmentCreatePath}?shipmentId=${charge.metadata.shipmentId}&paymentStatus=pending`);
      }

      if (target === "invoice" && charge.metadata?.invoiceId) {
        if (tapService.isSuccessfulStatus(charge.status)) {
          return res.redirect(`/client/invoices?invoiceId=${charge.metadata.invoiceId}&paymentStatus=success`);
        }
        if (tapService.isFailureStatus(charge.status)) {
          return res.redirect(`/client/invoices?invoiceId=${charge.metadata.invoiceId}&paymentStatus=failed&message=${message}`);
        }
        return res.redirect(`/client/invoices?invoiceId=${charge.metadata.invoiceId}&paymentStatus=pending`);
      }

      if (tapService.isSuccessfulStatus(charge.status)) {
        return res.redirect("/client/payments?paymentStatus=success");
      }

      if (tapService.isFailureStatus(charge.status)) {
        return res.redirect(`/client/payments?paymentStatus=failed&message=${message}`);
      }

      return res.redirect("/client/payments?paymentStatus=pending");
    } catch (error) {
      logError("Tap redirect error", error);
      return res.redirect("/client/payments?paymentStatus=failed&message=callback_error");
    }
  });

  app.post("/api/webhooks/tap", async (req, res) => {
    try {
      const rawBody = (req as any).rawBody;
      const payload = rawBody ? rawBody.toString() : JSON.stringify(req.body);
      const signature = req.headers["hashstring"] as string | undefined;
      const charge = req.body as TapCharge;

      if (tapService.isConfigured() && !tapService.validateWebhookSignature(req.body, signature)) {
        await storage.createWebhookEvent({
          source: "tap",
          eventType: "signature_validation_failed",
          payload,
          signature: signature || null,
          processed: false,
          retryCount: 0,
          errorMessage: "Invalid webhook signature",
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const webhookEvent = await storage.createWebhookEvent({
        source: "tap",
        eventType: `charge.${String(charge.status || "updated").toLowerCase()}`,
        payload,
        signature: signature || null,
        processed: false,
        retryCount: 0,
      });

      if (charge.id) {
        await processTapChargeUpdate(charge, req.ip);
      }

      await storage.updateWebhookEvent(webhookEvent.id, {
        processed: true,
        processedAt: new Date(),
      });

      res.json({ received: true, eventId: webhookEvent.id });
    } catch (error) {
      logError("Tap webhook error", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Generic webhook status endpoint
  app.get("/api/webhooks/status", requireAdminPermission("webhooks", "read"), async (_req, res) => {
    try {
      const events = await storage.getWebhookEvents();
      const recentEvents = events.slice(0, 50);
      const stats = {
        total: events.length,
        processed: events.filter(e => e.processed).length,
        pending: events.filter(e => !e.processed).length,
        failed: events.filter(e => e.errorMessage).length,
      };
      res.json({ stats, recentEvents });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch webhook status" });
    }
  });

  return httpServer;
}
