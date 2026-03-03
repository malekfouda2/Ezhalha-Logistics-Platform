import crypto from "crypto";
import { logInfo, logError } from "../services/logger";
import { storage } from "../storage";

const COUNTRIES_REQUIRING_STATE = new Set(["US", "CA", "AU", "IN", "BR", "MX", "CN", "JP"]);

function sanitizeStateCode(countryCode: string, stateOrProvince?: string): string | undefined {
  if (!stateOrProvince || stateOrProvince.trim() === "") return undefined;
  const trimmed = stateOrProvince.trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  if (COUNTRIES_REQUIRING_STATE.has(countryCode)) {
    return trimmed.substring(0, 2).toUpperCase();
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
  streetLine1: string;
  streetLine2?: string;
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
  hsCode?: string;
  countryOfOrigin?: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
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
}

export interface RateResponse {
  baseRate: number;
  currency: string;
  serviceType: string;
  transitDays: number;
  deliveryDate?: Date;
  serviceName: string;
  packagingType?: string;
}

export interface CreateShipmentRequest {
  shipper: ShippingAddress;
  recipient: ShippingAddress;
  packages: PackageDetails[];
  serviceType: string;
  packagingType?: string;
  labelFormat?: "PDF" | "PNG" | "ZPL";
  commodityDescription?: string;
  declaredValue?: number;
  currency?: string;
  shipDate?: string;
  items?: ShipmentItem[];
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

export interface TrackingResponse {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  events: TrackingEvent[];
}

export interface CarrierAdapter {
  name: string;
  carrierCode: string;
  isConfigured(): boolean;
  validateAddress(request: AddressValidationRequest): Promise<AddressValidationResponse>;
  validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse>;
  checkServiceAvailability(request: ServiceAvailabilityRequest): Promise<ServiceAvailabilityResponse>;
  getRates(request: RateRequest): Promise<RateResponse[]>;
  createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse>;
  trackShipment(trackingNumber: string): Promise<TrackingResponse>;
  cancelShipment(trackingNumber: string, senderCountryCode?: string): Promise<boolean>;
  validateWebhookSignature(payload: string, signature: string): boolean;
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
  if (process.env.FEDEX_MOCK_MODE === "true") return true;
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

  const required = ["FEDEX_CLIENT_ID", "FEDEX_CLIENT_SECRET", "FEDEX_ACCOUNT_NUMBER", "FEDEX_BASE_URL"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    const msg = `FATAL: Missing required FedEx env vars in production: ${missing.join(", ")}`;
    logError(msg, {});
    throw new Error(msg);
  }

  const baseUrl = process.env.FEDEX_BASE_URL || "";
  if (baseUrl.toLowerCase().includes("sandbox")) {
    const msg = "FATAL: FEDEX_BASE_URL contains 'sandbox' in production environment. This is not allowed.";
    logError(msg, {});
    throw new Error(msg);
  }
}

export class FedExAdapter implements CarrierAdapter {
  name = "FedEx";
  carrierCode = "FEDEX";
  
  private accessToken: string | undefined;
  private tokenExpiry: number = 0;

  private get clientId(): string | undefined {
    return process.env.FEDEX_CLIENT_ID || process.env.FEDEX_API_KEY;
  }

  private get clientSecret(): string | undefined {
    return process.env.FEDEX_CLIENT_SECRET || process.env.FEDEX_SECRET_KEY;
  }

  private get accountNumber(): string | undefined {
    return process.env.FEDEX_ACCOUNT_NUMBER;
  }

  private get webhookSecret(): string | undefined {
    return process.env.FEDEX_WEBHOOK_SECRET;
  }

  private get baseUrl(): string {
    return process.env.FEDEX_BASE_URL || "https://apis-sandbox.fedex.com";
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.accountNumber);
  }

  private invalidateToken(): void {
    this.accessToken = undefined;
    this.tokenExpiry = 0;
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
          const errMsg = isProduction()
            ? `FedEx API error: ${response.status}`
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

    if (this.accessToken && Date.now() < this.tokenExpiry) {
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
      };
    } catch (error) {
      logError("FedEx postal code validation error", error);
      if (!isMockAllowed()) {
        throw new CarrierError("POSTAL_VALIDATION_FAILED", (error as Error).message);
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
      const fedexRequest = {
        requestedShipment: {
          shipper: {
            address: {
              postalCode: request.origin.postalCode,
              countryCode: request.origin.countryCode,
              stateOrProvinceCode: request.origin.stateOrProvince,
            },
          },
          recipients: [{
            address: {
              postalCode: request.destination.postalCode,
              countryCode: request.destination.countryCode,
              stateOrProvinceCode: request.destination.stateOrProvince,
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

      try {
        const saResult = await this.checkServiceAvailability({
          origin: { postalCode: request.shipper.postalCode || "", countryCode: request.shipper.countryCode },
          destination: { postalCode: request.recipient.postalCode || "", countryCode: request.recipient.countryCode },
        });
        if (saResult.services.length > 0) {
          const uniqueTypes = [...new Set(saResult.services.map(s => s.serviceType))];
          serviceTypesToTry = uniqueTypes;
          const validPkgs = [...new Set(saResult.services.flatMap(s => s.validPackagingTypes || []))];
          if (validPkgs.length > 0) {
            if (userPackaging && validPkgs.includes(userPackaging)) {
              packagingTypesToTry = [userPackaging, ...validPkgs.filter(p => p !== userPackaging)];
            } else {
              packagingTypesToTry = validPkgs;
            }
          } else {
            packagingTypesToTry = userPackaging ? [userPackaging] : ["YOUR_PACKAGING"];
          }
        } else {
          packagingTypesToTry = userPackaging ? [userPackaging] : ["YOUR_PACKAGING"];
        }
      } catch (saErr) {
        logInfo("Service availability lookup before rates failed, proceeding with defaults", saErr);
        packagingTypesToTry = userPackaging ? [userPackaging] : ["YOUR_PACKAGING"];
      }

      if (request.serviceType && !serviceTypesToTry.includes(request.serviceType)) {
        serviceTypesToTry.unshift(request.serviceType);
      }

      serviceTypesToTry.push("");

      if (serviceTypesToTry.length === 1 && serviceTypesToTry[0] === "") {
        // no-op, we already have the empty string for auto-detect
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
          };
          if (trySvc) {
            requestedShipment.serviceType = trySvc;
          }

          const rateRequest = {
            accountNumber: { value: this.accountNumber },
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
              return {
                baseRate,
                currency: rate.ratedShipmentDetails[0].currency,
                serviceType: rate.serviceType,
                transitDays: rate.operationalDetail?.transitTime || 3,
                deliveryDate: rate.operationalDetail?.deliveryDate 
                  ? new Date(rate.operationalDetail.deliveryDate) 
                  : undefined,
                serviceName: rate.serviceName,
                packagingType: tryPkg,
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
    const baseWeight = request.packages.reduce((sum, pkg) => sum + pkg.weight, 0);
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

    return rates;
  }

  private getSandboxCalculatedRates(
    request: RateRequest,
    serviceTypes: string[],
    packagingTypes: string[]
  ): RateResponse[] {
    const baseWeight = request.packages.reduce((sum, pkg) => sum + pkg.weight, 0);
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

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.createMockShipment(request);
    }

    const isInternational = request.shipper.countryCode !== request.recipient.countryCode;

    if (isInternational && process.env.FEDEX_REQUIRE_HS === "true" && request.items) {
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
              logInfo("Service availability lookup for ship retry failed", saErr);
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

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      if (!isMockAllowed()) {
        throw new CarrierError("NOT_CONFIGURED", "FedEx is not configured and mock mode is disabled in production");
      }
      return this.getMockTracking(trackingNumber);
    }

    try {
      const { data } = await this.makeRequest<any>("/track/v1/trackingnumbers", "POST", {
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
      if (!isMockAllowed()) {
        throw new CarrierError("TRACKING_FAILED", (error as Error).message);
      }
      return this.getMockTracking(trackingNumber);
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
        trackingNumber: {
          trackingNumber,
        },
      });

      logInfo("FedEx shipment cancelled", { trackingNumber });
      return true;
    } catch (error) {
      logError("FedEx cancel shipment error", error);
      if (!isMockAllowed()) {
        throw new CarrierError("CANCEL_FAILED", (error as Error).message);
      }
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
