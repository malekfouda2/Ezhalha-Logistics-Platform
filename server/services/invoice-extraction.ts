import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import XLSX from "xlsx";
import {
  HsCodeConfidence,
  HsCodeSource,
  ItemCategory,
  type HsCodeConfidenceValue,
  type HsCodeSourceValue,
} from "@shared/schema";
import { ObjectStorageService } from "../integrations/storage";
import { LocalStorageService } from "../integrations/storage/localStorage";
import {
  extractInvoiceItemsWithOpenAI,
  isOpenAIInvoiceExtractionConfigured,
} from "./openai-invoice-extraction";

const localStorageService = new LocalStorageService();
const objectStorageService = new ObjectStorageService();

const SUPPORTED_INVOICE_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/gif",
  "image/jpeg",
  "image/png",
]);

const HEADER_ALIASES = {
  description: [
    "description",
    "item",
    "item description",
    "product",
    "product description",
    "goods",
    "commodity",
    "article",
    "name",
  ],
  quantity: ["qty", "quantity", "pieces", "piece", "pcs", "units", "unit"],
  unitPrice: ["unit price", "price", "unit value", "rate", "price per unit", "unit cost"],
  amount: ["amount", "line total", "total", "extended price", "item total", "net amount", "value"],
  currency: ["currency", "curr", "ccy"],
  hsCode: ["hs", "hs code", "hscode", "tariff", "tariff code"],
  origin: ["origin", "country of origin", "made in"],
  material: ["material", "composition", "fabric"],
} as const;

const CURRENCY_CODES = ["SAR", "USD", "EUR", "GBP", "AED", "QAR", "KWD", "BHD", "OMR", "EGP", "JPY", "CNY"];
const CURRENCY_SYMBOL_MAP: Array<{ symbol: string; code: string }> = [
  { symbol: "SAR", code: "SAR" },
  { symbol: "SR", code: "SAR" },
  { symbol: "USD", code: "USD" },
  { symbol: "$", code: "USD" },
  { symbol: "EUR", code: "EUR" },
  { symbol: "€", code: "EUR" },
  { symbol: "GBP", code: "GBP" },
  { symbol: "£", code: "GBP" },
  { symbol: "AED", code: "AED" },
  { symbol: "QAR", code: "QAR" },
  { symbol: "KWD", code: "KWD" },
  { symbol: "BHD", code: "BHD" },
  { symbol: "OMR", code: "OMR" },
  { symbol: "EGP", code: "EGP" },
  { symbol: "JPY", code: "JPY" },
  { symbol: "CNY", code: "CNY" },
];

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: ItemCategory.ELECTRONICS, keywords: ["keyboard", "mouse", "monitor", "charger", "battery", "phone", "laptop", "tablet", "usb", "electronic"] },
  { category: ItemCategory.CLOTHING, keywords: ["shirt", "dress", "jacket", "pants", "clothing", "garment", "shoes", "apparel"] },
  { category: ItemCategory.FOOD, keywords: ["food", "snack", "tea", "coffee", "spice", "chocolate", "beverage"] },
  { category: ItemCategory.COSMETICS, keywords: ["cream", "perfume", "makeup", "cosmetic", "shampoo", "lotion"] },
  { category: ItemCategory.PHARMACEUTICALS, keywords: ["medical", "pharma", "medicine", "supplement", "tablet", "capsule"] },
  { category: ItemCategory.MACHINERY, keywords: ["machine", "motor", "compressor", "pump", "tool", "equipment"] },
  { category: ItemCategory.CHEMICALS, keywords: ["chemical", "solvent", "adhesive", "resin", "cleaner"] },
  { category: ItemCategory.TEXTILES, keywords: ["fabric", "textile", "cotton", "polyester", "thread"] },
  { category: ItemCategory.METALS, keywords: ["metal", "steel", "aluminum", "copper", "iron"] },
  { category: ItemCategory.PLASTICS, keywords: ["plastic", "polymer", "polyethylene", "polypropylene"] },
  { category: ItemCategory.FURNITURE, keywords: ["chair", "table", "desk", "cabinet", "furniture"] },
  { category: ItemCategory.AUTOMOTIVE, keywords: ["automotive", "car", "vehicle", "engine", "brake", "tire"] },
  { category: ItemCategory.TOYS, keywords: ["toy", "game", "doll", "puzzle"] },
  { category: ItemCategory.SPORTS, keywords: ["sports", "ball", "racket", "fitness", "gym"] },
  { category: ItemCategory.DOCUMENTS, keywords: ["document", "paper", "brochure", "catalog"] },
  { category: ItemCategory.SAMPLES, keywords: ["sample", "specimen", "prototype"] },
];

export interface InvoiceDocumentInput {
  fileName: string;
  objectPath: string;
  contentType: string;
}

export interface ExtractedInvoiceItem {
  itemName: string;
  itemDescription: string;
  category: string;
  material: string;
  countryOfOrigin: string;
  hsCode: string;
  hsCodeSource: HsCodeSourceValue;
  hsCodeConfidence: HsCodeConfidenceValue;
  hsCodeCandidates: Array<{ code: string; description: string; confidence: number }>;
  price: number;
  currency: string;
  quantity: number;
}

export interface InvoiceExtractionResult {
  items: ExtractedInvoiceItem[];
  warnings: string[];
  detectedCurrency: string;
  extractionMethod: "deterministic" | "openai";
}

interface ParsedRow {
  description: string;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  currency?: string | null;
  hsCode?: string | null;
  countryOfOrigin?: string | null;
  material?: string | null;
}

function isObjectStorageAvailable(): boolean {
  return Boolean(process.env.PRIVATE_OBJECT_DIR && process.env.PUBLIC_OBJECT_SEARCH_PATHS);
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
      throw new Error(`Invoice file was not found for path ${objectPath}`);
    }
    return result.data;
  }

  if (objectPath.startsWith("/objects/") && isObjectStorageAvailable()) {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [data] = await objectFile.download();
    return data;
  }

  throw new Error(`Invoice path is not supported: ${objectPath}`);
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

  const cleaned = value
    .replace(/[, ]+/g, "")
    .replace(/[A-Za-z$€£]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectCurrencyFromText(text: string, fallbackCurrency: string): string {
  const upper = text.toUpperCase();

  for (const code of CURRENCY_CODES) {
    if (upper.includes(code)) {
      return code;
    }
  }

  for (const entry of CURRENCY_SYMBOL_MAP) {
    if (upper.includes(entry.symbol)) {
      return entry.code;
    }
  }

  return fallbackCurrency;
}

function normalizeCurrency(value: unknown, fallbackCurrency: string): string {
  if (typeof value === "string" && value.trim()) {
    return detectCurrencyFromText(value, fallbackCurrency);
  }
  return fallbackCurrency;
}

function isLikelySummaryLine(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "invoice",
    "date",
    "subtotal",
    "sub total",
    "discount",
    "vat",
    "tax",
    "total",
    "grand total",
    "amount due",
    "balance due",
    "bank",
    "iban",
    "ship to",
    "bill to",
    "terms",
  ].some((keyword) => normalized.includes(keyword));
}

function inferCategory(description: string): string {
  const normalized = description.toLowerCase();

  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.category;
    }
  }

  return ItemCategory.OTHER;
}

function normalizeTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function shouldUseOpenAIOnWarning(result: { warnings: string[] }): boolean {
  return process.env.OPENAI_INVOICE_FALLBACK_ON_WARNING === "true" && result.warnings.length > 0;
}

function toExtractedItem(
  row: ParsedRow,
  fallbackCountryOfOrigin: string,
  fallbackCurrency: string,
  warnings: string[],
): ExtractedInvoiceItem | null {
  const itemName = normalizeTextValue(row.description);
  if (!itemName || isLikelySummaryLine(itemName)) {
    return null;
  }

  const quantity = row.quantity && row.quantity > 0 ? row.quantity : 1;
  let price = row.unitPrice && row.unitPrice >= 0 ? row.unitPrice : null;

  if (price === null && row.amount !== null && row.amount !== undefined) {
    price = quantity > 0 ? row.amount / quantity : row.amount;
  }

  if (price === null || price <= 0) {
    warnings.push(`Could not determine a unit price for "${itemName}".`);
    return null;
  }

  return {
    itemName,
    itemDescription: itemName,
    category: inferCategory(itemName),
    material: normalizeTextValue(row.material),
    countryOfOrigin: normalizeTextValue(row.countryOfOrigin) || fallbackCountryOfOrigin,
    hsCode: normalizeTextValue(row.hsCode),
    hsCodeSource: HsCodeSource.UNKNOWN,
    hsCodeConfidence: HsCodeConfidence.MISSING,
    hsCodeCandidates: [],
    price: Number(price.toFixed(2)),
    currency: normalizeCurrency(row.currency, fallbackCurrency),
    quantity: Math.max(1, Math.round(quantity)),
  };
}

function parseSpreadsheetRows(sheetRows: unknown[][]): ParsedRow[] {
  const rows = sheetRows
    .map((row) => row.map((cell) => normalizeTextValue(cell)))
    .filter((row) => row.some((cell) => cell));

  let headerIndex = -1;
  let headerColumns: Record<string, number> = {};

  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const normalizedRow = rows[index].map(normalizeHeader);
    const descriptionIndex = findHeaderColumn(normalizedRow, HEADER_ALIASES.description);
    const quantityIndex = findHeaderColumn(normalizedRow, HEADER_ALIASES.quantity);
    const amountIndex = findHeaderColumn(normalizedRow, HEADER_ALIASES.amount);
    const priceIndex = findHeaderColumn(normalizedRow, HEADER_ALIASES.unitPrice);

    if (descriptionIndex >= 0 && (quantityIndex >= 0 || amountIndex >= 0 || priceIndex >= 0)) {
      headerIndex = index;
      headerColumns = {
        description: descriptionIndex,
        quantity: quantityIndex,
        unitPrice: priceIndex,
        amount: amountIndex,
        currency: findHeaderColumn(normalizedRow, HEADER_ALIASES.currency),
        hsCode: findHeaderColumn(normalizedRow, HEADER_ALIASES.hsCode),
        origin: findHeaderColumn(normalizedRow, HEADER_ALIASES.origin),
        material: findHeaderColumn(normalizedRow, HEADER_ALIASES.material),
      };
      break;
    }
  }

  if (headerIndex < 0) {
    return [];
  }

  const parsedRows: ParsedRow[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const description = row[headerColumns.description] || "";
    if (!description || isLikelySummaryLine(description)) {
      continue;
    }

    parsedRows.push({
      description,
      quantity: headerColumns.quantity >= 0 ? parseNumber(row[headerColumns.quantity]) : null,
      unitPrice: headerColumns.unitPrice >= 0 ? parseNumber(row[headerColumns.unitPrice]) : null,
      amount: headerColumns.amount >= 0 ? parseNumber(row[headerColumns.amount]) : null,
      currency: headerColumns.currency >= 0 ? row[headerColumns.currency] : null,
      hsCode: headerColumns.hsCode >= 0 ? row[headerColumns.hsCode] : null,
      countryOfOrigin: headerColumns.origin >= 0 ? row[headerColumns.origin] : null,
      material: headerColumns.material >= 0 ? row[headerColumns.material] : null,
    });
  }

  return parsedRows;
}

function splitTextRow(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim()).filter(Boolean);
  }

  if (line.includes("|")) {
    return line.split("|").map((cell) => cell.trim()).filter(Boolean);
  }

  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  }

  return [line.trim()];
}

function parseTextRows(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines.map(splitTextRow).filter((row) => row.length > 0);

  const spreadsheetLikeRows = parseSpreadsheetRows(rows);
  if (spreadsheetLikeRows.length > 0) {
    return spreadsheetLikeRows;
  }

  const parsedRows: ParsedRow[] = [];

  for (const line of lines) {
    if (isLikelySummaryLine(line)) {
      continue;
    }

    const columns = splitTextRow(line);
    if (columns.length < 2) {
      continue;
    }

    const numericCells = columns
      .map((cell, index) => ({ index, value: parseNumber(cell) }))
      .filter((entry) => entry.value !== null);

    if (numericCells.length === 0) {
      continue;
    }

    const lastNumeric = numericCells[numericCells.length - 1];
    const secondLastNumeric = numericCells.length > 1 ? numericCells[numericCells.length - 2] : null;
    const descriptionEndIndex = secondLastNumeric ? secondLastNumeric.index : lastNumeric.index;
    const description = columns.slice(0, descriptionEndIndex).join(" ").trim();

    if (!description) {
      continue;
    }

    parsedRows.push({
      description,
      quantity: secondLastNumeric ? secondLastNumeric.value : 1,
      amount: lastNumeric.value,
    });
  }

  return parsedRows;
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

function extractRowsFromWorkbook(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parsedRows: ParsedRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];

    parsedRows.push(...parseSpreadsheetRows(rows));
  }

  return parsedRows;
}

async function extractInvoiceItemsFromDocumentDeterministic(
  document: InvoiceDocumentInput,
  options: { fallbackCountryOfOrigin: string; fallbackCurrency?: string },
): Promise<InvoiceExtractionResult> {
  const normalizedContentType = normalizeContentType(document.contentType);
  const extension = getExtension(document.fileName);

  if (!SUPPORTED_INVOICE_CONTENT_TYPES.has(normalizedContentType)) {
    throw new Error(`Unsupported invoice format: ${document.contentType}`);
  }

  const buffer = await readStoredFileBuffer(document.objectPath);
  let parsedRows: ParsedRow[] = [];
  let detectedCurrency = options.fallbackCurrency || "SAR";

  if (normalizedContentType === "application/pdf" || extension === ".pdf") {
    const text = await extractTextFromPdf(buffer);
    detectedCurrency = detectCurrencyFromText(text, detectedCurrency);
    parsedRows = parseTextRows(text);
  } else if (
    normalizedContentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const text = await extractTextFromDocx(buffer);
    detectedCurrency = detectCurrencyFromText(text, detectedCurrency);
    parsedRows = parseTextRows(text);
  } else if (
    normalizedContentType === "application/vnd.ms-excel" ||
    normalizedContentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    extension === ".xls" ||
    extension === ".xlsx"
  ) {
    parsedRows = extractRowsFromWorkbook(buffer);
  } else {
    if (isImageContentType(normalizedContentType)) {
      throw new Error("Image invoices require AI extraction.");
    }

    const text = buffer.toString("utf8");
    detectedCurrency = detectCurrencyFromText(text, detectedCurrency);
    parsedRows = parseTextRows(text);
  }

  const warnings: string[] = [];
  const items = parsedRows
    .map((row) =>
      toExtractedItem(
        row,
        options.fallbackCountryOfOrigin,
        detectedCurrency,
        warnings,
      ),
    )
    .filter((item): item is ExtractedInvoiceItem => item !== null);

  if (items.length === 0) {
    throw new Error("We could not extract shipment items from this invoice.");
  }

  return {
    items,
    warnings: Array.from(new Set(warnings)),
    detectedCurrency,
    extractionMethod: "deterministic",
  };
}

async function extractInvoiceTextForOpenAI(
  document: InvoiceDocumentInput,
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
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rowLines: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown[][];

      for (const row of rows) {
        const line = row.map((cell) => normalizeTextValue(cell)).filter(Boolean).join("\t");
        if (line) {
          rowLines.push(line);
        }
      }
    }

    return rowLines.join("\n") || undefined;
  }

  if (normalizedContentType === "text/plain") {
    return buffer.toString("utf8");
  }

  return undefined;
}

export async function extractInvoiceItemsFromDocument(
  document: InvoiceDocumentInput,
  options: { fallbackCountryOfOrigin: string; fallbackCurrency?: string },
): Promise<InvoiceExtractionResult> {
  const normalizedContentType = normalizeContentType(document.contentType);
  const buffer = await readStoredFileBuffer(document.objectPath);
  const fallbackCurrency = options.fallbackCurrency || "SAR";
  const openAIConfigured = isOpenAIInvoiceExtractionConfigured();

  if (isImageContentType(normalizedContentType)) {
    if (!openAIConfigured) {
      throw new Error("Scanned invoice images require AI extraction. Configure OpenAI or upload a PDF, DOCX, XLSX, or TXT invoice.");
    }

    const aiResult = await extractInvoiceItemsWithOpenAI({
      document: {
        ...document,
        contentType: normalizedContentType,
      },
      buffer,
      fallbackCountryOfOrigin: options.fallbackCountryOfOrigin,
      fallbackCurrency,
    });

    return {
      ...aiResult,
      warnings: Array.from(new Set([
        "AI extraction was used for this invoice. Review the extracted items carefully.",
        ...aiResult.warnings,
      ])),
      extractionMethod: "openai",
    };
  }

  try {
    const deterministicResult = await extractInvoiceItemsFromDocumentDeterministic(
      document,
      options,
    );

    if (!openAIConfigured || !shouldUseOpenAIOnWarning(deterministicResult)) {
      return deterministicResult;
    }

    const aiResult = await extractInvoiceItemsWithOpenAI({
      document: {
        ...document,
        contentType: normalizedContentType,
      },
      buffer,
      extractedText: await extractInvoiceTextForOpenAI(document, buffer),
      fallbackCountryOfOrigin: options.fallbackCountryOfOrigin,
      fallbackCurrency,
    });

    return {
      ...aiResult,
      warnings: Array.from(new Set([
        "AI extraction was used to improve invoice parsing. Review the extracted items carefully.",
        ...deterministicResult.warnings,
        ...aiResult.warnings,
      ])),
      extractionMethod: "openai",
    };
  } catch (error) {
    if (!openAIConfigured) {
      throw error;
    }

    const aiResult = await extractInvoiceItemsWithOpenAI({
      document: {
        ...document,
        contentType: normalizedContentType,
      },
      buffer,
      extractedText: await extractInvoiceTextForOpenAI(document, buffer),
      fallbackCountryOfOrigin: options.fallbackCountryOfOrigin,
      fallbackCurrency,
    });

    return {
      ...aiResult,
      warnings: Array.from(new Set([
        "AI extraction was used because the invoice could not be parsed reliably.",
        error instanceof Error ? error.message : "Deterministic parsing failed.",
        ...aiResult.warnings,
      ])),
      extractionMethod: "openai",
    };
  }
}
