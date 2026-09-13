import { api } from "@/api/client";

export interface QuickQuoteRequest {
  origin: { countryCode: string; city?: string };
  destination: { countryCode: string; city?: string };
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  pieces?: number;
}

export interface LocalQuote {
  carrierCode: string;
  carrierName: string;
  baseRate: number;
  markup: number;
  vat: number;
  clientTotal: number;
  transitDays: number;
}

export interface ExpressQuote {
  carrierCode: string;
  carrierName: string;
  serviceType: string;
  serviceName: string;
  clientTotal: number;
  transitDays: number | null;
}

export type DdpTransportMethod = "air" | "sea" | "domestic";

export interface DdpQuote {
  transportMethod: DdpTransportMethod;
  billingUnit: "KG" | "CBM";
  billableQuantity: number;
  ratePerUnit: number;
  baseRate: number;
  markup: number;
  vat: number;
  clientTotal: number;
  transitDays: number;
  laneId: string;
}

export interface QuickQuoteResponse {
  chargeable: { totalWeightKg: number; totalCbm: number; chargeableAirKg: number; pieces: number };
  local: LocalQuote[];
  ddp: DdpQuote[];
  express: ExpressQuote[];
  available: { local: boolean; ddp: boolean; express: boolean };
  currency: string;
}

export function fetchQuickQuote(payload: QuickQuoteRequest) {
  return api.post<QuickQuoteResponse>("/api/client/quick-quote", payload);
}
