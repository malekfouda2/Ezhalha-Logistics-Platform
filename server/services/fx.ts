// Foreign-exchange rates for multi-currency checkout.
//
// SAR is the platform's accounting source of truth: every stored monetary column
// (baseRate, margin, finalPrice, VAT, invoices…) is in SAR. Non-SAR currencies are a
// *presentation + charge* layer only — we convert SAR → the client's currency at
// display/checkout time and snapshot the rate onto the shipment so historical amounts
// stay reproducible.
//
// Rates come from a free live provider (open.er-api.com, no API key). SAR is pegged to
// USD at 3.75, so the pegged fallback below is accurate even when the provider is down.

import { logError } from "./logger";

export const BASE_CURRENCY = "SAR";
export const SUPPORTED_CURRENCIES = ["SAR", "USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// SAR → currency multipliers used when the live provider is unavailable.
// SAR is pegged to USD at 3.75 (1 SAR = 0.266667 USD), so this is effectively exact.
const PEGGED_FALLBACK: Record<string, number> = {
  SAR: 1,
  USD: 1 / 3.75,
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { rate: number; fetchedAt: number }>();

function fxApiBase(): string {
  return process.env.FX_API_BASE || "https://open.er-api.com/v6/latest";
}

export function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return !!value && (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

export function normalizeCurrency(value: string | null | undefined): SupportedCurrency {
  const upper = (value || BASE_CURRENCY).toUpperCase();
  return isSupportedCurrency(upper) ? upper : BASE_CURRENCY;
}

// Live SAR → target multiplier. Cached for an hour; falls back to the USD peg on any error.
export async function getSarRate(targetCurrency: string): Promise<number> {
  const target = normalizeCurrency(targetCurrency);
  if (target === BASE_CURRENCY) return 1;

  const cached = cache.get(target);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  try {
    const res = await fetch(`${fxApiBase()}/${BASE_CURRENCY}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    const data: any = await res.json();
    const rate = Number(data?.rates?.[target]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX provider returned no usable rate");
    cache.set(target, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (error) {
    logError("FX rate fetch failed — using pegged fallback", {
      target,
      error: error instanceof Error ? error.message : String(error),
    });
    const fallback = PEGGED_FALLBACK[target] ?? 1;
    // Cache the fallback briefly so a provider outage doesn't hammer it every request.
    cache.set(target, { rate: fallback, fetchedAt: Date.now() - CACHE_TTL_MS / 2 });
    return fallback;
  }
}

// Convert a SAR amount into `currency` using an explicit rate (snapshot) when provided,
// otherwise 1:1 for SAR. Rounds to 2 decimals (both SAR and USD use 2 for charging).
export function convertFromSar(amountSar: number, currency: string, rate: number): number {
  if (normalizeCurrency(currency) === BASE_CURRENCY) return round2(amountSar);
  return round2(amountSar * rate);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
