import { describe, expect, it } from "vitest";
import { calculateChargeableWeight } from "@shared/chargeable-weight";

describe("chargeable weight calculation", () => {
  it("uses FedEx imperial divisor per package", () => {
    const summary = calculateChargeableWeight(
      [{ weight: 5, length: 20, width: 15, height: 10 }],
      "LB",
      "IN",
      "FEDEX",
    );

    expect(summary.actualWeight).toBe(5);
    expect(summary.dimensionalWeight).toBe(21.583);
    expect(summary.chargeableWeight).toBe(21.583);
    expect(summary.packages[0].divisor).toBe(139);
    expect(summary.packages[0].usesDimensionalWeight).toBe(true);
  });

  it("uses metric volumetric weight and sums package chargeable weights", () => {
    const summary = calculateChargeableWeight(
      [
        { weight: 4, length: 50, width: 40, height: 30 },
        { weight: 20, length: 20, width: 20, height: 20 },
      ],
      "KG",
      "CM",
      "DHL",
    );

    expect(summary.actualWeight).toBe(24);
    expect(summary.dimensionalWeight).toBe(13.6);
    expect(summary.chargeableWeight).toBe(32);
    expect(summary.packages[0].chargeableWeight).toBe(12);
    expect(summary.packages[1].chargeableWeight).toBe(20);
  });

  it("uses the express imperial divisor when displaying pounds", () => {
    const summary = calculateChargeableWeight(
      [{ weight: 5, length: 20, width: 15, height: 10 }],
      "LB",
      "IN",
      "DHL",
    );

    expect(summary.chargeableWeight).toBe(21.583);
    expect(summary.packages[0].divisor).toBe(139);
    expect(summary.packages[0].divisorUnit).toBe("IN_LB");
  });

  it("rounds dimensions upward before calculating dimensional weight", () => {
    const summary = calculateChargeableWeight(
      [{ weight: 1, length: 10.1, width: 10.1, height: 10.1 }],
      "KG",
      "CM",
      "DHL",
    );

    expect(summary.dimensionalWeight).toBe(0.266);
    expect(summary.chargeableWeight).toBe(1);
    expect(summary.packages[0].roundedDimensions).toEqual({
      length: 11,
      width: 11,
      height: 11,
      unit: "CM",
    });
  });
});
