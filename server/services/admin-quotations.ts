import { storage } from "../storage";
import { resolveLocalRate } from "./local-pricing";
import { calculateDdpPrice } from "./ddp-pricing";
import { calculateShipmentAccounting } from "./shipment-accounting";
import { DdpTransportMethod, type DdpTransportMethodValue, type ShipmentTypeValue } from "@shared/schema";

export type QuotationType = "express" | "local" | "ddp";

export interface QuotationPricingInput {
  type: QuotationType;
  clientProfile: string | null;
  // Route + weight (all types)
  originCountryCode: string;
  destinationCountryCode: string;
  destinationCity?: string;
  weightKg: number; // total shipment weight
  pieces?: number;
  length?: number;
  width?: number;
  height?: number;
  totalCbm?: number;
  // express: the live carrier base rate the admin already fetched (per chosen carrier/service)
  baseRateSar?: number;
  carrierCode?: string;
  // ddp
  ddpTransportMethod?: DdpTransportMethodValue;
  // Admin manual pricing controls (applied on top of the auto rate)
  discountSar?: number;
  discountType?: "percent" | "fixed"; // when set with discountValue, resolves discountSar
  discountValue?: number;
  extraChargeSar?: number;
  priceOverrideSar?: number; // final client total (incl VAT) — wins over discount/extra
}

export interface QuotationPricing {
  baseRate: number;
  autoMarginAmount: number; // system-suggested margin before admin adjustments
  autoClientTotal: number;
  marginAmount: number; // effective margin after override/discount/extra
  discountSar: number;
  extraChargeSar: number;
  clientTotalSar: number; // final client total (incl VAT)
  vatAmountSar: number;
  shipmentType: ShipmentTypeValue;
  isDdp: boolean;
  supplierCostSar?: number; // DDP only
  ddpBillingUnit?: "KG" | "CBM";
  ddpBillableQuantity?: number;
  ddpRatePerUnitSar?: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// clientTotal is linear in marginAmount for every VAT scenario, so solve it with two forward
// evaluations — scenario-agnostic and exact, no VAT back-computation guesswork.
function solveMarginForTotal(
  params: { shipmentType: ShipmentTypeValue; isDdp: boolean; recipientCountryCode: string; baseRate: number },
  targetTotal: number,
): number {
  const calc = (marginAmount: number) =>
    calculateShipmentAccounting({ ...params, marginAmount }).clientTotalAmountSar;
  const t0 = calc(0);
  const t1 = calc(100);
  const slope = (t1 - t0) / 100;
  if (slope <= 0) return 0;
  return Math.max(0, round2((targetTotal - t0) / slope));
}

function shipmentTypeForRoute(origin: string, destination: string): ShipmentTypeValue {
  if (origin === destination) return "domestic";
  return destination === "SA" ? "inbound" : "outbound";
}

/**
 * Compute a quotation's pricing for any shipment type, reusing the exact production rate
 * engines, then apply the admin's manual override / discount / extra charge. Returns the
 * full breakdown; performs no DB writes.
 */
export async function computeQuotationPricing(input: QuotationPricingInput): Promise<QuotationPricing> {
  const origin = input.originCountryCode.toUpperCase();
  const destination = input.destinationCountryCode.toUpperCase();
  const pieces = input.pieces && input.pieces > 0 ? input.pieces : 1;
  const pricingRule = input.clientProfile ? await storage.getPricingRuleByProfile(input.clientProfile) : undefined;

  let baseRate = 0;
  let autoMargin = 0;
  let shipmentType: ShipmentTypeValue;
  let isDdp = false;
  let supplierCostSar: number | undefined;
  let ddpBillingUnit: "KG" | "CBM" | undefined;
  let ddpBillableQuantity: number | undefined;
  let ddpRatePerUnitSar: number | undefined;

  if (input.type === "local") {
    shipmentType = "domestic";
    // For a no-card carrier with a live domestic rate (iMile), price the live rate the
    // frontend forwarded (input.baseRateSar) with the client's pricing-rule margin — matching
    // the rates-endpoint display. A configured rate card still wins when present.
    const liveFallbackMarginPercent =
      input.baseRateSar != null && input.baseRateSar > 0
        ? pricingRule
          ? await storage.getMarginForAmount(pricingRule.id, input.baseRateSar)
          : 20
        : null;
    const local = await resolveLocalRate({
      carrierCode: input.carrierCode || "",
      weightKg: input.weightKg,
      clientProfile: input.clientProfile,
      liveBaseRateSar: input.baseRateSar ?? null,
      liveFallbackMarginPercent,
    });
    if (!local) throw new Error("No local rate available for this carrier / weight.");
    baseRate = local.baseRate;
    autoMargin = local.marginAmount;
  } else if (input.type === "ddp") {
    shipmentType = "inbound";
    isDdp = true;
    const lane = await storage.findDdpPricingLane({
      originCountryCode: origin,
      destinationCountryCode: destination,
      destinationCity: input.destinationCity,
    });
    if (!lane || !lane.isActive) throw new Error("No Door To Door Freight lane configured for this origin/destination.");
    const transportMethod = input.ddpTransportMethod || DdpTransportMethod.AIR;
    const isKgBilled = transportMethod !== DdpTransportMethod.SEA;
    const packages = isKgBilled
      ? Array.from({ length: pieces }, () => ({
          weight: input.weightKg / pieces,
          length: input.length || 0,
          width: input.width || 0,
          height: input.height || 0,
        }))
      : [];
    const totalCbm = input.totalCbm ?? ((input.length || 0) * (input.width || 0) * (input.height || 0)) / 1_000_000 * pieces;
    const base = calculateDdpPrice({ lane, transportMethod, packages, totalCbm, markupPercentage: 0 });
    const markupPercentage = pricingRule
      ? await storage.getDdpMarginForQuantity(pricingRule.id, base.billingUnit, base.billableQuantity)
      : 0;
    const quote = calculateDdpPrice({ lane, transportMethod, packages, totalCbm, markupPercentage });
    baseRate = quote.baseRateSar;
    autoMargin = quote.markupAmountSar;
    supplierCostSar = quote.supplierCostSar;
    ddpBillingUnit = quote.billingUnit;
    ddpBillableQuantity = quote.billableQuantity;
    ddpRatePerUnitSar = quote.ratePerUnitSar;
  } else {
    // express — the admin supplies the live carrier base rate for the chosen carrier/service.
    shipmentType = shipmentTypeForRoute(origin, destination);
    if (!Number.isFinite(input.baseRateSar) || (input.baseRateSar ?? 0) <= 0) {
      throw new Error("A carrier base rate is required for an express quotation.");
    }
    baseRate = round2(input.baseRateSar!);
    const marginPct = pricingRule ? await storage.getMarginForAmount(pricingRule.id, baseRate) : 20;
    autoMargin = round2(baseRate * (marginPct / 100));
  }

  const accountingParams = { shipmentType, isDdp, recipientCountryCode: destination, baseRate };
  const autoSnapshot = calculateShipmentAccounting({ ...accountingParams, marginAmount: autoMargin });
  const autoClientTotal = autoSnapshot.clientTotalAmountSar;

  // Resolve the discount: percent of the auto client total, or a fixed SAR amount.
  // discountType/discountValue win over a raw discountSar when provided.
  const discountSar =
    input.discountType && input.discountValue != null
      ? Math.max(
          0,
          input.discountType === "percent"
            ? round2(autoClientTotal * Math.min(Math.max(input.discountValue, 0), 100) / 100)
            : round2(Math.max(input.discountValue, 0)),
        )
      : Math.max(0, round2(input.discountSar || 0));
  const extraChargeSar = Math.max(0, round2(input.extraChargeSar || 0));

  // An explicit price override still solves the margin to hit that exact total. Otherwise keep
  // the full list markup and let the discount/extra reduce the client total (the discount comes
  // off the shipment total, NOT out of the markup).
  let marginAmount: number;
  let snapshot: ReturnType<typeof calculateShipmentAccounting>;
  if (input.priceOverrideSar != null && input.priceOverrideSar >= 0) {
    marginAmount = solveMarginForTotal(accountingParams, round2(input.priceOverrideSar));
    snapshot = calculateShipmentAccounting({ ...accountingParams, marginAmount });
  } else {
    marginAmount = round2(autoMargin);
    snapshot = calculateShipmentAccounting({ ...accountingParams, marginAmount, discountSar, extraChargeSar });
  }

  return {
    baseRate: round2(baseRate),
    autoMarginAmount: round2(autoMargin),
    autoClientTotal: round2(autoClientTotal),
    marginAmount,
    discountSar,
    extraChargeSar,
    clientTotalSar: snapshot.clientTotalAmountSar,
    vatAmountSar: snapshot.sellTaxAmountSar,
    shipmentType,
    isDdp,
    supplierCostSar: supplierCostSar != null ? round2(supplierCostSar) : undefined,
    ddpBillingUnit,
    ddpBillableQuantity,
    ddpRatePerUnitSar,
  };
}
