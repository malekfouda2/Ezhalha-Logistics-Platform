import { z } from "zod";
import { ItemCategory } from "@shared/schema";
import type {
  ExtractedInvoiceItem,
  InvoiceDocumentInput,
} from "./invoice-extraction";

const geminiInvoiceItemSchema = z.object({
  itemName: z.string().min(1),
  itemDescription: z.string().default(""),
  category: z.enum(Object.values(ItemCategory) as [string, ...string[]]).default(ItemCategory.OTHER),
  material: z.string().default(""),
  countryOfOrigin: z.string().default(""),
  hsCode: z.string().default(""),
  price: z.number().nonnegative(),
  currency: z.string().default(""),
  quantity: z.number().int().positive(),
});

const geminiInvoiceExtractionSchema = z.object({
  items: z.array(geminiInvoiceItemSchema),
  warnings: z.array(z.string()).default([]),
  detectedCurrency: z.string().length(3).default("SAR"),
});

type GeminiInvoiceExtraction = z.infer<typeof geminiInvoiceExtractionSchema>;

const geminiInvoiceExtractionJsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemName: { type: "string", description: "The shipped item name." },
          itemDescription: { type: "string", description: "The shipped item description." },
          category: {
            type: "string",
            enum: Object.values(ItemCategory),
            description: "One of the allowed shipment item categories.",
          },
          material: { type: "string", description: "The material or composition if visible." },
          countryOfOrigin: {
            type: "string",
            description: "A 2-letter country code if visible, otherwise an empty string.",
          },
          hsCode: { type: "string", description: "The HS code if visible, otherwise an empty string." },
          price: { type: "number", description: "The unit price for the shipped item." },
          currency: {
            type: "string",
            description: "A 3-letter currency code if visible, otherwise an empty string.",
          },
          quantity: { type: "integer", description: "The quantity for the shipped item." },
        },
        required: [
          "itemName",
          "itemDescription",
          "category",
          "material",
          "countryOfOrigin",
          "hsCode",
          "price",
          "currency",
          "quantity",
        ],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Warnings about ambiguous or low-confidence extraction details.",
    },
    detectedCurrency: {
      type: "string",
      description: "A 3-letter currency code inferred from the invoice.",
    },
  },
  required: ["items", "warnings", "detectedCurrency"],
} as const;

function getGeminiModel(): string {
  return process.env.GEMINI_INVOICE_EXTRACTION_MODEL || "gemini-2.5-flash-lite";
}

function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

function getGeminiGenerateContentEndpoint(model: string): string {
  const normalizedModel = model.startsWith("models/") ? model : `models/${model}`;
  return `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`;
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function isPdfContentType(contentType: string): boolean {
  return contentType === "application/pdf";
}

function buildInstructions(options: {
  fallbackCountryOfOrigin: string;
  fallbackCurrency: string;
}): string {
  return [
    "Extract shipment invoice line items for customs and shipping.",
    "Return only actual shipped items.",
    "Ignore invoice headers, subtotals, VAT, taxes, discounts, totals, shipping charges, payment lines, bank details, phone numbers, addresses, notes, and contact information.",
    "Each item must include unit price and quantity.",
    "If the invoice only shows a line total, derive the unit price from line total divided by quantity when possible.",
    `If country of origin is missing, use ${options.fallbackCountryOfOrigin}.`,
    `If currency is missing, use ${options.fallbackCurrency}.`,
    "Use exactly one of these categories only: electronics, clothing, food, cosmetics, pharmaceuticals, machinery, chemicals, textiles, metals, plastics, furniture, automotive, toys, sports, documents, samples, other.",
    "If HS code or material is not visible, return an empty string for that field.",
    "If currency is not visible, return an empty string and put the best detected value in detectedCurrency.",
    "If the document is ambiguous, still return the best actual line items you can and add a warning.",
    "Do not invent extra items.",
  ].join(" ");
}

function normalizeGeminiItems(
  extraction: GeminiInvoiceExtraction,
  options: { fallbackCountryOfOrigin: string; fallbackCurrency: string },
): ExtractedInvoiceItem[] {
  return extraction.items.map((item) => ({
    itemName: item.itemName.trim(),
    itemDescription: item.itemDescription.trim() || item.itemName.trim(),
    category: item.category || ItemCategory.OTHER,
    material: item.material.trim(),
    countryOfOrigin: (item.countryOfOrigin || options.fallbackCountryOfOrigin).toUpperCase(),
    hsCode: item.hsCode.trim(),
    hsCodeSource: "UNKNOWN",
    hsCodeConfidence: "MISSING",
    hsCodeCandidates: [],
    price: Number(item.price.toFixed(2)),
    currency: (item.currency || extraction.detectedCurrency || options.fallbackCurrency).toUpperCase(),
    quantity: item.quantity,
  }));
}

function extractGeminiResponseText(payload: any): string {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const textParts = candidates.flatMap((candidate: any) => {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    return parts
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean);
  });

  return textParts.join("").trim();
}

export function isGeminiInvoiceExtractionConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function extractInvoiceItemsWithGemini(options: {
  document: InvoiceDocumentInput;
  buffer: Buffer;
  extractedText?: string;
  fallbackCountryOfOrigin: string;
  fallbackCurrency: string;
}): Promise<{
  items: ExtractedInvoiceItem[];
  warnings: string[];
  detectedCurrency: string;
}> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini invoice extraction is not configured.");
  }

  const parts: Array<Record<string, unknown>> = [
    {
      text: buildInstructions({
        fallbackCountryOfOrigin: options.fallbackCountryOfOrigin,
        fallbackCurrency: options.fallbackCurrency,
      }),
    },
  ];

  if (isImageContentType(options.document.contentType) || isPdfContentType(options.document.contentType)) {
    parts.push({
      inline_data: {
        mime_type: options.document.contentType,
        data: options.buffer.toString("base64"),
      },
    });
  } else if (options.extractedText?.trim()) {
    parts.push({
      text: `Invoice text:\n${options.extractedText.slice(0, 180000)}`,
    });
  } else {
    throw new Error("No invoice content was available for Gemini extraction.");
  }

  const response = await fetch(getGeminiGenerateContentEndpoint(getGeminiModel()), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: geminiInvoiceExtractionJsonSchema,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error?.status ||
      "Gemini invoice extraction failed.";
    throw new Error(message);
  }

  const responseText = extractGeminiResponseText(payload);
  if (!responseText) {
    throw new Error("Gemini did not return any invoice extraction content.");
  }

  const parsed = geminiInvoiceExtractionSchema.parse(JSON.parse(responseText));
  const items = normalizeGeminiItems(parsed, {
    fallbackCountryOfOrigin: options.fallbackCountryOfOrigin,
    fallbackCurrency: options.fallbackCurrency,
  });

  if (items.length === 0) {
    throw new Error("We could not extract shipment items from this invoice.");
  }

  return {
    items,
    warnings: parsed.warnings,
    detectedCurrency: parsed.detectedCurrency,
  };
}
