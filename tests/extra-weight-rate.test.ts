import { describe, expect, it } from "vitest";
import {
  getExtraFeesBillableQuantity,
  getExtraFeesQuantityUnit,
  getExtraFeesRateSarPerWeight,
} from "../server/routes";

/**
 * Extra weight is billed at a rate the system derives from the shipment itself: the gross total
 * the client already paid, divided by the quantity that total was calculated on.
 *
 * That divisor used to be `weight`, the actual weight. Carriers bill the *chargeable* weight —
 * the volumetric figure whenever it is larger — so on a light bulky parcel the derived rate came
 * out far above what the client paid per billable kilo, and every extra kilo was overcharged by
 * exactly the volumetric ratio. It is silent: both numbers look plausible on the invoice.
 */
describe("extra weight rate derivation", () => {
  const volumetricShipment = {
    fulfillmentType: "express",
    clientTotalAmountSar: "1000.00",
    weight: "8.00",
    weightUnit: "KG",
    chargeableWeight: "20.000",
    chargeableWeightUnit: "KG",
  };

  it("prices extra weight on the chargeable weight, not the actual weight", () => {
    // 1000 / 20 billable, not 1000 / 8 actual (which would be 125.00).
    expect(getExtraFeesRateSarPerWeight(volumetricShipment)).toBe(50);
  });

  it("falls back to chargeableWeightDetails when the column is empty", () => {
    const rate = getExtraFeesRateSarPerWeight({
      fulfillmentType: "express",
      clientTotalAmountSar: "1000.00",
      weight: "8.00",
      weightUnit: "KG",
      chargeableWeightDetails: JSON.stringify({ chargeableWeight: 20, weightUnit: "KG" }),
    });
    expect(rate).toBe(50);
  });

  it("falls back to actual weight when nothing billable was ever stored", () => {
    // Domestic parcels are priced without dimensions, and older rows predate the column.
    // Nothing volumetric can apply, so actual weight is the billable weight.
    const shipment = { fulfillmentType: "local", clientTotalAmountSar: "100.00", weight: "5.00", weightUnit: "KG" };
    expect(getExtraFeesBillableQuantity(shipment)).toEqual({ quantity: 5, unit: "KG" });
    expect(getExtraFeesRateSarPerWeight(shipment)).toBe(20);
  });

  it("quotes the rate in the unit the billable quantity is stored in", () => {
    // The two units are separate columns. Returning a per-KG rate while the operator enters
    // extra weight in LB would misprice by 2.2x, so the unit has to follow the quantity.
    const shipment = { ...volumetricShipment, weightUnit: "LB", chargeableWeightUnit: "KG" };
    expect(getExtraFeesQuantityUnit(shipment)).toBe("KG");
    expect(getExtraFeesRateSarPerWeight(shipment)).toBe(50);
  });

  it("returns no rate when the shipment has no quantity at all", () => {
    expect(getExtraFeesRateSarPerWeight({ fulfillmentType: "express", clientTotalAmountSar: "1000.00", weight: "0" })).toBe(0);
  });

  it("leaves Door To Door Freight on its own lane-derived rate", () => {
    // DDP does not divide a total by a quantity: the rate is the lane's per-unit price scaled by
    // the markup actually applied to the shipment. Chargeable weight must not leak into it.
    const rate = getExtraFeesRateSarPerWeight({
      fulfillmentType: "ddp_manual",
      ddpRatePerUnitSar: "10.00",
      baseRate: "100.00",
      marginAmount: "20.00",
      weight: "8.00",
      chargeableWeight: "20.000",
    });
    expect(rate).toBe(12);
    expect(getExtraFeesQuantityUnit({ fulfillmentType: "ddp_manual", ddpBillingUnit: "CBM" })).toBe("CBM");
  });
});
