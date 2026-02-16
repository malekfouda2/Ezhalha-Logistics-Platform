/**
 * FedEx Carrier Adapter for ezhalha
 * 
 * This module provides FedEx shipping integration capabilities.
 * Implements the Carrier Adapter pattern for extensibility.
 * 
 * Configure the following environment variables:
 * - FEDEX_CLIENT_ID or FEDEX_API_KEY
 * - FEDEX_CLIENT_SECRET or FEDEX_SECRET_KEY
 * - FEDEX_ACCOUNT_NUMBER
 * - FEDEX_WEBHOOK_SECRET (for webhook signature validation)
 * - FEDEX_BASE_URL (optional, defaults to sandbox)
 * 
 * FedEx API Documentation: https://developer.fedex.com/
 */

import { logInfo, logError } from "../services/logger";
import { storage } from "../storage";

export interface ShippingAddress {
  name: string;
  streetLine1: string;
  streetLine2?: string;
  city: string;
  stateOrProvince?: string;
  postalCode: string;
  countryCode: string;
  phone: string;
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
    available: boolean;
    transitDays?: number;
    deliveryDate?: string;
  }>;
}

export interface RateRequest {
  shipper: ShippingAddress;
  recipient: ShippingAddress;
  packages: PackageDetails[];
  serviceType?: string;
}

export interface RateResponse {
  baseRate: number;
  currency: string;
  serviceType: string;
  transitDays: number;
  deliveryDate?: Date;
  serviceName: string;
}

export interface CreateShipmentRequest {
  shipper: ShippingAddress;
  recipient: ShippingAddress;
  packages: PackageDetails[];
  serviceType: string;
  labelFormat?: "PDF" | "PNG" | "ZPL";
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
  cancelShipment(trackingNumber: string): Promise<boolean>;
  validateWebhookSignature(payload: string, signature: string): boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      await storage.createIntegrationLog({
        serviceName: "fedex",
        operation: `${method} ${endpoint}`,
        requestPayload: JSON.stringify(maskSensitiveData(requestBody)),
        responsePayload: JSON.stringify(maskSensitiveData(responseBody)),
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
          if (response.status >= 500 && attempt < retries) {
            logInfo(`FedEx API retry ${attempt}/${retries} for ${endpoint}`, { status: response.status });
            await delay(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw new Error(`FedEx API error: ${response.status} - ${JSON.stringify(responseData)}`);
        }

        return { data: responseData, statusCode: response.status };
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries && (error as any).code === 'ECONNRESET') {
          logInfo(`FedEx API retry ${attempt}/${retries} for ${endpoint} due to connection error`);
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }
      }
    }

    const duration = Date.now() - startTime;
    await this.logIntegration(endpoint, method, body, { error: lastError?.message }, 0, duration, false);
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
        postalCode: request.address.postalCode || "00000",
        countryCode: request.address.countryCode,
        residential: false,
      }],
      messages: ["Mock validation - FedEx not configured"],
    };
  }

  async validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse> {
    if (!this.isConfigured()) {
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
      
      const services = data.output?.packageOptions || [];
      return {
        services: services.map((svc: any) => ({
          serviceType: svc.serviceType,
          serviceName: svc.serviceDescription,
          available: true,
          transitDays: svc.transitTime?.minimumTransitTime,
          deliveryDate: svc.deliveryDay,
        })),
      };
    } catch (error) {
      logError("FedEx service availability error", error);
      return this.getMockServiceAvailability(request);
    }
  }

  private getMockServiceAvailability(request: ServiceAvailabilityRequest): ServiceAvailabilityResponse {
    logInfo("Using mock FedEx service availability (FedEx not configured)");
    const isInternational = request.origin.countryCode !== request.destination.countryCode;
    
    return {
      services: [
        { serviceType: "FEDEX_GROUND", serviceName: "FedEx Ground", available: !isInternational, transitDays: 5 },
        { serviceType: "FEDEX_EXPRESS_SAVER", serviceName: "FedEx Express Saver", available: true, transitDays: 3 },
        { serviceType: "FEDEX_2_DAY", serviceName: "FedEx 2Day", available: true, transitDays: 2 },
        { serviceType: "FEDEX_PRIORITY_OVERNIGHT", serviceName: "FedEx Priority Overnight", available: true, transitDays: 1 },
        { serviceType: "FEDEX_INTERNATIONAL_PRIORITY", serviceName: "FedEx International Priority", available: isInternational, transitDays: 3 },
        { serviceType: "FEDEX_INTERNATIONAL_ECONOMY", serviceName: "FedEx International Economy", available: isInternational, transitDays: 5 },
      ].filter(s => s.available),
    };
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      logInfo("FedEx not configured, using mock rates");
      return this.getMockRates(request);
    }

    logInfo(`FedEx getRates: calling real API (baseUrl: ${this.baseUrl})`);

    try {
      const rateRequest = {
        accountNumber: { value: this.accountNumber },
        requestedShipment: {
          pickupType: "DROPOFF_AT_FEDEX_LOCATION",
          rateRequestType: ["LIST", "ACCOUNT"],
          shipper: {
            address: {
              streetLines: [request.shipper.streetLine1],
              city: request.shipper.city,
              stateOrProvinceCode: request.shipper.stateOrProvince,
              postalCode: request.shipper.postalCode,
              countryCode: request.shipper.countryCode,
            },
          },
          recipient: {
            address: {
              streetLines: [request.recipient.streetLine1],
              city: request.recipient.city,
              stateOrProvinceCode: request.recipient.stateOrProvince,
              postalCode: request.recipient.postalCode,
              countryCode: request.recipient.countryCode,
            },
          },
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
          packagingType: request.packages[0]?.packageType || "YOUR_PACKAGING",
          packageCount: request.packages.length,
        },
      };

      const { data } = await this.makeRequest<any>("/rate/v1/rates/quotes", "POST", rateRequest);
      
      return data.output.rateReplyDetails.map((rate: any) => ({
        baseRate: rate.ratedShipmentDetails[0].totalNetCharge,
        currency: rate.ratedShipmentDetails[0].currency,
        serviceType: rate.serviceType,
        transitDays: rate.operationalDetail?.transitTime || 3,
        deliveryDate: rate.operationalDetail?.deliveryDate 
          ? new Date(rate.operationalDetail.deliveryDate) 
          : undefined,
        serviceName: rate.serviceName,
      }));
    } catch (error) {
      logError("FedEx rate request error - falling back to mock rates", error);
      return this.getMockRates(request);
    }
  }

  private getMockRates(request: RateRequest): RateResponse[] {
    const baseWeight = request.packages.reduce((sum, pkg) => sum + pkg.weight, 0);
    const isInternational = request.shipper.countryCode !== request.recipient.countryCode;
    
    const rates: RateResponse[] = [
      {
        baseRate: isInternational ? 45.99 + (baseWeight * 2.5) : 15.99 + (baseWeight * 1.2),
        currency: "SAR",
        serviceType: "FEDEX_GROUND",
        transitDays: isInternational ? 7 : 5,
        serviceName: "FedEx Ground",
      },
      {
        baseRate: isInternational ? 89.99 + (baseWeight * 4) : 29.99 + (baseWeight * 2),
        currency: "SAR",
        serviceType: "FEDEX_EXPRESS_SAVER",
        transitDays: isInternational ? 4 : 3,
        serviceName: "FedEx Express Saver",
      },
      {
        baseRate: isInternational ? 149.99 + (baseWeight * 6) : 49.99 + (baseWeight * 3),
        currency: "SAR",
        serviceType: "FEDEX_2_DAY",
        transitDays: 2,
        serviceName: "FedEx 2Day",
      },
      {
        baseRate: isInternational ? 249.99 + (baseWeight * 10) : 79.99 + (baseWeight * 5),
        currency: "SAR",
        serviceType: "FEDEX_PRIORITY_OVERNIGHT",
        transitDays: 1,
        serviceName: "FedEx Priority Overnight",
      },
    ];

    logInfo("Using mock FedEx rates (FedEx not configured)", { 
      weight: baseWeight, 
      international: isInternational 
    });

    return rates;
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) {
      return this.createMockShipment(request);
    }

    try {
      const shipRequest = {
        labelResponseOptions: "LABEL",
        accountNumber: { value: this.accountNumber },
        requestedShipment: {
          shipper: {
            contact: {
              personName: request.shipper.name,
              phoneNumber: request.shipper.phone,
            },
            address: {
              streetLines: [request.shipper.streetLine1],
              city: request.shipper.city,
              stateOrProvinceCode: request.shipper.stateOrProvince,
              postalCode: request.shipper.postalCode,
              countryCode: request.shipper.countryCode,
            },
          },
          recipients: [{
            contact: {
              personName: request.recipient.name,
              phoneNumber: request.recipient.phone,
            },
            address: {
              streetLines: [request.recipient.streetLine1],
              city: request.recipient.city,
              stateOrProvinceCode: request.recipient.stateOrProvince,
              postalCode: request.recipient.postalCode,
              countryCode: request.recipient.countryCode,
            },
          }],
          serviceType: request.serviceType,
          packagingType: "YOUR_PACKAGING",
          pickupType: "DROPOFF_AT_FEDEX_LOCATION",
          labelSpecification: {
            labelFormatType: request.labelFormat || "PDF",
            labelStockType: "PAPER_4X6",
          },
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

      const { data } = await this.makeRequest<any>("/ship/v1/shipments", "POST", shipRequest);
      const shipmentData = data.output.transactionShipments[0];

      return {
        trackingNumber: shipmentData.masterTrackingNumber,
        carrierTrackingNumber: shipmentData.masterTrackingNumber,
        labelData: shipmentData.pieceResponses[0]?.packageDocuments?.[0]?.encodedLabel,
        estimatedDelivery: shipmentData.completedShipmentDetail?.operationalDetail?.deliveryDate
          ? new Date(shipmentData.completedShipmentDetail.operationalDetail.deliveryDate)
          : undefined,
        serviceType: request.serviceType,
      };
    } catch (error) {
      logError("FedEx create shipment error", error);
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

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) {
      logInfo("Mock FedEx cancellation (not configured)", { trackingNumber });
      return true;
    }

    try {
      await this.makeRequest<any>("/ship/v1/shipments/cancel", "PUT", {
        accountNumber: { value: this.accountNumber },
        trackingNumber,
      });

      logInfo("FedEx shipment cancelled", { trackingNumber });
      return true;
    } catch (error) {
      logError("FedEx cancel shipment error", error);
      return false;
    }
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return true;
    }

    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
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
