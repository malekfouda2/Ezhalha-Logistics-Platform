import { describe, expect, it } from "vitest";
import { calculateDdpPrice } from "../server/services/ddp-pricing";

const lane = {
  id: "lane",
  originCountryCode: "AE",
  originCity: null,
  destinationCountryCode: "SA",
  destinationCity: null,
  currency: "SAR",
  airBaseRatePerKg: "35.00",
  seaBaseRatePerCbm: "800.00",
  domesticRatePerKg: "10.00",
  airSupplierCostPerKg: "25.00",
  seaSupplierCostPerCbm: "600.00",
  domesticSupplierCostPerKg: "7.00",
  minimumBillableKg: "5.000",
  kgRoundingIncrement: "0.500",
  minimumBillableCbm: "0.5000",
  cbmRoundingIncrement: "0.1000",
  minimumShipmentCharge: "200.00",
  airTransitDaysMin: 7,
  airTransitDaysMax: 14,
  seaTransitDaysMin: 25,
  seaTransitDaysMax: 40,
  volumetricDivisor: 6000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("calculateDdpPrice", () => {
  it("uses air dimensional weight, rounds KG upward, and applies the profile markup", () => {
    const quote = calculateDdpPrice({
      lane,
      transportMethod: "air",
      packages: [{ weight: 1, length: 60, width: 40, height: 30 }],
      markupPercentage: 20,
    });

    expect(quote.billingUnit).toBe("KG");
    expect(quote.rawBillableQuantity).toBe(12);
    expect(quote.billableQuantity).toBe(12);
    expect(quote.baseRateSar).toBe(420);
    expect(quote.totalAmountSar).toBe(504);
    expect(quote.packages[0].usesDimensionalWeight).toBe(true);
  });

  it("uses sea CBM minimums and minimum shipment charge before markup", () => {
    const quote = calculateDdpPrice({
      lane,
      transportMethod: "sea",
      packages: [{ weight: 1, length: 10, width: 10, height: 10 }],
      totalCbm: 0.12,
      markupPercentage: 10,
    });

    expect(quote.billingUnit).toBe("CBM");
    expect(quote.billableQuantity).toBe(0.5);
    expect(quote.baseRateSar).toBe(400);
    expect(quote.totalAmountSar).toBe(440);
  });

  it("bills domestic as a flat SAR per KG, reusing the KG minimum/rounding knobs", () => {
    const quote = calculateDdpPrice({
      lane,
      transportMethod: "domestic",
      packages: [{ weight: 30 }],
      markupPercentage: 20,
    });

    expect(quote.billingUnit).toBe("KG");
    expect(quote.ratePerUnitSar).toBe(10);
    expect(quote.billableQuantity).toBe(30);
    expect(quote.baseRateSar).toBe(300); // 30kg * 10 SAR/kg, above the 200 minimum charge
    expect(quote.totalAmountSar).toBe(360); // + 20% markup
    expect(quote.transitDaysMin).toBe(7); // falls back to the air transit window
  });

  it("applies the minimum shipment charge to small domestic shipments", () => {
    const quote = calculateDdpPrice({
      lane,
      transportMethod: "domestic",
      packages: [{ weight: 8 }],
      markupPercentage: 0,
    });

    expect(quote.billableQuantity).toBe(8); // max(8, 5 min) rounded to 0.5
    expect(quote.subtotalBeforeMinimumSar).toBe(80); // 8 * 10
    expect(quote.baseRateSar).toBe(200); // minimum shipment charge wins
  });

  it("reports supplier cost and true margin without changing the client-facing total", () => {
    const quote = calculateDdpPrice({
      lane,
      transportMethod: "air",
      packages: [{ weight: 1, length: 60, width: 40, height: 30 }], // dimensional → 12 kg
      markupPercentage: 20,
    });

    expect(quote.billableQuantity).toBe(12);
    expect(quote.baseRateSar).toBe(420); // 12 * 35 sell base
    expect(quote.totalAmountSar).toBe(504); // client total unchanged (base + markup)
    expect(quote.supplierCostPerUnitSar).toBe(25);
    expect(quote.supplierCostSar).toBe(300); // 12 * 25
    expect(quote.trueMarginSar).toBe(204); // 420 + 84 markup − 300 cost
  });

  it("treats an unconfigured supplier cost as zero (margin = full sell)", () => {
    const quote = calculateDdpPrice({
      lane: { ...lane, airSupplierCostPerKg: null },
      transportMethod: "air",
      packages: [{ weight: 10 }],
      markupPercentage: 0,
    });

    expect(quote.supplierCostSar).toBe(0);
    expect(quote.trueMarginSar).toBe(quote.baseRateSar); // no cost → margin is the whole base
  });

  it("rejects an air quote on a lane where air delivery is disabled", () => {
    expect(() =>
      calculateDdpPrice({
        lane: { ...lane, airEnabled: false },
        transportMethod: "air",
        packages: [{ weight: 10 }],
        markupPercentage: 0,
      }),
    ).toThrow(/air delivery is not available/i);
  });

  it("still prices sea and domestic on an air-disabled lane", () => {
    const sea = calculateDdpPrice({
      lane: { ...lane, airEnabled: false },
      transportMethod: "sea",
      packages: [],
      totalCbm: 1,
      markupPercentage: 0,
    });
    expect(sea.billingUnit).toBe("CBM");
    expect(sea.baseRateSar).toBe(800); // 1 CBM * 800
  });
});
