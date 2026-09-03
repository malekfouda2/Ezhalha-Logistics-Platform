import { apiRequest } from "@/api/client";
import { Address, TradeDocument } from "@/store/createExpressShipmentStore";
import { DdpLane, DdpQuote } from "@/store/createDoorToDoorStore";
import { DdpTransportMethodValue } from "@shared/domain";

export async function fetchDdpLanes() {
  return apiRequest<DdpLane[]>("/api/client/ddp/lanes", { method: "GET" });
}

export interface DdpPackageInput {
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface DdpRatePayload {
  transportMethod: DdpTransportMethodValue;
  shipper: { countryCode: string };
  recipient: Address;
  supplierName: string;
  supplierPhone: string;
  packages: DdpPackageInput[];
  totalCbm?: number;
}

export async function fetchDdpRates(payload: DdpRatePayload) {
  return apiRequest<DdpQuote>("/api/client/ddp/rates", {
    method: "POST",
    body: payload,
  });
}

export interface DdpCheckoutItem {
  itemName: string;
  itemDescription?: string;
  category: string;
  material?: string;
  countryOfOrigin: string;
  hsCode?: string;
  hsCodeSource?: "USER" | "FEDEX" | "HISTORY" | "UNKNOWN";
  hsCodeConfidence?: "HIGH" | "MEDIUM" | "LOW" | "MISSING";
  hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
  price: number;
  quantity: number;
  currency?: string;
}

export interface DdpCheckoutPayload {
  quoteId: string;
  items: DdpCheckoutItem[];
  tradeDocuments: TradeDocument[];
  specialInstructions?: string;
  customsComplianceAccepted: true;
  termsAccepted: true;
  brokerAuthorizationAccepted: true;
}

export interface DdpCheckoutResponse {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  pricing: DdpQuote["pricing"];
}

export async function submitDdpCheckout(payload: DdpCheckoutPayload) {
  return apiRequest<DdpCheckoutResponse>("/api/client/ddp/checkout", {
    method: "POST",
    body: payload,
  });
}
