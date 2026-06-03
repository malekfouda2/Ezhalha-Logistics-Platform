import "../load-env";
import { calculateChargeableWeight } from "@shared/chargeable-weight";
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
  type TrackingResponse,
} from "./fedex";
import { logError, logInfo, logWarn } from "../services/logger";
import { storage } from "../storage";
import { getIntegrationEnv, getIntegrationEnvBoolean } from "../services/integration-runtime";

const DEFAULT_BASE_URL = "https://ws.dev.aramex.net";
const PRODUCTION_BASE_URL = "https://ws.aramex.net";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 750;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isMockAllowed(): boolean {
  if (getIntegrationEnvBoolean("ARAMEX_MOCK_MODE")) return true;
  return !isProduction();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

function normalizePostalCode(postalCode?: string): string {
  return postalCode?.trim() || "00000";
}

function normalizeCurrency(currency?: string): string {
  return (currency || "SAR").trim().toUpperCase();
}

function normalizeWeightUnit(unit?: string): "KG" | "LB" {
  return unit?.toUpperCase() === "LB" ? "LB" : "KG";
}

function kgValue(weight: number, unit?: string): number {
  return normalizeWeightUnit(unit) === "LB" ? weight / 2.2046226218 : weight;
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
    "ARAMEX",
  );
}

function maskSensitiveData(data: unknown): unknown {
  const masked = JSON.parse(JSON.stringify(data ?? {}));
  const sensitiveFields = ["password", "accountpin", "accountnumber", "username"];

  function maskObject(obj: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        obj[key] = "***MASKED***";
      } else if (value && typeof value === "object") {
        maskObject(value as Record<string, unknown>);
      }
    }
  }

  if (masked && typeof masked === "object") {
    maskObject(masked as Record<string, unknown>);
  }

  return masked;
}

function getAramexConfigValues() {
  return {
    ARAMEX_USERNAME: process.env.ARAMEX_USERNAME,
    ARAMEX_PASSWORD: process.env.ARAMEX_PASSWORD,
    ARAMEX_ACCOUNT_NUMBER: process.env.ARAMEX_ACCOUNT_NUMBER,
    ARAMEX_ACCOUNT_PIN: process.env.ARAMEX_ACCOUNT_PIN,
    ARAMEX_ACCOUNT_ENTITY: process.env.ARAMEX_ACCOUNT_ENTITY,
    ARAMEX_ACCOUNT_COUNTRY_CODE: process.env.ARAMEX_ACCOUNT_COUNTRY_CODE,
  };
}

export function validateAramexEnvOnStartup(): void {
  if (!isProduction()) return;

  const configuredValues = getAramexConfigValues();
  const hasAnyAramexConfig = Object.values(configuredValues).some((value) => !!value);
  if (!hasAnyAramexConfig) {
    logInfo("Aramex is not configured in production; continuing with other configured carriers only");
    return;
  }

  const missing = Object.entries(configuredValues)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    logWarn(
      `Aramex is partially configured in production and will be disabled until completed. Missing: ${missing.join(", ")}`,
      { source: "aramex" },
    );
  }
}

export class AramexAdapter implements CarrierAdapter {
  name = "Aramex";
  carrierCode = "ARAMEX";

  private get username(): string | undefined {
    return getIntegrationEnv("ARAMEX_USERNAME");
  }

  private get password(): string | undefined {
    return getIntegrationEnv("ARAMEX_PASSWORD");
  }

  private get accountNumber(): string | undefined {
    return getIntegrationEnv("ARAMEX_ACCOUNT_NUMBER");
  }

  private get accountPin(): string | undefined {
    return getIntegrationEnv("ARAMEX_ACCOUNT_PIN");
  }

  private get accountEntity(): string | undefined {
    return getIntegrationEnv("ARAMEX_ACCOUNT_ENTITY");
  }

  private get accountCountryCode(): string | undefined {
    return getIntegrationEnv("ARAMEX_ACCOUNT_COUNTRY_CODE");
  }

  private get baseUrl(): string {
    return (getIntegrationEnv("ARAMEX_BASE_URL") || (isProduction() ? PRODUCTION_BASE_URL : DEFAULT_BASE_URL)).replace(/\/+$/, "");
  }

  isConfigured(): boolean {
    return Boolean(
      this.username &&
        this.password &&
        this.accountNumber &&
        this.accountPin &&
        this.accountEntity &&
        this.accountCountryCode,
    );
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  private buildClientInfo() {
    return {
      UserName: this.username,
      Password: this.password,
      Version: "v1.0",
      AccountNumber: this.accountNumber,
      AccountPin: this.accountPin,
      AccountEntity: this.accountEntity,
      AccountCountryCode: this.accountCountryCode,
      Source: 24,
    };
  }

  private async logIntegration(
    endpoint: string,
    requestBody: unknown,
    responseBody: unknown,
    statusCode: number,
    duration: number,
    success: boolean,
  ): Promise<void> {
    try {
      await storage.createIntegrationLog({
        serviceName: "aramex",
        operation: `POST ${endpoint}`,
        requestPayload: JSON.stringify(maskSensitiveData(requestBody)),
        responsePayload: JSON.stringify(isProduction() && success ? { logged: false, reason: "production" } : maskSensitiveData(responseBody)),
        statusCode,
        duration,
        success,
      });
    } catch (error) {
      logError("Failed to log Aramex integration", error);
    }
  }

  private async makeRequest<T>(endpoint: string, body: unknown, retries: number = MAX_RETRIES): Promise<T> {
    if (!this.isConfigured()) {
      throw new CarrierError("NOT_CONFIGURED", "Aramex is not configured");
    }

    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text };
        }

        await this.logIntegration(endpoint, body, data, response.status, Date.now() - startTime, response.ok);

        if (!response.ok) {
          throw new CarrierError("ARAMEX_API_ERROR", `Aramex API error: ${response.status}`);
        }

        if (data?.HasErrors === true || data?.hasErrors === true) {
          const notifications = data?.Notifications || data?.notifications || [];
          const message = Array.isArray(notifications)
            ? notifications.map((notification: any) => notification?.Message || notification?.message).filter(Boolean).join("; ")
            : "";
          throw new CarrierError("ARAMEX_API_ERROR", message || "Aramex returned an error");
        }

        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retries) {
          await delay(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    await this.logIntegration(endpoint, body, { error: lastError?.message }, 0, Date.now() - startTime, false);
    throw lastError || new CarrierError("ARAMEX_API_ERROR", "Aramex request failed");
  }

  async validateAddress(request: AddressValidationRequest): Promise<AddressValidationResponse> {
    const address = request.address;
    const valid = Boolean(address.streetLine1 && address.countryCode && (address.city || address.postalCode));
    return {
      valid,
      resolvedAddresses: valid
        ? [{
            streetLines: [address.streetLine1, address.streetLine2].filter(Boolean) as string[],
            city: address.city || "",
            stateOrProvince: address.stateOrProvince || "",
            postalCode: address.postalCode || "",
            countryCode: normalizeCountryCode(address.countryCode),
            residential: false,
          }]
        : [],
      messages: valid ? ["Basic Aramex validation passed"] : ["Street, country, and city or postal code are required"],
    };
  }

  async validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse> {
    return {
      valid: Boolean(request.countryCode && (request.postalCode || request.countryCode.toUpperCase() === "AE")),
      locationDescription: request.stateOrProvince,
      stateOrProvince: request.stateOrProvince,
      countryCode: normalizeCountryCode(request.countryCode),
    };
  }

  async checkServiceAvailability(request: ServiceAvailabilityRequest): Promise<ServiceAvailabilityResponse> {
    const isInternational = normalizeCountryCode(request.origin.countryCode) !== normalizeCountryCode(request.destination.countryCode);
    return {
      services: [
        {
          serviceType: isInternational ? "EXP" : "DOM",
          serviceName: isInternational ? "Priority Parcel Express" : "Domestic Express",
          displayName: isInternational ? "Aramex Priority Parcel Express" : "Aramex Domestic Express",
          available: true,
          isInternational,
          transitDays: isInternational ? 5 : 2,
        },
      ],
    };
  }

  private buildRateRequest(request: RateRequest) {
    const firstPackage = request.packages[0];
    const totalWeightKg = request.packages.reduce(
      (sum, pkg) => sum + kgValue(pkg.weight, pkg.weightUnit),
      0,
    );
    const dims = firstPackage?.dimensions;

    return {
      ClientInfo: this.buildClientInfo(),
      Transaction: {
        Reference1: `EZH-RATE-${Date.now()}`,
      },
      OriginAddress: {
        Line1: request.shipper.streetLine1,
        Line2: request.shipper.streetLine2 || "",
        Line3: request.shipper.streetLine3 || "",
        City: request.shipper.city,
        StateOrProvinceCode: request.shipper.stateOrProvince || "",
        PostCode: normalizePostalCode(request.shipper.postalCode),
        CountryCode: normalizeCountryCode(request.shipper.countryCode),
      },
      DestinationAddress: {
        Line1: request.recipient.streetLine1,
        Line2: request.recipient.streetLine2 || "",
        Line3: request.recipient.streetLine3 || "",
        City: request.recipient.city,
        StateOrProvinceCode: request.recipient.stateOrProvince || "",
        PostCode: normalizePostalCode(request.recipient.postalCode),
        CountryCode: normalizeCountryCode(request.recipient.countryCode),
      },
      ShipmentDetails: {
        PaymentType: "P",
        ProductGroup: normalizeCountryCode(request.shipper.countryCode) === normalizeCountryCode(request.recipient.countryCode) ? "DOM" : "EXP",
        ProductType: request.serviceType || (normalizeCountryCode(request.shipper.countryCode) === normalizeCountryCode(request.recipient.countryCode) ? "ONP" : "PPX"),
        ActualWeight: {
          Unit: "KG",
          Value: Number(totalWeightKg.toFixed(3)),
        },
        ChargeableWeight: {
          Unit: "KG",
          Value: Number(totalWeightKg.toFixed(3)),
        },
        Dimensions: dims
          ? {
              Unit: dims.unit === "IN" ? "IN" : "CM",
              Length: dims.length,
              Width: dims.width,
              Height: dims.height,
            }
          : undefined,
        NumberOfPieces: Math.max(1, request.packages.length),
        DescriptionOfGoods: "General goods",
        GoodsOriginCountry: normalizeCountryCode(request.shipper.countryCode),
      },
      PreferredCurrencyCode: normalizeCurrency(request.currency),
    };
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "Aramex is not configured and mock mode is disabled in production");
      }
      logInfo("Using mock Aramex rates (Aramex not configured)");
      return this.getMockRates(request);
    }

    try {
      const payload = this.buildRateRequest(request);
      const data = await this.makeRequest<any>("/shippingapi.v2/ratecalculator/service_1_0.svc/json/CalculateRate", payload);
      const amount =
        parseMoney(data?.TotalAmount?.Value) ||
        parseMoney(data?.totalAmount?.value) ||
        parseMoney(data?.RateDetails?.Amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new CarrierError("RATE_PARSE_FAILED", "Aramex did not return a valid rate amount");
      }

      const chargeableWeightDetails = buildRateChargeableWeightSummary(request);
      const isInternational = normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
      return [{
        baseRate: amount,
        currency: data?.TotalAmount?.CurrencyCode || normalizeCurrency(request.currency),
        serviceType: payload.ShipmentDetails.ProductType,
        transitDays: isInternational ? 5 : 2,
        serviceName: isInternational ? "Aramex Priority Parcel Express" : "Aramex Domestic Express",
        packagingType: request.packagingType,
        actualWeight: chargeableWeightDetails.actualWeight,
        dimensionalWeight: chargeableWeightDetails.dimensionalWeight,
        chargeableWeight: chargeableWeightDetails.chargeableWeight,
        chargeableWeightUnit: chargeableWeightDetails.weightUnit,
        chargeableWeightSource: "system",
        chargeableWeightDetails,
      }];
    } catch (error) {
      logError("Aramex rate request failed", error);
      if (!isMockAllowed()) {
        throw error instanceof CarrierError ? error : new CarrierError("RATE_FAILED", (error as Error).message);
      }
      return this.getMockRates(request);
    }
  }

  private getMockRates(request: RateRequest): RateResponse[] {
    const chargeableWeightDetails = buildRateChargeableWeightSummary(request);
    const totalWeight = chargeableWeightDetails.chargeableWeight;
    const isInternational = normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
    const currency = normalizeCurrency(request.currency);

    return [{
      baseRate: parseMoney((isInternational ? 95 : 35) + totalWeight * (isInternational ? 4.8 : 2.4)),
      currency,
      serviceType: isInternational ? "PPX" : "ONP",
      transitDays: isInternational ? 5 : 2,
      serviceName: isInternational ? "Aramex Priority Parcel Express" : "Aramex Domestic Express",
      packagingType: request.packagingType,
      actualWeight: chargeableWeightDetails.actualWeight,
      dimensionalWeight: chargeableWeightDetails.dimensionalWeight,
      chargeableWeight: chargeableWeightDetails.chargeableWeight,
      chargeableWeightUnit: chargeableWeightDetails.weightUnit,
      chargeableWeightSource: "system",
      chargeableWeightDetails,
    }];
  }

  private buildShipmentPayload(request: CreateShipmentRequest) {
    const isInternational = normalizeCountryCode(request.shipper.countryCode) !== normalizeCountryCode(request.recipient.countryCode);
    const productGroup = isInternational ? "EXP" : "DOM";
    const productType = request.serviceType || (isInternational ? "PPX" : "ONP");
    const chargeableWeightDetails = buildRateChargeableWeightSummary(request);
    const totalWeightKg = request.packages.reduce(
      (sum, pkg) => sum + kgValue(pkg.weight, pkg.weightUnit),
      0,
    );

    return {
      ClientInfo: this.buildClientInfo(),
      Transaction: {
        Reference1: request.commercialInvoiceNumber || `EZH-${Date.now()}`,
      },
      Shipments: [{
        Reference1: request.commercialInvoiceNumber || `EZH-${Date.now()}`,
        Shipper: {
          Reference1: "Ezhalha shipper",
          AccountNumber: this.accountNumber,
          PartyAddress: {
            Line1: request.shipper.streetLine1,
            Line2: request.shipper.streetLine2 || "",
            Line3: request.shipper.streetLine3 || "",
            City: request.shipper.city,
            StateOrProvinceCode: request.shipper.stateOrProvince || "",
            PostCode: normalizePostalCode(request.shipper.postalCode),
            CountryCode: normalizeCountryCode(request.shipper.countryCode),
          },
          Contact: {
            PersonName: request.shipper.name,
            CompanyName: request.shipper.name,
            PhoneNumber1: request.shipper.phone,
            CellPhone: request.shipper.phone,
            EmailAddress: request.shipper.email || "no-reply@ezhalha.com",
          },
        },
        Consignee: {
          Reference1: "Ezhalha consignee",
          PartyAddress: {
            Line1: request.recipient.streetLine1,
            Line2: request.recipient.streetLine2 || "",
            Line3: request.recipient.streetLine3 || "",
            City: request.recipient.city,
            StateOrProvinceCode: request.recipient.stateOrProvince || "",
            PostCode: normalizePostalCode(request.recipient.postalCode),
            CountryCode: normalizeCountryCode(request.recipient.countryCode),
          },
          Contact: {
            PersonName: request.recipient.name,
            CompanyName: request.recipient.name,
            PhoneNumber1: request.recipient.phone,
            CellPhone: request.recipient.phone,
            EmailAddress: request.recipient.email || "no-reply@ezhalha.com",
          },
        },
        Details: {
          Dimensions: request.packages[0]?.dimensions
            ? {
                Unit: request.packages[0].dimensions.unit === "IN" ? "IN" : "CM",
                Length: request.packages[0].dimensions.length,
                Width: request.packages[0].dimensions.width,
                Height: request.packages[0].dimensions.height,
              }
            : undefined,
          ActualWeight: {
            Unit: "KG",
            Value: Number(totalWeightKg.toFixed(3)),
          },
          ChargeableWeight: {
            Unit: "KG",
            Value: Number(chargeableWeightDetails.chargeableWeightKg.toFixed(3)),
          },
          ProductGroup: productGroup,
          ProductType: productType,
          PaymentType: "P",
          PaymentOptions: "",
          Services: "",
          NumberOfPieces: Math.max(1, request.packages.length),
          DescriptionOfGoods: (request.commodityDescription || "General goods").slice(0, 100),
          GoodsOriginCountry: normalizeCountryCode(request.shipper.countryCode),
          CustomsValueAmount: {
            CurrencyCode: normalizeCurrency(request.currency),
            Value: request.declaredValue || 1,
          },
          CashOnDeliveryAmount: {
            CurrencyCode: normalizeCurrency(request.currency),
            Value: 0,
          },
        },
      }],
      LabelInfo: {
        ReportID: 9729,
        ReportType: "URL",
      },
    };
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "Aramex is not configured and mock mode is disabled in production");
      }
      const trackingNumber = `ARX${Date.now()}`;
      logInfo("Created mock Aramex shipment", { trackingNumber });
      return {
        trackingNumber,
        carrierTrackingNumber: trackingNumber,
        labelData: Buffer.from(`Mock Aramex label for ${trackingNumber}`).toString("base64"),
        serviceType: request.serviceType,
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      };
    }

    try {
      const payload = this.buildShipmentPayload(request);
      const data = await this.makeRequest<any>("/shippingapi.v2/shipping/service_1_0.svc/json/CreateShipments", payload);
      const processedShipment = Array.isArray(data?.Shipments) ? data.Shipments[0] : data?.Shipments?.ProcessedShipment || data?.ProcessedShipment;
      const trackingNumber =
        processedShipment?.ID ||
        processedShipment?.Number ||
        processedShipment?.ShipmentNumber ||
        data?.ShipmentNumber;
      if (!trackingNumber) {
        throw new CarrierError("SHIPMENT_CREATE_FAILED", "Aramex did not return a tracking number");
      }

      return {
        trackingNumber,
        carrierTrackingNumber: trackingNumber,
        labelUrl: processedShipment?.ShipmentLabel?.LabelURL || processedShipment?.LabelURL,
        labelData: processedShipment?.ShipmentLabel?.LabelFileContents || undefined,
        serviceType: request.serviceType,
      };
    } catch (error) {
      logError("Aramex shipment creation failed", error);
      throw error instanceof CarrierError
        ? error
        : new CarrierError("SHIPMENT_CREATE_FAILED", (error as Error).message || "Aramex shipment creation failed");
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "Aramex is not configured and mock mode is disabled in production");
      }
      return {
        trackingNumber,
        status: "IN_TRANSIT",
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        events: [{
          timestamp: new Date(),
          status: "IN_TRANSIT",
          description: "Mock Aramex tracking event",
          location: "Aramex Network",
        }],
      };
    }

    const payload = {
      ClientInfo: this.buildClientInfo(),
      Transaction: {
        Reference1: `TRACK-${Date.now()}`,
      },
      Shipments: [trackingNumber],
      GetLastTrackingUpdateOnly: false,
    };
    const data = await this.makeRequest<any>("/shippingapi.v2/tracking/service_1_0.svc/json/TrackShipments", payload);
    const eventSource = data?.TrackingResults?.[trackingNumber] || data?.TrackingResults || [];
    const events = (Array.isArray(eventSource) ? eventSource : [eventSource])
      .filter(Boolean)
      .map((event: any) => ({
        timestamp: event?.UpdateDateTime ? new Date(event.UpdateDateTime) : new Date(),
        status: event?.UpdateCode || event?.TrackingUpdateCode || "UNKNOWN",
        description: event?.UpdateDescription || event?.TrackingUpdateDescription || "Aramex tracking update",
        location: [event?.UpdateLocation, event?.UpdateCountryCode].filter(Boolean).join(", ") || undefined,
      }));

    return {
      trackingNumber,
      status: events[0]?.status || "UNKNOWN",
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "Aramex is not configured and mock mode is disabled in production");
      }
      logInfo("Mock-cancelled Aramex shipment", { trackingNumber });
      return true;
    }

    throw new CarrierError(
      "CANCEL_NOT_IMPLEMENTED",
      "Aramex cancellation requires final account-specific service enablement before live cancellation can be called.",
    );
  }
}

export const aramexAdapter = new AramexAdapter();
