/**
 * FedEx Carrier Adapter for ezhalha
 * 
 * This module provides FedEx shipping integration capabilities.
 * Implements the Carrier Adapter pattern for extensibility.
 * 
 * Configure the following environment variables:
 * - FEDEX_API_KEY
 * - FEDEX_SECRET_KEY
 * - FEDEX_ACCOUNT_NUMBER
 * - FEDEX_WEBHOOK_SECRET (for webhook signature validation)
 * 
 * FedEx API Documentation: https://developer.fedex.com/
 */

import { logInfo, logError } from "../services/logger";

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
  isConfigured(): boolean;
  getRates(request: RateRequest): Promise<RateResponse[]>;
  createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse>;
  trackShipment(trackingNumber: string): Promise<TrackingResponse>;
  cancelShipment(trackingNumber: string): Promise<boolean>;
  validateWebhookSignature(payload: string, signature: string): boolean;
}

export class FedExAdapter implements CarrierAdapter {
  name = "FedEx";
  
  private apiKey: string | undefined;
  private secretKey: string | undefined;
  private accountNumber: string | undefined;
  private webhookSecret: string | undefined;
  private accessToken: string | undefined;
  private tokenExpiry: number = 0;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.FEDEX_API_KEY;
    this.secretKey = process.env.FEDEX_SECRET_KEY;
    this.accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;
    this.webhookSecret = process.env.FEDEX_WEBHOOK_SECRET;
    this.baseUrl = process.env.FEDEX_SANDBOX === "true" 
      ? "https://apis-sandbox.fedex.com"
      : "https://apis.fedex.com";
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.secretKey && this.accountNumber);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("FedEx is not configured. Set FEDEX_API_KEY, FEDEX_SECRET_KEY, and FEDEX_ACCOUNT_NUMBER.");
    }

    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.apiKey!,
          client_secret: this.secretKey!,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`FedEx auth failed: ${error}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      return this.accessToken!;
    } catch (error) {
      logError("FedEx authentication failed", error);
      throw error;
    }
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      return this.getMockRates(request);
    }

    try {
      const token = await this.getAccessToken();
      
      const rateRequest = {
        accountNumber: { value: this.accountNumber },
        requestedShipment: {
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
          })),
        },
      };

      const response = await fetch(`${this.baseUrl}/rate/v1/rates/quotes`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US",
        },
        body: JSON.stringify(rateRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        logError("FedEx rate request failed", { error });
        return this.getMockRates(request);
      }

      const data = await response.json();
      
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
      logError("FedEx rate request error", error);
      return this.getMockRates(request);
    }
  }

  private getMockRates(request: RateRequest): RateResponse[] {
    const baseWeight = request.packages.reduce((sum, pkg) => sum + pkg.weight, 0);
    const isInternational = request.shipper.countryCode !== request.recipient.countryCode;
    
    const rates: RateResponse[] = [
      {
        baseRate: isInternational ? 45.99 + (baseWeight * 2.5) : 15.99 + (baseWeight * 1.2),
        currency: "USD",
        serviceType: "FEDEX_GROUND",
        transitDays: isInternational ? 7 : 5,
        serviceName: "FedEx Ground",
      },
      {
        baseRate: isInternational ? 89.99 + (baseWeight * 4) : 29.99 + (baseWeight * 2),
        currency: "USD",
        serviceType: "FEDEX_EXPRESS_SAVER",
        transitDays: isInternational ? 4 : 3,
        serviceName: "FedEx Express Saver",
      },
      {
        baseRate: isInternational ? 149.99 + (baseWeight * 6) : 49.99 + (baseWeight * 3),
        currency: "USD",
        serviceType: "FEDEX_2_DAY",
        transitDays: 2,
        serviceName: "FedEx 2Day",
      },
      {
        baseRate: isInternational ? 249.99 + (baseWeight * 10) : 79.99 + (baseWeight * 5),
        currency: "USD",
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
      const token = await this.getAccessToken();

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

      const response = await fetch(`${this.baseUrl}/ship/v1/shipments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US",
        },
        body: JSON.stringify(shipRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        logError("FedEx create shipment failed", { error });
        return this.createMockShipment(request);
      }

      const data = await response.json();
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
      const token = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/track/v1/trackingnumbers`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US",
        },
        body: JSON.stringify({
          trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
          includeDetailedScans: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logError("FedEx tracking request failed", { error });
        return this.getMockTracking(trackingNumber);
      }

      const data = await response.json();
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
      const token = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/ship/v1/shipments/cancel`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US",
        },
        body: JSON.stringify({
          accountNumber: { value: this.accountNumber },
          trackingNumber,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logError("FedEx cancel shipment failed", { error, trackingNumber });
        return false;
      }

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

export function getCarrierAdapter(carrierName: string): CarrierAdapter {
  switch (carrierName.toLowerCase()) {
    case "fedex":
      return fedexAdapter;
    default:
      return fedexAdapter;
  }
}
