import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { ObjectStorageService } from "../integrations/storage";
import { LocalStorageService } from "../integrations/storage/localStorage";
import { getIntegrationEnv } from "./integration-runtime";

export interface CompanyDocumentInput {
  fileName: string;
  objectPath: string;
  contentType: string;
  label?: string;
}

const geminiCompanySchema = z.object({
  companyName: z.string().default(""),
  contactName: z.string().default(""),
  contactPhone: z.string().default(""),
  countryCode: z.string().default(""),
  stateOrProvince: z.string().default(""),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  addressLine1: z.string().default(""),
  addressLine2: z.string().default(""),
  shortAddress: z.string().default(""),
  warnings: z.array(z.string()).default([]),
});

export type ExtractedCompanyDetails = z.infer<typeof geminiCompanySchema>;

const geminiCompanyJsonSchema = {
  type: "object",
  properties: {
    companyName: { type: "string", description: "The company's registered legal name (English if available, else as printed). Empty if unknown." },
    contactName: { type: "string", description: "The authorized person, owner, director, or signatory named on the documents. Empty if unknown." },
    contactPhone: { type: "string", description: "A company or contact phone number in international format if available. Empty if unknown." },
    countryCode: { type: "string", description: "ISO 3166-1 alpha-2 country code of the registered address (e.g. SA). Empty if unknown." },
    stateOrProvince: { type: "string", description: "State, province, or region of the registered address. Empty if unknown." },
    city: { type: "string", description: "City of the registered address. Empty if unknown." },
    postalCode: { type: "string", description: "Postal / ZIP code of the registered address. Empty if unknown." },
    addressLine1: { type: "string", description: "Street address and building of the registered address. Empty if unknown." },
    addressLine2: { type: "string", description: "Secondary address line (unit, floor, district) if present. Empty if unknown." },
    shortAddress: { type: "string", description: "Saudi National Address short code (4 letters + 4 digits, e.g. RCTB4359) if present. Empty if unknown." },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "companyName", "contactName", "contactPhone", "countryCode", "stateOrProvince",
    "city", "postalCode", "addressLine1", "addressLine2", "shortAddress", "warnings",
  ],
} as const;

const localStorageService = new LocalStorageService();
const objectStorageService = new ObjectStorageService();

function getGeminiModel(): string {
  return getIntegrationEnv("GEMINI_INVOICE_EXTRACTION_MODEL") || "gemini-2.5-flash-lite";
}

function getGeminiApiKey(): string | undefined {
  return getIntegrationEnv("GEMINI_API_KEY");
}

function getGeminiGenerateContentEndpoint(model: string): string {
  const normalizedModel = model.startsWith("models/") ? model : `models/${model}`;
  return `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`;
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

function isObjectStorageAvailable(): boolean {
  return Boolean(getIntegrationEnv("PRIVATE_OBJECT_DIR") && getIntegrationEnv("PUBLIC_OBJECT_SEARCH_PATHS"));
}

async function readStoredFileBuffer(objectPath: string): Promise<Buffer> {
  if (objectPath.startsWith("/uploads/")) {
    const result = await localStorageService.getFile(path.basename(objectPath));
    if (!result) {
      throw new Error(`Company document was not found for path ${objectPath}`);
    }
    return result.data;
  }
  if (objectPath.startsWith("/objects/") && isObjectStorageAvailable()) {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [data] = await objectFile.download();
    return data;
  }
  throw new Error(`Company document path is not supported: ${objectPath}`);
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

/** Build the Gemini content parts for a single company document. */
async function buildDocumentParts(document: CompanyDocumentInput): Promise<Array<Record<string, unknown>>> {
  const contentType = normalizeContentType(document.contentType);
  const extension = path.extname(document.fileName).toLowerCase();
  const buffer = await readStoredFileBuffer(document.objectPath);
  const heading = `Document (${document.label || "company document"}): ${document.fileName}`;

  // Images and PDFs are sent inline so Gemini can read scanned certificates directly.
  if (contentType.startsWith("image/") || contentType === "application/pdf" || extension === ".pdf") {
    return [
      { text: heading },
      { inline_data: { mime_type: contentType === "application/pdf" || extension === ".pdf" ? "application/pdf" : contentType, data: buffer.toString("base64") } },
    ];
  }

  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const text = (await mammoth.extractRawText({ buffer })).value || "";
    return text.trim() ? [{ text: `${heading}\n${text.slice(0, 120000)}` }] : [];
  }

  if (contentType === "text/plain" || extension === ".txt") {
    const text = buffer.toString("utf8");
    return text.trim() ? [{ text: `${heading}\n${text.slice(0, 120000)}` }] : [];
  }

  // Unknown types: best effort text extraction, else skip.
  const fallback = await extractTextFromPdf(buffer).catch(() => "");
  return fallback.trim() ? [{ text: `${heading}\n${fallback.slice(0, 120000)}` }] : [];
}

function buildInstructions(): string {
  return [
    "You are reading official company registration documents (e.g. Commercial Registration, Tax/VAT Certificate, Memorandum of Association, and a director/owner ID).",
    "Extract the applicant company's details to pre-fill a business account registration form.",
    "Return the company's registered legal name, its registered address (street, city, state/province, postal code, country), the authorized contact person and their phone number.",
    "For Saudi Arabian addresses, extract the National Address short code (four letters followed by four digits, e.g. RCTB4359) when it appears.",
    "Use the ISO 3166-1 alpha-2 code for the country (for example SA for Saudi Arabia).",
    "Prefer English values when both English and Arabic are present; otherwise return the value as printed.",
    "If a field is not clearly present in the documents, return an empty string for it. Never guess or invent values.",
  ].join(" ");
}

function extractGeminiResponseText(payload: any): string {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const textParts = candidates.flatMap((candidate: any) => {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    return parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).filter(Boolean);
  });
  return textParts.join("").trim();
}

export function isGeminiCompanyExtractionConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function extractCompanyDetailsFromDocuments(
  documents: CompanyDocumentInput[],
): Promise<ExtractedCompanyDetails> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini company extraction is not configured.");
  }
  if (documents.length === 0) {
    throw new Error("No company documents were provided for extraction.");
  }

  const parts: Array<Record<string, unknown>> = [{ text: buildInstructions() }];
  for (const document of documents) {
    try {
      const documentParts = await buildDocumentParts(document);
      parts.push(...documentParts);
    } catch {
      // Skip a document we cannot read rather than failing the whole extraction.
    }
  }

  if (parts.length <= 1) {
    throw new Error("None of the uploaded company documents could be read for extraction.");
  }

  const response = await fetch(getGeminiGenerateContentEndpoint(getGeminiModel()), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: geminiCompanyJsonSchema,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error?.status || "Gemini company extraction failed.";
    throw new Error(message);
  }

  const responseText = extractGeminiResponseText(payload);
  if (!responseText) {
    throw new Error("Gemini did not return any company extraction content.");
  }

  const parsed = geminiCompanySchema.parse(JSON.parse(responseText));
  return {
    ...parsed,
    countryCode: parsed.countryCode.trim().toUpperCase().slice(0, 2),
    shortAddress: parsed.shortAddress.trim().toUpperCase(),
  };
}
