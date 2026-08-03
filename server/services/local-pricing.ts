import { storage } from "../storage";
import type { LocalCarrierPricingTier } from "@shared/schema";

export interface LocalRateResult {
  carrierCode: string;
  tierId: string;
  baseRate: number; // carrier base cost (SAR), before markup — feeds accounting.baseRate
  marginAmount: number; // Ezhalha markup (SAR) — feeds accounting.marginAmount
  clientPriceExclTax: number; // baseRate + marginAmount (VAT added by the accounting engine)
}

function tierMatchesWeight(tier: LocalCarrierPricingTier, weightKg: number): boolean {
  const min = Number(tier.minWeightKg);
  const max = tier.maxWeightKg == null ? Infinity : Number(tier.maxWeightKg);
  // Upper bound exclusive so adjacent bands (0–5, 5–10) don't both match 5.
  return weightKg >= min && weightKg < max;
}

/**
 * Resolve a local shipment's price for a carrier + weight, returning the
 * (baseRate, marginAmount) pair to hand to calculateShipmentAccounting with
 * shipmentType="domestic" (DCE — full 15% VAT applied by the engine).
 *
 * baseRate (carrier cost) source order: the matching tier's configured cost
 * (baseRateSar) always wins when set → otherwise the live carrier rate (when the
 * carrier API is wired). Returns null when neither is available or no enabled tier
 * covers the weight/profile.
 *
 * Live-rate fallback: when no enabled tier covers the weight but the carrier returned a
 * live rate (`liveBaseRateSar`, e.g. iMile's domestic estimate), the live rate is priced
 * with `liveFallbackMarginPercent` (the client's pricing-rule margin). This lets a carrier
 * with a live domestic rate API appear in the local flow without a manually-built rate card.
 * A configured rate card, when present, still wins for that carrier/weight.
 */
export async function resolveLocalRate(params: {
  carrierCode: string;
  weightKg: number;
  clientProfile?: string | null;
  liveBaseRateSar?: number | null;
  liveFallbackMarginPercent?: number | null;
}): Promise<LocalRateResult | null> {
  const carrierCode = params.carrierCode.trim().toUpperCase();
  const tiers = (await storage.listLocalCarrierPricingTiers(carrierCode)).filter((t) => t.enabled);

  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const weightMatches = tiers.filter((t) => tierMatchesWeight(t, params.weightKg));
  if (weightMatches.length === 0) {
    // No rate card covers this weight. Fall back to the live carrier rate (if any) priced
    // with the client's pricing-rule margin, so live-rate carriers work without a card.
    if (params.liveBaseRateSar != null && params.liveBaseRateSar > 0) {
      const baseRate = round(params.liveBaseRateSar);
      const marginAmount = round(baseRate * ((params.liveFallbackMarginPercent ?? 0) / 100));
      return {
        carrierCode,
        tierId: "live",
        baseRate,
        marginAmount,
        clientPriceExclTax: round(baseRate + marginAmount),
      };
    }
    return null;
  }

  // Prefer a tier matching the client's profile; fall back to a profile-agnostic tier.
  const profile = params.clientProfile || null;
  const tier =
    weightMatches.find((t) => t.clientProfile && t.clientProfile === profile) ||
    weightMatches.find((t) => !t.clientProfile) ||
    null;
  if (!tier) return null;

  // Always-on carrier cost: an explicitly configured tier cost is authoritative and
  // becomes the markup base even when a live carrier rate is available. The live rate
  // is only a fallback for tiers with no configured cost.
  const baseRate =
    tier.baseRateSar != null
      ? Number(tier.baseRateSar)
      : params.liveBaseRateSar != null
        ? params.liveBaseRateSar
        : null;
  if (baseRate == null) return null;

  const markupValue = Number(tier.markupValue);
  let marginAmount =
    tier.markupType === "flat" ? markupValue : baseRate * (markupValue / 100);

  // Enforce the optional client-price floor by topping up the margin.
  if (tier.minCharge != null) {
    const floor = Number(tier.minCharge);
    const clientPrice = baseRate + marginAmount;
    if (clientPrice < floor) {
      marginAmount += floor - clientPrice;
    }
  }

  const roundedBase = round(baseRate);
  const roundedMargin = round(marginAmount);

  return {
    carrierCode,
    tierId: tier.id,
    baseRate: roundedBase,
    marginAmount: roundedMargin,
    clientPriceExclTax: round(roundedBase + roundedMargin),
  };
}
