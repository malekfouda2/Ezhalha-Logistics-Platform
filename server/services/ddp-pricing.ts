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
  // Supplier (procurement) cost and the resulting true margin. supplierCostSar is 0
  // when no supplier cost is configured for the lane's transport method.
  supplierCostPerUnitSar: number;
  supplierCostSar: number;
  trueMarginSar: number;
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

  // Air and domestic both bill by KG; sea bills by CBM. Domestic is a standalone
  // flat SAR-per-KG charge that reuses the same KG minimum/rounding knobs as air.
  const isSea = input.transportMethod === "sea";
  const isKgBilled = !isSea;
  const isDomestic = input.transportMethod === "domestic";
  const isAir = !isSea && !isDomestic;
  if (isAir && input.lane.airEnabled === false) {
    throw new Error("Air delivery is not available for this Door To Door Freight lane");
  }
  const rateLabel = isSea ? "Sea" : isDomestic ? "Domestic" : "Air";
  const ratePerUnitSar = finitePositive(
    isSea ? input.lane.seaBaseRatePerCbm : isDomestic ? input.lane.domesticRatePerKg : input.lane.airBaseRatePerKg,
  );
  if (!ratePerUnitSar) {
    throw new Error(`${rateLabel} pricing is not configured for this Door To Door Freight lane`);
  }

  const rawBillableQuantity = isKgBilled
    ? rounded(packages.reduce((sum, pkg) => sum + pkg.chargeableWeightKg, 0))
    : totalCbm;
  if (!rawBillableQuantity) {
    throw new Error(`Enter ${isKgBilled ? "package weight and dimensions" : "the shipment CBM"} to calculate Door To Door Freight pricing`);
  }

  const minimumBillableQuantity = finitePositive(isKgBilled ? input.lane.minimumBillableKg : input.lane.minimumBillableCbm);
  const roundingIncrement = finitePositive(isKgBilled ? input.lane.kgRoundingIncrement : input.lane.cbmRoundingIncrement);
  const billableQuantity = roundUpToIncrement(Math.max(rawBillableQuantity, minimumBillableQuantity), roundingIncrement);
  const subtotalBeforeMinimumSar = money(billableQuantity * ratePerUnitSar);
  const minimumShipmentChargeSar = money(finitePositive(input.lane.minimumShipmentCharge));
  const baseRateSar = money(Math.max(subtotalBeforeMinimumSar, minimumShipmentChargeSar));
  const markupPercentage = Math.max(0, Number(input.markupPercentage) || 0);
  const markupAmountSar = money(baseRateSar * markupPercentage / 100);

  // Supplier cost is billed on the same billable quantity as the sell base. It is
  // separate from the client-facing rate and only drives margin visibility, so an
  // unconfigured cost is treated as 0 rather than throwing.
  const supplierCostPerUnitSar = finitePositive(
    isSea
      ? input.lane.seaSupplierCostPerCbm
      : isDomestic
        ? input.lane.domesticSupplierCostPerKg
        : input.lane.airSupplierCostPerKg,
  );
  const supplierCostSar = money(billableQuantity * supplierCostPerUnitSar);
  const trueMarginSar = money(baseRateSar + markupAmountSar - supplierCostSar);

  return {
    transportMethod: input.transportMethod,
    billingUnit: isKgBilled ? "KG" : "CBM",
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
    supplierCostPerUnitSar,
    supplierCostSar,
    trueMarginSar,
    actualWeightKg,
    dimensionalWeightKg,
    totalCbm,
    packages,
    // Domestic has no dedicated transit-day fields; fall back to the air lane window.
    transitDaysMin: isSea ? input.lane.seaTransitDaysMin : input.lane.airTransitDaysMin,
    transitDaysMax: isSea ? input.lane.seaTransitDaysMax : input.lane.airTransitDaysMax,
  };
}
