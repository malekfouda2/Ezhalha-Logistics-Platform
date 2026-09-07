import { describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createIntegrationLog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { carrierService, getCarrierAdapter } from "../server/integrations/carriers";
import { DangerousGoodsUnsupportedError } from "../shared/dangerous-goods";
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

const request = {
  shipper: {
    name: "Shipper", streetLine1: "1 Street", city: "Jeddah",
    postalCode: "23442", countryCode: "SA", phone: "5551112222",
  },
  recipient: {
    name: "Receiver", streetLine1: "2 Street", city: "Riyadh",
    postalCode: "11564", countryCode: "SA", phone: "5553334444",
  },
  packages: [{ weight: 2, weightUnit: "KG" as const, packageType: "YOUR_PACKAGING" }],
  serviceType: "LOCAL",
  currency: "SAR",
};

describe("dangerous goods carrier guard", () => {
  it("refuses dangerous goods on Aramex, whose API cannot declare them at all", async () => {
    const aramex = getCarrierAdapter("ARAMEX");

    await expect(aramex.getRates({ ...request, dangerousGoods: declaration }))
      .rejects.toThrow(DangerousGoodsUnsupportedError);
    await expect(aramex.createShipment({ ...request, dangerousGoods: declaration }))
      .rejects.toThrow(/cannot accept dangerous goods/i);
  });

  it("refuses dangerous goods on every carrier that has not declared the capability", async () => {
    const incapable = carrierService.getSupportedCarriers()
      .filter((adapter) => !adapter.capabilities?.dangerousGoods?.supported);

    // The guard is applied at registration, so this list is whatever is registered today —
    // a carrier added later is DG-refusing until it explicitly declares support.
    expect(incapable.length).toBeGreaterThan(0);

    for (const adapter of incapable) {
      await expect(
        getCarrierAdapter(adapter.carrierCode).createShipment({ ...request, dangerousGoods: declaration }),
      ).rejects.toThrow(DangerousGoodsUnsupportedError);
    }
  });

  it("refuses dangerous goods on a carrier account the carrier has not approved", async () => {
    // The adapter CAN express a declaration; this account is not contracted to send one.
    // DHL does not reject an unapproved shipment at the API — it accepts it and stops the
    // parcel at the facility after the client has paid — so the check has to be ours.
    delete process.env.DHL_DG_ENABLED;

    await expect(
      getCarrierAdapter("DHL").getRates({ ...request, dangerousGoods: declaration }),
    ).rejects.toThrow(/not approved for dangerous goods/i);

    await expect(
      getCarrierAdapter("DHL").createShipment({ ...request, dangerousGoods: declaration }),
    ).rejects.toThrow(/not approved for dangerous goods/i);
  });

  it("lets an approved account through to the carrier", async () => {
    process.env.DHL_DG_ENABLED = "true";
    try {
      // Past the approval gate it fails for a different reason (no credentials configured in
      // tests), which is exactly the point — the DG gate is no longer what stops it.
      await expect(
        getCarrierAdapter("DHL").getRates({ ...request, dangerousGoods: declaration }),
      ).rejects.not.toThrow(/not approved for dangerous goods/i);
    } finally {
      delete process.env.DHL_DG_ENABLED;
    }
  });

  it("lets FedEx and DHL through, since both can express a declaration", () => {
    expect(getCarrierAdapter("FEDEX").capabilities?.dangerousGoods?.supported).toBe(true);
    expect(getCarrierAdapter("DHL").capabilities?.dangerousGoods?.supported).toBe(true);
    expect(getCarrierAdapter("DHL").capabilities?.dangerousGoods?.regulations).toEqual(["IATA"]);
    expect(getCarrierAdapter("FEDEX").capabilities?.dangerousGoods?.regulations)
      .toEqual(["IATA", "ADR"]);
  });

  it("does not disturb a normal request on a non-dangerous-goods carrier", async () => {
    // The guard must be transparent when nothing is declared — it only inspects the request.
    const aramex = getCarrierAdapter("ARAMEX");
    expect(aramex.carrierCode).toBe("ARAMEX");
    expect(typeof aramex.getRates).toBe("function");
    await expect(aramex.getRates(request)).resolves.toBeDefined();
  });
});
