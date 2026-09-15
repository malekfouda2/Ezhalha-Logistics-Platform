import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { collectFedexPieceLabels, mergePdfLabels } from "../server/services/label-merge";

/**
 * FedEx returns one label per piece. The adapter kept `pieceResponses[0]` and dropped the rest, so
 * EZH043868517 — 25 pieces, Sharjah to Riyadh — produced a single page reading
 * "## MASTER ## 1 of 25" and nothing to stick on the other 24 boxes.
 *
 * It hid because most shipments are one piece, where the bug is invisible. It was there in the
 * stored label sizes all along: every FedEx label sat at ~8 KB regardless of piece count, while
 * DHL's grew from 10 KB at one piece to 140 KB at seven, because DHL hands back every page in one
 * document.
 */

async function makePdf(pageCount: number, text: string): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([288, 432]); // 4x6, the usual label size
    page.drawText(`${text} ${i + 1}`, { x: 20, y: 400, size: 12 });
  }
  return Buffer.from(await doc.save()).toString("base64");
}

async function pageCount(base64: string): Promise<number> {
  const doc = await PDFDocument.load(Buffer.from(base64, "base64"));
  return doc.getPageCount();
}

describe("merging per-piece labels", () => {
  it("produces a page for every piece", async () => {
    const labels = await Promise.all(Array.from({ length: 25 }, (_, i) => makePdf(1, `piece ${i + 1}`)));
    const merged = await mergePdfLabels(labels);
    expect(await pageCount(merged!)).toBe(25);
  });

  it("keeps a single label byte-for-byte", async () => {
    // Re-encoding one label would risk changing what the carrier gave us, for no gain.
    const only = await makePdf(1, "solo");
    expect(await mergePdfLabels([only])).toBe(only);
  });

  it("keeps every page when a piece carries more than one document", async () => {
    // Some lanes return a doc-tab alongside the label; both belong in the file.
    const merged = await mergePdfLabels([await makePdf(2, "label+doctab"), await makePdf(1, "label")]);
    expect(await pageCount(merged!)).toBe(3);
  });

  it("returns nothing when the carrier sent no label at all", async () => {
    expect(await mergePdfLabels([])).toBeUndefined();
    expect(await mergePdfLabels(["", "   "])).toBeUndefined();
  });

  it("falls back to the first label rather than losing a booked shipment", async () => {
    // The waybill already exists by this point. An unreadable second label must not cost the
    // first one, which is the only thing standing between the shipper and a printable parcel.
    const good = await makePdf(1, "good");
    const merged = await mergePdfLabels([good, "not-a-pdf-at-all"]);
    expect(merged).toBe(good);
  });
});

describe("reading labels out of a FedEx ship response", () => {
  it("takes every document from every piece, in order", () => {
    expect(collectFedexPieceLabels({
      pieceResponses: [
        { packageDocuments: [{ encodedLabel: "one" }] },
        { packageDocuments: [{ encodedLabel: "two" }, { encodedLabel: "two-doctab" }] },
      ],
    })).toEqual(["one", "two", "two-doctab"]);
  });

  it("skips pieces the carrier returned without a document", () => {
    expect(collectFedexPieceLabels({
      pieceResponses: [
        { packageDocuments: [{ encodedLabel: "one" }] },
        { packageDocuments: [] },
        {},
        { packageDocuments: [{ encodedLabel: "" }] },
      ],
    })).toEqual(["one"]);
  });

  it("survives a response shaped differently than expected", () => {
    expect(collectFedexPieceLabels({})).toEqual([]);
    expect(collectFedexPieceLabels({ pieceResponses: null })).toEqual([]);
    expect(collectFedexPieceLabels(undefined)).toEqual([]);
  });
});
