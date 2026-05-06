import { z } from "zod";
import type {
  PackageDocumentInput,
  ExtractedPackage,
} from "./package-extraction";

const geminiPackageSchema = z.object({
  packageNumber: z.string().default(""),
  weight: z.number().positive(),
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const geminiPackageExtractionSchema = z.object({
  packages: z.array(geminiPackageSchema),
  warnings: z.array(z.string()).default([]),
  detectedWeightUnit: z.enum(["KG", "LB"]).default("KG"),
  detectedDimensionUnit: z.enum(["CM", "IN"]).default("CM"),
});

type GeminiPackageExtraction = z.infer<typeof geminiPackageExtractionSchema>;

const geminiPackageExtractionJsonSchema = {
  type: "object",
  properties: {
    packages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          packageNumber: {
            type: "string",
            description: "The carton, box, or package number if visible. Empty string if unavailable.",
          },
          weight: {
            type: "number",
            description: "The gross weight for this carton or package.",
          },
          length: {
            type: "number",
            description: "The package length using the detected dimension unit.",
          },
          width: {
            type: "number",
            description: "The package width using the detected dimension unit.",
          },
          height: {
            type: "number",
            description: "The package height using the detected dimension unit.",
          },
        },
        required: ["packageNumber", "weight", "length", "width", "height"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    detectedWeightUnit: {
      type: "string",
      enum: ["KG", "LB"],
    },
    detectedDimensionUnit: {
      type: "string",
      enum: ["CM", "IN"],
    },
  },
  required: ["packages", "warnings", "detectedWeightUnit", "detectedDimensionUnit"],
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

function buildInstructions(): string {
  return [
    "Extract shipment package details from this packing list or package document.",
    "Return one package entry per physical carton, box, or package.",
    "Use gross weight for each package when available. If only one weight is visible, use that as the package weight.",
    "Use outer carton dimensions, not item dimensions.",
    "If a row represents a carton range such as 1-3, expand it into separate package entries with the same dimensions and weight.",
    "If dimensions are shown in meters, convert them to centimeters before returning them.",
    "Ignore invoice totals, consignee addresses, contact details, item descriptions, colors, and size breakdown columns unless they are needed to identify a package row.",
    "Return only packages that have enough information to be used for shipment rating.",
    "Do not invent extra packages.",
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

export function isGeminiPackageExtractionConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function extractPackagesWithGemini(options: {
  document: PackageDocumentInput;
  buffer: Buffer;
  extractedText?: string;
}): Promise<{
  packages: ExtractedPackage[];
  warnings: string[];
  detectedWeightUnit: "KG" | "LB";
  detectedDimensionUnit: "CM" | "IN";
}> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini package extraction is not configured.");
  }

  const parts: Array<Record<string, unknown>> = [
    {
      text: buildInstructions(),
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
      text: `Package document text:\n${options.extractedText.slice(0, 180000)}`,
    });
  } else {
    throw new Error("No package document content was available for Gemini extraction.");
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
        responseJsonSchema: geminiPackageExtractionJsonSchema,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error?.status ||
      "Gemini package extraction failed.";
    throw new Error(message);
  }

  const responseText = extractGeminiResponseText(payload);
  if (!responseText) {
    throw new Error("Gemini did not return any package extraction content.");
  }

  const parsed = geminiPackageExtractionSchema.parse(JSON.parse(responseText));
  if (parsed.packages.length === 0) {
    throw new Error("We could not extract package details from this document.");
  }

  return {
    packages: parsed.packages.map((pkg) => ({
      packageNumber: pkg.packageNumber.trim(),
      weight: Number(pkg.weight.toFixed(3)),
      length: Number(pkg.length.toFixed(2)),
      width: Number(pkg.width.toFixed(2)),
      height: Number(pkg.height.toFixed(2)),
    })),
    warnings: parsed.warnings,
    detectedWeightUnit: parsed.detectedWeightUnit,
    detectedDimensionUnit: parsed.detectedDimensionUnit,
  };
}
