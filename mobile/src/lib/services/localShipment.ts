import { apiRequest } from "@/api/client";
import { isGuestActive } from "@/store/useGuestStore";
import { LocalAddress } from "@/store/createLocalShipmentStore";
import { RatesResponse, RateQuote, CheckoutResponse } from "@/store/createExpressShipmentStore";

// See createShipment.ts's fetchRates for why this mirrors the authenticated call almost
// exactly: `/api/public/guest/local-rates` validates the same `localShipmentInputSchema`, so
// only the URL/auth changes; `expiresAt` is synthesized since a guest quote is never persisted.
interface GuestRatesResponse {
  quotes: RateQuote[];
  availableCarriers?: Array<{ code: string; name: string }>;
}

function toRatesResponse(guest: GuestRatesResponse): RatesResponse {
  return {
    quotes: guest.quotes,
    availableCarriers: guest.availableCarriers,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

export async function fetchLocalRates(payload: {
  shipper: LocalAddress;
  recipient: LocalAddress;
  pieces: number;
  weight: number;
  weightUnit: "KG" | "LB";
  currency: string;
}): Promise<RatesResponse> {
  if (isGuestActive()) {
    const guestResponse = await apiRequest<GuestRatesResponse>(
      "/api/public/guest/local-rates",
      { method: "POST", anonymous: true, body: payload },
    );
    return toRatesResponse(guestResponse);
  }
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
