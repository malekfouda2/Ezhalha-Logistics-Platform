import { apiRequest } from "@/api/client";

export interface OrderRow {
  id: string;
  externalOrderNumber: string | null;
  externalOrderId: string;
  salesChannelId: string;
  status: "new" | "assigned" | "shipped" | "delivered" | "cancelled";
  customer: string | null;
  shipTo: string | null;
  packageWeightKg: string | null;
  packagePieces: number;
  orderTotal: string | null;
  currency: string;
  assignedCarrierCode: string | null;
  shipmentId: string | null;
}

export interface OrderRate {
  carrierCode: string;
  carrierName: string;
  serviceName: string;
  weightKg: number;
  totalAmountSar: number;
  currency: string;
}

export interface FulfillOrderResult {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  carrierCode: string;
  carrierName: string;
}

export async function listOrders() {
  return apiRequest<OrderRow[]>("/api/client/orders", { method: "GET" });
}

export async function getOrder(id: string) {
  return apiRequest<OrderRow>(`/api/client/orders/${id}`, { method: "GET" });
}

export async function getOrderRates(id: string, weightKg: number) {
  return apiRequest<{ weightKg: number; rates: OrderRate[] }>(
    `/api/client/orders/${id}/rates?weightKg=${weightKg}`,
    { method: "GET" },
  );
}

export async function fulfillOrder(id: string, payload: { carrierCode: string; weightKg?: number }) {
  return apiRequest<FulfillOrderResult>(`/api/client/orders/${id}/fulfill`, {
    method: "POST",
    body: payload,
  });
}

export function parseOrderJson<T>(value: string | null): Partial<T> {
  if (!value) return {};
  try {
    return JSON.parse(value) as T;
  } catch {
    return {};
  }
}
