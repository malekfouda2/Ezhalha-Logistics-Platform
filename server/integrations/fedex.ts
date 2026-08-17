import "../load-env";
import crypto from "crypto";
import type { FedExTradeDocumentTypeValue } from "@shared/schema";
import {
  calculateChargeableWeight,
  convertWeight,
  type ChargeableWeightSummary,
} from "@shared/chargeable-weight";
import { countryTimeZone } from "@shared/country-timezones";
import { logInfo, logError, logWarn } from "../services/logger";
import { storage } from "../storage";
import { getIntegrationEnv, getIntegrationEnvBoolean } from "../services/integration-runtime";

const COUNTRIES_REQUIRING_STATE = new Set(["US", "CA", "AU", "IN", "BR", "MX", "CN", "JP"]);

const STATE_CODE_ALIASES: Record<string, Record<string, string>> = {
  US: {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
    "district of columbia": "DC",
  },
  CA: {
    alberta: "AB",
    "british columbia": "BC",
    manitoba: "MB",
    "new brunswick": "NB",
    "newfoundland and labrador": "NL",
    "northwest territories": "NT",
    "nova scotia": "NS",
    nunavut: "NU",
    ontario: "ON",
    "prince edward island": "PE",
    quebec: "QC",
    saskatchewan: "SK",
    yukon: "YT",
  },
  AU: {
    "new south wales": "NSW",
    victoria: "VIC",
    queensland: "QLD",
    "south australia": "SA",
    "western australia": "WA",
    tasmania: "TAS",
    "northern territory": "NT",
    "australian capital territory": "ACT",
  },
};

function sanitizeStateCode(countryCode: string, stateOrProvince?: string): string | undefined {
  if (!stateOrProvince || stateOrProvince.trim() === "") return undefined;
  const trimmed = stateOrProvince.trim();
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  if (COUNTRIES_REQUIRING_STATE.has(normalizedCountryCode)) {
    const normalizedState = trimmed.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
    const aliasMap = STATE_CODE_ALIASES[normalizedCountryCode];
    if (aliasMap?.[normalizedState]) {
      return aliasMap[normalizedState];
    }
    // No alias map for this country (CN, IN, BR, MX, JP): send nothing rather than the first two
    // letters of the free-text province. That guess is right only by coincidence — "Shanghai"→SH
    // happens to be correct while "Guangdong"→GU, "Beijing"→BE and "Sichuan"→SI are not codes at
    // all — and a bogus code is worse than an absent one, since FedEx validates the postal code
    // within the province it was given.
    return undefined;
  }
  return undefined;
}

export class CarrierError extends Error {
  public code: string;
  public carrierMessage: string;

  constructor(code: string, message: string) {
    super(`CarrierError [${code}]: ${message}`);
    this.name = "CarrierError";
    this.code = code;
    this.carrierMessage = message;
  }
}

export interface ShippingAddress {
  name: string;
  companyName?: string;
  streetLine1: string;
  streetLine2?: string;
  streetLine3?: string;
  city: string;
  stateOrProvince?: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  email?: string;
}

export interface PackageDetails {
  weight: number;
  weightUnit: "LB" | "KG";
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: "IN" | "CM";
  };
  packageType: string;
}

export interface ShipmentItem {
  description: string;
  category?: string;
  material?: string;
  hsCode?: string;
  countryOfOrigin?: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
}

export interface TradeDocumentUploadRequest {
  fileName: string;
  contentType: string;
  documentType: FedExTradeDocumentTypeValue;
  originCountryCode: string;
  destinationCountryCode: string;
  fileBuffer: Buffer;
}

export interface TradeDocumentUploadResponse {
  documentId: string;
  fileName: string;
  documentType: FedExTradeDocumentTypeValue;
}

export interface TradeDocumentReference {
  documentType: FedExTradeDocumentTypeValue;
  uploadedDocumentId: string;
}

export interface AddressValidationRequest {
  address: {
    streetLine1: string;
    streetLine2?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    countryCode: string;
  };
}

export interface AddressValidationResponse {
  valid: boolean;
  resolvedAddresses: Array<{
    streetLines: string[];
    city: string;
    stateOrProvince: string;
    postalCode: string;
    countryCode: string;
    residential: boolean;
  }>;
  messages?: string[];
}

export interface PostalCodeValidationRequest {
  postalCode: string;
  countryCode: string;
  stateOrProvince?: string;
}

export interface PostalCodeValidationResponse {
  valid: boolean;
  locationDescription?: string;
  stateOrProvince?: string;
  countryCode: string;
  /**
   * Where the verdict came from. "carrier" means the carrier's own database answered; anything
   * else is a local heuristic (format regex, mock) that is only meaningful for a handful of
   * countries. Callers that block a customer action on `valid: false` must require "carrier" —
   * a 6-digit Chinese code fails a US-shaped regex, and refusing checkout over that would be
   * worse than the problem being prevented.
   */
  source?: "carrier" | "heuristic";
}

export interface ServiceAvailabilityRequest {
  origin: {
    postalCode: string;
    countryCode: string;
    stateOrProvince?: string;
  };
  destination: {
    postalCode: string;
    countryCode: string;
    stateOrProvince?: string;
  };
  shipDate?: string;
}

export interface ServiceAvailabilityResponse {
  services: Array<{
    serviceType: string;
    serviceName: string;
    displayName: string;
    available: boolean;
    isInternational: boolean;
    transitDays?: number;
    deliveryDate?: string;
    validPackagingTypes?: string[];
  }>;
}

export interface RateRequest {
  shipper: ShippingAddress;
  recipient: ShippingAddress;
  packages: PackageDetails[];
  serviceType?: string;
  packagingType?: string;
  currency?: string;
  shipDate?: string;
}

export interface RateResponse {
  baseRate: number;
  currency: string;
  serviceType: string;
  transitDays: number;
  deliveryDate?: Date;
  serviceName: string;
  packagingType?: string;
  actualWeight?: number;
  dimensionalWeight?: number;
  chargeableWeight?: number;
  chargeableWeightUnit?: "KG" | "LB";
  chargeableWeightSource?: "carrier" | "system";
  chargeableWeightDetails?: ChargeableWeightSummary;
}

export interface CreateShipmentRequest {
  shipper: ShippingAddress;
  recipient: ShippingAddress;
  packages: PackageDetails[];
  serviceType: string;
  packagingType?: string;
  incoterm?: string;
  labelFormat?: "PDF" | "PNG" | "ZPL";
  commodityDescription?: string;
  declaredValue?: number;
  currency?: string;
  shipDate?: string;
  commercialInvoiceNumber?: string;
  commercialInvoiceDate?: string;
  items?: ShipmentItem[];
  tradeDocuments?: TradeDocumentReference[];
  // Free-text note forwarded to the carrier's order (e.g. Fizzpa OrderNote / Shipox note).
  // Used by virtual-carrier routing to tell an aggregator's ops which courier to assign.
  // Carriers that expose no note field ignore it.
  note?: string;
}

export interface CreateShipmentResponse {
  trackingNumber: string;
  carrierTrackingNumber: string;
  labelUrl?: string;
  labelData?: string;
  estimatedDelivery?: Date;
  serviceType: string;
}

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  description: string;
  location?: string;
}

// Carrier pickup request. Fired after a shipment is booked with the carrier (so the pickup
// is tied to a real waybill). Address/packages come from the booked shipment; the date/time
// window comes from the create/quote flow.
export interface PickupRequest {
  shipper: ShippingAddress;
  packages: PackageDetails[];
  /** Local pickup date, "YYYY-MM-DD". */
  pickupDate: string;
  /** Earliest ready time and latest close time, "HH:MM" (24h, shipper-local). */
  readyTime: string;
  closeTime: string;
  location?: string; // e.g. "Reception", "Warehouse dock"
  instructions?: string;
  isInternational?: boolean;
  declaredValue?: number;
  currency?: string;
  /** Carrier product/service code the shipment was booked with (e.g. DHL "P"). */
  serviceType?: string;
  /** The booked waybill, when the carrier can link the pickup to an existing shipment. */
  trackingNumber?: string;
  /** The station code returned when the pickup was created. Required to cancel a FedEx Express pickup. */
  locationCode?: string;
}

export interface PickupResponse {
  confirmationNumber: string;
  /**
   * The carrier station that owns the pickup, when the carrier issues one. FedEx Express returns
   * it from create (e.g. "SXJA") and REQUIRES it back to cancel, so it has to be persisted with
   * the confirmation number rather than logged and dropped.
   */
  locationCode?: string;
  raw?: unknown;
}

export interface TrackingResponse {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  events: TrackingEvent[];
}

export interface CarrierCapabilityProfile {
  type: "local" | "international" | "both";
  domesticCountries?: string[]; // ISO codes this carrier delivers domestically, e.g. ["SA"]
  domesticZones?: boolean;
  labelFormat?: "PDF" | "ZPL";
  trackingMode?: "push" | "poll";
  // Aggregator backends (Fizzpa / Shipox) that clients never pick directly — they are only
  // reached through client-facing virtual carriers. Hidden from the client rate list but
  // still resolvable by code for booking/tracking. See virtualCarriers.
  providerOnly?: boolean;
}

export interface CarrierAdapter {
  name: string;
  carrierCode: string;
  // Optional so existing international adapters remain valid; absent => international.
  capabilities?: CarrierCapabilityProfile;
  isConfigured(): boolean;
  validateAddress(request: AddressValidationRequest): Promise<AddressValidationResponse>;
  validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse>;
  checkServiceAvailability(request: ServiceAvailabilityRequest): Promise<ServiceAvailabilityResponse>;
  getRates(request: RateRequest): Promise<RateResponse[]>;
  createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse>;
  trackShipment(trackingNumber: string): Promise<TrackingResponse>;
  cancelShipment(trackingNumber: string, senderCountryCode?: string): Promise<boolean>;
  validateWebhookSignature(payload: string, signature: string): boolean;
  // Optional: carriers that support scheduling a courier pickup implement these. Absent =>
  // pickup not supported (the booking flow simply skips it). Kept optional so existing
  // adapters remain valid.
  supportsPickup?: boolean;
  requestPickup?(request: PickupRequest): Promise<PickupResponse>;
  cancelPickup?(confirmationNumber: string, request?: Partial<PickupRequest>): Promise<boolean>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isMockAllowed(): boolean {
  if (getIntegrationEnvBoolean("FEDEX_MOCK_MODE")) return true;
  return !isProduction();
}

export function parseMoney(value: any): number {
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ""));
    if (isNaN(parsed)) return NaN;
    return Math.round(parsed * 100) / 100;
  }
  if (typeof value === "object" && value !== null && "amount" in value) {
    return parseMoney(value.amount);
  }
  return NaN;
}

function normalizeCarrierWeightUnit(unit?: string): "KG" | "LB" | undefined {
  const normalized = String(unit || "").trim().toUpperCase();
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS"].includes(normalized)) return "KG";
  if (["LB", "LBS", "POUND", "POUNDS"].includes(normalized)) return "LB";
  return undefined;
}

function buildRateChargeableWeightSummary(
  request: RateRequest,
  carrierCode: string,
): ChargeableWeightSummary {
  const firstPackage = request.packages[0];
  return calculateChargeableWeight(
    request.packages.map((pkg) => ({
      weight: pkg.weight,
      length: pkg.dimensions?.length,
      width: pkg.dimensions?.width,
      height: pkg.dimensions?.height,
    })),
    firstPackage?.weightUnit || "KG",
    firstPackage?.dimensions?.unit || "CM",
    carrierCode,
  );
}

function extractFedExBillingWeight(rate: any): { value: number; unit: "KG" | "LB" } | undefined {
  const shipmentDetails = Array.isArray(rate?.ratedShipmentDetails)
    ? rate.ratedShipmentDetails
    : [];

  for (const detail of shipmentDetails) {
    const candidates = [
      detail?.shipmentRateDetail?.totalBillingWeight,
      detail?.shipmentRateDetail?.totalDimWeight,
      detail?.totalBillingWeight,
      detail?.totalDimWeight,
    ];

    for (const candidate of candidates) {
      const value = Number(candidate?.value ?? candidate?.weight);
      const unit = normalizeCarrierWeightUnit(candidate?.units ?? candidate?.unit);
      if (Number.isFinite(value) && value > 0 && unit) {
        return { value, unit };
      }
    }

    const ratedPackages = Array.isArray(detail?.ratedPackages) ? detail.ratedPackages : [];
    const packageWeights = ratedPackages
      .map((ratedPackage: any) => {
        const billingWeight = ratedPackage?.packageRateDetail?.billingWeight;
        const value = Number(billingWeight?.value ?? billingWeight?.weight);
        const unit = normalizeCarrierWeightUnit(billingWeight?.units ?? billingWeight?.unit);
        return Number.isFinite(value) && value > 0 && unit ? { value, unit } : null;
      })
      .filter((weight: { value: number; unit: "KG" | "LB" } | null): weight is { value: number; unit: "KG" | "LB" } => Boolean(weight));

  if (packageWeights.length > 0) {
    const unit = packageWeights[0].unit;
      const value = packageWeights.reduce(
        (sum: number, weight: { value: number; unit: "KG" | "LB" }) =>
          sum + convertWeight(weight.value, weight.unit, unit),
        0,
      );
      return { value, unit };
    }
  }

  return undefined;
}

function applyCarrierBillingWeightToSummary(
  summary: ChargeableWeightSummary,
  billingWeight?: { value: number; unit: "KG" | "LB" },
): RateResponse["chargeableWeightDetails"] {
  if (!billingWeight) {
    return summary;
  }

  const chargeableWeight = convertWeight(billingWeight.value, billingWeight.unit, summary.weightUnit);
  const chargeableWeightKg = convertWeight(billingWeight.value, billingWeight.unit, "KG");

  return {
    ...summary,
    chargeableWeight: Number(chargeableWeight.toFixed(3)),
    chargeableWeightKg: Number(chargeableWeightKg.toFixed(3)),
  };
}

function formatFedExShipDateStamp(shipDate?: string): string {
  if (shipDate) {
    const parsed = new Date(shipDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(shipDate.trim())) {
      return shipDate.trim();
    }
  }

  return new Date().toISOString().split("T")[0];
}

function parseCarrierDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return undefined;
}

function extractFedExDeliveryDate(rate: any): Date | undefined {
  const commitDetails = Array.isArray(rate?.commitDetails) ? rate.commitDetails : [];
  const candidates = [
    rate?.operationalDetail?.deliveryDate,
    rate?.operationalDetail?.commitDate,
    rate?.commit?.dateDetail?.dayFormat,
    rate?.commit?.commitTimestamp,
    rate?.commit?.deliveryTimestamp,
    rate?.commit?.deliveryDate,
    ...commitDetails.flatMap((detail: any) => [
      detail?.commitTimestamp,
      detail?.deliveryTimestamp,
      detail?.deliveryDate,
      detail?.dateDetail?.dayFormat,
    ]),
  ];

  for (const candidate of candidates) {
    const parsed = parseCarrierDate(candidate);
    if (parsed) return parsed;
  }

  return undefined;
}

function parseTransitDaysValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) return undefined;

  const numericMatch = normalized.match(/\d+/);
  if (numericMatch) {
    const parsed = Number(numericMatch[0]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const wordMap: Record<string, number> = {
    SAME_DAY: 0,
    ONE_DAY: 1,
    TWO_DAYS: 2,
    THREE_DAYS: 3,
    FOUR_DAYS: 4,
    FIVE_DAYS: 5,
    SIX_DAYS: 6,
    SEVEN_DAYS: 7,
    EIGHT_DAYS: 8,
    NINE_DAYS: 9,
    TEN_DAYS: 10,
  };

  return wordMap[normalized];
}

function daysBetweenDates(startDate: string, endDate?: Date): number | undefined {
  if (!endDate) return undefined;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);

  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Number.isFinite(diff) && diff >= 0 ? diff : undefined;
}

function extractFedExTransitDays(rate: any, shipDateStamp: string, deliveryDate?: Date): number {
  const commitDetails = Array.isArray(rate?.commitDetails) ? rate.commitDetails : [];
  const candidates = [
    rate?.operationalDetail?.transitTime,
    rate?.operationalDetail?.customTransitTime,
    rate?.commit?.transitDays,
    rate?.commit?.transitTime,
    ...commitDetails.flatMap((detail: any) => [detail?.transitDays, detail?.transitTime]),
  ];

  for (const candidate of candidates) {
    const parsed = parseTransitDaysValue(candidate);
    if (parsed !== undefined) return parsed;
  }

  return daysBetweenDates(shipDateStamp, deliveryDate) ?? 3;
}

function maskSensitiveData(data: any): any {
  if (!data) return data;
  const masked = JSON.parse(JSON.stringify(data));
  const sensitiveFields = ['access_token', 'client_secret', 'password', 'apiKey', 'secretKey'];
  
  function maskObject(obj: any): void {
    for (const key in obj) {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        obj[key] = '***MASKED***';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        maskObject(obj[key]);
      }
    }
  }
  
  maskObject(masked);
  return masked;
}

export function validateFedExEnvOnStartup(): void {
  if (!isProduction()) return;

  const configuredValues = {
    FEDEX_CLIENT_ID: process.env.FEDEX_CLIENT_ID || process.env.FEDEX_API_KEY,
    FEDEX_CLIENT_SECRET: process.env.FEDEX_CLIENT_SECRET || process.env.FEDEX_SECRET_KEY,
    FEDEX_ACCOUNT_NUMBER: process.env.FEDEX_ACCOUNT_NUMBER,
    FEDEX_BASE_URL: process.env.FEDEX_BASE_URL,
  };

  const hasAnyFedExConfig = Object.values(configuredValues).some((value) => !!value);
  if (!hasAnyFedExConfig) {
    logInfo("FedEx is not configured in production; continuing with other configured carriers only");
    return;
  }

  const missing = Object.entries(configuredValues)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    logWarn(
      `FedEx is partially configured in production and will be disabled until completed. Missing: ${missing.join(", ")}`,
      { source: "fedex" },
    );
    return;
  }

  const baseUrl = configuredValues.FEDEX_BASE_URL || "";
  if (baseUrl.toLowerCase().includes("sandbox")) {
    logWarn(
      "FedEx production configuration is using a sandbox base URL and will be disabled until corrected.",
      { source: "fedex", baseUrl },
    );
  }
}

export class FedExAdapter implements CarrierAdapter {
  name = "FedEx";
  carrierCode = "FEDEX";
  
  private accessToken: string | undefined;
  private tokenExpiry: number = 0;
  private tokenCredentialFingerprint: string | undefined;

  // FedEx "Basic Integrated Visibility" (formerly Track API) must live in its OWN project with
  // its OWN key — it cannot share the Ship/Rate project. So tracking authenticates with separate
  // FEDEX_TRACK_* credentials when present; otherwise it falls back to the Ship/Rate credentials.
  private trackAccessToken: string | undefined;
  private trackTokenExpiry: number = 0;
  private trackTokenFingerprint: string | undefined;

  private get clientId(): string | undefined {
    return getIntegrationEnv("FEDEX_CLIENT_ID") || getIntegrationEnv("FEDEX_API_KEY");
  }

  private get clientSecret(): string | undefined {
    return getIntegrationEnv("FEDEX_CLIENT_SECRET") || getIntegrationEnv("FEDEX_SECRET_KEY");
  }

  private get accountNumber(): string | undefined {
    return getIntegrationEnv("FEDEX_ACCOUNT_NUMBER");
  }

  private get webhookSecret(): string | undefined {
    return getIntegrationEnv("FEDEX_WEBHOOK_SECRET");
  }

  private get baseUrl(): string {
    return getIntegrationEnv("FEDEX_BASE_URL") || "https://apis-sandbox.fedex.com";
  }

  private get documentBaseUrl(): string {
    const documentBaseUrl = getIntegrationEnv("FEDEX_DOCUMENT_BASE_URL");
    if (documentBaseUrl) {
      return documentBaseUrl;
    }
    return this.baseUrl.includes("sandbox")
      ? "https://documentapitest.prod.fedex.com/sandbox"
      : "https://documentapi.prod.fedex.com";
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.accountNumber);
  }

  private invalidateToken(): void {
    this.accessToken = undefined;
    this.tokenExpiry = 0;
    this.tokenCredentialFingerprint = undefined;
  }

  private getCredentialFingerprint(): string {
    return `${this.clientId || ""}:${this.clientSecret || ""}:${this.baseUrl}`;
  }

  private async logIntegration(
    endpoint: string, 
    method: string, 
    requestBody: any, 
    responseBody: any, 
    statusCode: number, 
    duration: number,
    success: boolean
  ): Promise<void> {
    try {
      const maskedRequest = maskSensitiveData(requestBody);
      let maskedResponse: any;
      if (isProduction()) {
        maskedResponse = responseBody?.error
          ? { error: responseBody.error }
          : { logged: false, reason: "production" };
      } else {
        maskedResponse = maskSensitiveData(responseBody);
      }

      await storage.createIntegrationLog({
        serviceName: "fedex",
        operation: `${method} ${endpoint}`,
        requestPayload: JSON.stringify(maskedRequest),
        responsePayload: JSON.stringify(maskedResponse),
        statusCode,
        duration,
        success,
      });
    } catch (error) {
      logError("Failed to log integration", error);
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    method: string,
    body?: any,
    retries: number = MAX_RETRIES
  ): Promise<{ data: T; statusCode: number }> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let didRetryAuth = false;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const token = await this.getAccessToken();
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-locale": "en_US",
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const duration = Date.now() - startTime;
        const responseData = await response.json();

        if (response.status === 401 && !didRetryAuth) {
          didRetryAuth = true;
          this.invalidateToken();
          logInfo(`FedEx API 401, invalidating token and retrying for ${endpoint}`);
          continue;
        }

        await this.logIntegration(
          endpoint,
          method,
          body,
          responseData,
          response.status,
          duration,
          response.ok
        );

        if (!response.ok) {
          // Surface FedEx's own error codes/messages (e.g. RATE.LOCATION.NOSERVICE,
          // ORIGINZIPCODE.SERVICE.ERROR) even in production — these are validation
          // messages, not secrets, and without them failures log as an opaque status.
          const fedexErrors = Array.isArray((responseData as any)?.errors)
            ? (responseData as any).errors
                .map((e: any) => [e?.code, e?.message].filter(Boolean).join(": "))
                .filter(Boolean)
                .join("; ")
            : "";
          const errMsg = isProduction()
            ? `FedEx API error: ${response.status}${fedexErrors ? ` - ${fedexErrors}` : ""}`
            : `FedEx API error: ${response.status} - ${JSON.stringify(responseData)}`;
          const err = new Error(errMsg);
          if (response.status >= 500 && attempt < retries) {
            logInfo(`FedEx API retry ${attempt}/${retries} for ${endpoint}`, { status: response.status });
            lastError = err;
            await delay(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw err;
        }

        return { data: responseData, statusCode: response.status };
      } catch (error) {
        lastError = error as Error;
        if ((error as any).message?.startsWith("FedEx API error:")) {
          break;
        }
        if (attempt < retries && (error as any).code === 'ECONNRESET') {
          logInfo(`FedEx API retry ${attempt}/${retries} for ${endpoint} due to connection error`);
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }
        break;
      }
    }

    const duration = Date.now() - startTime;
    const alreadyLogged = lastError?.message?.startsWith("FedEx API error:");
    if (!alreadyLogged) {
      await this.logIntegration(endpoint, method, body, { error: lastError?.message }, 0, duration, false);
    }
    throw lastError || new Error("FedEx API request failed");
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("FedEx is not configured. Set FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET, and FEDEX_ACCOUNT_NUMBER.");
    }

    const credentialFingerprint = this.getCredentialFingerprint();
    if (
      this.accessToken &&
      Date.now() < this.tokenExpiry &&
      this.tokenCredentialFingerprint === credentialFingerprint
    ) {
      return this.accessToken;
    }

    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
        }),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.text();
        await this.logIntegration("/oauth/token", "POST", { grant_type: "client_credentials" }, { error }, response.status, duration, false);
        throw new Error(`FedEx auth failed: ${error}`);
      }

      const data = await response.json();
      await this.logIntegration("/oauth/token", "POST", { grant_type: "client_credentials" }, { success: true }, 200, duration, true);
      
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      this.tokenCredentialFingerprint = credentialFingerprint;
      return this.accessToken!;
    } catch (error) {
      logError("FedEx authentication failed", error);
      throw error;
    }
  }

  async validateAddress(request: AddressValidationRequest): Promise<AddressValidationResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.getMockAddressValidation(request);
    }

    try {
      const fedexRequest = {
        addressesToValidate: [{
          address: {
            streetLines: [request.address.streetLine1, request.address.streetLine2].filter(Boolean),
            city: request.address.city,
            stateOrProvinceCode: request.address.stateOrProvince,
            postalCode: request.address.postalCode,
            countryCode: request.address.countryCode,
          },
        }],
      };

      const { data } = await this.makeRequest<any>("/address/v1/addresses/resolve", "POST", fedexRequest);
      
      const output = data.output?.resolvedAddresses || [];
      return {
        valid: output.length > 0 && output[0].classification !== "UNKNOWN",
        resolvedAddresses: output.map((addr: any) => ({
          streetLines: addr.streetLinesToken || [],
          city: addr.city,
          stateOrProvince: addr.stateOrProvinceCode,
          postalCode: addr.postalCode,
          countryCode: addr.countryCode,
          residential: addr.classification === "RESIDENTIAL",
        })),
        messages: data.output?.alerts?.map((a: any) => a.message) || [],
      };
    } catch (error) {
      logError("FedEx address validation error", error);
      if (!isMockAllowed()) {
        throw new CarrierError("ADDRESS_VALIDATION_FAILED", (error as Error).message);
      }
      return this.getMockAddressValidation(request);
    }
  }

  private getMockAddressValidation(request: AddressValidationRequest): AddressValidationResponse {
    logInfo("Using mock FedEx address validation (FedEx not configured)");
    return {
      valid: true,
      resolvedAddresses: [{
        streetLines: [request.address.streetLine1, request.address.streetLine2].filter(Boolean) as string[],
        city: request.address.city || "Unknown City",
        stateOrProvince: request.address.stateOrProvince || "XX",
        postalCode: request.address.postalCode || "",
        countryCode: request.address.countryCode,
        residential: false,
      }],
      messages: ["Mock validation - FedEx not configured"],
    };
  }

  async validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.getMockPostalCodeValidation(request);
    }

    try {
      const fedexRequest = {
        carrierCode: "FDXE",
        countryCode: request.countryCode,
        stateOrProvinceCode: request.stateOrProvince,
        postalCode: request.postalCode,
        shipDate: new Date().toISOString().split('T')[0],
      };

      const { data } = await this.makeRequest<any>("/country/v1/postal/validate", "POST", fedexRequest);
      
      return {
        valid: data.output?.cleanedPostalCode !== undefined,
        locationDescription: data.output?.locationDescription,
        stateOrProvince: data.output?.stateOrProvinceCode,
        countryCode: request.countryCode,
        source: "carrier",
      };
    } catch (error) {
      // FedEx answers an unknown postal code with a 400, not a 200 carrying valid:false. Treat
      // that as a verdict ("this code does not exist") and everything else — auth, network,
      // outage — as the check being unavailable, so callers can tell a bad address apart from a
      // broken dependency.
      const message = (error as Error).message || "";
      if (/POSTALCODEORZIP\.INVALID|ZIPCODE\.NOTAVAILABLE|POSTAL\.CODE\.INVALID/i.test(message)) {
        logInfo(`FedEx does not carry postal code ${request.postalCode} for ${request.countryCode}`);
        return {
          valid: false,
          locationDescription: undefined,
          stateOrProvince: request.stateOrProvince,
          countryCode: request.countryCode,
          source: "carrier",
        };
      }
      logError("FedEx postal code validation error", error);
      if (!isMockAllowed()) {
        throw new CarrierError("POSTAL_VALIDATION_FAILED", message);
      }
      return this.getMockPostalCodeValidation(request);
    }
  }

  private getMockPostalCodeValidation(request: PostalCodeValidationRequest): PostalCodeValidationResponse {
    logInfo("Using mock FedEx postal code validation (FedEx not configured)");
    return {
      valid: /^\d{5}(-\d{4})?$/.test(request.postalCode) || /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(request.postalCode),
      locationDescription: "Mock Location",
      stateOrProvince: request.stateOrProvince,
      countryCode: request.countryCode,
      source: "heuristic",
    };
  }

  async checkServiceAvailability(request: ServiceAvailabilityRequest): Promise<ServiceAvailabilityResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.getMockServiceAvailability(request);
    }

    try {
      // Mirror the rate path: FedEx rejects state/province values that are not
      // valid sub-division codes (e.g. KSA region names like "Makkah") with a
      // 400 SERVICES.AVAILABLE.INVALID. sanitizeStateCode drops them for
      // countries that don't require a state, keeping availability in sync with
      // the rate request built in getRates.
      const originStateCode = sanitizeStateCode(request.origin.countryCode, request.origin.stateOrProvince);
      const destinationStateCode = sanitizeStateCode(request.destination.countryCode, request.destination.stateOrProvince);
      const fedexRequest = {
        requestedShipment: {
          shipper: {
            address: {
              postalCode: request.origin.postalCode,
              countryCode: request.origin.countryCode,
              stateOrProvinceCode: originStateCode,
            },
          },
          recipients: [{
            address: {
              postalCode: request.destination.postalCode,
              countryCode: request.destination.countryCode,
              stateOrProvinceCode: destinationStateCode,
            },
          }],
        },
      };

      const { data } = await this.makeRequest<any>("/availability/v1/packageandserviceoptions", "POST", fedexRequest);
      
      const isInternational = request.origin.countryCode !== request.destination.countryCode;
      const packageOptions = data.output?.packageOptions || [];
      
      const serviceMap = new Map<string, { displayName: string; packagingTypes: Set<string>; transitDays?: number; deliveryDate?: string }>();
      for (const opt of packageOptions) {
        const svcKey = typeof opt.serviceType === "object" ? opt.serviceType.key : opt.serviceType;
        const svcName = typeof opt.serviceType === "object" ? opt.serviceType.displayText : (opt.serviceDescription || svcKey);
        const pkgKey = typeof opt.packageType === "object" ? opt.packageType.key : opt.packageType;
        
        if (!svcKey) continue;
        
        if (!serviceMap.has(svcKey)) {
          serviceMap.set(svcKey, {
            displayName: svcName || svcKey,
            packagingTypes: new Set<string>(),
            transitDays: opt.transitTime?.minimumTransitTime,
            deliveryDate: opt.deliveryDay,
          });
        }
        if (pkgKey) {
          serviceMap.get(svcKey)!.packagingTypes.add(pkgKey);
        }
      }
      
      return {
        services: Array.from(serviceMap.entries()).map(([serviceType, info]) => ({
          serviceType,
          serviceName: info.displayName,
          displayName: info.displayName,
          available: true,
          isInternational,
          transitDays: info.transitDays,
          deliveryDate: info.deliveryDate,
          validPackagingTypes: Array.from(info.packagingTypes),
        })),
      };
    } catch (error) {
      logError("FedEx service availability error", error);
      if (!isMockAllowed()) {
        throw new CarrierError("SERVICE_AVAILABILITY_FAILED", (error as Error).message);
      }
      return this.getMockServiceAvailability(request);
    }
  }

  private getMockServiceAvailability(request: ServiceAvailabilityRequest): ServiceAvailabilityResponse {
    logInfo("Using mock FedEx service availability (FedEx not configured)");
    const isInternational = request.origin.countryCode !== request.destination.countryCode;
    
    return {
      services: [
        { serviceType: "FEDEX_GROUND", serviceName: "FedEx Ground", displayName: "FedEx Ground", available: !isInternational, isInternational: false, transitDays: 5 },
        { serviceType: "FEDEX_EXPRESS_SAVER", serviceName: "FedEx Express Saver", displayName: "FedEx Express Saver", available: !isInternational, isInternational: false, transitDays: 3 },
        { serviceType: "FEDEX_2_DAY", serviceName: "FedEx 2Day", displayName: "FedEx 2Day", available: !isInternational, isInternational: false, transitDays: 2 },
        { serviceType: "FEDEX_PRIORITY_OVERNIGHT", serviceName: "FedEx Priority Overnight", displayName: "FedEx Priority Overnight", available: !isInternational, isInternational: false, transitDays: 1 },
        { serviceType: "FEDEX_INTERNATIONAL_PRIORITY", serviceName: "FedEx International Priority", displayName: "FedEx International Priority", available: isInternational, isInternational: true, transitDays: 3 },
        { serviceType: "FEDEX_INTERNATIONAL_ECONOMY", serviceName: "FedEx International Economy", displayName: "FedEx International Economy", available: isInternational, isInternational: true, transitDays: 5 },
      ].filter(s => s.available),
    };
  }

  private mapPackagingType(packageType?: string): string {
    const mapping: Record<string, string> = {
      "YOUR_PACKAGING": "YOUR_PACKAGING",
      "ENVELOPE": "FEDEX_ENVELOPE",
      "PAK": "FEDEX_PAK",
      "BOX_SMALL": "FEDEX_SMALL_BOX",
      "BOX_MEDIUM": "FEDEX_MEDIUM_BOX",
      "BOX_LARGE": "FEDEX_LARGE_BOX",
      "TUBE": "FEDEX_TUBE",
      "FEDEX_ENVELOPE": "FEDEX_ENVELOPE",
      "FEDEX_PAK": "FEDEX_PAK",
      "FEDEX_SMALL_BOX": "FEDEX_SMALL_BOX",
      "FEDEX_MEDIUM_BOX": "FEDEX_MEDIUM_BOX",
      "FEDEX_LARGE_BOX": "FEDEX_LARGE_BOX",
      "FEDEX_TUBE": "FEDEX_TUBE",
      "FEDEX_BOX": "FEDEX_BOX",
      "FEDEX_10KG_BOX": "FEDEX_10KG_BOX",
      "FEDEX_25KG_BOX": "FEDEX_25KG_BOX",
      "FEDEX_EXTRA_LARGE_BOX": "FEDEX_EXTRA_LARGE_BOX",
    };
    return mapping[packageType || "YOUR_PACKAGING"] || packageType || "YOUR_PACKAGING";
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      logInfo("FedEx not configured, using mock rates");
      return this.getMockRates(request);
    }

    logInfo(`FedEx getRates: calling real API (baseUrl: ${this.baseUrl})`);

    let serviceTypesToTry: string[] = [];
    let packagingTypesToTry: string[] = [];
    const systemChargeableWeight = buildRateChargeableWeightSummary(request, "FEDEX");
    const shipDateStamp = formatFedExShipDateStamp(request.shipDate);

    try {
      const shipperStreetLines = [request.shipper.streetLine1, request.shipper.streetLine2].filter(Boolean) as string[];
      const sanitizedShipperState = sanitizeStateCode(request.shipper.countryCode, request.shipper.stateOrProvince);
      const shipperAddress: any = {
        streetLines: shipperStreetLines,
        city: request.shipper.city,
        postalCode: request.shipper.postalCode,
        countryCode: request.shipper.countryCode,
      };
      if (sanitizedShipperState) {
        shipperAddress.stateOrProvinceCode = sanitizedShipperState;
      }

      const recipientStreetLines = [request.recipient.streetLine1, request.recipient.streetLine2].filter(Boolean) as string[];
      const sanitizedRecipientState = sanitizeStateCode(request.recipient.countryCode, request.recipient.stateOrProvince);
      const recipientAddress: any = {
        streetLines: recipientStreetLines,
        city: request.recipient.city,
        postalCode: request.recipient.postalCode,
        countryCode: request.recipient.countryCode,
      };
      if (sanitizedRecipientState) {
        recipientAddress.stateOrProvinceCode = sanitizedRecipientState;
      }

      const userPackaging = (request.packagingType && request.packagingType !== "YOUR_PACKAGING")
        ? request.packagingType : null;

      // FedEx rejects international rate quotes without a customsClearanceDetail
      // (RATE.CUSTOMCLEARANCEDETAIL.INVALID). RateRequest carries no declared
      // value, so send a minimal placeholder — the customs value does not affect
      // the transport base charge we read back (real customs data is built on the
      // ship / commercial-invoice path).
      const isInternational = request.shipper.countryCode !== request.recipient.countryCode;
      const rateCustomsDetail = isInternational
        ? {
            dutiesPayment: { paymentType: "SENDER" },
            commodities: [{
              description: "General goods",
              quantity: 1,
              quantityUnits: "PCS",
              weight: {
                units: request.packages[0]?.weightUnit || "KG",
                value: request.packages.reduce((sum, pkg) => sum + (Number(pkg.weight) || 0), 0) || 1,
              },
              customsValue: { amount: 100, currency: request.currency || "USD" },
            }],
          }
        : null;

      try {
        const saResult = await this.checkServiceAvailability({
          origin: { postalCode: request.shipper.postalCode || "", countryCode: request.shipper.countryCode },
          destination: { postalCode: request.recipient.postalCode || "", countryCode: request.recipient.countryCode },
        });
        if (saResult.services.length > 0) {
          const uniqueTypes = [...new Set(saResult.services.map(s => s.serviceType))];
          serviceTypesToTry = uniqueTypes;
          const validPkgs = [...new Set(saResult.services.flatMap(s => s.validPackagingTypes || []))];
          if (userPackaging) {
            packagingTypesToTry = validPkgs.includes(userPackaging)
              ? [userPackaging, ...validPkgs.filter(p => p !== userPackaging)]
              : [userPackaging];
          } else {
            // Default to the customer's OWN packaging. The FedEx-branded boxes the
            // availability API returns (e.g. FEDEX_10KG_BOX) are priced at their box
            // minimum (~10kg), which overcharges a light parcel by several times
            // (1kg EG→SA: FEDEX_10KG_BOX ≈ 597 SAR vs YOUR_PACKAGING ≈ 99 SAR). Only
            // use a branded box when the customer explicitly selected one.
            packagingTypesToTry = ["YOUR_PACKAGING"];
          }
        } else {
          packagingTypesToTry = userPackaging ? [userPackaging] : ["YOUR_PACKAGING"];
        }
      } catch (saErr) {
        logInfo("Service availability lookup before rates failed, proceeding with defaults", {
          error: saErr instanceof Error ? saErr.message : String(saErr),
        });
        packagingTypesToTry = userPackaging ? [userPackaging] : ["YOUR_PACKAGING"];
      }

      // Order the service types to try. AUTO (no serviceType) must come FIRST for rate
      // discovery: a single FedEx rate call with no serviceType returns rateReplyDetails for
      // EVERY available service level. Trying a specific service first returned only that one
      // service — the reason the rates page showed a single service level. Specific services
      // are kept only as a per-service fallback for lanes/accounts where AUTO errors out.
      const discoveredServices = serviceTypesToTry;
      serviceTypesToTry = [];
      if (request.serviceType) {
        // Booking a specific chosen service — quote that one first.
        serviceTypesToTry.push(request.serviceType);
      }
      serviceTypesToTry.push(""); // AUTO — one call returns all service levels
      for (const svc of discoveredServices) {
        if (!serviceTypesToTry.includes(svc)) serviceTypesToTry.push(svc);
      }

      const isRetryableError = (msg: string) => 
        msg.includes("SERVICE.PACKAGECOMBINATION.INVALID") || 
        msg.includes("INCOUNTRY.SERVICES.NOTALLOWED") ||
        msg.includes("SYSTEM.UNEXPECTED.ERROR") ||
        msg.includes("SYSTEM.UNAVAILABLE") ||
        msg.includes("SELECTED.DESTINATION.SERVICETYPE.INVALID") ||
        msg.includes("SERVICETYPE.NOTSUPPORTED") ||
        msg.includes("SERVICETYPE.NOT.ALLOWED") ||
        msg.includes("SERVICE.NOTALLOWED") ||
        msg.includes("SERVICETYPE.INVALID");

      let lastError: any = null;
      for (const trySvc of serviceTypesToTry) {
        for (const tryPkg of packagingTypesToTry) {
          const requestedShipment: any = {
            pickupType: "DROPOFF_AT_FEDEX_LOCATION",
            rateRequestType: ["LIST", "ACCOUNT"],
            shipper: { address: shipperAddress },
            recipient: { address: recipientAddress },
            requestedPackageLineItems: request.packages.map(pkg => ({
              weight: {
                value: pkg.weight,
                units: pkg.weightUnit,
              },
              dimensions: pkg.dimensions ? {
                length: pkg.dimensions.length,
                width: pkg.dimensions.width,
                height: pkg.dimensions.height,
                units: pkg.dimensions.unit,
              } : undefined,
              groupPackageCount: 1,
            })),
            packagingType: tryPkg,
            packageCount: request.packages.length,
            shipDateStamp,
          };
          if (trySvc) {
            requestedShipment.serviceType = trySvc;
          }
          if (rateCustomsDetail) {
            requestedShipment.customsClearanceDetail = rateCustomsDetail;
          }

          const rateRequest = {
            accountNumber: { value: this.accountNumber },
            rateRequestControlParameters: {
              returnTransitTimes: true,
            },
            requestedShipment,
          };

          try {
            logInfo(`FedEx rate attempt: service=${trySvc || 'AUTO'} packaging=${tryPkg}`);
            const { data } = await this.makeRequest<any>("/rate/v1/rates/quotes", "POST", rateRequest, 1);
            
            const rates = data.output.rateReplyDetails.map((rate: any) => {
              const baseRate = parseMoney(rate.ratedShipmentDetails?.[0]?.totalNetCharge);
              if (isNaN(baseRate)) {
                throw new CarrierError("RATE_PARSE_FAILED", `Unable to parse rate for service ${rate.serviceType}`);
              }
              const carrierBillingWeight = extractFedExBillingWeight(rate);
              const chargeableWeightDetails = applyCarrierBillingWeightToSummary(
                systemChargeableWeight,
                carrierBillingWeight,
              );
              const deliveryDate = extractFedExDeliveryDate(rate);
              return {
                baseRate,
                currency: rate.ratedShipmentDetails[0].currency,
                serviceType: rate.serviceType,
                transitDays: extractFedExTransitDays(rate, shipDateStamp, deliveryDate),
                deliveryDate,
                serviceName: rate.serviceName,
                packagingType: tryPkg,
                actualWeight: chargeableWeightDetails?.actualWeight,
                dimensionalWeight: chargeableWeightDetails?.dimensionalWeight,
                chargeableWeight: chargeableWeightDetails?.chargeableWeight,
                chargeableWeightUnit: chargeableWeightDetails?.weightUnit,
                chargeableWeightSource: carrierBillingWeight ? "carrier" : "system",
                chargeableWeightDetails,
              };
            });
            logInfo(`FedEx rate success: got ${rates.length} rates with service=${trySvc || 'AUTO'} packaging=${tryPkg}`);
            return rates;
          } catch (retryErr: any) {
            const errMsg = retryErr?.message || "";
            lastError = retryErr;
            if (isRetryableError(errMsg)) {
              logInfo(`FedEx rate failed with service=${trySvc || 'AUTO'} packaging=${tryPkg}, trying next combo: ${errMsg.substring(0, 100)}`);
              continue;
            }
            throw retryErr;
          }
        }
      }
      throw lastError || new CarrierError("RATE_FAILED", "All service/packaging combinations failed");
    } catch (error: any) {
      logError("FedEx rate API failed", {
        from: request.shipper.countryCode,
        to: request.recipient.countryCode,
        error: error.message,
        serviceTypesAttempted: serviceTypesToTry,
        packagingTypesAttempted: packagingTypesToTry,
      });

      if (this.isConfigured() && this.baseUrl?.includes("sandbox")) {
        logInfo("FedEx sandbox rate API failed for all combos, generating calculated rates from service availability data");
        return this.getSandboxCalculatedRates(request, serviceTypesToTry, packagingTypesToTry);
      }
      if (this.isConfigured()) {
        if (error instanceof CarrierError) throw error;
        throw new CarrierError("RATE_FAILED", error.message || "FedEx rate request failed");
      }
      if (!isMockAllowed()) {
        throw new CarrierError("RATE_FAILED", error.message);
      }
      return this.getMockRates(request);
    }
  }

  private getMockRates(request: RateRequest): RateResponse[] {
    const chargeableWeightDetails = buildRateChargeableWeightSummary(request, "FEDEX");
    const baseWeight = chargeableWeightDetails.chargeableWeight;
    const isInternational = request.shipper.countryCode !== request.recipient.countryCode;
    const rateCurrency = request.currency || "SAR";
    
    const rates: RateResponse[] = isInternational ? [
      {
        baseRate: parseMoney(89.99 + (baseWeight * 4)),
        currency: rateCurrency,
        serviceType: "INTERNATIONAL_ECONOMY",
        transitDays: 5,
        serviceName: "FedEx International Economy",
      },
      {
        baseRate: parseMoney(149.99 + (baseWeight * 6)),
        currency: rateCurrency,
        serviceType: "INTERNATIONAL_PRIORITY",
        transitDays: 3,
        serviceName: "FedEx International Priority",
      },
      {
        baseRate: parseMoney(249.99 + (baseWeight * 10)),
        currency: rateCurrency,
        serviceType: "FEDEX_INTERNATIONAL_PRIORITY_EXPRESS",
        transitDays: 1,
        serviceName: "FedEx International Priority Express",
      },
    ] : [
      {
        baseRate: parseMoney(15.99 + (baseWeight * 1.2)),
        currency: rateCurrency,
        serviceType: "FEDEX_GROUND",
        transitDays: 5,
        serviceName: "FedEx Ground",
      },
      {
        baseRate: parseMoney(29.99 + (baseWeight * 2)),
        currency: rateCurrency,
        serviceType: "FEDEX_EXPRESS_SAVER",
        transitDays: 3,
        serviceName: "FedEx Express Saver",
      },
      {
        baseRate: parseMoney(49.99 + (baseWeight * 3)),
        currency: rateCurrency,
        serviceType: "FEDEX_2_DAY",
        transitDays: 2,
        serviceName: "FedEx 2Day",
      },
      {
        baseRate: parseMoney(79.99 + (baseWeight * 5)),
        currency: rateCurrency,
        serviceType: "FEDEX_PRIORITY_OVERNIGHT",
        transitDays: 1,
        serviceName: "FedEx Priority Overnight",
      },
    ];

    logInfo("Using mock FedEx rates (API unavailable for this route)", { 
      weight: baseWeight, 
      international: isInternational 
    });

    return rates.map((rate) => ({
      ...rate,
      actualWeight: chargeableWeightDetails.actualWeight,
      dimensionalWeight: chargeableWeightDetails.dimensionalWeight,
      chargeableWeight: chargeableWeightDetails.chargeableWeight,
      chargeableWeightUnit: chargeableWeightDetails.weightUnit,
      chargeableWeightSource: "system" as const,
      chargeableWeightDetails,
    }));
  }

  private getSandboxCalculatedRates(
    request: RateRequest,
    serviceTypes: string[],
    packagingTypes: string[]
  ): RateResponse[] {
    const chargeableWeightDetails = buildRateChargeableWeightSummary(request, "FEDEX");
    const baseWeight = chargeableWeightDetails.chargeableWeight;
    const isInternational = request.shipper.countryCode !== request.recipient.countryCode;
    const rateCurrency = request.currency || "SAR";
    
    const realServiceTypes = serviceTypes.filter(s => s !== "");
    if (realServiceTypes.length === 0) {
      realServiceTypes.push(isInternational ? "FEDEX_INTERNATIONAL_PRIORITY" : "FEDEX_INTERNATIONAL_PRIORITY");
    }

    const serviceDisplayNames: Record<string, string> = {
      "FEDEX_INTERNATIONAL_PRIORITY": "FedEx International Priority",
      "FEDEX_INTERNATIONAL_ECONOMY": "FedEx International Economy",
      "FEDEX_INTERNATIONAL_PRIORITY_EXPRESS": "FedEx International Priority Express",
      "FEDEX_INTERNATIONAL_FIRST": "FedEx International First",
      "FEDEX_INTERNATIONAL_CONNECT_PLUS": "FedEx International Connect Plus",
    };

    const bestPkg = packagingTypes[0] || "FEDEX_BOX";

    const rates = realServiceTypes.map((svc, i) => {
      const baseMultiplier = isInternational ? 6 : 3;
      const svcMultiplier = 1 + (i * 0.3);
      const calculatedRate = parseMoney((25 + (baseWeight * baseMultiplier)) * svcMultiplier);
      
      return {
        baseRate: calculatedRate,
        currency: rateCurrency,
        serviceType: svc,
        transitDays: Math.max(1, 3 - i),
        serviceName: serviceDisplayNames[svc] || svc.replace(/_/g, " ").replace(/\bFEDEX\b/i, "FedEx"),
        packagingType: bestPkg,
        actualWeight: chargeableWeightDetails.actualWeight,
        dimensionalWeight: chargeableWeightDetails.dimensionalWeight,
        chargeableWeight: chargeableWeightDetails.chargeableWeight,
        chargeableWeightUnit: chargeableWeightDetails.weightUnit,
        chargeableWeightSource: "system" as const,
        chargeableWeightDetails,
      };
    });

    logInfo("Using sandbox calculated rates (FedEx sandbox rate API unavailable for this lane)", {
      weight: baseWeight,
      international: isInternational,
      serviceTypes: realServiceTypes,
      packaging: bestPkg,
      rateCount: rates.length,
    });

    return rates;
  }

  private createMockTradeDocumentUpload(
    request: TradeDocumentUploadRequest,
  ): TradeDocumentUploadResponse {
    return {
      documentId: `mock-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: request.fileName,
      documentType: request.documentType,
    };
  }

  async uploadTradeDocument(
    request: TradeDocumentUploadRequest,
  ): Promise<TradeDocumentUploadResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      logInfo("FedEx not configured, using mock trade document upload", {
        fileName: request.fileName,
        documentType: request.documentType,
      });
      return this.createMockTradeDocumentUpload(request);
    }

    const startTime = Date.now();
    let didRetryAuth = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const token = await this.getAccessToken();
        const formData = new FormData();
        const documentPayload = {
          workflowName: "ETDPreshipment",
          carrierCode: "FDXE",
          name: request.fileName,
          contentType: request.contentType,
          meta: {
            shipDocumentType: request.documentType,
            originCountryCode: request.originCountryCode,
            destinationCountryCode: request.destinationCountryCode,
          },
        };

        formData.append("document", JSON.stringify(documentPayload));
        formData.append(
          "attachment",
          new Blob([request.fileBuffer], { type: request.contentType || "application/octet-stream" }),
          request.fileName,
        );

        const response = await fetch(`${this.documentBaseUrl}/documents/v1/etds/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-locale": "en_US",
          },
          body: formData,
        });

        const duration = Date.now() - startTime;
        const responseContentType = response.headers.get("content-type") || "";
        const responseData = responseContentType.includes("application/json")
          ? await response.json()
          : await response.text();

        if (response.status === 401 && !didRetryAuth) {
          didRetryAuth = true;
          this.invalidateToken();
          logInfo("FedEx document API 401, invalidating token and retrying", {
            fileName: request.fileName,
          });
          continue;
        }

        await this.logIntegration(
          "/documents/v1/etds/upload",
          "POST",
          {
            fileName: request.fileName,
            contentType: request.contentType,
            documentType: request.documentType,
            originCountryCode: request.originCountryCode,
            destinationCountryCode: request.destinationCountryCode,
          },
          responseData,
          response.status,
          duration,
          response.ok,
        );

        if (!response.ok) {
          const errorMessage = typeof responseData === "string"
            ? responseData
            : JSON.stringify(responseData);
          const error = new CarrierError(
            "UPLOAD_TRADE_DOCUMENT_FAILED",
            `FedEx document upload failed: ${response.status} - ${errorMessage}`,
          );

          if (response.status >= 500 && attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS * attempt);
            continue;
          }

          throw error;
        }

        const documentId = responseData?.output?.docId
          || responseData?.output?.meta?.docId
          || responseData?.output?.documentId
          || responseData?.docId
          || responseData?.documentId
          || responseData?.output?.documents?.[0]?.docId;

        if (!documentId) {
          throw new CarrierError(
            "UPLOAD_TRADE_DOCUMENT_FAILED",
            "FedEx document upload succeeded but no document ID was returned",
          );
        }

        return {
          documentId,
          fileName: request.fileName,
          documentType: request.documentType,
        };
      } catch (error) {
        if (error instanceof CarrierError && this.documentBaseUrl.includes("sandbox")) {
          logInfo("FedEx sandbox document API failed, using mock trade document upload", {
            fileName: request.fileName,
            error: error.carrierMessage,
          });
          return this.createMockTradeDocumentUpload(request);
        }

        if (attempt < MAX_RETRIES && !(error instanceof CarrierError)) {
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }

        logError("FedEx trade document upload error", error);

        if (error instanceof CarrierError) {
          throw error;
        }

        throw new CarrierError("UPLOAD_TRADE_DOCUMENT_FAILED", (error as Error).message);
      }
    }

    throw new CarrierError("UPLOAD_TRADE_DOCUMENT_FAILED", "FedEx trade document upload failed");
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.createMockShipment(request);
    }

    const isInternational = request.shipper.countryCode !== request.recipient.countryCode;

    if (isInternational && getIntegrationEnvBoolean("FEDEX_REQUIRE_HS") && request.items) {
      const missingHs = request.items.filter(item => !item.hsCode);
      if (missingHs.length > 0) {
        throw new CarrierError(
          "HS_CODE_REQUIRED",
          `HS code is required for international shipments. Missing for: ${missingHs.map(i => i.description).join(", ")}`
        );
      }
    }

    try {
      const shipDatestamp = request.shipDate || new Date().toISOString().split("T")[0];
      const requestCurrency = request.currency || "SAR";

      const shipperContact: any = {
        personName: request.shipper.name,
        phoneNumber: request.shipper.phone,
      };
      if (request.shipper.email) shipperContact.emailAddress = request.shipper.email;

      const recipientContact: any = {
        personName: request.recipient.name,
        phoneNumber: request.recipient.phone,
      };
      if (request.recipient.email) recipientContact.emailAddress = request.recipient.email;

      const shipperStateCode = sanitizeStateCode(request.shipper.countryCode, request.shipper.stateOrProvince);
      const recipientStateCode = sanitizeStateCode(request.recipient.countryCode, request.recipient.stateOrProvince);

      const shipperAddr: any = {
        streetLines: [request.shipper.streetLine1, request.shipper.streetLine2].filter(Boolean),
        city: request.shipper.city,
        postalCode: request.shipper.postalCode,
        countryCode: request.shipper.countryCode,
      };
      if (shipperStateCode) shipperAddr.stateOrProvinceCode = shipperStateCode;

      const recipientAddr: any = {
        streetLines: [request.recipient.streetLine1, request.recipient.streetLine2].filter(Boolean),
        city: request.recipient.city,
        postalCode: request.recipient.postalCode,
        countryCode: request.recipient.countryCode,
      };
      if (recipientStateCode) recipientAddr.stateOrProvinceCode = recipientStateCode;

      const requestedShipment: any = {
        shipper: {
          contact: shipperContact,
          address: shipperAddr,
        },
        recipients: [{
          contact: recipientContact,
          address: recipientAddr,
        }],
        shipDatestamp,
        serviceType: request.serviceType,
        packagingType: request.packagingType 
          ? this.mapPackagingType(request.packagingType) 
          : this.mapPackagingType(request.packages[0]?.packageType),
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        shippingChargesPayment: {
          paymentType: "SENDER",
          payor: {
            responsibleParty: {
              accountNumber: { value: this.accountNumber },
            },
          },
        },
        labelSpecification: {
          labelFormatType: "COMMON2D",
          imageType: request.labelFormat === "PNG" ? "PNG" : "PDF",
          labelStockType: "PAPER_4X6",
        },
      };

      if (request.tradeDocuments && request.tradeDocuments.length > 0) {
        requestedShipment.shipmentSpecialServices = {
          specialServiceTypes: ["ELECTRONIC_TRADE_DOCUMENTS"],
          etdDetail: {
            attachedDocuments: request.tradeDocuments.map((document) => ({
              documentType: document.documentType,
              documentId: document.uploadedDocumentId,
            })),
          },
        };
      }

      if (isInternational) {
        let commodities: any[];

        if (request.items && request.items.length > 0) {
          commodities = request.items.map(item => {
            const qty = item.quantity || 1;
            const price = parseMoney(item.unitPrice) || 0;
            return {
              description: (item.description || "General Merchandise").substring(0, 450),
              quantity: qty,
              quantityUnits: "PCS",
              unitPrice: {
                amount: price,
                currency: item.currency || requestCurrency,
              },
              customsValue: {
                amount: parseMoney(price * qty),
                currency: item.currency || requestCurrency,
              },
              weight: {
                units: request.packages[0]?.weightUnit || "KG",
                value: request.packages.reduce((sum, pkg) => sum + pkg.weight, 0) / (request.items?.length || 1),
              },
              countryOfManufacture: item.countryOfOrigin || request.shipper.countryCode,
              numberOfPieces: qty,
              harmonizedCode: item.hsCode || undefined,
            };
          });
        } else {
          const totalWeight = request.packages.reduce((sum, pkg) => sum + pkg.weight, 0);
          const weightUnit = request.packages[0]?.weightUnit || "KG";
          const declaredValue = parseMoney(request.declaredValue || 100);
          commodities = [{
            description: (request.commodityDescription || "General Merchandise").substring(0, 450),
            quantity: request.packages.length || 1,
            quantityUnits: "PCS",
            unitPrice: {
              amount: declaredValue,
              currency: requestCurrency,
            },
            customsValue: {
              amount: declaredValue,
              currency: requestCurrency,
            },
            weight: {
              units: weightUnit,
              value: totalWeight,
            },
            countryOfManufacture: request.shipper.countryCode,
            numberOfPieces: request.packages.length || 1,
          }];
        }

        requestedShipment.customsClearanceDetail = {
          dutiesPayment: {
            paymentType: "SENDER",
            payor: {
              responsibleParty: {
                accountNumber: { value: this.accountNumber },
              },
            },
          },
          isDocumentOnly: false,
          commodities,
        };
      }

      const shipRequest = {
        labelResponseOptions: "LABEL",
        accountNumber: { value: this.accountNumber },
        requestedShipment: {
          ...requestedShipment,
          requestedPackageLineItems: request.packages.map((pkg, index) => ({
            sequenceNumber: index + 1,
            weight: {
              value: pkg.weight,
              units: pkg.weightUnit,
            },
            dimensions: pkg.dimensions ? {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              units: pkg.dimensions.unit,
            } : undefined,
          })),
        },
      };

      let lastShipError: any = null;
      const serviceTypesToAttempt = [requestedShipment.serviceType];

      for (const attemptServiceType of serviceTypesToAttempt) {
        shipRequest.requestedShipment.serviceType = attemptServiceType;

        try {
          const { data } = await this.makeRequest<any>("/ship/v1/shipments", "POST", shipRequest, 1);
          const shipmentData = data.output.transactionShipments[0];

          return {
            trackingNumber: shipmentData.masterTrackingNumber,
            carrierTrackingNumber: shipmentData.masterTrackingNumber,
            labelData: shipmentData.pieceResponses[0]?.packageDocuments?.[0]?.encodedLabel,
            estimatedDelivery: shipmentData.completedShipmentDetail?.operationalDetail?.deliveryDate
              ? new Date(shipmentData.completedShipmentDetail.operationalDetail.deliveryDate)
              : undefined,
            serviceType: attemptServiceType,
          };
        } catch (shipErr: any) {
          lastShipError = shipErr;
          const errMsg = shipErr?.message || "";
          const isServiceError = errMsg.includes("INCOUNTRY.SERVICES.NOTALLOWED") || 
            errMsg.includes("SERVICETYPE.NOTSUPPORTED") ||
            errMsg.includes("SERVICE.PACKAGECOMBINATION.INVALID") ||
            errMsg.includes("SELECTED.DESTINATION.SERVICETYPE.INVALID") ||
            errMsg.includes("SERVICETYPE.NOT.ALLOWED") ||
            errMsg.includes("SERVICE.NOTALLOWED") ||
            errMsg.includes("SERVICETYPE.INVALID");
          
          if (isServiceError && serviceTypesToAttempt.length === 1) {
            logInfo(`Ship failed with service=${attemptServiceType}, looking up correct service via availability API`);
            try {
              const saResult = await this.checkServiceAvailability({
                origin: { postalCode: request.shipper.postalCode || "", countryCode: request.shipper.countryCode },
                destination: { postalCode: request.recipient.postalCode || "", countryCode: request.recipient.countryCode },
              });
              for (const svc of saResult.services) {
                if (svc.serviceType !== attemptServiceType) {
                  serviceTypesToAttempt.push(svc.serviceType);
                  const validPkgs = svc.validPackagingTypes || [];
                  if (validPkgs.length > 0 && !validPkgs.includes(shipRequest.requestedShipment.packagingType)) {
                    shipRequest.requestedShipment.packagingType = this.mapPackagingType(validPkgs[0]);
                  }
                }
              }
            } catch (saErr) {
              logInfo("Service availability lookup for ship retry failed", {
                error: saErr instanceof Error ? saErr.message : String(saErr),
              });
            }
            continue;
          }
          if (isServiceError && serviceTypesToAttempt.indexOf(attemptServiceType) < serviceTypesToAttempt.length - 1) {
            continue;
          }
          throw shipErr;
        }
      }
      throw lastShipError || new CarrierError("SHIP_FAILED", "All service type attempts failed");
    } catch (error) {
      logError("FedEx create shipment error", error);
      if (error instanceof CarrierError && this.isConfigured() && this.baseUrl?.includes("sandbox")) {
        logInfo("FedEx sandbox ship API failed, creating sandbox mock shipment with correct service type", {
          serviceType: request.serviceType,
          error: (error as CarrierError).carrierMessage?.substring(0, 200),
        });
        return this.createMockShipment(request);
      }
      if (error instanceof CarrierError) throw error;
      if (this.isConfigured()) {
        throw new CarrierError("CREATE_SHIPMENT_FAILED", (error as Error).message);
      }
      if (!isMockAllowed()) {
        throw new CarrierError("CREATE_SHIPMENT_FAILED", (error as Error).message);
      }
      return this.createMockShipment(request);
    }
  }

  private createMockShipment(request: CreateShipmentRequest): CreateShipmentResponse {
    const trackingNumber = `EZ${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const fedexTrackingNumber = `7489${Math.random().toString().substring(2, 16)}`;
    
    const transitDays = request.serviceType === "FEDEX_PRIORITY_OVERNIGHT" ? 1 
      : request.serviceType === "FEDEX_2_DAY" ? 2
      : request.serviceType === "FEDEX_EXPRESS_SAVER" ? 3 : 5;

    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + transitDays);

    logInfo("Created mock FedEx shipment (FedEx not configured)", { trackingNumber });

    return {
      trackingNumber,
      carrierTrackingNumber: fedexTrackingNumber,
      estimatedDelivery,
      serviceType: request.serviceType,
    };
  }

  // Track creds resolve from the bound FedEx account (Apps tab) first, then fall back to
  // process.env — so they can be deployed either way. (The bound-account scope normally hides
  // process.env, so we read it explicitly here.)
  private get trackClientId(): string | undefined {
    return getIntegrationEnv("FEDEX_TRACK_CLIENT_ID") || getIntegrationEnv("FEDEX_TRACK_API_KEY")
      || process.env.FEDEX_TRACK_CLIENT_ID || process.env.FEDEX_TRACK_API_KEY;
  }
  private get trackClientSecret(): string | undefined {
    return getIntegrationEnv("FEDEX_TRACK_CLIENT_SECRET") || getIntegrationEnv("FEDEX_TRACK_SECRET_KEY")
      || process.env.FEDEX_TRACK_CLIENT_SECRET || process.env.FEDEX_TRACK_SECRET_KEY;
  }
  private get trackBaseUrl(): string {
    return getIntegrationEnv("FEDEX_TRACK_BASE_URL") || process.env.FEDEX_TRACK_BASE_URL || this.baseUrl;
  }
  private get hasDedicatedTrackCreds(): boolean {
    return !!(this.trackClientId && this.trackClientSecret);
  }

  private async getTrackAccessToken(): Promise<string> {
    const fingerprint = `${this.trackClientId}:${this.trackClientSecret}:${this.trackBaseUrl}`;
    if (this.trackAccessToken && Date.now() < this.trackTokenExpiry && this.trackTokenFingerprint === fingerprint) {
      return this.trackAccessToken;
    }
    const res = await fetch(`${this.trackBaseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: this.trackClientId!, client_secret: this.trackClientSecret! }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new CarrierError("AUTH_FAILED", `FedEx tracking auth failed: ${res.status} - ${JSON.stringify(data).slice(0, 200)}`);
    }
    this.trackAccessToken = data.access_token;
    this.trackTokenExpiry = Date.now() + ((Number(data.expires_in) || 3600) - 60) * 1000;
    this.trackTokenFingerprint = fingerprint;
    return this.trackAccessToken!;
  }

  /** POST the track request using dedicated Basic-Integrated-Visibility creds, else fall back. */
  private async trackRequest(body: any): Promise<any> {
    if (!this.hasDedicatedTrackCreds) {
      const { data } = await this.makeRequest<any>("/track/v1/trackingnumbers", "POST", body);
      return data;
    }
    const token = await this.getTrackAccessToken();
    const res = await fetch(`${this.trackBaseUrl}/track/v1/trackingnumbers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-locale": "en_US" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = data?.errors?.[0]?.message || text?.slice(0, 200) || res.statusText;
      throw new CarrierError(`HTTP_${res.status}`, `FedEx tracking error: ${res.status} - ${msg}`);
    }
    return data;
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    // Tracking is usable when either the dedicated track creds OR the Ship/Rate creds exist.
    if (!this.hasDedicatedTrackCreds && !this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.getMockTracking(trackingNumber);
    }

    try {
      const data = await this.trackRequest({
        trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
        includeDetailedScans: true,
      });

      const trackResult = data.output.completeTrackResults[0].trackResults[0];

      return {
        trackingNumber,
        status: trackResult.latestStatusDetail.statusByLocale,
        estimatedDelivery: trackResult.estimatedDeliveryTimeWindow?.window?.begins
          ? new Date(trackResult.estimatedDeliveryTimeWindow.window.begins)
          : undefined,
        actualDelivery: trackResult.actualDeliveryDetail?.actualDeliveryDate
          ? new Date(trackResult.actualDeliveryDetail.actualDeliveryDate)
          : undefined,
        events: (trackResult.scanEvents || []).map((event: any) => ({
          timestamp: new Date(event.date),
          status: event.eventType,
          description: event.eventDescription,
          location: event.scanLocation?.city 
            ? `${event.scanLocation.city}, ${event.scanLocation.stateOrProvinceCode}`
            : undefined,
        })),
      };
    } catch (error) {
      logError("FedEx tracking error", error);
      throw new CarrierError("TRACKING_FAILED", (error as Error).message);
    }
  }

  private getMockTracking(trackingNumber: string): TrackingResponse {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    return {
      trackingNumber,
      status: "In Transit",
      estimatedDelivery: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      events: [
        {
          timestamp: now,
          status: "IN_TRANSIT",
          description: "In transit to destination",
          location: "Memphis, TN",
        },
        {
          timestamp: yesterday,
          status: "DEPARTED_FEDEX_LOCATION",
          description: "Departed FedEx location",
          location: "Indianapolis, IN",
        },
        {
          timestamp: twoDaysAgo,
          status: "PICKED_UP",
          description: "Picked up",
          location: "Origin City",
        },
      ],
    };
  }

  async cancelShipment(trackingNumber: string, senderCountryCode?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      logInfo("Mock FedEx cancellation (not configured)", { trackingNumber });
      return true;
    }

    try {
      await this.makeRequest<any>("/ship/v1/shipments/cancel", "PUT", {
        accountNumber: { value: this.accountNumber },
        senderCountryCode: senderCountryCode || "SA",
        deletionControl: "DELETE_ALL_PACKAGES",
        trackingNumber,
      });

      logInfo("FedEx shipment cancelled", { trackingNumber });
      return true;
    } catch (error) {
      logError("FedEx cancel shipment error", error);
      throw new CarrierError("CANCEL_FAILED", (error as Error).message);
    }
  }

  supportsPickup = true;

  /**
   * Ask FedEx whether a pickup can be served at all for this origin/account/date
   * (POST /pickup/v1/pickups/availabilities) before trying to book one.
   *
   * It returns per-option `available` flags plus cut-off/access times, and its error codes are
   * specific about serviceability (unserviced postal code, no option for the date, …), which the
   * booking call is not.
   *
   * NOTE the account field, which differs from POST /pickups: here it is `associatedAccountNumber`
   * as a bare STRING, not an object. We previously sent `accountNumber: { value }` — not a field
   * in this schema at all — and FedEx silently ignored it, returning a byte-identical option list
   * for the real account and for `000000000`. `serviceType` matters too: the spec marks
   * `shipmentAttributes.serviceType` required for both domestic and international availability.
   *
   * Even so, treat `available: true` as "FedEx serves pickups at this address on this date"
   * rather than proof the booking will be accepted.
   *
   * Returns null when the check itself could not be completed (never blocks a booking on a
   * failure of the diagnostic); returns the reason when FedEx says a pickup is not available.
   */
  private async checkPickupAvailability(
    request: PickupRequest,
  ): Promise<{ available: boolean; reason?: string; option?: FedExPickupOption } | null> {
    const s = request.shipper;
    const body = {
      pickupAddress: {
        streetLines: [s.streetLine1, s.streetLine2].filter(Boolean),
        city: s.city,
        ...(s.stateOrProvince ? { stateOrProvinceCode: s.stateOrProvince } : {}),
        postalCode: s.postalCode || "",
        countryCode: s.countryCode,
        residential: false,
      },
      dispatchDate: request.pickupDate,
      packageReadyTime: `${request.readyTime}:00`,
      customerCloseTime: `${request.closeTime}:00`,
      pickupType: "ON_CALL",
      pickupRequestType: ["FUTURE_DAY"],
      shipmentAttributes: {
        serviceType: request.serviceType || (request.isInternational ? "INTERNATIONAL_PRIORITY" : "FEDEX_EXPRESS_SAVER"),
      },
      carriers: ["FDXE"],
      countryRelationship: request.isInternational ? "INTERNATIONAL" : "DOMESTIC",
      associatedAccountNumber: this.accountNumber,
      associatedAccountNumberType: "FEDEX_EXPRESS",
    };
    try {
      const { data } = await this.makeRequest<any>("/pickup/v1/pickups/availabilities", "POST", body, 1);
      const output = (data as any)?.output ?? data;
      const options: FedExPickupOption[] = Array.isArray(output?.options) ? output.options : [];
      if (options.length === 0) {
        return { available: false, reason: "FedEx reports no pickup options for this origin address and date." };
      }
      const usable = options.filter((o) => o?.available === true);
      if (usable.length > 0) {
        // Prefer the requested date; otherwise the earliest date FedEx will actually serve.
        const match = usable.find((o) => o.pickupDate === request.pickupDate) ?? usable[0];
        return { available: true, option: match };
      }
      const reason = options.map((o) => o?.reason || o?.pickupDate).filter(Boolean).join("; ");
      return {
        available: false,
        reason: reason
          ? `FedEx reports no available pickup slot: ${reason}`
          : "FedEx reports no available pickup slot for this origin address and date.",
      };
    } catch (error) {
      logWarn(
        `FedEx pickup availability check failed (booking will still be attempted): ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Schedule a FedEx courier pickup for an already-booked shipment via the FedEx Pickup API
   * (POST /pickup/v1/pickups). Returns the pickupConfirmationCode. Best-effort: verify against
   * your FedEx account's pickup entitlements before relying on it in production.
   */
  async requestPickup(request: PickupRequest): Promise<PickupResponse> {
    if (!this.isConfigured()) {
      throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured — cannot request a pickup.");
    }
    const s = request.shipper;
    const availability = await this.checkPickupAvailability(request);
    if (availability && !availability.available) {
      throw new CarrierError("PICKUP_UNAVAILABLE", availability.reason || "FedEx pickup is not available for this origin.");
    }
    const slot = fitPickupSlot(request, availability?.option);
    if (slot.adjusted) {
      logInfo(
        `FedEx pickup window adjusted to a slot FedEx publishes for ${s.city} ${s.countryCode}: ` +
        `${request.pickupDate} ${request.readyTime}–${request.closeTime} → ${slot.date} ${slot.readyTime}–${slot.closeTime}`,
      );
    }
    const iso = `${slot.date}T${slot.readyTime}:00${isoOffsetForCountry(s.countryCode, slot.date)}`;
    const unit = request.packages[0]?.weightUnit === "LB" ? "LB" : "KG";
    const totalWeight = request.packages.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
    const body = {
      associatedAccountNumber: { value: this.accountNumber },
      // originDetail is SINGULAR, and it is one of the three required fields on this request
      // (associatedAccountNumber, carrierCode, originDetail). We sent "originDetails" for months:
      // FedEx drops the unknown key, finds the required one missing, and — because their bean
      // validation only covers the other two — falls over behind it with a bare
      // `500 SYSTEM.UNEXPECTED.ERROR: GENERAL FAILURE {FAILURE_CAUSE}`, placeholder unsubstituted.
      // That is why no pickup ever succeeded and why every payload variant failed identically:
      // from FedEx's side each one was a request with no origin at all. Do not "fix" this to the
      // plural again.
      originDetail: {
        pickupLocation: {
          // The Pickup API validates the phone as digits only (≤ 15) — a "+44…" that /ship
          // accepts is rejected here.
          contact: { personName: s.name, phoneNumber: sanitizePickupPhone(s.phone), companyName: s.companyName || s.name },
          address: {
            streetLines: [s.streetLine1, s.streetLine2].filter(Boolean),
            city: s.city,
            // The spec marks stateOrProvinceCode required, but a live booking succeeds without it
            // (confirmation 3069, CN origin), so keep omitting it rather than inventing a value
            // for the many countries that have none.
            stateOrProvinceCode: s.stateOrProvince || undefined,
            postalCode: s.postalCode || "",
            countryCode: s.countryCode,
          },
        },
        readyDateTimestamp: iso,
        customerCloseTime: `${slot.closeTime}:00`,
      },
      totalWeight: { units: unit, value: Math.max(0.1, Math.round(totalWeight * 100) / 100) },
      packageCount: request.packages.length || 1,
      carrierCode: "FDXE",
      countryRelationships: request.isInternational ? "INTERNATIONAL" : "DOMESTIC",
      ...(request.instructions ? { remarks: request.instructions } : {}),
    };
    let data: any;
    try {
      ({ data } = await this.makeRequest<any>("/pickup/v1/pickups", "POST", body, 1));
    } catch (error) {
      // A bare 500 GENERAL FAILURE here means FedEx fell over behind its own validation rather
      // than telling us what to correct — the placeholder is never substituted. Historically this
      // was our own doing (see the originDetail note above); if it reappears, capture the request
      // and the transactionId before assuming anything about the account.
      const message = (error as Error).message || "";
      if (/SYSTEM\.UNEXPECTED\.ERROR|GENERAL FAILURE/i.test(message)) {
        throw new CarrierError(
          "PICKUP_FAILED",
          "FedEx refused the pickup without giving a reason (500 GENERAL FAILURE). The shipment's " +
          "waybill is still valid, so arrange the collection with FedEx directly or drop it off.",
        );
      }
      throw error;
    }
    const output = (data as any)?.output ?? data;
    const confirmationNumber = String(output?.pickupConfirmationCode ?? output?.confirmationCode ?? "").trim();
    if (!confirmationNumber) {
      throw new CarrierError("PICKUP_FAILED", "FedEx pickup booking returned no confirmation code.");
    }
    const locationCode = String(output?.location ?? "").trim() || undefined;
    return { confirmationNumber, locationCode, raw: data };
  }

  async cancelPickup(confirmationNumber: string, request?: Partial<PickupRequest>): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.makeRequest<any>("/pickup/v1/pickups/cancel", "PUT", {
        associatedAccountNumber: { value: this.accountNumber },
        pickupConfirmationCode: confirmationNumber,
        carrierCode: "FDXE",
        ...(request?.pickupDate ? { scheduledDate: request.pickupDate } : {}),
        // FedEx Express cannot cancel without the station code that create returned, so a pickup
        // booked before we started storing it is only cancellable by phone.
        ...(request?.locationCode ? { location: request.locationCode } : {}),
        ...(request?.instructions ? { remarks: request.instructions } : {}),
      }, 1);
      return true;
    } catch (error) {
      logError(`FedEx: cancel pickup failed for ${confirmationNumber}`, error);
      return false;
    }
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return true;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("base64");

    try {
      const sigBuf = Buffer.from(signature, "base64");
      const expectedBuf = Buffer.from(expectedSignature, "base64");
      if (sigBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  }
}

// ISO offset ("+02:00") for a country on a given date, for FedEx's readyDateTimestamp.
/** FedEx pickup contacts take digits only, max 15. */
function sanitizePickupPhone(phone?: string): string {
  return (phone || "").replace(/\D/g, "").slice(0, 15);
}

/** One entry of the FedEx pickup-availability response (`output.options[]`). */
interface FedExPickupOption {
  carrier?: string;
  available?: boolean;
  pickupDate?: string;
  cutOffTime?: string;
  /** Minimum span the courier needs between ready time and close time. */
  accessTime?: { hours?: number; minutes?: number };
  readyTimeOptions?: string[];
  defaultReadyTime?: string;
  latestTimeOptions?: string[];
  defaultLatestTimeOptions?: string;
  reason?: string;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** "HH:MM:SS" or "HH:MM" → "HH:MM". */
function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

/**
 * Snap a requested pickup window onto one FedEx actually publishes for this origin.
 *
 * Each availability option carries `readyTimeOptions` / `latestTimeOptions` (the slots the local
 * station serves) and an `accessTime` — the minimum ready→close span the courier needs, which
 * varies by origin: 4h for Newport GB, 1h for Jeddah SA. A window narrower than accessTime, or a
 * time off the published grid, is not refused with a validation error — POST /pickups answers
 * `500 GENERAL FAILURE`, which is why this has to be fixed before booking rather than after.
 *
 * Without an availability option (the check failed), the request is passed through untouched.
 */
function fitPickupSlot(
  request: PickupRequest,
  option?: FedExPickupOption,
): { date: string; readyTime: string; closeTime: string; adjusted: boolean } {
  const asIs = {
    date: request.pickupDate,
    readyTime: request.readyTime,
    closeTime: request.closeTime,
    adjusted: false,
  };
  if (!option) return asIs;

  const date = option.pickupDate || request.pickupDate;
  const readySlots = (option.readyTimeOptions || []).map(toHourMinute).sort();
  const latestSlots = (option.latestTimeOptions || []).map(toHourMinute).sort();
  const accessMinutes = (option.accessTime?.hours ?? 0) * 60 + (option.accessTime?.minutes ?? 0);

  // Earliest published ready slot at or after the requested time.
  const requestedReady = timeToMinutes(request.readyTime);
  const readyTime =
    readySlots.find((slot) => timeToMinutes(slot) >= requestedReady) ??
    (option.defaultReadyTime ? toHourMinute(option.defaultReadyTime) : undefined) ??
    readySlots[0] ??
    request.readyTime;

  // Close no earlier than ready + accessTime, and no earlier than what was asked for.
  const minClose = Math.max(timeToMinutes(readyTime) + accessMinutes, timeToMinutes(request.closeTime));
  const closeTime =
    latestSlots.find((slot) => timeToMinutes(slot) >= minClose) ??
    (option.defaultLatestTimeOptions ? toHourMinute(option.defaultLatestTimeOptions) : undefined) ??
    latestSlots[latestSlots.length - 1] ??
    request.closeTime;

  return {
    date,
    readyTime,
    closeTime,
    adjusted:
      date !== request.pickupDate ||
      readyTime !== request.readyTime ||
      closeTime !== request.closeTime,
  };
}

function isoOffsetForCountry(countryCode: string, dateISO: string): string {
  const tz = countryTimeZone(countryCode);
  try {
    const date = new Date(`${dateISO}T12:00:00Z`);
    const name =
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
        .formatToParts(date)
        .find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
    const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return "+00:00";
    return `${m[1]}${m[2].padStart(2, "0")}:${(m[3] || "00").padStart(2, "0")}`;
  } catch {
    return "+00:00";
  }
}

export const fedexAdapter = new FedExAdapter();

export class CarrierService {
  private adapters: Map<string, CarrierAdapter> = new Map();

  constructor() {
    this.registerAdapter(fedexAdapter);
  }

  registerAdapter(adapter: CarrierAdapter): void {
    this.adapters.set(adapter.carrierCode.toUpperCase(), adapter);
    const configured = adapter.isConfigured();
    logInfo(`Registered carrier adapter: ${adapter.name} (${adapter.carrierCode}) - configured: ${configured}`);
  }

  getAdapter(carrierCode: string): CarrierAdapter {
    const adapter = this.adapters.get(carrierCode.toUpperCase());
    if (!adapter) {
      throw new Error(`Carrier not supported: ${carrierCode}`);
    }
    return adapter;
  }

  getSupportedCarriers(): string[] {
    return Array.from(this.adapters.keys());
  }

  getDefaultAdapter(): CarrierAdapter {
    return fedexAdapter;
  }
}

export const carrierService = new CarrierService();

export function getCarrierAdapter(carrierName: string): CarrierAdapter {
  return carrierService.getAdapter(carrierName);
}
