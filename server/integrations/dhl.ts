import "../load-env";
import crypto from "crypto";
import { calculateChargeableWeight, convertWeight, type ChargeableWeightSummary } from "@shared/chargeable-weight";
import { countryTimeZone } from "@shared/country-timezones";
import {
  CarrierError,
  parseMoney,
  type AddressValidationRequest,
  type AddressValidationResponse,
  type CarrierAdapter,
  type CreateShipmentRequest,
  type CreateShipmentResponse,
  type PostalCodeValidationRequest,
  type PostalCodeValidationResponse,
  type RateRequest,
  type RateResponse,
  type ServiceAvailabilityRequest,
  type ServiceAvailabilityResponse,
  type TrackingEvent,
  type TrackingResponse,
  type ShippingAddress,
  type ShipmentItem,
  type PickupRequest,
  type PickupResponse,
} from "./fedex";
import { logError, logInfo } from "../services/logger";
import { storage } from "../storage";
import { getIntegrationEnv, getIntegrationEnvBoolean } from "../services/integration-runtime";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const DEFAULT_PLANNED_SHIPPING_HOUR_UTC = 9;
const MAX_COMMODITY_DESCRIPTION_LENGTH = 70;
const MAX_DECLARED_VALUE = 999_999_999_999_999;
const MAX_REASONABLE_LINE_ITEM_QUANTITY = 1_000_000;
const MAX_REASONABLE_LINE_ITEM_PRICE = 10_000_000;
const COUNTRY_REGEX: Record<string, RegExp> = {
  SA: /^\d{5}$/,
  US: /^\d{5}(-\d{4})?$/,
  AE: /^\d{5,6}$/,
};
const FRIDAY_SATURDAY_WEEKEND_COUNTRIES = new Set([
  "BH",
  "EG",
  "JO",
  "KW",
  "OM",
  "QA",
  "SA",
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isMockAllowed(): boolean {
  if (getIntegrationEnvBoolean("DHL_MOCK_MODE")) return true;
  return !isProduction();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

function containsAlphabeticCharacter(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function normalizeItemDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyNonCommodityDescription(value: string): boolean {
  const normalizedValue = normalizeItemDescription(value);

  if (!normalizedValue || !containsAlphabeticCharacter(normalizedValue)) {
    return true;
  }

  if (/^\+?\d[\d\s()-]{6,}$/.test(normalizedValue)) {
    return true;
  }

  if (/\b[A-Z][A-Za-z.' -]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(normalizedValue)) {
    return true;
  }

  if (/\b(net payment|amount due|grand total|subtotal|sub total|balance due)\b/i.test(normalizedValue)) {
    return true;
  }

  if (
    normalizedValue.includes(",") &&
    /\b(street|road|drive|avenue|suite|district|city|state|postal|zip)\b/i.test(normalizedValue)
  ) {
    return true;
  }

  return false;
}

function getWeekendDays(countryCode?: string): number[] {
  const normalizedCountryCode = countryCode ? normalizeCountryCode(countryCode) : "";
  return FRIDAY_SATURDAY_WEEKEND_COUNTRIES.has(normalizedCountryCode) ? [5, 6] : [0, 6];
}

function alignToBusinessShippingHour(date: Date): void {
  date.setUTCHours(DEFAULT_PLANNED_SHIPPING_HOUR_UTC, 0, 0, 0);
}

function advanceToBusinessDay(date: Date, countryCode?: string): void {
  const weekendDays = getWeekendDays(countryCode);
  while (weekendDays.includes(date.getUTCDay())) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
}

function buildDefaultPlannedShippingDate(countryCode?: string): string {
  const plannedDate = new Date();
  plannedDate.setUTCDate(plannedDate.getUTCDate() + 1);
  alignToBusinessShippingHour(plannedDate);
  advanceToBusinessDay(plannedDate, countryCode);
  return plannedDate.toISOString();
}

function normalizePlannedShippingDate(shipDate?: string, shipperCountryCode?: string): string {
  if (shipDate) {
    const parsed = new Date(shipDate);
    if (!Number.isNaN(parsed.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(shipDate.trim())) {
        alignToBusinessShippingHour(parsed);
        advanceToBusinessDay(parsed, shipperCountryCode);
      }
      return parsed.toISOString();
    }
  }
  return buildDefaultPlannedShippingDate(shipperCountryCode);
}

function formatDhlShipmentDateTime(dateIsoString: string): string {
  const date = new Date(dateIsoString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds} GMT+00:00`;
}

function parseEstimatedDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function parseTrackingTimestamp(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return undefined;
}

function toMetricOrImperial(weightUnit?: "LB" | "KG"): "metric" | "imperial" {
  return weightUnit === "LB" ? "imperial" : "metric";
}

function buildPostalAddress(address: ShippingAddress) {
  const postalAddress: Record<string, string> = {
    cityName: address.city,
    countryCode: normalizeCountryCode(address.countryCode),
    addressLine1: address.streetLine1,
  };

  if (address.postalCode) {
    postalAddress.postalCode = address.postalCode;
  }
  if (address.streetLine2) {
    postalAddress.addressLine2 = address.streetLine2;
  }
  if (address.streetLine3) {
    postalAddress.addressLine3 = address.streetLine3;
  }
  if (address.stateOrProvince) {
    postalAddress.countyName = address.stateOrProvince;
  }

  return postalAddress;
}

function buildPartyDetails(address: ShippingAddress, compact: boolean = false) {
  if (compact) {
    return {
      postalCode: address.postalCode || "",
      cityName: address.city,
      countryCode: normalizeCountryCode(address.countryCode),
      addressLine1: address.streetLine1,
      ...(address.streetLine2 ? { addressLine2: address.streetLine2 } : {}),
      ...(address.streetLine3 ? { addressLine3: address.streetLine3 } : {}),
      ...(address.stateOrProvince ? { countyName: address.stateOrProvince } : {}),
    };
  }

  return {
    postalAddress: buildPostalAddress(address),
    contactInformation: {
      phone: address.phone,
      companyName: address.name,
      fullName: address.name,
      ...(address.email ? { email: address.email } : {}),
    },
  };
}

// DHL requires either a package dimensions block (each side ≥ 0.001) OR a package typeCode —
// a package with zero/absent dimensions is rejected (422 "not greater or equal to 0.001",
// or 400 "Either typeCode or dimensions must be provided"). When a caller supplies no valid
// dimensions (e.g. the address-less Quick Quote), fall back to a small nominal parcel so the
// rate returns; the volumetric weight it implies is negligible against any real actual weight.
const DHL_NOMINAL_DIMENSIONS = { length: 10, width: 10, height: 10 };

function buildPackages(request: RateRequest | CreateShipmentRequest) {
  return request.packages.map((pkg) => {
    const d = pkg.dimensions;
    const hasDims = d && Number(d.length) > 0 && Number(d.width) > 0 && Number(d.height) > 0;
    return {
      weight: pkg.weight,
      dimensions: hasDims
        ? { length: d!.length, width: d!.width, height: d!.height }
        : { ...DHL_NOMINAL_DIMENSIONS },
    };
  });
}

function buildRateChargeableWeightSummary(request: RateRequest | CreateShipmentRequest) {
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
    "DHL",
  );
}

function defaultProductCode(request: RateRequest | CreateShipmentRequest): string {
  const isInternational = normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
  return isInternational ? "P" : "N";
}

function sanitizeShipmentItems(items?: ShipmentItem[]): ShipmentItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  return items
    .map<ShipmentItem | null>((item) => {
      const description = normalizeItemDescription(item.description || "");
      const quantity = Math.max(1, Math.round(Number(item.quantity || 0)));
      const unitPrice = Number(item.unitPrice || 0);

      if (
        !description ||
        !Number.isFinite(quantity) ||
        !Number.isFinite(unitPrice) ||
        quantity <= 0 ||
        unitPrice <= 0 ||
        quantity > MAX_REASONABLE_LINE_ITEM_QUANTITY ||
        unitPrice > MAX_REASONABLE_LINE_ITEM_PRICE ||
        isLikelyNonCommodityDescription(description)
      ) {
        return null;
      }

      const normalizedItem: ShipmentItem = {
        ...item,
        description,
        quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        currency: item.currency?.trim() || "SAR",
      };

      if (item.hsCode?.trim()) {
        normalizedItem.hsCode = item.hsCode.trim();
      }

      if (item.countryOfOrigin?.trim()) {
        normalizedItem.countryOfOrigin = item.countryOfOrigin.trim();
      }

      return normalizedItem;
    })
    .filter((item): item is ShipmentItem => item !== null);
}

function buildDeclaredValue(items?: ShipmentItem[]): number | undefined {
  const sanitizedItems = sanitizeShipmentItems(items);
  if (sanitizedItems.length === 0) {
    return undefined;
  }

  const total = sanitizedItems.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );

  if (!Number.isFinite(total) || total <= 0) {
    return undefined;
  }

  return Math.min(total, MAX_DECLARED_VALUE);
}

// DHL's Shipment Request API validation now rejects quoted (string) values for
// content.declaredValue — it must be a numeric value. Clamp to the allowed range and
// round to 2 decimals, returning a number (never a string).
function normalizeDeclaredValue(value: number): number {
  const normalizedValue = Math.min(MAX_DECLARED_VALUE, Math.max(0, value));
  return Number.isInteger(normalizedValue)
    ? normalizedValue
    : Math.round(normalizedValue * 100) / 100;
}

function buildCommodityDescription(request: CreateShipmentRequest, items?: ShipmentItem[]): string {
  const sanitizedItems = sanitizeShipmentItems(items ?? request.items);
  if (sanitizedItems.length > 0) {
    return sanitizedItems
      .map((item) => item.description)
      .join(", ")
      .slice(0, MAX_COMMODITY_DESCRIPTION_LENGTH);
  }

  if (request.commodityDescription?.trim()) {
    return request.commodityDescription.trim().slice(0, MAX_COMMODITY_DESCRIPTION_LENGTH);
  }

  return "General cargo";
}

function buildLineItemWeight(totalWeight: number, totalQuantity: number, itemQuantity: number): number {
  if (totalWeight <= 0 || totalQuantity <= 0 || itemQuantity <= 0) {
    return 0.1;
  }

  return Math.max(0.1, Number(((totalWeight / totalQuantity) * itemQuantity).toFixed(3)));
}

function buildLineItemWeightValues(totalWeight: number, totalQuantity: number, itemQuantity: number): {
  netValue: number;
  grossValue: number;
} {
  const grossValue = buildLineItemWeight(totalWeight, totalQuantity, itemQuantity);
  const reduction = Math.min(0.01, Math.max(0.001, Number((grossValue * 0.05).toFixed(3))));
  const netValue = Number(Math.max(0.001, grossValue - reduction).toFixed(3));

  if (grossValue > netValue) {
    return { netValue, grossValue };
  }

  return {
    netValue: Number(Math.max(0.001, grossValue - 0.001).toFixed(3)),
    grossValue,
  };
}

function buildExportDeclaration(request: CreateShipmentRequest, items?: ShipmentItem[]) {
  const sanitizedItems = sanitizeShipmentItems(items ?? request.items);
  if (sanitizedItems.length === 0) {
    return undefined;
  }

  const totalWeight = request.packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0);
  const totalQuantity = sanitizedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const invoiceDate =
    request.commercialInvoiceDate ||
    normalizePlannedShippingDate(request.shipDate, request.shipper.countryCode).split("T")[0];
  const invoiceNumber = request.commercialInvoiceNumber || `EZH-${Date.now()}`;
  const declaredValue = buildDeclaredValue(sanitizedItems) ?? 0;
  const currency = request.currency || "SAR";
  const lineItemWeights = sanitizedItems.map((item) =>
    buildLineItemWeightValues(totalWeight, totalQuantity, Number(item.quantity || 0)),
  );
  const totalNetWeight = Number(
    lineItemWeights.reduce((sum, item) => sum + item.netValue, 0).toFixed(3),
  );
  const totalGrossWeight = Number(
    lineItemWeights.reduce((sum, item) => sum + item.grossValue, 0).toFixed(3),
  );

  return {
    lineItems: sanitizedItems.map((item, index) => {
      const lineItemWeight = lineItemWeights[index] || { netValue: 0.099, grossValue: 0.1 };
      const commodityCodes = item.hsCode
        ? [
            { value: item.hsCode, typeCode: "outbound" },
            { value: item.hsCode, typeCode: "inbound" },
          ]
        : undefined;

      return {
        number: index + 1,
        ...(commodityCodes ? { commodityCodes } : {}),
        description: item.description.slice(0, MAX_COMMODITY_DESCRIPTION_LENGTH),
        price: Number(item.unitPrice || 0),
        priceCurrency: item.currency || currency,
        quantity: {
          unitOfMeasurement: "PCS",
          value: Number(item.quantity || 1),
        },
        weight: {
          netValue: lineItemWeight.netValue,
          grossValue: lineItemWeight.grossValue,
        },
        manufacturerCountry: item.countryOfOrigin || request.shipper.countryCode,
        exportReasonType: "permanent",
      };
    }),
    invoice: {
      number: invoiceNumber,
      date: invoiceDate,
      totalNetWeight: totalNetWeight > 0 ? totalNetWeight : undefined,
      totalGrossWeight: totalGrossWeight > 0 ? totalGrossWeight : undefined,
      customerReferences: [{ value: invoiceNumber, typeCode: "CU" }],
    },
    ...(declaredValue > 0
      ? {
          exportReason: "SALE",
          placeOfIncoterm: request.recipient.city,
        }
      : {}),
  };
}

// DHL Express rating returns the carrier's own chargeable weight per product under
// `product.weight` — `provided` (actual) vs `volumetric` (dimensional); the chargeable weight
// is the greater of the two. Prefer it over our dimensional estimate so extra-weight billing at
// checkout matches what DHL actually charges. Returns undefined if the field is absent.
function extractDhlBillingWeight(product: any): { value: number; unit: "KG" | "LB" } | undefined {
  const w = product?.weight;
  if (!w) return undefined;
  const unit: "KG" | "LB" = String(w.unitOfMeasurement || "").toLowerCase().includes("imperial") ? "LB" : "KG";
  const candidates = [Number(w.provided), Number(w.volumetric)].filter((v) => Number.isFinite(v) && v > 0);
  if (candidates.length === 0) return undefined;
  return { value: Math.max(...candidates), unit };
}

// Override the summary's chargeable weight with the carrier's billed weight (mirrors FedEx).
function applyDhlCarrierWeight(
  summary: ChargeableWeightSummary,
  billing?: { value: number; unit: "KG" | "LB" },
): ChargeableWeightSummary {
  if (!billing) return summary;
  return {
    ...summary,
    chargeableWeight: Number(convertWeight(billing.value, billing.unit, summary.weightUnit).toFixed(3)),
    chargeableWeightKg: Number(convertWeight(billing.value, billing.unit, "KG").toFixed(3)),
  };
}

function extractDhlRates(data: any, request: RateRequest): RateResponse[] {
  const products = Array.isArray(data?.products)
    ? data.products
    : Array.isArray(data?.product)
      ? data.product
      : [];
  const chargeableWeightDetails = buildRateChargeableWeightSummary(request);

  const mappedRates = products
    .map((product: any) => {
      const serviceType = product.productCode || product.localProductCode || product.serviceCode;
      if (!serviceType) {
        return null;
      }

      const prices = Array.isArray(product.totalPrice) ? product.totalPrice : [];
      const preferredPrice =
        prices.find((entry: any) => String(entry.currencyType || "").toUpperCase() === "BILLC") ||
        prices[0];
      const baseRate = parseMoney(preferredPrice?.price ?? product.totalNet?.price ?? product.estimatedPrice);

      if (!Number.isFinite(baseRate)) {
        return null;
      }

      // Prefer DHL's own chargeable weight for this product; fall back to our estimate.
      const carrierBilling = extractDhlBillingWeight(product);
      const details = applyDhlCarrierWeight(chargeableWeightDetails, carrierBilling);

      const estimatedDelivery =
        parseEstimatedDate(product.deliveryCapabilities?.estimatedDeliveryDateAndTime) ||
        parseEstimatedDate(product.deliveryCapabilities?.deliveryDateAndTime) ||
        parseEstimatedDate(product.deliveryCapabilities?.deliveryTime) ||
        parseEstimatedDate(product.deliveryDateAndTime) ||
        parseEstimatedDate(product.estimatedDeliveryDateAndTime);
      const transitDays = Number(
        product.deliveryCapabilities?.totalTransitDays ??
          product.totalTransitDays ??
          product.pickupCapabilities?.totalTransitDays ??
          3,
      );

      return {
        baseRate,
        currency: preferredPrice?.priceCurrency || request.currency || "SAR",
        serviceType,
        transitDays: Number.isFinite(transitDays) && transitDays > 0 ? transitDays : 3,
        deliveryDate: estimatedDelivery,
        serviceName:
          product.productName ||
          product.localProductName ||
          product.localProductCode ||
          serviceType,
        packagingType: request.packagingType,
        actualWeight: details.actualWeight,
        dimensionalWeight: details.dimensionalWeight,
        chargeableWeight: details.chargeableWeight,
        chargeableWeightUnit: details.weightUnit,
        chargeableWeightSource: carrierBilling ? "carrier" : "system",
        chargeableWeightDetails: details,
      } satisfies RateResponse;
    })
    .filter((rate: RateResponse | null): rate is RateResponse => {
      if (!rate) {
        return false;
      }
      // Never surface a zero/invalid-priced service — unprofessional and unbookable.
      if (!(Number.isFinite(rate.baseRate) && rate.baseRate > 0)) {
        return false;
      }
      // Hide DHL "Medical Express" — not offered to clients.
      const label = `${rate.serviceName || ""} ${rate.serviceType || ""}`.toLowerCase();
      if (label.includes("medical")) {
        return false;
      }
      return !request.serviceType || rate.serviceType === request.serviceType;
    });

  // DHL can return the same product more than once — collapse duplicates by service, keeping the
  // cheapest, so the rates page never shows two identical service levels.
  const cheapestByService = new Map<string, RateResponse>();
  for (const rate of mappedRates) {
    const existing = cheapestByService.get(rate.serviceType);
    if (!existing || rate.baseRate < existing.baseRate) {
      cheapestByService.set(rate.serviceType, rate);
    }
  }
  return Array.from(cheapestByService.values());
}

function extractLabelDocument(documents: any[]): { labelData?: string } {
  const labelDocument = documents.find((document) =>
    ["waybilldoc", "label", "labeldoc"].includes(String(document?.typeCode || "").toLowerCase()),
  );

  if (!labelDocument?.content) {
    return {};
  }

  return { labelData: labelDocument.content };
}

function extractCreateShipmentResponse(data: any, request: CreateShipmentRequest): CreateShipmentResponse {
  const trackingNumber =
    data?.shipmentTrackingNumber ||
    data?.trackingNumber ||
    data?.packages?.[0]?.trackingNumber ||
    data?.packages?.[0]?.shipmentTrackingNumber;

  if (!trackingNumber) {
    throw new CarrierError("SHIPMENT_CREATE_FAILED", "DHL did not return a tracking number");
  }

  const documents = [
    ...(Array.isArray(data?.documents) ? data.documents : []),
    ...(Array.isArray(data?.packages?.[0]?.documents) ? data.packages[0].documents : []),
  ];
  const { labelData } = extractLabelDocument(documents);

  return {
    trackingNumber,
    carrierTrackingNumber: trackingNumber,
    labelData,
    serviceType: request.serviceType,
    estimatedDelivery:
      parseEstimatedDate(data?.estimatedDeliveryDateAndTime) ||
      parseEstimatedDate(data?.deliveryCapabilities?.estimatedDeliveryDateAndTime),
  };
}

// Human-readable milestone text for DHL Express event typeCodes. The keyword strings are chosen
// so mapCarrierTrackingStatusToShipmentStatus() maps them to the right internal status.
// "RR" (Response Received) is an electronic-data ping, NOT a physical scan — treated as noise.
const DHL_EVENT_TYPECODE_LABELS: Record<string, string> = {
  PU: "Shipment picked up",
  PL: "Processed at location",
  DF: "Departed facility",
  DD: "Departed facility",
  AF: "Arrived at facility",
  AR: "Arrived at facility",
  PD: "In transit",
  BR: "In transit",
  SF: "In transit",
  CC: "Customs clearance processing",
  CR: "Customs status updated",
  CI: "Customs clearance processing",
  WC: "With delivery courier",
  OD: "Out for delivery",
  OK: "Delivered",
  DL: "Delivered",
};

// Event typeCodes that are electronic-data acknowledgements, not real shipment movement.
const DHL_NOISE_TYPECODES = new Set(["RR", "PY"]);

function isMeaningfulDhlEvent(event: { status?: string; description?: string }): boolean {
  const code = String(event?.status || "").toUpperCase();
  if (DHL_NOISE_TYPECODES.has(code)) return false;
  if (/response received/i.test(event?.description || "")) return false;
  return true;
}

function extractTrackingResponse(trackingNumber: string, data: any): TrackingResponse {
  const shipments = Array.isArray(data?.shipments) ? data.shipments : [];
  const shipment = shipments[0] || data;
  const checkpoints = Array.isArray(shipment?.events)
    ? shipment.events
    : Array.isArray(shipment?.checkpoints)
      ? shipment.checkpoints
      : Array.isArray(shipment?.shipmentDetails?.events)
        ? shipment.shipmentDetails.events
        : [];

  const events: TrackingEvent[] = checkpoints
    .map((event: any) => {
      const timestamp =
        parseTrackingTimestamp(event?.timestamp) ||
        parseTrackingTimestamp(event?.dateTime) ||
        // DHL Express splits the scan into separate date + time fields.
        parseTrackingTimestamp(event?.date && event?.time ? `${event.date}T${event.time}` : event?.date);

      if (!timestamp) {
        return null;
      }

      // DHL events carry a `typeCode` (PU/AF/OK/…) — NOT a `status` field. Use it as the event
      // status, and never fall back to the envelope's `shipment.status` ("Success").
      const typeCode = String(event?.typeCode || event?.statusCode || "").toUpperCase();
      const description =
        event?.description ||
        event?.statusDescription ||
        DHL_EVENT_TYPECODE_LABELS[typeCode] ||
        (typeCode ? `DHL update (${typeCode})` : "DHL shipment event");

      return {
        timestamp,
        status: typeCode || event?.status || "UPDATE",
        description,
        location:
          (Array.isArray(event?.serviceArea) ? event.serviceArea[0]?.description : event?.serviceArea?.description) ||
          event?.location?.address?.addressLocality ||
          event?.location?.address?.addressRegion,
      } satisfies TrackingEvent;
    })
    .filter((event: TrackingEvent | null): event is TrackingEvent => Boolean(event))
    .sort((a: TrackingEvent, b: TrackingEvent) => b.timestamp.getTime() - a.timestamp.getTime());

  const estimatedDelivery =
    parseEstimatedDate(shipment?.estimatedDeliveryDateAndTime) ||
    parseEstimatedDate(shipment?.estimatedDelivery) ||
    parseEstimatedDate(shipment?.estimatedDeliveryDate);
  const actualDelivery =
    parseEstimatedDate(shipment?.actualDeliveryDateAndTime) ||
    parseEstimatedDate(shipment?.actualDelivery);

  // Derive the shipment status from the latest MEANINGFUL milestone (ignore "Response Received"
  // pings). Never use shipment.status — it is the API-call result ("Success"), not a milestone.
  const latestMeaningful = events.find(isMeaningfulDhlEvent);
  const status =
    latestMeaningful?.description ||
    // Only electronic acknowledgements so far → still pre-transit; report a neutral label that
    // maps to "created" upstream rather than the bogus "Success".
    (events.length > 0 ? "Shipment information received" : "Pending");

  return {
    trackingNumber,
    status,
    estimatedDelivery,
    actualDelivery,
    events,
  };
}

export class DhlAdapter implements CarrierAdapter {
  name = "DHL";
  carrierCode = "DHL";

  private get apiKey(): string | undefined {
    return getIntegrationEnv("DHL_API_KEY");
  }

  private get apiSecret(): string | undefined {
    return getIntegrationEnv("DHL_API_SECRET");
  }

  private get accountNumber(): string | undefined {
    return getIntegrationEnv("DHL_ACCOUNT_NUMBER");
  }

  private get baseUrl(): string {
    const configuredBaseUrl = getIntegrationEnv("DHL_BASE_URL");
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/, "");
    }

    return isProduction()
      ? "https://express.api.dhl.com/mydhlapi"
      : "https://express.api.dhl.com/mydhlapi/test";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret && this.accountNumber);
  }

  private async logIntegration(
    endpoint: string,
    method: string,
    requestBody: any,
    responseBody: any,
    statusCode: number,
    duration: number,
    success: boolean,
  ): Promise<void> {
    try {
      await storage.createIntegrationLog({
        serviceName: "dhl",
        operation: `${method} ${endpoint}`,
        requestPayload: JSON.stringify(requestBody ?? {}),
        responsePayload: JSON.stringify(isProduction() && !success ? { error: responseBody?.error } : responseBody ?? {}),
        statusCode,
        duration,
        success,
      });
    } catch (error) {
      logError("Failed to log DHL integration", error);
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    method: string,
    body?: any,
    retries: number = MAX_RETRIES,
  ): Promise<{ data: T; statusCode: number }> {
    if (!this.isConfigured()) {
      throw new CarrierError("NOT_CONFIGURED", "DHL is not configured");
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method,
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64")}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "Message-Reference": crypto.randomUUID(),
            "Message-Reference-Date": new Date().toISOString(),
            "Plugin-Name": "Ezhalha Logistics",
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const duration = Date.now() - startTime;
        const responseText = await response.text();
        let parsedResponse: any = {};
        if (responseText) {
          try {
            parsedResponse = JSON.parse(responseText);
          } catch {
            parsedResponse = { raw: responseText };
          }
        }

        await this.logIntegration(
          endpoint,
          method,
          body,
          parsedResponse,
          response.status,
          duration,
          response.ok,
        );

        if (!response.ok) {
          const message =
            parsedResponse?.detail ||
            parsedResponse?.message ||
            parsedResponse?.title ||
            JSON.stringify(parsedResponse);
          const error = new CarrierError(
            "DHL_API_ERROR",
            `DHL API error: ${response.status}${message ? ` - ${message}` : ""}`,
          );
          if (response.status >= 500 && attempt < retries) {
            lastError = error;
            await delay(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw error;
        }

        return { data: parsedResponse as T, statusCode: response.status };
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries && !(error instanceof CarrierError)) {
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }
        break;
      }
    }

    throw lastError || new CarrierError("DHL_API_ERROR", "DHL request failed");
  }

  async validateAddress(request: AddressValidationRequest): Promise<AddressValidationResponse> {
    const countryCode = normalizeCountryCode(request.address.countryCode);
    const resolvedAddress = {
      streetLines: [request.address.streetLine1, request.address.streetLine2].filter(Boolean) as string[],
      city: request.address.city || "",
      stateOrProvince: request.address.stateOrProvince || "",
      postalCode: request.address.postalCode || "",
      countryCode,
      residential: false,
    };

    const valid =
      Boolean(request.address.streetLine1?.trim()) &&
      Boolean(countryCode) &&
      Boolean(request.address.city?.trim());

    return {
      valid,
      resolvedAddresses: valid ? [resolvedAddress] : [],
      messages: valid ? ["Basic DHL validation passed"] : ["Street, city, and country are required"],
    };
  }

  async validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse> {
    const countryCode = normalizeCountryCode(request.countryCode);
    const regex = COUNTRY_REGEX[countryCode];
    const valid = regex ? regex.test(request.postalCode) : request.postalCode.trim().length >= 3;

    return {
      valid,
      locationDescription: valid ? "Accepted format" : "Postal code format could not be validated",
      stateOrProvince: request.stateOrProvince,
      countryCode,
          source: "heuristic",
    };
  }

  async checkServiceAvailability(request: ServiceAvailabilityRequest): Promise<ServiceAvailabilityResponse> {
    const rates = await this.getRates({
      shipper: {
        name: "Origin",
        streetLine1: "N/A",
        city: request.origin.postalCode || "Origin",
        stateOrProvince: request.origin.stateOrProvince,
        postalCode: request.origin.postalCode,
        countryCode: request.origin.countryCode,
        phone: "0000000000",
      },
      recipient: {
        name: "Destination",
        streetLine1: "N/A",
        city: request.destination.postalCode || "Destination",
        stateOrProvince: request.destination.stateOrProvince,
        postalCode: request.destination.postalCode,
        countryCode: request.destination.countryCode,
        phone: "0000000000",
      },
      packages: [
        {
          weight: 1,
          weightUnit: "KG",
          packageType: "YOUR_PACKAGING",
        },
      ],
      currency: "SAR",
    });

    return {
      services: rates.map((rate) => ({
        serviceType: rate.serviceType,
        serviceName: rate.serviceName,
        displayName: rate.serviceName,
        available: true,
        isInternational:
          normalizeCountryCode(request.origin.countryCode) !== normalizeCountryCode(request.destination.countryCode),
        transitDays: rate.transitDays,
        deliveryDate: rate.deliveryDate?.toISOString(),
        validPackagingTypes: rate.packagingType ? [rate.packagingType] : undefined,
      })),
    };
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "DHL is not configured and mock mode is disabled in production");
      }

      logInfo("Using mock DHL rates (DHL not configured)");
      return this.getMockRates(request);
    }

    try {
      const declaredValue =
        request.currency && request.packages.length > 0
          ? Math.max(1, request.packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0))
          : 1;
      const payload: Record<string, any> = {
        customerDetails: {
          shipperDetails: buildPartyDetails(request.shipper, true),
          receiverDetails: buildPartyDetails(request.recipient, true),
        },
        accounts: [{ typeCode: "shipper", number: this.accountNumber }],
        plannedShippingDateAndTime: normalizePlannedShippingDate(
          request.shipDate,
          request.shipper.countryCode,
        ),
        unitOfMeasurement: toMetricOrImperial(request.packages[0]?.weightUnit),
        isCustomsDeclarable:
          normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode),
        requestAllValueAddedServices: false,
        returnStandardProductsOnly: false,
        nextBusinessDay: false,
        packages: buildPackages(request),
      };

      if (request.currency) {
        payload.monetaryAmount = [
          {
            typeCode: "declaredValue",
            value: declaredValue,
            currency: request.currency,
          },
        ];
      }

      const { data } = await this.makeRequest<any>("/rates", "POST", payload);
      const rates = extractDhlRates(data, request);
      if (rates.length === 0) {
        throw new CarrierError("RATE_FAILED", "DHL did not return any rates for this shipment");
      }
      return rates;
    } catch (error) {
      logError("DHL rate request failed", error);
      if (!isMockAllowed() || error instanceof CarrierError) {
        throw error instanceof CarrierError
          ? error
          : new CarrierError("RATE_FAILED", (error as Error).message || "DHL rate request failed");
      }
      return this.getMockRates(request);
    }
  }

  private getMockRates(request: RateRequest): RateResponse[] {
    const chargeableWeightDetails = buildRateChargeableWeightSummary(request);
    const totalWeight = chargeableWeightDetails.chargeableWeight;
    const isInternational =
      normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
    const currency = request.currency || "SAR";

    const rates = isInternational
      ? [
          {
            baseRate: parseMoney(105 + totalWeight * 4.5),
            currency,
            serviceType: "P",
            transitDays: 3,
            serviceName: "DHL Express Worldwide",
            packagingType: request.packagingType,
          },
          {
            baseRate: parseMoney(148 + totalWeight * 5.5),
            currency,
            serviceType: "D",
            transitDays: 1,
            serviceName: "DHL Express 9:00",
            packagingType: request.packagingType,
          },
        ]
      : [
          {
            baseRate: parseMoney(28 + totalWeight * 2.2),
            currency,
            serviceType: "N",
            transitDays: 1,
            serviceName: "DHL Domestic Express",
            packagingType: request.packagingType,
          },
        ];

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

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "DHL is not configured and mock mode is disabled in production");
      }

      const trackingNumber = `DHL${Date.now()}`;
      logInfo("Created mock DHL shipment", { trackingNumber });
      return {
        trackingNumber,
        carrierTrackingNumber: trackingNumber,
        serviceType: request.serviceType,
        labelData: Buffer.from(`Mock DHL label for ${trackingNumber}`).toString("base64"),
      };
    }

    try {
      const isInternational =
        normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
      const sanitizedItems = sanitizeShipmentItems(request.items);
      const requestedDeclaredValue = Number(request.declaredValue || 0);
      const derivedDeclaredValue = buildDeclaredValue(sanitizedItems);
      const declaredValue =
        derivedDeclaredValue ??
        (Number.isFinite(requestedDeclaredValue) && requestedDeclaredValue > 0
          ? Math.min(requestedDeclaredValue, MAX_DECLARED_VALUE)
          : 1);
      const payload: Record<string, any> = {
        productCode: request.serviceType || defaultProductCode(request),
        plannedShippingDateAndTime: formatDhlShipmentDateTime(
          normalizePlannedShippingDate(request.shipDate, request.shipper.countryCode),
        ),
        pickup: { isRequested: false },
        accounts: [{ number: this.accountNumber, typeCode: "shipper" }],
        outputImageProperties: {
          encodingFormat: "pdf",
          imageOptions: isInternational
            ? [
                { invoiceType: "commercial", isRequested: true, typeCode: "invoice" },
                { hideAccountNumber: false, isRequested: true, typeCode: "waybillDoc" },
              ]
            : [{ hideAccountNumber: false, isRequested: true, typeCode: "waybillDoc" }],
        },
        customerDetails: {
          shipperDetails: buildPartyDetails(request.shipper),
          receiverDetails: buildPartyDetails(request.recipient),
        },
        content: {
          unitOfMeasurement: toMetricOrImperial(request.packages[0]?.weightUnit),
          incoterm: request.incoterm || "DAP",
          isCustomsDeclarable: isInternational,
          description: buildCommodityDescription(request, sanitizedItems),
          packages: buildPackages(request),
          declaredValue: normalizeDeclaredValue(declaredValue),
          declaredValueCurrency: request.currency || "SAR",
        },
      };

      if (isInternational) {
        const exportDeclaration = buildExportDeclaration(request, sanitizedItems);
        if (exportDeclaration) {
          payload.content.exportDeclaration = exportDeclaration;
        }
      }

      const { data } = await this.makeRequest<any>("/shipments", "POST", payload);
      return extractCreateShipmentResponse(data, request);
    } catch (error) {
      logError("DHL shipment creation failed", error);
      throw error instanceof CarrierError
        ? error
        : new CarrierError("SHIPMENT_CREATE_FAILED", (error as Error).message || "DHL shipment creation failed");
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "DHL is not configured and mock mode is disabled in production");
      }

      return {
        trackingNumber,
        status: "IN_TRANSIT",
        events: [
          {
            timestamp: new Date(),
            status: "IN_TRANSIT",
            description: "Mock DHL tracking event",
            location: "DHL Network",
          },
        ],
      };
    }

    // The value is "all-checkpoints" — NOT "all-check-points". DHL does validate this parameter
    // (an unknown value like "last-checkpoint-only" 400s), but the hyphenated misspelling is
    // accepted and answered with 200 carrying ONLY the RR/PY data-exchange pings: no pickup, no
    // transit scans, no delivery. Shipments that were moving normally looked frozen at
    // "Shipment information received" for weeks. Omitting the parameter returns the same full
    // set, so the bare path is the fallback.
    const endpointCandidates = [
      `/shipments/${encodeURIComponent(trackingNumber)}/tracking?trackingView=all-checkpoints`,
      `/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    ];

    let lastError: Error | null = null;
    for (const endpoint of endpointCandidates) {
      try {
        const { data } = await this.makeRequest<any>(endpoint, "GET", undefined, 1);
        return extractTrackingResponse(trackingNumber, data);
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw lastError instanceof CarrierError
      ? lastError
      : new CarrierError("TRACK_FAILED", lastError?.message || "DHL tracking failed");
  }

  async cancelShipment(trackingNumber: string, senderCountryCode?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "DHL is not configured and mock mode is disabled in production");
      }

      logInfo("Mock-cancelled DHL shipment", { trackingNumber });
      return true;
    }

    // DHL Express (MyDHL API) has NO shipment-cancellation operation — a created waybill cannot
    // be voided via API; it simply expires unused if never tendered. Attempting DELETE /shipments
    // is rejected by DHL's gateway with "405 MessageBlocked". So carrier-side cancel is a graceful
    // no-op: the shipment is still cancelled in our system. A booked courier pickup, if any, is
    // cancelled separately via cancelPickup(dispatchConfirmationNumber).
    logInfo("DHL shipment cancellation is a no-op (MyDHL API has no cancel endpoint); waybill will expire unused", {
      trackingNumber,
    });
    return true;
  }

  supportsPickup = true;

  /**
   * Resolve a pickup origin against DHL's own location gazetteer (GET /address-validate).
   * POST /pickups matches cityName + postalCode EXACTLY against that gazetteer and rejects
   * anything it doesn't carry with 420504 "The origin location is invalid" — even for addresses
   * DHL happily accepted when the waybill was created (shipment creation is far more lenient).
   * Real example: sender "Sariçam / 01000 / TR" books a waybill fine but has no gazetteer entry
   * (DHL knows "SARICAM ADANA" at 01250/01340/01410/01790), so every pickup attempt 400s.
   *
   * Lookups are tried narrowest-first — pair as given, ASCII-folded city + postal, postal only,
   * ASCII-folded city only — and the canonical cityName/postalCode DHL returns is what we send.
   * Returns null when nothing matches, in which case the caller sends the address unchanged and
   * lets DHL produce its own error.
   */
  private async resolvePickupOrigin(
    countryCode: string,
    cityName: string,
    postalCode: string,
  ): Promise<{ cityName: string; postalCode: string } | null> {
    const country = (countryCode || "").toUpperCase();
    if (!country) return null;
    // Fold diacritics (Sariçam → Saricam): DHL's gazetteer is plain ASCII uppercase.
    const asciiCity = (cityName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const postal = (postalCode || "").trim();
    const queries: Array<Record<string, string>> = [];
    if (cityName && postal) queries.push({ cityName, postalCode: postal });
    if (asciiCity && asciiCity !== cityName && postal) queries.push({ cityName: asciiCity, postalCode: postal });
    if (postal) queries.push({ postalCode: postal });
    if (asciiCity) queries.push({ cityName: asciiCity });

    for (const q of queries) {
      const params = new URLSearchParams({ type: "pickup", countryCode: country, ...q });
      try {
        const { data } = await this.makeRequest<any>(`/address-validate?${params.toString()}`, "GET", undefined, 1);
        const match = Array.isArray(data?.address) ? data.address[0] : undefined;
        if (match?.cityName) {
          return { cityName: String(match.cityName), postalCode: String(match.postalCode ?? postal ?? "") };
        }
      } catch {
        // 400/404 = this combination is unknown to DHL; fall through to the next, broader query.
      }
    }
    logError("DHL: pickup origin not found in DHL's location database", {
      countryCode: country, cityName, postalCode: postal,
    } as any);
    return null;
  }

  /**
   * Book a DHL Express courier pickup for an already-created shipment via POST /pickups.
   * Returns the dispatchConfirmationNumber. The 3-letter prefix is DHL's service-area code,
   * assigned server-side from the booking account — not controllable from the request.
   */
  async requestPickup(request: PickupRequest): Promise<PickupResponse> {
    if (!this.isConfigured()) {
      throw new CarrierError("NOT_CONFIGURED", "DHL is not configured — cannot request a pickup.");
    }
    const s = request.shipper;
    const origin = await this.resolvePickupOrigin(s.countryCode, s.city, s.postalCode || "");
    const offset = gmtOffsetForCountry(s.countryCode, request.pickupDate);
    const packages = request.packages.map((p) => {
      const weightKg = p.weightUnit === "LB" ? Number(p.weight) * 0.453592 : Number(p.weight);
      const d = p.dimensions;
      const toCm = (v: number) => (d?.unit === "IN" ? v * 2.54 : v);
      return {
        weight: Math.max(0.1, Math.round(weightKg * 100) / 100),
        ...(d ? { dimensions: { length: Math.round(toCm(d.length)), width: Math.round(toCm(d.width)), height: Math.round(toCm(d.height)) } } : {}),
      };
    });
    const body = {
      plannedPickupDateAndTime: `${request.pickupDate}T${request.readyTime}:00 ${offset}`,
      closeTime: request.closeTime,
      location: request.location || "Reception",
      locationType: "business",
      accounts: [{ typeCode: "shipper", number: this.accountNumber }],
      customerDetails: {
        shipperDetails: {
          postalAddress: {
            // Canonical DHL gazetteer values when the origin resolved — the shipment's own
            // city/postal is often not a DHL location and gets rejected with 420504.
            postalCode: origin?.postalCode || s.postalCode || "",
            cityName: origin?.cityName || s.city,
            countryCode: s.countryCode,
            addressLine1: s.streetLine1,
            ...(s.streetLine2 ? { addressLine2: s.streetLine2 } : {}),
            ...(s.stateOrProvince ? { countyName: s.stateOrProvince } : {}),
          },
          contactInformation: {
            companyName: s.name,
            fullName: s.name,
            phone: s.phone,
            email: s.email || "",
          },
        },
      },
      shipmentDetails: [{
        productCode: request.serviceType || "P",
        isCustomsDeclarable: Boolean(request.isInternational),
        // Round to 2 dp: DHL requires declaredValue to be a multiple of 0.001, but summing item
        // prices yields float artifacts (e.g. 468.65999999999997) that DHL rejects with a 422.
        declaredValue: Number(request.declaredValue) > 0 ? Math.round(Number(request.declaredValue) * 100) / 100 : 1,
        declaredValueCurrency: request.currency || "EUR",
        unitOfMeasurement: "metric",
        accounts: [{ typeCode: "shipper", number: this.accountNumber }],
        packages,
      }],
      ...(request.instructions ? { specialInstructions: [{ value: request.instructions }] } : {}),
    };
    const { data } = await this.makeRequest<any>("/pickups", "POST", body, 1);
    const confirmationNumber = String(
      data?.dispatchConfirmationNumbers?.[0] ?? data?.dispatchConfirmationNumber ?? "",
    ).trim();
    if (!confirmationNumber) {
      throw new CarrierError("PICKUP_FAILED", "DHL pickup booking returned no dispatch confirmation number.");
    }
    return { confirmationNumber, raw: data };
  }

  async cancelPickup(confirmationNumber: string, request?: Partial<PickupRequest>): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const requestorName = encodeURIComponent(request?.shipper?.name || "Ezhalha Logistics");
    const reason = encodeURIComponent(request?.instructions || "Cancelled by shipper");
    try {
      await this.makeRequest<any>(
        `/pickups/${encodeURIComponent(confirmationNumber)}?requestorName=${requestorName}&reason=${reason}`,
        "DELETE",
        undefined,
        1,
      );
      return true;
    } catch (error) {
      logError(`DHL: cancel pickup failed for ${confirmationNumber}`, error);
      return false;
    }
  }

  validateWebhookSignature(_payload: string, _signature: string): boolean {
    return false;
  }
}

/** DHL offset string "GMT±HH:MM" for a country on a given date (handles DST). */
function gmtOffsetForCountry(countryCode: string, dateISO: string): string {
  const tz = countryTimeZone(countryCode);
  try {
    const date = new Date(`${dateISO}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(date);
    const name = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
    // Intl returns "GMT+2" in some runtimes → normalise to "GMT+02:00".
    const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return "GMT+00:00";
    return `GMT${m[1]}${m[2].padStart(2, "0")}:${(m[3] || "00").padStart(2, "0")}`;
  } catch {
    return "GMT+00:00";
  }
}

export const dhlAdapter = new DhlAdapter();
