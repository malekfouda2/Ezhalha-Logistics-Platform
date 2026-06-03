import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import XLSX from "xlsx";
import { ObjectStorageService } from "../integrations/storage";
import { LocalStorageService } from "../integrations/storage/localStorage";
import {
  extractPackagesWithGemini,
  isGeminiPackageExtractionConfigured,
} from "./gemini-package-extraction";
import { getIntegrationEnv, getIntegrationEnvBoolean } from "./integration-runtime";

const localStorageService = new LocalStorageService();
const objectStorageService = new ObjectStorageService();

const SUPPORTED_PACKAGE_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/gif",
  "image/jpeg",
  "image/png",
]);

const PACKAGE_HEADER_ALIASES = {
  cartonNo: ["carton no", "carton number", "box no", "box number", "ctn no"],
  cartonQty: ["carton qty", "carton quantity", "ctn qty", "box qty", "qty carton", "no. of cartons"],
  grossWeight: ["gross weight", "gross wt", "total g.w", "g.w", "g.w."],
  netWeight: ["net weight", "net wt", "n.w", "n.w."],
  size: ["carton size", "cartons size", "box size", "dimensions", "dimension", "size"],
  cbm: ["cbm", "volume", "cubic meter", "cubic metres", "overall volume"],
} as const;

export type PackageExtractionUnit = "KG" | "LB" | "CM" | "IN";

export interface PackageDocumentInput {
  fileName: string;
  objectPath: string;
  contentType: string;
}

export interface ExtractedPackage {
  packageNumber: string;
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface PackageExtractionResult {
  packages: ExtractedPackage[];
  warnings: string[];
  detectedWeightUnit: "KG" | "LB";
  detectedDimensionUnit: "CM" | "IN";
  extractionMethod: "deterministic" | "gemini";
}

interface HeaderColumns {
  cartonNo: number;
  cartonQty: number;
  grossWeight: number;
  netWeight: number;
  size: number;
}

interface PackageCandidate {
  packageNumber: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
}

function isLikelySummaryRow(row: string[]): boolean {
  const normalized = row.join(" ").toLowerCase();
  return ["total", "subtotal", "grand total", "overall total"].some((keyword) =>
    normalized.includes(keyword),
  );
}

function shouldUseGeminiOnWarning(result: { warnings: string[] }): boolean {
  return getIntegrationEnvBoolean("GEMINI_INVOICE_FALLBACK_ON_WARNING") && result.warnings.length > 0;
}

function isObjectStorageAvailable(): boolean {
  return Boolean(getIntegrationEnv("PRIVATE_OBJECT_DIR") && getIntegrationEnv("PUBLIC_OBJECT_SEARCH_PATHS"));
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

function getExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

async function readStoredFileBuffer(objectPath: string): Promise<Buffer> {
  if (objectPath.startsWith("/uploads/")) {
    const result = await localStorageService.getFile(path.basename(objectPath));
    if (!result) {
      throw new Error(`Package document was not found for path ${objectPath}`);
    }
    return result.data;
  }

  if (objectPath.startsWith("/objects/") && isObjectStorageAvailable()) {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [data] = await objectFile.download();
    return data;
  }

  throw new Error(`Package document path is not supported: ${objectPath}`);
}

function normalizeTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderColumn(headerRow: string[], aliases: readonly string[]): number {
  return headerRow.findIndex((cell) => aliases.some((alias) => cell === alias || cell.includes(alias)));
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const matches = value.match(/[-+]?\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length !== 1) {
    return null;
  }

  const parsed = Number(matches[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.max(1, Math.round(parsed));
}

function detectWeightUnitFromText(text: string): "KG" | "LB" {
  return /\b(lb|lbs|pounds?)\b/i.test(text) ? "LB" : "KG";
}

function detectDimensionUnitFromText(text: string): "CM" | "IN" {
  return /\b(in|inch|inches)\b/i.test(text) ? "IN" : "CM";
}

function findPackageHeaderColumns(rows: string[][]): { headerIndex: number; columns: HeaderColumns } | null {
  for (let index = 0; index < Math.min(rows.length, 25); index += 1) {
    const normalizedRow = rows[index].map(normalizeHeader);
    const cartonNo = findHeaderColumn(normalizedRow, PACKAGE_HEADER_ALIASES.cartonNo);
    const cartonQty = findHeaderColumn(normalizedRow, PACKAGE_HEADER_ALIASES.cartonQty);
    const grossWeight = findHeaderColumn(normalizedRow, PACKAGE_HEADER_ALIASES.grossWeight);
    const netWeight = findHeaderColumn(normalizedRow, PACKAGE_HEADER_ALIASES.netWeight);
    const size = findHeaderColumn(normalizedRow, PACKAGE_HEADER_ALIASES.size);

    if (cartonNo >= 0 && (grossWeight >= 0 || netWeight >= 0) && size >= 0) {
      return {
        headerIndex: index,
        columns: { cartonNo, cartonQty, grossWeight, netWeight, size },
      };
    }
  }

  return null;
}

function parseCartonIdentifiers(row: string[], columns: HeaderColumns): string[] {
  const start = parseInteger(row[columns.cartonNo]);
  const second = parseInteger(row[columns.cartonNo + 1]);
  const end = parseInteger(row[columns.cartonNo + 2]);

  if (start !== null && end !== null) {
    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, idx) => String(rangeStart + idx));
  }

  if (start !== null && second !== null) {
    const rangeStart = Math.min(start, second);
    const rangeEnd = Math.max(start, second);
    return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, idx) => String(rangeStart + idx));
  }

  if (start !== null) {
    return [String(start)];
  }

  return [];
}

function normalizeDimensions(
  length: number,
  width: number,
  height: number,
  detectedUnit: "CM" | "IN",
): { length: number; width: number; height: number; unit: "CM" | "IN" } {
  if (detectedUnit === "IN") {
    return {
      length: Number(length.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      unit: "IN",
    };
  }

  const maxValue = Math.max(length, width, height);
  if (maxValue <= 5) {
    return {
      length: Number((length * 100).toFixed(2)),
      width: Number((width * 100).toFixed(2)),
      height: Number((height * 100).toFixed(2)),
      unit: "CM",
    };
  }

  return {
    length: Number(length.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
    unit: "CM",
  };
}

function buildPackagesFromRows(rows: string[][], warnings: string[]): PackageExtractionResult {
  const headerInfo = findPackageHeaderColumns(rows);
  if (!headerInfo) {
    throw new Error("We could not identify the carton, weight, and size columns in this document.");
  }

  const headerText = rows[headerInfo.headerIndex].join(" ");
  const detectedWeightUnit = detectWeightUnitFromText(headerText);
  let detectedDimensionUnit = detectDimensionUnitFromText(headerText);
  const packageMap = new Map<string, PackageCandidate>();
  let anonymousCounter = 0;

  for (const row of rows.slice(headerInfo.headerIndex + 1)) {
    if (isLikelySummaryRow(row)) {
      continue;
    }

    const weight =
      (headerInfo.columns.grossWeight >= 0 ? parseNumber(row[headerInfo.columns.grossWeight]) : null) ??
      (headerInfo.columns.netWeight >= 0 ? parseNumber(row[headerInfo.columns.netWeight]) : null);
    const rawLength = parseNumber(row[headerInfo.columns.size]);
    const rawWidth = parseNumber(row[headerInfo.columns.size + 1]);
    const rawHeight = parseNumber(row[headerInfo.columns.size + 2]);
    const cartonQty =
      headerInfo.columns.cartonQty >= 0 ? parseInteger(row[headerInfo.columns.cartonQty]) : null;

    const hasMetrics = Boolean(weight && rawLength && rawWidth && rawHeight);
    if (!hasMetrics && !cartonQty) {
      continue;
    }

    const cartonIdentifiers = parseCartonIdentifiers(row, headerInfo.columns);
    const normalizedIds = cartonIdentifiers.length > 0
      ? cartonIdentifiers
      : Array.from({ length: cartonQty || 1 }, () => `__anon_${++anonymousCounter}`);

    const normalizedDims =
      rawLength && rawWidth && rawHeight
        ? normalizeDimensions(rawLength, rawWidth, rawHeight, detectedDimensionUnit)
        : null;

    if (normalizedDims?.unit === "CM") {
      detectedDimensionUnit = "CM";
    }

    for (const packageNumber of normalizedIds) {
      const existing = packageMap.get(packageNumber) || { packageNumber };
      if (weight && (!existing.weight || existing.weight <= 0)) {
        existing.weight = Number(weight.toFixed(3));
      }
      if (normalizedDims) {
        existing.length = existing.length || normalizedDims.length;
        existing.width = existing.width || normalizedDims.width;
        existing.height = existing.height || normalizedDims.height;
      }
      packageMap.set(packageNumber, existing);
    }
  }

  const packages = Array.from(packageMap.values());
  const completePackages = packages.filter(
    (pkg) => pkg.weight && pkg.length && pkg.width && pkg.height,
  ) as Array<Required<PackageCandidate>>;

  if (completePackages.length === 0) {
    throw new Error("We could not extract complete carton details from this document.");
  }

  const mostCommonDimensions = (() => {
    const counter = new Map<string, { length: number; width: number; height: number; count: number }>();
    for (const pkg of completePackages) {
      const key = `${pkg.length}x${pkg.width}x${pkg.height}`;
      const existing = counter.get(key) || {
        length: pkg.length,
        width: pkg.width,
        height: pkg.height,
        count: 0,
      };
      existing.count += 1;
      counter.set(key, existing);
    }
    return Array.from(counter.values()).sort((a, b) => b.count - a.count)[0] || null;
  })();

  const normalizedPackages = packages
    .map((pkg) => {
      const missingDimensions = !pkg.length || !pkg.width || !pkg.height;
      if (missingDimensions && mostCommonDimensions) {
        warnings.push(
          `Used the most common carton dimensions for package ${pkg.packageNumber.replace(/^__anon_/, "")}.`,
        );
        pkg.length = mostCommonDimensions.length;
        pkg.width = mostCommonDimensions.width;
        pkg.height = mostCommonDimensions.height;
      }

      if (!pkg.weight || !pkg.length || !pkg.width || !pkg.height) {
        warnings.push(
          `Skipped package ${pkg.packageNumber.replace(/^__anon_/, "") || "unknown"} because some carton details were missing.`,
        );
        return null;
      }

      return {
        packageNumber: pkg.packageNumber.startsWith("__anon_")
          ? ""
          : pkg.packageNumber,
        weight: Number(pkg.weight.toFixed(3)),
        length: Number(pkg.length.toFixed(2)),
        width: Number(pkg.width.toFixed(2)),
        height: Number(pkg.height.toFixed(2)),
      } as ExtractedPackage;
    })
    .filter((pkg): pkg is ExtractedPackage => pkg !== null);

  if (normalizedPackages.length === 0) {
    throw new Error("We could not extract usable package details from this document.");
  }

  return {
    packages: normalizedPackages,
    warnings: Array.from(new Set(warnings)),
    detectedWeightUnit,
    detectedDimensionUnit,
    extractionMethod: "deterministic",
  };
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function splitTextRow(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim());
  }

  if (line.includes("|")) {
    return line.split("|").map((cell) => cell.trim());
  }

  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((cell) => cell.trim());
  }

  return [line.trim()];
}

function workbookToSheets(buffer: Buffer): string[][][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[][][] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];

    sheets.push(sheetRows.map((row) => row.map((cell) => normalizeTextValue(cell))));
  }

  return sheets;
}

function textToRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitTextRow)
    .filter((row) => row.some(Boolean));
}

export async function extractPackageDetailsFromDocumentDeterministic(
  document: PackageDocumentInput,
): Promise<PackageExtractionResult> {
  const normalizedContentType = normalizeContentType(document.contentType);
  const extension = getExtension(document.fileName);
  if (!SUPPORTED_PACKAGE_CONTENT_TYPES.has(normalizedContentType)) {
    throw new Error(`Unsupported package document format: ${document.contentType}`);
  }

  const buffer = await readStoredFileBuffer(document.objectPath);
  let rows: string[][] = [];

  if (
    normalizedContentType === "application/vnd.ms-excel" ||
    normalizedContentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    extension === ".xls" ||
    extension === ".xlsx"
  ) {
    const sheetResults = workbookToSheets(buffer)
      .map((sheetRows) => {
        try {
          return buildPackagesFromRows(sheetRows, []);
        } catch {
          return null;
        }
      })
      .filter((result): result is PackageExtractionResult => result !== null)
      .sort((a, b) => b.packages.length - a.packages.length);

    if (sheetResults.length === 0) {
      throw new Error("We could not identify carton rows in this spreadsheet.");
    }

    return sheetResults[0];
  } else if (normalizedContentType === "application/pdf" || extension === ".pdf") {
    rows = textToRows(await extractTextFromPdf(buffer));
  } else if (
    normalizedContentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    rows = textToRows(await extractTextFromDocx(buffer));
  } else {
    rows = textToRows(buffer.toString("utf8"));
  }

  if (rows.length === 0) {
    throw new Error("We could not read any package rows from this document.");
  }

  return buildPackagesFromRows(rows, []);
}

async function extractPackageTextForGemini(
  document: PackageDocumentInput,
  buffer: Buffer,
): Promise<string | undefined> {
  const normalizedContentType = normalizeContentType(document.contentType);
  const extension = getExtension(document.fileName);

  if (normalizedContentType === "application/pdf" || extension === ".pdf") {
    const text = await extractTextFromPdf(buffer);
    return text.trim() || undefined;
  }

  if (
    normalizedContentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const text = await extractTextFromDocx(buffer);
    return text.trim() || undefined;
  }

  if (
    normalizedContentType === "application/vnd.ms-excel" ||
    normalizedContentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    extension === ".xls" ||
    extension === ".xlsx"
  ) {
    return workbookToSheets(buffer)
      .flat()
      .map((row) => row.filter(Boolean).join("\t"))
      .filter(Boolean)
      .join("\n");
  }

  if (normalizedContentType === "text/plain") {
    return buffer.toString("utf8");
  }

  return undefined;
}

export async function extractPackageDetailsFromDocument(
  document: PackageDocumentInput,
): Promise<PackageExtractionResult> {
  const normalizedContentType = normalizeContentType(document.contentType);
  const buffer = await readStoredFileBuffer(document.objectPath);
  const geminiConfigured = isGeminiPackageExtractionConfigured();

  if (normalizedContentType.startsWith("image/")) {
    if (!geminiConfigured) {
      throw new Error("Image-based packing lists require AI extraction. Configure Gemini or upload a spreadsheet or document.");
    }

    const aiResult = await extractPackagesWithGemini({
      document: {
        ...document,
        contentType: normalizedContentType,
      },
      buffer,
    });

    return {
      ...aiResult,
      warnings: Array.from(new Set([
        "AI extraction was used for this package document. Review the imported cartons carefully.",
        ...aiResult.warnings,
      ])),
      extractionMethod: "gemini",
    };
  }

  try {
    const deterministicResult = await extractPackageDetailsFromDocumentDeterministic(document);
    if (!geminiConfigured || !shouldUseGeminiOnWarning(deterministicResult)) {
      return deterministicResult;
    }

    const aiResult = await extractPackagesWithGemini({
      document: {
        ...document,
        contentType: normalizedContentType,
      },
      buffer,
      extractedText: await extractPackageTextForGemini(document, buffer),
    });

    return {
      ...aiResult,
      warnings: Array.from(new Set([
        "AI extraction was used to improve package parsing. Review the imported cartons carefully.",
        ...deterministicResult.warnings,
        ...aiResult.warnings,
      ])),
      extractionMethod: "gemini",
    };
  } catch (error) {
    if (!geminiConfigured) {
      throw error;
    }

    const aiResult = await extractPackagesWithGemini({
      document: {
        ...document,
        contentType: normalizedContentType,
      },
      buffer,
      extractedText: await extractPackageTextForGemini(document, buffer),
    });

    return {
      ...aiResult,
      warnings: Array.from(new Set([
        "AI extraction was used because the package document could not be parsed reliably.",
        error instanceof Error ? error.message : "Deterministic package parsing failed.",
        ...aiResult.warnings,
      ])),
      extractionMethod: "gemini",
    };
  }
}
