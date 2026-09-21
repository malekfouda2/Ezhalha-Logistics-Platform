/**
 * The public API, as the marketing site sees it.
 *
 * nginx proxies `ezhalha.co/api/` to the same Node backend that serves the portal, so these are
 * same-origin requests and there is no CORS, no preflight and no credentials to think about.
 * Both endpoints are unauthenticated by design and neither sets a cookie.
 */

export type QuoteRate = {
  carrierCode?: string;
  carrierName?: string;
  serviceType?: string;
  serviceName?: string;
  transportMethod?: string;
  billingUnit?: string;
  billableQuantity?: number;
  ratePerUnit?: number;
  vat: number;
  clientTotal: number;
  transitDays: number | null;
};

export type QuoteResponse = {
  chargeable: { totalWeightKg: number; totalCbm: number; chargeableAirKg: number; pieces: number };
  local: QuoteRate[];
  ddp: QuoteRate[];
  express: QuoteRate[];
  available: { local: boolean; ddp: boolean; express: boolean };
  currency: string;
  indicative: boolean;
};

export type TrackEvent = { description: string; occurredAt: string; location: string | null };

export type TrackResponse = {
  trackingNumber: string;
  status: string;
  origin: { city: string | null; country: string | null };
  destination: { city: string | null; country: string | null };
  carrier: string | null;
  pieces: number;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  events: TrackEvent[];
};

/** Distinguishes "we could not reach the server" from "the server said no, and why". */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<never> {
  let body: { error?: string; message?: string; code?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* a proxy error page is not JSON; fall through to the status-based message */
  }
  throw new ApiError(
    body.error ?? body.message ?? `Request failed (${response.status})`,
    response.status,
    body.code,
  );
}

export type QuoteRequest = {
  origin: { countryCode: string };
  destination: { countryCode: string };
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  pieces?: number;
};

export async function fetchQuote(input: QuoteRequest, signal?: AbortSignal): Promise<QuoteResponse> {
  const response = await fetch("/api/public/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) return readError(response);
  return response.json();
}

export async function fetchTracking(trackingNumber: string, signal?: AbortSignal): Promise<TrackResponse> {
  const clean = trackingNumber.trim().toUpperCase().replace(/[\s-]/g, "");
  const response = await fetch(`/api/public/track/${encodeURIComponent(clean)}`, { signal });
  if (!response.ok) return readError(response);
  return response.json();
}

/**
 * Where a visitor goes to actually book. The portal lives on its own subdomain. `VITE_APP_ORIGIN`
 * points a staging build at the staging portal, so reviewing it never hands off to production.
 */
export const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN || "https://app.ezhalha.co";

/**
 * Carry the priced lane into the application form, so someone who just saw a number does not have
 * to describe their shipment a second time. `apply.tsx` already reads a guest draft on mount.
 */
export function signupHref(quote?: QuoteRequest): string {
  const url = new URL("/apply", APP_ORIGIN);
  if (quote) {
    url.searchParams.set("from", quote.origin.countryCode);
    url.searchParams.set("to", quote.destination.countryCode);
    url.searchParams.set("weight", String(quote.weightKg));
    if (quote.pieces && quote.pieces > 1) url.searchParams.set("pieces", String(quote.pieces));
  }
  return url.toString();
}
