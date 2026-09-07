import { describe, expect, it } from "vitest";
import type { Shipment } from "@shared/schema";
import {
  parseDangerousGoodsDeclaration,
  shipmentDangerousGoods,
} from "../server/services/dangerous-goods";
import {
  DgAccessibility,
  DgContentKind,
  DgPackingGroup,
  DgQuantityType,
  DgRegulation,
  type DangerousGoodsDeclaration,
} from "../shared/dangerous-goods";

const declaration: DangerousGoodsDeclaration = {
  regulation: DgRegulation.IATA,
  contentKind: DgContentKind.LITHIUM_ION_PI965_SECTION_II,
  accessibility: DgAccessibility.INACCESSIBLE,
  offeror: "Ezhalha Logistics",
  emergencyContact: { name: "Ops desk", phone: "+966500000000" },
  signatory: { name: "Signatory", place: "Jeddah" },
  packages: [{
    packageIndex: 0,
    commodities: [{
      unNumber: "UN3480",
      properShippingName: "Lithium ion batteries",
      hazardClass: "9",
      packingGroup: DgPackingGroup.NONE,
      quantity: { amount: 2, units: "KG", quantityType: DgQuantityType.NET },
    }],
  }],
};

function shipmentWith(overrides: Partial<Shipment>): Shipment {
  return {
    hasDangerousGoods: false,
    dangerousGoodsData: null,
    ...overrides,
  } as Shipment;
}

describe("parseDangerousGoodsDeclaration", () => {
  it("round-trips a stored declaration", () => {
    expect(parseDangerousGoodsDeclaration(JSON.stringify(declaration))).toEqual(declaration);
  });

  it("returns null rather than throwing on unreadable JSON", () => {
    // The ops hub has to open even for a shipment whose declaration is corrupt, so the
    // operator can reject it. Throwing here would take the review page down instead.
    expect(parseDangerousGoodsDeclaration("{not json")).toBeNull();
    expect(parseDangerousGoodsDeclaration("")).toBeNull();
    expect(parseDangerousGoodsDeclaration(null)).toBeNull();
  });

  it("returns null for JSON that is not a valid declaration", () => {
    expect(parseDangerousGoodsDeclaration(JSON.stringify({ regulation: "IATA" }))).toBeNull();
  });
});

describe("shipmentDangerousGoods", () => {
  it("returns nothing for an ordinary shipment", () => {
    expect(shipmentDangerousGoods(shipmentWith({}))).toBeUndefined();
  });

  it("returns the declaration for a dangerous goods shipment", () => {
    const shipment = shipmentWith({
      hasDangerousGoods: true,
      dangerousGoodsData: JSON.stringify(declaration),
    });
    expect(shipmentDangerousGoods(shipment)).toEqual(declaration);
  });

  it("returns nothing when the flag is set but the declaration is unreadable", () => {
    // Fails toward "no declaration", which the carrier guard turns into a refused booking.
    // The alternative — booking with a partial declaration — puts undeclared regulated goods
    // on an aircraft.
    const shipment = shipmentWith({
      hasDangerousGoods: true,
      dangerousGoodsData: "{corrupt",
    });
    expect(shipmentDangerousGoods(shipment)).toBeUndefined();
  });

  it("ignores a stored declaration when the flag is off", () => {
    const shipment = shipmentWith({
      hasDangerousGoods: false,
      dangerousGoodsData: JSON.stringify(declaration),
    });
    expect(shipmentDangerousGoods(shipment)).toBeUndefined();
  });
});
