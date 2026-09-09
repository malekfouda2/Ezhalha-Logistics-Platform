import { describe, expect, it } from "vitest";
import {
  DANGEROUS_GOODS_DOCUMENT_MAX_FILES,
  DHL_DG_CODE_TABLE,
  DangerousGoodsResolutionError,
  DgAccessibility,
  DgContentKind,
  DgPackingGroup,
  DgQuantityType,
  DgRegulation,
  declaredPackageIndexes,
  isDryIceDeclaration,
  resolveDhlDangerousGoodsCodes,
  resolveFedexDangerousGoodsDetail,
  summarizeDangerousGoods,
  type DangerousGoodsDeclaration,
} from "../shared/dangerous-goods";
import { dangerousGoodsDeclarationSchema } from "../shared/schema";

function buildDeclaration(
  overrides: Partial<DangerousGoodsDeclaration> = {},
): DangerousGoodsDeclaration {
  return {
    regulation: DgRegulation.IATA,
    contentKind: DgContentKind.LITHIUM_ION_PI965_SECTION_II,
    accessibility: DgAccessibility.INACCESSIBLE,
    offeror: "Ezhalha Logistics",
    emergencyContact: { name: "Ops desk", phone: "+966500000000" },
    signatory: { name: "Malek Fouda", title: "DG signatory", place: "Jeddah" },
    packages: [
      {
        packageIndex: 0,
        containerType: "Fibreboard box",
        numberOfContainers: 1,
        commodities: [
          {
            unNumber: "UN3480",
            properShippingName: "Lithium ion batteries",
            hazardClass: "9",
            packingGroup: DgPackingGroup.NONE,
            packingInstruction: "965",
            quantity: { amount: 2.5, units: "KG", quantityType: DgQuantityType.NET },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("DHL code resolution", () => {
  it("resolves every supported kind to a service code and content id", () => {
    for (const [kind, entry] of Object.entries(DHL_DG_CODE_TABLE)) {
      if (!entry.supported || entry.contentId === null) continue;
      const codes = resolveDhlDangerousGoodsCodes(
        buildDeclaration({ contentKind: kind as keyof typeof DgContentKind }),
      );
      expect(codes).toEqual({ serviceCode: entry.serviceCode, contentId: entry.contentId });
    }
  });

  it("maps the published lithium battery packing instructions", () => {
    const cases: Array<[keyof typeof DgContentKind, string, string]> = [
      ["LITHIUM_ION_PI965_SECTION_II", "HB", "965"],
      ["LITHIUM_ION_PI966_SECTION_II", "HD", "966"],
      ["LITHIUM_ION_PI967_SECTION_II", "HV", "967"],
      ["LITHIUM_METAL_PI969_SECTION_II", "HM", "969"],
      ["LITHIUM_METAL_PI970_SECTION_II", "HW", "970"],
    ];
    for (const [kind, serviceCode, contentId] of cases) {
      expect(resolveDhlDangerousGoodsCodes(buildDeclaration({ contentKind: DgContentKind[kind] })))
        .toEqual({ serviceCode, contentId });
    }
  });

  it("maps biological substances and GMOs to the same service code but different content ids", () => {
    expect(resolveDhlDangerousGoodsCodes(
      buildDeclaration({ contentKind: DgContentKind.BIOLOGICAL_SUBSTANCE_UN3373 }),
    )).toEqual({ serviceCode: "HY", contentId: "650" });
    expect(resolveDhlDangerousGoodsCodes(
      buildDeclaration({ contentKind: DgContentKind.GENETICALLY_MODIFIED_ORGANISMS }),
    )).toEqual({ serviceCode: "HY", contentId: "651" });
  });

  it("refuses kinds DHL does not accept through the API", () => {
    expect(() => resolveDhlDangerousGoodsCodes(
      buildDeclaration({ contentKind: DgContentKind.DRY_ICE_UN1845 }),
    )).toThrow(DangerousGoodsResolutionError);
    expect(() => resolveDhlDangerousGoodsCodes(
      buildDeclaration({ contentKind: DgContentKind.EXCEPTED_QUANTITIES_IATA }),
    )).toThrow(/does not accept/i);
  });

  it("refuses fully regulated DG until the account's content id is configured", () => {
    expect(() => resolveDhlDangerousGoodsCodes(
      buildDeclaration({ contentKind: DgContentKind.FULLY_REGULATED }),
    )).toThrow(/assigns the content id/i);
  });

  it("uses the account's configured content id ahead of the published table", () => {
    const declaration = buildDeclaration({ contentKind: DgContentKind.FULLY_REGULATED });
    expect(resolveDhlDangerousGoodsCodes(declaration, { FULLY_REGULATED: "HZ9" }))
      .toEqual({ serviceCode: "HE", contentId: "HZ9" });

    // The contract wins even where the published table has a value, because DHL validates
    // against the contract, not the brochure.
    const lithium = buildDeclaration();
    expect(resolveDhlDangerousGoodsCodes(lithium, { LITHIUM_ION_PI965_SECTION_II: "965X" }))
      .toEqual({ serviceCode: "HB", contentId: "965X" });
  });

  it("accepts a per-declaration override when no account id is configured", () => {
    const declaration = buildDeclaration({
      contentKind: DgContentKind.FULLY_REGULATED,
      dhlContentIdOverride: "HE7",
    });
    expect(resolveDhlDangerousGoodsCodes(declaration)).toEqual({ serviceCode: "HE", contentId: "HE7" });
  });
});

describe("FedEx dangerousGoodsDetail", () => {
  it("builds one container carrying the package's commodities", () => {
    const detail = resolveFedexDangerousGoodsDetail(buildDeclaration(), 0);
    expect(detail).not.toBeNull();
    expect(detail!.regulation).toBe("IATA");
    expect(detail!.accessibility).toBe("INACCESSIBLE");
    expect(detail!.emergencyContactNumber).toBe("+966500000000");
    expect(detail!.containers).toHaveLength(1);
    expect(detail!.containers[0].numberOfContainers).toBe(1);
    expect(detail!.containers[0].hazardousCommodities[0].description.properShippingName)
      .toBe("Lithium ion batteries");
    expect(detail!.containers[0].hazardousCommodities[0].quantity)
      .toEqual({ amount: 2.5, units: "KG", quantityType: "NET" });
  });

  it("omits the packing group rather than sending the literal NONE", () => {
    const detail = resolveFedexDangerousGoodsDetail(buildDeclaration(), 0);
    expect(detail!.containers[0].hazardousCommodities[0].description.packingGroup).toBeUndefined();
  });

  it("keeps a real packing group", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities[0].packingGroup = DgPackingGroup.II;
    const detail = resolveFedexDangerousGoodsDetail(declaration, 0);
    expect(detail!.containers[0].hazardousCommodities[0].description.packingGroup).toBe("II");
  });

  it("numbers commodities sequentially and carries inner receptacles", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities.push({
      unNumber: "UN1263",
      properShippingName: "Paint",
      hazardClass: "3",
      packingGroup: DgPackingGroup.III,
      quantity: { amount: 1, units: "L", quantityType: DgQuantityType.NET },
      innerReceptacles: [{ quantity: { amount: 0.5, units: "L", quantityType: DgQuantityType.NET } }],
    });
    const detail = resolveFedexDangerousGoodsDetail(declaration, 0);
    const commodities = detail!.containers[0].hazardousCommodities;
    expect(commodities.map((entry) => entry.description.sequenceNumber)).toEqual([1, 2]);
    expect(commodities[1].innerReceptacles).toEqual([
      { quantity: { amount: 0.5, units: "L", quantityType: "NET" } },
    ]);
    expect(commodities[0].innerReceptacles).toBeUndefined();
  });

  it("returns null for a package carrying no declared dangerous goods", () => {
    expect(resolveFedexDangerousGoodsDetail(buildDeclaration(), 1)).toBeNull();
  });
});

describe("helpers", () => {
  it("identifies dry ice", () => {
    expect(isDryIceDeclaration(buildDeclaration())).toBe(false);
    expect(isDryIceDeclaration(buildDeclaration({ contentKind: DgContentKind.DRY_ICE_UN1845 })))
      .toBe(true);
  });

  it("lists the declared package indexes", () => {
    const declaration = buildDeclaration();
    declaration.packages.push({ packageIndex: 2, commodities: declaration.packages[0].commodities });
    expect(declaredPackageIndexes(declaration)).toEqual([0, 2]);
  });

  it("summarises a declaration for ops", () => {
    expect(summarizeDangerousGoods(buildDeclaration()))
      .toBe("IATA · UN3480 Lithium ion batteries · inaccessible");
  });

  it("counts the extra commodities in the summary", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities.push({
      unNumber: "UN1263",
      properShippingName: "Paint",
      hazardClass: "3",
      packingGroup: DgPackingGroup.III,
      quantity: { amount: 1, units: "L", quantityType: DgQuantityType.NET },
    });
    expect(summarizeDangerousGoods(declaration)).toContain("(+1 more)");
  });

  it("allows more DG documents than the FedEx trade-document cap", () => {
    expect(DANGEROUS_GOODS_DOCUMENT_MAX_FILES).toBeGreaterThan(5);
  });
});

describe("declaration validation", () => {
  it("accepts a well formed declaration", () => {
    expect(dangerousGoodsDeclarationSchema.safeParse(buildDeclaration()).success).toBe(true);
  });

  it("rejects a malformed UN number", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities[0].unNumber = "3480";
    const result = dangerousGoodsDeclarationSchema.safeParse(declaration);
    expect(result.success).toBe(false);
  });

  it("accepts ID-prefixed entries such as ID8000", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities[0].unNumber = "ID8000";
    expect(dangerousGoodsDeclarationSchema.safeParse(declaration).success).toBe(true);
  });

  it("rejects an invalid hazard class", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities[0].hazardClass = "12";
    expect(dangerousGoodsDeclarationSchema.safeParse(declaration).success).toBe(false);
  });

  it("accepts a division such as 4.1", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities[0].hazardClass = "4.1";
    expect(dangerousGoodsDeclarationSchema.safeParse(declaration).success).toBe(true);
  });

  it("requires a technical name for an n.o.s. entry", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities[0].properShippingName = "Flammable liquid, n.o.s.";
    const result = dangerousGoodsDeclarationSchema.safeParse(declaration);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("technical name");

    declaration.packages[0].commodities[0].technicalName = "Acetone";
    expect(dangerousGoodsDeclarationSchema.safeParse(declaration).success).toBe(true);
  });

  it("rejects the same package declared twice", () => {
    const declaration = buildDeclaration();
    declaration.packages.push({ ...declaration.packages[0] });
    const result = dangerousGoodsDeclarationSchema.safeParse(declaration);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("declared more than once");
  });

  it("requires a dry ice weight for UN1845", () => {
    const declaration = buildDeclaration({ contentKind: DgContentKind.DRY_ICE_UN1845 });
    expect(dangerousGoodsDeclarationSchema.safeParse(declaration).success).toBe(false);
    expect(dangerousGoodsDeclarationSchema.safeParse({ ...declaration, dryIceWeightKg: 2 }).success)
      .toBe(true);
  });

  it("requires at least one commodity per declared package", () => {
    const declaration = buildDeclaration();
    declaration.packages[0].commodities = [];
    expect(dangerousGoodsDeclarationSchema.safeParse(declaration).success).toBe(false);
  });
});
