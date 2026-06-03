export type ChargeableWeightUnit = "KG" | "LB";
export type ChargeableDimensionUnit = "CM" | "IN";

export interface ChargeableWeightPackageInput {
  weight: number | string;
  length?: number | string;
  width?: number | string;
  height?: number | string;
}

export interface ChargeableWeightPackageBreakdown {
  index: number;
  actualWeight: number;
  dimensionalWeight: number;
  chargeableWeight: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  chargeableWeightKg: number;
  weightUnit: ChargeableWeightUnit;
  dimensionUnit: ChargeableDimensionUnit;
  divisor: number;
  divisorUnit: "CM_KG" | "IN_KG" | "IN_LB";
  usesDimensionalWeight: boolean;
  roundedDimensions: {
    length: number;
    width: number;
    height: number;
    unit: ChargeableDimensionUnit;
  };
}

export interface ChargeableWeightSummary {
  actualWeight: number;
  dimensionalWeight: number;
  chargeableWeight: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  chargeableWeightKg: number;
  weightUnit: ChargeableWeightUnit;
  dimensionUnit: ChargeableDimensionUnit;
  carrierCode: string;
  packages: ChargeableWeightPackageBreakdown[];
}

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

function toFiniteNumber(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundWeight(value: number): number {
  return Number(value.toFixed(3));
}

function normalizeWeightUnit(unit?: string): ChargeableWeightUnit {
  const normalized = (unit || "KG").toUpperCase();
  return normalized === "LB" || normalized === "LBS" || normalized === "POUND" || normalized === "POUNDS"
    ? "LB"
    : "KG";
}

function normalizeDimensionUnit(unit?: string): ChargeableDimensionUnit {
  const normalized = (unit || "CM").toUpperCase();
  return normalized === "IN" || normalized === "INCH" || normalized === "INCHES" ? "IN" : "CM";
}

export function convertWeight(value: number, fromUnit: string, toUnit: string): number {
  const from = normalizeWeightUnit(fromUnit);
  const to = normalizeWeightUnit(toUnit);

  if (from === to) {
    return value;
  }

  return from === "KG" ? value * LB_PER_KG : value / LB_PER_KG;
}

function toKg(value: number, unit: ChargeableWeightUnit): number {
  return unit === "KG" ? value : value / LB_PER_KG;
}

function fromKg(value: number, unit: ChargeableWeightUnit): number {
  return unit === "KG" ? value : value * LB_PER_KG;
}

function calculateDimensionalWeight(params: {
  length: number;
  width: number;
  height: number;
  dimensionUnit: ChargeableDimensionUnit;
  weightUnit: ChargeableWeightUnit;
  carrierCode: string;
}) {
  const carrierCode = params.carrierCode.toUpperCase();
  const roundedDimensions = {
    length: Math.ceil(params.length),
    width: Math.ceil(params.width),
    height: Math.ceil(params.height),
    unit: params.dimensionUnit,
  };

  const volume = roundedDimensions.length * roundedDimensions.width * roundedDimensions.height;

  if (params.dimensionUnit === "IN" && params.weightUnit === "LB") {
    const dimensionalWeight = volume / 139;
    return {
      dimensionalWeight,
      dimensionalWeightKg: toKg(dimensionalWeight, "LB"),
      divisor: 139,
      divisorUnit: "IN_LB" as const,
      roundedDimensions,
    };
  }

  if (carrierCode === "FEDEX" && params.dimensionUnit === "IN") {
    const dimensionalWeightKg = volume / 305;
    return {
      dimensionalWeight: fromKg(dimensionalWeightKg, params.weightUnit),
      dimensionalWeightKg,
      divisor: 305,
      divisorUnit: "IN_KG" as const,
      roundedDimensions,
    };
  }

  const lengthCm = params.dimensionUnit === "CM" ? roundedDimensions.length : Math.ceil(params.length * CM_PER_IN);
  const widthCm = params.dimensionUnit === "CM" ? roundedDimensions.width : Math.ceil(params.width * CM_PER_IN);
  const heightCm = params.dimensionUnit === "CM" ? roundedDimensions.height : Math.ceil(params.height * CM_PER_IN);
  const dimensionalWeightKg = (lengthCm * widthCm * heightCm) / 5000;

  return {
    dimensionalWeight: fromKg(dimensionalWeightKg, params.weightUnit),
    dimensionalWeightKg,
    divisor: 5000,
    divisorUnit: "CM_KG" as const,
    roundedDimensions:
      params.dimensionUnit === "CM"
        ? roundedDimensions
        : {
            length: lengthCm,
            width: widthCm,
            height: heightCm,
            unit: "CM" as const,
          },
  };
}

export function calculateChargeableWeight(
  packages: ChargeableWeightPackageInput[],
  weightUnit: string = "KG",
  dimensionUnit: string = "CM",
  carrierCode: string = "GENERIC",
): ChargeableWeightSummary {
  const normalizedWeightUnit = normalizeWeightUnit(weightUnit);
  const normalizedDimensionUnit = normalizeDimensionUnit(dimensionUnit);
  const normalizedCarrierCode = carrierCode.toUpperCase();

  const packageBreakdowns = packages.map<ChargeableWeightPackageBreakdown>((pkg, index) => {
    const actualWeight = toFiniteNumber(pkg.weight);
    const actualWeightKg = toKg(actualWeight, normalizedWeightUnit);
    const length = toFiniteNumber(pkg.length);
    const width = toFiniteNumber(pkg.width);
    const height = toFiniteNumber(pkg.height);
    const hasDimensions = length > 0 && width > 0 && height > 0;
    const dimensional = hasDimensions
      ? calculateDimensionalWeight({
          length,
          width,
          height,
          dimensionUnit: normalizedDimensionUnit,
          weightUnit: normalizedWeightUnit,
          carrierCode: normalizedCarrierCode,
        })
      : {
          dimensionalWeight: 0,
          dimensionalWeightKg: 0,
          divisor: normalizedDimensionUnit === "IN" && normalizedWeightUnit === "LB" ? 139 : 5000,
          divisorUnit:
            normalizedDimensionUnit === "IN" && normalizedWeightUnit === "LB"
              ? ("IN_LB" as const)
              : ("CM_KG" as const),
          roundedDimensions: {
            length: 0,
            width: 0,
            height: 0,
            unit: normalizedDimensionUnit,
          },
        };

    const chargeableWeight = Math.max(actualWeight, dimensional.dimensionalWeight);
    const chargeableWeightKg = Math.max(actualWeightKg, dimensional.dimensionalWeightKg);

    return {
      index,
      actualWeight: roundWeight(actualWeight),
      dimensionalWeight: roundWeight(dimensional.dimensionalWeight),
      chargeableWeight: roundWeight(chargeableWeight),
      actualWeightKg: roundWeight(actualWeightKg),
      dimensionalWeightKg: roundWeight(dimensional.dimensionalWeightKg),
      chargeableWeightKg: roundWeight(chargeableWeightKg),
      weightUnit: normalizedWeightUnit,
      dimensionUnit: normalizedDimensionUnit,
      divisor: dimensional.divisor,
      divisorUnit: dimensional.divisorUnit,
      usesDimensionalWeight: dimensional.dimensionalWeight > actualWeight,
      roundedDimensions: dimensional.roundedDimensions,
    };
  });

  const totals = packageBreakdowns.reduce(
    (sum, pkg) => ({
      actualWeight: sum.actualWeight + pkg.actualWeight,
      dimensionalWeight: sum.dimensionalWeight + pkg.dimensionalWeight,
      chargeableWeight: sum.chargeableWeight + pkg.chargeableWeight,
      actualWeightKg: sum.actualWeightKg + pkg.actualWeightKg,
      dimensionalWeightKg: sum.dimensionalWeightKg + pkg.dimensionalWeightKg,
      chargeableWeightKg: sum.chargeableWeightKg + pkg.chargeableWeightKg,
    }),
    {
      actualWeight: 0,
      dimensionalWeight: 0,
      chargeableWeight: 0,
      actualWeightKg: 0,
      dimensionalWeightKg: 0,
      chargeableWeightKg: 0,
    },
  );

  return {
    actualWeight: roundWeight(totals.actualWeight),
    dimensionalWeight: roundWeight(totals.dimensionalWeight),
    chargeableWeight: roundWeight(totals.chargeableWeight),
    actualWeightKg: roundWeight(totals.actualWeightKg),
    dimensionalWeightKg: roundWeight(totals.dimensionalWeightKg),
    chargeableWeightKg: roundWeight(totals.chargeableWeightKg),
    weightUnit: normalizedWeightUnit,
    dimensionUnit: normalizedDimensionUnit,
    carrierCode: normalizedCarrierCode,
    packages: packageBreakdowns,
  };
}
