import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { ObjectStorageService } from "../integrations/storage";
import { LocalStorageService } from "../integrations/storage/localStorage";
import {
  extractDangerousGoodsWithGemini,
  isGeminiDangerousGoodsExtractionConfigured,
} from "./gemini-dangerous-goods-extraction";
import { DgPackingGroup, type DgPackingGroupValue } from "@shared/dangerous-goods";

const localStorageService = new LocalStorageService();
const objectStorageService = new ObjectStorageService();

export const SUPPORTED_SDS_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export interface ExtractedDangerousGoodsCommodity {
  unNumber: string;
  properShippingName: string;
  technicalName: string;
  hazardClass: string;
  subsidiaryRisks: string[];
  packingGroup: DgPackingGroupValue;
  packingInstruction: string;
  cargoAircraftOnly: boolean;
  /** Fields the SDS did not state, so the review step can point the client straight at them. */
  missingFields: string[];
}

export interface DangerousGoodsExtractionResult {
  commodities: ExtractedDangerousGoodsCommodity[];
  productName: string;
  notDangerousGoods: boolean;
  warnings: string[];
}

function isObjectStorageAvailable(): boolean {
  return Boolean(process.env.PRIVATE_OBJECT_DIR);
}

/**
 * Read a stored safety data sheet back out, whichever backend it landed in.
 *
 * Exported because operations needs the same bytes for a different reason: an operator signing
 * a Shipper's Declaration on Ezhalha's behalf has to read the sheet the client uploaded, not
 * take the extracted fields on trust.
 */
export async function readStoredFileBuffer(objectPath: string): Promise<Buffer> {
  if (objectPath.startsWith("/uploads/")) {
    const result = await localStorageService.getFile(path.basename(objectPath));
    if (!result) {
      throw new Error(`Safety data sheet was not found for path ${objectPath}`);
    }
    return result.data;
  }

  if (objectPath.startsWith("/objects/") && isObjectStorageAvailable()) {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [data] = await objectFile.download();
    return data;
  }

  throw new Error(`Safety data sheet path is not supported: ${objectPath}`);
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

async function extractTextForGemini(
  contentType: string,
  fileName: string,
  buffer: Buffer,
): Promise<string | undefined> {
  const extension = path.extname(fileName).toLowerCase();

  if (contentType === "application/pdf" || extension === ".pdf") {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text?.trim() || undefined;
    } catch {
      // A scanned SDS has no text layer. Gemini reads the PDF bytes directly instead.
      return undefined;
    }
  }

  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || undefined;
  }

  if (contentType === "text/plain") {
    return buffer.toString("utf8");
  }

  return undefined;
}

/** "UN 1263", "un1263" and "1263" all become "UN1263"; anything unrecognisable stays empty. */
function normalizeUnNumber(value: string): string {
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  const match = /^(UN|ID)?(\d{4})$/.exec(cleaned);
  if (!match) return "";
  return `${match[1] || "UN"}${match[2]}`;
}

/** "Class 3", "3 (8)", "4.1" → "3", "3", "4.1". Returns empty when nothing usable is present. */
function normalizeHazardClass(value: string): string {
  const match = /([1-9])(?:\.([1-6]))?/.exec(value.replace(/\s+/g, ""));
  if (!match) return "";
  return match[2] ? `${match[1]}.${match[2]}` : match[1];
}

function normalizePackingGroup(value: string): DgPackingGroupValue {
  const normalized = value.trim().toUpperCase();
  if (normalized === "I") return DgPackingGroup.I;
  if (normalized === "II") return DgPackingGroup.II;
  if (normalized === "III") return DgPackingGroup.III;
  return DgPackingGroup.NONE;
}

/**
 * Pull the transport classification out of a safety data sheet.
 *
 * Everything the SDS does not state is returned empty and listed in `missingFields` rather
 * than filled with a plausible-looking guess. The client completes those on the review step —
 * on a declaration Ezhalha signs, a blank the shipper has to fill is safer than a value
 * nobody chose.
 */
export async function extractDangerousGoodsFromDocument(document: {
  fileName: string;
  objectPath: string;
  contentType: string;
}): Promise<DangerousGoodsExtractionResult> {
  if (!isGeminiDangerousGoodsExtractionConfigured()) {
    throw new Error(
      "AI extraction is not configured. Enter the transport details from section 14 of the safety data sheet manually.",
    );
  }

  const contentType = normalizeContentType(document.contentType);
  if (!SUPPORTED_SDS_CONTENT_TYPES.has(contentType)) {
    throw new Error(`We can't read ${document.contentType}. Upload the safety data sheet as a PDF, Word document or image.`);
  }

  const buffer = await readStoredFileBuffer(document.objectPath);
  const extractedText = await extractTextForGemini(contentType, document.fileName, buffer);

  const result = await extractDangerousGoodsWithGemini({
    contentType,
    buffer,
    extractedText,
  });

  const commodities: ExtractedDangerousGoodsCommodity[] = result.entries.map((entry) => {
    const unNumber = normalizeUnNumber(entry.unNumber);
    const hazardClass = normalizeHazardClass(entry.hazardClass);
    const properShippingName = entry.properShippingName.trim();
    const technicalName = entry.technicalName.trim();

    const missingFields: string[] = [];
    if (!unNumber) missingFields.push("unNumber");
    if (!properShippingName) missingFields.push("properShippingName");
    if (!hazardClass) missingFields.push("hazardClass");
    // An n.o.s. entry is not a legal declaration without the substance named alongside it.
    if (/n\.o\.s\./i.test(properShippingName) && !technicalName) missingFields.push("technicalName");
    // Never extracted — a safety data sheet describes a substance, not a shipment.
    missingFields.push("quantity");

    return {
      unNumber,
      properShippingName,
      technicalName,
      hazardClass,
      subsidiaryRisks: entry.subsidiaryRisks
        .map((risk) => normalizeHazardClass(risk))
        .filter(Boolean),
      packingGroup: normalizePackingGroup(entry.packingGroup),
      packingInstruction: entry.packingInstruction.trim(),
      cargoAircraftOnly: entry.cargoAircraftOnly,
      missingFields,
    };
  });

  const warnings = [...result.warnings];
  if (commodities.some((commodity) => commodity.missingFields.some((field) => field !== "quantity"))) {
    warnings.push("Some transport details were not stated in this document. Fill in the highlighted fields before continuing.");
  }

  return {
    commodities,
    productName: result.productName,
    notDangerousGoods: result.notDangerousGoods,
    warnings,
  };
}
