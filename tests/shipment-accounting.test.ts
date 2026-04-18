import { describe, expect, it } from "vitest";
import { ShipmentTaxScenario, ShipmentType } from "@shared/schema";
import {
  calculateShipmentAccounting,
  isDdpEligibleForShipment,
  resolveShipmentTaxScenario,
} from "../server/services/shipment-accounting";

describe("Shipment Accounting", () => {
  it("calculates DCE accounting with system cost tax and client sell tax", () => {
    const snapshot = calculateShipmentAccounting({
      shipmentType: ShipmentType.DOMESTIC,
      recipientCountryCode: "SA",
      baseRate: 15,
      marginAmount: 5,
    });

    expect(snapshot.taxScenario).toBe(ShipmentTaxScenario.DCE);
    expect(snapshot.costAmountSar).toBe(15);
    expect(snapshot.costTaxAmountSar).toBe(2.25);
    expect(snapshot.sellSubtotalAmountSar).toBe(20);
    expect(snapshot.sellTaxAmountSar).toBe(3);
    expect(snapshot.clientTotalAmountSar).toBe(23);
    expect(snapshot.systemCostTotalAmountSar).toBe(17.25);
    expect(snapshot.taxPayableAmountSar).toBe(0.75);
    expect(snapshot.revenueExcludingTaxAmountSar).toBe(20);
  });

  it("calculates import accounting with sell tax embedded in the margin", () => {
    const snapshot = calculateShipmentAccounting({
      shipmentType: ShipmentType.INBOUND,
      recipientCountryCode: "SA",
      baseRate: 400,
      marginAmount: 100,
    });

    expect(snapshot.taxScenario).toBe(ShipmentTaxScenario.IMPORT);
    expect(snapshot.costTaxAmountSar).toBe(0);
    expect(snapshot.sellSubtotalAmountSar).toBe(500);
    expect(snapshot.sellTaxAmountSar).toBeCloseTo(13.04, 2);
    expect(snapshot.clientTotalAmountSar).toBe(500);
    expect(snapshot.taxPayableAmountSar).toBeCloseTo(13.04, 2);
    expect(snapshot.revenueExcludingTaxAmountSar).toBeCloseTo(486.96, 2);
  });

  it("calculates export accounting with margin-only tax treatment", () => {
    const snapshot = calculateShipmentAccounting({
      shipmentType: ShipmentType.OUTBOUND,
      recipientCountryCode: "EG",
      baseRate: 200,
      marginAmount: 200,
    });

    expect(snapshot.taxScenario).toBe(ShipmentTaxScenario.EXPORT);
    expect(snapshot.sellSubtotalAmountSar).toBe(400);
    expect(snapshot.sellTaxAmountSar).toBeCloseTo(26.09, 2);
    expect(snapshot.clientTotalAmountSar).toBe(400);
    expect(snapshot.revenueExcludingTaxAmountSar).toBeCloseTo(373.91, 2);
  });

  it("supports DDP import only for Saudi Arabia and UAE destinations", () => {
    const snapshot = calculateShipmentAccounting({
      shipmentType: ShipmentType.INBOUND,
      isDdp: true,
      recipientCountryCode: "AE",
      baseRate: 100,
      marginAmount: 100,
    });

    expect(snapshot.taxScenario).toBe(ShipmentTaxScenario.DDP);
    expect(snapshot.isDdp).toBe(true);
    expect(snapshot.sellTaxAmountSar).toBeCloseTo(13.04, 2);
    expect(snapshot.clientTotalAmountSar).toBe(200);
  });

  it("rejects invalid DDP combinations", () => {
    expect(() =>
      resolveShipmentTaxScenario(ShipmentType.OUTBOUND, true, "AE"),
    ).toThrow("DDP is only available for import shipments to Saudi Arabia or the UAE");

    expect(() =>
      resolveShipmentTaxScenario(ShipmentType.INBOUND, true, "EG"),
    ).toThrow("DDP is only available for import shipments to Saudi Arabia or the UAE");
  });

  it("checks DDP eligibility helper", () => {
    expect(isDdpEligibleForShipment(ShipmentType.INBOUND, "SA")).toBe(true);
    expect(isDdpEligibleForShipment(ShipmentType.INBOUND, "AE")).toBe(true);
    expect(isDdpEligibleForShipment(ShipmentType.INBOUND, "EG")).toBe(false);
    expect(isDdpEligibleForShipment(ShipmentType.OUTBOUND, "SA")).toBe(false);
  });
});
