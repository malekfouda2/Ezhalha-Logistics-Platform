import { PDFDocument } from "pdf-lib";
import { logError, logInfo } from "./logger";

/**
 * Combine per-piece carrier labels into one printable document.
 *
 * FedEx returns a **separate label per piece** — `pieceResponses[n].packageDocuments[]` — and the
 * adapter used to keep `pieceResponses[0]` alone. A 25-piece shipment therefore produced a single
 * page reading "## MASTER ## 1 of 25", and the other 24 boxes had nothing to stick on them. It is
 * invisible on a one-piece shipment, which is most of them, and it showed in the stored label
 * sizes: every FedEx label sat at ~8 KB no matter the piece count, while DHL's grew from 10 KB at
 * one piece to 140 KB at seven, because DHL hands back all the pages in one document.
 *
 * Merging happens here rather than at print time so the stored label is the complete article:
 * whatever anyone downloads later — admin, client, or a reprint — is the whole set.
 */

/** A base64 PDF per piece, in the order the carrier returned them. */
export async function mergePdfLabels(encodedLabels: string[]): Promise<string | undefined> {
  const labels = encodedLabels.filter((label) => typeof label === "string" && label.trim().length > 0);
  if (labels.length === 0) return undefined;
  // Nothing to merge, and re-encoding a single label would only risk changing it.
  if (labels.length === 1) return labels[0];

  try {
    const merged = await PDFDocument.create();
    for (const label of labels) {
      const source = await PDFDocument.load(Buffer.from(label, "base64"), { ignoreEncryption: true });
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }

    const bytes = await merged.save();
    logInfo(`Merged ${labels.length} carrier label pages into one document`);
    return Buffer.from(bytes).toString("base64");
  } catch (error) {
    // A shipment that is already booked must not be lost because its labels would not merge.
    // Returning the first label keeps the old behaviour, and the error says why the rest are
    // missing rather than leaving someone to wonder.
    logError("Failed to merge carrier labels; falling back to the first piece", error, {
      pieceCount: labels.length,
    } as any);
    return labels[0];
  }
}

/**
 * Pull every label out of a FedEx ship response, in piece order.
 *
 * A piece can carry more than one document (the label, and on some lanes a doc-tab); all of them
 * belong in the file, because the carrier expects what it returned to be what is attached.
 */
/**
 * The tracking number of each piece, in the order the carrier returned them.
 *
 * FedEx numbers every box separately; the master only aggregates them. Falling back to the piece's
 * own `masterTrackingNumber` covers the single-piece case, where FedEx repeats the master rather
 * than issuing a distinct child number.
 */
export function collectFedexPieceTrackingNumbers(shipmentData: any): string[] {
  const pieces = Array.isArray(shipmentData?.pieceResponses) ? shipmentData.pieceResponses : [];
  const numbers: string[] = [];

  for (const piece of pieces) {
    const number = piece?.trackingNumber || piece?.masterTrackingNumber;
    if (number) numbers.push(String(number));
  }

  return numbers;
}

export function collectFedexPieceLabels(shipmentData: any): string[] {
  const pieces = Array.isArray(shipmentData?.pieceResponses) ? shipmentData.pieceResponses : [];
  const labels: string[] = [];

  for (const piece of pieces) {
    const documents = Array.isArray(piece?.packageDocuments) ? piece.packageDocuments : [];
    for (const document of documents) {
      if (document?.encodedLabel) labels.push(String(document.encodedLabel));
    }
  }

  return labels;
}
