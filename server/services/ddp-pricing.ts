import type { DdpPricingLane, DdpTransportMethodValue } from "@shared/schema";

export interface DdpPackageInput {
  weight: number;
  length?: number;
  width?: number;
  height?: number;
}

export interface DdpPriceInput {
  lane: DdpPricingLane;
  transportMethod: DdpTransportMethodValue;
  packages: DdpPackageInput[];
  totalCbm?: number;
  markupPercentage: number;
}

export interface DdpPackagePricingBreakdown {
  index: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  chargeableWeightKg: number;
  usesDimensionalWeight: boolean;
}

export interface DdpPriceQuote {
  transportMethod: DdpTransportMethodValue;
  billingUnit: "KG" | "CBM";
  rawBillableQuantity: number;
  minimumBillableQuantity: number;
  roundingIncrement: number;
  billableQuantity: number;
  ratePerUnitSar: number;
  subtotalBeforeMinimumSar: number;
  minimumShipmentChargeSar: number;
  baseRateSar: number;
  markupPercentage: number;
  markupAmountSar: number;
  totalAmountSar: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  totalCbm: number;
  packages: DdpPackagePricingBreakdown[];
  transitDaysMin: number | null;
  transitDaysMax: number | null;
}

function finitePositive(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rounded(value: number, precision = 4): number {
  return Number(value.toFixed(precision));
}

function money(value: number): number {
  return rounded(value, 2);
}

function roundUpToIncrement(value: number, increment: number): number {
  return increment > 0 ? rounded(Math.ceil((value - Number.EPSILON) / increment) * increment) : rounded(value);
}

export function calculateDdpPrice(input: DdpPriceInput): DdpPriceQuote {
  const divisor = finitePositive(input.lane.volumetricDivisor) || 6000;
  const packages = input.packages.map<DdpPackagePricingBreakdown>((pkg, index) => {
    const actualWeightKg = finitePositive(pkg.weight);
    const dimensionalWeightKg =
      finitePositive(pkg.length) * finitePositive(pkg.width) * finitePositive(pkg.height) / divisor;

    return {
      index,
      actualWeightKg: rounded(actualWeightKg),
      dimensionalWeightKg: rounded(dimensionalWeightKg),
      chargeableWeightKg: rounded(Math.max(actualWeightKg, dimensionalWeightKg)),
      usesDimensionalWeight: dimensionalWeightKg > actualWeightKg,
    };
  });
  const actualWeightKg = rounded(packages.reduce((sum, pkg) => sum + pkg.actualWeightKg, 0));
  const dimensionalWeightKg = rounded(packages.reduce((sum, pkg) => sum + pkg.dimensionalWeightKg, 0));
  const calculatedCbm = rounded(
    input.packages.reduce(
      (sum, pkg) => sum + finitePositive(pkg.length) * finitePositive(pkg.width) * finitePositive(pkg.height) / 1_000_000,
      0,
    ),
  );
  const totalCbm = rounded(finitePositive(input.totalCbm) || calculatedCbm);

  const isAir = input.transportMethod === "air";
  const ratePerUnitSar = finitePositive(isAir ? input.lane.airBaseRatePerKg : input.lane.seaBaseRatePerCbm);
  if (!ratePerUnitSar) {
    throw new Error(`${isAir ? "Air" : "Sea"} pricing is not configured for this DDP lane`);
  }

  const rawBillableQuantity = isAir
    ? rounded(packages.reduce((sum, pkg) => sum + pkg.chargeableWeightKg, 0))
    : totalCbm;
  if (!rawBillableQuantity) {
    throw new Error(`Enter ${isAir ? "package weight and dimensions" : "the shipment CBM"} to calculate DDP pricing`);
  }

  const minimumBillableQuantity = finitePositive(isAir ? input.lane.minimumBillableKg : input.lane.minimumBillableCbm);
  const roundingIncrement = finitePositive(isAir ? input.lane.kgRoundingIncrement : input.lane.cbmRoundingIncrement);
  const billableQuantity = roundUpToIncrement(Math.max(rawBillableQuantity, minimumBillableQuantity), roundingIncrement);
  const subtotalBeforeMinimumSar = money(billableQuantity * ratePerUnitSar);
  const minimumShipmentChargeSar = money(finitePositive(input.lane.minimumShipmentCharge));
  const baseRateSar = money(Math.max(subtotalBeforeMinimumSar, minimumShipmentChargeSar));
  const markupPercentage = Math.max(0, Number(input.markupPercentage) || 0);
  const markupAmountSar = money(baseRateSar * markupPercentage / 100);

  return {
    transportMethod: input.transportMethod,
    billingUnit: isAir ? "KG" : "CBM",
    rawBillableQuantity,
    minimumBillableQuantity,
    roundingIncrement,
    billableQuantity,
    ratePerUnitSar,
    subtotalBeforeMinimumSar,
    minimumShipmentChargeSar,
    baseRateSar,
    markupPercentage,
    markupAmountSar,
    totalAmountSar: money(baseRateSar + markupAmountSar),
    actualWeightKg,
    dimensionalWeightKg,
    totalCbm,
    packages,
    transitDaysMin: isAir ? input.lane.airTransitDaysMin : input.lane.seaTransitDaysMin,
    transitDaysMax: isAir ? input.lane.airTransitDaysMax : input.lane.seaTransitDaysMax,
  };
}
