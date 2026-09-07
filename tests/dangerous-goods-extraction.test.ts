import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/integrations/storage", () => ({
  ObjectStorageService: class {
    async getObjectEntityFile() {
      throw new Error("not used in these tests");
    }
  },
}));

vi.mock("../server/integrations/storage/localStorage", () => ({
  LocalStorageService: class {
    async getFile() {
      return { data: Buffer.from("safety data sheet text"), contentType: "text/plain" };
    }
  },
}));

import { extractDangerousGoodsFromDocument } from "../server/services/dangerous-goods-extraction";

const sdsDocument = {
  fileName: "acetone-sds.txt",
  objectPath: "/uploads/acetone-sds.txt",
  contentType: "text/plain",
};

function geminiResponse(payload: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const baseEntry = {
  unNumber: "UN1263",
  properShippingName: "Paint",
  technicalName: "",
  hazardClass: "3",
  subsidiaryRisks: [],
  packingGroup: "II",
  packingInstruction: "353",
  cargoAircraftOnly: false,
};

describe("safety data sheet extraction", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("returns the transport classification the document stated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [baseEntry],
      productName: "Acme Gloss Paint",
      notDangerousGoods: false,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);

    expect(result.productName).toBe("Acme Gloss Paint");
    expect(result.commodities).toHaveLength(1);
    expect(result.commodities[0]).toMatchObject({
      unNumber: "UN1263",
      properShippingName: "Paint",
      hazardClass: "3",
      packingGroup: "II",
      packingInstruction: "353",
    });
  });

  it("never returns a quantity, and says so", async () => {
    // A safety data sheet describes a substance, not a shipment. Inventing a quantity would
    // put a number the shipper never supplied onto a declaration Ezhalha signs.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [baseEntry],
      productName: "Acme Gloss Paint",
      notDangerousGoods: false,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);
    expect(result.commodities[0].missingFields).toContain("quantity");
    expect(Object.keys(result.commodities[0])).not.toContain("quantityAmount");
  });

  it("normalises the UN number to the printed form", async () => {
    for (const [raw, expected] of [["un 1263", "UN1263"], ["1263", "UN1263"], ["ID 8000", "ID8000"]]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
        entries: [{ ...baseEntry, unNumber: raw }],
        productName: "",
        notDangerousGoods: false,
        warnings: [],
      })));
      const result = await extractDangerousGoodsFromDocument(sdsDocument);
      expect(result.commodities[0].unNumber).toBe(expected);
    }
  });

  it("strips wording off the hazard class and keeps divisions", async () => {
    for (const [raw, expected] of [["Class 3", "3"], ["4.1", "4.1"], ["3 (8)", "3"]]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
        entries: [{ ...baseEntry, hazardClass: raw }],
        productName: "",
        notDangerousGoods: false,
        warnings: [],
      })));
      const result = await extractDangerousGoodsFromDocument(sdsDocument);
      expect(result.commodities[0].hazardClass).toBe(expected);
    }
  });

  it("flags a value it could not read rather than guessing one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [{ ...baseEntry, unNumber: "", hazardClass: "" }],
      productName: "",
      notDangerousGoods: false,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);
    expect(result.commodities[0].unNumber).toBe("");
    expect(result.commodities[0].hazardClass).toBe("");
    expect(result.commodities[0].missingFields).toEqual(
      expect.arrayContaining(["unNumber", "hazardClass"]),
    );
    expect(result.warnings.join(" ")).toMatch(/not stated/i);
  });

  it("requires a technical name for an n.o.s. entry the document left out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [{ ...baseEntry, properShippingName: "Flammable liquid, n.o.s.", technicalName: "" }],
      productName: "",
      notDangerousGoods: false,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);
    expect(result.commodities[0].missingFields).toContain("technicalName");
  });

  it("does not flag a technical name that was supplied", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [{ ...baseEntry, properShippingName: "Flammable liquid, n.o.s.", technicalName: "Acetone" }],
      productName: "",
      notDangerousGoods: false,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);
    expect(result.commodities[0].missingFields).not.toContain("technicalName");
  });

  it("reports a product the document says is not regulated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [],
      productName: "Distilled water",
      notDangerousGoods: true,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);
    expect(result.notDangerousGoods).toBe(true);
    expect(result.commodities).toHaveLength(0);
  });

  it("maps an unrecognised packing group to NONE rather than dropping the entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({
      entries: [{ ...baseEntry, packingGroup: "NONE" }],
      productName: "",
      notDangerousGoods: false,
      warnings: [],
    })));

    const result = await extractDangerousGoodsFromDocument(sdsDocument);
    expect(result.commodities[0].packingGroup).toBe("NONE");
  });

  it("refuses an unreadable file type instead of sending it to the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractDangerousGoodsFromDocument({
      ...sdsDocument,
      fileName: "sds.zip",
      contentType: "application/zip",
    })).rejects.toThrow(/can't read/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains itself when AI extraction is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(extractDangerousGoodsFromDocument(sdsDocument))
      .rejects.toThrow(/not configured/i);
  });
});
