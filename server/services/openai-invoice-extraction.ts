import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { toFile } from "openai/uploads";
import { z } from "zod";
import { ItemCategory } from "@shared/schema";
import type {
  ExtractedInvoiceItem,
  InvoiceDocumentInput,
} from "./invoice-extraction";

const aiInvoiceItemSchema = z.object({
  itemName: z.string().min(1),
  itemDescription: z.string().default(""),
  category: z.enum(Object.values(ItemCategory) as [string, ...string[]]).default(ItemCategory.OTHER),
  material: z.string().default(""),
  countryOfOrigin: z.string().length(2).optional(),
  hsCode: z.string().default(""),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  quantity: z.number().int().positive(),
});

const aiInvoiceExtractionSchema = z.object({
  items: z.array(aiInvoiceItemSchema),
  warnings: z.array(z.string()).default([]),
  detectedCurrency: z.string().length(3).default("SAR"),
});

type AIInvoiceExtraction = z.infer<typeof aiInvoiceExtractionSchema>;

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return client;
}

function getModel(): string {
  return process.env.OPENAI_INVOICE_EXTRACTION_MODEL || "gpt-4.1-mini";
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function buildInstructions(options: {
  fallbackCountryOfOrigin: string;
  fallbackCurrency: string;
}): string {
  return [
    "Extract shipment invoice line items for customs and shipping.",
    "Return only actual shipped items. Ignore invoice headers, subtotals, VAT, discounts, totals, bank details, shipping charges, and notes.",
    "Each item must include unit price and quantity. If the invoice only shows a line total, derive the unit price from line total / quantity when possible.",
    `If country of origin is missing, use ${options.fallbackCountryOfOrigin}.`,
    `If currency is missing, use ${options.fallbackCurrency}.`,
    "Use one of these categories only: electronics, clothing, food, cosmetics, pharmaceuticals, machinery, chemicals, textiles, metals, plastics, furniture, automotive, toys, sports, documents, samples, other.",
    "If HS code or material is not visible, leave it empty.",
    "If the document is ambiguous, still return the best line items you can and add a warning.",
    "Do not invent extra items.",
  ].join(" ");
}

function toDataUrl(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function normalizeAIItems(
  extraction: AIInvoiceExtraction,
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

export function isOpenAIInvoiceExtractionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function extractInvoiceItemsWithOpenAI(options: {
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
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI invoice extraction is not configured.");
  }

  const inputContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: buildInstructions({
        fallbackCountryOfOrigin: options.fallbackCountryOfOrigin,
        fallbackCurrency: options.fallbackCurrency,
      }),
    },
  ];

  let uploadedFileId: string | null = null;

  try {
    if (isImageContentType(options.document.contentType)) {
      inputContent.push({
        type: "input_image",
        detail: "high",
        image_url: toDataUrl(options.buffer, options.document.contentType),
      });
    } else if (options.document.contentType === "application/pdf") {
      const file = await openai.files.create({
        file: await toFile(options.buffer, options.document.fileName),
        purpose: "user_data",
      });
      uploadedFileId = file.id;
      inputContent.push({
        type: "input_file",
        file_id: file.id,
      });
    } else if (options.extractedText?.trim()) {
      inputContent.push({
        type: "input_text",
        text: `Invoice text:\n${options.extractedText.slice(0, 180000)}`,
      });
    } else {
      throw new Error("No invoice content was available for AI extraction.");
    }

    const response = await openai.responses.create({
      model: getModel(),
      input: [
        {
          role: "user",
          content: inputContent as any,
        },
      ],
      text: {
        format: zodTextFormat(aiInvoiceExtractionSchema, "shipment_invoice_extraction"),
      } as any,
    });

    const parsed = aiInvoiceExtractionSchema.parse(JSON.parse(response.output_text || "{}"));
    const items = normalizeAIItems(parsed, {
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
  } finally {
    if (uploadedFileId) {
      try {
        await openai.files.delete(uploadedFileId);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}
