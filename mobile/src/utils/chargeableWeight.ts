// Wraps the same shared util used on web. If you have @shared/chargeable-weight
// available to the RN app (e.g. via a shared package), import it directly instead.
import { calculateChargeableWeight, type ChargeableWeightSummary } from "@shared/chargeable-weight";
import { PackageItem } from "@/store/createExpressShipmentStore";

export function getChargeableWeightSummary(
  packages: PackageItem[],
  weightUnit: "LB" | "KG",
  dimensionUnit: "IN" | "CM",
  carrierCode: string,
): ChargeableWeightSummary {
  return calculateChargeableWeight(packages, weightUnit, dimensionUnit, carrierCode || "GENERIC");
}

export function formatWeight(value: number | undefined, unit: string | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `0.000 ${unit || "KG"}`;
  }
  return `${value.toFixed(3)} ${unit || "KG"}`;
}

export function formatPackageWord(count: number) {
  return `${count} package${count === 1 ? "" : "s"}`;
}

export function formatChargeablePackageCounts(actualPackages = 0, dimensionalPackages = 0) {
  return `${formatPackageWord(actualPackages)} charged by actual weight. ${formatPackageWord(dimensionalPackages)} charged by dimensional weight.`;
}

export function getChargeableWeightBasisLabel(actualPackages = 0, dimensionalPackages = 0) {
  if (actualPackages > 0 && dimensionalPackages > 0) return "Mixed billing basis";
  if (dimensionalPackages > 0) return "Charged by dimensional weight";
  return "Charged by actual weight";
}