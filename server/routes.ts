import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { storage } from "./storage";
import type {
  Department,
  ClientAccount,
  ClientApplication,
  ClientUserPermission,
  Invoice,
  Payment,
  Permission,
  Role,
  Shipment,
  AbandonedShipmentRecovery,
  ShipmentRefundRequest,
  UserInvitation,
  User,
} from "@shared/schema";
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
  AbandonedShipmentRecoveryChannel,
  AbandonedShipmentRecoveryStatus,
  FedExTradeDocumentType,
  InvoiceType,
  OperationEventAudience,
  OperationShipmentKind,
  ShipmentRefundApprovalStatus,
  ShipmentRefundRequestActorType,
  ShipmentRefundRequestStatus,
  shipmentTradeDocumentSchema,
  ShipmentExtraFeeType,
  DdpTransportMethod,
  type DdpTransportMethodValue,
  INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY,
  IntegrationAccountCountryBasis,
  insertDdpPricingLaneSchema,
  insertLocalCarrierPricingTierSchema,
  insertVirtualCarrierSchema,
  insertSalesChannelSchema,
  insertCarrierAssignmentRuleSchema,
  type ClientPermissionValue,
} from "@shared/schema";
import {
  DEFAULT_INTERNAL_DEPARTMENTS,
  HIERARCHY_LEVEL_LABELS,
  HIERARCHY_LEVEL_SORT_ORDER,
  INTERNAL_DEPARTMENT_STYLE_PRESETS,
  InternalDepartmentSlug,
  RoleHierarchyLevel,
  UserInvitationStatus,
  type RoleHierarchyLevelValue,
} from "@shared/internal-users";
import { logInfo, logWarn, logError, logAuditToFile, logApiRequest, logWebhook, logPricingChange, logProfileChange } from "./services/logger";
import { sendAccountCredentials, sendApplicationReceived, sendApplicationRejected, notifyAdminNewApplication, sendCreditInvoiceCreated, sendCreditInvoiceReminder, sendShipmentExtraFeesNotification, sendEmail } from "./services/email";
import { getRenderedTemplate } from "./services/email-templates";
import { fedexAdapter, CarrierError } from "./integrations/fedex";
import type { CarrierAdapter, CreateShipmentRequest, ShippingAddress, PickupRequest, PackageDetails } from "./integrations/fedex";
import { carrierService, getCarrierAdapter } from "./integrations/carriers";
import { zohoService } from "./integrations/zoho";
import type { TapCharge } from "./integrations/tap";
import { tapService, getTapSettledSarAmount } from "./integrations/tap";
import { getSarRate, convertFromSar, normalizeCurrency } from "./services/fx";
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
import { buildGenericCarrierShipmentRequestFromShipment } from "./services/generic-carrier-shipment";
import { CARRIER_CONTACT_EMAIL } from "./services/carrier-constants";
import { computeQuotationPricing } from "./services/admin-quotations";
import { extractInvoiceItemsFromDocument } from "./services/invoice-extraction";
import { extractPackageDetailsFromDocument } from "./services/package-extraction";
import { extractCompanyDetailsFromDocuments, isGeminiCompanyExtractionConfigured } from "./services/gemini-company-extraction";
import { applyCarrierTrackingToShipment } from "./services/express-tracking-refresh";
import {
  hasCommercialInvoiceData,
  renderCommercialInvoiceHtml,
  renderCommercialInvoicePdfBuffer,
} from "./services/commercial-invoice";
import { calculateChargeableWeight, type ChargeableWeightSummary } from "@shared/chargeable-weight";
import { normalizeCountryCode } from "@shared/countries";
import { countryLocalNow } from "@shared/country-timezones";
import {
  INTEGRATION_APP_DEFINITIONS,
  buildEnvAccount,
  decryptIntegrationPayload,
  encryptIntegrationPayload,
  getIntegrationDefinition,
  loadDefaultIntegrationAccountsIntoEnv,
  runIntegrationAccountTest,
  sanitizeIntegrationCredentials,
  sanitizeIntegrationSettings,
  serializeIntegrationAccount,
  serializeIntegrationAccountSafely,
} from "./services/integration-apps";
import {
  getCurrentIntegrationAccountId,
  getActiveIntegrationAccounts,
  getEligibleIntegrationAccountsForShipment,
  getIntegrationAccountCountryBasis,
  getIntegrationEnv,
  selectCheapestCarrierAccountPortfolio,
  withBoundIntegrationAccount,
  withIntegrationAccount,
  withShipmentIntegrationAccount,
} from "./services/integration-runtime";
import { calculateDdpPrice } from "./services/ddp-pricing";
import { resolveLocalRate } from "./services/local-pricing";
import {
  getSalesChannelAdapter,
  getSignatureHeader,
} from "./services/sales-channels";
import { syncSalesChannel } from "./services/sales-channel-sync";
import {
  OperationInputError,
  OPERATION_PERMISSION_NAMES,
  OPERATION_ROLE_NAMES,
  canViewOperationFinancialBreakdown,
  completeOperationTask,
  createOperationEvent,
  createOperationNote,
  ensureDefaultOperationTasks,
  ensureOperationAssignmentForShipment,
  ensureOperationProfile,
  getOperationRoleNames,
  getOperationShipmentDetail,
  updateOperationTaskMetadata,
  getOperationSummary,
  getOperationViewerScope,
  getOperationsUsers,
  getUnreadNotificationCount,
  listNotificationsForUser,
  listOperationShipments,
  markAllNotificationsRead,
  markNotificationRead,
  notifyUser,
  notifyUsers,
  reassignOperationShipment,
  recordShipmentStatusChange,
  resolveAttentionFlags,
  resolveSpecialHandling,
  setOperationShipmentAssignments,
  updateOperationShipmentStatus,
  upsertSpecialHandling,
  validateDdpStageTransition,
} from "./services/operations";
import {
  TaskPermissionError,
  TaskStateError,
  addTaskComment,
  completeTask,
  createTask,
  getTaskDetail,
  getTaskSummary,
  getTaskUsers,
  listTasks,
  reopenTask,
  updateTask,
  type TaskListFilters,
  type TaskViewKey,
} from "./services/tasks";

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
  return enrichItemsWithHsCodes(items, options);
}

type HsEnrichableItem = {
  itemName: string;
  itemDescription?: string;
  category: string;
  material?: string;
  countryOfOrigin: string;
  hsCode?: string;
  hsCodeSource?: "USER" | "FEDEX" | "HISTORY" | "UNKNOWN";
  hsCodeConfidence?: "HIGH" | "MEDIUM" | "LOW" | "MISSING";
  hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
};

async function enrichItemsWithHsCodes<T extends HsEnrichableItem>(
  items: T[],
  options: {
    clientAccountId?: string;
    destinationCountry: string;
  },
): Promise<{
  items: T[];
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
        const existingCandidates = Array.isArray(item.hsCodeCandidates) ? item.hsCodeCandidates : [];
        let candidates = existingCandidates;
        let source = item.hsCodeSource;

        if (candidates.length === 0) {
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

          candidates = hsLookup.candidates;
          source = hsLookup.source;
        }

        const topCandidate = candidates[0];
        const confidence = hsConfidenceFromScore(topCandidate?.confidence);
        const hadHsCode = Boolean(item.hsCode?.trim());
        const attachedHsCode = item.hsCode?.trim() || topCandidate?.code?.trim() || "";

        if (!hadHsCode && attachedHsCode) {
          autoMatchedHsCodeCount += 1;
        }

        if (
          (!attachedHsCode && candidates.length > 0) ||
          confidence === "LOW" ||
          confidence === "MEDIUM" ||
          (!hadHsCode && isGenericItemName(item.itemName))
        ) {
          hsCodeReviewCount += 1;
        }

        return {
          ...item,
          hsCode: attachedHsCode || item.hsCode,
          hsCodeSource: (source || item.hsCodeSource) as T["hsCodeSource"],
          hsCodeConfidence: (topCandidate ? confidence : item.hsCodeConfidence) as T["hsCodeConfidence"],
          hsCodeCandidates: candidates as T["hsCodeCandidates"],
        } as T;
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
    if (digits.startsWith(fallbackDialCode) && digits.length > fallbackDialCode.length) {
      return {
        countryCode: fallbackDialCode,
        number: digits.slice(fallbackDialCode.length).replace(/^0+/, "") || digits.slice(fallbackDialCode.length),
      };
    }

    const match = rawPhone.replace(/[^\d+]/g, "").match(/^\+(\d{1,3})(\d+)$/);
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

function getClientShippingIntegrationCountryCode(account: ClientAccount): string | undefined {
  return normalizeCountryCode(account.shippingCountryCode) || normalizeCountryCode(account.country);
}

function getClientBaseIntegrationCountryCode(account: ClientAccount): string | undefined {
  return normalizeCountryCode(account.country) || normalizeCountryCode(account.shippingCountryCode);
}

function getClientIntegrationRoutingOptions(account: ClientAccount, shipperCountryCode?: string | null) {
  return {
    shipperCountryCode: normalizeCountryCode(shipperCountryCode) || getClientShippingIntegrationCountryCode(account),
    clientBaseCountryCode: getClientBaseIntegrationCountryCode(account),
    clientAccountId: account.id,
  };
}

function getShipmentIntegrationRoutingOptions(shipment: Shipment) {
  return {
    shipperCountryCode: shipment.senderCountry,
    recipientCountryCode: shipment.recipientCountry,
    clientAccountId: shipment.clientAccountId,
  };
}

// Live carrier base rate for a local (KSA-domestic) lane, when the carrier's rate API is
// configured. Returns null when unconfigured or the carrier exposes no rate API — the
// caller then falls back to the stored rate-card tier.
async function resolveLiveLocalBaseRate(
  adapter: CarrierAdapter,
  fromCity: string,
  toCity: string,
  weightKg: number,
): Promise<number | null> {
  if (!adapter.isConfigured()) return null;
  const minimalAddress = (city: string): ShippingAddress => ({
    name: "",
    streetLine1: "",
    city: city || "",
    postalCode: "",
    countryCode: "SA",
    phone: "",
  });
  try {
    const rates = await withShipmentIntegrationAccount(
      getIntegrationAppKeyForCarrier(adapter.carrierCode),
      { shipperCountryCode: "SA", recipientCountryCode: "SA" },
      () =>
        adapter.getRates({
          shipper: minimalAddress(fromCity),
          recipient: minimalAddress(toCity),
          packages: [{ weight: weightKg, weightUnit: "KG", packageType: "PARCEL" }],
          currency: "SAR",
        }),
    );
    const base = rates?.[0]?.baseRate;
    return Number.isFinite(base) && Number(base) > 0 ? Number(base) : null;
  } catch (error) {
    logError(`Live local rate lookup failed for ${adapter.carrierCode}`, error);
    return null;
  }
}

function buildTapCustomer(account: ClientAccount, tapIntegrationAccountId?: string | null) {
  const displayName =
    account.shippingContactName ||
    account.name ||
    account.companyName ||
    "Ezhalha Customer";
  const { firstName, lastName } = splitFullName(displayName);
  const phone = normalizePhoneNumber(
    account.shippingContactPhone || account.phone,
    account.country || account.shippingCountryCode,
  );

  return {
    ...(account.tapCustomerId &&
    (!tapIntegrationAccountId || account.tapIntegrationAccountId === tapIntegrationAccountId)
      ? { id: account.tapCustomerId }
      : {}),
    firstName,
    lastName,
    email: account.email,
    ...(phone ? { phone } : {}),
  };
}

function buildTapEmbedConfig(account: ClientAccount, tapIntegrationAccountId?: string | null) {
  const customer = buildTapCustomer(account, tapIntegrationAccountId);
  const merchantId = tapService.getMerchantId() || null;
  const sanitizedPhone =
    customer.phone &&
    /^[1-9]\d{0,2}$/.test(customer.phone.countryCode) &&
    /^\d{6,15}$/.test(customer.phone.number)
      ? customer.phone
      : null;

  return {
    configured: tapService.isConfigured(),
    embeddedCardEnabled: tapService.isEmbeddedCardConfigured(),
    hostedRedirectEnabled: tapService.isConfigured(),
    publicKey: tapService.getPublicKey() || null,
    merchantId,
    sdkScriptUrl: tapService.getSdkScriptUrl(),
    saveCardEnabled: tapService.isSavedCardsEnabled(),
    supportedBrands: ["VISA", "MASTERCARD", "AMERICAN_EXPRESS", "MADA"],
    locale: "en",
    customer: {
      tapCustomerId: merchantId ? customer.id || null : null,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: sanitizedPhone,
    },
  };
}

function buildZohoCustomerParams(account: ClientAccount) {
  return {
    name: account.name,
    email: account.email,
    phone: account.phone,
    companyName: account.companyName || undefined,
    country: account.country,
    customerType: account.accountType === "individual" ? "individual" as const : "business" as const,
    taxRegNo: account.taxNumber || undefined,
    crNumber: account.crNumber || undefined,
    shippingContactName: account.shippingContactName || undefined,
    shippingContactPhone: account.shippingContactPhone || undefined,
    shippingCountryCode: account.shippingCountryCode || undefined,
    shippingStateOrProvince: account.shippingStateOrProvince || undefined,
    shippingCity: account.shippingCity || undefined,
    shippingPostalCode: account.shippingPostalCode || undefined,
    shippingAddressLine1: account.shippingAddressLine1 || undefined,
    shippingAddressLine2: account.shippingAddressLine2 || undefined,
    shippingShortAddress: account.shippingShortAddress || undefined,
    nameAr: account.nameAr || undefined,
    companyNameAr: account.companyNameAr || undefined,
    shippingContactNameAr: account.shippingContactNameAr || undefined,
    shippingContactPhoneAr: account.shippingContactPhoneAr || undefined,
    shippingCountryCodeAr: account.shippingCountryCodeAr || undefined,
    shippingStateOrProvinceAr: account.shippingStateOrProvinceAr || undefined,
    shippingCityAr: account.shippingCityAr || undefined,
    shippingPostalCodeAr: account.shippingPostalCodeAr || undefined,
    shippingAddressLine1Ar: account.shippingAddressLine1Ar || undefined,
    shippingAddressLine2Ar: account.shippingAddressLine2Ar || undefined,
    shippingShortAddressAr: account.shippingShortAddressAr || undefined,
  };
}

async function ensureZohoCustomerForClient(account: ClientAccount, shipperCountryCode?: string | null) {
  let zohoIntegrationAccountId = account.zohoIntegrationAccountId;
  return withBoundIntegrationAccount("zoho", zohoIntegrationAccountId, getClientIntegrationRoutingOptions(account, shipperCountryCode), async () => {
    zohoIntegrationAccountId =
      getCurrentIntegrationAccountId() || zohoIntegrationAccountId || "env:zoho";
    if (!zohoService.isConfigured()) {
      return { zohoCustomerId: account.zohoCustomerId, zohoIntegrationAccountId };
    }

    if (account.zohoCustomerId && account.zohoIntegrationAccountId === zohoIntegrationAccountId) {
      return { zohoCustomerId: account.zohoCustomerId, zohoIntegrationAccountId };
    }

    // syncCustomer dedups by email (reuse + refresh) instead of always creating.
    const zohoCustomerId = await zohoService.syncCustomer(buildZohoCustomerParams(account));
    if (zohoCustomerId) {
      await storage.updateClientAccount(account.id, { zohoCustomerId, zohoIntegrationAccountId });
    }
    return { zohoCustomerId, zohoIntegrationAccountId };
  });
}

/**
 * Approve a client application: create the client account (+ Zoho customer), create the primary
 * user with a temporary password, mark the application approved, audit it, and email credentials.
 * Shared by the admin review endpoint and the automatic approval of individual applicants.
 * Returns the created client account, or throws EmailInUseError if the email already has a user.
 */
class EmailInUseError extends Error {
  constructor() {
    super("A user with this email already exists");
    this.name = "EmailInUseError";
  }
}

async function approveClientApplication(
  application: ClientApplication,
  options: { profile?: string; reviewedByUserId?: string; reviewNotes?: string; ipAddress?: string; auditAction?: string },
): Promise<ClientAccount> {
  const existingUser = await storage.getUserByEmail(application.email);
  if (existingUser) {
    throw new EmailInUseError();
  }

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
    profile: options.profile || "regular",
    isActive: true,
  });

  await ensureZohoCustomerForClient(clientAccount).catch((error) => {
    logError("Failed to create Zoho customer", error);
  });

  // Unique username derived from the email local part.
  let username = application.email.split("@")[0];
  let existingUsername = await storage.getUserByUsername(username);
  let counter = 1;
  while (existingUsername) {
    username = `${application.email.split("@")[0]}${counter}`;
    existingUsername = await storage.getUserByUsername(username);
    counter++;
  }

  // No temp password — the user sets their own via the welcome email link. Store a random,
  // unusable password so the account can't be signed into until it's set.
  const hashedPassword = await bcrypt.hash(randomUUID() + randomUUID(), SALT_ROUNDS);

  const createdUser = await storage.createUser({
    username,
    email: application.email,
    password: hashedPassword,
    phone: application.phone || null,
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    mustChangePassword: false,
    isActive: true,
  });

  await storage.updateClientApplication(application.id, {
    status: "approved",
    reviewedBy: options.reviewedByUserId,
    reviewNotes: options.reviewNotes,
  });

  await logAudit(
    options.reviewedByUserId,
    options.auditAction || "approve_application",
    "client_application",
    application.id,
    `Approved application for ${application.email}, created client account`,
    options.ipAddress,
  );

  await sendPasswordSetupEmail(createdUser, "onboard");

  return clientAccount;
}

// Issue a one-time token and email a set/reset-password link. purpose "onboard" (7-day) for new
// accounts to set their initial password; "reset" (1-hour) for forgot-password.
async function sendPasswordSetupEmail(user: User, purpose: "onboard" | "reset"): Promise<void> {
  await storage.invalidatePasswordResetTokensForUser(user.id);
  const token = `${randomUUID()}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const ttlMs = purpose === "onboard" ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  await storage.createPasswordResetToken({
    userId: user.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    purpose,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  const url = `${APP_BASE_URL}/reset-password?token=${token}`;
  const onboard = purpose === "onboard";
  const delivered = await sendEmail({
    to: user.email,
    subject: onboard ? "Welcome to ezhalha — set your password" : "Reset your ezhalha password",
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="margin:0 0 8px">${onboard ? "Welcome to ezhalha" : "Reset your password"}</h2>
      <p style="color:#555;margin:0 0 16px">${onboard
        ? "Your account is ready. Set a password to sign in."
        : "We received a request to reset your password. Click below to choose a new one."}</p>
      <a href="${url}" style="display:inline-block;background:#fe5200;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${onboard ? "Set my password" : "Reset my password"}</a>
      <p style="color:#888;font-size:12px;margin-top:16px">This link expires in ${onboard ? "7 days" : "1 hour"}. If you didn't request this, you can ignore this email.</p>
    </div>`,
    text: `${onboard ? "Welcome to ezhalha. Set your password" : "Reset your ezhalha password"}: ${url} (expires in ${onboard ? "7 days" : "1 hour"})`,
  });
  if (!delivered) {
    logError("Password setup/reset email was not delivered", undefined, { email: user.email, purpose });
  }
}

// VAT embedded in an invoice's amount, mirroring the platform's own tax engine
// (server/services/shipment-accounting.ts) so Zoho shows identical figures in every
// scenario. The base shipment invoice uses the engine's exact `sellTaxAmountSar`:
//   - DCE (domestic): (cost+margin) × 15%, the whole amount taxable.
//   - IMPORT / EXPORT / DDP: margin × 0.15/1.15 only (cost passthrough non-taxable);
//     export is NOT zero-rated — it carries margin VAT like import.
// Extra-weight / custom-charge invoices are pure margin (additional service revenue),
// so VAT is the inclusive 15% portion of their amount in every scenario.
function computeInvoiceTaxAmount(invoice: Invoice, shipment?: Shipment): number {
  if (invoice.invoiceType === InvoiceType.SHIPMENT && shipment) {
    return roundMoney(parseMoneyValue(shipment.sellTaxAmountSar));
  }
  return roundMoney((parseMoneyValue(invoice.amount) * 0.15) / 1.15);
}

// Human-readable shipment context surfaced on the Zoho invoice (type, route, tracking).
function buildShipmentZohoContext(shipment?: Shipment) {
  if (!shipment) return { typeLabel: "", route: "", notes: "" };
  const kind = (shipment.fulfillmentType === "ddp_manual" || shipment.isDdp || shipment.carrierCode === "DDP")
    ? "DDP"
    : "Express";
  const scenario = shipment.taxScenario ? ` (${shipment.taxScenario})` : "";
  const typeLabel = `${kind}${scenario}`;
  const origin = [shipment.senderCity, shipment.senderCountry].filter(Boolean).join(", ");
  const destination = [shipment.recipientCity, shipment.recipientCountry].filter(Boolean).join(", ");
  const route = origin && destination ? `${origin} → ${destination}` : origin || destination;
  const notes = [
    `Tracking: ${shipment.trackingNumber}`,
    `Type: ${typeLabel}`,
    origin ? `Origin: ${origin}` : null,
    destination ? `Destination: ${destination}` : null,
  ].filter(Boolean).join("\n");
  return { typeLabel, route, notes };
}

async function syncInvoiceToZoho(invoice: Invoice, shipment?: Shipment) {
  const account = await storage.getClientAccount(invoice.clientAccountId);
  if (!account) return invoice;

  try {
    const customer = await ensureZohoCustomerForClient(account, shipment?.senderCountry);
    if (!customer.zohoCustomerId) return invoice;
    const taxScenario = invoice.taxScenario || shipment?.taxScenario || null;
    const currency = invoice.currency || shipment?.currency || "SAR";
    const taxAmountSar = computeInvoiceTaxAmount(invoice, shipment);
    const context = buildShipmentZohoContext(shipment);
    const baseName = shipment ? `Shipment ${shipment.trackingNumber}` : invoice.description || invoice.invoiceNumber;
    const lineName = [
      invoice.invoiceType && invoice.invoiceType !== InvoiceType.SHIPMENT ? (invoice.description || baseName) : baseName,
      context.typeLabel,
      context.route,
    ].filter(Boolean).join(" · ");
    const combinedNotes = [context.notes, invoice.description && invoice.invoiceType !== InvoiceType.SHIPMENT ? invoice.description : null]
      .filter(Boolean).join("\n");
    return await withBoundIntegrationAccount("zoho", customer.zohoIntegrationAccountId, getClientIntegrationRoutingOptions(account, shipment?.senderCountry), async () => {
      if (!zohoService.isConfigured()) return invoice;
      const result = await zohoService.syncInvoice(invoice.id, {
        customerId: customer.zohoCustomerId || undefined,
        customerName: account.name,
        customerEmail: account.email,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.createdAt.toISOString().split("T")[0],
        dueDate: invoice.dueDate.toISOString().split("T")[0],
        lineItems: [{
          name: lineName,
          description: invoice.description || undefined,
          quantity: 1,
          rate: Number(invoice.amount),
        }],
        taxAmountSar,
        taxScenario: taxScenario || undefined,
        currency,
        referenceNumber: shipment?.trackingNumber,
        notes: combinedNotes || undefined,
      }, invoice.zohoInvoiceId || undefined);
      if (!result.zohoInvoiceId) {
        // Still persist the tax fields we derived so later payment/credit-note paths reuse them.
        return (await storage.updateInvoice(invoice.id, {
          taxScenario: taxScenario || invoice.taxScenario,
          taxAmountSar: taxAmountSar.toFixed(2),
          currency,
        })) || invoice;
      }
      return (await storage.updateInvoice(invoice.id, {
        zohoInvoiceId: result.zohoInvoiceId,
        zohoInvoiceUrl: result.invoiceUrl || invoice.zohoInvoiceUrl,
        zohoIntegrationAccountId: customer.zohoIntegrationAccountId,
        taxScenario: taxScenario || invoice.taxScenario,
        taxAmountSar: taxAmountSar.toFixed(2),
        currency,
      })) || invoice;
    });
  } catch (error) {
    logError("Failed to sync invoice to Zoho", {
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return invoice;
  }
}

// Push a shipment operational expense to Zoho as an expense (internal cost). No-op
// when ZOHO_EXPENSE_ACCOUNT_ID is not configured. Stores the returned id for later delete.
async function syncShipmentExpenseToZoho(expenseId: string, shipment: Shipment, description: string, amountSar: number) {
  const accountId = getIntegrationEnv("ZOHO_EXPENSE_ACCOUNT_ID");
  if (!accountId) return;
  try {
    const account = await storage.getClientAccount(shipment.clientAccountId);
    if (!account) return;
    await withBoundIntegrationAccount(
      "zoho",
      account.zohoIntegrationAccountId,
      getClientIntegrationRoutingOptions(account, shipment.senderCountry),
      async () => {
        if (!zohoService.isConfigured()) return;
        const zohoExpenseId = await zohoService.createExpense({
          accountId,
          paidThroughAccountId: getIntegrationEnv("ZOHO_PAID_THROUGH_ACCOUNT_ID") || undefined,
          amount: amountSar,
          date: new Date().toISOString().split("T")[0],
          description: `${description} — ${shipment.trackingNumber}`,
          referenceNumber: shipment.trackingNumber,
          customerId: account?.zohoCustomerId || undefined,
          currency: "SAR",
        });
        if (zohoExpenseId) {
          await storage.updateShipmentExpense(expenseId, { zohoExpenseId });
        }
      },
    );
  } catch (error) {
    logError("Failed to sync shipment expense to Zoho", { expenseId, error: error instanceof Error ? error.message : String(error) });
  }
}

function buildAppBaseUrl(req: Request): string {
  const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
  return `${protocol}://${host}`;
}

type ReusableShipmentAddress = {
  name: string;
  phone: string;
  email?: string | null;
  countryCode: string;
  city: string;
  postalCode?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  stateOrProvince?: string | null;
  shortAddress?: string | null;
};

type AddressBookEntryResponse = ReusableShipmentAddress & {
  id: string;
  label: string;
  source: "default_shipping" | "shipment_history";
  useForShipper: boolean;
  useForRecipient: boolean;
  lastUsedAt: string | null;
};

function normalizeAddressBookValue(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isReusableShipmentAddress(address: ReusableShipmentAddress | null): address is ReusableShipmentAddress {
  if (!address) {
    return false;
  }

  return Boolean(
    address.name?.trim() &&
      address.phone?.trim() &&
      address.countryCode?.trim() &&
      address.city?.trim() &&
      address.addressLine1?.trim(),
  );
}

function buildAddressBookKey(address: ReusableShipmentAddress): string {
  const fingerprint = [
    normalizeAddressBookValue(address.name),
    normalizeAddressBookValue(address.phone),
    normalizeAddressBookValue(address.email),
    normalizeAddressBookValue(address.countryCode),
    normalizeAddressBookValue(address.city),
    normalizeAddressBookValue(address.postalCode),
    normalizeAddressBookValue(address.addressLine1),
    normalizeAddressBookValue(address.addressLine2),
    normalizeAddressBookValue(address.stateOrProvince),
    normalizeAddressBookValue(address.shortAddress),
  ].join("|");

  return createHash("sha1").update(fingerprint).digest("hex");
}

function buildAddressBookLabel(address: ReusableShipmentAddress, source: "default_shipping" | "shipment_history"): string {
  if (source === "default_shipping") {
    return "Default shipping address";
  }

  const locationParts = [address.city?.trim(), address.countryCode?.trim().toUpperCase()].filter(Boolean);
  return `${address.name.trim()}${locationParts.length ? ` — ${locationParts.join(", ")}` : ""}`;
}

function buildAccountDefaultShipmentAddress(account: ClientAccount): ReusableShipmentAddress | null {
  if (!account.shippingContactName || !account.shippingContactPhone || !account.shippingCountryCode || !account.shippingCity || !account.shippingAddressLine1) {
    return null;
  }

  return {
    name: account.shippingContactName,
    phone: account.shippingContactPhone,
    email: account.email || null,
    countryCode: account.shippingCountryCode,
    city: account.shippingCity,
    postalCode: account.shippingPostalCode || "",
    addressLine1: account.shippingAddressLine1,
    addressLine2: account.shippingAddressLine2 || "",
    stateOrProvince: account.shippingStateOrProvince || "",
    shortAddress: account.shippingShortAddress || "",
  };
}

function buildShipmentSenderAddress(shipment: Shipment): ReusableShipmentAddress {
  return {
    name: shipment.senderName,
    phone: shipment.senderPhone,
    email: shipment.senderEmail,
    countryCode: shipment.senderCountry,
    city: shipment.senderCity,
    postalCode: shipment.senderPostalCode || "",
    addressLine1: shipment.senderAddress,
    addressLine2: shipment.senderAddressLine2 || "",
    stateOrProvince: shipment.senderStateOrProvince || "",
    shortAddress: shipment.senderShortAddress || "",
  };
}

function buildShipmentRecipientAddress(shipment: Shipment): ReusableShipmentAddress {
  return {
    name: shipment.recipientName,
    phone: shipment.recipientPhone,
    email: shipment.recipientEmail,
    countryCode: shipment.recipientCountry,
    city: shipment.recipientCity,
    postalCode: shipment.recipientPostalCode || "",
    addressLine1: shipment.recipientAddress,
    addressLine2: shipment.recipientAddressLine2 || "",
    stateOrProvince: shipment.recipientStateOrProvince || "",
    shortAddress: shipment.recipientShortAddress || "",
  };
}

// Build a client's reusable address book (default shipping + de-duplicated shipment history),
// sorted default-first then most-recent. Shared by the client endpoint and the admin quotation
// flow (so admins building a quote see the same saved addresses the client would).
async function buildClientAddressBook(clientAccountId: string): Promise<AddressBookEntryResponse[]> {
  const [account, clientShipments] = await Promise.all([
    storage.getClientAccount(clientAccountId),
    storage.getShipmentsByClientAccount(clientAccountId),
  ]);
  if (!account) return [];

  const entriesByKey = new Map<string, AddressBookEntryResponse>();
  const addEntry = (
    address: ReusableShipmentAddress | null,
    options: { source: "default_shipping" | "shipment_history"; useForShipper: boolean; useForRecipient: boolean; lastUsedAt?: Date | null },
  ) => {
    if (!isReusableShipmentAddress(address)) return;
    const key = buildAddressBookKey(address);
    const existing = entriesByKey.get(key);
    const lastUsedAtIso = options.lastUsedAt ? options.lastUsedAt.toISOString() : null;
    if (!existing) {
      entriesByKey.set(key, {
        id: key,
        label: buildAddressBookLabel(address, options.source),
        source: options.source,
        useForShipper: options.useForShipper,
        useForRecipient: options.useForRecipient,
        lastUsedAt: lastUsedAtIso,
        ...address,
      });
      return;
    }
    const existingTime = existing.lastUsedAt ? new Date(existing.lastUsedAt).getTime() : 0;
    const incomingTime = options.lastUsedAt ? options.lastUsedAt.getTime() : 0;
    const shouldPromoteDefault = options.source === "default_shipping" && existing.source !== "default_shipping";
    entriesByKey.set(key, {
      ...existing,
      email: existing.email || address.email || null,
      useForShipper: existing.useForShipper || options.useForShipper,
      useForRecipient: existing.useForRecipient || options.useForRecipient,
      source: shouldPromoteDefault ? "default_shipping" : existing.source,
      label: shouldPromoteDefault ? buildAddressBookLabel(address, "default_shipping") : existing.label,
      lastUsedAt: incomingTime > existingTime ? lastUsedAtIso : existing.lastUsedAt,
    });
  };

  addEntry(buildAccountDefaultShipmentAddress(account), {
    source: "default_shipping",
    useForShipper: true,
    useForRecipient: true,
    lastUsedAt: account.createdAt,
  });
  for (const shipment of clientShipments) {
    addEntry(buildShipmentSenderAddress(shipment), { source: "shipment_history", useForShipper: true, useForRecipient: false, lastUsedAt: shipment.createdAt });
    addEntry(buildShipmentRecipientAddress(shipment), { source: "shipment_history", useForShipper: false, useForRecipient: true, lastUsedAt: shipment.createdAt });
  }

  return Array.from(entriesByKey.values()).sort((a, b) => {
    if (a.source === "default_shipping" && b.source !== "default_shipping") return -1;
    if (b.source === "default_shipping" && a.source !== "default_shipping") return 1;
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.label.localeCompare(b.label);
  });
}

function resolveCarrierCode(carrier?: string | null): string {
  return carrier?.trim() ? carrier.trim().toUpperCase() : "FEDEX";
}

// Note written onto the aggregator provider's order so their ops assign the intended
// downstream courier. Uses the configured template ({name} substituted), else a default.
function renderVirtualCarrierNote(vc: { name: string; noteTemplate?: string | null }): string {
  const template = (vc.noteTemplate || "").trim();
  if (template) return template.replace(/\{name\}/gi, vc.name);
  return `Assign to ${vc.name}`;
}

// Representative major-city { city, postalCode } per country, used to obtain LIVE express
// carrier rates on the Quick Quote page from just origin/destination country + weight. The
// carrier rate APIs zone on postal/city + country, so a representative pair gives a real
// (zone-accurate) carrier quote without collecting a full address — the same idea as the
// public FedEx/DHL quote tools. Countries absent here are simply not live-rated for express.
const QUICK_QUOTE_RATE_LOCATIONS: Record<string, { city: string; postalCode: string }> = {
  SA: { city: "Riyadh", postalCode: "12211" },
  AE: { city: "Dubai", postalCode: "00000" },
  KW: { city: "Kuwait City", postalCode: "13001" },
  QA: { city: "Doha", postalCode: "00000" },
  BH: { city: "Manama", postalCode: "00000" },
  OM: { city: "Muscat", postalCode: "100" },
  EG: { city: "Cairo", postalCode: "11511" },
  JO: { city: "Amman", postalCode: "11118" },
  LB: { city: "Beirut", postalCode: "10001" },
  US: { city: "New York", postalCode: "10001" },
  GB: { city: "London", postalCode: "SW1A 1AA" },
  DE: { city: "Berlin", postalCode: "10115" },
  FR: { city: "Paris", postalCode: "75001" },
  IT: { city: "Rome", postalCode: "00184" },
  ES: { city: "Madrid", postalCode: "28001" },
  NL: { city: "Amsterdam", postalCode: "1011" },
  TR: { city: "Istanbul", postalCode: "34000" },
  IN: { city: "Mumbai", postalCode: "400001" },
  CN: { city: "Shanghai", postalCode: "200000" },
  HK: { city: "Hong Kong", postalCode: "999077" },
  JP: { city: "Tokyo", postalCode: "100-0001" },
  KR: { city: "Seoul", postalCode: "04524" },
  CA: { city: "Toronto", postalCode: "M5H 2N2" },
  AU: { city: "Sydney", postalCode: "2000" },
  SG: { city: "Singapore", postalCode: "018956" },
  PK: { city: "Karachi", postalCode: "74000" },
  BD: { city: "Dhaka", postalCode: "1000" },
  MA: { city: "Casablanca", postalCode: "20000" },
};

// Short-TTL in-memory cache for Quick Quote responses. Live carrier rate calls (FedEx does a
// service-availability lookup then loops service types) are slow, and the debounced UI fires
// many near-identical requests, so caching by normalized inputs + client profile makes repeat
// tweaks instant and shields the carriers from spam. Zone-based estimates are stable for well
// over the TTL, so staleness is a non-issue.
const QUICK_QUOTE_CACHE = new Map<string, { expires: number; payload: unknown }>();
const QUICK_QUOTE_CACHE_TTL_MS = 3 * 60 * 1000;

function getQuickQuoteCache(key: string): unknown | null {
  const hit = QUICK_QUOTE_CACHE.get(key);
  if (hit && hit.expires > Date.now()) return hit.payload;
  if (hit) QUICK_QUOTE_CACHE.delete(key);
  return null;
}

function setQuickQuoteCache(key: string, payload: unknown): void {
  QUICK_QUOTE_CACHE.set(key, { expires: Date.now() + QUICK_QUOTE_CACHE_TTL_MS, payload });
  // Bound memory: drop the oldest entries if the map grows large.
  if (QUICK_QUOTE_CACHE.size > 500) {
    const oldest = QUICK_QUOTE_CACHE.keys().next().value;
    if (oldest) QUICK_QUOTE_CACHE.delete(oldest);
  }
}

// Minimal address for a rate quote: carriers zone on city/postal/country; name/phone/street
// are placeholders (rate APIs ignore them — they matter only at booking). `displayCity`
// (if the client typed one) is shown back but the representative postal drives the zone.
function buildQuickQuoteRateAddress(countryCode: string): ShippingAddress | null {
  const loc = QUICK_QUOTE_RATE_LOCATIONS[countryCode];
  if (!loc) return null;
  return {
    name: "Quick Quote",
    streetLine1: "NA",
    city: loc.city,
    postalCode: loc.postalCode,
    countryCode,
    phone: "0000000000",
  };
}

function getIntegrationAppKeyForCarrier(carrierCode?: string | null): string {
  const normalized = resolveCarrierCode(carrierCode).toLowerCase();
  if (normalized === "fedex") return "fedex";
  if (normalized === "dhl") return "dhl";
  if (normalized === "aramex") return "aramex";
  return normalized;
}

function getAdapterForShipment(shipment: Shipment): CarrierAdapter {
  // Virtual-carrier shipments carry the client-facing code on carrierCode but must book
  // through the real aggregator provider recorded on providerCarrierCode (FIZZPA / SHIPOX).
  if (shipment.providerCarrierCode) {
    return getCarrierAdapter(resolveCarrierCode(shipment.providerCarrierCode));
  }
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

  return buildGenericCarrierShipmentRequestFromShipment(shipment);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Ask the carrier whether it actually carries these postal codes, BEFORE the client pays.
 *
 * Rate quoting is lenient — FedEx happily quoted Shenzhen "518000" (a city-level prefix that is
 * not a real delivery code) and only rejected it at booking with
 * "SHIPMENTSERVICES.ZIPCODE.NOTAVAILABLE: Postal Code does not exist". The client had already
 * been charged, so the shipment sat in carrier_error with no waybill. Our own address validation
 * only checks that fields are non-empty, which cannot catch this.
 *
 * Fails the checkout with a clear message when the carrier explicitly says a code is unknown.
 * Any other outcome — validation unsupported for the lane, network error, carrier outage — is
 * logged and allowed through: this must never be the reason a valid shipment cannot be bought.
 */
async function assertPostalCodesAreServiceable(params: {
  carrierCode: string;
  shipper: { countryCode: string; postalCode?: string | null; stateOrProvince?: string | null };
  recipient: { countryCode: string; postalCode?: string | null; stateOrProvince?: string | null };
  clientAccountId?: string;
}): Promise<void> {
  const adapter = getCarrierAdapter(params.carrierCode);
  if (!adapter?.validatePostalCode) return;

  const sides = [
    { label: "Sender", ...params.shipper },
    { label: "Recipient", ...params.recipient },
  ];

  for (const side of sides) {
    const countryCode = (side.countryCode || "").trim().toUpperCase();
    const postalCode = (side.postalCode || "").trim();
    if (!countryCode || !postalCode || POSTAL_CODE_EXEMPT_COUNTRIES.has(countryCode)) continue;

    try {
      const result = await withShipmentIntegrationAccount(
        getIntegrationAppKeyForCarrier(params.carrierCode),
        { shipperCountryCode: params.shipper.countryCode, recipientCountryCode: params.recipient.countryCode, clientAccountId: params.clientAccountId },
        () => adapter.validatePostalCode!({
          postalCode,
          countryCode,
          stateOrProvince: side.stateOrProvince || undefined,
        }),
      );
      // Only a verdict from the carrier's own database may block a purchase; the local format
      // heuristics reject perfectly good non-US postal codes.
      if (result && result.valid === false && result.source === "carrier") {
        throw new PostalCodeNotServiceableError(
          `${side.label} postal code ${postalCode} is not recognised by ${params.carrierCode} for ${countryCode}. ` +
          "Enter the specific delivery-area postal code for this address (a city-level code such as 518000 is not accepted).",
        );
      }
    } catch (error) {
      if (error instanceof PostalCodeNotServiceableError) throw error;
      logWarn(
        `Postal code validation unavailable for ${side.label.toLowerCase()} ${countryCode} ${postalCode} (${params.carrierCode}); allowing checkout: ${(error as Error).message}`,
      );
    }
  }
}

class PostalCodeNotServiceableError extends Error {}

const clientFinancialReconcileInFlight = new Map<string, Promise<void>>();

async function ensureShipmentBillingArtifacts(params: {
  shipment: Shipment;
  transactionId?: string | null;
  paymentMethod: string;
  invoiceStatus?: "paid" | "pending";
  // Tap's own SAR settlement figure for a non-SAR charge. When present it is the amount
  // actually received in SAR, so the invoice + payment (and Zoho) record it verbatim
  // instead of our computed SAR total. Null/absent → use the computed SAR.
  settledSarAmount?: number | null;
}) {
  const invoiceAmount = formatMoney(
    params.settledSarAmount && params.settledSarAmount > 0
      ? params.settledSarAmount
      : parseMoneyValue(params.shipment.clientTotalAmountSar ?? params.shipment.finalPrice),
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
      tapIntegrationAccountId: params.shipment.tapIntegrationAccountId,
    });
  }

  if (shouldMarkPaid && (!invoice.paidAt || invoice.status !== "paid")) {
    invoice =
      (await storage.updateInvoice(invoice.id, {
        status: "paid",
        paidAt: new Date(),
      })) || invoice;
  }

  invoice = await syncInvoiceToZoho(invoice, params.shipment);

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
      integrationAccountId: params.shipment.tapIntegrationAccountId,
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
    integrationAccountId: params.shipment.tapIntegrationAccountId,
  });

  return invoice;
}

// Pickup preference submitted from the create/quote flow.
const pickupInputSchema = z.object({
  requested: z.boolean().default(false),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pickup date must be YYYY-MM-DD").optional(),
  readyTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
  location: z.string().max(120).optional(),
  instructions: z.string().max(500).optional(),
});

/** Map a pickup preference to shipment insert columns. */
function pickupInsertFields(pickup?: z.infer<typeof pickupInputSchema>) {
  if (!pickup?.requested || !pickup.date) {
    return { pickupRequested: false, pickupStatus: "not_requested" };
  }
  return {
    pickupRequested: true,
    pickupStatus: "requested",
    pickupDate: pickup.date,
    pickupReadyTime: pickup.readyTime || "09:00",
    pickupCloseTime: pickup.closeTime || "17:00",
    pickupLocation: pickup.location || null,
    pickupInstructions: pickup.instructions || null,
  };
}

// Express shipments are ALWAYS booked for a carrier pickup by default. Cutoff logic (KSA local):
// a shipment created before the cutoff hour on a business day is picked up the same day;
// otherwise the pickup rolls to the next business day. Keep PICKUP_CUTOFF_HOUR in sync with the
// client-side default shown in the create-shipment flow.
const PICKUP_TIMEZONE = "Asia/Riyadh";
const PICKUP_CUTOFF_HOUR = Number(process.env.PICKUP_CUTOFF_HOUR || "15"); // 24h, KSA local
const PICKUP_DEFAULT_READY_TIME = "09:00";
const PICKUP_DEFAULT_CLOSE_TIME = "17:00";

/** KSA weekend = Friday (5) & Saturday (6). `dow` is a UTC day-of-week for a date-only value. */
function isKsaWeekend(dow: number): boolean {
  return dow === 5 || dow === 6;
}

/** Wall-clock date/time parts in the KSA timezone for a given instant. */
function ksaDateParts(now: Date): { y: number; m: number; d: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PICKUP_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);
  return {
    y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
  };
}

/**
 * Default carrier pickup date (YYYY-MM-DD) in KSA: same business day if created before the
 * cutoff hour, otherwise the next business day (weekends skipped).
 */
function computeDefaultPickupDate(now: Date = new Date()): { date: string; sameDay: boolean } {
  const { y, m, d, hour } = ksaDateParts(now);
  const cur = new Date(Date.UTC(y, m - 1, d));
  const beforeCutoff = hour < PICKUP_CUTOFF_HOUR;
  if (beforeCutoff && !isKsaWeekend(cur.getUTCDay())) {
    return { date: cur.toISOString().slice(0, 10), sameDay: true };
  }
  do { cur.setUTCDate(cur.getUTCDate() + 1); } while (isKsaWeekend(cur.getUTCDay()));
  return { date: cur.toISOString().slice(0, 10), sameDay: false };
}

/**
 * Earliest bookable ready time for a pickup, in the SHIPPER's local timezone.
 * Carriers reject a pickup whose ready time has already passed at origin (DHL: 400 "5019: The
 * shipment date cannot be in the past") — and the origin is often not KSA, so checking only the
 * date in KSA time is not enough: a 09:00 Turkey pickup is already 4h stale when a shipment is
 * paid at 13:00 Riyadh. Returns the window to actually book, rolling to the next business day
 * when today's window can no longer be served.
 */
const PICKUP_MIN_LEAD_MINUTES = 60; // couriers need lead time; don't ask for "right now"
const PICKUP_MIN_WINDOW_MINUTES = 60; // ready→close must stay at least this wide

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function normalizePickupWindow(
  date: string,
  readyTime: string,
  closeTime: string,
  senderCountry: string | null | undefined,
  now: Date = new Date(),
): { date: string; readyTime: string; closeTime: string } {
  const local = countryLocalNow(senderCountry, now);
  const closeMinutes = toMinutes(closeTime);
  if (date > local.date) return { date, readyTime, closeTime };
  // A past date, or today with a ready time that has already gone by, must be bumped.
  const earliest = local.minutes + PICKUP_MIN_LEAD_MINUTES;
  if (date === local.date && toMinutes(readyTime) >= earliest) {
    return { date, readyTime, closeTime };
  }
  if (date === local.date && earliest + PICKUP_MIN_WINDOW_MINUTES <= closeMinutes) {
    return { date, readyTime: fromMinutes(earliest), closeTime };
  }
  // Today is spent (or the date is stale) — roll to the next business day, default window.
  return {
    date: nextBusinessDayAfter(local.date),
    readyTime: PICKUP_DEFAULT_READY_TIME,
    closeTime: PICKUP_DEFAULT_CLOSE_TIME,
  };
}

/** The first business day strictly after a YYYY-MM-DD date (KSA weekend rules). */
function nextBusinessDayAfter(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  do { cur.setUTCDate(cur.getUTCDate() + 1); } while (isKsaWeekend(cur.getUTCDay()));
  return cur.toISOString().slice(0, 10);
}

/** True when a YYYY-MM-DD pickup date is today-or-later in KSA and lands on a business day. */
function isBookablePickupDate(dateStr: string | null | undefined, now: Date = new Date()): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const { y, m, d } = ksaDateParts(now);
  const today = Date.UTC(y, m - 1, d);
  const [py, pm, pd] = dateStr.split("-").map(Number);
  const target = Date.UTC(py, pm - 1, pd);
  if (target < today) return false;
  return !isKsaWeekend(new Date(target).getUTCDay());
}

/**
 * Pickup columns for an EXPRESS shipment. Pickup is always requested; the client may supply a
 * custom date/window, otherwise the cutoff-based default is used.
 */
function expressPickupInsertFields(pickup?: z.infer<typeof pickupInputSchema>) {
  const custom = pickup?.date && isBookablePickupDate(pickup.date) ? pickup.date : null;
  const date = custom || computeDefaultPickupDate().date;
  return {
    pickupRequested: true,
    pickupStatus: "requested",
    pickupDate: date,
    pickupReadyTime: pickup?.readyTime || PICKUP_DEFAULT_READY_TIME,
    pickupCloseTime: pickup?.closeTime || PICKUP_DEFAULT_CLOSE_TIME,
    pickupLocation: pickup?.location || null,
    pickupInstructions: pickup?.instructions || null,
  };
}

/**
 * Parse a shipment's stored packages into carrier PackageDetails.
 */
function shipmentPackages(shipment: Shipment): PackageDetails[] {
  const unit = (shipment.weightUnit === "LB" ? "LB" : "KG") as "LB" | "KG";
  const dimUnit = (shipment.dimensionUnit === "IN" ? "IN" : "CM") as "IN" | "CM";
  let raw: any[] = [];
  try { raw = shipment.packagesData ? JSON.parse(shipment.packagesData) : []; } catch { raw = []; }
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ weight: Number(shipment.weight) || 1, weightUnit: unit, packageType: "YOUR_PACKAGING" }];
  }
  return raw.map((p) => ({
    weight: Number(p.weight) || 1,
    weightUnit: unit,
    ...(Number(p.length) > 0 && Number(p.width) > 0 && Number(p.height) > 0
      ? { dimensions: { length: Number(p.length), width: Number(p.width), height: Number(p.height), unit: dimUnit } }
      : {}),
    packageType: "YOUR_PACKAGING",
  }));
}

/**
 * If the shipment requested a carrier pickup, book it right after the shipment is booked with
 * the carrier. Non-fatal: a pickup failure never fails the shipment — it records
 * pickupStatus="failed" + the error so ops can retry. Only carriers whose adapter implements
 * requestPickup (DHL / FedEx / Aramex) attempt it.
 */
async function bookCarrierPickupIfRequested(
  shipment: Shipment,
  adapter: CarrierAdapter,
  appKey: string,
  actorUserId?: string,
): Promise<void> {
  if (!shipment.pickupRequested || shipment.pickupConfirmationNumber) return;
  if (!adapter.supportsPickup || !adapter.requestPickup) return;
  // Normalize the pickup date at booking time: a missing / past / weekend date (e.g. a quote
  // created days ago, or paid after the cutoff) is bumped to the current cutoff-based default so
  // the carrier never rejects a stale date. The stored window is updated to match what is booked.
  let effectivePickupDate: string = shipment.pickupDate ?? "";
  if (!isBookablePickupDate(effectivePickupDate)) {
    effectivePickupDate = computeDefaultPickupDate().date;
  }
  // Then normalize the window against the SHIPPER's local clock — a date that is "today" in KSA
  // can already be past at an origin further east/west, which carriers reject outright.
  const window = normalizePickupWindow(
    effectivePickupDate,
    shipment.pickupReadyTime || PICKUP_DEFAULT_READY_TIME,
    shipment.pickupCloseTime || PICKUP_DEFAULT_CLOSE_TIME,
    shipment.senderCountry,
  );
  effectivePickupDate = window.date;
  if (
    window.date !== shipment.pickupDate ||
    window.readyTime !== shipment.pickupReadyTime ||
    window.closeTime !== shipment.pickupCloseTime
  ) {
    await storage.updateShipment(shipment.id, {
      pickupDate: window.date,
      pickupReadyTime: window.readyTime,
      pickupCloseTime: window.closeTime,
    });
    shipment = {
      ...shipment,
      pickupDate: window.date,
      pickupReadyTime: window.readyTime,
      pickupCloseTime: window.closeTime,
    };
  }
  let declaredValue = 0;
  try {
    const items: any[] = shipment.itemsData ? JSON.parse(shipment.itemsData) : [];
    declaredValue = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
    declaredValue = Math.round(declaredValue * 100) / 100; // avoid float artifacts carriers reject
  } catch { /* ignore */ }
  const pickupRequest: PickupRequest = {
    shipper: {
      name: shipment.senderName,
      streetLine1: shipment.senderAddress,
      streetLine2: shipment.senderAddressLine2 || undefined,
      city: shipment.senderCity,
      stateOrProvince: shipment.senderStateOrProvince || undefined,
      postalCode: shipment.senderPostalCode || "",
      countryCode: shipment.senderCountry,
      phone: shipment.senderPhone,
      email: CARRIER_CONTACT_EMAIL,
    },
    packages: shipmentPackages(shipment),
    pickupDate: effectivePickupDate,
    readyTime: shipment.pickupReadyTime || "09:00",
    closeTime: shipment.pickupCloseTime || "17:00",
    location: shipment.pickupLocation || undefined,
    instructions: shipment.pickupInstructions || undefined,
    isInternational: (shipment.senderCountry || "").toUpperCase() !== (shipment.recipientCountry || "").toUpperCase(),
    declaredValue: declaredValue > 0 ? declaredValue : undefined,
    currency: shipment.currency || "SAR",
    serviceType: shipment.serviceType || undefined,
    trackingNumber: shipment.carrierTrackingNumber || undefined,
  };
  try {
    const result = await withBoundIntegrationAccount(
      appKey,
      shipment.carrierIntegrationAccountId,
      getShipmentIntegrationRoutingOptions(shipment),
      () => adapter.requestPickup!(pickupRequest),
    );
    await storage.updateShipment(shipment.id, {
      pickupConfirmationNumber: result.confirmationNumber,
      pickupStatus: "confirmed",
      pickupError: null,
    });
    logInfo(`Pickup booked for shipment ${shipment.trackingNumber}: ${result.confirmationNumber} (${adapter.carrierCode})`);
    await logAudit(
      actorUserId,
      "pickup_booked",
      "shipment",
      shipment.id,
      `Pickup booked with ${adapter.carrierCode}: ${result.confirmationNumber} for ${effectivePickupDate} (${shipment.pickupReadyTime || "09:00"}–${shipment.pickupCloseTime || "17:00"})`,
    );
  } catch (error) {
    logError(`Pickup booking failed for shipment ${shipment.trackingNumber} (${adapter.carrierCode})`, error);
    const errorMessage = error instanceof Error ? error.message : "Pickup booking failed";
    await storage.updateShipment(shipment.id, {
      pickupStatus: "failed",
      pickupError: errorMessage,
    });
    await logAudit(
      actorUserId,
      "pickup_failed",
      "shipment",
      shipment.id,
      `Pickup booking failed with ${adapter.carrierCode} for ${effectivePickupDate}: ${errorMessage}`,
    );
  }
}

// Best-effort release of a booked carrier courier pickup when a shipment is cancelled. Express
// shipments auto-book a pickup, so a cancelled shipment MUST also cancel the pickup or a courier
// still shows up. Never throws — a failed pickup cancel must not block the shipment cancellation.
async function cancelCarrierPickupIfBooked(
  shipment: Shipment,
  adapter: CarrierAdapter,
  appKey: string,
): Promise<void> {
  if (!shipment.pickupConfirmationNumber || !adapter.cancelPickup) return;
  try {
    const ok = await withBoundIntegrationAccount(
      appKey,
      shipment.carrierIntegrationAccountId,
      getShipmentIntegrationRoutingOptions(shipment),
      () =>
        adapter.cancelPickup!(shipment.pickupConfirmationNumber!, {
          shipper: {
            name: shipment.senderName,
            streetLine1: shipment.senderAddress,
            city: shipment.senderCity,
            postalCode: shipment.senderPostalCode || "",
            countryCode: shipment.senderCountry,
            phone: shipment.senderPhone,
          },
          pickupDate: shipment.pickupDate || undefined,
          instructions: "Shipment cancelled",
        }),
    );
    await storage.updateShipment(shipment.id, { pickupStatus: ok ? "cancelled" : shipment.pickupStatus });
    logInfo(
      `Pickup cancel ${ok ? "succeeded" : "not confirmed"} for ${shipment.trackingNumber} (${adapter.carrierCode})`,
      { confirmationNumber: shipment.pickupConfirmationNumber },
    );
  } catch (error) {
    logError(`Pickup cancel failed for shipment ${shipment.trackingNumber} (${adapter.carrierCode})`, error);
  }
}

async function finalizePaidShipmentAfterPayment(params: {
  shipment: Shipment;
  transactionId?: string | null;
  paymentMethod: string;
  userId?: string;
  ipAddress?: string;
  // Tap's SAR settlement figure for a non-SAR charge (see ensureShipmentBillingArtifacts).
  settledSarAmount?: number | null;
}) {
  const { shipment, transactionId, paymentMethod, userId, ipAddress, settledSarAmount } = params;

  if (shipment.status === "cancelled") {
    throw new Error("Cancelled shipments cannot be finalized");
  }

  if (shipment.fulfillmentType === "ddp_manual") {
    const updatedShipment =
      (await storage.updateShipment(shipment.id, {
        status: "awaiting_review",
        carrierStatus: "awaiting_review",
        paymentStatus: "paid",
      })) || shipment;

    await ensureShipmentBillingArtifacts({
      shipment: updatedShipment,
      transactionId,
      paymentMethod,
      invoiceStatus: "paid",
      settledSarAmount,
    });

    await logAudit(
      userId,
      "confirm_ddp_shipment",
      "shipment",
      updatedShipment.id,
      `Confirmed manual DDP shipment ${updatedShipment.trackingNumber} for review`,
      ipAddress,
    );

    await ensureOperationAssignmentForShipment({
      shipment: updatedShipment,
      actorUserId: userId,
      reason: "payment_confirmed",
    });
    if (shipment.status !== updatedShipment.status) {
      await recordShipmentStatusChange({
        shipment: updatedShipment,
        previousStatus: shipment.status,
        nextStatus: updatedShipment.status,
        actorUserId: userId,
        source: "payment_finalization",
      });
    }

    return updatedShipment;
  }

  // Local (domestic KSA): if the carrier is configured (credentials entered in the Apps
  // tab), book it now to get an AWB + label; otherwise leave it for operations to book
  // manually. A live booking failure is non-fatal — the shipment still lands in ops with
  // the carrier error recorded.
  if (shipment.fulfillmentType === "local") {
    const localUpdates: Record<string, unknown> = {
      status: "created",
      carrierStatus: "processing",
      paymentStatus: "paid",
    };
    const localAdapter = getAdapterForShipment(shipment);
    if (localAdapter.isConfigured()) {
      try {
        const prepared = await buildCarrierShipmentRequestFromShipment(shipment, localAdapter);
        const carrierResponse = await withBoundIntegrationAccount(
          getIntegrationAppKeyForCarrier(localAdapter.carrierCode),
          shipment.carrierIntegrationAccountId,
          getShipmentIntegrationRoutingOptions(shipment),
          () => localAdapter.createShipment(prepared.carrierRequest),
        );
        localUpdates.carrierStatus = "created";
        localUpdates.carrierTrackingNumber = carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber;
        localUpdates.carrierShipmentId = carrierResponse.trackingNumber;
        if (carrierResponse.labelUrl) localUpdates.labelUrl = carrierResponse.labelUrl;
        localUpdates.carrierErrorCode = null;
        localUpdates.carrierErrorMessage = null;
      } catch (bookingError) {
        logError(`Local carrier booking failed for ${shipment.trackingNumber}`, bookingError);
        localUpdates.carrierErrorCode = bookingError instanceof CarrierError ? bookingError.code : "BOOKING_FAILED";
        localUpdates.carrierErrorMessage =
          bookingError instanceof CarrierError ? bookingError.carrierMessage : (bookingError as Error).message;
        localUpdates.carrierLastAttemptAt = new Date();
      }
    }

    const updatedShipment = (await storage.updateShipment(shipment.id, localUpdates)) || shipment;

    await ensureShipmentBillingArtifacts({
      shipment: updatedShipment,
      transactionId,
      paymentMethod,
      invoiceStatus: "paid",
      settledSarAmount,
    });

    await logAudit(
      userId,
      "confirm_local_shipment",
      "shipment",
      updatedShipment.id,
      `Confirmed local shipment ${updatedShipment.trackingNumber} for operations`,
      ipAddress,
    );

    await ensureOperationAssignmentForShipment({
      shipment: updatedShipment,
      actorUserId: userId,
      reason: "payment_confirmed",
    });

    if (shipment.status !== updatedShipment.status) {
      await recordShipmentStatusChange({
        shipment: updatedShipment,
        previousStatus: shipment.status,
        nextStatus: updatedShipment.status,
        actorUserId: userId,
        source: "payment_finalization",
      });
    }

    return updatedShipment;
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
      settledSarAmount,
    });

    await ensureOperationAssignmentForShipment({
      shipment: updatedShipment,
      actorUserId: userId,
      reason: "payment_confirmed",
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

    const carrierResponse = await withBoundIntegrationAccount(
      getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
      latestShipment.carrierIntegrationAccountId,
      getShipmentIntegrationRoutingOptions(latestShipment),
      () => carrierAdapter.createShipment(preparedShipment.carrierRequest),
    );
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

    // Book a carrier courier pickup if one was requested during the create/quote flow. Runs
    // after the shipment is booked (so it links to the real waybill) and never fails the booking.
    await bookCarrierPickupIfRequested(
      updatedShipment,
      carrierAdapter,
      getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
    );

    await ensureShipmentBillingArtifacts({
      shipment: updatedShipment,
      transactionId,
      paymentMethod,
      invoiceStatus: "paid",
      settledSarAmount,
    });

    await logAudit(
      userId,
      "confirm_shipment",
      "shipment",
      updatedShipment.id,
      `Confirmed shipment ${updatedShipment.trackingNumber} with carrier tracking ${carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber}`,
      ipAddress,
    );

    await ensureOperationAssignmentForShipment({
      shipment: updatedShipment,
      actorUserId: userId,
      reason: "payment_confirmed",
    });
    await recordShipmentStatusChange({
      shipment: updatedShipment,
      previousStatus: shipment.status,
      nextStatus: updatedShipment.status,
      actorUserId: userId,
      source: "carrier_creation",
    });

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

async function getStoredTapIntegrationAccountId(chargeId: string, charge?: TapCharge) {
  if (charge?.metadata?.tapIntegrationAccountId) {
    return charge.metadata.tapIntegrationAccountId;
  }

  const shipment = await storage.getShipmentByPaymentId(chargeId);
  if (shipment?.tapIntegrationAccountId) {
    return shipment.tapIntegrationAccountId;
  }

  const payment = await storage.getPaymentByTransactionId(chargeId);
  if (!payment) return null;
  if (payment.integrationAccountId) return payment.integrationAccountId;

  const invoice = await storage.getInvoice(payment.invoiceId);
  return invoice?.tapIntegrationAccountId || null;
}

async function retrieveTapChargeFromBoundAccount(chargeId: string) {
  const boundAccountId = await getStoredTapIntegrationAccountId(chargeId);
  if (boundAccountId) {
    return withBoundIntegrationAccount("tap", boundAccountId, {}, () => tapService.retrieveCharge(chargeId));
  }

  for (const account of await getActiveIntegrationAccounts("tap")) {
    try {
      const charge = await withIntegrationAccount(account, () => tapService.retrieveCharge(chargeId));
      if (charge) return charge;
    } catch {
      // Tap callbacks do not include local context for legacy charges, so try the next configured merchant.
    }
  }

  return tapService.retrieveCharge(chargeId);
}

async function validateTapWebhookForBoundAccount(charge: TapCharge, signature?: string) {
  const boundAccountId = await getStoredTapIntegrationAccountId(charge.id, charge);
  const validateCurrentAccount = () =>
    Promise.resolve(
      tapService.isConfigured()
        ? tapService.validateWebhookSignature(charge, signature)
        : process.env.NODE_ENV !== "production",
    );

  if (boundAccountId) {
    return withBoundIntegrationAccount("tap", boundAccountId, {}, validateCurrentAccount);
  }

  for (const account of await getActiveIntegrationAccounts("tap")) {
    if (await withIntegrationAccount(account, validateCurrentAccount)) {
      return true;
    }
  }

  return validateCurrentAccount();
}

async function validateFedExWebhookForBoundAccount(
  payload: string,
  signature: string | undefined,
  shipment?: Shipment,
) {
  const validateCurrentAccount = () => {
    const webhookSecret = getIntegrationEnv("FEDEX_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return process.env.NODE_ENV !== "production";
    }
    if (!signature) return false;
    const expectedSignature = createHmac("sha256", webhookSecret).update(payload).digest("hex");
    return signature.length === expectedSignature.length &&
      timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSignature, "utf8"));
  };

  if (shipment?.carrierIntegrationAccountId) {
    return withBoundIntegrationAccount(
      "fedex",
      shipment.carrierIntegrationAccountId,
      getShipmentIntegrationRoutingOptions(shipment),
      async () => validateCurrentAccount(),
    );
  }

  for (const account of await getActiveIntegrationAccounts("fedex")) {
    if (await withIntegrationAccount(account, async () => validateCurrentAccount())) {
      return true;
    }
  }

  return validateCurrentAccount();
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
  const tapIntegrationAccountId =
    charge.metadata?.tapIntegrationAccountId ||
    shipment.tapIntegrationAccountId ||
    getCurrentIntegrationAccountId() ||
    "env:tap";
  if (shipment.tapIntegrationAccountId !== tapIntegrationAccountId) {
    updates.tapIntegrationAccountId = tapIntegrationAccountId;
  }

  if (tapService.isSuccessfulStatus(charge.status) && shipment.paymentStatus !== "paid") {
    updates.paymentStatus = "paid";
  } else if (tapService.isFailureStatus(charge.status) && shipment.paymentStatus !== "failed") {
    updates.paymentStatus = "failed";
    const recovery = await storage.getAbandonedShipmentRecoveryByShipmentId(shipment.id);
    if (recovery?.status === AbandonedShipmentRecoveryStatus.DISCOUNT_SENT) {
      logInfo("Abandoned recovery payment failed", {
        source: "abandoned_recovery",
        event: "payment_failed",
        shipmentId: shipment.id,
        recoveryId: recovery.id,
        clientAccountId: shipment.clientAccountId,
        trackingNumber: shipment.trackingNumber,
        chargeId: charge.id,
        tapStatus: charge.status,
        tapMessage: charge.response?.message,
      });
    }
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
    const activeOffer = await getActiveAbandonedRecoveryOffer(latestShipment, { allowPaid: true });
    if (activeOffer) {
      latestShipment = await applyAbandonedRecoveryOfferToShipment(latestShipment, activeOffer, {
        transactionId: charge.id,
        ipAddress,
      });
    }

    // For a non-SAR charge, record Tap's own SAR settlement figure on the invoice/payment
    // (accounting stays SAR). Log the raw charge once so the exact settlement field can be
    // confirmed and TAP_SETTLED_SAR_FIELD tuned if the default candidates miss it.
    let settledSarAmount: number | null = null;
    if ((charge.currency || "SAR").toUpperCase() !== "SAR") {
      settledSarAmount = getTapSettledSarAmount(charge);
      logInfo("Non-SAR Tap charge settled", {
        source: "tap",
        event: "multicurrency_settlement",
        shipmentId: latestShipment.id,
        trackingNumber: latestShipment.trackingNumber,
        chargeId: charge.id,
        chargeAmount: charge.amount,
        chargeCurrency: charge.currency,
        settledSarAmount,
        settledSarResolved: settledSarAmount != null,
        rawCharge: JSON.stringify(charge),
      });
    }

    await finalizePaidShipmentAfterPayment({
      shipment: latestShipment,
      transactionId: charge.id,
      paymentMethod: "tap",
      userId: undefined,
      ipAddress,
      settledSarAmount,
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
  const tapIntegrationAccountId =
    charge.metadata?.tapIntegrationAccountId ||
    invoice.tapIntegrationAccountId ||
    getCurrentIntegrationAccountId() ||
    "env:tap";
  const matchingPayment =
    payments.find((payment) => payment.invoiceId === invoice.id && payment.transactionId === charge.id) ||
    payments.find((payment) => payment.invoiceId === invoice.id && payment.status === "pending");

  if (tapService.isSuccessfulStatus(charge.status)) {
    if (invoice.status !== "paid") {
      await storage.updateInvoice(invoice.id, { status: "paid", paidAt: new Date(), tapIntegrationAccountId });
    }

    if (matchingPayment) {
      await storage.updatePayment(matchingPayment.id, {
        status: "completed",
        paymentMethod: "tap",
        transactionId: charge.id,
        integrationAccountId: tapIntegrationAccountId,
      });
    } else {
      await storage.createPayment({
        invoiceId: invoice.id,
        clientAccountId: invoice.clientAccountId,
        amount: formatMoney(Number(charge.amount || invoice.amount)),
        paymentMethod: "tap",
        transactionId: charge.id,
        integrationAccountId: tapIntegrationAccountId,
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
      integrationAccountId: tapIntegrationAccountId,
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
  const tapIntegrationAccountId =
    charge.metadata?.tapIntegrationAccountId ||
    getCurrentIntegrationAccountId() ||
    "env:tap";

  if (!tapCustomerId && !tapCardId) {
    return;
  }

  const clientAccount = await storage.getClientAccount(clientAccountId);
  if (!clientAccount) {
    return;
  }

  if (
    tapCustomerId &&
    (clientAccount.tapCustomerId !== tapCustomerId ||
      clientAccount.tapIntegrationAccountId !== tapIntegrationAccountId)
  ) {
    await storage.updateClientAccount(clientAccountId, {
      tapCustomerId,
      tapIntegrationAccountId,
    });
  }

  if (!tapCustomerId || !tapCardId) {
    return;
  }

  const existingCard = await storage.getTapSavedCardByTapCardId(clientAccountId, tapCardId);
  const baseCardFields = {
    clientAccountId,
    tapIntegrationAccountId,
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

  const activeCards = await storage.getTapSavedCardsByClientAccount(clientAccountId, tapIntegrationAccountId);
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

type ActiveAbandonedRecoveryOffer = {
  recovery: AbandonedShipmentRecovery;
  originalAmount: number;
  discountAmount: number;
  payableAmount: number;
};

async function getActiveAbandonedRecoveryOffer(
  shipment: Shipment,
  options: { allowPaid?: boolean } = {},
): Promise<ActiveAbandonedRecoveryOffer | null> {
  const recovery = await storage.getAbandonedShipmentRecoveryByShipmentId(shipment.id);
  if (!recovery || recovery.status !== AbandonedShipmentRecoveryStatus.DISCOUNT_SENT) {
    return null;
  }

  const paymentStatus = String(shipment.paymentStatus || "pending").toLowerCase();
  const paymentMethod = String(shipment.paymentMethod || "PAY_NOW").toUpperCase();
  const shipmentStatus = String(shipment.status || "").toLowerCase();

  if (!options.allowPaid && paymentStatus === "paid") return null;
  if (paymentMethod === "CREDIT") return null;
  if (shipmentStatus === "cancelled" || shipmentStatus === "credit_pending") return null;
  if (recovery.discountExpiresAt && new Date(recovery.discountExpiresAt).getTime() <= Date.now()) {
    await storage.updateAbandonedShipmentRecovery(recovery.id, {
      status: AbandonedShipmentRecoveryStatus.EXPIRED,
      lastAction: "discount_expired",
    });
    logInfo("Abandoned recovery offer expired on access", {
      source: "abandoned_recovery",
      event: "offer_expired",
      shipmentId: shipment.id,
      recoveryId: recovery.id,
      clientAccountId: shipment.clientAccountId,
      trackingNumber: shipment.trackingNumber,
    });
    return null;
  }

  const originalAmount = parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice);
  const recoveredOriginalAmount = Math.max(originalAmount, parseMoneyValue(shipment.finalPrice));
  const payableAmount = Math.max(0, parseMoneyValue(recovery.discountFinalPrice));
  const discountAmount = Math.max(0, parseMoneyValue(recovery.discountAmount));

  if (!Number.isFinite(payableAmount) || payableAmount <= 0 || payableAmount >= recoveredOriginalAmount) {
    return null;
  }

  return {
    recovery,
    originalAmount: recoveredOriginalAmount,
    discountAmount: Math.min(discountAmount || recoveredOriginalAmount - payableAmount, recoveredOriginalAmount),
    payableAmount,
  };
}

function serializeAbandonedRecoveryOffer(offer: ActiveAbandonedRecoveryOffer | null) {
  if (!offer) return null;

  return {
    recoveryId: offer.recovery.id,
    discountType: offer.recovery.discountType,
    discountValue: parseMoneyValue(offer.recovery.discountValue),
    discountAmount: Number(offer.discountAmount.toFixed(2)),
    originalAmount: Number(offer.originalAmount.toFixed(2)),
    finalAmount: Number(offer.payableAmount.toFixed(2)),
    expiresAt: offer.recovery.discountExpiresAt,
    channel: offer.recovery.discountChannel,
  };
}

async function applyAbandonedRecoveryOfferToShipment(
  shipment: Shipment,
  offer: ActiveAbandonedRecoveryOffer,
  params: { transactionId?: string | null; ipAddress?: string },
): Promise<Shipment> {
  const payableAmount = formatMoney(offer.payableAmount);
  const updatedShipment =
    (await storage.updateShipment(shipment.id, {
      finalPrice: payableAmount,
      clientTotalAmountSar: payableAmount,
    })) || shipment;

  await storage.updateAbandonedShipmentRecovery(offer.recovery.id, {
    status: AbandonedShipmentRecoveryStatus.RECOVERED,
    lastAction: "discount_recovered",
    recoveredAt: new Date(),
  });

  logInfo("Abandoned recovery offer paid", {
    source: "abandoned_recovery",
    event: "offer_paid",
    shipmentId: shipment.id,
    recoveryId: offer.recovery.id,
    clientAccountId: shipment.clientAccountId,
    trackingNumber: shipment.trackingNumber,
    originalAmount: offer.originalAmount,
    discountAmount: offer.discountAmount,
    finalAmount: offer.payableAmount,
    transactionId: params.transactionId,
  });

  await logAudit(
    undefined,
    "abandoned_discount_recovered",
    "shipment",
    shipment.id,
    `Applied abandoned shipment recovery discount to ${shipment.trackingNumber}${params.transactionId ? ` via ${params.transactionId}` : ""}`,
    params.ipAddress,
  );

  return updatedShipment;
}

function formatWeightValue(value: number | string | null | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "0.000";
}

function buildChargeableWeightSummaryFromShipmentInput(
  shipmentData: {
    packages: Array<{ weight: number; length?: number; width?: number; height?: number }>;
    weightUnit?: string;
    dimensionUnit?: string;
  },
  carrierCode: string,
): ChargeableWeightSummary {
  return calculateChargeableWeight(
    shipmentData.packages,
    shipmentData.weightUnit || "KG",
    shipmentData.dimensionUnit || "CM",
    carrierCode,
  );
}

function parseStoredChargeableWeightSummary(value: unknown): ChargeableWeightSummary | null {
  if (!value) return null;
  if (typeof value === "object") return value as ChargeableWeightSummary;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as ChargeableWeightSummary;
  } catch {
    return null;
  }
}

function attachChargeableWeightToPackages(
  packages: Array<Record<string, unknown>>,
  summary: ChargeableWeightSummary,
) {
  return packages.map((pkg, index) => {
    const breakdown = summary.packages[index];
    if (!breakdown) return pkg;

    return {
      ...pkg,
      actualWeight: breakdown.actualWeight,
      dimensionalWeight: breakdown.dimensionalWeight,
      chargeableWeight: breakdown.chargeableWeight,
      chargeableWeightUnit: breakdown.weightUnit,
      usesDimensionalWeight: breakdown.usesDimensionalWeight,
    };
  });
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function roundQuantity(value: number, precision = 4): number {
  return Number(value.toFixed(precision));
}

async function calculateDdpExtraWeightCharge(params: {
  shipment: Shipment;
  targetExtraWeightQuantity: number;
}) {
  const targetExtraWeightQuantity = Math.max(0, roundQuantity(params.targetExtraWeightQuantity));
  const extraCostAmountSar = parseMoneyValue(params.shipment.extraFeesCostAmountSar);
  const billingUnit = params.shipment.ddpBillingUnit === "CBM" ? "CBM" : "KG";

  if (targetExtraWeightQuantity <= 0) {
    return {
      billingUnit,
      targetExtraWeightQuantity: 0,
      targetExtraWeightAmountSar: 0,
      targetTotalExtraFeesAmountSar: roundMoney(extraCostAmountSar),
      effectiveRateSarPerUnit: 0,
      usedLaneFormula: false,
    };
  }

  const lane = params.shipment.ddpPricingLaneId
    ? await storage.getDdpPricingLane(params.shipment.ddpPricingLaneId)
    : undefined;

  if (!lane || params.shipment.fulfillmentType !== "ddp_manual") {
    const ratePerWeight = getExtraFeesRateSarPerWeight(params.shipment);
    const targetExtraWeightAmountSar = roundMoney(targetExtraWeightQuantity * ratePerWeight);
    return {
      billingUnit,
      targetExtraWeightQuantity,
      targetExtraWeightAmountSar,
      targetTotalExtraFeesAmountSar: roundMoney(targetExtraWeightAmountSar + extraCostAmountSar),
      effectiveRateSarPerUnit: ratePerWeight,
      usedLaneFormula: false,
    };
  }

  const chargeDetails = parseJsonObject(params.shipment.chargeableWeightDetails);
  const currentRawQuantity = billingUnit === "CBM"
    ? Number(
        chargeDetails?.totalCbm ??
          params.shipment.ddpTotalCbm ??
          params.shipment.ddpBillableQuantity ??
          params.shipment.chargeableWeight,
      ) || 0
    : Number(
        chargeDetails?.rawBillableQuantity ??
          params.shipment.ddpBillableQuantity ??
          params.shipment.chargeableWeight ??
          params.shipment.weight,
      ) || 0;

  const updatedRawQuantity = roundQuantity(currentRawQuantity + targetExtraWeightQuantity);
  const transportMethod = params.shipment.ddpTransportMethod === DdpTransportMethod.SEA
    ? DdpTransportMethod.SEA
    : params.shipment.ddpTransportMethod === DdpTransportMethod.DOMESTIC
      ? DdpTransportMethod.DOMESTIC
      : DdpTransportMethod.AIR;
  const basePricing = calculateDdpPrice({
    lane,
    transportMethod,
    packages: billingUnit === "KG" ? [{ weight: updatedRawQuantity }] : [],
    totalCbm: billingUnit === "CBM" ? updatedRawQuantity : parseMoneyValue(params.shipment.ddpTotalCbm),
    markupPercentage: 0,
  });

  const account = await storage.getClientAccount(params.shipment.clientAccountId);
  const pricingRule = account ? await storage.getPricingRuleByProfile(account.profile) : undefined;
  const markupPercentage = pricingRule
    ? await storage.getDdpMarginForQuantity(pricingRule.id, basePricing.billingUnit, basePricing.billableQuantity)
    : 0;
  const pricedQuote = calculateDdpPrice({
    lane,
    transportMethod,
    packages: billingUnit === "KG" ? [{ weight: updatedRawQuantity }] : [],
    totalCbm: billingUnit === "CBM" ? updatedRawQuantity : parseMoneyValue(params.shipment.ddpTotalCbm),
    markupPercentage,
  });

  const currentShipmentAmountSar = parseMoneyValue(
    params.shipment.clientTotalAmountSar ?? params.shipment.finalPrice,
  );
  const targetExtraWeightAmountSar = roundMoney(
    Math.max(pricedQuote.totalAmountSar - currentShipmentAmountSar, 0),
  );

  return {
    billingUnit,
    targetExtraWeightQuantity,
    targetExtraWeightAmountSar,
    targetTotalExtraFeesAmountSar: roundMoney(targetExtraWeightAmountSar + extraCostAmountSar),
    effectiveRateSarPerUnit: targetExtraWeightQuantity > 0
      ? roundMoney(targetExtraWeightAmountSar / targetExtraWeightQuantity)
      : 0,
    usedLaneFormula: true,
  };
}

async function buildDdpExtraWeightAdjustmentQuote(params: {
  shipment: Shipment;
  targetMeasuredQuantity: number;
}) {
  const billingUnit = params.shipment.ddpBillingUnit === "CBM" ? "CBM" : "KG";
  const chargeDetails = parseJsonObject(params.shipment.chargeableWeightDetails);
  const baseMeasuredQuantity = billingUnit === "CBM"
    ? Number(
        chargeDetails?.totalCbm ??
          params.shipment.ddpTotalCbm ??
          params.shipment.ddpBillableQuantity ??
          params.shipment.chargeableWeight,
      ) || 0
    : Number(
        chargeDetails?.rawBillableQuantity ??
          params.shipment.ddpBillableQuantity ??
          params.shipment.chargeableWeight ??
          params.shipment.weight,
      ) || 0;

  const currentExtraWeightQuantity = parseMoneyValue(params.shipment.extraFeesWeightValue);
  const currentMeasuredQuantity = roundQuantity(baseMeasuredQuantity + currentExtraWeightQuantity);
  const normalizedTargetMeasuredQuantity = Math.max(0, roundQuantity(params.targetMeasuredQuantity));
  const targetExtraWeightQuantity = Math.max(
    0,
    roundQuantity(normalizedTargetMeasuredQuantity - baseMeasuredQuantity),
  );
  const quote = await calculateDdpExtraWeightCharge({
    shipment: params.shipment,
    targetExtraWeightQuantity,
  });
  const currentExtraWeightAmountSar = Math.max(
    parseMoneyValue(params.shipment.extraFeesAmountSar) - parseMoneyValue(params.shipment.extraFeesCostAmountSar),
    0,
  );

  return {
    ...quote,
    baseMeasuredQuantity: roundQuantity(baseMeasuredQuantity),
    currentMeasuredQuantity,
    targetMeasuredQuantity: normalizedTargetMeasuredQuantity,
    currentExtraWeightQuantity: roundQuantity(currentExtraWeightQuantity),
    adjustmentQuantity: roundQuantity(normalizedTargetMeasuredQuantity - currentMeasuredQuantity),
    currentExtraWeightAmountSar: roundMoney(currentExtraWeightAmountSar),
    deltaAmountSar: roundMoney(quote.targetExtraWeightAmountSar - currentExtraWeightAmountSar),
  };
}

function isSameMonthYear(date: Date, month: number, year: number): boolean {
  // PostgreSQL timestamps are stored without a timezone. Drizzle hydrates them as
  // UTC dates, so UTC fields preserve the persisted calendar month at boundaries.
  return date.getUTCMonth() + 1 === month && date.getUTCFullYear() === year;
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

function isAdminFinancialStatementEligible(shipment: Record<string, any>): boolean {
  return Boolean(
    shipment.taxScenario &&
      shipment.accountingCurrency === "SAR" &&
      shipment.paymentStatus === "paid",
  );
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
      acc.expensesAmountSar += effective.expensesAmountSar;
      acc.netProfitAmountSar += effective.netProfitAmountSar;
      acc.ddpSupplierCostSar += effective.ddpSupplierCostSar;
      acc.realCostAmountSar += effective.realCostAmountSar;
      acc.realMarginAmountSar += effective.realMarginAmountSar;
      acc.realNetProfitAmountSar += effective.realNetProfitAmountSar;

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
      expensesAmountSar: 0,
      netProfitAmountSar: 0,
      ddpSupplierCostSar: 0,
      realCostAmountSar: 0,
      realMarginAmountSar: 0,
      realNetProfitAmountSar: 0,
      scenarioCounts: {} as Record<string, number>,
    },
  );
}

function getExtraFeesRateSarPerWeight(shipment: Record<string, any>): number {
  if (shipment.fulfillmentType === "ddp_manual") {
    const storedWeightValue = parseMoneyValue(shipment.extraFeesWeightValue);
    const storedExtraCostAmountSar = parseMoneyValue(shipment.extraFeesCostAmountSar);
    const storedTotalAmountSar = parseMoneyValue(shipment.extraFeesAmountSar);
    const storedWeightAmountSar = roundMoney(Math.max(storedTotalAmountSar - storedExtraCostAmountSar, 0));

    if (shipment.ddpPricingLaneId && storedWeightValue > 0 && storedWeightAmountSar > 0) {
      return roundMoney(storedWeightAmountSar / storedWeightValue);
    }

    if (parseMoneyValue(shipment.ddpRatePerUnitSar) <= 0) {
      return 0;
    }

    const baseRateAmountSar = parseMoneyValue(shipment.baseRate);
    const markupAmountSar = parseMoneyValue(shipment.marginAmount ?? shipment.margin);
    const markupFactor = baseRateAmountSar > 0
      ? 1 + (markupAmountSar / baseRateAmountSar)
      : 1;

    return roundMoney(parseMoneyValue(shipment.ddpRatePerUnitSar) * markupFactor);
  }

  const grossTotalAmountSar = parseMoneyValue(
    shipment.clientTotalAmountSar ?? shipment.finalPrice,
  );
  const weightValue = parseMoneyValue(shipment.weight);

  if (weightValue <= 0) {
    return 0;
  }

  return roundMoney(grossTotalAmountSar / weightValue);
}

function getExtraFeesQuantityUnit(shipment: Record<string, any>): string {
  if (
    shipment.fulfillmentType === "ddp_manual" &&
    (shipment.ddpBillingUnit === "KG" || shipment.ddpBillingUnit === "CBM")
  ) {
    return shipment.ddpBillingUnit;
  }

  return shipment.weightUnit || "KG";
}

function deriveShipmentExtraFees(shipment: Record<string, any>) {
  const storedType = typeof shipment.extraFeesType === "string" ? shipment.extraFeesType : null;
  const storedTotalAmountSar = parseMoneyValue(shipment.extraFeesAmountSar);
  const extraFeesWeightValue = parseMoneyValue(shipment.extraFeesWeightValue);
  const extraFeesRateSarPerWeight = getExtraFeesRateSarPerWeight(shipment);
  const explicitExtraCostAmountSar = parseMoneyValue(shipment.extraFeesCostAmountSar);
  const extraFeesCostAmountSar =
    explicitExtraCostAmountSar > 0
      ? explicitExtraCostAmountSar
      : storedType === ShipmentExtraFeeType.EXTRA_COST && storedTotalAmountSar > 0
        ? storedTotalAmountSar
        : 0;
  const storedWeightAmountSar =
    shipment.fulfillmentType === "ddp_manual" &&
    shipment.ddpPricingLaneId &&
    extraFeesWeightValue > 0 &&
    storedTotalAmountSar > 0
      ? roundMoney(Math.max(storedTotalAmountSar - extraFeesCostAmountSar, 0))
      : 0;
  const extraWeightAmountSar = extraFeesWeightValue > 0
    ? storedWeightAmountSar > 0
      ? storedWeightAmountSar
      : roundMoney(extraFeesWeightValue * extraFeesRateSarPerWeight)
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
  // Operational expenses (internal cost only) attached by the financial-statements
  // route; reduce net profit without affecting client-billed figures.
  const expensesAmountSar = isCancelled ? 0 : roundMoney(parseMoneyValue(shipment.__expensesAmountSar));
  const netProfitAmountSar = isCancelled
    ? 0
    : roundMoney(revenueExcludingTaxAmountSar - costAmountSar - expensesAmountSar);

  // Real supplier cost for DDP: the recorded costAmountSar uses the lane sell base as a
  // tax pass-through, so it overstates cost when the true supplier cost is lower. When a
  // DDP supplier cost is recorded, swap it in for the base portion (keeping extra-fee
  // cost) to report the real margin. Non-DDP or unconfigured → real == recorded.
  const ddpSupplierCostSar = isCancelled ? 0 : parseMoneyValue(shipment.ddpSupplierCostSar);
  const hasDdpSupplierCost = shipment.fulfillmentType === "ddp_manual" && ddpSupplierCostSar > 0;
  const realCostAmountSar = isCancelled
    ? 0
    : hasDdpSupplierCost
      ? roundMoney(ddpSupplierCostSar + derivedExtraFees.extraFeesCostAmountSar)
      : costAmountSar;
  const realMarginAmountSar = isCancelled
    ? 0
    : roundMoney(revenueExcludingTaxAmountSar - realCostAmountSar);
  const realNetProfitAmountSar = isCancelled
    ? 0
    : roundMoney(revenueExcludingTaxAmountSar - realCostAmountSar - expensesAmountSar);

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
    expensesAmountSar,
    netProfitAmountSar,
    ddpSupplierCostSar,
    realCostAmountSar,
    realMarginAmountSar,
    realNetProfitAmountSar,
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
    extraFeesQuantityUnit: getExtraFeesQuantityUnit(shipment),
    extraFeesAddedAt: shipment.extraFeesAddedAt,
    extraFeesEmailSentAt: shipment.extraFeesEmailSentAt,
    extraWeightInvoiceStatus,
    isExtraWeightPaid,
    expensesAmountSar: effective.expensesAmountSar,
    netProfitAmountSar: effective.netProfitAmountSar,
    ddpSupplierCostSar: effective.ddpSupplierCostSar,
    realCostAmountSar: effective.realCostAmountSar,
    realMarginAmountSar: effective.realMarginAmountSar,
    realNetProfitAmountSar: effective.realNetProfitAmountSar,
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
  max:
    process.env.NODE_ENV === "test"
      ? 1000
      : Math.max(Number(process.env.API_RATE_LIMIT_MAX || 1000) || 1000, 100),
  keyGenerator: (req) => req.session?.userId ? `user:${req.session.userId}` : `ip:${ipKeyGenerator(req.ip || "")}`,
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

// Public, AI-backed company-document extraction on the application form. Kept tight since it is
// unauthenticated and calls Gemini.
const companyExtractionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: "Too many extraction requests, please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Email-OTP login: throttle code requests + verifications per IP.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
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
  TASK_PERMISSION_NAMES,
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
  userType: z.enum(["admin", "operations"]).default("admin"),
  operationLevel: z.enum(["manager", "team_lead", "specialist", "agent"]).default("agent"),
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

const hierarchyLevelSchema = z.enum([
  RoleHierarchyLevel.AGENT,
  RoleHierarchyLevel.SPECIALIST,
  RoleHierarchyLevel.TEAM_LEAD,
  RoleHierarchyLevel.MANAGER,
  RoleHierarchyLevel.PLATFORM_ADMIN,
]);

const departmentIconKeySchema = z.enum(
  Array.from(new Set(INTERNAL_DEPARTMENT_STYLE_PRESETS.map((preset) => preset.iconKey))) as [string, ...string[]],
);

const departmentColorKeySchema = z.enum(
  Array.from(new Set(INTERNAL_DEPARTMENT_STYLE_PRESETS.map((preset) => preset.colorKey))) as [string, ...string[]],
);

const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, "Department name is required"),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").optional(),
  iconKey: departmentIconKeySchema,
  colorKey: departmentColorKeySchema,
  sortOrder: z.number().int().optional(),
});

const updateDepartmentSchema = createDepartmentSchema.partial();

const createHierarchicalRoleSchema = z.object({
  name: z.string().trim().min(2, "Role name is required"),
  departmentId: z.string().trim().optional(),
  hierarchyLevel: hierarchyLevelSchema.optional(),
  description: z.string().trim().max(1000, "Description must be 1000 characters or fewer").optional(),
  permissionIds: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

const updateHierarchicalRoleSchema = createHierarchicalRoleSchema.partial();

const createInvitationSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Invalid email address"),
  departmentId: z.string().trim().min(1, "Department is required"),
  roleId: z.string().trim().min(1, "Role is required"),
  personalMessage: z.string().trim().max(2000, "Personal message must be 2000 characters or fewer").optional(),
});

const updateInternalUserSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").optional(),
  email: z.string().trim().email("Invalid email address").optional(),
  roleId: z.string().trim().min(1, "Role is required").optional(),
});

const acceptInvitationSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
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

function normalizeBadgeColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    return undefined;
  }

  return normalized.toUpperCase();
}

function normalizeBadgeStyle(value: unknown): "solid" | "gradient" {
  return value === "gradient" ? "gradient" : "solid";
}

function normalizeBadgeIcon(value: unknown): string {
  const allowedIcons = new Set([
    "award",
    "briefcase",
    "crown",
    "gem",
    "rocket",
    "shield",
    "sparkles",
    "star",
    "user",
    "zap",
  ]);

  if (typeof value !== "string") {
    return "star";
  }

  const normalized = value.trim().toLowerCase();
  return allowedIcons.has(normalized) ? normalized : "star";
}

function normalizeBadgeGradientAngle(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 135;
  }

  return Math.max(0, Math.min(360, Math.round(parsed)));
}

// Internal staff = admin + operations. Page/endpoint access for this group is
// permission-driven (RBAC), not userType-driven: ensureAdminAccess only gates
// out external users (clients), while requireAdminPermission enforces the
// specific permission each admin route needs.
function isInternalStaff(user: Pick<User, "userType">): boolean {
  return user.userType === "admin" || user.userType === "operations";
}

async function ensureAdminAccess(req: Request, res: Response): Promise<User | null> {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) {
    return null;
  }

  if (!isInternalStaff(user)) {
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

async function ensureOperationsAccess(req: Request, res: Response): Promise<User | null> {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) {
    return null;
  }

  if (user.userType !== "operations" && user.userType !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return user;
}

async function getEffectiveOperationsPermissionNames(user: User): Promise<string[]> {
  if (user.userType === "admin") {
    return getEffectiveAdminPermissionNames(user);
  }

  const permissions = await storage.getAdminPermissions(user.id);
  return Array.from(new Set(permissions.map((permission) => permission.name))).sort();
}

function requireOperationsPermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await ensureOperationsAccess(req, res);
    if (!user) {
      return;
    }

    const permissionNames = await getEffectiveOperationsPermissionNames(user);
    if (!permissionNames.includes(`${resource}:${action}`)) {
      return res.status(403).json({ error: "Permission denied" });
    }

    next();
  };
}

// Tasks are an internal-only collaboration surface: admin + operations users only,
// never client sessions. Returns the authenticated internal user or null (response sent).
async function ensureInternalUser(req: Request, res: Response): Promise<User | null> {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) {
    return null;
  }
  if (user.userType !== "admin" && user.userType !== "operations") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return user;
}

function requireTaskPermission(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await ensureInternalUser(req, res);
    if (!user) {
      return;
    }
    const permissionNames = await getEffectiveOperationsPermissionNames(user);
    if (!permissionNames.includes(`${action}`)) {
      return res.status(403).json({ error: "Permission denied" });
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

type InternalDepartmentRef = Pick<Department, "id" | "name" | "slug" | "iconKey" | "colorKey">;

type InternalRoleRef = Pick<Role, "id" | "name" | "hierarchyLevel">;

type InternalStaffUserRow = {
  kind: "user";
  id: string;
  fullName: string;
  username: string;
  email: string;
  department: InternalDepartmentRef | null;
  role: InternalRoleRef | null;
  status: "active" | "inactive";
  lastLoginAt: Date | null;
  userType: User["userType"];
  isActive: boolean;
};

type InternalInvitationRow = {
  kind: "invitation";
  id: string;
  fullName: string;
  email: string;
  department: InternalDepartmentRef | null;
  role: InternalRoleRef | null;
  status: "pending" | "revoked" | "accepted" | "expired";
  lastLoginAt: null;
  userType: "admin" | "operations";
  isActive: false;
  sentAt: Date;
  expiresAt: Date;
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APP_BASE_URL =
  process.env.APP_URL ||
  process.env.FRONTEND_URL ||
  process.env.APP_BASE_URL ||
  "http://localhost:5001";

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
    departmentId: null,
    hierarchyLevel: null,
    sortOrder: 999,
    isSystem: true,
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
  "dashboard:read",
  "clients:read",
  "clients:update",
  "clients:activate",
  "shipments:read",
  "shipments:cancel",
  "shipments:update",
  "shipments:track",
  "invoices:read",
  "invoices:download",
  "payments:read",
  "credit-invoices:read",
  "refund-requests:read",
  "refund-requests:approve-account-manager",
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

const CANCELLABLE_SHIPMENT_STATUSES = new Set([
  "created",
  "processing",
  "carrier_error",
  "payment_pending",
]);

const NON_CANCELLABLE_CARRIER_STATUSES = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

const CARRIER_CANCELLATION_FAILED_MESSAGE =
  "We could not cancel this shipment with the carrier automatically. Please contact support to complete the cancellation.";

function canShipmentBeCancelled(shipment: Shipment): boolean {
  if (!CANCELLABLE_SHIPMENT_STATUSES.has(shipment.status)) {
    return false;
  }

  const normalizedCarrierStatus = (shipment.carrierStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalizedCarrierStatus) {
    return true;
  }

  return !NON_CANCELLABLE_CARRIER_STATUSES.has(normalizedCarrierStatus);
}

// Carrier statuses that mean the parcel has left the shipper (collected or moving). A shipment
// that has NOT reached one of these is "still booked" — its cancellation refund is issued
// automatically; anything beyond booked routes through the manual approval workflow.
const COLLECTED_OR_MOVING_CARRIER_STATUSES = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
]);

function isShipmentStillBooked(shipment: Shipment): boolean {
  const normalizedCarrierStatus = (shipment.carrierStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return !COLLECTED_OR_MOVING_CARRIER_STATUSES.has(normalizedCarrierStatus);
}

function isShipmentRefundApprovalSatisfied(status: string | null | undefined): boolean {
  return (
    status === ShipmentRefundApprovalStatus.APPROVED ||
    status === ShipmentRefundApprovalStatus.NOT_REQUIRED
  );
}

function isShipmentRefundRequestCompleted(request: ShipmentRefundRequest): boolean {
  return (
    request.status === ShipmentRefundRequestStatus.COMPLETED ||
    (
      isShipmentRefundApprovalSatisfied(request.accountManagerApprovalStatus) &&
      isShipmentRefundApprovalSatisfied(request.financeApprovalStatus)
    )
  );
}

async function getShipmentRefundPaymentContext(shipment: Shipment): Promise<{
  requiresRefund: boolean;
  amount: number;
  currency: string;
  invoiceId: string | null;
  payment: Payment | null;
}> {
  const shipmentInvoices = await storage.getInvoicesByShipmentId(shipment.id);
  const primaryInvoice =
    shipmentInvoices.find((invoice) => invoice.invoiceType === InvoiceType.SHIPMENT) ||
    shipmentInvoices[0] ||
    null;

  const completedPayment =
    primaryInvoice
      ? (await storage.getPaymentsByClientAccount(shipment.clientAccountId)).find(
          (payment) => payment.invoiceId === primaryInvoice.id && payment.status === "completed",
        ) || null
      : null;

  const amount = primaryInvoice
    ? Number(primaryInvoice.amount || 0)
    : Number(shipment.clientTotalAmountSar ?? shipment.finalPrice ?? 0);
  const currency = shipment.accountingCurrency || shipment.currency || "SAR";
  const requiresRefund = Boolean(
    amount > 0 &&
      (
        shipment.paymentStatus === "paid" ||
        primaryInvoice?.status === "paid" ||
        completedPayment
      ),
  );

  return {
    requiresRefund,
    amount,
    currency,
    invoiceId: primaryInvoice?.id || null,
    payment: completedPayment,
  };
}

function getRefundActorType(user: User): "CLIENT" | "ACCOUNT_MANAGER" | "ADMIN" {
  if (user.userType === "client") {
    return ShipmentRefundRequestActorType.CLIENT;
  }

  if (user.isAccountManager) {
    return ShipmentRefundRequestActorType.ACCOUNT_MANAGER;
  }

  return ShipmentRefundRequestActorType.ADMIN;
}

async function ensureShipmentRefundRequestForCancellation(params: {
  shipment: Shipment;
  user: User;
  autoRefund?: boolean;
}): Promise<ShipmentRefundRequest | null> {
  const { shipment, user, autoRefund } = params;
  const existingRequest = await storage.getShipmentRefundRequestByShipmentId(shipment.id);
  if (existingRequest) {
    return existingRequest;
  }

  const refundPaymentContext = await getShipmentRefundPaymentContext(shipment);
  if (!refundPaymentContext.requiresRefund) {
    return null;
  }

  // Still-booked cancellations: issue the Tap refund immediately and complete the request with
  // no approval workflow. A gateway failure falls through to the manual approval flow below.
  if (autoRefund) {
    const chargeId = refundPaymentContext.payment?.transactionId || shipment.paymentIntentId;
    if (chargeId) {
      try {
        const refund = await withBoundIntegrationAccount(
          "tap",
          shipment.tapIntegrationAccountId,
          getShipmentIntegrationRoutingOptions(shipment),
          async () => {
            const charge = await tapService.retrieveCharge(chargeId);
            const amount = Number(charge?.amount) > 0 ? Number(charge!.amount) : refundPaymentContext.amount;
            const currency = charge?.currency || shipment.currency || refundPaymentContext.currency || "SAR";
            return tapService.refundCharge({
              chargeId,
              amount,
              currency,
              reason: "requested_by_customer",
              reference: shipment.trackingNumber,
            });
          },
        );

        if (refundPaymentContext.payment) {
          await storage.updatePayment(refundPaymentContext.payment.id, { status: "refunded" });
        }
        if (refundPaymentContext.invoiceId) {
          await storage.updateInvoice(refundPaymentContext.invoiceId, { status: "refunded" });
        }
        // Reflect the refund on the shipment itself so it reads "Refunded", not "Paid".
        await storage.updateShipment(shipment.id, { paymentStatus: "refunded" });
        await logAudit(
          user.id,
          "shipment_refund_auto",
          "shipment",
          shipment.id,
          `Auto-refunded ${refund.amount} ${refund.currency} via Tap (${refund.refundId}) on still-booked cancellation of ${shipment.trackingNumber}`,
        );

        return storage.createShipmentRefundRequest({
          shipmentId: shipment.id,
          clientAccountId: shipment.clientAccountId,
          invoiceId: refundPaymentContext.invoiceId,
          amount: formatMoney(refundPaymentContext.amount),
          currency: refundPaymentContext.currency,
          status: ShipmentRefundRequestStatus.COMPLETED,
          requestedByUserId: user.id,
          requestedByActorType: getRefundActorType(user),
          accountManagerUserId: null,
          accountManagerApprovalStatus: ShipmentRefundApprovalStatus.NOT_REQUIRED,
          accountManagerApprovedByUserId: null,
          accountManagerApprovedAt: null,
          financeApprovalStatus: ShipmentRefundApprovalStatus.NOT_REQUIRED,
          financeApprovedByUserId: null,
          financeApprovedAt: null,
          completedAt: new Date(),
          gatewayRefundId: refund.refundId,
        });
      } catch (refundError) {
        logError(
          `Automatic Tap refund failed for ${shipment.trackingNumber}; falling back to manual approval`,
          refundError,
        );
        // fall through to the manual approval request below
      }
    }
  }

  const assignedAccountManager = await storage.getPrimaryAccountManagerForClient(shipment.clientAccountId);
  const actorType = getRefundActorType(user);
  const isCancellingAssignedAccountManager =
    actorType === ShipmentRefundRequestActorType.ACCOUNT_MANAGER &&
    assignedAccountManager &&
    assignedAccountManager.id === user.id;
  const isCancellingFinanceActor = actorType === ShipmentRefundRequestActorType.ADMIN;

  const accountManagerApprovalStatus = !assignedAccountManager
    ? ShipmentRefundApprovalStatus.NOT_REQUIRED
    : isCancellingAssignedAccountManager
      ? ShipmentRefundApprovalStatus.APPROVED
      : ShipmentRefundApprovalStatus.PENDING;
  const financeApprovalStatus = isCancellingFinanceActor
    ? ShipmentRefundApprovalStatus.APPROVED
    : ShipmentRefundApprovalStatus.PENDING;
  const isCompleted =
    isShipmentRefundApprovalSatisfied(accountManagerApprovalStatus) &&
    isShipmentRefundApprovalSatisfied(financeApprovalStatus);
  const now = new Date();

  return storage.createShipmentRefundRequest({
    shipmentId: shipment.id,
    clientAccountId: shipment.clientAccountId,
    invoiceId: refundPaymentContext.invoiceId,
    amount: formatMoney(refundPaymentContext.amount),
    currency: refundPaymentContext.currency,
    status: isCompleted ? ShipmentRefundRequestStatus.COMPLETED : ShipmentRefundRequestStatus.PENDING,
    requestedByUserId: user.id,
    requestedByActorType: actorType,
    accountManagerUserId: assignedAccountManager?.id || null,
    accountManagerApprovalStatus,
    accountManagerApprovedByUserId:
      accountManagerApprovalStatus === ShipmentRefundApprovalStatus.APPROVED ? user.id : null,
    accountManagerApprovedAt:
      accountManagerApprovalStatus === ShipmentRefundApprovalStatus.APPROVED ? now : null,
    financeApprovalStatus,
    financeApprovedByUserId:
      financeApprovalStatus === ShipmentRefundApprovalStatus.APPROVED ? user.id : null,
    financeApprovedAt:
      financeApprovalStatus === ShipmentRefundApprovalStatus.APPROVED ? now : null,
    completedAt: isCompleted ? now : null,
    rejectionReason: null,
  });
}

type ShipmentRefundRequestSummary = ShipmentRefundRequest & {
  shipmentTrackingNumber: string | null;
  carrierTrackingNumber: string | null;
  shipmentStatus: string | null;
  clientName: string;
  clientAccountNumber: string | null;
  requestedByName: string | null;
  accountManagerName: string | null;
  accountManagerApprovalSatisfied: boolean;
  financeApprovalSatisfied: boolean;
  canApproveAsAccountManager: boolean;
  canApproveAsFinance: boolean;
};

async function serializeShipmentRefundRequestForAdmin(
  request: ShipmentRefundRequest,
  user: User,
): Promise<ShipmentRefundRequestSummary> {
  const [shipment, clientAccount, requestedByUser, assignedAccountManager, permissionNames] = await Promise.all([
    storage.getShipment(request.shipmentId),
    storage.getClientAccount(request.clientAccountId),
    storage.getUser(request.requestedByUserId),
    request.accountManagerUserId ? storage.getUser(request.accountManagerUserId) : Promise.resolve(undefined),
    getEffectiveAdminPermissionNames(user),
  ]);

  return {
    ...request,
    shipmentTrackingNumber: shipment?.trackingNumber || null,
    carrierTrackingNumber: shipment?.carrierTrackingNumber || null,
    shipmentStatus: shipment?.status || null,
    clientName: clientAccount?.name || "Unknown Client",
    clientAccountNumber: clientAccount?.accountNumber || null,
    requestedByName: requestedByUser?.username || requestedByUser?.email || null,
    accountManagerName: assignedAccountManager?.username || assignedAccountManager?.email || null,
    accountManagerApprovalSatisfied: isShipmentRefundApprovalSatisfied(request.accountManagerApprovalStatus),
    financeApprovalSatisfied: isShipmentRefundApprovalSatisfied(request.financeApprovalStatus),
    canApproveAsAccountManager:
      user.isAccountManager &&
      request.accountManagerUserId === user.id &&
      request.accountManagerApprovalStatus === ShipmentRefundApprovalStatus.PENDING,
    canApproveAsFinance:
      !user.isAccountManager &&
      permissionNames.includes("refund-requests:approve-finance") &&
      request.financeApprovalStatus === ShipmentRefundApprovalStatus.PENDING,
  };
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
  assignIfDefined("preferredCurrency");

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

  await withBoundIntegrationAccount("zoho", currentClient.zohoIntegrationAccountId, getClientIntegrationRoutingOptions(updatedClient), async () => {
    if (!zohoService.isConfigured() || !currentClient.zohoCustomerId) return;

    try {
      await zohoService.updateCustomer(currentClient.zohoCustomerId!, {
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
  });

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

function getUserDisplayName(user?: Pick<User, "fullName" | "username" | "email"> | null): string {
  return user?.fullName?.trim() || user?.username || user?.email || "Unknown user";
}

function slugifyValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildInvitationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createInvitationToken() {
  const token = `${randomUUID()}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  return {
    token,
    tokenHash: buildInvitationTokenHash(token),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  };
}

function buildInvitationAcceptUrl(token: string): string {
  return `${APP_BASE_URL.replace(/\/$/, "")}/invite/accept/${token}`;
}

function isCuratedDepartmentStyle(iconKey: string, colorKey: string): boolean {
  return INTERNAL_DEPARTMENT_STYLE_PRESETS.some(
    (preset) => preset.iconKey === iconKey && preset.colorKey === colorKey,
  );
}

function getDepartmentUserType(slug?: string | null): "admin" | "operations" {
  return slug === InternalDepartmentSlug.OPERATIONS ? "operations" : "admin";
}

function getOperationProfileLevelForHierarchy(level?: string | null): string {
  switch (level) {
    case RoleHierarchyLevel.MANAGER:
      return "manager";
    case RoleHierarchyLevel.TEAM_LEAD:
      return "team_lead";
    case RoleHierarchyLevel.SPECIALIST:
      return "specialist";
    case RoleHierarchyLevel.AGENT:
    default:
      return "agent";
  }
}

function getOperationRoleNameByProfileLevel(level?: string | null): string {
  switch (level) {
    case "manager":
      return OPERATION_ROLE_NAMES.manager;
    case "team_lead":
    case "lead":
      return OPERATION_ROLE_NAMES.teamLead;
    case "specialist":
      return OPERATION_ROLE_NAMES.specialist;
    case "agent":
    default:
      return OPERATION_ROLE_NAMES.agent;
  }
}

function getDefaultHierarchyLevelForDepartment(department?: Pick<Department, "slug"> | null): RoleHierarchyLevelValue {
  if (department?.slug === InternalDepartmentSlug.PLATFORM) {
    return RoleHierarchyLevel.PLATFORM_ADMIN;
  }

  return RoleHierarchyLevel.AGENT;
}

function getRoleHierarchySort(level?: string | null): number {
  if (!level) return 999;
  return HIERARCHY_LEVEL_SORT_ORDER[level as RoleHierarchyLevelValue] ?? 999;
}

async function generateUniqueUsername(fullName: string, email: string): Promise<string> {
  const emailBase = email.split("@")[0] || "user";
  const nameBase = slugifyValue(fullName).replace(/-/g, ".") || slugifyValue(emailBase).replace(/-/g, ".");
  const base = (nameBase || "user").slice(0, 28);

  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? "" : `${attempt + 1}`;
    const candidate = `${base}${suffix}`.slice(0, 32);
    if (!candidate) {
      continue;
    }
    const existing = await storage.getUserByUsername(candidate);
    if (!existing) {
      return candidate;
    }
  }

  return `user.${Date.now()}`;
}

async function syncRolePermissions(roleId: string, permissionIds: string[]) {
  const uniquePermissionIds = Array.from(new Set(permissionIds.filter(Boolean)));
  const existingAssignments = await storage.getRolePermissions(roleId);
  const existingPermissionIds = new Set(existingAssignments.map((assignment) => assignment.permissionId));

  for (const permissionId of uniquePermissionIds) {
    if (!existingPermissionIds.has(permissionId)) {
      await storage.assignRolePermission({ roleId, permissionId });
    }
  }

  for (const assignment of existingAssignments) {
    if (!uniquePermissionIds.includes(assignment.permissionId)) {
      await storage.removeRolePermission(roleId, assignment.permissionId);
    }
  }
}

async function serializeRoleWithPermissions(
  role: Role,
  allPermissions?: Permission[],
): Promise<Role & { permissions: Permission[] }> {
  const permissions = allPermissions || await storage.getPermissions();

  // The account-manager system role is synthetic (no role_permissions rows); its
  // access is a fixed permission set, mirroring GET /api/admin/roles/:id.
  if (isAccountManagerSystemRoleId(role.id)) {
    const fixedPermissionNames = new Set<string>(ACCOUNT_MANAGER_FIXED_PERMISSION_NAMES);
    return {
      ...role,
      permissions: permissions
        .filter((permission) => fixedPermissionNames.has(permission.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  const rolePermissionAssignments = await storage.getRolePermissions(role.id);
  const assignedPermissionIds = new Set(rolePermissionAssignments.map((assignment) => assignment.permissionId));

  return {
    ...role,
    permissions: permissions
      .filter((permission) => assignedPermissionIds.has(permission.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function getRoleDisplayName(role?: Pick<Role, "name"> | null): string | null {
  return role?.name || null;
}

function getDepartmentRef(department?: Department | null): InternalDepartmentRef | null {
  if (!department) return null;
  return {
    id: department.id,
    name: department.name,
    slug: department.slug,
    iconKey: department.iconKey,
    colorKey: department.colorKey,
  };
}

function getRoleRef(role?: Role | null): InternalRoleRef | null {
  if (!role) return null;
  return {
    id: role.id,
    name: getRoleDisplayName(role) || role.name,
    hierarchyLevel: role.hierarchyLevel,
  };
}

function getInvitationEffectiveStatus(invitation: UserInvitation): InternalInvitationRow["status"] {
  if (invitation.status === UserInvitationStatus.PENDING && invitation.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }

  return invitation.status as InternalInvitationRow["status"];
}

async function refreshInvitationStatus(invitation: UserInvitation): Promise<UserInvitation> {
  const effectiveStatus = getInvitationEffectiveStatus(invitation);
  if (effectiveStatus === invitation.status) {
    return invitation;
  }

  return (await storage.updateUserInvitation(invitation.id, { status: effectiveStatus })) || invitation;
}

function sortDepartmentRoles(roles: Role[]) {
  return [...roles].sort((left, right) => {
    const hierarchyDiff = getRoleHierarchySort(left.hierarchyLevel) - getRoleHierarchySort(right.hierarchyLevel);
    if (hierarchyDiff !== 0) return hierarchyDiff;
    const sortDiff = (left.sortOrder || 0) - (right.sortOrder || 0);
    if (sortDiff !== 0) return sortDiff;
    return left.name.localeCompare(right.name);
  });
}

function getFallbackDepartmentForUser(user: User, departmentsBySlug: Map<string, Department>): Department | null {
  if (user.isAccountManager) {
    return departmentsBySlug.get(InternalDepartmentSlug.ACCOUNT_MANAGEMENT) || null;
  }

  if (user.userType === "operations") {
    return departmentsBySlug.get(InternalDepartmentSlug.OPERATIONS) || null;
  }

  return departmentsBySlug.get(InternalDepartmentSlug.PLATFORM) || null;
}

function getPrimaryRoleForUser(
  user: User,
  assignedRoles: Role[],
  fallbackRolesByDepartmentSlug: Map<string, Role>,
  departmentsById: Map<string, Department>,
): Role | null {
  const assignedDepartmentRoles = sortDepartmentRoles(
    assignedRoles.filter((role) => role.departmentId && departmentsById.has(role.departmentId)),
  );

  if (assignedDepartmentRoles.length > 0) {
    return assignedDepartmentRoles[0];
  }

  if (user.isAccountManager) {
    return fallbackRolesByDepartmentSlug.get(InternalDepartmentSlug.ACCOUNT_MANAGEMENT) || null;
  }

  if (user.userType === "operations") {
    return fallbackRolesByDepartmentSlug.get(InternalDepartmentSlug.OPERATIONS) || null;
  }

  return fallbackRolesByDepartmentSlug.get(InternalDepartmentSlug.PLATFORM) || null;
}

async function buildInternalStaffUserRow(
  user: User,
  assignedRoles: Role[],
  departmentsById: Map<string, Department>,
  departmentsBySlug: Map<string, Department>,
  fallbackRolesByDepartmentSlug: Map<string, Role>,
): Promise<InternalStaffUserRow> {
  const primaryRole = getPrimaryRoleForUser(user, assignedRoles, fallbackRolesByDepartmentSlug, departmentsById);
  const department =
    (primaryRole?.departmentId ? departmentsById.get(primaryRole.departmentId) : null) ||
    getFallbackDepartmentForUser(user, departmentsBySlug);

  return {
    kind: "user",
    id: user.id,
    fullName: getUserDisplayName(user),
    username: user.username,
    email: user.email,
    department: getDepartmentRef(department),
    role: getRoleRef(primaryRole),
    status: user.isActive ? "active" : "inactive",
    lastLoginAt: user.lastLoginAt || null,
    userType: user.userType,
    isActive: user.isActive,
  };
}

function buildInternalInvitationRow(
  invitation: UserInvitation,
  departmentsById: Map<string, Department>,
  rolesById: Map<string, Role>,
): InternalInvitationRow {
  const department = departmentsById.get(invitation.departmentId) || null;
  const role = rolesById.get(invitation.roleId) || null;

  return {
    kind: "invitation",
    id: invitation.id,
    fullName: invitation.fullName,
    email: invitation.email,
    department: getDepartmentRef(department),
    role: getRoleRef(role),
    status: getInvitationEffectiveStatus(invitation),
    lastLoginAt: null,
    userType: getDepartmentUserType(department?.slug),
    isActive: false,
    sentAt: invitation.sentAt,
    expiresAt: invitation.expiresAt,
  };
}

async function sendStaffInvitationEmail(params: {
  invitation: UserInvitation;
  token: string;
  department: Department;
  role: Role;
}) {
  const acceptUrl = buildInvitationAcceptUrl(params.token);
  const personalMessage = params.invitation.personalMessage?.trim();

  const rendered = await getRenderedTemplate("staff_invitation", {
    full_name: params.invitation.fullName,
    role_name: params.role.name,
    department_name: params.department.name,
    personal_message: personalMessage ? `<p>${personalMessage}</p>` : "",
    accept_url: acceptUrl,
    expires_date: params.invitation.expiresAt.toLocaleDateString(),
    year: new Date().getFullYear().toString(),
  });

  if (!rendered) {
    logError("Failed to render staff_invitation template");
    return false;
  }

  return sendEmail({
    to: params.invitation.email,
    subject: rendered.subject,
    html: rendered.html,
  });
}

function getFallbackRoleByDepartmentSlug(
  roles: Role[],
  departmentSlug: string,
  hierarchyLevel: RoleHierarchyLevelValue,
  departmentsById: Map<string, Department>,
): Role | null {
  return (
    sortDepartmentRoles(
      roles.filter((role) => {
        if (!role.departmentId) return false;
        const department = departmentsById.get(role.departmentId);
        return department?.slug === departmentSlug && role.hierarchyLevel === hierarchyLevel;
      }),
    )[0] || null
  );
}

async function listInternalStaffUserRows(): Promise<InternalStaffUserRow[]> {
  const [departments, roles, adminUsers, operationsUsers] = await Promise.all([
    storage.getDepartments(),
    storage.getRoles(),
    storage.getUsersByUserType("admin"),
    storage.getUsersByUserType("operations"),
  ]);

  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const departmentsBySlug = new Map(departments.map((department) => [department.slug, department]));
  const fallbackRolesByDepartmentSlug = new Map<string, Role>();
  const platformRole = getFallbackRoleByDepartmentSlug(
    roles,
    InternalDepartmentSlug.PLATFORM,
    RoleHierarchyLevel.PLATFORM_ADMIN,
    departmentsById,
  );
  const operationsRole = getFallbackRoleByDepartmentSlug(
    roles,
    InternalDepartmentSlug.OPERATIONS,
    RoleHierarchyLevel.AGENT,
    departmentsById,
  );
  const accountManagementRole = getFallbackRoleByDepartmentSlug(
    roles,
    InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
    RoleHierarchyLevel.AGENT,
    departmentsById,
  );

  if (platformRole) fallbackRolesByDepartmentSlug.set(InternalDepartmentSlug.PLATFORM, platformRole);
  if (operationsRole) fallbackRolesByDepartmentSlug.set(InternalDepartmentSlug.OPERATIONS, operationsRole);
  if (accountManagementRole) fallbackRolesByDepartmentSlug.set(InternalDepartmentSlug.ACCOUNT_MANAGEMENT, accountManagementRole);

  return Promise.all(
    [...adminUsers, ...operationsUsers].map(async (user) => {
      const assignedRoles = await getAssignedRolesForUser(user, roles);
      return buildInternalStaffUserRow(
        user,
        assignedRoles,
        departmentsById,
        departmentsBySlug,
        fallbackRolesByDepartmentSlug,
      );
    }),
  );
}

async function listInternalInvitationRows(params?: { status?: string }): Promise<InternalInvitationRow[]> {
  const [departments, roles, invitations] = await Promise.all([
    storage.getDepartments(),
    storage.getRoles(),
    storage.getUserInvitations(params),
  ]);
  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  const normalizedInvitations = await Promise.all(invitations.map(refreshInvitationStatus));
  return normalizedInvitations.map((invitation) => buildInternalInvitationRow(invitation, departmentsById, rolesById));
}

async function buildInternalStaffUserDetail(user: User) {
  const [departments, roles, assignedRoles, effectivePermissions, auditRows] = await Promise.all([
    storage.getDepartments(),
    storage.getRoles(),
    getAssignedRolesForUser(user),
    storage.getAdminPermissions(user.id),
    storage.getAuditLogs(),
  ]);

  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const departmentsBySlug = new Map(departments.map((department) => [department.slug, department]));
  const fallbackRolesByDepartmentSlug = new Map<string, Role>();
  const platformRole = getFallbackRoleByDepartmentSlug(
    roles,
    InternalDepartmentSlug.PLATFORM,
    RoleHierarchyLevel.PLATFORM_ADMIN,
    departmentsById,
  );
  const operationsRole = getFallbackRoleByDepartmentSlug(
    roles,
    InternalDepartmentSlug.OPERATIONS,
    RoleHierarchyLevel.AGENT,
    departmentsById,
  );
  const accountManagementRole = getFallbackRoleByDepartmentSlug(
    roles,
    InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
    RoleHierarchyLevel.AGENT,
    departmentsById,
  );

  if (platformRole) fallbackRolesByDepartmentSlug.set(InternalDepartmentSlug.PLATFORM, platformRole);
  if (operationsRole) fallbackRolesByDepartmentSlug.set(InternalDepartmentSlug.OPERATIONS, operationsRole);
  if (accountManagementRole) fallbackRolesByDepartmentSlug.set(InternalDepartmentSlug.ACCOUNT_MANAGEMENT, accountManagementRole);

  const row = await buildInternalStaffUserRow(
    user,
    assignedRoles,
    departmentsById,
    departmentsBySlug,
    fallbackRolesByDepartmentSlug,
  );

  const uniquePermissions = effectivePermissions
    .filter(
      (permission, index, collection) =>
        collection.findIndex((candidate) => candidate.id === permission.id) === index,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const userAuditRows = auditRows
    .filter((auditRow) => auditRow.entityType === "user" && auditRow.entityId === user.id)
    .map((auditRow) => ({
      id: auditRow.id,
      action: auditRow.action,
      details: auditRow.details,
      createdAt: auditRow.createdAt?.toISOString() || new Date().toISOString(),
    }));

  const activity = [
    {
      id: `created-${user.id}`,
      action: "account_created",
      details: `Account created for ${getUserDisplayName(user)}`,
      createdAt: user.createdAt.toISOString(),
    },
    ...userAuditRows.filter((auditRow) => auditRow.action !== "create_admin_user"),
    ...(
      user.lastLoginAt && !userAuditRows.some((auditRow) => auditRow.action === "login")
        ? [{
            id: `last-login-${user.id}`,
            action: "last_login",
            details: `Last login for ${getUserDisplayName(user)}`,
            createdAt: user.lastLoginAt.toISOString(),
          }]
        : []
    ),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 12);

  return {
    row,
    createdAt: user.createdAt.toISOString(),
    phone: null,
    permissions: uniquePermissions.map((permission) => ({
      id: permission.id,
      name: permission.name,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
    })),
    activity,
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
  const payment = await storage.createPayment({
    invoiceId: params.invoiceId,
    clientAccountId: params.clientAccountId,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
    status: "completed",
    transactionId: params.transactionId,
  });

  // NOTE: We deliberately do NOT record the payment in Zoho. Invoices are synced to
  // Zoho as drafts and left for accounting to review/finalize there — our system does
  // not mark them paid.

  return payment;
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
    shipmentInvoice = await syncInvoiceToZoho(shipmentInvoice, shipment || undefined);

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

  // Restore available credit on the ledger now that the receivable is settled.
  if (invoice.status !== "PAID") {
    const summaryAfter = await storage.getClientCreditSummary(invoice.clientAccountId);
    await storage.createCreditTransaction({
      clientAccountId: invoice.clientAccountId,
      shipmentId: invoice.shipmentId,
      creditInvoiceId: invoice.id,
      type: "CREDIT",
      amountSar: Number(invoice.amount).toFixed(2),
      balanceAfterSar: summaryAfter.available.toFixed(2),
      reason: "Credit invoice settled",
      createdByUserId: userId,
    });
  }

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
  invoice = await syncInvoiceToZoho(invoice, shipment);

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
    weightUnit: getExtraFeesQuantityUnit(shipment),
    grossTotalAmountSar: parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice),
    extraFeesRateSarPerWeight: effective.extraFeesRateSarPerWeight,
  };
}

function getInvoiceTypeLabel(invoiceType: string | null | undefined, shipment?: Record<string, any> | null) {
  if (invoiceType === InvoiceType.EXTRA_WEIGHT) {
    return getExtraFeesQuantityUnit(shipment || {}) === "CBM" ? "Extra Volume" : "Extra Weight";
  }
  if (invoiceType === InvoiceType.EXTRA_COST) {
    return "Extra Cost";
  }
  return "Shipment";
}

function buildExtraFeeInvoiceDescription(shipment: Record<string, any>, invoiceType: string) {
  const feeLabel = getInvoiceTypeLabel(invoiceType, shipment);
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
      // Soft-delete locally only. Zoho invoices are deleted manually in Zoho, never
      // through our system.
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
      // Soft-delete locally only; Zoho invoices are removed manually in Zoho.
      await storage.updateInvoice(duplicateInvoice.id, { deletedAt: new Date() });
    }

    return syncInvoiceToZoho(invoice, params.shipment);
  }

  const createdInvoice = await storage.createInvoice({
    clientAccountId: params.shipment.clientAccountId,
    shipmentId: params.shipment.id,
    invoiceType: params.invoiceType,
    description,
    amount: formatMoney(outstandingAmountSar),
    status: "pending",
    dueDate,
  });
  return syncInvoiceToZoho(createdInvoice, params.shipment);
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
      weightUnit: getExtraFeesQuantityUnit(shipment),
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
export const DEFAULT_PERMISSIONS = [
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

  // Operations Hub
  { resource: "operations", action: "read", description: "View operations hub queues and shipment details" },
  { resource: "operations", action: "update", description: "Update operations shipment statuses and tasks" },
  { resource: "operations", action: "assign", description: "Assign or reassign operations shipments" },
  { resource: "operations", action: "message-client", description: "Send client-facing operations messages" },
  { resource: "operations", action: "financial-breakdown", description: "View internal operations financial breakdown" },
  { resource: "operations", action: "special-handling", description: "Create and manage special handling requests" },
  { resource: "operations", action: "attention", description: "Manage operations attention flags" },

  // Notifications
  { resource: "notifications", action: "read", description: "View in-app notifications" },
  { resource: "notifications", action: "update", description: "Mark notifications as read" },

  // Tasks (internal-only collaboration)
  { resource: "tasks", action: "read", description: "View internal tasks" },
  { resource: "tasks", action: "create", description: "Create internal tasks" },
  { resource: "tasks", action: "update", description: "Edit internal task details" },
  { resource: "tasks", action: "assign", description: "Assign or reassign internal tasks" },
  { resource: "tasks", action: "complete", description: "Complete assigned internal tasks" },
  { resource: "tasks", action: "reopen", description: "Reopen completed internal tasks" },
  { resource: "task-comments", action: "create", description: "Comment on internal tasks" },
  
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

  // Refund Requests
  { resource: "refund-requests", action: "read", description: "View shipment refund requests" },
  { resource: "refund-requests", action: "approve-account-manager", description: "Approve shipment refunds as the assigned account manager" },
  { resource: "refund-requests", action: "approve-finance", description: "Approve shipment refunds as finance or super admin" },
  
  // Applications
  { resource: "applications", action: "read", description: "View client applications" },
  { resource: "applications", action: "approve", description: "Approve client applications" },
  { resource: "applications", action: "reject", description: "Reject client applications" },

  // Credit Requests
  { resource: "credit-requests", action: "read", description: "View credit access requests" },
  { resource: "credit-requests", action: "approve", description: "Approve credit access requests" },
  { resource: "credit-requests", action: "reject", description: "Reject credit access requests" },
  { resource: "credit-requests", action: "revoke", description: "Revoke approved credit access" },
  { resource: "sales-feature-requests", action: "read", description: "View Sales Channels feature requests" },
  { resource: "sales-feature-requests", action: "approve", description: "Approve Sales Channels feature access" },
  { resource: "sales-feature-requests", action: "reject", description: "Reject Sales Channels feature requests" },
  { resource: "sales-feature-requests", action: "revoke", description: "Revoke Sales Channels feature access" },

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

async function ensureInternalDepartmentBootstrap() {
  for (const seed of DEFAULT_INTERNAL_DEPARTMENTS) {
    const existingDepartments = await storage.getDepartments();
    const existing =
      existingDepartments.find((department) => department.slug === seed.slug) ||
      existingDepartments.find((department) => department.name.toLowerCase() === seed.name.toLowerCase());

    if (!existing) {
      try {
        await storage.createDepartment(seed);
      } catch (error) {
        const current = await storage.getDepartmentBySlug(seed.slug);
        if (!current) {
          throw error;
        }
      }
      continue;
    }

    await storage.updateDepartment(existing.id, {
      name: seed.name,
      slug: seed.slug,
      description: seed.description,
      iconKey: seed.iconKey,
      colorKey: seed.colorKey,
      sortOrder: seed.sortOrder,
      isSystem: seed.isSystem,
    });
  }
}

async function ensureUserIdentityBootstrap() {
  const userGroups = await Promise.all([
    storage.getUsersByUserType("admin"),
    storage.getUsersByUserType("operations"),
    storage.getUsersByUserType("client"),
  ]);

  for (const user of userGroups.flat()) {
    if (user.fullName?.trim()) {
      continue;
    }

    const fallbackName = user.username || user.email.split("@")[0] || "User";
    await storage.updateUser(user.id, {
      fullName: fallbackName,
      updatedAt: new Date(),
    });
  }
}

function uniquePermissionNames(permissionNames: string[]) {
  return Array.from(new Set(permissionNames.filter(Boolean)));
}

function getSeededPermissionNames(
  departmentSlug: string,
  hierarchyLevel: RoleHierarchyLevelValue,
  allPermissionNames: string[],
): string[] {
  // Tasks are an internal-only collaboration surface available to every internal
  // role in v1, so grant the task permission family on top of role-specific access.
  const base = getBaseSeededPermissionNames(departmentSlug, hierarchyLevel, allPermissionNames);
  const taskPermissionNames = TASK_PERMISSION_NAMES.filter((name) => allPermissionNames.includes(name));
  return uniquePermissionNames([...base, ...taskPermissionNames]);
}

function getBaseSeededPermissionNames(
  departmentSlug: string,
  hierarchyLevel: RoleHierarchyLevelValue,
  allPermissionNames: string[],
): string[] {
  const has = (permissionName: string) => allPermissionNames.includes(permissionName);
  const pick = (...permissionNames: string[]) => permissionNames.filter(has);

  if (departmentSlug === InternalDepartmentSlug.PLATFORM) {
    return allPermissionNames;
  }

  if (departmentSlug === InternalDepartmentSlug.OPERATIONS) {
    if (hierarchyLevel === RoleHierarchyLevel.MANAGER) {
      return uniquePermissionNames(
        pick(
          "dashboard:read",
          "operations:read",
          "operations:update",
          "operations:assign",
          "operations:message-client",
          "operations:financial-breakdown",
          "operations:special-handling",
          "operations:attention",
          "notifications:read",
          "notifications:update",
          "shipments:read",
          "shipments:update",
          "shipments:track",
          "shipments:cancel",
          "clients:read",
          "invoices:read",
          "payments:read",
          "pricing-rules:read",
        ),
      );
    }

    if (hierarchyLevel === RoleHierarchyLevel.TEAM_LEAD) {
      return uniquePermissionNames(
        pick(
          "dashboard:read",
          "operations:read",
          "operations:update",
          "operations:assign",
          "operations:message-client",
          "operations:special-handling",
          "operations:attention",
          "notifications:read",
          "notifications:update",
          "shipments:read",
          "shipments:update",
          "shipments:track",
          "clients:read",
          "invoices:read",
        ),
      );
    }

    if (hierarchyLevel === RoleHierarchyLevel.SPECIALIST) {
      return uniquePermissionNames(
        pick(
          "dashboard:read",
          "operations:read",
          "operations:update",
          "operations:message-client",
          "operations:special-handling",
          "operations:attention",
          "notifications:read",
          "notifications:update",
          "shipments:read",
          "shipments:track",
          "clients:read",
          "invoices:read",
        ),
      );
    }

    return uniquePermissionNames(
      pick(
        "dashboard:read",
        "operations:read",
        "operations:update",
        "operations:message-client",
        "notifications:read",
        "notifications:update",
        "shipments:read",
        "shipments:track",
        "clients:read",
      ),
    );
  }

  if (departmentSlug === InternalDepartmentSlug.FINANCE) {
    if (hierarchyLevel === RoleHierarchyLevel.MANAGER) {
      return uniquePermissionNames(
        pick(
          "dashboard:read",
          "clients:read",
          "invoices:create",
          "invoices:read",
          "invoices:update",
          "invoices:download",
          "invoices:sync",
          "payments:read",
          "payments:create",
          "payments:refund",
          "refund-requests:read",
          "refund-requests:approve-finance",
          "credit-requests:read",
          "credit-requests:approve",
          "credit-requests:reject",
          "credit-requests:revoke",
          "sales-feature-requests:read",
          "sales-feature-requests:approve",
          "sales-feature-requests:reject",
          "sales-feature-requests:revoke",
          "credit-invoices:read",
          "credit-invoices:update",
          "credit-invoices:cancel",
          "pricing-rules:read",
        ),
      );
    }

    if (hierarchyLevel === RoleHierarchyLevel.TEAM_LEAD) {
      return uniquePermissionNames(
        pick(
          "dashboard:read",
          "clients:read",
          "invoices:read",
          "invoices:update",
          "invoices:download",
          "payments:read",
          "refund-requests:read",
          "refund-requests:approve-finance",
          "credit-requests:read",
          "credit-requests:approve",
          "credit-requests:reject",
          "sales-feature-requests:read",
          "sales-feature-requests:approve",
          "sales-feature-requests:reject",
          "credit-invoices:read",
          "credit-invoices:update",
          "pricing-rules:read",
        ),
      );
    }

    if (hierarchyLevel === RoleHierarchyLevel.SPECIALIST) {
      return uniquePermissionNames(
        pick(
          "dashboard:read",
          "clients:read",
          "invoices:read",
          "invoices:update",
          "invoices:download",
          "payments:read",
          "refund-requests:read",
          "credit-requests:read",
          "sales-feature-requests:read",
          "credit-invoices:read",
          "credit-invoices:update",
        ),
      );
    }

    return uniquePermissionNames(
      pick(
        "dashboard:read",
        "invoices:read",
        "invoices:download",
        "payments:read",
        "credit-invoices:read",
      ),
    );
  }

  if (departmentSlug === InternalDepartmentSlug.ACCOUNT_MANAGEMENT) {
    const basePermissionNames = uniquePermissionNames(
      pick(...ACCOUNT_MANAGER_FIXED_PERMISSION_NAMES),
    );

    if (hierarchyLevel === RoleHierarchyLevel.MANAGER) {
      return uniquePermissionNames([
        ...basePermissionNames,
        ...pick(
          "account-managers:read",
          "account-managers:assign",
          "account-manager-requests:read",
          "account-manager-requests:approve",
          "account-manager-requests:reject",
        ),
      ]);
    }

    if (hierarchyLevel === RoleHierarchyLevel.TEAM_LEAD) {
      return uniquePermissionNames([
        ...basePermissionNames,
        ...pick(
          "account-managers:read",
          "account-manager-requests:read",
          "account-manager-requests:approve",
          "account-manager-requests:reject",
        ),
      ]);
    }

    if (hierarchyLevel === RoleHierarchyLevel.SPECIALIST) {
      return uniquePermissionNames([
        ...basePermissionNames,
        ...pick("account-managers:read", "account-manager-requests:read"),
      ]);
    }

    return basePermissionNames;
  }

  const commonManager = uniquePermissionNames(
    pick(
      "dashboard:read",
      "clients:create",
      "clients:read",
      "clients:update",
      "clients:activate",
      "shipments:create",
      "shipments:read",
      "shipments:update",
      "shipments:track",
      "invoices:read",
      "payments:read",
      "pricing-rules:read",
      "applications:read",
      "notifications:read",
      "notifications:update",
    ),
  );

  if (hierarchyLevel === RoleHierarchyLevel.MANAGER) {
    return commonManager;
  }

  if (hierarchyLevel === RoleHierarchyLevel.TEAM_LEAD) {
    return uniquePermissionNames(
      pick(
        "dashboard:read",
        "clients:read",
        "clients:update",
        "shipments:create",
        "shipments:read",
        "shipments:update",
        "shipments:track",
        "invoices:read",
        "pricing-rules:read",
        "applications:read",
        "notifications:read",
        "notifications:update",
      ),
    );
  }

  if (hierarchyLevel === RoleHierarchyLevel.SPECIALIST) {
    return uniquePermissionNames(
      pick(
        "dashboard:read",
        "clients:read",
        "clients:update",
        "shipments:create",
        "shipments:read",
        "shipments:track",
        "invoices:read",
        "applications:read",
        "notifications:read",
        "notifications:update",
      ),
    );
  }

  return uniquePermissionNames(
    pick(
      "dashboard:read",
      "clients:read",
      "shipments:create",
      "shipments:read",
      "shipments:track",
      "notifications:read",
      "notifications:update",
    ),
  );
}

async function ensureSuperAdminBootstrap() {
  try {
    const [allPermissions, allRoles, departments] = await Promise.all([
      storage.getPermissions(),
      storage.getRoles(),
      storage.getDepartments(),
    ]);
    const platformDepartment = departments.find((department) => department.slug === InternalDepartmentSlug.PLATFORM);
    if (!platformDepartment) {
      throw new Error("Platform department missing during bootstrap");
    }

    let adminRole =
      allRoles.find((role) => role.name === "Admin") ||
      allRoles.find((role) => role.name === "super_admin");

    if (!adminRole) {
      adminRole = await storage.createRole({
        name: "Admin",
        description: "Platform administration and full system access",
        departmentId: platformDepartment.id,
        hierarchyLevel: RoleHierarchyLevel.PLATFORM_ADMIN,
        sortOrder: HIERARCHY_LEVEL_SORT_ORDER[RoleHierarchyLevel.PLATFORM_ADMIN],
        isSystem: true,
        isActive: true,
      });
    } else {
      adminRole =
        (await storage.updateRole(adminRole.id, {
          name: "Admin",
          description: "Platform administration and full system access",
          departmentId: platformDepartment.id,
          hierarchyLevel: RoleHierarchyLevel.PLATFORM_ADMIN,
          sortOrder: HIERARCHY_LEVEL_SORT_ORDER[RoleHierarchyLevel.PLATFORM_ADMIN],
          isSystem: true,
          isActive: true,
        })) || adminRole;
    }

    await syncRolePermissions(adminRole.id, allPermissions.map((permission) => permission.id));

    const adminUsers = await storage.getUsersByUserType("admin");
    const adminRoleAssignments = await Promise.all(
      adminUsers.map(async (adminUser) => ({
        user: adminUser,
        roles: await storage.getUserRoles(adminUser.id),
      })),
    );

    for (const assignment of adminRoleAssignments) {
      if (assignment.roles.length === 0) {
        await storage.assignUserRole({
          userId: assignment.user.id,
          roleId: adminRole.id,
        });
      }
    }
  } catch (error) {
    logError("Error bootstrapping super admin role", error);
  }
}

async function ensureHierarchicalRoleBootstrap() {
  try {
    const [departments, allPermissions, existingRoles] = await Promise.all([
      storage.getDepartments(),
      storage.getPermissions(),
      storage.getRoles(),
    ]);
    const departmentBySlug = new Map(departments.map((department) => [department.slug, department]));
    const allPermissionNames = allPermissions.map((permission) => permission.name);
    const permissionByName = new Map(allPermissions.map((permission) => [permission.name, permission]));

    const roleConfigs: Array<{
      departmentSlug: string;
      name: string;
      legacyNames?: readonly string[];
      hierarchyLevel: RoleHierarchyLevelValue;
      description: string;
    }> = [
      {
        departmentSlug: InternalDepartmentSlug.OPERATIONS,
        name: OPERATION_ROLE_NAMES.manager,
        legacyNames: ["operations_director"],
        hierarchyLevel: RoleHierarchyLevel.MANAGER,
        description: "Full operational oversight across shipment queues, assignment, and escalation.",
      },
      {
        departmentSlug: InternalDepartmentSlug.OPERATIONS,
        name: OPERATION_ROLE_NAMES.teamLead,
        legacyNames: ["operations_manager"],
        hierarchyLevel: RoleHierarchyLevel.TEAM_LEAD,
        description: "Manages operations workload, assignment, and escalation across their team.",
      },
      {
        departmentSlug: InternalDepartmentSlug.OPERATIONS,
        name: OPERATION_ROLE_NAMES.specialist,
        legacyNames: ["operations_lead"],
        hierarchyLevel: RoleHierarchyLevel.SPECIALIST,
        description: "Handles day-to-day shipment execution, updates, and coordination.",
      },
      {
        departmentSlug: InternalDepartmentSlug.OPERATIONS,
        name: OPERATION_ROLE_NAMES.agent,
        legacyNames: ["operations_agent"],
        hierarchyLevel: RoleHierarchyLevel.AGENT,
        description: "Supports assigned shipments with limited operational actions.",
      },
      {
        departmentSlug: InternalDepartmentSlug.SALES,
        name: "Sales Manager",
        hierarchyLevel: RoleHierarchyLevel.MANAGER,
        description: "Owns sales performance, client relationships, and commercial decisions.",
      },
      {
        departmentSlug: InternalDepartmentSlug.SALES,
        name: "Sales Team Lead",
        hierarchyLevel: RoleHierarchyLevel.TEAM_LEAD,
        description: "Leads sales execution, team coordination, and pipeline follow-up.",
      },
      {
        departmentSlug: InternalDepartmentSlug.SALES,
        name: "Sales Specialist",
        hierarchyLevel: RoleHierarchyLevel.SPECIALIST,
        description: "Manages day-to-day commercial follow-up and client coordination.",
      },
      {
        departmentSlug: InternalDepartmentSlug.SALES,
        name: "Sales Agent",
        hierarchyLevel: RoleHierarchyLevel.AGENT,
        description: "Handles assigned outreach and shipment request support.",
      },
      {
        departmentSlug: InternalDepartmentSlug.CUSTOMER_SERVICE,
        name: "Customer Service Manager",
        hierarchyLevel: RoleHierarchyLevel.MANAGER,
        description: "Owns support quality, escalations, and service operations.",
      },
      {
        departmentSlug: InternalDepartmentSlug.CUSTOMER_SERVICE,
        name: "Customer Service Team Lead",
        hierarchyLevel: RoleHierarchyLevel.TEAM_LEAD,
        description: "Leads support queue handling and team coordination.",
      },
      {
        departmentSlug: InternalDepartmentSlug.CUSTOMER_SERVICE,
        name: "Customer Service Officer",
        hierarchyLevel: RoleHierarchyLevel.SPECIALIST,
        description: "Resolves customer cases, shipment updates, and service issues.",
      },
      {
        departmentSlug: InternalDepartmentSlug.CUSTOMER_SERVICE,
        name: "Customer Service Agent",
        hierarchyLevel: RoleHierarchyLevel.AGENT,
        description: "Provides first-line support and shipment follow-up.",
      },
      {
        departmentSlug: InternalDepartmentSlug.MARKETING,
        name: "Marketing Manager",
        hierarchyLevel: RoleHierarchyLevel.MANAGER,
        description: "Owns campaign direction, reporting, and market coordination.",
      },
      {
        departmentSlug: InternalDepartmentSlug.MARKETING,
        name: "Marketing Team Lead",
        hierarchyLevel: RoleHierarchyLevel.TEAM_LEAD,
        description: "Coordinates marketing execution and channel planning.",
      },
      {
        departmentSlug: InternalDepartmentSlug.MARKETING,
        name: "Marketing Specialist",
        hierarchyLevel: RoleHierarchyLevel.SPECIALIST,
        description: "Runs day-to-day campaigns, content, and reporting support.",
      },
      {
        departmentSlug: InternalDepartmentSlug.MARKETING,
        name: "Marketing Agent",
        hierarchyLevel: RoleHierarchyLevel.AGENT,
        description: "Supports assigned marketing tasks and campaign operations.",
      },
      {
        departmentSlug: InternalDepartmentSlug.FINANCE,
        name: "Finance Manager",
        hierarchyLevel: RoleHierarchyLevel.MANAGER,
        description: "Owns finance controls, payment approvals, and financial operations.",
      },
      {
        departmentSlug: InternalDepartmentSlug.FINANCE,
        name: "Finance Team Lead",
        hierarchyLevel: RoleHierarchyLevel.TEAM_LEAD,
        description: "Coordinates invoice, refund, and credit review workflows.",
      },
      {
        departmentSlug: InternalDepartmentSlug.FINANCE,
        name: "Finance Officer",
        hierarchyLevel: RoleHierarchyLevel.SPECIALIST,
        description: "Executes invoice, payment, and reconciliation tasks.",
      },
      {
        departmentSlug: InternalDepartmentSlug.FINANCE,
        name: "Finance Agent",
        hierarchyLevel: RoleHierarchyLevel.AGENT,
        description: "Handles assigned finance records and document follow-up.",
      },
      {
        departmentSlug: InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
        name: "Account Management Manager",
        hierarchyLevel: RoleHierarchyLevel.MANAGER,
        description: "Owns assigned client portfolios, approvals, and account-care processes.",
      },
      {
        departmentSlug: InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
        name: "Account Management Team Lead",
        hierarchyLevel: RoleHierarchyLevel.TEAM_LEAD,
        description: "Leads account management execution and request handling.",
      },
      {
        departmentSlug: InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
        name: "Account Management Officer",
        hierarchyLevel: RoleHierarchyLevel.SPECIALIST,
        description: "Manages assigned client updates and portfolio workflows.",
      },
      {
        departmentSlug: InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
        name: "Account Management Agent",
        hierarchyLevel: RoleHierarchyLevel.AGENT,
        description: "Supports assigned client follow-up and change coordination.",
      },
    ];

    for (const config of roleConfigs) {
      const department = departmentBySlug.get(config.departmentSlug);
      if (!department) {
        continue;
      }

      let role =
        existingRoles.find((candidate) => candidate.departmentId === department.id && candidate.name === config.name) ||
        existingRoles.find((candidate) => candidate.name === config.name) ||
        config.legacyNames?.map((legacyName) => existingRoles.find((candidate) => candidate.name === legacyName)).find(Boolean);

      const permissionIds = getSeededPermissionNames(
        config.departmentSlug,
        config.hierarchyLevel,
        allPermissionNames,
      )
        .map((permissionName) => permissionByName.get(permissionName)?.id)
        .filter(Boolean) as string[];

      const roleUpdates = {
        name: config.name,
        description: config.description,
        departmentId: department.id,
        hierarchyLevel: config.hierarchyLevel,
        sortOrder: HIERARCHY_LEVEL_SORT_ORDER[config.hierarchyLevel],
        isSystem: true,
        isActive: true,
      };

      if (!role) {
        role = await storage.createRole(roleUpdates);
        existingRoles.push(role);
      } else {
        role = (await storage.updateRole(role.id, roleUpdates)) || role;
      }

      await syncRolePermissions(role.id, permissionIds);
    }
  } catch (error) {
    logError("Error bootstrapping hierarchical roles", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed default permissions on startup
  await seedDefaultPermissions();
  await ensureUserIdentityBootstrap();
  await ensureInternalDepartmentBootstrap();
  await ensureSuperAdminBootstrap();
  await ensureHierarchicalRoleBootstrap();
  
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
          // NOTE: 'unsafe-inline' is retained pending CSP hardening (M3).
          // Tightening this needs the Tap payment checkout verified against the
          // strict policy, which requires a staging/prod browser test first.
          scriptSrc: ["'self'", "'unsafe-inline'", "https://tap-sdks.b-cdn.net"],
          connectSrc: ["'self'", "https:"],
          frameSrc: ["'self'", "https://*.tap.company", "https://tap-sdks.b-cdn.net"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
    })
  );

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

  // General rate limiting
  // Apply this after session middleware so authenticated users are rate-limited individually
  // instead of multiple operators/admins sharing one IP bucket.
  app.use("/api/", generalLimiter);

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
  // NOTIFICATIONS
  // ============================================
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      res.json(await listNotificationsForUser(req.session.userId!));
    } catch (error) {
      logError("Failed to fetch notifications", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      res.json({ count: await getUnreadNotificationCount(req.session.userId!) });
    } catch (error) {
      logError("Failed to fetch notification count", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await markNotificationRead(req.session.userId!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      logError("Failed to mark notification read", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await markAllNotificationsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      logError("Failed to mark notifications read", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // TASKS (internal-only collaboration)
  // ============================================
  const taskAttachmentInputSchema = z.object({
    objectPath: z.string().min(1),
    fileName: z.string().min(1).max(500),
    contentType: z.string().max(255).nullish(),
    sizeBytes: z.number().int().nonnegative().nullish(),
  });

  const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

  const createTaskBodySchema = z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(20000).nullish(),
    assignedToUserId: z.string().min(1),
    deadlineAt: z.string().datetime().nullish(),
    priority: taskPrioritySchema.optional(),
    completionRecipientUserIds: z.array(z.string().min(1)).optional(),
    attachments: z.array(taskAttachmentInputSchema).max(20).optional(),
  });

  const updateTaskBodySchema = z.object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(20000).nullish(),
    assignedToUserId: z.string().min(1).optional(),
    deadlineAt: z.string().datetime().nullish(),
    priority: taskPrioritySchema.optional(),
    completionRecipientUserIds: z.array(z.string().min(1)).optional(),
    attachments: z.array(taskAttachmentInputSchema).max(20).optional(),
  });

  const createCommentBodySchema = z.object({
    body: z.string().trim().min(1).max(10000),
    parentCommentId: z.string().min(1).nullish(),
  });

  const TASK_VIEW_KEYS = new Set(["all", "my", "assigned_by_me", "completed", "overdue"]);

  function handleTaskError(res: Response, error: unknown, context: string) {
    if (error instanceof TaskPermissionError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof TaskStateError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.flatten() });
    }
    logError(context, error);
    return res.status(500).json({ error: "Internal server error" });
  }

  function parseOptionalDate(value: unknown): Date | undefined {
    if (typeof value !== "string" || !value.trim()) {
      return undefined;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  app.get("/api/tasks/summary", requireTaskPermission("tasks:read"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      res.json(await getTaskSummary(user));
    } catch (error) {
      handleTaskError(res, error, "Failed to fetch task summary");
    }
  });

  app.get("/api/tasks/users", requireTaskPermission("tasks:read"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      res.json(await getTaskUsers());
    } catch (error) {
      handleTaskError(res, error, "Failed to fetch task users");
    }
  });

  app.get("/api/tasks", requireTaskPermission("tasks:read"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;

      const viewParam = typeof req.query.view === "string" && TASK_VIEW_KEYS.has(req.query.view)
        ? (req.query.view as TaskViewKey)
        : "all";
      const sortParam = typeof req.query.sort === "string" ? req.query.sort : undefined;
      const deadlinePreset = typeof req.query.deadlinePreset === "string" ? req.query.deadlinePreset : undefined;

      const filters: TaskListFilters = {
        view: viewParam,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        assigneeId: typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined,
        creatorId: typeof req.query.creatorId === "string" ? req.query.creatorId : undefined,
        status:
          req.query.status === "PENDING" || req.query.status === "COMPLETED"
            ? (req.query.status as TaskListFilters["status"])
            : undefined,
        priority:
          typeof req.query.priority === "string" && ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(req.query.priority)
            ? (req.query.priority as TaskListFilters["priority"])
            : undefined,
        deadlinePreset:
          deadlinePreset === "overdue" || deadlinePreset === "today" || deadlinePreset === "week" || deadlinePreset === "none"
            ? deadlinePreset
            : undefined,
        createdFrom: parseOptionalDate(req.query.createdFrom),
        createdTo: parseOptionalDate(req.query.createdTo),
        page: req.query.page ? Math.max(1, Number(req.query.page)) : undefined,
        pageSize: req.query.pageSize ? Math.max(1, Math.min(100, Number(req.query.pageSize))) : undefined,
        sort:
          sortParam === "deadline" || sortParam === "created" || sortParam === "priority" || sortParam === "activity"
            ? sortParam
            : undefined,
      };

      res.json(await listTasks(user, filters));
    } catch (error) {
      handleTaskError(res, error, "Failed to list tasks");
    }
  });

  app.post("/api/tasks", requireTaskPermission("tasks:create"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      const body = createTaskBodySchema.parse(req.body);

      const created = await createTask(user, {
        title: body.title,
        description: body.description ?? null,
        assignedToUserId: body.assignedToUserId,
        deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : null,
        priority: body.priority,
        completionRecipientUserIds: body.completionRecipientUserIds,
        attachments: body.attachments,
      });

      const detail = await getTaskDetail(created.id, user);
      res.status(201).json(detail);
    } catch (error) {
      handleTaskError(res, error, "Failed to create task");
    }
  });

  app.get("/api/tasks/:id", requireTaskPermission("tasks:read"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      const detail = await getTaskDetail(req.params.id, user);
      if (!detail) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(detail);
    } catch (error) {
      handleTaskError(res, error, "Failed to fetch task");
    }
  });

  app.patch("/api/tasks/:id", requireTaskPermission("tasks:update"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      const body = updateTaskBodySchema.parse(req.body);

      const updated = await updateTask(user, req.params.id, {
        title: body.title,
        description: body.description === undefined ? undefined : body.description ?? null,
        assignedToUserId: body.assignedToUserId,
        deadlineAt: body.deadlineAt === undefined ? undefined : body.deadlineAt ? new Date(body.deadlineAt) : null,
        priority: body.priority,
        completionRecipientUserIds: body.completionRecipientUserIds,
        attachments: body.attachments,
      });
      if (!updated) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(await getTaskDetail(updated.id, user));
    } catch (error) {
      handleTaskError(res, error, "Failed to update task");
    }
  });

  app.post("/api/tasks/:id/complete", requireTaskPermission("tasks:complete"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      const updated = await completeTask(user, req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(await getTaskDetail(updated.id, user));
    } catch (error) {
      handleTaskError(res, error, "Failed to complete task");
    }
  });

  app.post("/api/tasks/:id/reopen", requireTaskPermission("tasks:reopen"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      const updated = await reopenTask(user, req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(await getTaskDetail(updated.id, user));
    } catch (error) {
      handleTaskError(res, error, "Failed to reopen task");
    }
  });

  app.post("/api/tasks/:id/comments", requireTaskPermission("task-comments:create"), async (req, res) => {
    try {
      const user = await ensureInternalUser(req, res);
      if (!user) return;
      const body = createCommentBodySchema.parse(req.body);
      const comment = await addTaskComment(user, req.params.id, body.body, body.parentCommentId ?? null);
      if (!comment) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.status(201).json(await getTaskDetail(req.params.id, user));
    } catch (error) {
      handleTaskError(res, error, "Failed to add task comment");
    }
  });

  // ============================================
  // OPERATIONS HUB
  // ============================================
  app.get("/api/operations/me/access", requireOperationsPermission("operations", "read"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;

      const [permissionNames, roleNames, scope, canViewFinancialBreakdown] = await Promise.all([
        getEffectiveOperationsPermissionNames(user),
        getOperationRoleNames(user.id),
        getOperationViewerScope(user),
        canViewOperationFinancialBreakdown(user),
      ]);

      res.json({
        userType: user.userType,
        scope,
        roleNames,
        permissions: permissionNames,
        canViewFinancialBreakdown,
      });
    } catch (error) {
      logError("Failed to fetch operations access", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/operations/summary", requireOperationsPermission("operations", "read"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      res.json(await getOperationSummary(user));
    } catch (error) {
      logError("Failed to fetch operations summary", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/operations/users", requireOperationsPermission("operations", "read"), async (_req, res) => {
    try {
      res.json(await getOperationsUsers());
    } catch (error) {
      logError("Failed to fetch operations users", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/operations/shipments", requireOperationsPermission("operations", "read"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const queue = typeof req.query.queue === "string" ? req.query.queue : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      // Number("abc") is NaN, and Math.max/min propagate it straight into SQL LIMIT — fall back
      // to the default instead of 500ing on a typo'd query string.
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 100;
      res.json(await listOperationShipments({ viewer: user, queue, search, limit }));
    } catch (error) {
      logError("Failed to fetch operations shipments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/operations/shipments/:id", requireOperationsPermission("operations", "read"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const detail = await getOperationShipmentDetail(req.params.id, user);
      if (!detail) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      res.json(detail);
    } catch (error) {
      logError("Failed to fetch operations shipment", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/operations/shipments/:id/status", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        status: z.string().trim().min(1).max(80),
        notifyClient: z.boolean().default(true),
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (visibleShipment.shipmentKind === OperationShipmentKind.DDP) {
        const transitionError = validateDdpStageTransition({
          shipment: visibleShipment,
          tasks: visibleShipment.operationTasks,
          nextStatus: parsed.status,
        });

        if (transitionError) {
          return res.status(400).json({ error: transitionError });
        }
      }

      const updated = await updateOperationShipmentStatus({
        shipmentId: req.params.id,
        status: parsed.status,
        actorUser: user,
        notifyClient: parsed.notifyClient,
      });
      res.json({ shipment: updated, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update operations shipment status", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/tasks/:taskId/complete", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const parsed = z.object({
        metadata: z.record(z.any()).optional(),
      }).parse(req.body || {});

      const task = await completeOperationTask({
        shipmentId: req.params.id,
        taskId: req.params.taskId,
        actorUser: user,
        metadata: parsed.metadata,
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json({ task, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof OperationInputError) {
        return res.status(400).json({ error: error.message });
      }
      logError("Failed to complete operations task", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Planning-stage editable plan notes
  app.patch("/api/operations/shipments/:id/plan", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({ notes: z.string().max(20000).default("") }).parse(req.body || {});
      await storage.updateShipment(req.params.id, { operationPlanNotes: parsed.notes });
      await createOperationEvent({
        shipmentId: req.params.id,
        actorUserId: user.id,
        eventType: "plan_updated",
        title: "Plan updated",
        description: "Planning notes were updated.",
      });
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update operations plan notes", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Estimated delivery date (ETA). For manually-managed Door To Door shipments ops set this by
  // hand; it lands on the same shipment.estimatedDelivery field the client portal reads for every
  // shipment type (express ETA comes from the carrier API, D2D from here).
  app.patch("/api/operations/shipments/:id/eta", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({
        // YYYY-MM-DD, or null/empty to clear the ETA.
        eta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ETA must be YYYY-MM-DD").nullable().optional(),
      }).parse(req.body || {});

      const etaDate = parsed.eta ? new Date(`${parsed.eta}T00:00:00.000Z`) : null;
      if (parsed.eta && Number.isNaN(etaDate!.getTime())) {
        return res.status(400).json({ error: "Invalid ETA date" });
      }

      await storage.updateShipment(req.params.id, { estimatedDelivery: etaDate });
      await createOperationEvent({
        shipmentId: req.params.id,
        actorUserId: user.id,
        eventType: "eta_updated",
        title: etaDate ? "ETA updated" : "ETA cleared",
        description: etaDate ? `Estimated delivery set to ${parsed.eta}.` : "Estimated delivery was cleared.",
      });
      await logAudit(
        user.id,
        "update_shipment_eta",
        "shipment",
        req.params.id,
        etaDate ? `Set ETA to ${parsed.eta}` : "Cleared ETA",
        req.ip,
      );
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update shipment ETA", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Last-mile delivery carrier + phone
  app.patch("/api/operations/shipments/:id/last-mile", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({
        carrierName: z.string().trim().max(200).default(""),
        carrierPhone: z.string().trim().max(60).default(""),
      }).parse(req.body || {});
      await storage.updateShipment(req.params.id, {
        lastMileCarrierName: parsed.carrierName || null,
        lastMileCarrierPhone: parsed.carrierPhone || null,
      });
      await createOperationEvent({
        shipmentId: req.params.id,
        actorUserId: user.id,
        eventType: "last_mile_updated",
        title: "Last-mile delivery updated",
        description: `Carrier: ${parsed.carrierName || "—"}${parsed.carrierPhone ? ` · ${parsed.carrierPhone}` : ""}`,
      });
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update last-mile delivery", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Edit a task's metadata after completion (e.g. received date)
  app.patch("/api/operations/shipments/:id/tasks/:taskId/metadata", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({ metadata: z.record(z.any()) }).parse(req.body || {});
      const task = visibleShipment.operationTasks.find((t) => t.id === req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      const updatedTask = await updateOperationTaskMetadata({
        shipmentId: req.params.id,
        taskId: req.params.taskId,
        metadata: parsed.metadata,
      });
      if (!updatedTask) {
        return res.status(404).json({ error: "Task not found" });
      }
      await createOperationEvent({
        shipmentId: req.params.id,
        actorUserId: user.id,
        eventType: "task_metadata_updated",
        title: `Updated ${task.title}`,
        description: "Task details were edited.",
      });
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update task metadata", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Tracking numbers (editable list)
  app.post("/api/operations/shipments/:id/tracking-numbers", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({ value: z.string().trim().min(1).max(200) }).parse(req.body || {});
      await storage.addShipmentTrackingNumber({ shipmentId: req.params.id, value: parsed.value, createdByUserId: user.id });
      await createOperationEvent({
        shipmentId: req.params.id,
        actorUserId: user.id,
        eventType: "tracking_number_added",
        title: "Tracking number added",
        description: parsed.value,
      });
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to add tracking number", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/operations/shipments/:id/tracking-numbers/:tnId", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({ value: z.string().trim().min(1).max(200) }).parse(req.body || {});
      const updated = await storage.updateShipmentTrackingNumber(req.params.tnId, parsed.value);
      if (!updated) {
        return res.status(404).json({ error: "Tracking number not found" });
      }
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update tracking number", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/operations/shipments/:id/tracking-numbers/:tnId", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      await storage.deleteShipmentTrackingNumber(req.params.tnId);
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      logError("Failed to delete tracking number", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Schedule / re-book a carrier pickup from the operations hub. Books with the carrier
  // immediately (non-fatal) and records the attempt in the audit trail.
  app.post("/api/operations/shipments/:id/pickup", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pickup date must be YYYY-MM-DD"),
        readyTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
        closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
        location: z.string().max(120).optional(),
        instructions: z.string().max(500).optional(),
      }).parse(req.body || {});

      const adapter = getAdapterForShipment(shipment);
      if (!adapter.supportsPickup || !adapter.requestPickup) {
        return res.status(400).json({ error: `${shipment.carrierName || shipment.carrierCode || "This carrier"} does not support API pickup booking.` });
      }

      // Replace the pickup preference and clear any prior confirmation so re-booking runs.
      const updated = (await storage.updateShipment(shipment.id, {
        pickupRequested: true,
        pickupStatus: "requested",
        pickupDate: parsed.date,
        pickupReadyTime: parsed.readyTime || "09:00",
        pickupCloseTime: parsed.closeTime || "17:00",
        pickupLocation: parsed.location ?? null,
        pickupInstructions: parsed.instructions ?? null,
        pickupConfirmationNumber: null,
        pickupError: null,
      })) || shipment;

      await logAudit(
        user.id,
        "pickup_scheduled",
        "shipment",
        shipment.id,
        `Pickup scheduled for ${parsed.date} (${parsed.readyTime || "09:00"}–${parsed.closeTime || "17:00"})${parsed.location ? ` at ${parsed.location}` : ""}`,
        req.ip,
      );

      await bookCarrierPickupIfRequested(updated, adapter, getIntegrationAppKeyForCarrier(adapter.carrierCode), user.id);

      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to schedule pickup", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Operational expenses (internal cost only)
  app.post("/api/operations/shipments/:id/expenses", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const parsed = z.object({
        description: z.string().trim().min(1).max(500),
        amountSar: z.coerce.number().positive().max(10000000),
      }).parse(req.body || {});
      const createdExpense = await storage.addShipmentExpense({
        shipmentId: req.params.id,
        description: parsed.description,
        amountSar: parsed.amountSar.toFixed(2),
        createdByUserId: user.id,
      });
      await createOperationEvent({
        shipmentId: req.params.id,
        actorUserId: user.id,
        eventType: "expense_added",
        title: "Expense recorded",
        description: `${parsed.description} · SAR ${parsed.amountSar.toFixed(2)}`,
      });
      const shipment = await storage.getShipment(req.params.id);
      if (shipment) {
        await syncShipmentExpenseToZoho(createdExpense.id, shipment, parsed.description, parsed.amountSar);
      }
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to add shipment expense", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/operations/shipments/:id/expenses/:expenseId", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const existingExpense = await storage.getShipmentExpense(req.params.expenseId);
      await storage.deleteShipmentExpense(req.params.expenseId);
      if (existingExpense?.zohoExpenseId) {
        const account = await storage.getClientAccount(visibleShipment.clientAccountId);
        if (account) {
          await withBoundIntegrationAccount("zoho", account.zohoIntegrationAccountId, getClientIntegrationRoutingOptions(account), async () => {
            if (zohoService.isConfigured()) await zohoService.deleteExpense(existingExpense.zohoExpenseId!);
          }).catch((error) => logError("Failed to delete Zoho expense", { error: error instanceof Error ? error.message : String(error) }));
        }
      }
      res.json({ detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      logError("Failed to delete shipment expense", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/notes", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        body: z.string().trim().min(1).max(4000),
        visibility: z.enum(["INTERNAL", "CLIENT"]).default("INTERNAL"),
        mentionUserIds: z.array(z.string().min(1)).default([]),
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const assignedUserIdSet = new Set((visibleShipment.assignedTeam || []).map((member) => member.userId));
      const invalidMentionIds = parsed.mentionUserIds.filter((userId) => !assignedUserIdSet.has(userId));
      if (invalidMentionIds.length > 0) {
        return res.status(400).json({ error: "You can only mention team members assigned to this shipment." });
      }

      const note = await createOperationNote({
        shipmentId: req.params.id,
        authorUser: user,
        body: parsed.body,
        visibility: parsed.visibility,
        mentionUserIds: parsed.mentionUserIds,
      });
      if (parsed.visibility === "CLIENT") {
        const shipment = await storage.getShipment(req.params.id);
        if (shipment) {
          const clientUsers = await storage.getUsersByClientAccount(shipment.clientAccountId);
          await Promise.all(
            clientUsers
              .filter((clientUser) => clientUser.isActive)
              .map((clientUser) =>
                notifyUser({
                  userId: clientUser.id,
                  title: "Shipment update from operations",
                  body: `${shipment.trackingNumber}: ${parsed.body}`,
                  type: "operations_client_message",
                  entityType: "shipment",
                  entityId: shipment.id,
                  actionUrl: `${process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002"}/client/shipments?shipmentId=${shipment.id}`,
                }),
              ),
          );
        }
      }
      res.status(201).json({ note, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to create operations note", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/client-message", requireOperationsPermission("operations", "message-client"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        message: z.string().trim().min(1).max(2000),
        template: z.string().trim().max(80).optional(),
        channel: z.enum(["whatsapp", "sms", "in_app", "email"]).default("email"),
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const note = await createOperationNote({
        shipmentId: req.params.id,
        authorUser: user,
        body: parsed.message,
        visibility: "CLIENT",
        mentionUserIds: [],
      });

      const shipment = await storage.getShipment(req.params.id);
      let deliveryStatus: "sent" | "not_configured" | "logged_only" = "logged_only";
      let deliveryMessage = "The shipment timeline was updated with the client message.";
      if (shipment) {
        const [clientUsers, clientAccount] = await Promise.all([
          storage.getUsersByClientAccount(shipment.clientAccountId),
          storage.getClientAccount(shipment.clientAccountId),
        ]);
        const activeClientUsers = clientUsers.filter((clientUser) => clientUser.isActive);
        const actionUrl = `${process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002"}/client/shipments?shipmentId=${shipment.id}`;
        await Promise.all(
          activeClientUsers
            .map((clientUser) =>
              notifyUser({
                userId: clientUser.id,
                title: "Shipment update from operations",
                body: `${shipment.trackingNumber}: ${parsed.message}`,
                type: `operations_${parsed.channel}_message`,
                entityType: "shipment",
                entityId: shipment.id,
                actionUrl,
                sendEmail: false,
              }),
            ),
        );

        if (parsed.channel === "email") {
          const recipientEmails = Array.from(
            new Set(
              [
                ...activeClientUsers.map((clientUser) => clientUser.email?.trim().toLowerCase() || ""),
                clientAccount?.email?.trim().toLowerCase() || "",
              ].filter(Boolean),
            ),
          );

          if (recipientEmails.length === 0) {
            deliveryStatus = "not_configured";
            deliveryMessage = "Email is not configured for this client yet. The update was still saved to the shipment timeline.";
          } else {
            const safeMessage = sanitizeHtml(parsed.message, { allowedTags: [], allowedAttributes: {} }).replace(/\n/g, "<br />");
            const rendered = await getRenderedTemplate("operations_shipment_update", {
              tracking_number: shipment.trackingNumber,
              message: safeMessage,
              action_url: actionUrl,
              year: new Date().getFullYear().toString(),
            });
            const emailResults = rendered
              ? await Promise.all(
                  recipientEmails.map((email) =>
                    sendEmail({
                      to: email,
                      subject: rendered.subject,
                      html: rendered.html,
                    }),
                  ),
                )
              : [];

            if (emailResults.some(Boolean)) {
              deliveryStatus = "sent";
              deliveryMessage = "The email update was sent to the client and saved to the shipment timeline.";
            } else {
              deliveryStatus = "not_configured";
              deliveryMessage = "Email sending is not configured yet. The update was still saved to the shipment timeline.";
            }
          }
        } else if (parsed.channel === "whatsapp") {
          deliveryStatus = "not_configured";
          deliveryMessage = "WhatsApp is not configured yet. The update was saved to the shipment timeline so the team can still track it.";
        } else if (parsed.channel === "sms") {
          deliveryStatus = "not_configured";
          deliveryMessage = "SMS is not configured yet. The update was saved to the shipment timeline so the team can still track it.";
        }
      }

      res.status(201).json({
        note,
        channel: parsed.channel,
        template: parsed.template || null,
        deliveryStatus,
        deliveryMessage,
        detail: await getOperationShipmentDetail(req.params.id, user),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to send operations client message", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/charges/extra-weight/preview", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        targetMeasuredQuantity: z.coerce.number().nonnegative("Enter a valid shipment quantity.").max(100000),
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (shipment.fulfillmentType !== "ddp_manual") {
        return res.status(400).json({ error: "Extra weight charges can only be updated on Door To Door Freight shipments." });
      }

      const quote = await buildDdpExtraWeightAdjustmentQuote({
        shipment,
        targetMeasuredQuantity: parsed.targetMeasuredQuantity,
      });

      res.json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to preview DDP extra weight adjustment from operations", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/charges/extra-weight", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        additionalQuantity: z.coerce.number().positive("Enter a valid additional quantity.").max(100000).optional(),
        targetMeasuredQuantity: z.coerce.number().nonnegative("Enter a valid shipment quantity.").max(100000).optional(),
        notes: z.string().trim().max(1000).optional(),
      }).refine(
        (value) => value.additionalQuantity !== undefined || value.targetMeasuredQuantity !== undefined,
        "Enter the updated shipment quantity or an additional quantity.",
      ).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (shipment.fulfillmentType !== "ddp_manual") {
        return res.status(400).json({ error: "Extra weight charges can only be added to Door To Door Freight shipments." });
      }

      const preview = await buildDdpExtraWeightAdjustmentQuote({
        shipment,
        targetMeasuredQuantity:
          parsed.targetMeasuredQuantity ??
          roundQuantity(
            (shipment.ddpBillingUnit === "CBM"
              ? Number(
                  parseJsonObject(shipment.chargeableWeightDetails)?.totalCbm ??
                    shipment.ddpTotalCbm ??
                    shipment.ddpBillableQuantity ??
                    shipment.chargeableWeight,
                ) || 0
              : Number(
                  parseJsonObject(shipment.chargeableWeightDetails)?.rawBillableQuantity ??
                    shipment.ddpBillableQuantity ??
                    shipment.chargeableWeight ??
                    shipment.weight,
                ) || 0) +
              parseMoneyValue(shipment.extraFeesWeightValue) +
              (parsed.additionalQuantity || 0),
          ),
      });

      let nextExtraFeesType: string | null = null;
      if (preview.targetExtraWeightAmountSar > 0 && parseMoneyValue(shipment.extraFeesCostAmountSar) > 0) {
        nextExtraFeesType = ShipmentExtraFeeType.COMBINED;
      } else if (preview.targetExtraWeightAmountSar > 0) {
        nextExtraFeesType = ShipmentExtraFeeType.EXTRA_WEIGHT;
      } else if (parseMoneyValue(shipment.extraFeesCostAmountSar) > 0) {
        nextExtraFeesType = ShipmentExtraFeeType.EXTRA_COST;
      }

      await storage.updateShipment(shipment.id, {
        extraFeesAmountSar:
          preview.targetTotalExtraFeesAmountSar > 0
            ? formatMoney(preview.targetTotalExtraFeesAmountSar)
            : null,
        extraFeesType: nextExtraFeesType,
        extraFeesWeightValue:
          preview.targetExtraWeightQuantity > 0
            ? formatMoney(preview.targetExtraWeightQuantity)
            : null,
        extraFeesAddedAt: preview.targetExtraWeightAmountSar > 0 ? new Date() : null,
        extraFeesEmailSentAt: null,
      });

      const refreshedShipment = (await storage.getShipment(shipment.id)) || shipment;
      const syncedExtraFeeInvoices = await syncShipmentExtraFeeInvoices(refreshedShipment);
      const weightInvoice = syncedExtraFeeInvoices[InvoiceType.EXTRA_WEIGHT];
      const client = await storage.getClientAccount(shipment.clientAccountId);

      if (refreshedShipment && client?.email && weightInvoice?.status === "pending") {
        try {
          const emailSent = await sendShipmentExtraFeesNotification({
            email: client.email,
            clientName: client.name,
            trackingNumber: shipment.trackingNumber,
            amountSar: formatMoney(parseMoneyValue(weightInvoice.amount)),
            extraFeeType: InvoiceType.EXTRA_WEIGHT,
            extraWeightValue: formatMoney(preview.targetExtraWeightQuantity),
            weightUnit: preview.billingUnit,
            extraCostAmountSar: null,
            invoiceNumber: weightInvoice.invoiceNumber,
          });

          if (emailSent) {
            await storage.updateShipment(shipment.id, {
              extraFeesEmailSentAt: new Date(),
            });
          }
        } catch (emailError) {
          logError("Error sending DDP extra weight email", emailError, {
            shipmentId: shipment.id,
            clientAccountId: shipment.clientAccountId,
          });
        }
      }

      const appBaseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002";
      const assignedUserIds = (visibleShipment.assignedTeam || []).map((member) => member.userId);
      const clientUsers = await storage.getUsersByClientAccount(shipment.clientAccountId);

      await createOperationEvent({
        shipmentId: shipment.id,
        actorUserId: user.id,
        eventType: "ddp_extra_weight_charge_added",
        title: `Adjusted shipment ${preview.billingUnit} to ${formatWeightValue(preview.targetMeasuredQuantity)} ${preview.billingUnit}`,
        description: `Original measured ${preview.billingUnit}: ${formatWeightValue(preview.baseMeasuredQuantity)}. Current shipment ${preview.billingUnit}: ${formatWeightValue(preview.currentMeasuredQuantity)}. Extra billed ${preview.billingUnit} is now ${formatWeightValue(preview.targetExtraWeightQuantity)} with a Door To Door Freight invoice target of SAR ${formatMoney(preview.targetExtraWeightAmountSar)}.${parsed.notes ? ` ${parsed.notes}` : ""}`,
        audience: OperationEventAudience.BOTH,
        metadata: {
          additionalQuantity: parsed.additionalQuantity ?? null,
          baseMeasuredQuantity: preview.baseMeasuredQuantity,
          currentMeasuredQuantity: preview.currentMeasuredQuantity,
          targetMeasuredQuantity: preview.targetMeasuredQuantity,
          targetExtraWeightQuantity: preview.targetExtraWeightQuantity,
          billingUnit: preview.billingUnit,
          amountSar: preview.targetExtraWeightAmountSar,
          notes: parsed.notes || null,
        },
      });

      if (assignedUserIds.length > 0) {
        await notifyUsers(assignedUserIds, {
          title: "Door To Door Freight extra charge updated",
          body: `${shipment.trackingNumber}: shipment ${preview.billingUnit} is now ${formatWeightValue(preview.targetMeasuredQuantity)}. New extra invoice target: SAR ${formatMoney(preview.targetExtraWeightAmountSar)}.`,
          type: "operations_charge_added",
          entityType: "shipment",
          entityId: shipment.id,
          actionUrl: `${appBaseUrl}/operations?shipmentId=${shipment.id}`,
          sendEmail: false,
        });
      }

      const clientUserIds = clientUsers.filter((clientUser) => clientUser.isActive).map((clientUser) => clientUser.id);
      if (clientUserIds.length > 0) {
        await notifyUsers(clientUserIds, {
          title: "Additional shipment charge created",
          body: `${shipment.trackingNumber}: your shipment ${preview.billingUnit} was updated to ${formatWeightValue(preview.targetMeasuredQuantity)} and the extra invoice is now SAR ${formatMoney(preview.targetExtraWeightAmountSar)}.`,
          type: "invoice_created",
          entityType: "shipment",
          entityId: shipment.id,
          actionUrl: weightInvoice ? `${appBaseUrl}/client/invoices?invoiceId=${weightInvoice.id}` : `${appBaseUrl}/client/invoices`,
          sendEmail: false,
        });
      }

      await logAudit(
        req.session.userId,
        "operations_add_ddp_extra_weight",
        "shipment",
        shipment.id,
        `Adjusted ${preview.billingUnit} for ${shipment.trackingNumber} to ${formatWeightValue(preview.targetMeasuredQuantity)} for SAR ${formatMoney(preview.targetExtraWeightAmountSar)}`,
        req.ip,
      );

      res.status(201).json({
        billingUnit: preview.billingUnit,
        additionalQuantity: parsed.additionalQuantity !== undefined ? roundQuantity(parsed.additionalQuantity) : null,
        baseMeasuredQuantity: preview.baseMeasuredQuantity,
        currentMeasuredQuantity: preview.currentMeasuredQuantity,
        targetMeasuredQuantity: preview.targetMeasuredQuantity,
        totalQuantity: preview.targetExtraWeightQuantity,
        amountSar: preview.targetExtraWeightAmountSar,
        deltaAmountSar: preview.deltaAmountSar,
        rateSarPerUnit: preview.effectiveRateSarPerUnit,
        invoice: weightInvoice || null,
        detail: await getOperationShipmentDetail(req.params.id, user),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to update DDP extra weight charge from operations", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/charges/custom", requireOperationsPermission("operations", "update"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        description: z.string().trim().min(3).max(500),
        amount: z.coerce.number().positive().max(1_000_000),
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (shipment.fulfillmentType !== "ddp_manual") {
        return res.status(400).json({ error: "Extra charges can only be added to Door To Door Freight shipments." });
      }

      const invoice = await storage.createInvoice({
        clientAccountId: shipment.clientAccountId,
        shipmentId: shipment.id,
        invoiceType: InvoiceType.DDP_ADJUSTMENT,
        description: `Door To Door Freight adjustment for ${shipment.trackingNumber}: ${parsed.description}`,
        amount: formatMoney(parsed.amount),
        status: "pending",
        dueDate: new Date(),
      });
      const syncedInvoice = await syncInvoiceToZoho(invoice, shipment);

      const appBaseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002";
      const assignedUserIds = (visibleShipment.assignedTeam || []).map((member) => member.userId);
      const clientUsers = await storage.getUsersByClientAccount(shipment.clientAccountId);

      await createOperationEvent({
        shipmentId: shipment.id,
        actorUserId: user.id,
        eventType: "ddp_custom_charge_added",
        title: "Added extra charge",
        description: `SAR ${formatMoney(parsed.amount)} added for "${parsed.description}".`,
        audience: OperationEventAudience.BOTH,
        metadata: {
          amountSar: parsed.amount,
          description: parsed.description,
          invoiceId: syncedInvoice.id,
        },
      });

      if (assignedUserIds.length > 0) {
        await notifyUsers(assignedUserIds, {
          title: "Door To Door Freight extra charge added",
          body: `${shipment.trackingNumber}: SAR ${formatMoney(parsed.amount)} was added for ${parsed.description}.`,
          type: "operations_charge_added",
          entityType: "shipment",
          entityId: shipment.id,
          actionUrl: `${appBaseUrl}/operations?shipmentId=${shipment.id}`,
          sendEmail: false,
        });
      }

      const clientUserIds = clientUsers.filter((clientUser) => clientUser.isActive).map((clientUser) => clientUser.id);
      if (clientUserIds.length > 0) {
        await notifyUsers(clientUserIds, {
          title: "Additional shipment charge created",
          body: `${shipment.trackingNumber}: an extra charge of SAR ${formatMoney(parsed.amount)} was added to your shipment and is ready for payment.`,
          type: "invoice_created",
          entityType: "shipment",
          entityId: shipment.id,
          actionUrl: `${appBaseUrl}/client/invoices?invoiceId=${syncedInvoice.id}`,
          sendEmail: true,
        });
      }

      await logAudit(
        req.session.userId,
        "operations_add_ddp_custom_charge",
        "invoice",
        syncedInvoice.id,
        `Added SAR ${formatMoney(parsed.amount)} extra charge to ${shipment.trackingNumber}`,
        req.ip,
      );

      res.status(201).json({
        invoice: syncedInvoice,
        detail: await getOperationShipmentDetail(req.params.id, user),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to add DDP custom charge from operations", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/attention/resolve", requireOperationsPermission("operations", "attention"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        resolutionNote: z.string().trim().max(1000).optional(),
      }).parse(req.body || {});

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const resolvedFlags = await resolveAttentionFlags({
        shipmentId: req.params.id,
        actorUserId: user.id,
        resolutionNote: parsed.resolutionNote,
      });

      res.json({ resolvedFlags, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to resolve operations attention flags", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/reassign", requireOperationsPermission("operations", "assign"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        assignedToUserId: z.string().min(1).optional(),
        assignedToUserIds: z.array(z.string().min(1)).min(1).optional(),
        reason: z.string().trim().max(1000).optional(),
      }).superRefine((value, ctx) => {
        if (!value.assignedToUserId && (!value.assignedToUserIds || value.assignedToUserIds.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Select at least one team member.",
            path: ["assignedToUserIds"],
          });
        }
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const assignedToUserIds = parsed.assignedToUserIds?.length
        ? parsed.assignedToUserIds
        : parsed.assignedToUserId
          ? [parsed.assignedToUserId]
          : [];

      const assignments = assignedToUserIds.length === 1
        ? [await reassignOperationShipment({
            shipmentId: req.params.id,
            assignedToUserId: assignedToUserIds[0],
            actorUserId: user.id,
            reason: parsed.reason,
          })].filter(Boolean)
        : await setOperationShipmentAssignments({
            shipmentId: req.params.id,
            assignedToUserIds,
            actorUserId: user.id,
            reason: parsed.reason,
          });

      res.json({ assignments, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      if (error instanceof OperationInputError) {
        return res.status(400).json({ error: error.message });
      }
      logError("Failed to reassign operations shipment", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/special-handling", requireOperationsPermission("operations", "special-handling"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        priority: z.enum(["urgent", "high", "normal"]).default("normal"),
        reason: z.string().trim().min(1).max(2000),
        assignedToUserId: z.string().min(1).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      }).parse(req.body);

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const specialHandling = await upsertSpecialHandling({
        shipmentId: req.params.id,
        priority: parsed.priority,
        reason: parsed.reason,
        assignedToUserId: parsed.assignedToUserId,
        createdByUserId: user.id,
        notes: parsed.notes,
      });
      res.json({ specialHandling, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to upsert special handling", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/operations/shipments/:id/special-handling/resolve", requireOperationsPermission("operations", "special-handling"), async (req, res) => {
    try {
      const user = await ensureOperationsAccess(req, res);
      if (!user) return;
      const parsed = z.object({
        resolutionNote: z.string().trim().max(1000).optional(),
      }).parse(req.body || {});

      const visibleShipment = await getOperationShipmentDetail(req.params.id, user);
      if (!visibleShipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const specialHandling = await resolveSpecialHandling({
        shipmentId: req.params.id,
        actorUserId: user.id,
        resolutionNote: parsed.resolutionNote,
      });

      res.json({ specialHandling, detail: await getOperationShipmentDetail(req.params.id, user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Failed to resolve special handling", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // AUTH ROUTES
  // ============================================
  // Shared post-authentication step: enforce active/client-account checks, regenerate the session
  // (prevents fixation), stamp lastLoginAt, audit, and return the sanitized user. Used by every
  // login method (password, phone, email OTP).
  async function establishUserSession(
    req: Request,
    user: User,
    method: string,
  ): Promise<{ user: Omit<User, "password"> } | { error: string; status: number }> {
    if (!user.isActive) {
      return { error: "Account is deactivated", status: 403 };
    }
    if (user.userType === "client") {
      if (!user.clientAccountId) return { error: "Client account not found", status: 404 };
      const clientAccount = await storage.getClientAccount(user.clientAccountId);
      if (!clientAccount || !clientAccount.isActive) {
        return { error: "Client account is deactivated", status: 403 };
      }
    }

    const updatedUser = await storage.updateUser(user.id, {
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.userId = user.id;

    await logAudit(user.id, "login", "user", user.id, `User ${user.username} logged in (${method})`, req.ip);

    const { password, ...userWithoutPassword } = updatedUser || user;
    return { user: userWithoutPassword };
  }

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const loginInput = data.username.trim();
      const normalizedLoginInput = loginInput.toLowerCase();
      const identifier = req.ip || normalizedLoginInput;

      // Check brute-force protection
      const bruteForceCheck = checkBruteForce(identifier);
      if (bruteForceCheck.blocked) {
        await logAudit(undefined, "login_blocked", "security", undefined, 
          `Login blocked for ${identifier} due to brute-force protection`, req.ip);
        return res.status(429).json({ 
          error: `Too many failed attempts. Try again in ${bruteForceCheck.remainingTime} seconds.` 
        });
      }

      // Resolve by email, username, or phone (any of the three identifiers).
      const phoneDigits = loginInput.replace(/[^\d+]/g, "");
      const user =
        (await storage.getUserByEmail(normalizedLoginInput)) ||
        (await storage.getUserByUsername(loginInput)) ||
        (phoneDigits.replace(/\D/g, "").length >= 7 ? await storage.getUserByPhone(phoneDigits) : undefined);

      if (!user) {
        recordFailedLogin(identifier);
        await logAudit(undefined, "login_failed", "security", undefined,
          `Failed login attempt for login: ${loginInput}`, req.ip);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.password);
      if (!passwordMatch) {
        recordFailedLogin(identifier);
        await logAudit(user.id, "login_failed", "security", user.id,
          `Failed login attempt for user: ${user.username}`, req.ip);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Clear failed login attempts on successful password check.
      clearFailedLogins(identifier);

      const result = await establishUserSession(req, user, "password");
      if ("error" in result) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json({ user: result.user });
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

  // ── Email OTP login ────────────────────────────────────────────────────────
  const hashOtp = (code: string) => createHash("sha256").update(`${code}:${process.env.SESSION_SECRET || "ezhalha"}`).digest("hex");
  const OTP_TTL_MS = 10 * 60 * 1000;
  const OTP_MAX_ATTEMPTS = 5;

  // Request a login code by email. Always responds success (never reveals whether the email
  // exists). Sends a 6-digit code that expires in 10 minutes.
  app.post("/api/auth/otp/request", otpLimiter, async (req, res) => {
    try {
      const parsed = z.object({ email: z.string().email("A valid email is required") }).parse(req.body || {});
      const email = parsed.email.trim().toLowerCase();

      // Per-email throttle: no more than 4 codes in 10 minutes.
      const recent = await storage.countRecentEmailLoginOtps(email, OTP_TTL_MS);
      if (recent >= 4) {
        return res.json({ success: true }); // silently drop; don't leak or spam
      }

      const user = await storage.getUserByEmail(email);
      if (user && user.isActive) {
        const code = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
        await storage.createEmailLoginOtp({
          email,
          codeHash: hashOtp(code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        });
        const otpDelivered = await sendEmail({
          to: email,
          subject: "Your ezhalha login code",
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="margin:0 0 8px">Your login code</h2>
            <p style="color:#555;margin:0 0 16px">Use this code to sign in to ezhalha. It expires in 10 minutes.</p>
            <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:16px;text-align:center">${code}</div>
            <p style="color:#888;font-size:12px;margin-top:16px">If you didn't request this, you can ignore this email.</p>
          </div>`,
          text: `Your ezhalha login code is ${code}. It expires in 10 minutes.`,
        });
        if (!otpDelivered) {
          logError("OTP login code email was not delivered", undefined, { email });
        }
        await logAudit(user.id, "otp_requested", "security", user.id, `Login code requested for ${email}`, req.ip);
      }

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("OTP request failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Verify an email login code → establish the session.
  app.post("/api/auth/otp/verify", otpLimiter, async (req, res) => {
    try {
      const parsed = z.object({
        email: z.string().email(),
        code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
      }).parse(req.body || {});
      const email = parsed.email.trim().toLowerCase();
      const identifier = req.ip || email;

      const bf = checkBruteForce(identifier);
      if (bf.blocked) {
        return res.status(429).json({ error: `Too many attempts. Try again in ${bf.remainingTime} seconds.` });
      }

      const otp = await storage.getActiveEmailLoginOtp(email);
      const invalid = () => {
        recordFailedLogin(identifier);
        return res.status(401).json({ error: "Invalid or expired code." });
      };

      if (!otp) return invalid();
      if (otp.consumedAt) return invalid();
      if (new Date(otp.expiresAt).getTime() < Date.now()) return invalid();
      if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) return invalid();

      const provided = Buffer.from(hashOtp(parsed.code));
      const stored = Buffer.from(otp.codeHash);
      const match = provided.length === stored.length && timingSafeEqual(provided, stored);
      if (!match) {
        await storage.updateEmailLoginOtp(otp.id, { attempts: (otp.attempts ?? 0) + 1 });
        return invalid();
      }

      // Consume the code (single use) before establishing the session.
      await storage.updateEmailLoginOtp(otp.id, { consumedAt: new Date() });
      const user = await storage.getUserByEmail(email);
      if (!user) return invalid();

      clearFailedLogins(identifier);
      const result = await establishUserSession(req, user, "email_otp");
      if ("error" in result) return res.status(result.status).json({ error: result.error });
      res.json({ user: result.user });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("OTP verify failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Password set / reset ─────────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", otpLimiter, async (req, res) => {
    try {
      const parsed = z.object({ email: z.string().email("A valid email is required") }).parse(req.body || {});
      const email = parsed.email.trim().toLowerCase();
      const user = await storage.getUserByEmail(email);
      if (user && user.isActive) {
        await sendPasswordSetupEmail(user, "reset");
        await logAudit(user.id, "password_reset_requested", "security", user.id, `Password reset requested for ${email}`, req.ip);
      }
      // Never reveal whether the email exists.
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Forgot-password failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Validate a token (for the reset page to show valid/expired before the user types a password).
  app.get("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const row = await storage.getPasswordResetTokenByHash(createHash("sha256").update(req.params.token).digest("hex"));
      const valid = Boolean(row && !row.consumedAt && new Date(row.expiresAt).getTime() > Date.now());
      res.json({ valid, mode: row?.purpose === "onboard" ? "onboard" : "reset" });
    } catch (error) {
      logError("Reset token validation failed", error);
      res.json({ valid: false });
    }
  });

  app.post("/api/auth/reset-password", otpLimiter, async (req, res) => {
    try {
      const parsed = z.object({
        token: z.string().min(10),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body || {});

      const row = await storage.getPasswordResetTokenByHash(createHash("sha256").update(parsed.token).digest("hex"));
      if (!row || row.consumedAt || new Date(row.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." });
      }
      const user = await storage.getUser(row.userId);
      if (!user) return res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." });

      const hashedPassword = await bcrypt.hash(parsed.password, SALT_ROUNDS);
      await storage.updateUser(user.id, { password: hashedPassword, mustChangePassword: false, updatedAt: new Date() });
      await storage.consumePasswordResetToken(row.id);
      await logAudit(user.id, "password_reset_completed", "security", user.id, `Password ${row.purpose === "onboard" ? "set" : "reset"} for ${user.email}`, req.ip);

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Reset-password failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
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

  // AI autofill: read a company's uploaded registration documents and extract the fields needed
  // to pre-fill the application form. Public (used before an account exists) + rate limited.
  app.post("/api/public/applications/extract-company-details", companyExtractionLimiter, async (req, res) => {
    try {
      const schema = z.object({
        documents: z.array(z.object({
          objectPath: z.string().min(1),
          fileName: z.string().min(1),
          contentType: z.string().min(1),
          label: z.string().optional(),
        })).min(1, "Upload at least one company document.").max(6),
      });
      const { documents } = schema.parse(req.body || {});

      if (!isGeminiCompanyExtractionConfigured()) {
        return res.status(503).json({ error: "Document autofill is not available right now." });
      }

      const details = await withShipmentIntegrationAccount(
        "gemini",
        {},
        () => extractCompanyDetailsFromDocuments(documents),
      );

      res.json({ details });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      const message = error instanceof Error ? error.message : "Failed to read company documents";
      logError("Company document extraction failed", error);
      res.status(422).json({ error: message });
    }
  });

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

      // Individual applicants are auto-approved — no manual review. Companies stay pending for
      // an admin to review their documents.
      let autoApproved = false;
      if (data.accountType === "individual") {
        try {
          await approveClientApplication(application, {
            auditAction: "auto_approve_application",
          });
          autoApproved = true;
          logInfo("Individual application auto-approved", { applicationId: application.id, email: data.email });
        } catch (error) {
          if (!(error instanceof EmailInUseError)) {
            throw error;
          }
          // Email already tied to an account — fall back to manual review.
          logInfo("Auto-approval skipped (email already in use); leaving application pending", { applicationId: application.id });
        }
      }

      if (!autoApproved) {
        // Confirmation to applicant + notify an admin to review.
        await sendApplicationReceived(data.email, data.name, application.id);
        await notifyAdminNewApplication(
          application.id,
          data.name,
          data.email,
          data.companyName || undefined,
        );
      }

      logInfo("New client application received", {
        applicationId: application.id,
        email: data.email,
        name: data.name,
        autoApproved,
      });

      // Return the current application state (approved for auto-approved individuals).
      const response = (await storage.getClientApplication(application.id)) || application;

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
  app.get("/api/admin/stats", requireAdminPermission("dashboard", "read"), async (req, res) => {
    const adminUser = req.currentUser!;
    const scopedClientAccountIds = await getScopedClientAccountIds(adminUser);
    const scopedClientIdSet = scopedClientAccountIds ? new Set(scopedClientAccountIds) : null;

    const allClients = await storage.getClientAccounts();
    const allShipments = await storage.getShipments();
    const allApplications = await storage.getClientApplications();

    const clients = scopedClientIdSet
      ? allClients.filter((client) => scopedClientIdSet.has(client.id))
      : allClients;
    const scopedShipments = scopedClientIdSet
      ? allShipments.filter((shipment) => scopedClientIdSet.has(shipment.clientAccountId))
      : allShipments;
    // Dashboard analytics reflect PAID shipments only — unpaid / abandoned / payment-pending
    // shipments shouldn't inflate counts or revenue.
    const shipments = scopedShipments.filter((shipment) => shipment.paymentStatus === "paid");
    const applications = scopedClientIdSet ? [] : allApplications;

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

  app.get("/api/admin/refund-requests", requireAdminPermission("refund-requests", "read"), async (req, res) => {
    try {
      const adminUser = await storage.getUser(req.session.userId!);
      if (!adminUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      const status =
        typeof req.query.status === "string" && req.query.status.trim()
          ? req.query.status.trim().toUpperCase()
          : ShipmentRefundRequestStatus.PENDING;
      const limit = Math.max(1, Math.min(Number(req.query.limit || 10), 50));
      const scopedClientAccountIds = await getScopedClientAccountIds(adminUser);
      const refundRequests = await storage.getShipmentRefundRequests({
        status: status === "ALL" ? "all" : status,
        clientAccountIds: scopedClientAccountIds,
      });

      const serialized = await Promise.all(
        refundRequests.slice(0, limit).map((request) => serializeShipmentRefundRequestForAdmin(request, adminUser)),
      );

      res.json(serialized);
    } catch (error) {
      logError("Error fetching shipment refund requests", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post(
    "/api/admin/refund-requests/:id/approve-account-manager",
    requireAdminPermission("refund-requests", "approve-account-manager"),
    async (req, res) => {
      try {
        const adminUser = await storage.getUser(req.session.userId!);
        if (!adminUser) {
          return res.status(404).json({ error: "Admin user not found" });
        }

        if (!adminUser.isAccountManager) {
          return res.status(403).json({ error: "Only the assigned account manager can approve this refund" });
        }

        const refundRequest = await storage.getShipmentRefundRequest(req.params.id);
        if (!refundRequest) {
          return res.status(404).json({ error: "Refund request not found" });
        }

        if (!(await ensureAccountManagerClientAccess(adminUser, refundRequest.clientAccountId, res))) {
          return;
        }

        if (!refundRequest.accountManagerUserId || refundRequest.accountManagerUserId !== adminUser.id) {
          return res.status(403).json({ error: "This refund request is not assigned to you" });
        }

        if (refundRequest.accountManagerApprovalStatus !== ShipmentRefundApprovalStatus.PENDING) {
          return res.status(400).json({ error: "Account manager approval has already been recorded" });
        }

        const now = new Date();
        const completed = isShipmentRefundApprovalSatisfied(refundRequest.financeApprovalStatus);
        const updatedRequest = await storage.updateShipmentRefundRequest(refundRequest.id, {
          accountManagerApprovalStatus: ShipmentRefundApprovalStatus.APPROVED,
          accountManagerApprovedByUserId: adminUser.id,
          accountManagerApprovedAt: now,
          status: completed ? ShipmentRefundRequestStatus.COMPLETED : refundRequest.status,
          completedAt: completed ? now : refundRequest.completedAt,
        });

        await logAudit(
          req.session.userId,
          "approve_refund_request_account_manager",
          "shipment_refund_request",
          refundRequest.id,
          `Account manager approved refund request for shipment ${refundRequest.shipmentId}`,
          req.ip,
        );

        res.json(updatedRequest);
      } catch (error) {
        logError("Error approving shipment refund request as account manager", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/admin/refund-requests/:id/approve-finance",
    requireAdminPermission("refund-requests", "approve-finance"),
    async (req, res) => {
      try {
        const adminUser = await storage.getUser(req.session.userId!);
        if (!adminUser) {
          return res.status(404).json({ error: "Admin user not found" });
        }

        if (adminUser.isAccountManager) {
          return res.status(403).json({ error: "Account managers cannot perform the finance approval step" });
        }

        const refundRequest = await storage.getShipmentRefundRequest(req.params.id);
        if (!refundRequest) {
          return res.status(404).json({ error: "Refund request not found" });
        }

        if (refundRequest.financeApprovalStatus !== ShipmentRefundApprovalStatus.PENDING) {
          return res.status(400).json({ error: "Finance approval has already been recorded" });
        }

        const now = new Date();
        const completed = isShipmentRefundApprovalSatisfied(refundRequest.accountManagerApprovalStatus);
        const updatedRequest = await storage.updateShipmentRefundRequest(refundRequest.id, {
          financeApprovalStatus: ShipmentRefundApprovalStatus.APPROVED,
          financeApprovedByUserId: adminUser.id,
          financeApprovedAt: now,
          status: completed ? ShipmentRefundRequestStatus.COMPLETED : refundRequest.status,
          completedAt: completed ? now : refundRequest.completedAt,
        });

        await logAudit(
          req.session.userId,
          "approve_refund_request_finance",
          "shipment_refund_request",
          refundRequest.id,
          `Finance approval recorded for refund request on shipment ${refundRequest.shipmentId}`,
          req.ip,
        );

        res.json(updatedRequest);
      } catch (error) {
        logError("Error approving shipment refund request as finance", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Admin - Recent Shipments
  app.get("/api/admin/shipments/recent", requireAdminPermission("shipments", "read"), async (req, res) => {
    const adminUser = req.currentUser!;
    const scopedClientAccountIds = await getScopedClientAccountIds(adminUser);
    const scopedClientIdSet = scopedClientAccountIds ? new Set(scopedClientAccountIds) : null;
    const shipments = await storage.getShipments();
    const visibleShipments = scopedClientIdSet
      ? shipments.filter((shipment) => scopedClientIdSet.has(shipment.clientAccountId))
      : shipments;

    res.json(visibleShipments.slice(0, 10));
  });

  const abandonedRecoveryActionSchema = z.object({
    channel: z.enum([
      AbandonedShipmentRecoveryChannel.WHATSAPP,
      AbandonedShipmentRecoveryChannel.SMS,
      AbandonedShipmentRecoveryChannel.EMAIL,
    ]).default(AbandonedShipmentRecoveryChannel.WHATSAPP),
  });

  const abandonedDiscountSchema = abandonedRecoveryActionSchema.extend({
    discountType: z.enum(["percent", "fixed"]).default("percent"),
    discountValue: z.coerce.number().positive().max(100000),
    expiresIn: z.enum(["24 hours", "48 hours", "7 days"]).default("24 hours"),
    message: z.string().trim().max(3000).optional(),
  });

  function isAbandonedShipmentCandidate(shipment: Shipment, recovery?: AbandonedShipmentRecovery) {
    const paymentMethod = String(shipment.paymentMethod || "PAY_NOW").toUpperCase();
    const paymentStatus = String(shipment.paymentStatus || "pending").toLowerCase();
    const status = String(shipment.status || "").toLowerCase();

    if (paymentMethod === "CREDIT") return false;
    if (status === "cancelled" || status === "credit_pending") return false;
    if (recovery?.status === AbandonedShipmentRecoveryStatus.DISMISSED) return false;
    if (recovery && recovery.status !== AbandonedShipmentRecoveryStatus.DISMISSED) return true;
    return paymentStatus !== "paid";
  }

  function getRecoveryStatusForShipment(shipment: Shipment, recovery?: AbandonedShipmentRecovery) {
    if (String(shipment.paymentStatus || "").toLowerCase() === "paid") {
      return AbandonedShipmentRecoveryStatus.RECOVERED;
    }

    if (recovery?.status) {
      return recovery.status;
    }

    return AbandonedShipmentRecoveryStatus.NOT_CONTACTED;
  }

  function getDiscountExpiryDate(expiresIn: string) {
    const now = new Date();
    if (expiresIn === "48 hours") return new Date(now.getTime() + 48 * 60 * 60 * 1000);
    if (expiresIn === "7 days") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  function buildAbandonedDiscountMessage(params: {
    clientName: string;
    shipment: Shipment;
    discountText: string;
    discountAmount: number;
    finalPrice: number;
    expiresIn: string;
    resumeUrl: string;
  }) {
    const firstName = params.clientName.trim().split(/\s+/)[0] || params.clientName;
    return [
      `مرحبا ${firstName}`,
      `لاحظنا إنك شاهدت سعر شحنتك ${params.shipment.trackingNumber} ولم تكمل الدفع.`,
      `عندنا لك عرض خاص: ${params.discountText} على شحنتك، يوفر لك SAR ${params.discountAmount.toLocaleString()}.`,
      `السعر بعد الخصم: SAR ${params.finalPrice.toLocaleString()}.`,
      `العرض ساري لمدة ${params.expiresIn}.`,
      `أكمل الدفع من هنا: ${params.resumeUrl}`,
    ].join("\n");
  }

  function buildShipmentResumePaymentUrl(req: Request, shipmentId: string) {
    return `${buildAppBaseUrl(req)}/client/shipments?resumeShipment=${encodeURIComponent(shipmentId)}`;
  }

  function ensureMessageHasResumeLink(message: string, resumeUrl: string) {
    if (message.includes(resumeUrl)) {
      return message;
    }

    return `${message.trim()}\n\nأكمل الدفع من هنا: ${resumeUrl}`;
  }

  async function getAbandonedShipmentForAction(
    req: Request,
    res: Response,
  ): Promise<{ shipment: Shipment; client: ClientAccount | undefined; recovery: AbandonedShipmentRecovery | undefined } | null> {
    const adminUser = req.currentUser!;
    const shipment = await storage.getShipment(req.params.id);
    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return null;
    }

    if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
      return null;
    }

    const [client, recovery] = await Promise.all([
      storage.getClientAccount(shipment.clientAccountId),
      storage.getAbandonedShipmentRecoveryByShipmentId(shipment.id),
    ]);

    if (!isAbandonedShipmentCandidate(shipment, recovery)) {
      res.status(400).json({ error: "This shipment is not eligible for abandoned recovery" });
      return null;
    }

    return { shipment, client, recovery };
  }

  // Admin - All Shipments
  app.get("/api/admin/shipments", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const abandonedOnly = req.query.abandoned === "true";
      const clientAccountIds = await getScopedClientAccountIds(adminUser);

      if (abandonedOnly) {
        const [allShipments, recoveries] = await Promise.all([
          storage.getShipments(),
          storage.getAbandonedShipmentRecoveries({ clientAccountIds, includeDismissed: true }),
        ]);
        const scopedClientIdSet = clientAccountIds ? new Set(clientAccountIds) : null;
        const recoveryByShipmentId = new Map(recoveries.map((recovery) => [recovery.shipmentId, recovery]));
        const query = search?.trim().toLowerCase();
        const candidates = allShipments
          .filter((shipment) => !scopedClientIdSet || scopedClientIdSet.has(shipment.clientAccountId))
          .filter((shipment) => isAbandonedShipmentCandidate(shipment, recoveryByShipmentId.get(shipment.id)))
          .filter((shipment) => {
            if (!query) return true;
            return [
              shipment.trackingNumber,
              shipment.recipientName,
              shipment.recipientPhone,
              shipment.recipientCity,
              shipment.senderName,
              shipment.senderPhone,
              shipment.senderCity,
            ].some((value) => String(value || "").toLowerCase().includes(query));
          });

        for (const shipment of candidates) {
          const recovery = recoveryByShipmentId.get(shipment.id);
          if (String(shipment.paymentStatus || "").toLowerCase() === "paid" && recovery?.status !== AbandonedShipmentRecoveryStatus.RECOVERED) {
            const recovered = await storage.upsertAbandonedShipmentRecoveryByShipmentId(
              shipment.id,
              {
                shipmentId: shipment.id,
                clientAccountId: shipment.clientAccountId,
                status: AbandonedShipmentRecoveryStatus.RECOVERED,
                lastAction: "auto_recovered",
                recoveredAt: new Date(),
              },
              {
                status: AbandonedShipmentRecoveryStatus.RECOVERED,
                lastAction: "auto_recovered",
                recoveredAt: new Date(),
              },
            );
            recoveryByShipmentId.set(shipment.id, recovered);
          }
        }

        const visibleCandidates = candidates.filter((shipment) => recoveryByShipmentId.get(shipment.id)?.status !== AbandonedShipmentRecoveryStatus.DISMISSED);
        const total = visibleCandidates.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const paginatedShipments = visibleCandidates.slice((page - 1) * limit, page * limit);
        const visibleRecoveries = Array.from(recoveryByShipmentId.values()).filter((recovery) =>
          visibleCandidates.some((shipment) => shipment.id === recovery.shipmentId),
        );
        const statusCounts = visibleCandidates.reduce(
          (acc, shipment) => {
            const recovery = recoveryByShipmentId.get(shipment.id);
            const recoveryStatus = getRecoveryStatusForShipment(shipment, recovery);
            acc.all += 1;
            acc[recoveryStatus] = (acc[recoveryStatus] || 0) + 1;
            return acc;
          },
          {
            all: 0,
            [AbandonedShipmentRecoveryStatus.NOT_CONTACTED]: 0,
            [AbandonedShipmentRecoveryStatus.DISCOUNT_SENT]: 0,
            [AbandonedShipmentRecoveryStatus.EXPIRED]: 0,
            [AbandonedShipmentRecoveryStatus.REMINDER_SENT]: 0,
            [AbandonedShipmentRecoveryStatus.RECOVERED]: 0,
            [AbandonedShipmentRecoveryStatus.DISMISSED]: 0,
          } as Record<string, number>,
        );
        const lostRevenue = visibleCandidates.reduce((sum, shipment) => sum + Number(shipment.finalPrice || 0), 0);

        return res.json({
          shipments: paginatedShipments,
          total,
          page,
          totalPages,
          recoveries: visibleRecoveries,
          metrics: {
            statusCounts,
            lostRevenue,
            recoveryRate: statusCounts.all > 0
              ? Math.round(((statusCounts[AbandonedShipmentRecoveryStatus.RECOVERED] || 0) / statusCounts.all) * 100)
              : 0,
            discountsSent: statusCounts[AbandonedShipmentRecoveryStatus.DISCOUNT_SENT] || 0,
          },
        });
      }

      const result = await storage.getShipmentsPaginated({ page, limit, search, status, clientAccountIds, abandonedOnly });
      res.json(result);
    } catch (error) {
      logError("Error fetching shipments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin shipment detail meta: who created it + when, the client, and the full activity
  // timeline (derived from the audit log). Powers the enriched detail panel.
  app.get("/api/admin/shipments/:id/details", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });

      const logs = await storage.getAuditLogsForEntity("shipment", shipment.id);

      // Resolve every user referenced (creator + activity actors) in one pass.
      const userIds = new Set<string>();
      if (shipment.quoteCreatedByUserId) userIds.add(shipment.quoteCreatedByUserId);
      for (const log of logs) if (log.userId) userIds.add(log.userId);
      const userMap = new Map<string, { id: string; username: string; userType: string }>();
      await Promise.all(
        [...userIds].map(async (uid) => {
          const u = await storage.getUser(uid);
          if (u) userMap.set(uid, { id: u.id, username: u.username, userType: u.userType });
        }),
      );

      // Creator: the admin who built a quotation, otherwise the actor on the earliest
      // (creation) audit entry. Falls back to "System" when no user is recorded.
      const creationLog = logs.find((l) => l.userId && /create|confirm/i.test(l.action)) || logs.find((l) => l.userId);
      const creatorId = shipment.quoteCreatedByUserId || creationLog?.userId || null;
      const creator = creatorId ? userMap.get(creatorId) || null : null;

      const client = shipment.clientAccountId ? await storage.getClientAccount(shipment.clientAccountId) : null;

      res.json({
        createdBy: creator
          ? { username: creator.username, userType: creator.userType }
          : null,
        createdVia: shipment.isQuote ? "admin_quotation" : (creator?.userType === "admin" ? "admin" : creator?.userType === "client" ? "client" : "system"),
        createdAt: shipment.createdAt,
        clientName: client?.name || null,
        clientEmail: client?.email || null,
        activity: logs.map((l) => ({
          action: l.action,
          at: l.createdAt,
          by: l.userId ? userMap.get(l.userId)?.username || "Unknown" : "System",
          byType: l.userId ? userMap.get(l.userId)?.userType || null : "system",
          details: l.details || null,
        })),
      });
    } catch (error) {
      logError("Error fetching shipment details", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/shipments/:id/abandoned-recovery/discount", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const parsed = abandonedDiscountSchema.parse(req.body);
      const context = await getAbandonedShipmentForAction(req, res);
      if (!context) return;

      const { shipment, client } = context;
      const shipmentAmount = Number(shipment.finalPrice || 0);
      const discountAmount = parsed.discountType === "percent"
        ? Math.min(shipmentAmount, Math.round((shipmentAmount * parsed.discountValue) / 100))
        : Math.min(shipmentAmount, parsed.discountValue);
      const discountFinalPrice = Math.max(0, shipmentAmount - discountAmount);
      const discountText = parsed.discountType === "percent"
        ? `خصم ${parsed.discountValue}%`
        : `خصم SAR ${parsed.discountValue.toLocaleString()}`;
      const resumeUrl = buildShipmentResumePaymentUrl(req, shipment.id);
      const message = ensureMessageHasResumeLink(parsed.message || buildAbandonedDiscountMessage({
        clientName: client?.name || shipment.recipientName || shipment.senderName || "عميلنا",
        shipment,
        discountText,
        discountAmount,
        finalPrice: discountFinalPrice,
        expiresIn: parsed.expiresIn,
        resumeUrl,
      }), resumeUrl);
      const expiresAt = getDiscountExpiryDate(parsed.expiresIn);
      let deliveryStatus = "queued";

      if (parsed.channel === AbandonedShipmentRecoveryChannel.EMAIL && client?.email) {
        const rendered = await getRenderedTemplate("abandoned_discount_offer", {
          tracking_number: shipment.trackingNumber,
          message: message.replace(/\n/g, "<br>"),
          year: new Date().getFullYear().toString(),
        });
        const sent = rendered
          ? await sendEmail({
              to: client.email,
              subject: rendered.subject,
              html: rendered.html,
            })
          : false;
        deliveryStatus = sent ? "sent" : "email_not_configured";
      }

      const recovery = await storage.upsertAbandonedShipmentRecoveryByShipmentId(
        shipment.id,
        {
          shipmentId: shipment.id,
          clientAccountId: shipment.clientAccountId,
          status: AbandonedShipmentRecoveryStatus.DISCOUNT_SENT,
          lastAction: `discount_${deliveryStatus}`,
          discountType: parsed.discountType,
          discountValue: parsed.discountValue.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          discountFinalPrice: discountFinalPrice.toFixed(2),
          discountChannel: parsed.channel,
          discountExpiresAt: expiresAt,
          discountMessage: message,
          discountSentAt: new Date(),
          createdByUserId: req.session.userId,
          updatedByUserId: req.session.userId,
        },
        {
          status: AbandonedShipmentRecoveryStatus.DISCOUNT_SENT,
          lastAction: `discount_${deliveryStatus}`,
          discountType: parsed.discountType,
          discountValue: parsed.discountValue.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          discountFinalPrice: discountFinalPrice.toFixed(2),
          discountChannel: parsed.channel,
          discountExpiresAt: expiresAt,
          discountMessage: message,
          discountSentAt: new Date(),
          updatedByUserId: req.session.userId,
        },
      );

      logInfo("Abandoned recovery offer sent", {
        source: "abandoned_recovery",
        event: "offer_sent",
        shipmentId: shipment.id,
        recoveryId: recovery.id,
        clientAccountId: shipment.clientAccountId,
        trackingNumber: shipment.trackingNumber,
        channel: parsed.channel,
        deliveryStatus,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue,
        discountAmount,
        finalAmount: discountFinalPrice,
        expiresAt,
      });

      await logAudit(req.session.userId, "send_abandoned_discount", "shipment", shipment.id,
        `Recorded ${parsed.channel} discount offer for abandoned shipment ${shipment.trackingNumber}`, req.ip);

      res.json({ recovery, deliveryStatus });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error sending abandoned shipment discount", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/shipments/:id/abandoned-recovery/reminder", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const parsed = abandonedRecoveryActionSchema.parse(req.body);
      const context = await getAbandonedShipmentForAction(req, res);
      if (!context) return;

      const { shipment, client, recovery: existingRecovery } = context;
      const resumeUrl = buildShipmentResumePaymentUrl(req, shipment.id);
      let deliveryStatus = "queued";
      if (parsed.channel === AbandonedShipmentRecoveryChannel.EMAIL && client?.email) {
        const rendered = await getRenderedTemplate("abandoned_payment_reminder", {
          tracking_number: shipment.trackingNumber,
          resume_url: resumeUrl,
          year: new Date().getFullYear().toString(),
        });
        const sent = rendered
          ? await sendEmail({
              to: client.email,
              subject: rendered.subject,
              html: rendered.html,
            })
          : false;
        deliveryStatus = sent ? "sent" : "email_not_configured";
      }

      const currentReminderCount = existingRecovery?.reminderCount || 0;
      const recovery = await storage.upsertAbandonedShipmentRecoveryByShipmentId(
        shipment.id,
        {
          shipmentId: shipment.id,
          clientAccountId: shipment.clientAccountId,
          status: existingRecovery?.status || AbandonedShipmentRecoveryStatus.NOT_CONTACTED,
          lastAction: `reminder_${deliveryStatus}`,
          reminderChannel: parsed.channel,
          reminderCount: currentReminderCount + 1,
          reminderSentAt: new Date(),
          createdByUserId: req.session.userId,
          updatedByUserId: req.session.userId,
        },
        {
          status: existingRecovery?.status || AbandonedShipmentRecoveryStatus.NOT_CONTACTED,
          lastAction: `reminder_${deliveryStatus}`,
          reminderChannel: parsed.channel,
          reminderCount: currentReminderCount + 1,
          reminderSentAt: new Date(),
          updatedByUserId: req.session.userId,
        },
      );

      await logAudit(req.session.userId, "send_abandoned_reminder", "shipment", shipment.id,
        `Recorded ${parsed.channel} reminder for abandoned shipment ${shipment.trackingNumber}`, req.ip);

      res.json({ recovery, deliveryStatus });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error sending abandoned shipment reminder", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/shipments/:id/abandoned-recovery/dismiss", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const context = await getAbandonedShipmentForAction(req, res);
      if (!context) return;

      const { shipment } = context;
      const recovery = await storage.upsertAbandonedShipmentRecoveryByShipmentId(
        shipment.id,
        {
          shipmentId: shipment.id,
          clientAccountId: shipment.clientAccountId,
          status: AbandonedShipmentRecoveryStatus.DISMISSED,
          lastAction: "dismissed",
          dismissedAt: new Date(),
          createdByUserId: req.session.userId,
          updatedByUserId: req.session.userId,
        },
        {
          status: AbandonedShipmentRecoveryStatus.DISMISSED,
          lastAction: "dismissed",
          dismissedAt: new Date(),
          updatedByUserId: req.session.userId,
        },
      );

      await logAudit(req.session.userId, "dismiss_abandoned_shipment", "shipment", shipment.id,
        `Dismissed abandoned shipment ${shipment.trackingNumber}`, req.ip);

      res.json({ recovery });
    } catch (error) {
      logError("Error dismissing abandoned shipment", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Shipment Status (cancelled is handled by dedicated cancel endpoint)
  const statusUpdateSchema = z.object({
    status: z.enum([
      "created",
      "processing",
      "awaiting_review",
      "booked",
      "supplier_pickup",
      "in_transit",
      "customs_clearance",
      "out_for_delivery",
      "delivered",
    ]),
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
      if (
        shipment.fulfillmentType !== "ddp_manual" &&
        ["awaiting_review", "booked", "supplier_pickup", "customs_clearance", "out_for_delivery"].includes(status)
      ) {
        return res.status(400).json({ error: "This status is only available for manual Door To Door Freight shipments." });
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
      const adminUser = await storage.getUser(req.session.userId!);
      if (!adminUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }

      if (shipment.status === "cancelled") {
        return res.status(400).json({ error: "Shipment already cancelled" });
      }

      if (!canShipmentBeCancelled(shipment)) {
        return res.status(400).json({ error: "Shipments can only be cancelled before the carrier marks them as picked up" });
      }

      if (shipment.carrierTrackingNumber) {
        try {
          const carrierAdapter = getAdapterForShipment(shipment);
          const cancelledWithCarrier = await withBoundIntegrationAccount(
            getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
            shipment.carrierIntegrationAccountId,
            getShipmentIntegrationRoutingOptions(shipment),
            () => carrierAdapter.cancelShipment(
              shipment.carrierTrackingNumber!,
              shipment.senderCountry,
            ),
          );

          if (!cancelledWithCarrier) {
            throw new CarrierError(
              "CANCEL_FAILED",
              "Carrier cancellation could not be confirmed",
            );
          }
        } catch (cancelError) {
          const isCarrierErr = cancelError instanceof CarrierError;
          const errCode = isCarrierErr ? (cancelError as CarrierError).code : "CANCEL_FAILED";
          const carrierDetail = isCarrierErr
            ? (cancelError as CarrierError).carrierMessage
            : (cancelError as Error)?.message || "Carrier cancellation failed";

          logError("Carrier cancel failed", cancelError);
          await storage.updateShipment(id, {
            carrierErrorCode: errCode,
            carrierErrorMessage: `Cancel failed: ${carrierDetail}`,
            carrierLastAttemptAt: new Date(),
          });

          return res.status(502).json({
            error: CARRIER_CANCELLATION_FAILED_MESSAGE,
            carrierErrorCode: errCode,
            carrierErrorMessage: CARRIER_CANCELLATION_FAILED_MESSAGE,
            carrierErrorDetail: carrierDetail,
          });
        }
      }

      // Release the auto-booked courier pickup so no driver arrives for the cancelled shipment.
      if (shipment.carrierTrackingNumber && shipment.pickupConfirmationNumber) {
        const pickupAdapter = getAdapterForShipment(shipment);
        await cancelCarrierPickupIfBooked(
          shipment,
          pickupAdapter,
          getIntegrationAppKeyForCarrier(pickupAdapter.carrierCode),
        );
      }

      const updated = await storage.updateShipment(id, {
        status: "cancelled",
        carrierStatus: "cancelled",
      });

      // Intentionally do NOT touch Zoho on cancellation (no credit note, no delete).
      // Accounting handles the synced invoice manually.

      const refundRequest = updated
        ? await ensureShipmentRefundRequestForCancellation({
            shipment: updated,
            user: adminUser,
            autoRefund: isShipmentStillBooked(updated),
          })
        : null;
      
      await logAudit(req.session.userId, "cancel_shipment", "shipment", id,
        `Cancelled shipment ${shipment.trackingNumber}`, req.ip);
      
      res.json({
        shipment: updated,
        refundRequest,
      });
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
        carrierResponse = await withBoundIntegrationAccount(
          getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
          shipment.carrierIntegrationAccountId,
          getShipmentIntegrationRoutingOptions(shipment),
          () => carrierAdapter.createShipment(preparedShipment.carrierRequest),
        );
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

      // Book the courier pickup (if requested and not already booked) after a successful retry.
      await bookCarrierPickupIfRequested(
        updatedShipment || shipment,
        carrierAdapter,
        getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
      );

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

  app.get("/api/admin/shipments/:id/commercial-invoice.pdf", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }
      if (!hasCommercialInvoiceData(shipment)) {
        return res.status(400).json({ error: "Commercial invoice data is not available for this shipment" });
      }

      const pdfBuffer = renderCommercialInvoicePdfBuffer(shipment);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${shipment.trackingNumber.toLowerCase()}-commercial-invoice.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      logError("Failed to generate admin commercial invoice PDF", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/shipments/:id/commercial-invoice.html", requireAdminPermission("shipments", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (!(await ensureAccountManagerClientAccess(adminUser, shipment.clientAccountId, res))) {
        return;
      }
      if (!hasCommercialInvoiceData(shipment)) {
        return res.status(400).json({ error: "Commercial invoice data is not available for this shipment" });
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderCommercialInvoiceHtml(shipment));
    } catch (error) {
      logError("Failed to generate admin commercial invoice HTML", error);
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
        try {
          const clientAccount = await approveClientApplication(application, {
            profile,
            reviewedByUserId: req.session.userId,
            reviewNotes: notes,
            ipAddress: req.ip,
          });
          res.json({ success: true, clientAccount });
        } catch (error) {
          if (error instanceof EmailInUseError) {
            return res.status(400).json({ error: error.message });
          }
          throw error;
        }
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
      await ensureZohoCustomerForClient(client).catch((error) => {
        logError("Failed to create Zoho customer", error);
      });

      // Create user for the client with a hashed password
      let username = email.split("@")[0];
      let existingUsername = await storage.getUserByUsername(username);
      let counter = 1;
      while (existingUsername) {
        username = `${email.split("@")[0]}${counter}`;
        existingUsername = await storage.getUserByUsername(username);
        counter++;
      }
      
      // Random unusable password — the client sets their own via the welcome email link.
      const hashedPassword = await bcrypt.hash(randomUUID() + randomUUID(), SALT_ROUNDS);
      const createdClientUser = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        phone: (req.body?.phone as string) || null,
        userType: "client",
        clientAccountId: client.id,
        isPrimaryContact: true,
        mustChangePassword: false,
        isActive: true,
      });
      await sendPasswordSetupEmail(createdClientUser, "onboard");

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
              preferredCurrency,
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
        preferredCurrency: preferredCurrency !== undefined ? normalizeCurrency(preferredCurrency) : undefined,
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

  // Admin - Client credit ledger (limit, outstanding, available + transactions)
  app.get("/api/admin/clients/:id/credit", requireAdminPermission("clients", "read"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      const client = await storage.getClientAccount(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      if (!(await ensureAccountManagerClientAccess(adminUser, client.id, res))) {
        return;
      }
      const summary = await storage.getClientCreditSummary(client.id);
      const transactions = await storage.getCreditTransactions(client.id);
      res.json({ creditEnabled: client.creditEnabled, ...summary, transactions });
    } catch (error) {
      logError("Error fetching client credit", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/clients/:id/credit-limit", requireAdminPermission("clients", "update"), async (req, res) => {
    try {
      const adminUser = req.currentUser!;
      if (adminUser.isAccountManager) {
        return res.status(403).json({ error: "Account managers cannot change credit limits" });
      }
      const client = await storage.getClientAccount(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const parsed = z.object({ creditLimitSar: z.coerce.number().min(0).max(100000000) }).parse(req.body || {});
      const updated = await storage.updateClientAccount(req.params.id, {
        creditLimitSar: parsed.creditLimitSar.toFixed(2),
      } as any);
      await logAudit(req.session.userId, "update_credit_limit", "client_account", req.params.id,
        `Set credit limit to SAR ${parsed.creditLimitSar.toFixed(2)} for ${client.name}`, req.ip);
      const summary = await storage.getClientCreditSummary(req.params.id);
      res.json({ client: updated, ...summary });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      }
      logError("Error updating credit limit", error);
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

      const accountingShipments = scopedShipments.filter(isAdminFinancialStatementEligible);
      const excludedLegacyShipmentCount = scopedShipments.length - accountingShipments.length;

      // Attach per-shipment operational expense totals (internal cost) so they flow
      // into both the row serialization and the period aggregates.
      const expenseTotals = await storage.getExpenseTotalsByShipmentIds(
        accountingShipments.map((shipment) => shipment.id),
      );
      for (const shipment of accountingShipments) {
        (shipment as Record<string, any>).__expensesAmountSar = expenseTotals.get(shipment.id) || 0;
      }

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

      // Push the carrier payout as a Zoho expense (no-op without account config).
      const carrierExpenseAccountId = getIntegrationEnv("ZOHO_CARRIER_EXPENSE_ACCOUNT_ID");
      if (carrierExpenseAccountId && !updatedBatch.zohoExpenseId) {
        try {
          await withBoundIntegrationAccount("zoho", null, {}, async () => {
            if (!zohoService.isConfigured()) return;
            const zohoExpenseId = await zohoService.createExpense({
              accountId: carrierExpenseAccountId,
              paidThroughAccountId: getIntegrationEnv("ZOHO_PAID_THROUGH_ACCOUNT_ID") || undefined,
              amount: parseMoneyValue(updatedBatch.totalCarrierCostWithTaxSar),
              date: paidAt.toISOString().split("T")[0],
              description: `Carrier payout ${updatedBatch.carrierName} ${updatedBatch.month}/${updatedBatch.year} (${batchShipments.length} shipments)`,
              referenceNumber: paymentReference || updatedBatch.id,
              currency: "SAR",
            });
            if (zohoExpenseId) {
              await storage.updateCarrierPayoutBatch(batch.id, { zohoExpenseId });
            }
          });
        } catch (error) {
          logError("Failed to sync carrier payout to Zoho", { batchId: batch.id, error: error instanceof Error ? error.message : String(error) });
        }
      }

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

        let extraWeightAmountSar = 0;
        if (parsedWeightValue > 0) {
          if (shipment.fulfillmentType === "ddp_manual" && shipment.ddpPricingLaneId) {
            const ddpChargeQuote = await calculateDdpExtraWeightCharge({
              shipment,
              targetExtraWeightQuantity: parsedWeightValue,
            });
            extraWeightAmountSar = ddpChargeQuote.targetExtraWeightAmountSar;
          } else {
            const ratePerWeight = getExtraFeesRateSarPerWeight(shipment);
            extraWeightAmountSar = roundMoney(parsedWeightValue * ratePerWeight);
          }
        }
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
              weightUnit: getExtraFeesQuantityUnit(shipment),
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

  app.post("/api/admin/ddp/shipments/:id/charges", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });
      if (shipment.fulfillmentType !== "ddp_manual") {
        return res.status(400).json({ error: "Manual Door To Door Freight charges can only be added to Door To Door Freight shipments." });
      }
      const { description, amount } = z.object({
        description: z.string().trim().min(3).max(500),
        amount: z.coerce.number().positive().max(1_000_000),
      }).parse(req.body);
      const invoice = await storage.createInvoice({
        clientAccountId: shipment.clientAccountId,
        shipmentId: shipment.id,
        invoiceType: InvoiceType.DDP_ADJUSTMENT,
        description: `Door To Door Freight adjustment for ${shipment.trackingNumber}: ${description}`,
        amount: formatMoney(amount),
        status: "pending",
        dueDate: new Date(),
      });
      const syncedInvoice = await syncInvoiceToZoho(invoice, shipment);
      await logAudit(req.session.userId, "create_ddp_adjustment", "invoice", invoice.id, `Added SAR ${formatMoney(amount)} DDP adjustment to ${shipment.trackingNumber}`, req.ip);
      res.status(201).json(syncedInvoice);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to add DDP shipment adjustment", error);
      res.status(500).json({ error: "Failed to add Door To Door Freight shipment adjustment" });
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
  // ADMIN - SALES CHANNELS FEATURE REQUESTS
  // ============================================
  app.get("/api/admin/sales-feature-requests", requireAdminPermission("sales-feature-requests", "read"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const result = await storage.getSalesFeatureAccessRequests({ status, page, limit });

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
        }),
      );

      res.json({ ...result, requests: enrichedRequests });
    } catch (error: any) {
      logError("Error fetching sales feature requests", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/sales-feature-requests/:id/approve", requireAdminPermission("sales-feature-requests", "approve"), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const request = await storage.updateSalesFeatureAccessRequest(id, {
        status: "approved",
        adminNotes: adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });
      if (!request) return res.status(404).json({ error: "Request not found" });
      await storage.updateClientAccount(request.clientAccountId, { salesFeaturesEnabled: true } as any);
      await logAudit(req.session.userId, "approve_sales_feature", "sales_feature_access_request", id,
        `Approved Sales Channels access for client ${request.clientAccountId}`, req.ip);
      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error approving sales feature request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/sales-feature-requests/:id/reject", requireAdminPermission("sales-feature-requests", "reject"), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const request = await storage.updateSalesFeatureAccessRequest(id, {
        status: "rejected",
        adminNotes: adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });
      if (!request) return res.status(404).json({ error: "Request not found" });
      await logAudit(req.session.userId, "reject_sales_feature", "sales_feature_access_request", id,
        `Rejected Sales Channels access for client ${request.clientAccountId}`, req.ip);
      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error rejecting sales feature request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/sales-feature-requests/:id/revoke", requireAdminPermission("sales-feature-requests", "revoke"), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      const request = await storage.updateSalesFeatureAccessRequest(id, {
        status: "revoked",
        adminNotes: adminNotes || null,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      });
      if (!request) return res.status(404).json({ error: "Request not found" });
      await storage.updateClientAccount(request.clientAccountId, { salesFeaturesEnabled: false } as any);
      await logAudit(req.session.userId, "revoke_sales_feature", "sales_feature_access_request", id,
        `Revoked Sales Channels access for client ${request.clientAccountId}`, req.ip);
      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error revoking sales feature request", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Direct admin toggle (no client request required) — enable/disable the bundle on a client.
  app.patch("/api/admin/clients/:id/sales-features", requireAdminPermission("clients", "update"), async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = z.object({ enabled: z.boolean() }).parse(req.body || {});
      const client = await storage.getClientAccount(id);
      if (!client) return res.status(404).json({ error: "Client not found" });
      await storage.updateClientAccount(id, { salesFeaturesEnabled: parsed.enabled } as any);

      // If there's an outstanding request, reflect the manual decision on it too.
      const existing = await storage.getSalesFeatureAccessRequestByClient(id);
      if (existing && existing.status === "pending") {
        await storage.updateSalesFeatureAccessRequest(existing.id, {
          status: parsed.enabled ? "approved" : "rejected",
          adminNotes: "Set directly by admin",
          reviewedByUserId: req.session.userId!,
          reviewedAt: new Date(),
        });
      }

      await logAudit(req.session.userId, parsed.enabled ? "enable_sales_feature" : "disable_sales_feature",
        "client", id, `${parsed.enabled ? "Enabled" : "Disabled"} Sales Channels for client ${id}`, req.ip);
      res.json({ success: true, salesFeaturesEnabled: parsed.enabled });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
      logError("Error toggling sales feature", { error: error.message });
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
  const optionalDdpInteger = z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : value,
    z.coerce.number().int().nonnegative().optional(),
  );
  const optionalDdpDecimal = (precision: number) => z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : value,
    z.coerce.number().nonnegative().optional(),
  ).transform((value) => value == null ? null : value.toFixed(precision));
  const isDuplicateDdpLaneError = (error: unknown): boolean =>
    typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  const invalidDdpTransitRange = (lane: {
    airTransitDaysMin?: number | null;
    airTransitDaysMax?: number | null;
    seaTransitDaysMin?: number | null;
    seaTransitDaysMax?: number | null;
  }): string | undefined => {
    if (lane.airTransitDaysMin != null && lane.airTransitDaysMax != null && lane.airTransitDaysMin > lane.airTransitDaysMax) {
      return "Air transit minimum days cannot exceed maximum days.";
    }
    if (lane.seaTransitDaysMin != null && lane.seaTransitDaysMax != null && lane.seaTransitDaysMin > lane.seaTransitDaysMax) {
      return "Sea transit minimum days cannot exceed maximum days.";
    }
    return undefined;
  };

  const ddpPricingLaneSchema = insertDdpPricingLaneSchema.omit({
    originCity: true,
    destinationCity: true,
  }).extend({
    originCountryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
    destinationCountryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("SAR"),
    airBaseRatePerKg: optionalDdpDecimal(2),
    seaBaseRatePerCbm: optionalDdpDecimal(2),
    domesticRatePerKg: optionalDdpDecimal(2),
    airSupplierCostPerKg: optionalDdpDecimal(2),
    seaSupplierCostPerCbm: optionalDdpDecimal(2),
    domesticSupplierCostPerKg: optionalDdpDecimal(2),
    minimumBillableKg: z.coerce.number().nonnegative().transform((value) => value.toFixed(3)),
    kgRoundingIncrement: z.coerce.number().positive().transform((value) => value.toFixed(3)),
    minimumBillableCbm: z.coerce.number().nonnegative().transform((value) => value.toFixed(4)),
    cbmRoundingIncrement: z.coerce.number().positive().transform((value) => value.toFixed(4)),
    minimumShipmentCharge: z.coerce.number().nonnegative().transform((value) => value.toFixed(2)),
    volumetricDivisor: z.coerce.number().int().positive().default(6000),
    airTransitDaysMin: optionalDdpInteger,
    airTransitDaysMax: optionalDdpInteger,
    seaTransitDaysMin: optionalDdpInteger,
    seaTransitDaysMax: optionalDdpInteger,
  });

  app.get("/api/admin/ddp-pricing", requireAdminPermission("pricing-rules", "read"), async (_req, res) => {
    res.json(await storage.getDdpPricingLanes());
  });

  app.post("/api/admin/ddp-pricing", requireAdminPermission("pricing-rules", "create"), async (req, res) => {
    try {
      const lane = ddpPricingLaneSchema.parse(req.body);
      const createAirRate = lane.airEnabled === false ? 0 : Number(lane.airBaseRatePerKg);
      if (createAirRate <= 0 && Number(lane.seaBaseRatePerCbm) <= 0 && Number(lane.domesticRatePerKg) <= 0) {
        return res.status(400).json({ error: "Configure at least one Door To Door Freight transport rate." });
      }
      const transitRangeError = invalidDdpTransitRange(lane);
      if (transitRangeError) {
        return res.status(400).json({ error: transitRangeError });
      }
      const created = await storage.createDdpPricingLane({ ...lane, originCity: "", destinationCity: "" });
      await logAudit(req.session.userId, "create_ddp_lane", "ddp_pricing_lane", created.id, `Created DDP lane ${created.originCountryCode} to ${created.destinationCountryCode}`, req.ip);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (isDuplicateDdpLaneError(error)) {
        return res.status(409).json({ error: "A Door To Door Freight lane already exists for this origin and destination." });
      }
      logError("Failed to create DDP pricing lane", error);
      res.status(500).json({ error: "Failed to create Door To Door Freight pricing lane" });
    }
  });

  app.patch("/api/admin/ddp-pricing/:id", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const updates = ddpPricingLaneSchema.partial().parse(req.body);
      const existingLane = await storage.getDdpPricingLane(req.params.id);
      if (!existingLane) return res.status(404).json({ error: "Door To Door Freight lane not found" });
      const mergedAirEnabled = updates.airEnabled ?? existingLane.airEnabled;
      const updateAirRate = mergedAirEnabled === false ? 0 : Number(updates.airBaseRatePerKg ?? existingLane.airBaseRatePerKg);
      if (updateAirRate <= 0 && Number(updates.seaBaseRatePerCbm ?? existingLane.seaBaseRatePerCbm) <= 0 && Number(updates.domesticRatePerKg ?? existingLane.domesticRatePerKg) <= 0) {
        return res.status(400).json({ error: "Configure at least one Door To Door Freight transport rate." });
      }
      const transitRangeError = invalidDdpTransitRange({ ...existingLane, ...updates });
      if (transitRangeError) {
        return res.status(400).json({ error: transitRangeError });
      }
      const shouldNormalizeLaneScope = updates.originCountryCode !== undefined || updates.destinationCountryCode !== undefined;
      const lane = await storage.updateDdpPricingLane(req.params.id, {
        ...updates,
        ...(shouldNormalizeLaneScope ? { originCity: "", destinationCity: "" } : {}),
      });
      if (!lane) return res.status(404).json({ error: "Door To Door Freight lane not found" });
      await logAudit(req.session.userId, "update_ddp_lane", "ddp_pricing_lane", lane.id, `Updated DDP lane ${lane.originCountryCode} to ${lane.destinationCountryCode}`, req.ip);
      res.json(lane);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (isDuplicateDdpLaneError(error)) {
        return res.status(409).json({ error: "A Door To Door Freight lane already exists for this origin and destination." });
      }
      logError("Failed to update DDP pricing lane", error);
      res.status(500).json({ error: "Failed to update Door To Door Freight pricing lane" });
    }
  });

  app.delete("/api/admin/ddp-pricing/:id", requireAdminPermission("pricing-rules", "delete"), async (req, res) => {
    await storage.deleteDdpPricingLane(req.params.id);
    await logAudit(req.session.userId, "delete_ddp_lane", "ddp_pricing_lane", req.params.id, "Deleted DDP pricing lane", req.ip);
    res.json({ success: true });
  });

  // Local (by-carrier) pricing tiers — markup + optional rate-card base per weight band.
  app.get("/api/admin/local-pricing", requireAdminPermission("pricing-rules", "read"), async (req, res) => {
    const carrierCode = typeof req.query.carrierCode === "string" ? req.query.carrierCode : undefined;
    res.json(await storage.listLocalCarrierPricingTiers(carrierCode));
  });

  app.post("/api/admin/local-pricing", requireAdminPermission("pricing-rules", "create"), async (req, res) => {
    try {
      const tier = insertLocalCarrierPricingTierSchema.parse(req.body);
      if (tier.maxWeightKg != null && Number(tier.maxWeightKg) <= Number(tier.minWeightKg)) {
        return res.status(400).json({ error: "Max weight must be greater than min weight." });
      }
      const created = await storage.createLocalCarrierPricingTier(tier);
      await logAudit(req.session.userId, "create_local_pricing_tier", "local_carrier_pricing_tier", created.id, `Created local pricing tier for ${created.carrierCode}`, req.ip);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create local pricing tier", error);
      res.status(500).json({ error: "Failed to create local pricing tier" });
    }
  });

  app.patch("/api/admin/local-pricing/:id", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const updates = insertLocalCarrierPricingTierSchema.partial().parse(req.body);
      const tier = await storage.updateLocalCarrierPricingTier(req.params.id, updates);
      if (!tier) return res.status(404).json({ error: "Local pricing tier not found" });
      await logAudit(req.session.userId, "update_local_pricing_tier", "local_carrier_pricing_tier", tier.id, `Updated local pricing tier ${tier.carrierCode}`, req.ip);
      res.json(tier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to update local pricing tier", error);
      res.status(500).json({ error: "Failed to update local pricing tier" });
    }
  });

  app.delete("/api/admin/local-pricing/:id", requireAdminPermission("pricing-rules", "delete"), async (req, res) => {
    await storage.deleteLocalCarrierPricingTier(req.params.id);
    await logAudit(req.session.userId, "delete_local_pricing_tier", "local_carrier_pricing_tier", req.params.id, "Deleted local pricing tier", req.ip);
    res.json({ success: true });
  });

  // Virtual carriers — client-facing couriers layered on the Fizzpa/Shipox aggregators.
  // Managed under pricing-rules (each virtual carrier gets its own local-pricing rate card).
  app.get("/api/admin/virtual-carriers", requireAdminPermission("pricing-rules", "read"), async (_req, res) => {
    res.json(await storage.listVirtualCarriers());
  });

  app.post("/api/admin/virtual-carriers", requireAdminPermission("pricing-rules", "create"), async (req, res) => {
    try {
      const payload = insertVirtualCarrierSchema.parse(req.body);
      const existing = await storage.getVirtualCarrierByCode(payload.code);
      if (existing) {
        return res.status(409).json({ error: `A virtual carrier with code ${payload.code.toUpperCase()} already exists.` });
      }
      const created = await storage.createVirtualCarrier(payload);
      await logAudit(req.session.userId, "create_virtual_carrier", "virtual_carrier", created.id, `Created virtual carrier ${created.code} (${created.provider})`, req.ip);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create virtual carrier", error);
      res.status(500).json({ error: "Failed to create virtual carrier" });
    }
  });

  app.patch("/api/admin/virtual-carriers/:id", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const updates = insertVirtualCarrierSchema.partial().parse(req.body);
      if (updates.code) {
        const existing = await storage.getVirtualCarrierByCode(updates.code);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ error: `A virtual carrier with code ${updates.code.toUpperCase()} already exists.` });
        }
      }
      const carrier = await storage.updateVirtualCarrier(req.params.id, updates);
      if (!carrier) return res.status(404).json({ error: "Virtual carrier not found" });
      await logAudit(req.session.userId, "update_virtual_carrier", "virtual_carrier", carrier.id, `Updated virtual carrier ${carrier.code}`, req.ip);
      res.json(carrier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to update virtual carrier", error);
      res.status(500).json({ error: "Failed to update virtual carrier" });
    }
  });

  app.delete("/api/admin/virtual-carriers/:id", requireAdminPermission("pricing-rules", "delete"), async (req, res) => {
    await storage.deleteVirtualCarrier(req.params.id);
    await logAudit(req.session.userId, "delete_virtual_carrier", "virtual_carrier", req.params.id, "Deleted virtual carrier", req.ip);
    res.json({ success: true });
  });

  // ─── Admin quotations — build a priced shipment for a client, who is notified to modify/pay ───
  const quotationAddressSchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    phone: z.string().trim().min(1, "Phone is required"),
    email: z.string().email().optional().or(z.literal("")),
    addressLine1: z.string().trim().min(1, "Address is required"),
    addressLine2: z.string().trim().optional(),
    city: z.string().trim().min(1, "City is required"),
    stateOrProvince: z.string().trim().optional(),
    postalCode: z.string().trim().optional().default(""),
    countryCode: z.string().trim().length(2, "Country code must be 2 characters"),
    shortAddress: z.string().trim().optional(),
  });
  const quotationPricingControls = {
    discountSar: z.number().nonnegative().optional(),
    // Discount as a percent of the client total, or a fixed SAR amount. Resolved to discountSar
    // server-side against the auto client total. Wins over discountSar when provided.
    discountType: z.enum(["percent", "fixed"]).optional(),
    discountValue: z.number().nonnegative().optional(),
    extraChargeSar: z.number().nonnegative().optional(),
    priceOverrideSar: z.number().nonnegative().optional(),
  };
  // Line item (international express + DDP). Mirrors shipmentItemInputSchema, declared here so
  // the admin quotation routes can reference it (they run before that schema is defined).
  const quotationItemSchema = z.object({
    itemName: z.string().min(1),
    itemDescription: z.string().optional(),
    category: z.string().min(1),
    material: z.string().optional(),
    countryOfOrigin: z.string().length(2),
    hsCode: z.string().optional(),
    hsCodeSource: z.enum(["USER", "FEDEX", "HISTORY", "UNKNOWN"]).optional(),
    hsCodeConfidence: z.enum(["HIGH", "MEDIUM", "LOW", "MISSING"]).optional(),
    hsCodeCandidates: z.array(z.object({ code: z.string(), description: z.string(), confidence: z.number() })).optional(),
    price: z.number().nonnegative(),
    quantity: z.number().int().positive(),
    currency: z.string().optional(),
  });
  const quotationCreateSchema = z.object({
    clientAccountId: z.string().uuid("Select a client"),
    type: z.enum(["express", "local", "ddp"]),
    shipper: quotationAddressSchema,
    recipient: quotationAddressSchema,
    packages: z.array(z.object({
      weight: z.number().positive("Weight must be positive"),
      length: z.number().nonnegative().default(0),
      width: z.number().nonnegative().default(0),
      height: z.number().nonnegative().default(0),
    })).min(1, "At least one package is required"),
    weightUnit: z.enum(["KG", "LB"]).default("KG"),
    dimensionUnit: z.enum(["CM", "IN"]).default("CM"),
    carrierCode: z.string().trim().optional(),
    serviceType: z.string().trim().optional(),
    serviceName: z.string().trim().optional(),
    baseRateSar: z.number().nonnegative().optional(),
    carrierIntegrationAccountId: z.string().uuid().optional().nullable(),
    ddpTransportMethod: z.enum([DdpTransportMethod.AIR, DdpTransportMethod.SEA, DdpTransportMethod.DOMESTIC]).optional(),
    totalCbm: z.number().nonnegative().optional(),
    currency: z.string().trim().default("SAR"),
    shipDate: z.string().trim().optional(),
    items: z.array(quotationItemSchema).optional().default([]),
    tradeDocuments: z.array(shipmentTradeDocumentSchema).max(5).optional().default([]),
    supplierName: z.string().trim().optional(),
    supplierPhone: z.string().trim().optional(),
    specialInstructions: z.string().max(2000).optional(),
    note: z.string().max(2000).optional(),
    pickup: pickupInputSchema.optional(),
    sendNotification: z.boolean().default(true),
    ...quotationPricingControls,
  });

  const pricingInputFromQuotation = (data: z.infer<typeof quotationCreateSchema>, clientProfile: string | null) => {
    const totalWeightKg = data.packages.reduce((sum, p) => sum + p.weight, 0);
    const first = data.packages[0];
    return {
      type: data.type,
      clientProfile,
      originCountryCode: data.shipper.countryCode,
      destinationCountryCode: data.recipient.countryCode,
      destinationCity: data.recipient.city,
      weightKg: totalWeightKg,
      pieces: data.packages.length,
      length: first.length,
      width: first.width,
      height: first.height,
      totalCbm: data.totalCbm,
      baseRateSar: data.baseRateSar,
      carrierCode: data.carrierCode,
      ddpTransportMethod: data.ddpTransportMethod,
      discountSar: data.discountSar,
      discountType: data.discountType,
      discountValue: data.discountValue,
      extraChargeSar: data.extraChargeSar,
      priceOverrideSar: data.priceOverrideSar,
    };
  };

  // Read-only pricing preview — reuses the exact rate engines, applies override/discount/extra.
  app.post("/api/admin/quotations/preview", requireAdminPermission("shipments", "create"), async (req, res) => {
    try {
      const data = quotationCreateSchema.parse(req.body);
      const account = await storage.getClientAccount(data.clientAccountId);
      if (!account) return res.status(404).json({ error: "Client account not found" });
      const pricing = await computeQuotationPricing(pricingInputFromQuotation(data, account.profile || null));
      res.json(pricing);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to price quotation" });
    }
  });

  // Rate options for the quotation pricing step — per shipment type. Express returns live
  // carrier service levels; local returns rate-card carriers; DDP returns the lane's methods.
  const quotationRatesSchema = z.object({
    clientAccountId: z.string().uuid(),
    type: z.enum(["express", "local", "ddp"]),
    shipper: quotationAddressSchema,
    recipient: quotationAddressSchema,
    packages: z.array(z.object({
      weight: z.number().positive(), length: z.number().nonnegative().default(0),
      width: z.number().nonnegative().default(0), height: z.number().nonnegative().default(0),
    })).min(1),
    weightUnit: z.enum(["KG", "LB"]).default("KG"),
    dimensionUnit: z.enum(["CM", "IN"]).default("CM"),
  });

  app.post("/api/admin/quotations/rates", requireAdminPermission("shipments", "create"), async (req, res) => {
    try {
      const data = quotationRatesSchema.parse(req.body);
      const account = await storage.getClientAccount(data.clientAccountId);
      if (!account) return res.status(404).json({ error: "Client account not found" });
      const profile = account.profile || null;
      const origin = data.shipper.countryCode.toUpperCase();
      const destination = data.recipient.countryCode.toUpperCase();
      const totalWeightKg = data.packages.reduce((s, p) => s + p.weight, 0);
      const first = data.packages[0];
      const options: Array<Record<string, unknown>> = [];

      if (data.type === "local") {
        const localPricingRule = profile ? await storage.getPricingRuleByProfile(profile) : undefined;
        const carriers = [
          ...carrierService.getLocalCarriers("SA").map((a) => ({ code: a.carrierCode, name: a.name, adapter: a as CarrierAdapter })),
          ...(await storage.listVirtualCarriers(true)).map((vc) => ({ code: vc.code, name: vc.name, adapter: undefined as CarrierAdapter | undefined })),
        ];
        for (const carrier of carriers) {
          // Real local adapters with a live domestic rate API (iMile) are priced live when no
          // rate card exists; virtual carriers and card-backed carriers keep the rate card.
          const liveBaseRateSar = carrier.adapter
            ? await resolveLiveLocalBaseRate(carrier.adapter, data.shipper.city, data.recipient.city, totalWeightKg)
            : null;
          const liveFallbackMarginPercent =
            liveBaseRateSar != null && liveBaseRateSar > 0
              ? localPricingRule
                ? await storage.getMarginForAmount(localPricingRule.id, liveBaseRateSar)
                : 20
              : null;
          const local = await resolveLocalRate({ carrierCode: carrier.code, weightKg: totalWeightKg, clientProfile: profile, liveBaseRateSar, liveFallbackMarginPercent });
          if (!local) continue;
          const snap = calculateShipmentAccounting({ shipmentType: "domestic", isDdp: false, recipientCountryCode: "SA", baseRate: local.baseRate, marginAmount: local.marginAmount });
          options.push({ carrierCode: carrier.code, carrierName: carrier.name, serviceName: `${carrier.name} Domestic`, baseRate: local.baseRate, clientTotal: snap.clientTotalAmountSar });
        }
      } else if (data.type === "ddp") {
        const lane = await storage.findDdpPricingLane({ originCountryCode: origin, destinationCountryCode: destination, destinationCity: data.recipient.city });
        if (lane && lane.isActive) {
          const methods: DdpTransportMethodValue[] = [];
          if (lane.airEnabled !== false && Number(lane.airBaseRatePerKg) > 0) methods.push(DdpTransportMethod.AIR);
          if (Number(lane.seaBaseRatePerCbm) > 0) methods.push(DdpTransportMethod.SEA);
          if (Number(lane.domesticRatePerKg) > 0) methods.push(DdpTransportMethod.DOMESTIC);
          for (const transportMethod of methods) {
            try {
              const pricing = await computeQuotationPricing({
                type: "ddp", clientProfile: profile, originCountryCode: origin, destinationCountryCode: destination,
                destinationCity: data.recipient.city, weightKg: totalWeightKg, pieces: data.packages.length,
                length: first.length, width: first.width, height: first.height, ddpTransportMethod: transportMethod,
              });
              options.push({ ddpTransportMethod: transportMethod, serviceName: `Door To Door Freight ${transportMethod}`, baseRate: pricing.baseRate, clientTotal: pricing.clientTotalSar });
            } catch { /* method not priceable */ }
          }
        }
      } else {
        // express — live carrier rates using the admin-entered real addresses.
        const rateRequest = {
          shipper: { name: data.shipper.name, streetLine1: data.shipper.addressLine1, city: data.shipper.city, stateOrProvince: data.shipper.stateOrProvince || undefined, postalCode: data.shipper.postalCode || "", countryCode: origin, phone: data.shipper.phone },
          recipient: { name: data.recipient.name, streetLine1: data.recipient.addressLine1, city: data.recipient.city, stateOrProvince: data.recipient.stateOrProvince || undefined, postalCode: data.recipient.postalCode || "", countryCode: destination, phone: data.recipient.phone },
          packages: data.packages.map((p) => ({ weight: p.weight, weightUnit: data.weightUnit, dimensions: { length: p.length, width: p.width, height: p.height, unit: data.dimensionUnit }, packageType: "YOUR_PACKAGING" })),
          serviceType: "", packagingType: "YOUR_PACKAGING", currency: "SAR",
        };
        const routingOptions = { shipperCountryCode: origin, recipientCountryCode: destination, clientAccountId: data.clientAccountId };
        const intlCarriers = carrierService.getSupportedCarriers().filter((a) => !a.capabilities || a.capabilities.type !== "local");
        const pricingRule = profile ? await storage.getPricingRuleByProfile(profile) : undefined;
        const expressShipmentType = origin === destination ? "domestic" : destination === "SA" ? "inbound" : "outbound";
        await Promise.all(intlCarriers.map(async (adapter) => {
          try {
            const appKey = getIntegrationAppKeyForCarrier(adapter.carrierCode);
            const accounts = await getEligibleIntegrationAccountsForShipment(appKey, routingOptions);
            const results: Array<{ integrationAccountId: string; carrierRates: Awaited<ReturnType<CarrierAdapter["getRates"]>> }> = [];
            for (const acc of accounts) {
              try { results.push({ integrationAccountId: acc.id, carrierRates: await withIntegrationAccount(acc, () => adapter.getRates(rateRequest)) }); } catch { /* skip */ }
            }
            if (accounts.length === 0 && (process.env.NODE_ENV !== "production" || adapter.isConfigured())) {
              try { results.push({ integrationAccountId: `env:${appKey}`, carrierRates: await adapter.getRates(rateRequest) }); } catch { /* skip */ }
            }
            const rates = selectCheapestCarrierAccountPortfolio(results)?.carrierRates || [];
            for (const rate of rates) {
              if (!Number.isFinite(rate.baseRate) || rate.baseRate <= 0) continue;
              const marginPct = pricingRule ? await storage.getMarginForAmount(pricingRule.id, rate.baseRate) : 20;
              const snap = calculateShipmentAccounting({ shipmentType: expressShipmentType, isDdp: false, recipientCountryCode: destination, baseRate: rate.baseRate, marginAmount: rate.baseRate * (marginPct / 100) });
              options.push({ carrierCode: adapter.carrierCode, carrierName: adapter.name, serviceType: rate.serviceType, serviceName: rate.serviceName, baseRate: rate.baseRate, clientTotal: snap.clientTotalAmountSar, transitDays: rate.transitDays ?? null });
            }
          } catch { /* carrier skipped */ }
        }));
      }

      options.sort((a, b) => Number(a.clientTotal) - Number(b.clientTotal));
      res.json({ options });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to load quotation rate options", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load rates" });
    }
  });

  // Selected client's account for the reused create-shipment flow in quotation mode
  // (mirrors GET /api/client/account, but admin-gated for an arbitrary client).
  app.get("/api/admin/quotations/client/:clientAccountId", requireAdminPermission("shipments", "create"), async (req, res) => {
    const account = await storage.getClientAccount(req.params.clientAccountId);
    if (!account) return res.status(404).json({ error: "Client account not found" });
    res.json(account);
  });

  // DDP lanes for the reused DDP flow in quotation mode (mirrors GET /api/client/ddp/lanes).
  app.get("/api/admin/quotations/ddp-lanes", requireAdminPermission("shipments", "create"), async (_req, res) => {
    const lanes = (await storage.getDdpPricingLanes()).filter(
      (lane) => lane.isActive && !lane.originCity?.trim() && !lane.destinationCity?.trim(),
    );
    res.json(lanes.map((lane) => ({
      id: lane.id,
      originCountryCode: lane.originCountryCode,
      originCity: lane.originCity,
      destinationCountryCode: lane.destinationCountryCode,
      destinationCity: lane.destinationCity,
      airAvailable: lane.airEnabled !== false && Number(lane.airBaseRatePerKg) > 0,
      seaAvailable: Number(lane.seaBaseRatePerCbm) > 0,
      domesticAvailable: Number(lane.domesticRatePerKg) > 0,
    })));
  });

  // DDP rate for the reused DDP flow in quotation mode — mirrors POST /api/client/ddp/rates
  // (full per-package breakdown) but returns the with-VAT total the client will actually pay.
  const ddpQuotationRatesSchema = z.object({
    clientAccountId: z.string().uuid(),
    transportMethod: z.enum([DdpTransportMethod.AIR, DdpTransportMethod.SEA, DdpTransportMethod.DOMESTIC]),
    shipper: z.object({ countryCode: z.string().length(2) }),
    recipient: z.object({ countryCode: z.string().length(2), city: z.string().optional() }),
    packages: z.array(z.object({
      weight: z.number().nonnegative(), length: z.number().nonnegative().default(0),
      width: z.number().nonnegative().default(0), height: z.number().nonnegative().default(0),
    })).default([]),
    totalCbm: z.number().nonnegative().optional(),
  });

  app.post("/api/admin/quotations/ddp-rates", requireAdminPermission("shipments", "create"), async (req, res) => {
    try {
      const data = ddpQuotationRatesSchema.parse(req.body);
      const account = await storage.getClientAccount(data.clientAccountId);
      if (!account) return res.status(404).json({ error: "Client account not found" });
      const lane = await storage.findDdpPricingLane({
        originCountryCode: data.shipper.countryCode,
        destinationCountryCode: data.recipient.countryCode,
        destinationCity: data.recipient.city,
      });
      if (!lane) return res.status(404).json({ error: "Door To Door Freight pricing is not configured for this origin and destination yet." });
      const pricingRule = account.profile ? await storage.getPricingRuleByProfile(account.profile) : undefined;
      const base = calculateDdpPrice({ lane, transportMethod: data.transportMethod, packages: data.packages, totalCbm: data.totalCbm, markupPercentage: 0 });
      const markupPercentage = pricingRule ? await storage.getDdpMarginForQuantity(pricingRule.id, base.billingUnit, base.billableQuantity) : 0;
      const pricing = calculateDdpPrice({ lane, transportMethod: data.transportMethod, packages: data.packages, totalCbm: data.totalCbm, markupPercentage });
      // With-VAT total (margin VAT) — matches what the created quote charges the client.
      const snapshot = calculateShipmentAccounting({ shipmentType: "inbound", isDdp: true, recipientCountryCode: lane.destinationCountryCode || "SA", baseRate: pricing.baseRateSar, marginAmount: pricing.markupAmountSar });
      res.json({
        quoteId: "ddp-quote",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        pricing: { ...pricing, totalAmountSar: snapshot.clientTotalAmountSar },
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to price Door To Door Freight" });
    }
  });

  // Admin AI document extraction for the quotation wizard — same engines as the client flow.
  const quotationExtractSchema = z.object({
    clientAccountId: z.string().uuid(),
    shipperCountryCode: z.string().length(2),
    recipientCountryCode: z.string().length(2).optional(),
    shipmentType: z.enum(["domestic", "inbound", "outbound"]).default("inbound"),
    fileName: z.string().min(1),
    objectPath: z.string().min(1),
    contentType: z.string().min(1),
  });

  app.post("/api/admin/quotations/extract-invoice-items", requireAdminPermission("shipments", "create"), async (req, res) => {
    try {
      const data = quotationExtractSchema.parse(req.body);
      const destinationCountry = data.shipmentType === "inbound" ? data.recipientCountryCode || "SA" : data.recipientCountryCode || data.shipperCountryCode || "SA";
      const extraction = await withShipmentIntegrationAccount("gemini", { shipperCountryCode: data.shipperCountryCode, recipientCountryCode: destinationCountry },
        () => extractInvoiceItemsFromDocument({ fileName: data.fileName, objectPath: data.objectPath, contentType: data.contentType }, { fallbackCountryOfOrigin: data.shipperCountryCode, fallbackCurrency: "SAR" }));
      const hsEnrichment = await withShipmentIntegrationAccount("fedex", { shipperCountryCode: data.shipperCountryCode, recipientCountryCode: destinationCountry },
        () => enrichInvoiceItemsWithHsCodes(extraction.items, { clientAccountId: data.clientAccountId, destinationCountry }));
      const { warnings, ...rest } = extraction;
      res.json({ ...rest, items: hsEnrichment.items, summary: { importedItemCount: hsEnrichment.items.length, aiAssisted: extraction.extractionMethod === "gemini", hasParsingWarnings: warnings.length > 0 } });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      res.status(422).json({ error: error instanceof Error ? error.message : "Failed to extract invoice items" });
    }
  });

  app.post("/api/admin/quotations/extract-package-details", requireAdminPermission("shipments", "create"), async (req, res) => {
    try {
      const data = quotationExtractSchema.parse(req.body);
      const destinationCountry = data.shipmentType === "inbound" ? data.recipientCountryCode || "SA" : data.recipientCountryCode || data.shipperCountryCode || "SA";
      const extraction = await withShipmentIntegrationAccount("gemini", { shipperCountryCode: data.shipperCountryCode, recipientCountryCode: destinationCountry },
        () => extractPackageDetailsFromDocument({ fileName: data.fileName, objectPath: data.objectPath, contentType: data.contentType }));
      res.json(extraction);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      res.status(422).json({ error: error instanceof Error ? error.message : "Failed to extract package details" });
    }
  });

  // Create the quotation: a payment_pending shipment owned by the client, then notify them.
  app.post("/api/admin/quotations", requireAdminPermission("shipments", "create"), async (req, res) => {
    try {
      const data = quotationCreateSchema.parse(req.body);
      const account = await storage.getClientAccount(data.clientAccountId);
      if (!account) return res.status(404).json({ error: "Client account not found" });

      const pricing = await computeQuotationPricing(pricingInputFromQuotation(data, account.profile || null));
      const snapshot = calculateShipmentAccounting({
        shipmentType: pricing.shipmentType,
        isDdp: pricing.isDdp,
        recipientCountryCode: data.recipient.countryCode,
        baseRate: pricing.baseRate,
        marginAmount: pricing.marginAmount,
        // Only apply the discount/extra to the snapshot when the margin is the full list markup
        // (no explicit price override) — mirrors computeQuotationPricing so stored totals match.
        ...(data.priceOverrideSar != null && data.priceOverrideSar >= 0
          ? {}
          : { discountSar: pricing.discountSar, extraChargeSar: pricing.extraChargeSar }),
      });

      const totalWeightKg = data.packages.reduce((sum, p) => sum + p.weight, 0);
      const first = data.packages[0];
      const fulfillmentType = data.type === "local" ? "local" : data.type === "ddp" ? "ddp_manual" : undefined;

      // International express + DDP require line items (customs/commercial invoice) and a
      // commercial-invoice document; HS codes are auto-enriched. DDP requires a supplier.
      const isInternationalQuote = data.type === "ddp" || (data.type === "express" && data.shipper.countryCode !== data.recipient.countryCode);
      let quoteItems: any[] = data.items || [];
      if (isInternationalQuote) {
        if (quoteItems.length === 0) {
          return res.status(400).json({ error: "At least one line item is required for international / Door To Door Freight quotations." });
        }
        if (!data.tradeDocuments.some((d) => d.documentType === FedExTradeDocumentType.COMMERCIAL_INVOICE)) {
          return res.status(400).json({ error: "A commercial invoice document is required for international / Door To Door Freight quotations." });
        }
        if (data.type === "ddp" && (!data.supplierName?.trim() || !data.supplierPhone?.trim())) {
          return res.status(400).json({ error: "Supplier name and phone are required for Door To Door Freight quotations." });
        }
        const enriched = await enrichItemsWithHsCodes(quoteItems, { clientAccountId: data.clientAccountId, destinationCountry: data.recipient.countryCode });
        quoteItems = enriched.items;
        if (data.carrierCode === "DHL" && quoteItems.some((it) => !it.hsCode?.trim())) {
          return res.status(400).json({ error: "DHL requires an HS code for every item. Review the classifications and try again." });
        }
      }

      const shipment = await storage.createShipment({
        clientAccountId: data.clientAccountId,
        senderName: data.shipper.name,
        senderCompany: (data.shipper as any).company || null,
        senderAddress: data.shipper.addressLine1,
        senderAddressLine2: data.shipper.addressLine2 || null,
        senderCity: data.shipper.city,
        senderStateOrProvince: data.shipper.stateOrProvince || null,
        senderPostalCode: data.shipper.postalCode || null,
        senderCountry: data.shipper.countryCode,
        senderPhone: data.shipper.phone,
        senderEmail: data.shipper.email || null,
        senderShortAddress: data.shipper.shortAddress || null,
        recipientName: data.recipient.name,
        recipientCompany: (data.recipient as any).company || null,
        recipientAddress: data.recipient.addressLine1,
        recipientAddressLine2: data.recipient.addressLine2 || null,
        recipientCity: data.recipient.city,
        recipientStateOrProvince: data.recipient.stateOrProvince || null,
        recipientPostalCode: data.recipient.postalCode || null,
        recipientCountry: data.recipient.countryCode,
        recipientPhone: data.recipient.phone,
        recipientEmail: data.recipient.email || null,
        recipientShortAddress: data.recipient.shortAddress || null,
        weight: totalWeightKg.toString(),
        weightUnit: data.weightUnit,
        length: first.length.toString(),
        width: first.width.toString(),
        height: first.height.toString(),
        dimensionUnit: data.dimensionUnit,
        packageType: "PARCEL",
        numberOfPackages: data.packages.length,
        packagesData: JSON.stringify(data.packages),
        itemsData: quoteItems.length ? JSON.stringify(quoteItems) : undefined,
        tradeDocumentsData: data.tradeDocuments?.length ? JSON.stringify(data.tradeDocuments) : undefined,
        shipmentType: pricing.shipmentType,
        fulfillmentType,
        ...(data.type === "ddp" ? {
          ddpTransportMethod: data.ddpTransportMethod || DdpTransportMethod.AIR,
          ddpSupplierName: data.supplierName || null,
          ddpSupplierPhone: data.supplierPhone || null,
          ddpSpecialInstructions: data.specialInstructions || null,
        } : {}),
        serviceType: data.serviceType || null,
        currency: data.currency || "SAR",
        status: "payment_pending",
        baseRate: pricing.baseRate.toFixed(2),
        marginAmount: pricing.marginAmount.toFixed(2),
        margin: pricing.marginAmount.toFixed(2),
        finalPrice: pricing.clientTotalSar.toFixed(2),
        ...getShipmentAccountingInsert(snapshot),
        ...(pricing.supplierCostSar != null ? { ddpSupplierCostSar: pricing.supplierCostSar.toFixed(2) } : {}),
        carrierCode: data.carrierCode || null,
        carrierName: data.serviceName || data.carrierCode || null,
        carrierIntegrationAccountId: data.carrierIntegrationAccountId || null,
        carrierServiceType: data.serviceType || null,
        paymentStatus: "pending",
        isQuote: true,
        quoteCreatedByUserId: req.session.userId,
        quoteDiscountSar: pricing.discountSar ? pricing.discountSar.toFixed(2) : null,
        quoteExtraChargeSar: pricing.extraChargeSar ? pricing.extraChargeSar.toFixed(2) : null,
        quoteNote: data.note || null,
        ...(data.type === "express" ? expressPickupInsertFields(data.pickup) : pickupInsertFields(undefined)),
      });

      await logAudit(req.session.userId, "create_quotation", "shipment", shipment.id,
        `Created quotation ${shipment.trackingNumber} for client ${account.name} (SAR ${pricing.clientTotalSar.toFixed(2)})`, req.ip);

      if (data.sendNotification !== false) {
        const appBaseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002";
        const clientUsers = (await storage.getUsersByClientAccount(data.clientAccountId)).filter((u) => u.isActive);
        const recipients = clientUsers.filter((u) => u.isPrimaryContact).length
          ? clientUsers.filter((u) => u.isPrimaryContact)
          : clientUsers;
        if (recipients.length > 0) {
          await notifyUsers(recipients.map((u) => u.id), {
            title: "New quotation ready to pay",
            body: `A quotation for ${data.recipient.city}, ${data.recipient.countryCode} (${shipment.trackingNumber}) is ready — total SAR ${pricing.clientTotalSar.toFixed(2)}. Review, modify if needed, and pay.`,
            type: "quotation_created",
            entityType: "shipment",
            entityId: shipment.id,
            actionUrl: `${appBaseUrl}/client/quotations/${shipment.id}`,
            sendEmail: true,
          });
        }
      }

      res.status(201).json({ shipmentId: shipment.id, trackingNumber: shipment.trackingNumber, pricing });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to create quotation", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create quotation" });
    }
  });

  app.get("/api/admin/pricing", requireAdminPermission("pricing-rules", "read"), async (_req, res) => {
    const rules = await storage.getPricingRules();
    res.json(rules);
  });

  // Admin - Pricing Preview (read-only price simulator; performs NO DB writes).
  // Reuses the exact production rate engines so admins can verify config without
  // creating a shipment. Mirrors resolveLocalRate / getMarginForAmount / calculateDdpPrice
  // and calculateShipmentAccounting (15% VAT per tax scenario).
  app.post("/api/admin/pricing/preview", requireAdminPermission("pricing-rules", "read"), async (req, res) => {
    try {
      const body = req.body ?? {};
      const type = String(body.type || "");
      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

      if (type === "local") {
        const carrierCode = String(body.carrierCode || "").trim();
        const weightKg = Number(body.weightKg);
        if (!carrierCode || !Number.isFinite(weightKg) || weightKg < 0) {
          return res.status(400).json({ message: "Provide a carrier and a non-negative weight." });
        }
        const liveBaseRateSar =
          body.baseRate === "" || body.baseRate == null ? null : Number(body.baseRate);
        const local = await resolveLocalRate({
          carrierCode,
          weightKg,
          clientProfile: body.profile || null,
          liveBaseRateSar: Number.isFinite(liveBaseRateSar as number) ? liveBaseRateSar : null,
        });
        if (!local) {
          return res.status(422).json({
            message:
              "No enabled tier covers this carrier / weight / profile (and no rate-card base to fall back on).",
          });
        }
        const snapshot = calculateShipmentAccounting({
          shipmentType: "domestic",
          recipientCountryCode: "SA",
          baseRate: local.baseRate,
          marginAmount: local.marginAmount,
        });
        return res.json({
          type,
          baseRate: local.baseRate,
          markup: local.marginAmount,
          vat: snapshot.sellTaxAmountSar,
          vatMode: "full",
          clientTotal: snapshot.clientTotalAmountSar,
        });
      }

      if (type === "express") {
        const baseRate = Number(body.baseRate);
        if (!Number.isFinite(baseRate) || baseRate < 0) {
          return res.status(400).json({ message: "Provide a non-negative carrier base rate." });
        }
        const shipmentType = body.shipmentType === "outbound" ? "outbound" : "inbound";
        const recipientCountryCode = String(body.recipientCountryCode || "SA").trim().toUpperCase() || "SA";
        const rule = body.profile ? await storage.getPricingRuleByProfile(String(body.profile)) : undefined;
        const marginPercentage = rule
          ? await storage.getMarginForAmount(rule.id, baseRate)
          : 15;
        const markup = round2(baseRate * (marginPercentage / 100));
        const snapshot = calculateShipmentAccounting({
          shipmentType,
          recipientCountryCode,
          baseRate,
          marginAmount: markup,
        });
        return res.json({
          type,
          baseRate: round2(baseRate),
          markup,
          markupPercentage: marginPercentage,
          vat: snapshot.sellTaxAmountSar,
          vatMode: "margin",
          clientTotal: snapshot.clientTotalAmountSar,
        });
      }

      if (type === "ddp") {
        const laneId = String(body.laneId || "");
        const lane = laneId ? await storage.getDdpPricingLane(laneId) : undefined;
        if (!lane) {
          return res.status(404).json({ message: "Door To Door Freight lane not found." });
        }
        const transportMethod =
          body.transportMethod === DdpTransportMethod.SEA
            ? DdpTransportMethod.SEA
            : body.transportMethod === DdpTransportMethod.DOMESTIC
              ? DdpTransportMethod.DOMESTIC
              : DdpTransportMethod.AIR;
        // Air and domestic are KG-billed (need package weight); sea is CBM-billed.
        const isKgBilled = transportMethod !== DdpTransportMethod.SEA;
        const weightKg = Number(body.weightKg) || 0;
        const totalCbm = Number(body.totalCbm) || 0;
        const packages = isKgBilled
          ? [{ weight: weightKg, length: Number(body.length) || 0, width: Number(body.width) || 0, height: Number(body.height) || 0 }]
          : [];
        // Pass 1: billable quantity at zero markup, to resolve the DDP tier.
        const basePricing = calculateDdpPrice({ lane, transportMethod, packages, totalCbm, markupPercentage: 0 });
        const rule = body.profile ? await storage.getPricingRuleByProfile(String(body.profile)) : undefined;
        const markupPercentage = rule
          ? await storage.getDdpMarginForQuantity(rule.id, basePricing.billingUnit, basePricing.billableQuantity)
          : 0;
        // Pass 2: final quote with the resolved markup.
        const quote = calculateDdpPrice({ lane, transportMethod, packages, totalCbm, markupPercentage });
        const snapshot = calculateShipmentAccounting({
          shipmentType: "inbound",
          isDdp: true,
          recipientCountryCode: lane.destinationCountryCode || "SA",
          baseRate: quote.baseRateSar,
          marginAmount: quote.markupAmountSar,
        });
        return res.json({
          type,
          baseRate: quote.baseRateSar,
          markup: quote.markupAmountSar,
          markupPercentage: quote.markupPercentage,
          billingUnit: quote.billingUnit,
          billableQuantity: quote.billableQuantity,
          ratePerUnit: quote.ratePerUnitSar,
          supplierCostPerUnit: quote.supplierCostPerUnitSar,
          supplierCost: quote.supplierCostSar,
          trueMargin: quote.trueMarginSar,
          minChargeApplied: quote.baseRateSar > quote.subtotalBeforeMinimumSar,
          vat: snapshot.sellTaxAmountSar,
          vatMode: "margin",
          clientTotal: snapshot.clientTotalAmountSar,
        });
      }

      return res.status(400).json({ message: "Unknown preview type. Expected local, express, or ddp." });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Preview failed" });
    }
  });

  app.get("/api/profile-badges", requireAuth, async (_req, res) => {
    const rules = await storage.getPricingRules();
    res.json(
      rules
        .filter((rule) => rule.isActive)
        .map((rule) => ({
          profile: rule.profile,
          displayName: rule.displayName,
          badgeColor: rule.badgeColor,
          badgeStyle: rule.badgeStyle,
          badgeGradientFrom: rule.badgeGradientFrom,
          badgeGradientTo: rule.badgeGradientTo,
          badgeGradientAngle: rule.badgeGradientAngle,
          badgeIcon: rule.badgeIcon,
        })),
    );
  });

  // Admin - Create Pricing Profile
  app.post("/api/admin/pricing", requireAdminPermission("pricing-rules", "create"), async (req, res) => {
    try {
      const {
        profile,
        displayName,
        marginPercentage,
        ddpMarginPercentage,
        badgeColor,
        badgeStyle,
        badgeGradientFrom,
        badgeGradientTo,
        badgeGradientAngle,
        badgeIcon,
      } = req.body;
      
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
      const ddpMargin = parseFloat(ddpMarginPercentage || marginPercentage || "15");
      if (isNaN(ddpMargin) || ddpMargin < 0 || ddpMargin > 100) {
        return res.status(400).json({ error: "Invalid Door To Door Freight markup percentage" });
      }

      const normalizedBadgeColor = normalizeBadgeColor(badgeColor);
      if (badgeColor !== undefined && !normalizedBadgeColor) {
        return res.status(400).json({ error: "Invalid badge color" });
      }
      const normalizedBadgeStyle = normalizeBadgeStyle(badgeStyle);
      const normalizedGradientFrom = normalizeBadgeColor(badgeGradientFrom);
      const normalizedGradientTo = normalizeBadgeColor(badgeGradientTo);
      if (normalizedBadgeStyle === "gradient" && (!normalizedGradientFrom || !normalizedGradientTo)) {
        return res.status(400).json({ error: "Invalid badge gradient colors" });
      }

      const newRule = await storage.createPricingRule({
        profile: profileKey,
        displayName: displayName.trim(),
        marginPercentage: margin.toFixed(2),
        ddpMarginPercentage: ddpMargin.toFixed(2),
        badgeColor: normalizedBadgeColor || "#6B7280",
        badgeStyle: normalizedBadgeStyle,
        badgeGradientFrom: normalizedGradientFrom,
        badgeGradientTo: normalizedGradientTo,
        badgeGradientAngle: normalizeBadgeGradientAngle(badgeGradientAngle),
        badgeIcon: normalizeBadgeIcon(badgeIcon),
        isActive: true,
      });

      await logAudit(req.session.userId, "create_pricing_profile", "pricing_rule", newRule.id,
        `Created pricing profile: ${displayName} with ${margin}% margin and ${newRule.badgeStyle} badge styling`, req.ip);

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
      const {
        marginPercentage,
        ddpMarginPercentage,
        displayName,
        isActive,
        badgeColor,
        badgeStyle,
        badgeGradientFrom,
        badgeGradientTo,
        badgeGradientAngle,
        badgeIcon,
      } = req.body;
      
      const updates: {
        marginPercentage?: string;
        ddpMarginPercentage?: string;
        displayName?: string;
        isActive?: boolean;
        badgeColor?: string | null;
        badgeStyle?: "solid" | "gradient";
        badgeGradientFrom?: string | null;
        badgeGradientTo?: string | null;
        badgeGradientAngle?: number;
        badgeIcon?: string;
      } = {};

      if (marginPercentage !== undefined) {
        const margin = parseFloat(marginPercentage);
        if (isNaN(margin) || margin < 0 || margin > 100) {
          return res.status(400).json({ error: "Invalid margin percentage" });
        }
        updates.marginPercentage = margin.toFixed(2);
      }
      if (ddpMarginPercentage !== undefined) {
        const ddpMargin = parseFloat(ddpMarginPercentage);
        if (isNaN(ddpMargin) || ddpMargin < 0 || ddpMargin > 100) {
          return res.status(400).json({ error: "Invalid Door To Door Freight markup percentage" });
        }
        updates.ddpMarginPercentage = ddpMargin.toFixed(2);
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

      if (badgeColor !== undefined) {
        const normalizedBadgeColor = normalizeBadgeColor(badgeColor);
        if (!normalizedBadgeColor) {
          return res.status(400).json({ error: "Invalid badge color" });
        }
        updates.badgeColor = normalizedBadgeColor;
      }

      if (badgeStyle !== undefined) {
        updates.badgeStyle = normalizeBadgeStyle(badgeStyle);
      }

      if (badgeGradientFrom !== undefined) {
        const normalizedGradientFrom = normalizeBadgeColor(badgeGradientFrom);
        if (!normalizedGradientFrom) {
          return res.status(400).json({ error: "Invalid gradient start color" });
        }
        updates.badgeGradientFrom = normalizedGradientFrom;
      }

      if (badgeGradientTo !== undefined) {
        const normalizedGradientTo = normalizeBadgeColor(badgeGradientTo);
        if (!normalizedGradientTo) {
          return res.status(400).json({ error: "Invalid gradient end color" });
        }
        updates.badgeGradientTo = normalizedGradientTo;
      }

      if (badgeGradientAngle !== undefined) {
        updates.badgeGradientAngle = normalizeBadgeGradientAngle(badgeGradientAngle);
      }

      if (badgeIcon !== undefined) {
        updates.badgeIcon = normalizeBadgeIcon(badgeIcon);
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
      if (updates.ddpMarginPercentage) changeDetails.push(`DDP markup to ${updates.ddpMarginPercentage}%`);
      if (updates.displayName) changeDetails.push(`name to "${updates.displayName}"`);
      if (updates.isActive !== undefined) changeDetails.push(`active to ${updates.isActive}`);
      if (updates.badgeColor) changeDetails.push(`badge color to ${updates.badgeColor}`);
      if (updates.badgeStyle) changeDetails.push(`badge style to ${updates.badgeStyle}`);
      if (updates.badgeIcon) changeDetails.push(`badge icon to ${updates.badgeIcon}`);

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
  const ddpPricingTierSchema = pricingTierSchema.extend({
    billingUnit: z.enum(["KG", "CBM"]),
  });
  const ddpPricingTierUpdateSchema = pricingTierUpdateSchema.extend({
    billingUnit: z.enum(["KG", "CBM"]).optional(),
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

  // Admin - DDP Pricing Tiers
  app.get("/api/admin/pricing/:id/ddp-tiers", requireAdminPermission("pricing-rules", "read"), async (req, res) => {
    try {
      res.json(await storage.getDdpPricingTiersByProfileId(req.params.id));
    } catch (error) {
      logError("Error fetching DDP pricing tiers", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/pricing/:id/ddp-tiers", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const { billingUnit, minAmount, marginPercentage } = ddpPricingTierSchema.parse(req.body);
      const profile = await storage.getPricingRuleById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Pricing profile not found" });
      }

      const tier = await storage.createDdpPricingTier({
        profileId: profile.id,
        billingUnit,
        minAmount: String(minAmount),
        marginPercentage: String(marginPercentage),
      });
      await logAudit(req.session.userId, "create_ddp_pricing_tier", "ddp_pricing_tier", tier.id,
        `Created DDP pricing tier for ${profile.displayName}: ${minAmount}+ ${billingUnit} at ${marginPercentage}%`, req.ip);
      res.status(201).json(tier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error creating DDP pricing tier", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/pricing/ddp-tiers/:tierId", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const validated = ddpPricingTierUpdateSchema.parse(req.body);
      const updates: Record<string, string> = {};
      if (validated.billingUnit !== undefined) updates.billingUnit = validated.billingUnit;
      if (validated.minAmount !== undefined) updates.minAmount = String(validated.minAmount);
      if (validated.marginPercentage !== undefined) updates.marginPercentage = String(validated.marginPercentage);

      const tier = await storage.updateDdpPricingTier(req.params.tierId, updates);
      if (!tier) {
        return res.status(404).json({ error: "Door To Door Freight pricing tier not found" });
      }
      await logAudit(req.session.userId, "update_ddp_pricing_tier", "ddp_pricing_tier", tier.id,
        `Updated DDP pricing tier: ${tier.minAmount}+ ${tier.billingUnit} at ${tier.marginPercentage}%`, req.ip);
      res.json(tier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Error updating DDP pricing tier", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/pricing/ddp-tiers/:tierId", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      await storage.deleteDdpPricingTier(req.params.tierId);
      await logAudit(req.session.userId, "delete_ddp_pricing_tier", "ddp_pricing_tier", req.params.tierId,
        "Deleted DDP pricing tier", req.ip);
      res.json({ success: true });
    } catch (error) {
      logError("Error deleting DDP pricing tier", error);
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

  const integrationAccountPayloadSchema = z.object({
    appKey: z.string().min(1),
    accountName: z.string().min(1).max(120),
    environment: z.enum(["sandbox", "production"]).default("sandbox"),
    countryCode: z.string().length(2).transform((value) => value.toUpperCase()).optional().nullable(),
    region: z.string().max(80).optional().nullable(),
    priority: z.number().int().min(1).max(9999).default(100),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    credentials: z.record(z.string()).default({}),
    settings: z.record(z.string()).default({}),
  });

  function validateIntegrationCredentials(definition: NonNullable<ReturnType<typeof getIntegrationDefinition>>, credentials: Record<string, string>) {
    const missing = definition.credentialFields
      .filter((field) => field.required)
      .filter((field) => !credentials[field.key]?.trim())
      .map((field) => field.label);

    if (missing.length > 0) {
      throw new Error(`Missing required credentials: ${missing.join(", ")}`);
    }
  }

  function stripUnchangedCredentialPlaceholders(credentials: Record<string, string>) {
    return Object.fromEntries(
      Object.entries(credentials).filter(([, value]) => {
        const trimmed = String(value || "").trim();
        return trimmed.length > 0 && !trimmed.includes("••");
      }),
    );
  }

  function mergeIntegrationCredentialUpdates(
    definition: NonNullable<ReturnType<typeof getIntegrationDefinition>>,
    currentCredentials: Record<string, string>,
    submittedCredentials: Record<string, string>,
  ) {
    const nextCredentials = { ...currentCredentials };
    for (const field of definition.credentialFields) {
      if (!(field.key in submittedCredentials)) continue;
      const value = String(submittedCredentials[field.key] || "").trim();
      if (value.includes("••")) continue;
      if (value) {
        nextCredentials[field.key] = value;
      } else {
        delete nextCredentials[field.key];
      }
    }
    return sanitizeIntegrationCredentials(definition, nextCredentials);
  }

  const webAppSettingsSchema = z.object({
    integrationAccountCountryBasis: z.enum([
      IntegrationAccountCountryBasis.SHIPPING_ACCOUNT_COUNTRY,
      IntegrationAccountCountryBasis.CLIENT_BASE_ACCOUNT_COUNTRY,
    ]),
  });

  app.get("/api/admin/settings/web-app", requireAdminPermission("settings", "read"), async (_req, res) => {
    res.json({
      integrationAccountCountryBasis: await getIntegrationAccountCountryBasis(),
    });
  });

  app.patch("/api/admin/settings/web-app", requireAdminPermission("settings", "update"), async (req, res) => {
    try {
      const data = webAppSettingsSchema.parse(req.body);
      await storage.upsertPlatformSetting({
        key: INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY,
        value: data.integrationAccountCountryBasis,
        updatedByUserId: req.session.userId || null,
      });
      await logAudit(
        req.session.userId,
        "update_web_app_settings",
        "platform_setting",
        INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY,
        `Updated integration account country basis to ${data.integrationAccountCountryBasis}`,
        req.ip,
      );
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to update web app settings", error);
      res.status(500).json({ error: "Failed to update web app settings" });
    }
  });

  // Admin - Apps / Integration Account Management
  app.get("/api/admin/apps", requireAdminPermission("integrations", "read"), async (_req, res) => {
    try {
      const storedAccounts = await storage.getIntegrationAccounts();
      const serializedStoredAccounts = storedAccounts.map((account) => ({
        ...serializeIntegrationAccountSafely(account),
        source: "database",
      }));

      const envAccounts = INTEGRATION_APP_DEFINITIONS
        .map((definition) => buildEnvAccount(definition.key))
        .filter((account): account is NonNullable<ReturnType<typeof buildEnvAccount>> => Boolean(account));

      const appLogos = await storage.getIntegrationAppLogos();

      res.json({
        categories: [
          { key: "all", label: "All" },
          { key: "shipping", label: "Shipping Carriers" },
          { key: "payment", label: "Payment Gateways" },
          { key: "ai", label: "AI & Extraction" },
          { key: "accounting", label: "Accounting" },
          { key: "notifications", label: "Notifications" },
          { key: "storage", label: "Storage" },
        ],
        apps: INTEGRATION_APP_DEFINITIONS.map((definition) => {
          const storedAppAccounts = serializedStoredAccounts.filter((account) => account.appKey === definition.key);
          const accounts = [
            ...storedAppAccounts,
            ...envAccounts.filter((account: any) => account?.appKey === definition.key),
          ];
          const activeAccounts = accounts.filter((account: any) => account.isActive);
          const countedAccounts = accounts.filter(
            (account: any) => account.source !== "environment" || account.isActive,
          );

          return {
            ...definition,
            logoUrl: appLogos[definition.key] || null,
            configured: activeAccounts.length > 0,
            accountCount: countedAccounts.length,
            activeAccountCount: activeAccounts.length,
            accounts,
          };
        }),
      });
    } catch (error) {
      logError("Error fetching apps", error);
      res.status(500).json({ error: "Failed to fetch apps" });
    }
  });

  // Carrier logos for any authenticated user (client/operations/admin). Exposes the
  // admin-uploaded logos for shipping integrations, keyed by carrier code (upper-case,
  // e.g. FEDEX / SMSA / JT) so every carrier surface — rates pages, shipment cards,
  // tracking — can render the uploaded logo instead of a hard-coded brand mark.
  app.get("/api/carrier-logos", requireAuth, async (_req, res) => {
    try {
      const logos = await storage.getIntegrationAppLogos();
      const shippingKeys = new Set(
        INTEGRATION_APP_DEFINITIONS.filter((d) => d.category === "shipping").map((d) => d.key),
      );
      const out: Record<string, string> = {};
      for (const [appKey, dataUri] of Object.entries(logos)) {
        if (dataUri && shippingKeys.has(appKey)) {
          out[appKey.toUpperCase()] = dataUri;
        }
      }
      // Virtual carriers carry their own logo, keyed by the client-facing code so the rates
      // UI renders it exactly like an app carrier logo.
      for (const vc of await storage.listVirtualCarriers(true)) {
        if (vc.logo) out[vc.code.toUpperCase()] = vc.logo;
      }
      res.json(out);
    } catch (error) {
      logError("Failed to fetch carrier logos", error);
      res.status(500).json({ error: "Failed to fetch carrier logos" });
    }
  });

  // Per-app brand logo (Apps tab). Small image data URI, stored in the DB (no object
  // storage). Capped under the JSON body limit.
  const APP_LOGO_MAX_CHARS = 100_000;
  const APP_LOGO_DATA_URI = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

  app.put("/api/admin/apps/:appKey/logo", requireAdminPermission("integrations", "configure"), async (req, res) => {
    try {
      const definition = getIntegrationDefinition(req.params.appKey);
      if (!definition) return res.status(404).json({ error: "Unknown app" });

      const logo = typeof req.body?.logo === "string" ? req.body.logo.trim() : "";
      if (!APP_LOGO_DATA_URI.test(logo)) {
        return res.status(400).json({ error: "Logo must be a base64 image data URI (png, jpg, webp, gif or svg)." });
      }
      if (logo.length > APP_LOGO_MAX_CHARS) {
        return res.status(413).json({ error: "Logo is too large. Use an image under ~70 KB." });
      }

      await storage.setIntegrationAppLogo(definition.key, logo);
      await logAudit(req.session.userId, "set_app_logo", "integration_app", definition.key,
        `Updated ${definition.name} logo`, req.ip);
      res.json({ ok: true, appKey: definition.key });
    } catch (error) {
      logError("Failed to set app logo", error);
      res.status(500).json({ error: "Failed to set app logo" });
    }
  });

  app.delete("/api/admin/apps/:appKey/logo", requireAdminPermission("integrations", "configure"), async (req, res) => {
    const definition = getIntegrationDefinition(req.params.appKey);
    if (!definition) return res.status(404).json({ error: "Unknown app" });
    await storage.deleteIntegrationAppLogo(definition.key);
    await logAudit(req.session.userId, "delete_app_logo", "integration_app", definition.key,
      `Removed ${definition.name} logo`, req.ip);
    res.status(204).end();
  });

  // Per-virtual-carrier brand logo — same data-URI contract as the Apps-tab carrier logos,
  // stored on the virtual_carriers row and surfaced via /api/carrier-logos.
  app.put("/api/admin/virtual-carriers/:id/logo", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    try {
      const logo = typeof req.body?.logo === "string" ? req.body.logo.trim() : "";
      if (!APP_LOGO_DATA_URI.test(logo)) {
        return res.status(400).json({ error: "Logo must be a base64 image data URI (png, jpg, webp, gif or svg)." });
      }
      if (logo.length > APP_LOGO_MAX_CHARS) {
        return res.status(413).json({ error: "Logo is too large. Use an image under ~70 KB." });
      }
      const carrier = await storage.updateVirtualCarrier(req.params.id, { logo });
      if (!carrier) return res.status(404).json({ error: "Virtual carrier not found" });
      await logAudit(req.session.userId, "set_virtual_carrier_logo", "virtual_carrier", carrier.id,
        `Updated ${carrier.name} logo`, req.ip);
      res.json({ ok: true, id: carrier.id });
    } catch (error) {
      logError("Failed to set virtual carrier logo", error);
      res.status(500).json({ error: "Failed to set virtual carrier logo" });
    }
  });

  app.delete("/api/admin/virtual-carriers/:id/logo", requireAdminPermission("pricing-rules", "update"), async (req, res) => {
    const carrier = await storage.updateVirtualCarrier(req.params.id, { logo: null });
    if (!carrier) return res.status(404).json({ error: "Virtual carrier not found" });
    await logAudit(req.session.userId, "delete_virtual_carrier_logo", "virtual_carrier", carrier.id,
      `Removed ${carrier.name} logo`, req.ip);
    res.status(204).end();
  });

  app.post("/api/admin/apps/accounts", requireAdminPermission("integrations", "configure"), async (req, res) => {
    try {
      const data = integrationAccountPayloadSchema.parse(req.body);
      const definition = getIntegrationDefinition(data.appKey);
      if (!definition) {
        return res.status(400).json({ error: "Unsupported app integration" });
      }

      const cleanCredentials = sanitizeIntegrationCredentials(
        definition,
        stripUnchangedCredentialPlaceholders(data.credentials),
      );
      const cleanSettings = sanitizeIntegrationSettings(definition, data.settings || {});
      validateIntegrationCredentials(definition, cleanCredentials);

      if (data.isDefault) {
        await storage.unsetDefaultIntegrationAccounts(data.appKey, data.environment, data.countryCode);
      }

      const account = await storage.createIntegrationAccount({
        appKey: definition.key,
        appName: definition.name,
        category: definition.category,
        accountName: data.accountName,
        environment: data.environment,
        countryCode: data.countryCode || null,
        region: data.region || null,
        priority: data.priority,
        isActive: data.isActive,
        isDefault: data.isDefault,
        credentialsEncrypted: encryptIntegrationPayload(cleanCredentials),
        settings: JSON.stringify(cleanSettings),
        capabilities: JSON.stringify(definition.capabilities),
        createdByUserId: req.session.userId,
        updatedByUserId: req.session.userId,
      });
      await loadDefaultIntegrationAccountsIntoEnv();

      await logAudit(req.session.userId, "create_integration_account", "integration_account", account.id,
        `Created ${definition.name} integration account ${account.accountName}`, req.ip);

      res.status(201).json(serializeIntegrationAccount(account));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (error instanceof Error && (
        error.message.startsWith("Missing required credentials") ||
        error.message.startsWith("Unsupported integration field") ||
        error.message.includes("must use an approved HTTPS provider host") ||
        error.message.includes("must be a valid URL")
      )) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof Error && error.message.includes("INTEGRATION_CONFIG_SECRET")) {
        logError("Integration account encryption misconfigured", error);
        return res.status(500).json({
          error: "Server is missing INTEGRATION_CONFIG_SECRET. Set this environment variable in production before saving integration credentials.",
        });
      }
      logError("Error creating integration account", error);
      res.status(500).json({ error: "Failed to create integration account" });
    }
  });

  app.patch("/api/admin/apps/accounts/:id", requireAdminPermission("integrations", "configure"), async (req, res) => {
    try {
      const existing = await storage.getIntegrationAccount(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Integration account not found" });
      }

      const data = integrationAccountPayloadSchema.partial().parse(req.body);
      if (data.appKey && data.appKey !== existing.appKey) {
        return res.status(400).json({ error: "An integration account cannot be moved to another app" });
      }
      const definition = getIntegrationDefinition(data.appKey || existing.appKey);
      if (!definition) {
        return res.status(400).json({ error: "Unsupported app integration" });
      }

      let currentCredentials: Record<string, string> = {};
      try {
        currentCredentials = serializeIntegrationAccount(existing, true).credentials as Record<string, string>;
      } catch {
        // Allow an admin to repair records after an encryption-key rotation by
        // replacing the complete credential set from the Apps page.
      }
      const cleanCredentials = data.credentials
        ? mergeIntegrationCredentialUpdates(definition, currentCredentials, data.credentials)
        : currentCredentials;
      const cleanSettings = data.settings
        ? sanitizeIntegrationSettings(definition, data.settings)
        : undefined;
      const nextCredentials = cleanCredentials;
      validateIntegrationCredentials(definition, nextCredentials);

      const environment = data.environment || existing.environment;
      const countryCode = data.countryCode !== undefined ? data.countryCode : existing.countryCode;
      const isDefault = data.isDefault ?? existing.isDefault;
      if (isDefault) {
        await storage.unsetDefaultIntegrationAccounts(existing.appKey, environment, countryCode);
      }

      const updated = await storage.updateIntegrationAccount(existing.id, {
        accountName: data.accountName ?? existing.accountName,
        environment,
        countryCode: countryCode || null,
        region: data.region !== undefined ? data.region : existing.region,
        priority: data.priority ?? existing.priority,
        isActive: data.isActive ?? existing.isActive,
        isDefault,
        credentialsEncrypted: data.credentials
          ? encryptIntegrationPayload(nextCredentials)
          : existing.credentialsEncrypted,
        settings: cleanSettings ? JSON.stringify(cleanSettings) : existing.settings,
        lastTestedAt: null,
        lastTestSuccess: null,
        lastTestMessage: null,
        updatedByUserId: req.session.userId,
      });
      await loadDefaultIntegrationAccountsIntoEnv();

      await logAudit(req.session.userId, "update_integration_account", "integration_account", existing.id,
        `Updated ${definition.name} integration account ${updated?.accountName || existing.accountName}`, req.ip);

      res.json(updated ? serializeIntegrationAccount(updated) : null);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (error instanceof Error && (
        error.message.startsWith("Missing required credentials") ||
        error.message.startsWith("Unsupported integration field") ||
        error.message.includes("must use an approved HTTPS provider host") ||
        error.message.includes("must be a valid URL")
      )) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof Error && error.message.includes("INTEGRATION_CONFIG_SECRET")) {
        logError("Integration account encryption misconfigured", error);
        return res.status(500).json({
          error: "Server is missing INTEGRATION_CONFIG_SECRET. Set this environment variable in production before saving integration credentials.",
        });
      }
      logError("Error updating integration account", error);
      res.status(500).json({ error: "Failed to update integration account" });
    }
  });

  app.delete("/api/admin/apps/accounts/:id", requireAdminPermission("integrations", "configure"), async (req, res) => {
    try {
      const existing = await storage.getIntegrationAccount(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Integration account not found" });
      }

      const [shipments, invoices, clients] = await Promise.all([
        storage.getShipments(),
        storage.getInvoices(),
        storage.getClientAccounts(),
      ]);
      const isBound =
        shipments.some((shipment) =>
          shipment.carrierIntegrationAccountId === existing.id ||
          shipment.tapIntegrationAccountId === existing.id,
        ) ||
        invoices.some((invoice) =>
          invoice.tapIntegrationAccountId === existing.id ||
          invoice.zohoIntegrationAccountId === existing.id,
        ) ||
        clients.some((client) =>
          client.tapIntegrationAccountId === existing.id ||
          client.zohoIntegrationAccountId === existing.id,
        );
      if (isBound) {
        return res.status(409).json({
          error: "This account is already used by operational records. Disable it instead so existing shipments and callbacks remain available.",
        });
      }

      await storage.deleteIntegrationAccount(existing.id);
      await loadDefaultIntegrationAccountsIntoEnv();
      await logAudit(req.session.userId, "delete_integration_account", "integration_account", existing.id,
        `Deleted ${existing.appName} integration account ${existing.accountName}`, req.ip);

      res.json({ success: true });
    } catch (error) {
      logError("Error deleting integration account", error);
      res.status(500).json({ error: "Failed to delete integration account" });
    }
  });

  app.post("/api/admin/apps/accounts/:id/test", requireAdminPermission("integrations", "configure"), async (req, res) => {
    try {
      const account = await storage.getIntegrationAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Integration account not found" });
      }

      const startedAt = Date.now();
      const result = await runIntegrationAccountTest(account);

      const updated = await storage.updateIntegrationAccount(account.id, {
        lastTestedAt: new Date(),
        lastTestSuccess: result.success,
        lastTestMessage: result.message,
        updatedByUserId: req.session.userId,
      });

      await storage.createIntegrationLog({
        serviceName: account.appKey,
        operation: "validate_credentials",
        success: result.success,
        duration: Date.now() - startedAt,
        errorMessage: result.success ? null : result.message,
        requestPayload: JSON.stringify({
          accountId: account.id,
          accountName: account.accountName,
          environment: account.environment,
          countryCode: account.countryCode,
        }),
        responsePayload: JSON.stringify({
          message: result.message,
        }),
      });

      await logAudit(req.session.userId, "test_integration_account", "integration_account", account.id,
        `Tested ${account.appName} integration account ${account.accountName}: ${result.success ? "success" : "failed"}`, req.ip);

      res.json({ ...result, account: updated ? serializeIntegrationAccount(updated) : null });
    } catch (error) {
      logError("Error testing integration account", error);
      res.status(500).json({ error: "Failed to test integration account" });
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

  app.get("/api/admin/departments", requireAdminPermission("roles", "read"), async (_req, res) => {
    try {
      const [departments, roles, userRows, invitationRows] = await Promise.all([
        storage.getDepartments(),
        storage.getRoles(),
        listInternalStaffUserRows(),
        listInternalInvitationRows({ status: UserInvitationStatus.PENDING }),
      ]);

      const roleCountByDepartmentId = new Map<string, number>();
      for (const role of roles) {
        if (!role.departmentId) continue;
        roleCountByDepartmentId.set(role.departmentId, (roleCountByDepartmentId.get(role.departmentId) || 0) + 1);
      }

      const userCountByDepartmentId = new Map<string, number>();
      for (const row of userRows) {
        if (!row.department?.id) continue;
        userCountByDepartmentId.set(row.department.id, (userCountByDepartmentId.get(row.department.id) || 0) + 1);
      }

      const inviteCountByDepartmentId = new Map<string, number>();
      for (const row of invitationRows) {
        if (!row.department?.id || row.status !== "pending") continue;
        inviteCountByDepartmentId.set(row.department.id, (inviteCountByDepartmentId.get(row.department.id) || 0) + 1);
      }

      res.json(
        [...departments]
          .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0) || left.name.localeCompare(right.name))
          .map((department) => ({
            ...department,
            roleCount: roleCountByDepartmentId.get(department.id) || 0,
            userCount: userCountByDepartmentId.get(department.id) || 0,
            invitationCount: inviteCountByDepartmentId.get(department.id) || 0,
          })),
      );
    } catch (error) {
      logError("Error fetching departments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/departments", requireAdminPermission("roles", "create"), async (req, res) => {
    try {
      const parsed = createDepartmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid department data" });
      }

      if (!isCuratedDepartmentStyle(parsed.data.iconKey, parsed.data.colorKey)) {
        return res.status(400).json({ error: "Department style must use a curated icon and color preset" });
      }

      const existingDepartments = await storage.getDepartments();
      const existingSlugs = new Set(existingDepartments.map((department) => department.slug));
      const baseSlug = slugifyValue(parsed.data.name);
      let slug = baseSlug || `department-${existingDepartments.length + 1}`;
      let suffix = 2;
      while (existingSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      const maxSortOrder = existingDepartments.reduce((max, department) => Math.max(max, department.sortOrder || 0), 0);
      const department = await storage.createDepartment({
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        iconKey: parsed.data.iconKey,
        colorKey: parsed.data.colorKey,
        sortOrder: parsed.data.sortOrder ?? maxSortOrder + 10,
        isSystem: false,
      });

      await logAudit(
        req.session.userId,
        "create_department",
        "department",
        department.id,
        `Created department ${department.name}`,
        req.ip,
      );

      res.status(201).json(department);
    } catch (error) {
      logError("Error creating department", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/departments/:id", requireAdminPermission("roles", "update"), async (req, res) => {
    try {
      const parsed = updateDepartmentSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid department data" });
      }

      const currentDepartment = await storage.getDepartment(req.params.id);
      if (!currentDepartment) {
        return res.status(404).json({ error: "Department not found" });
      }

      const iconKey = parsed.data.iconKey ?? currentDepartment.iconKey;
      const colorKey = parsed.data.colorKey ?? currentDepartment.colorKey;
      if (!isCuratedDepartmentStyle(iconKey, colorKey)) {
        return res.status(400).json({ error: "Department style must use a curated icon and color preset" });
      }

      const updatedDepartment = await storage.updateDepartment(req.params.id, {
        name: parsed.data.name ?? currentDepartment.name,
        description: parsed.data.description ?? currentDepartment.description,
        iconKey,
        colorKey,
        sortOrder: parsed.data.sortOrder ?? currentDepartment.sortOrder,
      });

      await logAudit(
        req.session.userId,
        "update_department",
        "department",
        req.params.id,
        `Updated department ${updatedDepartment?.name || currentDepartment.name}`,
        req.ip,
      );

      res.json(updatedDepartment || currentDepartment);
    } catch (error) {
      logError("Error updating department", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Roles CRUD
  app.get("/api/admin/roles", requireAdminPermission("roles", "read"), async (_req, res) => {
    try {
      const [allRoles, departments, allPermissions] = await Promise.all([
        storage.getRoles(),
        storage.getDepartments(),
        storage.getPermissions(),
      ]);
      const departmentsById = new Map(departments.map((department) => [department.id, department]));
      const rolesWithPermissions = await Promise.all(
        sortDepartmentRoles(mergeRolesWithSystemRoles(allRoles)).map((role) =>
          serializeRoleWithPermissions(role, allPermissions),
        ),
      );

      res.json(
        rolesWithPermissions.map((role) => ({
          ...role,
          department: role.departmentId ? getDepartmentRef(departmentsById.get(role.departmentId) || null) : null,
        })),
      );
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
      const allDepartments = await storage.getDepartments();
      const roleDepartment = role.departmentId
        ? allDepartments.find((department) => department.id === role.departmentId) || null
        : null;

      if (isAccountManagerSystemRoleId(role.id)) {
        const fixedPermissionNames = new Set<string>(ACCOUNT_MANAGER_FIXED_PERMISSION_NAMES);
        assignedPermissions = allPermissions.filter((permission) => fixedPermissionNames.has(permission.name));
      } else {
        const rolePermissions = await storage.getRolePermissions(role.id);
        assignedPermissions = allPermissions.filter((permission) =>
          rolePermissions.some((rolePermission) => rolePermission.permissionId === permission.id),
        );
      }
      
      res.json({
        ...role,
        department: getDepartmentRef(roleDepartment),
        permissions: assignedPermissions.sort((a, b) => a.name.localeCompare(b.name)),
      });
    } catch (error) {
      logError("Error fetching role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/roles", requireAdminPermission("roles", "create"), async (req, res) => {
    try {
      const parsed = createHierarchicalRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid role data" });
      }

      if (parsed.data.name.trim().toLowerCase() === ACCOUNT_MANAGER_SYSTEM_ROLE_NAME.toLowerCase()) {
        return res.status(400).json({ error: `"${ACCOUNT_MANAGER_SYSTEM_ROLE_NAME}" is a built-in system role` });
      }

      const [departments, existingRoles, allPermissions] = await Promise.all([
        storage.getDepartments(),
        storage.getRoles(),
        storage.getPermissions(),
      ]);
      const platformDepartment = departments.find((department) => department.slug === InternalDepartmentSlug.PLATFORM) || null;
      const department =
        (parsed.data.departmentId ? departments.find((item) => item.id === parsed.data.departmentId) || null : null) ||
        platformDepartment;

      if (!department) {
        return res.status(400).json({ error: "Department is required" });
      }

      const hierarchyLevel = parsed.data.hierarchyLevel || getDefaultHierarchyLevelForDepartment(department);
      const duplicateRole = existingRoles.find(
        (role) =>
          role.departmentId === department.id &&
          role.name.trim().toLowerCase() === parsed.data.name.trim().toLowerCase(),
      );
      if (duplicateRole) {
        return res.status(409).json({ error: "A role with this name already exists in the department" });
      }

      const role = await storage.createRole({
        name: parsed.data.name.trim(),
        description: parsed.data.description || null,
        departmentId: department.id,
        hierarchyLevel,
        sortOrder: parsed.data.sortOrder ?? HIERARCHY_LEVEL_SORT_ORDER[hierarchyLevel],
        isSystem: false,
        isActive: parsed.data.isActive,
      });
      await syncRolePermissions(role.id, parsed.data.permissionIds);

      await logAudit(req.session.userId, "create_role", "role", role.id,
        `Created role: ${role.name}`, req.ip);
      
      res.status(201).json(await serializeRoleWithPermissions(role, allPermissions));
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

      const parsed = updateHierarchicalRoleSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid role data" });
      }

      const [currentRole, departments, allPermissions, allRoles] = await Promise.all([
        storage.getRole(req.params.id),
        storage.getDepartments(),
        storage.getPermissions(),
        storage.getRoles(),
      ]);
      if (!currentRole) {
        return res.status(404).json({ error: "Role not found" });
      }

      const department =
        (parsed.data.departmentId ? departments.find((item) => item.id === parsed.data.departmentId) || null : null) ||
        (currentRole.departmentId ? departments.find((item) => item.id === currentRole.departmentId) || null : null);
      if (!department) {
        return res.status(400).json({ error: "Department is required" });
      }

      const hierarchyLevel =
        parsed.data.hierarchyLevel ||
        (currentRole.hierarchyLevel as RoleHierarchyLevelValue | null) ||
        getDefaultHierarchyLevelForDepartment(department);

      const nextName = parsed.data.name?.trim() || currentRole.name;
      const conflictingRole = allRoles.find(
        (role) =>
          role.id !== currentRole.id &&
          role.departmentId === department.id &&
          role.name.trim().toLowerCase() === nextName.trim().toLowerCase(),
      );
      if (conflictingRole) {
        return res.status(409).json({ error: "A role with this name already exists in the department" });
      }

      if (nextName.trim().toLowerCase() === ACCOUNT_MANAGER_SYSTEM_ROLE_NAME.toLowerCase()) {
        return res.status(400).json({ error: `"${ACCOUNT_MANAGER_SYSTEM_ROLE_NAME}" is reserved for the system role` });
      }

      const updates: Partial<Role> = {
        name: nextName,
        description: parsed.data.description ?? currentRole.description,
        departmentId: department.id,
        hierarchyLevel,
        sortOrder: parsed.data.sortOrder ?? currentRole.sortOrder ?? HIERARCHY_LEVEL_SORT_ORDER[hierarchyLevel],
        isActive: parsed.data.isActive ?? currentRole.isActive,
      };

      const role = await storage.updateRole(req.params.id, updates);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      if (parsed.data.permissionIds) {
        await syncRolePermissions(req.params.id, parsed.data.permissionIds);
      }

      await logAudit(req.session.userId, "update_role", "role", role.id,
        `Updated role: ${role.name}`, req.ip);
      
      res.json(await serializeRoleWithPermissions(role, allPermissions));
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
  app.get("/api/admin/users", requireAdminPermission("users", "read"), async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
      const departmentFilter = typeof req.query.department === "string" ? req.query.department.trim().toLowerCase() : "";
      const roleFilter = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";

      let rows = await listInternalStaffUserRows();

      if (status && status !== "all") {
        rows = rows.filter((row) => row.status === status);
      }

      if (departmentFilter && departmentFilter !== "all") {
        rows = rows.filter((row) => {
          const department = row.department;
          if (!department) return false;
          return (
            department.id === departmentFilter ||
            department.slug.toLowerCase() === departmentFilter ||
            department.name.toLowerCase() === departmentFilter
          );
        });
      }

      if (roleFilter && roleFilter !== "all") {
        rows = rows.filter((row) => {
          const role = row.role;
          if (!role) return false;
          return role.id === roleFilter || role.name.toLowerCase() === roleFilter;
        });
      }

      if (search) {
        rows = rows.filter((row) =>
          [row.fullName, row.email, row.username].some((value) => value.toLowerCase().includes(search)),
        );
      }

      res.json(
        rows.sort((left, right) => {
          if (left.status !== right.status) {
            return left.status === "active" ? -1 : 1;
          }
          return left.fullName.localeCompare(right.fullName);
        }),
      );
    } catch (error) {
      logError("Error fetching internal staff users", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/detail", requireAdminPermission("users", "read"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user || !["admin", "operations"].includes(user.userType)) {
        return res.status(404).json({ error: "Internal user not found" });
      }

      res.json(await buildInternalStaffUserDetail(user));
    } catch (error) {
      logError("Error fetching internal user detail", error);
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
      const allRoles = await storage.getRoles();
      const defaultOperationRoleName =
        parsed.data.userType === "operations"
          ? getOperationRoleNameByProfileLevel(parsed.data.operationLevel)
          : null;
      const defaultOperationRole = defaultOperationRoleName
        ? allRoles.find((role) => role.name === defaultOperationRoleName)
        : null;
      const roleIds = Array.from(new Set([
        ...parsed.data.roleIds,
        ...(parsed.data.userType === "operations" && parsed.data.roleIds.length === 0 && defaultOperationRole
          ? [defaultOperationRole.id]
          : []),
      ]));
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

      if (parsed.data.userType === "operations" && wantsAccountManagerRole) {
        return res.status(400).json({ error: "Operations users cannot be account managers" });
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
        fullName: username,
        password: hashedPassword,
        userType: parsed.data.userType,
        isAccountManager: parsed.data.userType === "admin" && wantsAccountManagerRole,
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

      if (parsed.data.userType === "operations") {
        await ensureOperationProfile(adminUser.id, parsed.data.operationLevel);
      }

      const assignedRoleLabel = wantsAccountManagerRole
        ? ACCOUNT_MANAGER_SYSTEM_ROLE_NAME
        : selectedRoles.map((role) => role.name).join(", ");

      await logAudit(
        req.session.userId,
        "create_admin_user",
        "user",
        adminUser.id,
        `Created ${parsed.data.userType} user ${username}${assignedRoleLabel ? ` with roles: ${assignedRoleLabel}` : ""}${wantsAccountManagerRole && accountManagerClientIds.length > 0 ? ` and assigned ${accountManagerClientIds.length} client(s)` : ""}`,
        req.ip,
      );

      res.status(201).json(await buildAdminUserSummary(adminUser, allRoles));
    } catch (error) {
      logError("Error creating admin user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdminPermission("users", "update"), async (req, res) => {
    try {
      const parsed = updateInternalUserSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid user update payload" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user || !["admin", "operations"].includes(user.userType)) {
        return res.status(404).json({ error: "Internal user not found" });
      }

      const nextEmail = parsed.data.email?.trim().toLowerCase() || user.email;
      if (nextEmail !== user.email) {
        const existing = await storage.getUserByEmail(nextEmail);
        if (existing && existing.id !== user.id) {
          return res.status(409).json({ error: "Email already in use" });
        }
      }

      let nextUserType = user.userType;
      let nextIsAccountManager = user.isAccountManager;

      if (parsed.data.roleId) {
        const role = await storage.getRole(parsed.data.roleId);
        if (!role || !role.departmentId) {
          return res.status(404).json({ error: "Role not found" });
        }

        const department = await storage.getDepartment(role.departmentId);
        if (!department) {
          return res.status(404).json({ error: "Department not found" });
        }

        nextUserType = getDepartmentUserType(department.slug);
        nextIsAccountManager = department.slug === InternalDepartmentSlug.ACCOUNT_MANAGEMENT;

        const existingAssignments = await storage.getUserRoles(user.id);
        for (const assignment of existingAssignments) {
          await storage.removeUserRole(user.id, assignment.roleId);
        }
        await storage.assignUserRole({ userId: user.id, roleId: role.id });

        if (nextUserType === "operations") {
          await ensureOperationProfile(
            user.id,
            getOperationProfileLevelForHierarchy(role.hierarchyLevel),
          );
        }
      }

      const updatedUser = await storage.updateUser(req.params.id, {
        fullName: parsed.data.fullName?.trim() || user.fullName,
        email: nextEmail,
        userType: nextUserType,
        isAccountManager: nextIsAccountManager,
        updatedAt: new Date(),
      });

      await logAudit(
        req.session.userId,
        "update_internal_user",
        "user",
        req.params.id,
        `Updated internal user ${getUserDisplayName(updatedUser || user)}`,
        req.ip,
      );

      const rows = await listInternalStaffUserRows();
      res.json(rows.find((candidate) => candidate.id === req.params.id) || updatedUser || user);
    } catch (error) {
      logError("Error updating internal user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdminPermission("users", "delete"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user || !["admin", "operations"].includes(user.userType)) {
        return res.status(404).json({ error: "Internal user not found" });
      }

      if (user.id === req.session.userId) {
        return res.status(400).json({ error: "You cannot delete your own account." });
      }

      // Never allow removing the last remaining active admin (avoids lockout).
      if (user.userType === "admin") {
        const admins = await storage.getUsersByUserType("admin");
        const otherActiveAdmins = admins.filter((candidate) => candidate.isActive && candidate.id !== user.id);
        if (otherActiveAdmins.length === 0) {
          return res.status(400).json({ error: "Cannot delete the last active admin account." });
        }
      }

      const activeAssignments = await storage.countActiveAssignmentsForUser(user.id);
      if (activeAssignments > 0) {
        return res.status(409).json({
          error: `This user has ${activeAssignments} active shipment assignment(s). Reassign them before deleting.`,
        });
      }

      await storage.deleteUser(user.id);
      await logAudit(
        req.session.userId,
        "delete_internal_user",
        "user",
        user.id,
        `Deleted internal user ${getUserDisplayName(user)}`,
        req.ip,
      );

      res.json({ success: true });
    } catch (error) {
      logError("Error deleting internal user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/status", requireAdminPermission("users", "update"), async (req, res) => {
    try {
      const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid status payload" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user || !["admin", "operations"].includes(user.userType)) {
        return res.status(404).json({ error: "Internal user not found" });
      }

      const updatedUser = await storage.updateUser(req.params.id, {
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      });

      await logAudit(
        req.session.userId,
        parsed.data.isActive ? "activate_internal_user" : "deactivate_internal_user",
        "user",
        req.params.id,
        `${parsed.data.isActive ? "Activated" : "Deactivated"} internal user ${getUserDisplayName(updatedUser || user)}`,
        req.ip,
      );

      const rows = await listInternalStaffUserRows();
      const row = rows.find((candidate) => candidate.id === req.params.id);
      res.json(row || updatedUser || user);
    } catch (error) {
      logError("Error updating internal user status", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/invitations", requireAdminPermission("users", "read"), async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
      const departmentFilter = typeof req.query.department === "string" ? req.query.department.trim().toLowerCase() : "";
      const roleFilter = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";

      let rows = await listInternalInvitationRows();

      if (status && status !== "all") {
        rows = rows.filter((row) => row.status === status);
      }

      if (departmentFilter && departmentFilter !== "all") {
        rows = rows.filter((row) => {
          const department = row.department;
          if (!department) return false;
          return (
            department.id === departmentFilter ||
            department.slug.toLowerCase() === departmentFilter ||
            department.name.toLowerCase() === departmentFilter
          );
        });
      }

      if (roleFilter && roleFilter !== "all") {
        rows = rows.filter((row) => {
          const role = row.role;
          if (!role) return false;
          return role.id === roleFilter || role.name.toLowerCase() === roleFilter;
        });
      }

      if (search) {
        rows = rows.filter((row) =>
          [row.fullName, row.email, row.department?.name || "", row.role?.name || ""]
            .some((value) => value.toLowerCase().includes(search)),
        );
      }

      res.json(rows.sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime()));
    } catch (error) {
      logError("Error fetching invitations", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/invitations", requireAdminPermission("users", "create"), async (req, res) => {
    try {
      const parsed = createInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid invitation data" });
      }

      const email = parsed.data.email.trim().toLowerCase();
      const [department, role, existingUser, existingInvitations, departments, roles] = await Promise.all([
        storage.getDepartment(parsed.data.departmentId),
        storage.getRole(parsed.data.roleId),
        storage.getUserByEmail(email),
        storage.getUserInvitations({ email }),
        storage.getDepartments(),
        storage.getRoles(),
      ]);

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }
      if (!role || role.departmentId !== department.id) {
        return res.status(404).json({ error: "Role not found for selected department" });
      }
      if (existingUser) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }

      const normalizedInvitations = await Promise.all(existingInvitations.map(refreshInvitationStatus));
      if (normalizedInvitations.some((invitation) => invitation.status === UserInvitationStatus.PENDING)) {
        return res.status(409).json({ error: "A pending invitation already exists for this email" });
      }

      const tokenData = createInvitationToken();
      const invitation = await storage.createUserInvitation({
        fullName: parsed.data.fullName.trim(),
        email,
        departmentId: department.id,
        roleId: role.id,
        personalMessage: parsed.data.personalMessage || null,
        tokenHash: tokenData.tokenHash,
        status: UserInvitationStatus.PENDING,
        expiresAt: tokenData.expiresAt,
        invitedByUserId: req.session.userId || null,
        acceptedUserId: null,
      });

      const emailSent = await sendStaffInvitationEmail({
        invitation,
        token: tokenData.token,
        department,
        role,
      });

      await logAudit(
        req.session.userId,
        "create_user_invitation",
        "user_invitation",
        invitation.id,
        `Invited ${invitation.email} to ${department.name} as ${role.name}${emailSent ? "" : " (email not sent)"}`,
        req.ip,
      );

      const departmentsById = new Map(departments.map((item) => [item.id, item]));
      const rolesById = new Map(roles.map((item) => [item.id, item]));
      res.status(201).json({
        row: buildInternalInvitationRow(invitation, departmentsById, rolesById),
        emailSent,
      });
    } catch (error) {
      logError("Error creating user invitation", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/invitations/:id/resend", requireAdminPermission("users", "update"), async (req, res) => {
    try {
      const invitation = await storage.getUserInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const normalizedInvitation = await refreshInvitationStatus(invitation);
      if (normalizedInvitation.status === UserInvitationStatus.ACCEPTED) {
        return res.status(400).json({ error: "Accepted invitations cannot be resent" });
      }
      if (normalizedInvitation.status === UserInvitationStatus.REVOKED) {
        return res.status(400).json({ error: "Revoked invitations cannot be resent" });
      }

      const [department, role, departments, roles] = await Promise.all([
        storage.getDepartment(normalizedInvitation.departmentId),
        storage.getRole(normalizedInvitation.roleId),
        storage.getDepartments(),
        storage.getRoles(),
      ]);
      if (!department || !role) {
        return res.status(404).json({ error: "Invitation role or department is missing" });
      }

      const tokenData = createInvitationToken();
      const updatedInvitation = await storage.updateUserInvitation(normalizedInvitation.id, {
        status: UserInvitationStatus.PENDING,
        tokenHash: tokenData.tokenHash,
        sentAt: new Date(),
        expiresAt: tokenData.expiresAt,
      });
      if (!updatedInvitation) {
        return res.status(500).json({ error: "Failed to update invitation" });
      }

      const emailSent = await sendStaffInvitationEmail({
        invitation: updatedInvitation,
        token: tokenData.token,
        department,
        role,
      });

      await logAudit(
        req.session.userId,
        "resend_user_invitation",
        "user_invitation",
        updatedInvitation.id,
        `Resent invitation to ${updatedInvitation.email}${emailSent ? "" : " (email not sent)"}`,
        req.ip,
      );

      const departmentsById = new Map(departments.map((item) => [item.id, item]));
      const rolesById = new Map(roles.map((item) => [item.id, item]));
      res.json({
        row: buildInternalInvitationRow(updatedInvitation, departmentsById, rolesById),
        emailSent,
      });
    } catch (error) {
      logError("Error resending user invitation", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/invitations/:id/revoke", requireAdminPermission("users", "update"), async (req, res) => {
    try {
      const invitation = await storage.getUserInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      if (invitation.status === UserInvitationStatus.ACCEPTED) {
        return res.status(400).json({ error: "Accepted invitations cannot be revoked" });
      }

      const updatedInvitation = await storage.updateUserInvitation(req.params.id, {
        status: UserInvitationStatus.REVOKED,
      });
      if (!updatedInvitation) {
        return res.status(500).json({ error: "Failed to update invitation" });
      }

      await logAudit(
        req.session.userId,
        "revoke_user_invitation",
        "user_invitation",
        updatedInvitation.id,
        `Revoked invitation for ${updatedInvitation.email}`,
        req.ip,
      );

      const [departments, roles] = await Promise.all([storage.getDepartments(), storage.getRoles()]);
      const departmentsById = new Map(departments.map((item) => [item.id, item]));
      const rolesById = new Map(roles.map((item) => [item.id, item]));
      res.json(buildInternalInvitationRow(updatedInvitation, departmentsById, rolesById));
    } catch (error) {
      logError("Error revoking user invitation", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/invitations/:token", async (req, res) => {
    try {
      const invitation = await storage.getUserInvitationByTokenHash(buildInvitationTokenHash(req.params.token));
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const normalizedInvitation = await refreshInvitationStatus(invitation);
      if (normalizedInvitation.status !== UserInvitationStatus.PENDING) {
        return res.status(410).json({ error: "Invitation is no longer valid" });
      }

      const [department, role] = await Promise.all([
        storage.getDepartment(normalizedInvitation.departmentId),
        storage.getRole(normalizedInvitation.roleId),
      ]);
      if (!department || !role) {
        return res.status(404).json({ error: "Invitation configuration is missing" });
      }

      res.json({
        id: normalizedInvitation.id,
        fullName: normalizedInvitation.fullName,
        email: normalizedInvitation.email,
        personalMessage: normalizedInvitation.personalMessage,
        department: getDepartmentRef(department),
        role: getRoleRef(role),
        expiresAt: normalizedInvitation.expiresAt,
      });
    } catch (error) {
      logError("Error fetching public invitation", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/public/invitations/:token/accept", async (req, res) => {
    try {
      const parsed = acceptInvitationSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid invitation acceptance payload" });
      }

      const invitation = await storage.getUserInvitationByTokenHash(buildInvitationTokenHash(req.params.token));
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const normalizedInvitation = await refreshInvitationStatus(invitation);
      if (normalizedInvitation.status !== UserInvitationStatus.PENDING) {
        return res.status(410).json({ error: "Invitation is no longer valid" });
      }

      const [department, role, existingUser] = await Promise.all([
        storage.getDepartment(normalizedInvitation.departmentId),
        storage.getRole(normalizedInvitation.roleId),
        storage.getUserByEmail(normalizedInvitation.email.toLowerCase()),
      ]);
      if (!department || !role || role.departmentId !== department.id) {
        return res.status(404).json({ error: "Invitation role or department is missing" });
      }
      if (existingUser && existingUser.isActive) {
        return res.status(409).json({ error: "This email already belongs to an active account" });
      }

      const hashedPassword = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
      const username = existingUser?.username || await generateUniqueUsername(normalizedInvitation.fullName, normalizedInvitation.email);
      const userType = getDepartmentUserType(department.slug);
      const isAccountManager = department.slug === InternalDepartmentSlug.ACCOUNT_MANAGEMENT;

      let acceptedUser: User;
      if (!existingUser) {
        acceptedUser = await storage.createUser({
          username,
          email: normalizedInvitation.email.toLowerCase(),
          fullName: normalizedInvitation.fullName,
          password: hashedPassword,
          userType,
          isAccountManager,
          isPrimaryContact: false,
          mustChangePassword: false,
          isActive: true,
        });
      } else {
        acceptedUser = await storage.updateUser(existingUser.id, {
          username,
          email: normalizedInvitation.email.toLowerCase(),
          fullName: normalizedInvitation.fullName,
          password: hashedPassword,
          userType,
          isAccountManager,
          mustChangePassword: false,
          isActive: true,
          updatedAt: new Date(),
        }) || existingUser;
      }

      const existingAssignments = await storage.getUserRoles(acceptedUser.id);
      for (const assignment of existingAssignments) {
        await storage.removeUserRole(acceptedUser.id, assignment.roleId);
      }
      await storage.assignUserRole({ userId: acceptedUser.id, roleId: role.id });

      if (userType === "operations") {
        await ensureOperationProfile(
          acceptedUser.id,
          getOperationProfileLevelForHierarchy(role.hierarchyLevel),
        );
      }

      await storage.updateUserInvitation(normalizedInvitation.id, {
        status: UserInvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
        acceptedUserId: acceptedUser.id,
      });

      await logAudit(
        acceptedUser.id,
        "accept_user_invitation",
        "user_invitation",
        normalizedInvitation.id,
        `${acceptedUser.email} accepted invitation into ${department.name} as ${role.name}`,
        req.ip,
      );

      res.json({ success: true });
    } catch (error) {
      logError("Error accepting invitation", error);
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
        fullName: username,
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

  // Live FX rate for the current session's billing currency (SAR → currency multiplier).
  // Used to preview non-SAR prices before checkout; the paid rate is snapshotted per shipment.
  // Always 200 — non-client sessions (admin/ops) simply get SAR so the shared price component
  // can call this everywhere without auth noise.
  app.get("/api/client/fx-rate", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.json({ currency: "SAR", rate: 1, base: "SAR" });
      const user = await storage.getUser(userId);
      if (!user?.clientAccountId) return res.json({ currency: "SAR", rate: 1, base: "SAR" });
      const account = await storage.getClientAccount(user.clientAccountId);
      const currency = normalizeCurrency(account?.preferredCurrency);
      const rate = currency === "SAR" ? 1 : await getSarRate(currency);
      res.json({ currency, rate, base: "SAR" });
    } catch (error) {
      logError("Failed to load client FX rate", error);
      res.json({ currency: "SAR", rate: 1, base: "SAR" });
    }
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
    // Client-selectable billing/display currency. Drives all financial figures shown in the
    // portal and the charge currency at checkout (pricing stays SAR under the hood).
    preferredCurrency: z.enum(["SAR", "USD"]).optional(),
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
      await withBoundIntegrationAccount("zoho", currentClient?.zohoIntegrationAccountId, getClientIntegrationRoutingOptions(updated), async () => {
        if (!zohoService.isConfigured() || !currentClient?.zohoCustomerId) return;
        try {
          await zohoService.updateCustomer(currentClient.zohoCustomerId!, {
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
      });

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

  // Gate the bundled Sales Channels feature (Orders / Sales Channels / Assignment Rules).
  // 403 with a machine-readable code so the client UI can show a "request access" state.
  const requireSalesFeature = async (req: Request, res: Response, next: NextFunction) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }
    const account = await storage.getClientAccount(user.clientAccountId);
    if (!account?.salesFeaturesEnabled) {
      return res.status(403).json({ error: "Sales Channels feature is not enabled for your account.", code: "SALES_FEATURE_DISABLED" });
    }
    next();
  };

  // City <-> postal-code suggestions (bidirectional), proxied to GeoNames so the username stays
  // server-side. Configure GEONAMES_USERNAME (free signup at geonames.org). No-ops gracefully when
  // unset. Cached in-memory to stay within GeoNames' free rate limits.
  const geoSuggestCache = new Map<string, { at: number; results: Array<{ city: string; postalCode: string; state: string }> }>();
  const GEO_CACHE_TTL = 10 * 60 * 1000;

  app.get("/api/geo/postal-suggest", requireAuth, async (req, res) => {
    try {
      const country = String(req.query.country || "").trim().toUpperCase();
      const city = String(req.query.city || "").trim();
      const postal = String(req.query.postal || "").trim();
      const username = process.env.GEONAMES_USERNAME;

      if (!username) return res.json({ configured: false, results: [] });
      if (country.length !== 2 || (!city && !postal)) return res.json({ configured: true, results: [] });

      const key = `${country}|${city.toLowerCase()}|${postal.toLowerCase()}`;
      const cached = geoSuggestCache.get(key);
      if (cached && Date.now() - cached.at < GEO_CACHE_TTL) {
        return res.json({ configured: true, results: cached.results });
      }

      const params = new URLSearchParams({ country, maxRows: "10", username });
      if (postal) params.set("postalcode_startsWith", postal);
      else params.set("placename_startsWith", city);

      const url = `http://api.geonames.org/postalCodeSearchJSON?${params.toString()}`;
      const response = await fetch(url);
      const payload: any = await response.json().catch(() => ({}));
      const rows: any[] = Array.isArray(payload?.postalCodes) ? payload.postalCodes : [];

      const seen = new Set<string>();
      const results: Array<{ city: string; postalCode: string; state: string }> = [];
      for (const row of rows) {
        const c = String(row?.placeName || "").trim();
        const pc = String(row?.postalCode || "").trim();
        if (!c || !pc) continue;
        const dedupe = `${c.toLowerCase()}|${pc}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        results.push({ city: c, postalCode: pc, state: String(row?.adminName1 || "").trim() });
        if (results.length >= 8) break;
      }

      geoSuggestCache.set(key, { at: Date.now(), results });
      res.json({ configured: true, results });
    } catch (error) {
      logError("Geo postal suggest failed", error);
      res.json({ configured: true, results: [] });
    }
  });

  app.get(
    "/api/client/address-book",
    requireClient,
    requireClientPermission(ClientPermission.CREATE_SHIPMENTS),
    async (req, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const entries = await buildClientAddressBook(user.clientAccountId);
      res.json(entries);
    },
  );

  // Admin (quotation flow) - the target client's address book, so building a quote offers the
  // same saved sender/recipient addresses the client sees in create-shipment.
  app.get(
    "/api/admin/quotations/client/:clientAccountId/address-book",
    requireAdminPermission("shipments", "create"),
    async (req, res) => {
      try {
        const account = await storage.getClientAccount(req.params.clientAccountId);
        if (!account) {
          return res.status(404).json({ error: "Client account not found" });
        }
        const entries = await buildClientAddressBook(req.params.clientAccountId);
        res.json(entries);
      } catch (error) {
        logError("Error building client address book for quotation", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

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

  app.get("/api/client/abandoned-recovery/offers", requireClient, requireClientPermission(ClientPermission.VIEW_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const recoveries = await storage.getAbandonedShipmentRecoveries({
        clientAccountIds: [user.clientAccountId],
        includeDismissed: false,
      });
      const activeOffers = [];

      for (const recovery of recoveries) {
        if (recovery.status !== AbandonedShipmentRecoveryStatus.DISCOUNT_SENT) {
          continue;
        }

        const shipment = await storage.getShipment(recovery.shipmentId);
        if (!shipment || shipment.clientAccountId !== user.clientAccountId) {
          continue;
        }

        const activeOffer = await getActiveAbandonedRecoveryOffer(shipment);
        if (!activeOffer) {
          continue;
        }

        activeOffers.push({
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          recipientName: shipment.recipientName,
          destination: [shipment.recipientCity, shipment.recipientCountry].filter(Boolean).join(", "),
          carrierName: shipment.carrierName,
          serviceType: shipment.serviceType,
          currency: shipment.currency || "SAR",
          createdAt: shipment.createdAt,
          offer: serializeAbandonedRecoveryOffer(activeOffer),
        });
      }

      activeOffers.sort((a, b) => {
        const aExpiry = a.offer?.expiresAt ? new Date(a.offer.expiresAt).getTime() : 0;
        const bExpiry = b.offer?.expiresAt ? new Date(b.offer.expiresAt).getTime() : 0;
        return aExpiry - bExpiry;
      });

      res.json(activeOffers);
    } catch (error) {
      logError("Failed to load active abandoned recovery offers", error);
      res.status(500).json({ error: "Failed to load active offers" });
    }
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
    company: z.string().optional(),
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

  // Local (domestic KSA) — fully isolated from express/DDP. Only sender, recipient,
  // pieces and total weight. No postal code, items, HS codes, customs or dimensions.
  const localAddressSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().min(1, "Phone is required"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    city: z.string().min(1, "City is required"),
    district: z.string().optional(),
    addressLine1: z.string().min(1, "Address is required"),
    shortAddress: z.string().optional(),
  });

  const localShipmentInputSchema = z.object({
    shipper: localAddressSchema,
    recipient: localAddressSchema,
    pieces: z.number().int().positive("Number of pieces must be at least 1").default(1),
    weight: z.number().positive("Total weight must be positive"),
    weightUnit: z.enum(["LB", "KG"]).default("KG"),
    currency: z.string().default("SAR"),
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
    shipDate: z.string().optional(),
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

  const packageExtractionSchema = z.object({
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

        const extraction = await withShipmentIntegrationAccount(
          "gemini",
          {
            shipperCountryCode: data.shipperCountryCode,
            recipientCountryCode: destinationCountry,
          },
          () => extractInvoiceItemsFromDocument(
            {
              fileName: data.fileName,
              objectPath: data.objectPath,
              contentType: data.contentType,
            },
            {
              fallbackCountryOfOrigin: data.shipperCountryCode,
              fallbackCurrency: "SAR",
            },
          ),
        );

        const hsEnrichment = await withShipmentIntegrationAccount(
          "fedex",
          {
            shipperCountryCode: data.shipperCountryCode,
            recipientCountryCode: destinationCountry,
          },
          () => enrichInvoiceItemsWithHsCodes(extraction.items, {
            clientAccountId: user?.clientAccountId || undefined,
            destinationCountry,
          }),
        );

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

  app.post(
    "/api/client/shipments/extract-package-details",
    requireClient,
    requireClientPermission(ClientPermission.CREATE_SHIPMENTS),
    async (req, res) => {
      try {
        const data = packageExtractionSchema.parse(req.body);
        const extraction = await withShipmentIntegrationAccount(
          "gemini",
          {},
          () => extractPackageDetailsFromDocument({
            fileName: data.fileName,
            objectPath: data.objectPath,
            contentType: data.contentType,
          }),
        );

        const { warnings, ...clientExtraction } = extraction;
        const totalWeight = clientExtraction.packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0);

        res.json({
          ...clientExtraction,
          summary: {
            importedPackageCount: clientExtraction.packages.length,
            totalWeight: Number(totalWeight.toFixed(3)),
            aiAssisted: clientExtraction.extractionMethod === "gemini",
            hasParsingWarnings: warnings.length > 0,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors[0].message });
        }

        const message = error instanceof Error ? error.message : "Failed to extract package details";
        res.status(422).json({ error: message });
      }
    },
  );

  const ddpPackageSchema = z.object({
    weight: z.number().nonnegative().default(0),
    length: z.number().nonnegative().default(0),
    width: z.number().nonnegative().default(0),
    height: z.number().nonnegative().default(0),
  });
  const ddpOriginSchema = z.object({
    countryCode: z.string().trim().length(2, "Select an origin country").transform((value) => value.toUpperCase()),
  });

  const ddpRateSchema = z.object({
    transportMethod: z.enum([DdpTransportMethod.AIR, DdpTransportMethod.SEA, DdpTransportMethod.DOMESTIC]),
    shipper: ddpOriginSchema,
    recipient: addressSchema,
    supplierName: z.string().trim().min(1, "Supplier name is required"),
    supplierPhone: z.string().trim().min(1, "Supplier phone is required"),
    packages: z.array(ddpPackageSchema).min(1, "At least one package is required"),
    totalCbm: z.number().nonnegative().optional(),
  });

  app.get("/api/client/ddp/lanes", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (_req, res) => {
    const lanes = (await storage.getDdpPricingLanes()).filter(
      (lane) => lane.isActive && !lane.originCity?.trim() && !lane.destinationCity?.trim(),
    );
    res.json(lanes.map((lane) => ({
      id: lane.id,
      originCountryCode: lane.originCountryCode,
      originCity: lane.originCity,
      destinationCountryCode: lane.destinationCountryCode,
      destinationCity: lane.destinationCity,
      airAvailable: lane.airEnabled !== false && Number(lane.airBaseRatePerKg) > 0,
      seaAvailable: Number(lane.seaBaseRatePerCbm) > 0,
      domesticAvailable: Number(lane.domesticRatePerKg) > 0,
    })));
  });

  app.post("/api/client/ddp/rates", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const data = ddpRateSchema.parse(req.body);
      const lane = await storage.findDdpPricingLane({
        originCountryCode: data.shipper.countryCode,
        destinationCountryCode: data.recipient.countryCode,
        destinationCity: data.recipient.city,
      });
      if (!lane) {
        return res.status(404).json({ error: "Door To Door Freight pricing is not configured for this origin and destination yet." });
      }
      const account = await storage.getClientAccount(user.clientAccountId);
      const pricingRule = account ? await storage.getPricingRuleByProfile(account.profile) : undefined;
      const basePricing = calculateDdpPrice({
        lane,
        transportMethod: data.transportMethod,
        packages: data.packages,
        totalCbm: data.totalCbm,
        markupPercentage: 0,
      });
      const markupPercentage = pricingRule
        ? await storage.getDdpMarginForQuantity(pricingRule.id, basePricing.billingUnit, basePricing.billableQuantity)
        : 0;
      const pricing = calculateDdpPrice({
        lane,
        transportMethod: data.transportMethod,
        packages: data.packages,
        totalCbm: data.totalCbm,
        markupPercentage,
      });
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const quote = await storage.createShipmentRateQuote({
        clientAccountId: user.clientAccountId,
        shipmentData: JSON.stringify({ ...data, isDdp: true, fulfillmentType: "ddp_manual", ddpPricingLaneId: lane.id, ddpPricing: pricing }),
        carrierCode: "DDP",
        carrierName: "Door To Door Freight",
        serviceType: data.transportMethod,
        serviceName: `Door To Door Freight ${data.transportMethod === "air" ? "Air" : data.transportMethod === "sea" ? "Sea" : "Domestic"}`,
        actualWeight: pricing.actualWeightKg.toFixed(3),
        dimensionalWeight: pricing.dimensionalWeightKg.toFixed(3),
        chargeableWeight: pricing.billableQuantity.toFixed(3),
        chargeableWeightUnit: pricing.billingUnit,
        chargeableWeightDetails: JSON.stringify(pricing),
        baseRate: pricing.baseRateSar.toFixed(2),
        marginPercentage: pricing.markupPercentage.toFixed(2),
        marginAmount: pricing.markupAmountSar.toFixed(2),
        finalPrice: pricing.totalAmountSar.toFixed(2),
        currency: lane.currency,
        transitDays: pricing.transitDaysMax,
        expiresAt,
      });
      res.json({ quoteId: quote.id, expiresAt, pricing });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to calculate Door To Door Freight pricing" });
    }
  });

  // Quick Quote — read-only price check across the scopes we can price without addresses or
  // live carrier calls: domestic-KSA local carriers (rate cards) and DDP door-to-door lanes.
  // Reuses the exact production engines (resolveLocalRate / calculateDdpPrice /
  // calculateShipmentAccounting) but writes NO shipment_rate_quotes rows — unlike the real
  // /local/rates and /ddp/rates flows. Express/international is intentionally excluded (it
  // needs full addresses + managed carrier accounts for a live quote).
  const quickQuoteSchema = z.object({
    origin: z.object({
      countryCode: z.string().trim().length(2, "Origin country is required"),
      city: z.string().trim().optional(),
    }),
    destination: z.object({
      countryCode: z.string().trim().length(2, "Destination country is required"),
      city: z.string().trim().optional(),
    }),
    weightKg: z.number().positive("Weight must be positive"),
    length: z.number().nonnegative().optional(),
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    pieces: z.number().int().positive().default(1),
  });

  app.post("/api/client/quick-quote", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const data = quickQuoteSchema.parse(req.body);
      const account = await storage.getClientAccount(user.clientAccountId);
      const clientProfile = account?.profile || null;
      const pricingRule = clientProfile ? await storage.getPricingRuleByProfile(clientProfile) : undefined;

      const originCountry = data.origin.countryCode.toUpperCase();
      const destinationCountry = data.destination.countryCode.toUpperCase();
      const pieces = data.pieces || 1;
      const L = data.length || 0;
      const W = data.width || 0;
      const H = data.height || 0;
      const totalWeightKg = data.weightKg * pieces;
      const totalCbm = (L * W * H) / 1_000_000 * pieces;
      const chargeableAirKg = Math.max(totalWeightKg, totalCbm * 167);

      // Serve an identical recent quote from cache (fast + shields carriers from debounce spam).
      const cacheKey = JSON.stringify([originCountry, destinationCountry, data.weightKg, L, W, H, pieces, clientProfile]);
      const cached = getQuickQuoteCache(cacheKey);
      if (cached) return res.json(cached);

      // ── Local (domestic KSA) — rate cards for real + virtual carriers ──
      const localQuotes: Array<Record<string, unknown>> = [];
      if (originCountry === "SA" && destinationCountry === "SA") {
        const localCarriers = [
          ...carrierService.getLocalCarriers("SA").map((a) => ({ code: a.carrierCode, name: a.name })),
          ...(await storage.listVirtualCarriers(true)).map((vc) => ({ code: vc.code, name: vc.name })),
        ];
        for (const carrier of localCarriers) {
          const local = await resolveLocalRate({
            carrierCode: carrier.code,
            weightKg: totalWeightKg,
            clientProfile,
            liveBaseRateSar: null,
          });
          if (!local) continue;
          const snapshot = calculateShipmentAccounting({
            shipmentType: "domestic",
            isDdp: false,
            recipientCountryCode: "SA",
            baseRate: local.baseRate,
            marginAmount: local.marginAmount,
          });
          localQuotes.push({
            carrierCode: carrier.code,
            carrierName: carrier.name,
            baseRate: local.baseRate,
            markup: local.marginAmount,
            vat: snapshot.sellTaxAmountSar,
            clientTotal: snapshot.clientTotalAmountSar,
            transitDays: 2,
          });
        }
        localQuotes.sort((a, b) => Number(a.clientTotal) - Number(b.clientTotal));
      }

      // ── DDP door-to-door — country-level lane, per available transport method ──
      const ddpQuotes: Array<Record<string, unknown>> = [];
      const lane = await storage.findDdpPricingLane({
        originCountryCode: originCountry,
        destinationCountryCode: destinationCountry,
        destinationCity: data.destination.city,
      });
      if (lane && lane.isActive) {
        const methods: DdpTransportMethodValue[] = [];
        if (lane.airEnabled !== false && Number(lane.airBaseRatePerKg) > 0) methods.push(DdpTransportMethod.AIR);
        if (Number(lane.seaBaseRatePerCbm) > 0) methods.push(DdpTransportMethod.SEA);
        if (Number(lane.domesticRatePerKg) > 0) methods.push(DdpTransportMethod.DOMESTIC);

        for (const transportMethod of methods) {
          const isKgBilled = transportMethod !== DdpTransportMethod.SEA;
          const packages = isKgBilled
            ? Array.from({ length: pieces }, () => ({ weight: data.weightKg, length: L, width: W, height: H }))
            : [];
          try {
            const basePricing = calculateDdpPrice({ lane, transportMethod, packages, totalCbm, markupPercentage: 0 });
            const markupPercentage = pricingRule
              ? await storage.getDdpMarginForQuantity(pricingRule.id, basePricing.billingUnit, basePricing.billableQuantity)
              : 0;
            const pricing = calculateDdpPrice({ lane, transportMethod, packages, totalCbm, markupPercentage });
            const snapshot = calculateShipmentAccounting({
              shipmentType: "inbound",
              isDdp: true,
              recipientCountryCode: lane.destinationCountryCode || "SA",
              baseRate: pricing.baseRateSar,
              marginAmount: pricing.markupAmountSar,
            });
            ddpQuotes.push({
              transportMethod,
              billingUnit: pricing.billingUnit,
              billableQuantity: pricing.billableQuantity,
              ratePerUnit: pricing.ratePerUnitSar,
              baseRate: pricing.baseRateSar,
              markup: pricing.markupAmountSar,
              vat: snapshot.sellTaxAmountSar,
              clientTotal: snapshot.clientTotalAmountSar,
              transitDays: pricing.transitDaysMax,
              laneId: lane.id,
            });
          } catch {
            // A method that can't be priced (e.g. sea with no dimensions) is skipped, not fatal.
          }
        }
      }

      // ── Express — LIVE carrier rates (FedEx/DHL/Aramex) via representative postal codes ──
      // Same rate engines + account binding as /api/client/shipments/rates, but keyed off a
      // representative { city, postal } per country so no full address is needed. Returns every
      // service level the carriers quote. Carriers with no working account / rate are skipped.
      const expressQuotes: Array<Record<string, unknown>> = [];
      const expressShipper = buildQuickQuoteRateAddress(originCountry);
      const expressRecipient = buildQuickQuoteRateAddress(destinationCountry);
      if (expressShipper && expressRecipient) {
        const expressShipmentType = originCountry === destinationCountry
          ? "domestic"
          : destinationCountry === "SA" ? "inbound" : "outbound";
        const defaultMarginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;
        const rateRequest = {
          shipper: expressShipper,
          recipient: expressRecipient,
          packages: Array.from({ length: pieces }, () => ({
            weight: data.weightKg,
            weightUnit: "KG" as const,
            // Only send dimensions when the client provided them (all positive) — otherwise
            // omit so carriers rate on weight (DHL rejects zero dimensions).
            ...(L > 0 && W > 0 && H > 0
              ? { dimensions: { length: L, width: W, height: H, unit: "CM" as const } }
              : {}),
            packageType: "YOUR_PACKAGING",
          })),
          serviceType: "",
          packagingType: "YOUR_PACKAGING",
          currency: "SAR",
        };
        // International carriers only (exclude local + aggregator provider adapters).
        const intlCarriers = carrierService.getSupportedCarriers().filter(
          (a) => !a.capabilities || a.capabilities.type !== "local",
        );
        const routingOptions = {
          shipperCountryCode: originCountry,
          recipientCountryCode: destinationCountry,
          clientAccountId: user.clientAccountId,
        };
        // Cap each carrier so one slow API (FedEx availability + service-type loop) can't
        // stall the whole quote — a carrier that overruns is simply dropped from this quote.
        const CARRIER_TIMEOUT_MS = 8000;
        await Promise.all(intlCarriers.map((carrierAdapter) => {
          const work = (async () => {
          try {
            const appKey = getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode);
            const managedAccounts = await getEligibleIntegrationAccountsForShipment(appKey, routingOptions);
            const accountRateResults = await Promise.all(
              managedAccounts.map(async (integrationAccount) => {
                try {
                  return {
                    integrationAccountId: integrationAccount.id,
                    carrierRates: await withIntegrationAccount(integrationAccount, () => carrierAdapter.getRates(rateRequest)),
                  };
                } catch {
                  return { integrationAccountId: integrationAccount.id, carrierRates: [] as Awaited<ReturnType<CarrierAdapter["getRates"]>> };
                }
              }),
            );
            if (managedAccounts.length === 0 && (process.env.NODE_ENV !== "production" || carrierAdapter.isConfigured())) {
              try {
                accountRateResults.push({ integrationAccountId: `env:${appKey}`, carrierRates: await carrierAdapter.getRates(rateRequest) });
              } catch { /* carrier not configured / no rate — skip */ }
            }
            const winning = selectCheapestCarrierAccountPortfolio(accountRateResults);
            for (const rate of winning?.carrierRates || []) {
              // Skip products the carrier returns with no real price (e.g. DHL ECONOMY
              // SELECT / FREIGHT WORLDWIDE come back at 0 on unsupported lanes).
              if (!Number.isFinite(rate.baseRate) || rate.baseRate <= 0) continue;
              const marginPercentage = pricingRule
                ? await storage.getMarginForAmount(pricingRule.id, rate.baseRate)
                : defaultMarginPercentage;
              const marginAmount = rate.baseRate * (marginPercentage / 100);
              const snapshot = calculateShipmentAccounting({
                shipmentType: expressShipmentType,
                isDdp: false,
                recipientCountryCode: destinationCountry,
                baseRate: rate.baseRate,
                marginAmount,
              });
              expressQuotes.push({
                carrierCode: carrierAdapter.carrierCode,
                carrierName: carrierAdapter.name,
                serviceType: rate.serviceType,
                serviceName: rate.serviceName,
                clientTotal: snapshot.clientTotalAmountSar,
                transitDays: rate.transitDays ?? null,
              });
            }
          } catch (err) {
            logError(`Quick quote express rate failed for ${carrierAdapter.carrierCode}`, err);
          }
          })();
          const timeout = new Promise<void>((resolve) => setTimeout(resolve, CARRIER_TIMEOUT_MS));
          return Promise.race([work, timeout]);
        }));
        // Dedupe identical service levels (same carrier + service), keeping the cheapest.
        const seen = new Map<string, Record<string, unknown>>();
        for (const q of expressQuotes) {
          const key = `${q.carrierCode}|${q.serviceType || q.serviceName}`;
          const prev = seen.get(key);
          if (!prev || Number(q.clientTotal) < Number(prev.clientTotal)) seen.set(key, q);
        }
        expressQuotes.length = 0;
        expressQuotes.push(...seen.values());
        expressQuotes.sort((a, b) => Number(a.clientTotal) - Number(b.clientTotal));
      }

      const payload = {
        chargeable: {
          totalWeightKg: Math.round(totalWeightKg * 1000) / 1000,
          totalCbm: Math.round(totalCbm * 10000) / 10000,
          chargeableAirKg: Math.round(chargeableAirKg * 1000) / 1000,
          pieces,
        },
        local: localQuotes,
        ddp: ddpQuotes,
        express: expressQuotes,
        available: { local: localQuotes.length > 0, ddp: ddpQuotes.length > 0, express: expressQuotes.length > 0 },
        currency: "SAR",
      };
      setQuickQuoteCache(cacheKey, payload);
      res.json(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to build quick quote", error);
      res.status(500).json({ error: "Failed to build quick quote" });
    }
  });

  // ─── Client quotation review / modify (auto re-price) — a payment_pending isQuote shipment ───
  const quotationTypeForShipment = (s: Shipment): "express" | "local" | "ddp" =>
    s.fulfillmentType === "local" ? "local" : (s.fulfillmentType === "ddp_manual" || s.isDdp) ? "ddp" : "express";

  const parseQuotePackages = (s: Shipment): Array<{ weight: number; length: number; width: number; height: number }> => {
    try {
      const arr = JSON.parse(s.packagesData || "[]");
      if (Array.isArray(arr) && arr.length) {
        return arr.map((p: any) => ({
          weight: Number(p.weight) || 0, length: Number(p.length) || 0, width: Number(p.width) || 0, height: Number(p.height) || 0,
        }));
      }
    } catch { /* fall through */ }
    return [{ weight: Number(s.weight) || 0, length: Number(s.length) || 0, width: Number(s.width) || 0, height: Number(s.height) || 0 }];
  };

  const serializeQuotation = (s: Shipment) => ({
    id: s.id,
    trackingNumber: s.trackingNumber,
    type: quotationTypeForShipment(s),
    status: s.status,
    paymentStatus: s.paymentStatus,
    isQuote: s.isQuote,
    carrierCode: s.carrierCode,
    carrierName: s.carrierName,
    serviceType: s.serviceType,
    currency: s.currency || "SAR",
    shipper: {
      name: s.senderName, phone: s.senderPhone, email: s.senderEmail || "",
      addressLine1: s.senderAddress, addressLine2: s.senderAddressLine2 || "",
      city: s.senderCity, stateOrProvince: s.senderStateOrProvince || "",
      postalCode: s.senderPostalCode || "", countryCode: s.senderCountry, shortAddress: s.senderShortAddress || "",
    },
    recipient: {
      name: s.recipientName, phone: s.recipientPhone, email: s.recipientEmail || "",
      addressLine1: s.recipientAddress, addressLine2: s.recipientAddressLine2 || "",
      city: s.recipientCity, stateOrProvince: s.recipientStateOrProvince || "",
      postalCode: s.recipientPostalCode || "", countryCode: s.recipientCountry, shortAddress: s.recipientShortAddress || "",
    },
    packages: parseQuotePackages(s),
    weightUnit: s.weightUnit || "KG",
    dimensionUnit: s.dimensionUnit || "CM",
    note: s.quoteNote || "",
    items: (() => { try { return JSON.parse(s.itemsData || "[]"); } catch { return []; } })(),
    tradeDocuments: (() => { try { return JSON.parse(s.tradeDocumentsData || "[]"); } catch { return []; } })(),
    supplierName: s.ddpSupplierName || "",
    supplierPhone: s.ddpSupplierPhone || "",
    specialInstructions: s.ddpSpecialInstructions || "",
    // DDP quotes need the client's customs/terms/broker consent before payment.
    requiresConsent: Boolean(s.isDdp),
    consentAccepted: Boolean(s.ddpTermsAcceptedAt && s.ddpBrokerAuthorizationAcceptedAt),
    pricing: {
      baseRate: Number(s.baseRate || 0),
      marginAmount: Number(s.marginAmount || 0),
      discountSar: Number(s.quoteDiscountSar || 0),
      extraChargeSar: Number(s.quoteExtraChargeSar || 0),
      vatAmountSar: Number(s.sellTaxAmountSar || 0),
      clientTotalSar: Number(s.finalPrice || 0),
    },
    canPay: s.paymentStatus !== "paid" && ["payment_pending", "carrier_error"].includes(String(s.status || "").toLowerCase()),
  });

  // Live express base rate for a quote's carrier, using its (client-edited, real) addresses.
  async function fetchQuoteExpressBaseRate(s: Shipment, packages: Array<{ weight: number; length: number; width: number; height: number }>): Promise<number | null> {
    const adapter = getCarrierAdapter(resolveCarrierCode(s.carrierCode || s.carrierName));
    const appKey = getIntegrationAppKeyForCarrier(adapter.carrierCode);
    const rateRequest = {
      shipper: { name: s.senderName, streetLine1: s.senderAddress, city: s.senderCity, stateOrProvince: s.senderStateOrProvince || undefined, postalCode: s.senderPostalCode || "", countryCode: s.senderCountry, phone: s.senderPhone },
      recipient: { name: s.recipientName, streetLine1: s.recipientAddress, city: s.recipientCity, stateOrProvince: s.recipientStateOrProvince || undefined, postalCode: s.recipientPostalCode || "", countryCode: s.recipientCountry, phone: s.recipientPhone },
      packages: packages.map((p) => ({ weight: p.weight, weightUnit: (s.weightUnit || "KG") as "KG" | "LB", dimensions: { length: p.length, width: p.width, height: p.height, unit: (s.dimensionUnit || "CM") as "CM" | "IN" }, packageType: s.packageType || "YOUR_PACKAGING" })),
      serviceType: s.carrierServiceType || "",
      packagingType: s.packageType || "YOUR_PACKAGING",
      currency: "SAR",
    };
    const routingOptions = { shipperCountryCode: s.senderCountry, recipientCountryCode: s.recipientCountry, clientAccountId: s.clientAccountId };
    const accounts = await getEligibleIntegrationAccountsForShipment(appKey, routingOptions);
    const results: Array<{ integrationAccountId: string; carrierRates: Awaited<ReturnType<CarrierAdapter["getRates"]>> }> = [];
    for (const acc of accounts) {
      try { results.push({ integrationAccountId: acc.id, carrierRates: await withIntegrationAccount(acc, () => adapter.getRates(rateRequest)) }); } catch { /* skip */ }
    }
    if (accounts.length === 0 && (process.env.NODE_ENV !== "production" || adapter.isConfigured())) {
      try { results.push({ integrationAccountId: `env:${appKey}`, carrierRates: await adapter.getRates(rateRequest) }); } catch { /* skip */ }
    }
    const rates = selectCheapestCarrierAccountPortfolio(results)?.carrierRates || [];
    if (rates.length === 0) return null;
    const match = rates.find((r) => r.serviceType === s.carrierServiceType) || [...rates].sort((a, b) => a.baseRate - b.baseRate)[0];
    return match ? match.baseRate : null;
  }

  // Editable fields for a pending shipment / quotation.
  const pendingShipmentPatchSchema = z.object({
    shipper: quotationAddressSchema.optional(),
    recipient: quotationAddressSchema.optional(),
    packages: z.array(z.object({
      weight: z.number().positive("Weight must be positive"),
      length: z.number().nonnegative().default(0),
      width: z.number().nonnegative().default(0),
      height: z.number().nonnegative().default(0),
    })).min(1).optional(),
    items: z.array(quotationItemSchema).optional(),
  });

  // Apply an edit to a payment_pending shipment (quote or regular) and re-price with the real
  // rate engines. Preserves any admin discount/extra; drops an absolute override since the
  // shipment changed. Throws with .httpStatus set when a live express rate can't be fetched.
  async function repricePendingShipment(
    shipment: Shipment,
    body: z.infer<typeof pendingShipmentPatchSchema>,
  ): Promise<Shipment> {
    const shipper = body.shipper || serializeQuotation(shipment).shipper;
    const recipient = body.recipient || serializeQuotation(shipment).recipient;
    const packages = body.packages || parseQuotePackages(shipment);
    const totalWeightKg = packages.reduce((sum, p) => sum + p.weight, 0);
    const type = quotationTypeForShipment(shipment);
    const isIntl = type === "ddp" || (type === "express" && shipper.countryCode !== recipient.countryCode);

    let items: any[] | undefined = body.items;
    if (items && isIntl) {
      const enriched = await enrichItemsWithHsCodes(items, { clientAccountId: shipment.clientAccountId, destinationCountry: recipient.countryCode });
      items = enriched.items;
    }

    let baseRateSar: number | undefined;
    if (type === "express") {
      const fetched = await fetchQuoteExpressBaseRate({ ...shipment, senderCountry: shipper.countryCode, senderCity: shipper.city, senderPostalCode: shipper.postalCode, senderAddress: shipper.addressLine1, senderName: shipper.name, senderPhone: shipper.phone, recipientCountry: recipient.countryCode, recipientCity: recipient.city, recipientPostalCode: recipient.postalCode, recipientAddress: recipient.addressLine1, recipientName: recipient.name, recipientPhone: recipient.phone } as Shipment, packages);
      if (fetched == null) {
        const err: any = new Error("Could not get a live carrier rate for the updated shipment. Please contact support.");
        err.httpStatus = 502;
        throw err;
      }
      baseRateSar = fetched;
    }

    const account = await storage.getClientAccount(shipment.clientAccountId);
    const pricing = await computeQuotationPricing({
      type,
      clientProfile: account?.profile || null,
      originCountryCode: shipper.countryCode,
      destinationCountryCode: recipient.countryCode,
      destinationCity: recipient.city,
      weightKg: totalWeightKg,
      pieces: packages.length,
      length: packages[0].length,
      width: packages[0].width,
      height: packages[0].height,
      baseRateSar,
      carrierCode: shipment.carrierCode || undefined,
      ddpTransportMethod: (shipment.ddpTransportMethod as DdpTransportMethodValue) || undefined,
      discountSar: Number(shipment.quoteDiscountSar || 0),
      extraChargeSar: Number(shipment.quoteExtraChargeSar || 0),
    });
    const snapshot = calculateShipmentAccounting({
      shipmentType: pricing.shipmentType, isDdp: pricing.isDdp, recipientCountryCode: recipient.countryCode,
      baseRate: pricing.baseRate, marginAmount: pricing.marginAmount,
    });

    const updated = await storage.updateShipment(shipment.id, {
      senderName: shipper.name, senderPhone: shipper.phone, senderEmail: shipper.email || null,
      senderAddress: shipper.addressLine1, senderAddressLine2: shipper.addressLine2 || null,
      senderCity: shipper.city, senderStateOrProvince: shipper.stateOrProvince || null,
      senderPostalCode: shipper.postalCode || null, senderCountry: shipper.countryCode, senderShortAddress: shipper.shortAddress || null,
      recipientName: recipient.name, recipientPhone: recipient.phone, recipientEmail: recipient.email || null,
      recipientAddress: recipient.addressLine1, recipientAddressLine2: recipient.addressLine2 || null,
      recipientCity: recipient.city, recipientStateOrProvince: recipient.stateOrProvince || null,
      recipientPostalCode: recipient.postalCode || null, recipientCountry: recipient.countryCode, recipientShortAddress: recipient.shortAddress || null,
      weight: totalWeightKg.toString(),
      length: packages[0].length.toString(), width: packages[0].width.toString(), height: packages[0].height.toString(),
      numberOfPackages: packages.length,
      packagesData: JSON.stringify(packages),
      ...(items ? { itemsData: JSON.stringify(items) } : {}),
      shipmentType: pricing.shipmentType,
      baseRate: pricing.baseRate.toFixed(2),
      marginAmount: pricing.marginAmount.toFixed(2),
      margin: pricing.marginAmount.toFixed(2),
      finalPrice: pricing.clientTotalSar.toFixed(2),
      ...getShipmentAccountingInsert(snapshot),
      ...(pricing.supplierCostSar != null ? { ddpSupplierCostSar: pricing.supplierCostSar.toFixed(2) } : {}),
    });
    return updated || shipment;
  }

  /** A shipment can only be edited before it is paid/booked with the carrier. */
  const isShipmentEditable = (s: Shipment): boolean =>
    s.status === "payment_pending" && s.paymentStatus !== "paid" && !s.carrierTrackingNumber;

  app.get("/api/client/quotations/:id", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    const shipment = await storage.getShipment(req.params.id);
    if (!shipment || shipment.clientAccountId !== user.clientAccountId) return res.status(404).json({ error: "Quotation not found" });
    if (!shipment.isQuote) return res.status(400).json({ error: "This shipment is not a quotation." });
    res.json(serializeQuotation(shipment));
  });

  app.patch("/api/client/quotations/:id", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment || shipment.clientAccountId !== user.clientAccountId) return res.status(404).json({ error: "Quotation not found" });
      if (!shipment.isQuote) return res.status(400).json({ error: "This shipment is not a quotation." });
      if (shipment.paymentStatus === "paid" || shipment.status !== "payment_pending") {
        return res.status(400).json({ error: "This quotation can no longer be modified." });
      }

      const body = pendingShipmentPatchSchema.parse(req.body);
      const updated = await repricePendingShipment(shipment, body);

      await logAudit(req.session.userId, "modify_quotation", "shipment", shipment.id,
        `Client modified quotation ${shipment.trackingNumber}; new total SAR ${Number(updated.finalPrice || 0).toFixed(2)}`, req.ip);
      res.json(serializeQuotation(updated));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to modify quotation", error);
      res.status((error as any)?.httpStatus || 400).json({ error: error instanceof Error ? error.message : "Failed to modify quotation" });
    }
  });

  // Modify a payment_pending shipment (client-owned, any type) with auto re-price. Same engine
  // as quotation edit; works for regular checkout shipments awaiting payment too.
  app.patch("/api/client/shipments/:id", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment || shipment.clientAccountId !== user.clientAccountId) return res.status(404).json({ error: "Shipment not found" });
      if (!isShipmentEditable(shipment)) return res.status(400).json({ error: "Only shipments awaiting payment can be modified." });

      const body = pendingShipmentPatchSchema.parse(req.body);
      const updated = await repricePendingShipment(shipment, body);
      await logAudit(req.session.userId, "modify_shipment", "shipment", shipment.id,
        `Client modified pending shipment ${shipment.trackingNumber}; new total SAR ${Number(updated.finalPrice || 0).toFixed(2)}`, req.ip);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to modify shipment", error);
      res.status((error as any)?.httpStatus || 400).json({ error: error instanceof Error ? error.message : "Failed to modify shipment" });
    }
  });

  // Admin modify a payment_pending shipment for any client, with auto re-price.
  app.patch("/api/admin/shipments/:id", requireAdminPermission("shipments", "update"), async (req, res) => {
    try {
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });
      if (!isShipmentEditable(shipment)) return res.status(400).json({ error: "Only shipments awaiting payment can be modified." });

      const body = pendingShipmentPatchSchema.parse(req.body);
      const updated = await repricePendingShipment(shipment, body);
      await logAudit(req.session.userId, "modify_shipment", "shipment", shipment.id,
        `Admin modified pending shipment ${shipment.trackingNumber}; new total SAR ${Number(updated.finalPrice || 0).toFixed(2)}`, req.ip);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Admin failed to modify shipment", error);
      res.status((error as any)?.httpStatus || 400).json({ error: error instanceof Error ? error.message : "Failed to modify shipment" });
    }
  });

  // Client accepts the DDP customs / terms / broker-authorization declaration before paying.
  app.post("/api/client/quotations/:id/accept-terms", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment || shipment.clientAccountId !== user.clientAccountId || !shipment.isQuote) return res.status(404).json({ error: "Quotation not found" });
      const parsed = z.object({
        customsComplianceAccepted: z.literal(true),
        termsAccepted: z.literal(true),
        brokerAuthorizationAccepted: z.literal(true),
      }).parse(req.body);
      void parsed;
      const now = new Date();
      const updated = await storage.updateShipment(shipment.id, { ddpTermsAcceptedAt: now, ddpBrokerAuthorizationAcceptedAt: now });
      await logAudit(req.session.userId, "accept_quotation_terms", "shipment", shipment.id, `Accepted DDP declaration for ${shipment.trackingNumber}`, req.ip);
      res.json(serializeQuotation(updated || shipment));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "All three declarations must be accepted." });
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to accept terms" });
    }
  });

  app.post("/api/client/ddp/checkout", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const body = z.object({
        quoteId: z.string().uuid(),
        items: z.array(shipmentItemInputSchema).min(1, "Please add at least one shipment item."),
        tradeDocuments: z.array(shipmentTradeDocumentSchema).min(1, "A commercial invoice is required.").max(5),
        specialInstructions: z.string().max(2000).optional(),
        customsComplianceAccepted: z.literal(true),
        termsAccepted: z.literal(true),
        brokerAuthorizationAccepted: z.literal(true),
      }).parse(req.body);
      if (!body.tradeDocuments.some((document) => document.documentType === FedExTradeDocumentType.COMMERCIAL_INVOICE)) {
        return res.status(400).json({ error: "A commercial invoice is required." });
      }
      const quote = await storage.getShipmentRateQuote(body.quoteId);
      if (!quote || quote.clientAccountId !== user.clientAccountId || quote.carrierCode !== "DDP" || quote.expiresAt < new Date()) {
        return res.status(404).json({ error: "Door To Door Freight quote not found or expired" });
      }
      const data = JSON.parse(quote.shipmentData);
      const lane = await storage.getDdpPricingLane(data.ddpPricingLaneId);
      if (!lane?.isActive) {
        return res.status(400).json({ error: "This Door To Door Freight lane is no longer available." });
      }
      const account = await storage.getClientAccount(user.clientAccountId);
      const pricingRule = account ? await storage.getPricingRuleByProfile(account.profile) : undefined;
      const basePricing = calculateDdpPrice({
        lane,
        transportMethod: data.transportMethod,
        packages: data.packages,
        totalCbm: data.totalCbm,
        markupPercentage: 0,
      });
      const markupPercentage = pricingRule
        ? await storage.getDdpMarginForQuantity(pricingRule.id, basePricing.billingUnit, basePricing.billableQuantity)
        : 0;
      const pricing = calculateDdpPrice({
        lane,
        transportMethod: data.transportMethod,
        packages: data.packages,
        totalCbm: data.totalCbm,
        markupPercentage,
      });
      if (Math.abs(pricing.totalAmountSar - Number(quote.finalPrice)) > 0.01) {
        return res.status(400).json({ error: "Door To Door Freight price changed. Please request a fresh quote." });
      }
      const hsPreparedItems = await enrichItemsWithHsCodes(body.items, {
        clientAccountId: user.clientAccountId,
        destinationCountry: data.recipient.countryCode,
      });
      const accountingSnapshot = calculateShipmentAccounting({
        shipmentType: "inbound",
        isDdp: true,
        recipientCountryCode: data.recipient.countryCode,
        baseRate: pricing.baseRateSar,
        marginAmount: pricing.markupAmountSar,
      });
      const firstPackage = data.packages[0];
      const acceptedAt = new Date();
      const shipment = await storage.createShipment({
        clientAccountId: user.clientAccountId,
        senderName: data.supplierName,
        senderAddress: "Pickup coordination required",
        senderAddressLine2: null,
        senderCity: lane.originCity || "Pickup coordination required",
        senderStateOrProvince: null,
        senderPostalCode: null,
        senderCountry: data.shipper.countryCode,
        senderPhone: data.supplierPhone,
        senderEmail: null,
        recipientName: data.recipient.name,
        recipientAddress: data.recipient.addressLine1,
        recipientAddressLine2: data.recipient.addressLine2 || null,
        recipientCity: data.recipient.city,
        recipientStateOrProvince: data.recipient.stateOrProvince || null,
        recipientPostalCode: data.recipient.postalCode,
        recipientCountry: data.recipient.countryCode,
        recipientPhone: data.recipient.phone,
        recipientEmail: data.recipient.email || null,
        weight: pricing.actualWeightKg.toFixed(2),
        weightUnit: "KG",
        dimensionalWeight: pricing.dimensionalWeightKg.toFixed(3),
        chargeableWeight: pricing.billableQuantity.toFixed(3),
        chargeableWeightUnit: pricing.billingUnit,
        chargeableWeightDetails: JSON.stringify(pricing),
        length: String(firstPackage.length || 0),
        width: String(firstPackage.width || 0),
        height: String(firstPackage.height || 0),
        dimensionUnit: "CM",
        packageType: "DDP_MANUAL",
        numberOfPackages: data.packages.length,
        packagesData: JSON.stringify(data.packages),
        shipmentType: "inbound",
        fulfillmentType: "ddp_manual",
        ddpPricingLaneId: lane.id,
        ddpTransportMethod: data.transportMethod,
        ddpSupplierName: data.supplierName,
        ddpSupplierPhone: data.supplierPhone,
        ddpTotalCbm: pricing.totalCbm.toFixed(4),
        ddpBillableQuantity: pricing.billableQuantity.toFixed(4),
        ddpBillingUnit: pricing.billingUnit,
        ddpRatePerUnitSar: pricing.ratePerUnitSar.toFixed(2),
        ddpSupplierCostSar: pricing.supplierCostSar > 0 ? pricing.supplierCostSar.toFixed(2) : null,
        ddpSpecialInstructions: body.specialInstructions || null,
        ddpTermsAcceptedAt: acceptedAt,
        ddpBrokerAuthorizationAcceptedAt: acceptedAt,
        serviceType: data.transportMethod,
        currency: lane.currency,
        status: "payment_pending",
        baseRate: quote.baseRate,
        marginAmount: quote.marginAmount,
        margin: quote.marginAmount,
        finalPrice: quote.finalPrice,
        ...getShipmentAccountingInsert(accountingSnapshot),
        carrierCode: "DDP",
        carrierName: "Door To Door Freight",
        carrierServiceType: data.transportMethod,
        paymentStatus: "pending",
        itemsData: JSON.stringify(hsPreparedItems.items),
        tradeDocumentsData: JSON.stringify(body.tradeDocuments),
      });
      await logAudit(req.session.userId, "checkout_ddp_shipment", "shipment", shipment.id, `Created DDP checkout for ${shipment.trackingNumber}`, req.ip);
      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        amount: pricing.totalAmountSar,
        currency: lane.currency,
        pricing,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create DDP checkout", error);
      res.status(500).json({ error: "Failed to create Door To Door Freight checkout" });
    }
  });

  // STEP 1: Rate Discovery - Get rates from all carriers
  app.post("/api/client/shipments/rates", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = shipmentInputSchema.parse(req.body);

      if (data.isDdp) {
        return res.status(400).json({
          error: "Use the dedicated Door To Door Freight flow for door-to-door shipments.",
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
        shipDate: data.shipDate,
      };

      const carrierRateResults = await Promise.all(
        carrierAdapters.map(async (carrierAdapter) => {
          const appKey = getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode);
          const routingOptions = {
            shipperCountryCode: data.shipper.countryCode,
            recipientCountryCode: data.recipient.countryCode,
            clientAccountId: user.clientAccountId,
          };
          const managedAccounts = await getEligibleIntegrationAccountsForShipment(appKey, routingOptions);
          const accountRateResults = await Promise.all(
            managedAccounts.map(async (integrationAccount) => {
              try {
                return {
                  integrationAccountId: integrationAccount.id,
                  carrierRates: await withIntegrationAccount(
                    integrationAccount,
                    () => carrierAdapter.getRates(rateRequest),
                  ),
                };
              } catch (error) {
                logError("Carrier account rate lookup failed", {
                  carrierCode: carrierAdapter.carrierCode,
                  carrierName: carrierAdapter.name,
                  integrationAccountId: integrationAccount.id,
                  integrationAccountName: integrationAccount.accountName,
                  error: error instanceof Error ? error.message : String(error),
                });
                return {
                  integrationAccountId: integrationAccount.id,
                  carrierRates: [] as Awaited<ReturnType<CarrierAdapter["getRates"]>>,
                };
              }
            }),
          );

          if (managedAccounts.length === 0 && (process.env.NODE_ENV !== "production" || carrierAdapter.isConfigured())) {
            try {
              accountRateResults.push({
                integrationAccountId: `env:${appKey}`,
                carrierRates: await carrierAdapter.getRates(rateRequest),
              });
            } catch (error) {
              logError("Carrier environment rate lookup failed", {
                carrierCode: carrierAdapter.carrierCode,
                carrierName: carrierAdapter.name,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          const winningAccountResult = selectCheapestCarrierAccountPortfolio(accountRateResults);

          return {
            carrierAdapter,
            integrationAccountId: winningAccountResult?.integrationAccountId || null,
            carrierRates: winningAccountResult?.carrierRates || [],
          };
        }),
      );

      const availableCarriers = carrierRateResults
        .filter((result) => result.carrierRates.length > 0)
        .map(({ carrierAdapter }) => ({
          code: carrierAdapter.carrierCode,
          name: carrierAdapter.name,
        }));

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
        actualWeight: number;
        dimensionalWeight: number;
        chargeableWeight: number;
        chargeableWeightUnit: "KG" | "LB";
        chargeableWeightSource: "carrier" | "system";
      }> = [];

      // Quote expiration: 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      for (const { carrierAdapter, carrierRates, integrationAccountId } of carrierRateResults) {
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
            chargeableWeightDetails:
              rate.chargeableWeightDetails ||
              buildChargeableWeightSummaryFromShipmentInput(data, carrierAdapter.carrierCode),
          };
          // Prefer the carrier's own chargeable weight (FedEx billing weight / DHL provided vs
          // volumetric) so the stored quote — and the extra-weight charge derived from it at
          // checkout — matches what the carrier actually bills. Fall back to our estimate.
          const chargeableWeightDetails = rate.chargeableWeightDetails
            || parseStoredChargeableWeightSummary(quoteShipmentData.chargeableWeightDetails)
            || buildChargeableWeightSummaryFromShipmentInput(data, carrierAdapter.carrierCode);
          const quote = await storage.createShipmentRateQuote({
            clientAccountId: user.clientAccountId,
            shipmentData: JSON.stringify(quoteShipmentData),
            carrierCode: carrierAdapter.carrierCode,
            carrierName: carrierAdapter.name,
            carrierIntegrationAccountId: integrationAccountId,
            serviceType: rate.serviceType,
            serviceName: rate.serviceName,
            actualWeight: formatWeightValue(chargeableWeightDetails.actualWeight),
            dimensionalWeight: formatWeightValue(chargeableWeightDetails.dimensionalWeight),
            chargeableWeight: formatWeightValue(chargeableWeightDetails.chargeableWeight),
            chargeableWeightUnit: chargeableWeightDetails.weightUnit,
            chargeableWeightDetails: JSON.stringify(chargeableWeightDetails),
            baseRate: rate.baseRate.toFixed(2),
            marginPercentage: marginPercentage.toFixed(2),
            marginAmount: marginAmount.toFixed(2),
            finalPrice: accountingSnapshot.clientTotalAmountSar.toFixed(2),
            // Client-facing price is the SAR client total (accounting, checkout, Tap and invoices
            // are all SAR). The carrier's own rating currency (rate.currency) is not shown to the
            // client — leaking it would tag a SAR amount as e.g. USD.
            currency: "SAR",
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
            currency: "SAR",
            transitDays: rate.transitDays,
            estimatedDelivery: rate.deliveryDate,
            actualWeight: chargeableWeightDetails.actualWeight,
            dimensionalWeight: chargeableWeightDetails.dimensionalWeight,
            chargeableWeight: chargeableWeightDetails.chargeableWeight,
            chargeableWeightUnit: chargeableWeightDetails.weightUnit,
            chargeableWeightSource: rate.chargeableWeightSource || "system",
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

      res.json({ quotes, expiresAt, availableCarriers });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get shipping rates", error);
      res.status(500).json({ error: "Failed to get shipping rates" });
    }
  });

  // ── LOCAL SHIPMENTS (domestic KSA) — fully isolated flow ──────────────────────
  // No items, no customs, no commercial invoice, no HS codes, no dimensions. Sender +
  // recipient + pieces + total weight. Carriers are NOT chosen upfront — they surface
  // on the rate step. Priced from local_carrier_pricing_tiers, run through the DCE
  // accounting engine (full 15% VAT), same as a domestic shipment.

  // LOCAL step 1: rates across all eligible local carriers.
  app.post("/api/client/local/rates", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = localShipmentInputSchema.parse(req.body);
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const totalWeightKg = data.weightUnit === "LB" ? data.weight * 0.453592 : data.weight;
      const localCarriers = carrierService.getLocalCarriers("SA");
      const localPricingRule = account.profile ? await storage.getPricingRuleByProfile(account.profile) : undefined;

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const quotes: Array<Record<string, unknown>> = [];
      const availableCarriers: Array<{ code: string; name: string }> = [];

      for (const carrierAdapter of localCarriers) {
        const liveBaseRateSar = await resolveLiveLocalBaseRate(
          carrierAdapter,
          data.shipper.city,
          data.recipient.city,
          totalWeightKg,
        );
        // No-card carriers with a live domestic rate (iMile) are priced with the client's
        // pricing-rule margin as a fallback (20% when no rule), same as the express flow.
        const liveFallbackMarginPercent =
          liveBaseRateSar != null && liveBaseRateSar > 0
            ? localPricingRule
              ? await storage.getMarginForAmount(localPricingRule.id, liveBaseRateSar)
              : 20
            : null;
        const local = await resolveLocalRate({
          carrierCode: carrierAdapter.carrierCode,
          weightKg: totalWeightKg,
          clientProfile: account.profile,
          liveBaseRateSar,
          liveFallbackMarginPercent,
        });
        if (!local) continue;

        const accountingSnapshot = calculateShipmentAccounting({
          shipmentType: "domestic",
          isDdp: false,
          recipientCountryCode: "SA",
          baseRate: local.baseRate,
          marginAmount: local.marginAmount,
        });
        const marginPercentage = Math.min(
          local.baseRate > 0 ? (local.marginAmount / local.baseRate) * 100 : 0,
          999.99,
        );
        const serviceName = `${carrierAdapter.name} Domestic`;

        // Store only what the local flow needs so checkout stays isolated.
        const quoteShipmentData = {
          fulfillmentType: "local",
          carrier: carrierAdapter.carrierCode,
          shipper: data.shipper,
          recipient: data.recipient,
          pieces: data.pieces,
          weight: totalWeightKg,
          weightUnit: "KG",
        };
        const quote = await storage.createShipmentRateQuote({
          clientAccountId: user.clientAccountId,
          shipmentData: JSON.stringify(quoteShipmentData),
          carrierCode: carrierAdapter.carrierCode,
          carrierName: carrierAdapter.name,
          carrierIntegrationAccountId: null,
          serviceType: "LOCAL",
          serviceName,
          actualWeight: totalWeightKg.toFixed(3),
          dimensionalWeight: "0",
          chargeableWeight: totalWeightKg.toFixed(3),
          chargeableWeightUnit: "KG",
          baseRate: local.baseRate.toFixed(2),
          marginPercentage: marginPercentage.toFixed(2),
          marginAmount: local.marginAmount.toFixed(2),
          finalPrice: accountingSnapshot.clientTotalAmountSar.toFixed(2),
          currency: "SAR",
          transitDays: 2,
          expiresAt,
        });

        availableCarriers.push({ code: carrierAdapter.carrierCode, name: carrierAdapter.name });
        quotes.push({
          quoteId: quote.id,
          carrierCode: carrierAdapter.carrierCode,
          carrierName: carrierAdapter.name,
          serviceType: "LOCAL",
          serviceName,
          finalPrice: accountingSnapshot.clientTotalAmountSar,
          currency: "SAR",
          transitDays: 2,
          actualWeight: totalWeightKg,
          chargeableWeight: totalWeightKg,
          chargeableWeightUnit: "KG",
          chargeableWeightSource: "system",
        });
      }

      // Virtual carriers: client-facing couriers layered on Fizzpa/Shipox. Priced off their
      // own rate card (keyed by the virtual code); booked through the provider adapter with
      // the chosen courier written onto the provider order as a note. No live rate API.
      const virtualCarrierList = await storage.listVirtualCarriers(true);
      for (const vc of virtualCarrierList) {
        const local = await resolveLocalRate({
          carrierCode: vc.code,
          weightKg: totalWeightKg,
          clientProfile: account.profile,
          liveBaseRateSar: null,
        });
        if (!local) continue;

        const accountingSnapshot = calculateShipmentAccounting({
          shipmentType: "domestic",
          isDdp: false,
          recipientCountryCode: "SA",
          baseRate: local.baseRate,
          marginAmount: local.marginAmount,
        });
        const marginPercentage = Math.min(
          local.baseRate > 0 ? (local.marginAmount / local.baseRate) * 100 : 0,
          999.99,
        );
        const serviceName = vc.name;
        const assignmentNote = renderVirtualCarrierNote(vc);

        const quoteShipmentData = {
          fulfillmentType: "local",
          carrier: vc.code,
          provider: vc.provider,
          providerCarrierCode: vc.provider.toUpperCase(),
          carrierAssignmentNote: assignmentNote,
          shipper: data.shipper,
          recipient: data.recipient,
          pieces: data.pieces,
          weight: totalWeightKg,
          weightUnit: "KG",
        };
        const quote = await storage.createShipmentRateQuote({
          clientAccountId: user.clientAccountId,
          shipmentData: JSON.stringify(quoteShipmentData),
          carrierCode: vc.code,
          carrierName: vc.name,
          carrierIntegrationAccountId: null,
          serviceType: "LOCAL",
          serviceName,
          actualWeight: totalWeightKg.toFixed(3),
          dimensionalWeight: "0",
          chargeableWeight: totalWeightKg.toFixed(3),
          chargeableWeightUnit: "KG",
          baseRate: local.baseRate.toFixed(2),
          marginPercentage: marginPercentage.toFixed(2),
          marginAmount: local.marginAmount.toFixed(2),
          finalPrice: accountingSnapshot.clientTotalAmountSar.toFixed(2),
          currency: "SAR",
          transitDays: 2,
          expiresAt,
        });

        availableCarriers.push({ code: vc.code, name: vc.name });
        quotes.push({
          quoteId: quote.id,
          carrierCode: vc.code,
          carrierName: vc.name,
          serviceType: "LOCAL",
          serviceName,
          finalPrice: accountingSnapshot.clientTotalAmountSar,
          currency: "SAR",
          transitDays: 2,
          actualWeight: totalWeightKg,
          chargeableWeight: totalWeightKg,
          chargeableWeightUnit: "KG",
          chargeableWeightSource: "system",
        });
      }

      if (quotes.length === 0) {
        return res.status(502).json({
          error: "No local carrier rates available. An admin needs to configure local pricing tiers for this weight.",
        });
      }

      await logAudit(req.session.userId, "get_local_rates", "shipment", undefined, `Requested ${quotes.length} local rates`, req.ip);
      res.json({ quotes, expiresAt, availableCarriers });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get local rates", error);
      res.status(500).json({ error: "Failed to get local rates" });
    }
  });

  // LOCAL step 2: checkout — create the local shipment draft (payment pending). The
  // shared Tap/credit payment endpoints (`/api/client/shipments/:id/pay[-later]`)
  // finalize it into operations; local shipments are never auto-booked with a carrier.
  app.post("/api/client/local/checkout", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
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

      const { quoteId } = z.object({ quoteId: z.string().uuid("Invalid quote ID") }).parse(req.body);
      const quote = await storage.getShipmentRateQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found or expired" });
      }
      if (quote.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (quote.serviceType !== "LOCAL") {
        return res.status(400).json({ error: "This quote is not a local shipment quote." });
      }

      const stored = JSON.parse(quote.shipmentData) as {
        shipper: any; recipient: any; pieces: number; weight: number;
        providerCarrierCode?: string; carrierAssignmentNote?: string;
      };
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Re-derive the price server-side from the current tier (never trust the quote).
      const baseRate = Number(quote.baseRate);
      const local = await resolveLocalRate({
        carrierCode: quote.carrierCode,
        weightKg: Number(quote.chargeableWeight ?? stored.weight ?? 0),
        clientProfile: account.profile,
        liveBaseRateSar: baseRate,
      });
      if (!local) {
        return res.status(400).json({ error: "Local pricing is no longer available for this carrier. Please request a fresh quote." });
      }
      const accountingSnapshot = calculateShipmentAccounting({
        shipmentType: "domestic",
        isDdp: false,
        recipientCountryCode: "SA",
        baseRate,
        marginAmount: local.marginAmount,
      });
      if (Math.abs(accountingSnapshot.clientTotalAmountSar - Number(quote.finalPrice)) > 0.01) {
        return res.status(400).json({ error: "Price mismatch detected" });
      }

      const shipment = await storage.createShipment({
        clientAccountId: user.clientAccountId,
        senderName: stored.shipper.name,
        senderAddress: stored.shipper.addressLine1,
        senderCity: stored.shipper.city,
        senderStateOrProvince: stored.shipper.district || null,
        senderCountry: "SA",
        senderPhone: stored.shipper.phone,
        senderEmail: stored.shipper.email || null,
        senderShortAddress: stored.shipper.shortAddress || null,
        recipientName: stored.recipient.name,
        recipientAddress: stored.recipient.addressLine1,
        recipientCity: stored.recipient.city,
        recipientStateOrProvince: stored.recipient.district || null,
        recipientCountry: "SA",
        recipientPhone: stored.recipient.phone,
        recipientEmail: stored.recipient.email || null,
        recipientShortAddress: stored.recipient.shortAddress || null,
        weight: Number(quote.chargeableWeight ?? stored.weight).toString(),
        weightUnit: "KG",
        packageType: "PARCEL",
        numberOfPackages: stored.pieces || 1,
        shipmentType: "domestic",
        fulfillmentType: "local",
        serviceType: "LOCAL",
        currency: "SAR",
        status: "payment_pending",
        baseRate: quote.baseRate,
        marginAmount: quote.marginAmount,
        margin: quote.marginAmount,
        finalPrice: quote.finalPrice,
        ...getShipmentAccountingInsert(accountingSnapshot),
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        // Virtual carrier: keep the client-facing code/name on carrierCode/carrierName, but
        // record the real provider adapter + note so booking routes to Fizzpa/Shipox and
        // writes which downstream courier to assign onto their order.
        providerCarrierCode: stored.providerCarrierCode || null,
        carrierAssignmentNote: stored.carrierAssignmentNote || null,
        carrierServiceType: "LOCAL",
        paymentStatus: "pending",
      });

      await logAudit(req.session.userId, "checkout_local_shipment", "shipment", shipment.id,
        `Created local checkout for shipment ${shipment.trackingNumber}`, req.ip);

      const response = {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        amount: Number(quote.finalPrice),
        currency: "SAR",
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        serviceType: "LOCAL",
        serviceName: quote.serviceName,
        pieces: stored.pieces,
        weight: Number(quote.chargeableWeight ?? stored.weight),
      };
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 200);
      }
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create local checkout", error);
      res.status(500).json({ error: "Failed to create local checkout" });
    }
  });

  // ==========================================================================
  // Sales Channels (P2) — connected e-commerce stores + imported orders.
  // WooCommerce is the reference platform: per-store REST keys, no OAuth app.
  // ==========================================================================

  const salesChannelInputSchema = insertSalesChannelSchema
    .omit({ clientAccountId: true, credentialsEncrypted: true, syncSettings: true })
    .extend({
      // Raw per-store credentials (WooCommerce consumer_key/secret). Stored encrypted,
      // never returned to the client.
      credentials: z.record(z.string()).optional(),
      // Accept a JSON object or a pre-serialized string; normalized before persist.
      syncSettings: z.union([z.record(z.any()), z.string()]).optional(),
    });

  // Strip secrets before returning a channel to the client.
  const serializeChannel = (channel: any) => {
    const { credentialsEncrypted, webhookSecret, ...safe } = channel;
    return {
      ...safe,
      syncSettings: channel.syncSettings ? JSON.parse(channel.syncSettings) : null,
      hasCredentials: Boolean(credentialsEncrypted),
      hasWebhookSecret: Boolean(webhookSecret),
    };
  };

  app.get("/api/client/sales-channels", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    const channels = await storage.listSalesChannels(user.clientAccountId);
    res.json(channels.map(serializeChannel));
  });

  app.post("/api/client/sales-channels", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });

      const data = salesChannelInputSchema.parse(req.body);
      if (!getSalesChannelAdapter(data.platform)) {
        return res.status(400).json({ error: `Unsupported platform: ${data.platform}` });
      }

      const { credentials, syncSettings, ...rest } = data;
      const channel = await storage.createSalesChannel({
        ...rest,
        clientAccountId: user.clientAccountId,
        status: "connected",
        credentialsEncrypted: credentials ? encryptIntegrationPayload(credentials) : null,
        // Per-channel webhook secret the client configures on the store's webhook.
        webhookSecret: randomBytes(24).toString("hex"),
        syncSettings: syncSettings ? (typeof syncSettings === "string" ? syncSettings : JSON.stringify(syncSettings)) : null,
      });

      await logAudit(req.session.userId, "create_sales_channel", "sales_channel", channel.id,
        `Connected ${channel.platform} store ${channel.name}`, req.ip);

      // Return the webhook secret exactly once so the client can paste it into the
      // store's webhook config; it is never exposed again.
      res.status(201).json({ ...serializeChannel(channel), webhookSecret: channel.webhookSecret });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create sales channel", error);
      res.status(500).json({ error: "Failed to create sales channel" });
    }
  });

  app.patch("/api/client/sales-channels/:id", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const channel = await storage.getSalesChannel(req.params.id);
      if (!channel || channel.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Sales channel not found" });
      }

      const data = salesChannelInputSchema.partial().parse(req.body);
      const { credentials, syncSettings, ...rest } = data;
      const updates: Record<string, unknown> = { ...rest };
      if (credentials) updates.credentialsEncrypted = encryptIntegrationPayload(credentials);
      if (syncSettings !== undefined) {
        updates.syncSettings = syncSettings ? (typeof syncSettings === "string" ? syncSettings : JSON.stringify(syncSettings)) : null;
      }

      const updated = await storage.updateSalesChannel(req.params.id, updates as any);
      await logAudit(req.session.userId, "update_sales_channel", "sales_channel", req.params.id,
        `Updated sales channel ${channel.name}`, req.ip);
      res.json(serializeChannel(updated));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to update sales channel", error);
      res.status(500).json({ error: "Failed to update sales channel" });
    }
  });

  app.delete("/api/client/sales-channels/:id", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    const channel = await storage.getSalesChannel(req.params.id);
    if (!channel || channel.clientAccountId !== user.clientAccountId) {
      return res.status(404).json({ error: "Sales channel not found" });
    }
    await storage.deleteSalesChannel(req.params.id);
    await logAudit(req.session.userId, "delete_sales_channel", "sales_channel", req.params.id,
      `Disconnected sales channel ${channel.name}`, req.ip);
    res.status(204).end();
  });

  // Manual pull — poll the store's API on demand (no store-side webhook needed).
  app.post("/api/client/sales-channels/:id/sync", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const channel = await storage.getSalesChannel(req.params.id);
      if (!channel || channel.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Sales channel not found" });
      }
      const adapter = getSalesChannelAdapter(channel.platform);
      if (!adapter?.fetchOrders) {
        return res.status(400).json({ error: `${channel.platform} does not support order pull yet` });
      }

      const { imported } = await syncSalesChannel(channel);
      await logAudit(req.session.userId, "sync_sales_channel", "sales_channel", channel.id,
        `Pulled ${imported} order(s) from ${channel.name}`, req.ip);
      res.json({ imported });
    } catch (error) {
      logError("Manual sales-channel sync failed", error);
      res.status(502).json({ error: error instanceof Error ? error.message : "Sync failed" });
    }
  });

  // Orders inbox
  app.get("/api/client/orders", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const salesChannelId = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const orderRows = await storage.listOrders(user.clientAccountId, { status, salesChannelId });
    res.json(orderRows);
  });

  app.get("/api/client/orders/:id", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    const order = await storage.getOrder(req.params.id);
    if (!order || order.clientAccountId !== user.clientAccountId) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  });

  // Carrier assignment rules (opt-in auto-assignment; evaluated by priority).
  app.get("/api/client/carrier-rules", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    res.json(await storage.listCarrierAssignmentRules(user.clientAccountId));
  });

  app.post("/api/client/carrier-rules", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const data = insertCarrierAssignmentRuleSchema.omit({ clientAccountId: true }).parse(req.body);
      const rule = await storage.createCarrierAssignmentRule({ ...data, clientAccountId: user.clientAccountId });
      await logAudit(req.session.userId, "create_carrier_rule", "carrier_assignment_rule", rule.id,
        `Created carrier rule ${rule.name}`, req.ip);
      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to create carrier rule", error);
      res.status(500).json({ error: "Failed to create carrier rule" });
    }
  });

  app.patch("/api/client/carrier-rules/:id", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const rule = await storage.getCarrierAssignmentRule(req.params.id);
      if (!rule || rule.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Rule not found" });
      }
      const data = insertCarrierAssignmentRuleSchema.omit({ clientAccountId: true }).partial().parse(req.body);
      const updated = await storage.updateCarrierAssignmentRule(req.params.id, data as any);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      logError("Failed to update carrier rule", error);
      res.status(500).json({ error: "Failed to update carrier rule" });
    }
  });

  app.delete("/api/client/carrier-rules/:id", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
    const rule = await storage.getCarrierAssignmentRule(req.params.id);
    if (!rule || rule.clientAccountId !== user.clientAccountId) {
      return res.status(404).json({ error: "Rule not found" });
    }
    await storage.deleteCarrierAssignmentRule(req.params.id);
    res.status(204).end();
  });

  // Rate-compare for an order: live local rates across eligible carriers, using the
  // order's stored weight (override with ?weightKg=).
  app.get("/api/client/orders/:id/rates", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });
      const order = await storage.getOrder(req.params.id);
      if (!order || order.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Order not found" });
      }
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) return res.status(404).json({ error: "Client account not found" });

      const weightKg = req.query.weightKg
        ? Number(req.query.weightKg)
        : order.packageWeightKg != null
          ? Number(order.packageWeightKg)
          : 0;
      if (!(weightKg > 0)) {
        return res.status(400).json({ error: "Order has no weight. Provide weightKg to price it." });
      }

      const toCity = (() => { try { return JSON.parse(order.shipTo || "{}").city || ""; } catch { return ""; } })();
      const fromCity = account.shippingCity || "";
      const localPricingRule = account.profile ? await storage.getPricingRuleByProfile(account.profile) : undefined;
      const rates: Array<Record<string, unknown>> = [];
      for (const carrierAdapter of carrierService.getLocalCarriers("SA")) {
        const liveBaseRateSar = await resolveLiveLocalBaseRate(carrierAdapter, fromCity, toCity, weightKg);
        const liveFallbackMarginPercent =
          liveBaseRateSar != null && liveBaseRateSar > 0
            ? localPricingRule
              ? await storage.getMarginForAmount(localPricingRule.id, liveBaseRateSar)
              : 20
            : null;
        const local = await resolveLocalRate({
          carrierCode: carrierAdapter.carrierCode,
          weightKg,
          clientProfile: account.profile,
          liveBaseRateSar,
          liveFallbackMarginPercent,
        });
        if (!local) continue;
        const snapshot = calculateShipmentAccounting({
          shipmentType: "domestic",
          isDdp: false,
          recipientCountryCode: "SA",
          baseRate: local.baseRate,
          marginAmount: local.marginAmount,
        });
        rates.push({
          carrierCode: carrierAdapter.carrierCode,
          carrierName: carrierAdapter.name,
          serviceName: `${carrierAdapter.name} Domestic`,
          weightKg,
          totalAmountSar: snapshot.clientTotalAmountSar,
          currency: "SAR",
        });
      }
      res.json({ weightKg, rates });
    } catch (error) {
      logError("Failed to price order", error);
      res.status(500).json({ error: "Failed to price order" });
    }
  });

  // Fulfill an order → create a LOCAL shipment (payment pending). Client then pays via
  // the shared /api/client/shipments/:id/pay[-later] endpoints, exactly like the direct
  // local create flow. The order is linked + moved to `assigned`.
  app.post("/api/client/orders/:id/fulfill", requireClient, requireSalesFeature, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clientAccountId) return res.status(404).json({ error: "Client account not found" });

      const order = await storage.getOrder(req.params.id);
      if (!order || order.clientAccountId !== user.clientAccountId) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.shipmentId) {
        return res.status(409).json({ error: "Order already fulfilled" });
      }
      if (order.status === "cancelled") {
        return res.status(400).json({ error: "Cannot fulfill a cancelled order" });
      }

      const { carrierCode, weightKg: weightOverride } = z.object({
        carrierCode: z.string().min(1),
        weightKg: z.number().positive().optional(),
      }).parse(req.body);

      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) return res.status(404).json({ error: "Client account not found" });

      const weightKg = weightOverride ?? (order.packageWeightKg != null ? Number(order.packageWeightKg) : 0);
      if (!(weightKg > 0)) {
        return res.status(400).json({ error: "Order has no weight. Provide weightKg to fulfill it." });
      }

      const local = await resolveLocalRate({
        carrierCode,
        weightKg,
        clientProfile: account.profile,
        liveBaseRateSar: null,
      });
      if (!local) {
        return res.status(400).json({ error: `No local pricing available for ${carrierCode} at ${weightKg}kg.` });
      }

      const carrierAdapter = carrierService
        .getLocalCarriers("SA")
        .find((c) => c.carrierCode === local.carrierCode);
      const carrierName = carrierAdapter?.name || carrierCode;

      const accountingSnapshot = calculateShipmentAccounting({
        shipmentType: "domestic",
        isDdp: false,
        recipientCountryCode: "SA",
        baseRate: local.baseRate,
        marginAmount: local.marginAmount,
      });

      const shipTo = order.shipTo ? JSON.parse(order.shipTo) : {};
      const customer = order.customer ? JSON.parse(order.customer) : {};

      const shipment = await storage.createShipment({
        clientAccountId: user.clientAccountId,
        // Sender = the client's own pickup/return address on file.
        senderName: account.shippingContactName || account.name,
        senderAddress: account.shippingAddressLine1 || "Pickup coordination required",
        senderCity: account.shippingCity || "Riyadh",
        senderStateOrProvince: account.shippingStateOrProvince || null,
        senderCountry: "SA",
        senderPhone: account.shippingContactPhone || account.phone || "",
        senderShortAddress: account.shippingShortAddress || null,
        // Recipient = the store order's ship-to (already KSA-normalized at ingest).
        recipientName: customer.name || "Customer",
        recipientAddress: shipTo.address || "",
        recipientCity: shipTo.city || "",
        recipientCountry: "SA",
        recipientPhone: customer.phone || "",
        recipientEmail: customer.email || null,
        recipientShortAddress: shipTo.postal || null,
        weight: weightKg.toString(),
        weightUnit: "KG",
        packageType: "PARCEL",
        numberOfPackages: order.packagePieces || 1,
        shipmentType: "domestic",
        fulfillmentType: "local",
        serviceType: "LOCAL",
        currency: "SAR",
        status: "payment_pending",
        baseRate: local.baseRate.toString(),
        marginAmount: local.marginAmount.toString(),
        margin: local.marginAmount.toString(),
        finalPrice: accountingSnapshot.clientTotalAmountSar.toString(),
        ...getShipmentAccountingInsert(accountingSnapshot),
        carrierCode: local.carrierCode,
        carrierName,
        carrierServiceType: "LOCAL",
        paymentStatus: "pending",
        orderId: order.id,
      });

      const updatedOrder = await storage.updateOrder(order.id, {
        shipmentId: shipment.id,
        assignedCarrierCode: local.carrierCode,
        status: "assigned",
      });

      await logAudit(req.session.userId, "fulfill_order", "order", order.id,
        `Fulfilled order ${order.externalOrderNumber || order.externalOrderId} as local shipment ${shipment.trackingNumber}`, req.ip);

      res.status(201).json({
        order: updatedOrder,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        amount: accountingSnapshot.clientTotalAmountSar,
        currency: "SAR",
        carrierCode: local.carrierCode,
        carrierName,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to fulfill order", error);
      res.status(500).json({ error: "Failed to fulfill order" });
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
        pickup: pickupInputSchema.optional(),
      });

      const { quoteId, items, tradeDocuments, pickup } = checkoutSchema.parse(req.body);

      // Verify quote exists and is valid
      const quote = await storage.getShipmentRateQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found or expired" });
      }

      // Verify quote belongs to this client
      if (quote.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (quote.carrierCode === "DDP") {
        return res.status(400).json({ error: "Use the dedicated Door To Door Freight checkout flow for this quote." });
      }
      if (quote.serviceType === "LOCAL") {
        return res.status(400).json({ error: "Use the dedicated local shipment checkout for this quote." });
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
      if (shipmentData.isDdp) {
        return res.status(400).json({
          error: "Use the dedicated Door To Door Freight checkout flow for door-to-door shipments.",
        });
      }
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const pricingRule = await storage.getPricingRuleByProfile(account.profile || "regular");
      const defaultMarginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;
      const baseRate = Number(quote.baseRate);

      // Re-derive the margin server-side (never trust the quoted amount) using the
      // profile margin tiers. (Local shipments use their own /local/checkout.)
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
          recalculatedMargin,
          recalculatedFinalPrice,
          storedFinalPrice,
          quoteMarginPercentage: quote.marginPercentage,
          diff: Math.abs(recalculatedFinalPrice - storedFinalPrice),
        });
        return res.status(400).json({ error: "Price mismatch detected" });
      }

      const hsPreparedItems = await enrichItemsWithHsCodes(shipmentData.items || [], {
        clientAccountId: user.clientAccountId,
        destinationCountry:
          shipmentData.shipmentType === "inbound"
            ? shipmentData.recipient.countryCode
            : shipmentData.recipient.countryCode || shipmentData.shipper.countryCode || "SA",
      });
      const normalizedShipmentItems = hsPreparedItems.items;

      if (
        quote.carrierCode === "DHL" &&
        shipmentData.shipmentType !== "domestic" &&
        normalizedShipmentItems.some((item) => !item.hsCode?.trim())
      ) {
        return res.status(400).json({
          error: "DHL requires an HS code for every shipment item. Please review the item classification and try again.",
        });
      }

      const chargeableWeightDetails =
        parseStoredChargeableWeightSummary(quote.chargeableWeightDetails) ||
        parseStoredChargeableWeightSummary(shipmentData.chargeableWeightDetails) ||
        buildChargeableWeightSummaryFromShipmentInput(shipmentData, quote.carrierCode);
      const packagesWithChargeableWeight = attachChargeableWeightToPackages(
        shipmentData.packages,
        chargeableWeightDetails,
      );
      const totalShipmentWeight = shipmentData.packages.reduce((sum: number, p: { weight: number }) => sum + p.weight, 0);

      // Last chance to reject an address the carrier cannot book, while the client can still fix
      // it. After this point they are charged, and a rejected address means carrier_error on a
      // paid shipment.
      await assertPostalCodesAreServiceable({
        carrierCode: quote.carrierCode,
        shipper: {
          countryCode: shipmentData.shipper.countryCode,
          postalCode: shipmentData.shipper.postalCode,
          stateOrProvince: shipmentData.shipper.stateOrProvince,
        },
        recipient: {
          countryCode: shipmentData.recipient.countryCode,
          postalCode: shipmentData.recipient.postalCode,
          stateOrProvince: shipmentData.recipient.stateOrProvince,
        },
        clientAccountId: user.clientAccountId,
      });

      // Create draft shipment with payment pending status
      const shipment = await storage.createShipment({
        clientAccountId: user.clientAccountId,
        senderName: shipmentData.shipper.name,
        senderCompany: shipmentData.shipper.company || null,
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
        recipientCompany: shipmentData.recipient.company || null,
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
        dimensionalWeight: formatWeightValue(chargeableWeightDetails.dimensionalWeight),
        chargeableWeight: formatWeightValue(chargeableWeightDetails.chargeableWeight),
        chargeableWeightUnit: chargeableWeightDetails.weightUnit,
        chargeableWeightDetails: JSON.stringify(chargeableWeightDetails),
        length: shipmentData.packages[0].length.toString(),
        width: shipmentData.packages[0].width.toString(),
        height: shipmentData.packages[0].height.toString(),
        dimensionUnit: shipmentData.dimensionUnit,
        packageType: shipmentData.effectivePackagingType || shipmentData.packageType,
        numberOfPackages: shipmentData.packages.length,
        packagesData: JSON.stringify(packagesWithChargeableWeight),
        itemsData: normalizedShipmentItems.length > 0 ? JSON.stringify(normalizedShipmentItems) : undefined,
        tradeDocumentsData: shipmentData.tradeDocuments?.length
          ? JSON.stringify(shipmentData.tradeDocuments)
          : undefined,
        shipmentType: shipmentData.shipmentType,
        serviceType: quote.serviceType,
        currency: quote.currency,
        status: "payment_pending",
        ...expressPickupInsertFields(pickup),
        baseRate: quote.baseRate,
        marginAmount: quote.marginAmount,
        margin: quote.marginAmount,
        finalPrice: quote.finalPrice,
        ...getShipmentAccountingInsert(accountingSnapshot),
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        carrierIntegrationAccountId: quote.carrierIntegrationAccountId,
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
        actualWeight: chargeableWeightDetails.actualWeight,
        dimensionalWeight: chargeableWeightDetails.dimensionalWeight,
        chargeableWeight: chargeableWeightDetails.chargeableWeight,
        chargeableWeightUnit: chargeableWeightDetails.weightUnit,
        chargeableActualPackageCount: chargeableWeightDetails.packages.filter((pkg) => !pkg.usesDimensionalWeight).length,
        chargeableDimensionalPackageCount: chargeableWeightDetails.packages.filter((pkg) => pkg.usesDimensionalWeight).length,
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
      // The client can fix an unserviceable postal code — tell them, don't report a server fault.
      if (error instanceof PostalCodeNotServiceableError) {
        return res.status(400).json({ error: error.message });
      }
      logError("Failed to create checkout", error);
      res.status(500).json({ error: "Failed to create checkout" });
    }
  });

  const shipmentPaymentSchema = z.object({
    shipmentId: z.string().uuid("Invalid shipment ID"),
    tapTokenId: z.string().min(1).optional(),
    saveCardForFuture: z.boolean().optional(),
    returnPath: z.string().startsWith("/client/").max(200).optional(),
  });

  app.get("/api/client/shipments/:id/checkout-summary", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
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

      const activeOffer = await getActiveAbandonedRecoveryOffer(shipment);
      const amount = activeOffer?.payableAmount ?? parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice);
      const source = typeof req.query.source === "string" ? req.query.source : undefined;

      if (activeOffer && source === "resume_link") {
        logInfo("Abandoned recovery offer resumed", {
          source: "abandoned_recovery",
          event: "offer_resumed",
          shipmentId: shipment.id,
          recoveryId: activeOffer.recovery.id,
          clientAccountId: shipment.clientAccountId,
          trackingNumber: shipment.trackingNumber,
          ipAddress: req.ip,
        });
      }

      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        amount,
        originalAmount: activeOffer?.originalAmount ?? amount,
        currency: shipment.currency || "SAR",
        paymentStatus: shipment.paymentStatus || "pending",
        activeOffer: serializeAbandonedRecoveryOffer(activeOffer),
        canPay:
          shipment.paymentStatus !== "paid" &&
          String(shipment.paymentMethod || "PAY_NOW").toUpperCase() !== "CREDIT" &&
          ["payment_pending", "carrier_error"].includes(String(shipment.status || "").toLowerCase()),
      });
    } catch (error) {
      logError("Failed to load shipment checkout summary", error);
      res.status(500).json({ error: "Failed to load shipment checkout summary" });
    }
  });

  app.post("/api/client/shipments/pay", requireClient, requireClientPermission(ClientPermission.CREATE_SHIPMENTS), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const { shipmentId, tapTokenId, saveCardForFuture, returnPath } = shipmentPaymentSchema.parse(req.body);
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

      if (shipment.isQuote && shipment.isDdp && !shipment.ddpTermsAcceptedAt) {
        return res.status(400).json({ error: "Please accept the customs, terms and broker-authorization declaration before paying." });
      }

      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const activeOffer = await getActiveAbandonedRecoveryOffer(shipment);
      // payableAmount is always SAR (accounting source of truth). If the client account is
      // billed in a non-SAR currency, snapshot a fresh FX rate and charge the converted amount.
      const payableAmountSar = activeOffer?.payableAmount ?? parseMoneyValue(shipment.clientTotalAmountSar ?? shipment.finalPrice);
      const chargeCurrency = normalizeCurrency(account.preferredCurrency);
      const fxRate = chargeCurrency === "SAR" ? 1 : await getSarRate(chargeCurrency);
      const payableAmount = convertFromSar(payableAmountSar, chargeCurrency, fxRate);

      const appBaseUrl = buildAppBaseUrl(req);
      let tapIntegrationAccountId = shipment.tapIntegrationAccountId;
      const chargeResult = await withBoundIntegrationAccount("tap", tapIntegrationAccountId, getClientIntegrationRoutingOptions(account, shipment.senderCountry), () => {
        tapIntegrationAccountId = getCurrentIntegrationAccountId() || tapIntegrationAccountId || "env:tap";
        return tapService.createCharge({
        amount: payableAmount,
        currency: chargeCurrency,
        description: `Shipment ${shipment.trackingNumber}`,
        redirectUrl: `${appBaseUrl}/api/payments/tap/redirect`,
        postUrl: `${appBaseUrl}/api/webhooks/tap`,
        customer: buildTapCustomer(account, tapIntegrationAccountId),
        reference: {
          transaction: shipment.trackingNumber,
          order: shipment.id,
        },
        metadata: {
          kind: "shipment",
          shipmentId: shipment.id,
          clientAccountId: user.clientAccountId!,
          trackingNumber: shipment.trackingNumber,
          tapIntegrationAccountId,
          ...(activeOffer
            ? {
                abandonedRecoveryId: activeOffer.recovery.id,
                abandonedDiscountAmount: activeOffer.discountAmount.toFixed(2),
                abandonedOriginalAmount: activeOffer.originalAmount.toFixed(2),
              }
            : {}),
          payableAmount: payableAmount.toFixed(2),
          payableAmountSar: payableAmountSar.toFixed(2),
          chargeCurrency,
          fxRate: fxRate.toString(),
          ...(returnPath ? { returnPath } : {}),
        },
        sourceId: tapTokenId || DEFAULT_TAP_SOURCE_ID,
        saveCard: Boolean(saveCardForFuture && tapService.isSavedCardsEnabled()),
        });
      });

      await storage.updateShipment(shipment.id, {
        paymentIntentId: chargeResult.chargeId,
        tapIntegrationAccountId,
        currency: chargeCurrency,
        fxRate: fxRate.toString(),
      });

      if (tapService.isSuccessfulStatus(chargeResult.status)) {
        await processTapChargeUpdate(chargeResult.charge, req.ip);
      }

      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        paymentId: chargeResult.chargeId,
        transactionUrl: chargeResult.transactionUrl,
        amount: payableAmount,
        currency: chargeCurrency,
        amountSar: payableAmountSar,
        fxRate,
        paymentStatus: chargeResult.status,
        activeOffer: serializeAbandonedRecoveryOffer(activeOffer),
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
        verifiedTapCharge = await withBoundIntegrationAccount(
          "tap",
          shipment.tapIntegrationAccountId,
          getShipmentIntegrationRoutingOptions(shipment),
          () => tapService.retrieveCharge(effectivePaymentId),
        );
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

      // Keep the legacy creation endpoint aligned with the managed Zoho
      // routing used by the checkout flow.
      await syncInvoiceToZoho(invoice, shipment);

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

      if (shipment.status === "cancelled") {
        return res.status(400).json({ error: "Shipment already cancelled" });
      }

      if (!canShipmentBeCancelled(shipment)) {
        return res.status(400).json({ error: "Shipments can only be cancelled before the carrier marks them as picked up" });
      }

      if (shipment.carrierTrackingNumber) {
        try {
          const carrierAdapter = getAdapterForShipment(shipment);
          const cancelledWithCarrier = await withBoundIntegrationAccount(
            getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
            shipment.carrierIntegrationAccountId,
            getShipmentIntegrationRoutingOptions(shipment),
            () => carrierAdapter.cancelShipment(
              shipment.carrierTrackingNumber!,
              shipment.senderCountry,
            ),
          );

          if (!cancelledWithCarrier) {
            throw new CarrierError(
              "CANCEL_FAILED",
              "Carrier cancellation could not be confirmed",
            );
          }
        } catch (cancelError) {
          const isCarrierErr = cancelError instanceof CarrierError;
          const errCode = isCarrierErr ? (cancelError as CarrierError).code : "CANCEL_FAILED";
          const carrierDetail = isCarrierErr
            ? (cancelError as CarrierError).carrierMessage
            : (cancelError as Error)?.message || "Carrier cancellation failed";

          logError("Client carrier cancel failed", cancelError);
          await storage.updateShipment(id, {
            carrierErrorCode: errCode,
            carrierErrorMessage: `Cancel failed: ${carrierDetail}`,
            carrierLastAttemptAt: new Date(),
          });

          return res.status(502).json({
            error: CARRIER_CANCELLATION_FAILED_MESSAGE,
            carrierErrorCode: errCode,
            carrierErrorMessage: CARRIER_CANCELLATION_FAILED_MESSAGE,
            carrierErrorDetail: carrierDetail,
          });
        }
      }

      // Release the auto-booked courier pickup so no driver arrives for the cancelled shipment.
      if (shipment.carrierTrackingNumber && shipment.pickupConfirmationNumber) {
        const pickupAdapter = getAdapterForShipment(shipment);
        await cancelCarrierPickupIfBooked(
          shipment,
          pickupAdapter,
          getIntegrationAppKeyForCarrier(pickupAdapter.carrierCode),
        );
      }

      const updated = await storage.updateShipment(id, {
        status: "cancelled",
        carrierStatus: "cancelled",
      });

      // Intentionally do NOT touch Zoho on cancellation (no credit note, no delete).
      // Accounting handles the synced invoice manually.

      const refundRequest = updated
        ? await ensureShipmentRefundRequestForCancellation({
            shipment: updated,
            user,
            autoRefund: isShipmentStillBooked(updated),
          })
        : null;

      await logAudit(req.session.userId, "cancel_shipment", "shipment", id,
        `Client cancelled shipment ${shipment.trackingNumber}`, req.ip);
      
      res.json({
        shipment: updated,
        refundRequest,
      });
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

  app.get("/api/client/shipments/:id/commercial-invoice.pdf", requireClient, async (req, res) => {
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
      if (!hasCommercialInvoiceData(shipment)) {
        return res.status(400).json({ error: "Commercial invoice data is not available for this shipment" });
      }

      const pdfBuffer = renderCommercialInvoicePdfBuffer(shipment);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${shipment.trackingNumber.toLowerCase()}-commercial-invoice.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      logError("Failed to download client commercial invoice", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/client/shipments/:id/commercial-invoice.html", requireClient, async (req, res) => {
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
      if (!hasCommercialInvoiceData(shipment)) {
        return res.status(400).json({ error: "Commercial invoice data is not available for this shipment" });
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderCommercialInvoiceHtml(shipment));
    } catch (error) {
      logError("Failed to render client commercial invoice HTML", error);
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

  // Sales Channels feature access (Orders / Sales Channels / Assignment Rules bundle)
  app.get("/api/client/sales-features", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const clientAccount = await storage.getClientAccount(user.clientAccountId);
      const request = await storage.getSalesFeatureAccessRequestByClient(user.clientAccountId);
      res.json({
        enabled: clientAccount?.salesFeaturesEnabled || false,
        request: request || null,
      });
    } catch (error: any) {
      logError("Error fetching sales feature status", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/client/sales-features/request", requireClient, requirePrimaryContact, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }
      const account = await storage.getClientAccount(user.clientAccountId);
      if (account?.salesFeaturesEnabled) {
        return res.status(400).json({ error: "Sales Channels is already enabled for your account." });
      }
      const existing = await storage.getSalesFeatureAccessRequestByClient(user.clientAccountId);
      if (existing && existing.status === "pending") {
        return res.status(400).json({ error: "You already have a pending request." });
      }

      const { reason } = req.body;
      const request = await storage.createSalesFeatureAccessRequest({
        clientAccountId: user.clientAccountId,
        requestedByUserId: user.id,
        status: "pending",
        reason: reason || null,
      });

      logAuditToFile({
        userId: user.id,
        action: "request_sales_feature",
        resource: "sales_feature_access_request",
        resourceId: request.id,
        details: `Client ${user.username} requested Sales Channels access`,
        ipAddress: req.ip || "unknown",
      });

      res.json({ success: true, request });
    } catch (error: any) {
      logError("Error creating sales feature request", { error: error.message });
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

      if (shipment.isQuote && shipment.isDdp && !shipment.ddpTermsAcceptedAt) {
        return res.status(400).json({ error: "Please accept the customs, terms and broker-authorization declaration before paying." });
      }

      const existingCredit = await storage.getCreditInvoiceByShipmentId(shipmentId);
      if (existingCredit) {
        return res.status(400).json({ error: "A credit invoice already exists for this shipment" });
      }

      // Enforce the client's available credit (limit − outstanding unpaid credit invoices).
      const creditSummary = await storage.getClientCreditSummary(user.clientAccountId);
      const creditAmount = Number(shipment.finalPrice || 0);
      if (creditAmount > creditSummary.available) {
        return res.status(403).json({
          error: `Credit limit exceeded. Available credit is SAR ${creditSummary.available.toFixed(2)} but this shipment costs SAR ${creditAmount.toFixed(2)}.`,
        });
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

      // Record the debit on the credit ledger.
      await storage.createCreditTransaction({
        clientAccountId: user.clientAccountId,
        shipmentId: shipment.id,
        creditInvoiceId: creditInvoice.id,
        type: "DEBIT",
        amountSar: creditAmount.toFixed(2),
        balanceAfterSar: (creditSummary.available - creditAmount).toFixed(2),
        reason: "Credit shipment created",
        createdByUserId: user.id,
      });

      const isDdpCredit = shipment.fulfillmentType === "ddp_manual";
      // Local shipments are operations-fulfilled (like DDP): credit covers them so ops
      // can proceed immediately, and there is no carrier auto-booking.
      const isManualFulfillment = isDdpCredit || shipment.fulfillmentType === "local";
      await storage.updateShipment(shipmentId, {
        paymentMethod: "CREDIT",
        // DDP/local credit is covered by the client's credit balance, so the shipment is
        // treated as paid for the operations workflow; the creditInvoice stays UNPAID
        // as the receivable the client settles later. Other flows keep the prior behavior.
        paymentStatus: isManualFulfillment ? "paid" : "unpaid",
        status: isDdpCredit ? "awaiting_review" : shipment.fulfillmentType === "local" ? "created" : "credit_pending",
      });

      if (shipment.fulfillmentType !== "ddp_manual") {
        const payLaterAddrValidation = validateShippingAddresses(
          { countryCode: shipment.senderCountry, city: shipment.senderCity, addressLine1: shipment.senderAddress, postalCode: shipment.senderPostalCode || "", phone: shipment.senderPhone, stateOrProvince: shipment.senderStateOrProvince || "" },
          { countryCode: shipment.recipientCountry, city: shipment.recipientCity, addressLine1: shipment.recipientAddress, postalCode: shipment.recipientPostalCode || "", phone: shipment.recipientPhone, stateOrProvince: shipment.recipientStateOrProvince || "" }
        );
        if (!payLaterAddrValidation.valid) {
          return res.status(400).json({ error: "Address validation failed", details: payLaterAddrValidation.errors });
        }
      }

      let carrierTrackingNumber = "";
      let labelUrl = "";
      let estimatedDelivery: Date | undefined;

      try {
        if (shipment.fulfillmentType === "ddp_manual") {
          await storage.updateShipment(shipmentId, {
            status: "awaiting_review",
            carrierStatus: "awaiting_review",
          });
        } else if (shipment.fulfillmentType === "local") {
          // Operations-fulfilled: no carrier API booking.
          await storage.updateShipment(shipmentId, {
            status: "created",
            carrierStatus: "processing",
          });
        } else {
        const carrierAdapter = getAdapterForShipment(shipment);
        const preparedShipment = await buildCarrierShipmentRequestFromShipment(shipment, carrierAdapter);
        if (preparedShipment.tradeDocumentsData !== shipment.tradeDocumentsData) {
          await storage.updateShipment(shipmentId, {
            tradeDocumentsData: preparedShipment.tradeDocumentsData,
          });
        }
        const carrierResponse = await withBoundIntegrationAccount(
          getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
          shipment.carrierIntegrationAccountId,
          getShipmentIntegrationRoutingOptions(shipment),
          () => carrierAdapter.createShipment(preparedShipment.carrierRequest),
        );
        carrierTrackingNumber = carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber;
        labelUrl = carrierResponse.labelUrl || "";
        estimatedDelivery = carrierResponse.estimatedDelivery;

        const bookedShipment = await storage.updateShipment(shipmentId, {
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
        // Book the courier pickup (if requested) for credit / pay-later shipments too.
        await bookCarrierPickupIfRequested(
          bookedShipment || shipment,
          carrierAdapter,
          getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
        );
        }
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
          clientAccountId: user.clientAccountId!,
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

      const operationsShipment = await storage.getShipment(shipmentId);
      if (operationsShipment) {
        await ensureOperationAssignmentForShipment({
          shipment: operationsShipment,
          actorUserId: req.session.userId,
          reason: "credit_confirmed",
        });
        if (operationsShipment.status !== shipment.status) {
          await recordShipmentStatusChange({
            shipment: operationsShipment,
            previousStatus: shipment.status,
            nextStatus: operationsShipment.status,
            actorUserId: req.session.userId,
            source: "credit_confirmation",
          });
        }
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
            carrierCode: shipment.carrierCode,
            carrierName: shipment.carrierName,
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
          ? getInvoiceTypeLabel(invoice.invoiceType, shipment)
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

      const shipmentId = typeof req.query.shipmentId === "string" ? req.query.shipmentId : undefined;
      const invoiceId = typeof req.query.invoiceId === "string" ? req.query.invoiceId : undefined;
      const shipment = shipmentId ? await storage.getShipment(shipmentId) : undefined;
      const invoice = invoiceId ? await storage.getInvoice(invoiceId) : undefined;
      if (shipment && shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (invoice && invoice.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const boundTapIntegrationAccountId =
        shipment?.tapIntegrationAccountId ||
        invoice?.tapIntegrationAccountId ||
        (!shipmentId && !invoiceId ? account.tapIntegrationAccountId : undefined);
      res.json(await withBoundIntegrationAccount("tap", boundTapIntegrationAccountId, getClientIntegrationRoutingOptions(account, shipment?.senderCountry), async () => {
        const tapIntegrationAccountId =
          getCurrentIntegrationAccountId() || boundTapIntegrationAccountId || "env:tap";
        return {
          ...buildTapEmbedConfig(account, tapIntegrationAccountId),
          tapIntegrationAccountId,
        };
      }));
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

      const cards = await storage.getTapSavedCardsByClientAccount(
        user.clientAccountId,
        card.tapIntegrationAccountId,
      );
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
          await withBoundIntegrationAccount(
            "tap",
            card.tapIntegrationAccountId,
            {},
            () => tapService.deleteSavedCard(card.tapCustomerId!, card.tapCardId!),
          );
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

      const remainingCards = await storage.getTapSavedCardsByClientAccount(
        user.clientAccountId,
        card.tapIntegrationAccountId,
      );
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
      let tapIntegrationAccountId = invoice.tapIntegrationAccountId;
      const chargeResult = await withBoundIntegrationAccount("tap", tapIntegrationAccountId, getClientIntegrationRoutingOptions(account), () => {
        tapIntegrationAccountId = getCurrentIntegrationAccountId() || tapIntegrationAccountId || "env:tap";
        return tapService.createCharge({
        amount: Number(invoice.amount),
        currency: "SAR",
        description: `Invoice ${invoice.invoiceNumber}`,
        redirectUrl: `${buildAppBaseUrl(req)}/api/payments/tap/redirect`,
        postUrl: `${buildAppBaseUrl(req)}/api/webhooks/tap`,
        customer: buildTapCustomer(account, tapIntegrationAccountId),
        reference: {
          transaction: invoice.invoiceNumber,
          order: invoice.id,
        },
        metadata: {
          kind: "invoice",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientAccountId: user.clientAccountId!,
          tapIntegrationAccountId,
        },
        sourceId: tapTokenId || DEFAULT_TAP_SOURCE_ID,
        saveCard: Boolean(saveCardForFuture && tapService.isSavedCardsEnabled()),
        });
      });

      if (invoice.tapIntegrationAccountId !== tapIntegrationAccountId) {
        await storage.updateInvoice(invoice.id, { tapIntegrationAccountId });
      }

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
        integrationAccountId: tapIntegrationAccountId,
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
    let shipmentForError: Awaited<ReturnType<typeof storage.getShipment>> | null = null;
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const shipment = await storage.getShipment(req.params.id);
      shipmentForError = shipment;
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied to this shipment" });
      }

      // Get tracking from carrier
      if (shipment.fulfillmentType === "ddp_manual") {
        const manualTrackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
        return res.json({
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          carrierTrackingNumber: shipment.carrierTrackingNumber,
          status: shipment.status,
          carrier: "Door To Door Freight",
          estimatedDelivery: shipment.estimatedDelivery,
          actualDelivery: shipment.actualDelivery,
          tracking: {
            trackingNumber: manualTrackingNumber,
            status: shipment.status,
            events: [{
              status: shipment.status,
              description: shipment.carrierTrackingNumber
                ? "Door To Door Freight shipment status is managed by ezhalha using the saved manual tracking number."
                : "Door To Door Freight shipment status is managed by ezhalha.",
              timestamp: shipment.updatedAt,
            }],
          },
        });
      }

      const trackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
      const carrierAdapter = getAdapterForShipment(shipment);
      const tracking = await withBoundIntegrationAccount(
        getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
        shipment.carrierIntegrationAccountId,
        getShipmentIntegrationRoutingOptions(shipment),
        () => carrierAdapter.trackShipment(trackingNumber),
      );

      // Persist the carrier's live status so the client's shipment list/drawer reflect it too.
      const syncedShipment = await applyCarrierTrackingToShipment(shipment, tracking, "client_track");

      res.json({
        shipmentId: syncedShipment.id,
        trackingNumber: syncedShipment.trackingNumber,
        carrierTrackingNumber: syncedShipment.carrierTrackingNumber,
        status: syncedShipment.status,
        carrier: syncedShipment.carrierName || syncedShipment.carrierCode || "FedEx",
        estimatedDelivery: syncedShipment.estimatedDelivery,
        actualDelivery: syncedShipment.actualDelivery,
        tracking,
      });
    } catch (error) {
      logError("Failed to get shipment tracking", error);
      if (error instanceof CarrierError && shipmentForError) {
        await storage.updateShipment(shipmentForError.id, {
          carrierErrorCode: error.code,
          carrierErrorMessage: `Tracking failed: ${error.carrierMessage}`,
          carrierLastAttemptAt: new Date(),
        });

        return res.status(502).json({
          error: "Failed to get tracking information from carrier",
          carrierErrorCode: error.code,
          carrierErrorMessage: error.carrierMessage,
        });
      }
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

      const result = await withShipmentIntegrationAccount(
        "fedex",
        {
          shipperCountryCode: params.countryOfOrigin,
          recipientCountryCode: params.destinationCountry,
        },
        () => lookupHsCode(params, clientAccountId),
      );

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

      const rates = await withShipmentIntegrationAccount(
        "fedex",
        {
          shipperCountryCode: data.senderCountry,
          recipientCountryCode: data.recipientCountry,
        },
        () => fedexAdapter.getRates({
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
        }),
      );

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
      const result = await withShipmentIntegrationAccount(
        "fedex",
        { recipientCountryCode: address.countryCode },
        () => fedexAdapter.validateAddress({ address }),
      );
      
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
      const result = await withShipmentIntegrationAccount(
        "fedex",
        { recipientCountryCode: data.countryCode },
        () => fedexAdapter.validatePostalCode(data),
      );
      
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
      const result = await withShipmentIntegrationAccount(
        "fedex",
        {
          shipperCountryCode: data.origin.countryCode,
          recipientCountryCode: data.destination.countryCode,
        },
        () => fedexAdapter.checkServiceAvailability(data),
      );
      
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
      const rates = await withShipmentIntegrationAccount(
        "fedex",
        {
          shipperCountryCode: data.shipper.countryCode,
          recipientCountryCode: data.recipient.countryCode,
        },
        () => fedexAdapter.getRates(data),
      );
      
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
    let shipmentForError: Awaited<ReturnType<typeof storage.getShipment>> | null = null;
    try {
      const shipment = await storage.getShipment(req.params.id);
      shipmentForError = shipment;
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const trackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
      const carrierAdapter = getAdapterForShipment(shipment);
      const tracking = await withShipmentIntegrationAccount(
        getIntegrationAppKeyForCarrier(carrierAdapter.carrierCode),
        {
          shipperCountryCode: shipment.senderCountry,
          recipientCountryCode: shipment.recipientCountry,
        },
        () => carrierAdapter.trackShipment(trackingNumber),
      );

      // Persist the carrier's live status onto the shipment so the whole system (ops hub, client
      // portal, lists) reflects it — not just this timeline. A manual sync must move the status.
      const syncedShipment = await applyCarrierTrackingToShipment(shipment, tracking, "manual_track");

      await logAudit(req.session.userId!, "track_shipment", "shipment", shipment.id,
        `Tracked shipment: ${trackingNumber} (status: ${syncedShipment.status})`, req.ip);

      res.json({ ...tracking, shipment: syncedShipment });
    } catch (error) {
      logError("Failed to track shipment", error);
      if (error instanceof CarrierError && shipmentForError) {
        await storage.updateShipment(shipmentForError.id, {
          carrierErrorCode: error.code,
          carrierErrorMessage: `Tracking failed: ${error.carrierMessage}`,
          carrierLastAttemptAt: new Date(),
        });

        return res.status(502).json({
          error: "Failed to track shipment with carrier",
          carrierErrorCode: error.code,
          carrierErrorMessage: error.carrierMessage,
        });
      }
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
        const saResult = await withShipmentIntegrationAccount(
          "fedex",
          {
            shipperCountryCode: shipperCC,
            recipientCountryCode: recipientCC,
          },
          () => fedexAdapter.checkServiceAvailability({
            origin: {
              postalCode: params.shipperPostal || "",
              countryCode: shipperCC,
            },
            destination: {
              postalCode: params.recipientPostal || "",
              countryCode: recipientCC,
            },
            shipDate: params.shipDate,
          }),
        );

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
          const rateResult = await withShipmentIntegrationAccount(
            "fedex",
            {
              shipperCountryCode: shipperCC,
              recipientCountryCode: recipientCC,
            },
            () => fedexAdapter.getRates({
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
            }),
          );

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

      const result = await withShipmentIntegrationAccount(
        "fedex",
        { recipientCountryCode: cc },
        () => fedexAdapter.validateAddress({ address }),
      );

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

      const result = await withShipmentIntegrationAccount(
        "fedex",
        { recipientCountryCode: params.country },
        () => fedexAdapter.validatePostalCode({
          postalCode: params.postal,
          countryCode: params.country,
        }),
      );

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

  // Sales-channel order ingest (P2). Platform posts here on order create/update.
  // The delivery URL carries the channel id: /api/webhooks/sales-channel/:platform?channel=<id>
  // Signature is verified against the channel's stored secret — fail-closed in prod.
  app.post("/api/webhooks/sales-channel/:platform", async (req, res) => {
    const platform = String(req.params.platform || "").toLowerCase();
    const rawBody: Buffer | undefined = (req as any).rawBody;
    const payloadText = rawBody ? rawBody.toString() : JSON.stringify(req.body);
    const isProd = process.env.NODE_ENV === "production";

    try {
      const adapter = getSalesChannelAdapter(platform);
      if (!adapter) {
        return res.status(404).json({ error: `Unsupported platform: ${platform}` });
      }

      const channelId = typeof req.query.channel === "string" ? req.query.channel : undefined;
      const channel = channelId ? await storage.getSalesChannel(channelId) : undefined;
      if (!channel || channel.platform !== platform) {
        await storage.createWebhookEvent({
          source: `sales-channel:${platform}`,
          eventType: "channel_not_found",
          payload: payloadText,
          signature: null,
          processed: false,
          retryCount: 0,
          errorMessage: `No channel for id ${channelId}`,
        });
        return res.status(404).json({ error: "Sales channel not found" });
      }

      const signature = getSignatureHeader(platform, req.headers as Record<string, any>);
      const signatureValid = channel.webhookSecret
        ? adapter.verifySignature(rawBody ?? payloadText, signature, channel.webhookSecret)
        : false;

      // Fail-closed in production; in non-prod a missing secret is tolerated to ease
      // local testing, but a present secret is always enforced.
      if (!signatureValid && (isProd || channel.webhookSecret)) {
        await storage.createWebhookEvent({
          source: `sales-channel:${platform}`,
          eventType: "signature_validation_failed",
          payload: payloadText,
          signature: signature || null,
          processed: false,
          retryCount: 0,
          errorMessage: "Invalid webhook signature",
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const normalized = adapter.normalizeOrder(req.body, {
        clientAccountId: channel.clientAccountId,
        salesChannelId: channel.id,
      });
      const order = await storage.upsertOrder(normalized);
      await storage.updateSalesChannel(channel.id, { lastSyncedAt: new Date(), status: "connected" });

      await storage.createWebhookEvent({
        source: `sales-channel:${platform}`,
        eventType: "order_ingested",
        payload: payloadText,
        signature: signature || null,
        processed: true,
        retryCount: 0,
        errorMessage: null,
      });

      res.status(200).json({ ok: true, orderId: order.id, status: order.status });
    } catch (error) {
      logError(`Failed to ingest ${platform} order`, error);
      await storage.createWebhookEvent({
        source: `sales-channel:${platform}`,
        eventType: "ingest_error",
        payload: payloadText,
        signature: null,
        processed: false,
        retryCount: 0,
        errorMessage: error instanceof Error ? error.message : "ingest error",
      });
      res.status(500).json({ error: "Failed to ingest order" });
    }
  });

  // FedEx Webhook Handler
  app.post("/api/webhooks/fedex", async (req, res) => {
    try {
      const rawBody = (req as any).rawBody;
      const payload = rawBody ? rawBody.toString() : JSON.stringify(req.body);
      const signature = req.headers["x-fedex-signature"] as string | undefined;
      const event = req.body;
      const shipments = await storage.getShipments();
      const webhookShipment = shipments.find((shipment) =>
        shipment.trackingNumber === event.trackingNumber ||
        shipment.carrierTrackingNumber === event.trackingNumber
      );

      if (!(await validateFedExWebhookForBoundAccount(payload, signature, webhookShipment))) {
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
        const shipment = webhookShipment || shipments.find(s =>
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
          const normalizedCarrierStatus = String(event.status).toLowerCase();
          
          if (newStatus !== shipment.status) {
            updates.status = newStatus;
          }

          if (normalizedCarrierStatus && normalizedCarrierStatus !== shipment.carrierStatus) {
            updates.carrierStatus = normalizedCarrierStatus;
          }
          
          if (newStatus === "delivered" && !shipment.actualDelivery) {
            updates.actualDelivery = event.deliveryDate ? new Date(event.deliveryDate) : new Date();
          }
          
          if (Object.keys(updates).length > 0) {
            const updatedShipment = await storage.updateShipment(shipment.id, updates);
            await logAudit(undefined, "webhook_status_update", "shipment", shipment.id,
              `FedEx webhook updated: ${JSON.stringify(updates)}`, req.ip);
            if (updatedShipment && updates.status) {
              await recordShipmentStatusChange({
                shipment: updatedShipment,
                previousStatus: shipment.status,
                nextStatus: updates.status,
                source: "fedex_webhook",
              });
            }
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

      const charge = await retrieveTapChargeFromBoundAccount(tapId);
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
      const shipmentReturnPath =
        typeof charge.metadata?.returnPath === "string" && charge.metadata.returnPath.startsWith("/client/")
          ? charge.metadata.returnPath
          : "/client/create-shipment";

      if (target === "shipment" && charge.metadata?.shipmentId) {
        const separator = shipmentReturnPath.includes("?") ? "&" : "?";
        if (tapService.isSuccessfulStatus(charge.status)) {
          return res.redirect(`${shipmentReturnPath}${separator}shipmentId=${charge.metadata.shipmentId}&paymentStatus=success`);
        }
        if (tapService.isFailureStatus(charge.status)) {
          return res.redirect(`${shipmentReturnPath}${separator}shipmentId=${charge.metadata.shipmentId}&paymentStatus=failed&message=${message}`);
        }
        return res.redirect(`${shipmentReturnPath}${separator}shipmentId=${charge.metadata.shipmentId}&paymentStatus=pending`);
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

      const tapWebhookSignatureValid = await validateTapWebhookForBoundAccount(charge, signature);
      if (!tapWebhookSignatureValid) {
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
