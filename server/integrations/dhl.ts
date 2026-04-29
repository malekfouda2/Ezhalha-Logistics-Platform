import "../load-env";
import crypto from "crypto";
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
} from "./fedex";
import { logError, logInfo } from "../services/logger";
import { storage } from "../storage";

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
  if (process.env.DHL_MOCK_MODE === "true") return true;
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

function buildPackages(request: RateRequest | CreateShipmentRequest) {
  return request.packages.map((pkg) => ({
    weight: pkg.weight,
    ...(pkg.dimensions
      ? {
          dimensions: {
            length: pkg.dimensions.length,
            width: pkg.dimensions.width,
            height: pkg.dimensions.height,
          },
        }
      : {}),
  }));
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

function formatDeclaredValue(value: number): string {
  const normalizedValue = Math.min(MAX_DECLARED_VALUE, Math.max(0, value));
  if (Number.isInteger(normalizedValue)) {
    return String(normalizedValue);
  }

  return normalizedValue.toFixed(2);
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

function buildExportDeclaration(request: CreateShipmentRequest, items?: ShipmentItem[]) {
  const sanitizedItems = sanitizeShipmentItems(items ?? request.items);
  if (sanitizedItems.length === 0) {
    return undefined;
  }

  const totalWeight = request.packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0);
  const totalQuantity = sanitizedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const invoiceDate = normalizePlannedShippingDate(request.shipDate, request.shipper.countryCode).split("T")[0];
  const declaredValue = buildDeclaredValue(sanitizedItems) ?? 0;
  const currency = request.currency || "SAR";

  return {
    lineItems: sanitizedItems.map((item, index) => {
      const grossWeight = buildLineItemWeight(totalWeight, totalQuantity, Number(item.quantity || 0));
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
          netValue: grossWeight,
          grossValue: grossWeight,
        },
        manufacturerCountry: item.countryOfOrigin || request.shipper.countryCode,
        exportReasonType: "permanent",
      };
    }),
    invoice: {
      number: `EZH-${Date.now()}`,
      date: invoiceDate,
      totalNetWeight: totalWeight > 0 ? totalWeight : undefined,
      totalGrossWeight: totalWeight > 0 ? totalWeight : undefined,
      customerReferences: [{ value: `EZH-${Date.now()}`, typeCode: "CU" }],
    },
    ...(declaredValue > 0
      ? {
          exportReason: "SALE",
          placeOfIncoterm: request.recipient.city,
        }
      : {}),
  };
}

function extractDhlRates(data: any, request: RateRequest): RateResponse[] {
  const products = Array.isArray(data?.products)
    ? data.products
    : Array.isArray(data?.product)
      ? data.product
      : [];

  return products
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

      const estimatedDelivery =
        parseEstimatedDate(product.deliveryCapabilities?.estimatedDeliveryDateAndTime) ||
        parseEstimatedDate(product.estimatedDeliveryDateAndTime);
      const transitDays = Number(
        product.deliveryCapabilities?.totalTransitDays ??
          product.totalTransitDays ??
          product.deliveryCapabilities?.deliveryTypeCode ??
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
      } satisfies RateResponse;
    })
    .filter((rate: RateResponse | null): rate is RateResponse => {
      if (!rate) {
        return false;
      }

      return !request.serviceType || rate.serviceType === request.serviceType;
    });
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
        parseTrackingTimestamp(event?.date) ||
        parseTrackingTimestamp(event?.dateTime);

      if (!timestamp) {
        return null;
      }

      return {
        timestamp,
        status: event?.status || event?.statusCode || shipment?.status || "IN_TRANSIT",
        description:
          event?.description ||
          event?.statusDescription ||
          event?.serviceArea?.description ||
          "DHL shipment event",
        location:
          event?.serviceArea?.description ||
          event?.location?.address?.addressLocality ||
          event?.location?.address?.addressRegion,
      } satisfies TrackingEvent;
    })
    .filter((event: TrackingEvent | null): event is TrackingEvent => Boolean(event))
    .sort((a: TrackingEvent, b: TrackingEvent) => b.timestamp.getTime() - a.timestamp.getTime());

  const estimatedDelivery =
    parseEstimatedDate(shipment?.estimatedDeliveryDateAndTime) ||
    parseEstimatedDate(shipment?.estimatedDelivery);
  const actualDelivery =
    parseEstimatedDate(shipment?.actualDeliveryDateAndTime) ||
    parseEstimatedDate(shipment?.actualDelivery);

  return {
    trackingNumber,
    status:
      shipment?.status ||
      shipment?.statusCode ||
      shipment?.shipmentStatus ||
      events[0]?.status ||
      "IN_TRANSIT",
    estimatedDelivery,
    actualDelivery,
    events,
  };
}

export class DhlAdapter implements CarrierAdapter {
  name = "DHL";
  carrierCode = "DHL";

  private get apiKey(): string | undefined {
    return process.env.DHL_API_KEY;
  }

  private get apiSecret(): string | undefined {
    return process.env.DHL_API_SECRET;
  }

  private get accountNumber(): string | undefined {
    return process.env.DHL_ACCOUNT_NUMBER;
  }

  private get baseUrl(): string {
    if (process.env.DHL_BASE_URL) {
      return process.env.DHL_BASE_URL.replace(/\/+$/, "");
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
        plannedShippingDateAndTime: normalizePlannedShippingDate(undefined, request.shipper.countryCode),
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
    const totalWeight = request.packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0);
    const isInternational =
      normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
    const currency = request.currency || "SAR";

    return isInternational
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
          declaredValue: formatDeclaredValue(declaredValue),
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

    const endpointCandidates = [
      `/shipments/${encodeURIComponent(trackingNumber)}/tracking?trackingView=all-check-points`,
      `/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
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

    const query = senderCountryCode
      ? `?requesterCountryCode=${encodeURIComponent(normalizeCountryCode(senderCountryCode))}`
      : "";

    try {
      await this.makeRequest<any>(`/shipments/${encodeURIComponent(trackingNumber)}${query}`, "DELETE", undefined, 1);
      return true;
    } catch (error) {
      throw error instanceof CarrierError
        ? error
        : new CarrierError("CANCEL_FAILED", (error as Error).message || "DHL shipment cancellation failed");
    }
  }

  validateWebhookSignature(_payload: string, _signature: string): boolean {
    return false;
  }
}

export const dhlAdapter = new DhlAdapter();
