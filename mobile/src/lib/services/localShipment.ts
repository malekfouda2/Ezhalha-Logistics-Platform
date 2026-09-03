import { apiRequest } from "@/api/client";
import { LocalAddress } from "@/store/createLocalShipmentStore";
import { RatesResponse, CheckoutResponse } from "@/store/createShipmentStore";

export async function fetchLocalRates(payload: {
  shipper: LocalAddress;
  recipient: LocalAddress;
  pieces: number;
  weight: number;
  weightUnit: "KG" | "LB";
  currency: string;
}): Promise<RatesResponse> {
  return apiRequest<RatesResponse>("/api/client/local/rates", {
    method: "POST",
    body: payload,
  });
}

export async function submitLocalCheckout(payload: { quoteId: string }): Promise<CheckoutResponse> {
  return apiRequest<CheckoutResponse>("/api/client/local/checkout", {
    method: "POST",
    body: payload,
  });
}
