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
});
