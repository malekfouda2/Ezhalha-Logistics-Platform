import { z } from "zod";
import { getIntegrationEnv } from "./integration-runtime";

/**
 * Reads the transport classification off a Safety Data Sheet.
 *
 * An SDS carries the classification (Section 14 — Transport information) but never the
 * shipment: how much is being sent, in what receptacles, on which package. So this returns
 * what the document actually states and nothing else, and the client fills the quantities in
 * on the review step. Inventing a quantity would put a number the shipper never supplied onto
 * a declaration Ezhalha signs.
 */

const geminiDangerousGoodsEntrySchema = z.object({
  unNumber: z.string().default(""),
  properShippingName: z.string().default(""),
  technicalName: z.string().default(""),
  hazardClass: z.string().default(""),
  subsidiaryRisks: z.array(z.string()).default([]),
  packingGroup: z.enum(["I", "II", "III", "NONE"]).default("NONE"),
  packingInstruction: z.string().default(""),
  cargoAircraftOnly: z.boolean().default(false),
});

const geminiDangerousGoodsExtractionSchema = z.object({
  entries: z.array(geminiDangerousGoodsEntrySchema),
  productName: z.string().default(""),
  notDangerousGoods: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
});

export type GeminiDangerousGoodsEntry = z.infer<typeof geminiDangerousGoodsEntrySchema>;

const geminiDangerousGoodsJsonSchema = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          unNumber: {
            type: "string",
            description:
              "The UN or ID number exactly as printed, including the prefix, e.g. UN1263 or ID8000. Empty string if the document does not state one.",
          },
          properShippingName: {
            type: "string",
            description:
              "The UN proper shipping name from the transport section, e.g. 'Paint' or 'Lithium ion batteries contained in equipment'. Not the trade or product name.",
          },
          technicalName: {
            type: "string",
            description:
              "For a generic 'n.o.s.' proper shipping name, the actual substance in brackets, e.g. 'Acetone'. Empty string otherwise.",
          },
          hazardClass: {
            type: "string",
            description:
              "The primary transport hazard class or division, e.g. '3', '4.1', '8', '9'. Digits only, no words.",
          },
          subsidiaryRisks: {
            type: "array",
            items: { type: "string" },
            description: "Subsidiary hazard classes or divisions, if any. Digits only.",
          },
          packingGroup: {
            type: "string",
            enum: ["I", "II", "III", "NONE"],
            description:
              "The packing group as roman numerals. Use NONE for entries that genuinely have no packing group, such as gases, radioactive material and lithium batteries.",
          },
          packingInstruction: {
            type: "string",
            description:
              "The IATA packing instruction if the document states one, e.g. '965' or 'Y341'. Empty string otherwise.",
          },
          cargoAircraftOnly: {
            type: "boolean",
            description:
              "True only if the document explicitly says the substance is forbidden on passenger aircraft or is cargo aircraft only.",
          },
        },
        required: [
          "unNumber",
          "properShippingName",
          "technicalName",
          "hazardClass",
          "subsidiaryRisks",
          "packingGroup",
          "packingInstruction",
          "cargoAircraftOnly",
        ],
      },
    },
    productName: {
      type: "string",
      description: "The product or trade name from Section 1 of the safety data sheet.",
    },
    notDangerousGoods: {
      type: "boolean",
      description:
        "True if the transport section states the product is not regulated or not classified as dangerous goods for transport.",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Anything ambiguous, missing, or that the shipper should double-check.",
    },
  },
  required: ["entries", "productName", "notDangerousGoods", "warnings"],
} as const;

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

function buildInstructions(): string {
  return [
    "You are reading a Safety Data Sheet (SDS/MSDS) to prepare an IATA dangerous goods declaration for air transport.",
    "Use SECTION 14 (Transport information) as the source of truth. Prefer the IATA or ICAO sub-section when the document lists several transport regulations; fall back to ADR/IMDG only if IATA is absent.",
    "Return one entry per distinct UN number in the transport section. Most safety data sheets describe a single substance and yield exactly one entry.",
    "Copy values as printed. Do not translate, expand, abbreviate, or tidy the proper shipping name.",
    "Never guess a UN number, hazard class or packing group that the document does not state — leave the field empty and add a warning instead.",
    "Do NOT return quantities, weights, volumes, package counts or receptacle details. A safety data sheet describes a substance, not a shipment, and those values come from the shipper.",
    "If the transport section says the product is not regulated or not classified as dangerous goods, set notDangerousGoods to true and return no entries.",
  ].join(" ");
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

export function isGeminiDangerousGoodsExtractionConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function extractDangerousGoodsWithGemini(options: {
  contentType: string;
  buffer: Buffer;
  extractedText?: string;
}): Promise<{
  entries: GeminiDangerousGoodsEntry[];
  productName: string;
  notDangerousGoods: boolean;
  warnings: string[];
}> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("AI extraction is not configured.");
  }

  const parts: Array<Record<string, unknown>> = [{ text: buildInstructions() }];

  if (options.contentType.startsWith("image/") || options.contentType === "application/pdf") {
    parts.push({
      inline_data: {
        mime_type: options.contentType,
        data: options.buffer.toString("base64"),
      },
    });
  } else if (options.extractedText?.trim()) {
    parts.push({ text: `Safety data sheet text:\n${options.extractedText.slice(0, 180000)}` });
  } else {
    throw new Error("No readable content was found in this safety data sheet.");
  }

  const response = await fetch(getGeminiGenerateContentEndpoint(getGeminiModel()), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: geminiDangerousGoodsJsonSchema,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || payload?.error?.status || "AI extraction failed.",
    );
  }

  const responseText = extractGeminiResponseText(payload);
  if (!responseText) {
    throw new Error("AI extraction returned no content.");
  }

  const parsed = geminiDangerousGoodsExtractionSchema.parse(JSON.parse(responseText));

  return {
    entries: parsed.entries,
    productName: parsed.productName.trim(),
    notDangerousGoods: parsed.notDangerousGoods,
    warnings: parsed.warnings,
  };
}
