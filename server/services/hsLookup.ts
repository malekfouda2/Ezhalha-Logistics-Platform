import { storage } from "../storage";
import { logInfo, logError } from "./logger";

export interface HsLookupRequest {
  itemName: string;
  itemDescription?: string;
  category: string;
  material?: string;
  countryOfOrigin: string;
  destinationCountry: string;
}

export interface HsCandidate {
  code: string;
  description: string;
  confidence: number;
}

export interface HsLookupResponse {
  candidates: HsCandidate[];
  source: "HISTORY" | "FEDEX" | "UNKNOWN";
}

const GENERIC_NAMES = [
  "parts", "item", "items", "stuff", "accessories", "product", "products",
  "goods", "things", "misc", "miscellaneous", "other", "general", "sample",
  "gift", "package", "box", "shipment", "order",
];

export function isGenericItemName(name: string): boolean {
  if (!name || name.trim().length < 4) return true;
  const lower = name.trim().toLowerCase();
  return GENERIC_NAMES.some(g => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g));
}

export function normalizeKey(itemName: string, category: string, material?: string, countryOfOrigin?: string): string {
  const parts = [
    itemName.toLowerCase().trim(),
    category.toLowerCase().trim(),
    (material || "").toLowerCase().trim(),
    (countryOfOrigin || "").toLowerCase().trim(),
  ];
  return parts.filter(Boolean).join("|");
}

const CATEGORY_HS_PREFIXES: Record<string, { prefix: string; description: string }[]> = {
  electronics: [
    { prefix: "8471", description: "Automatic data processing machines (computers)" },
    { prefix: "8517", description: "Telephone sets, smartphones, communication apparatus" },
    { prefix: "8528", description: "Monitors and projectors" },
    { prefix: "8523", description: "Discs, tapes, storage devices" },
    { prefix: "8504", description: "Electrical transformers, converters, chargers" },
  ],
  clothing: [
    { prefix: "6109", description: "T-shirts, singlets and other vests, knitted" },
    { prefix: "6110", description: "Jerseys, pullovers, cardigans, knitted" },
    { prefix: "6203", description: "Men's suits, jackets, trousers, woven" },
    { prefix: "6204", description: "Women's suits, dresses, skirts, woven" },
    { prefix: "6402", description: "Footwear with rubber/plastic outer soles" },
  ],
  food: [
    { prefix: "2106", description: "Food preparations not elsewhere specified" },
    { prefix: "1905", description: "Bread, pastry, cakes, biscuits" },
    { prefix: "2009", description: "Fruit juices" },
    { prefix: "1806", description: "Chocolate and food preparations with cocoa" },
    { prefix: "0901", description: "Coffee" },
  ],
  cosmetics: [
    { prefix: "3304", description: "Beauty, make-up, skincare preparations" },
    { prefix: "3305", description: "Hair preparations" },
    { prefix: "3307", description: "Perfumes, deodorants, bath preparations" },
    { prefix: "3401", description: "Soap, washing preparations" },
  ],
  pharmaceuticals: [
    { prefix: "3004", description: "Medicaments in measured doses" },
    { prefix: "3003", description: "Medicaments consisting of mixed products" },
    { prefix: "3005", description: "Wadding, gauze, bandages with pharmaceutical substances" },
  ],
  machinery: [
    { prefix: "8479", description: "Machines and mechanical appliances" },
    { prefix: "8481", description: "Taps, cocks, valves" },
    { prefix: "8413", description: "Pumps for liquids" },
    { prefix: "8414", description: "Air/vacuum pumps, compressors, fans" },
  ],
  chemicals: [
    { prefix: "3824", description: "Chemical preparations" },
    { prefix: "2827", description: "Chlorides, bromides, iodides" },
    { prefix: "3402", description: "Surface-active agents, detergents" },
  ],
  textiles: [
    { prefix: "5208", description: "Woven cotton fabrics" },
    { prefix: "5407", description: "Woven synthetic filament fabrics" },
    { prefix: "6302", description: "Bed linen, table linen, toilet linen" },
  ],
  metals: [
    { prefix: "7326", description: "Articles of iron or steel" },
    { prefix: "7616", description: "Articles of aluminium" },
    { prefix: "7318", description: "Screws, bolts, nuts, washers of iron or steel" },
  ],
  plastics: [
    { prefix: "3926", description: "Articles of plastics" },
    { prefix: "3923", description: "Plastic containers, boxes, bottles" },
    { prefix: "3917", description: "Tubes, pipes, hoses of plastics" },
  ],
  furniture: [
    { prefix: "9401", description: "Seats and parts thereof" },
    { prefix: "9403", description: "Other furniture and parts" },
    { prefix: "9405", description: "Lamps and lighting fittings" },
  ],
  automotive: [
    { prefix: "8708", description: "Parts and accessories of motor vehicles" },
    { prefix: "4011", description: "New pneumatic rubber tyres" },
    { prefix: "8507", description: "Electric accumulators (batteries)" },
  ],
  toys: [
    { prefix: "9503", description: "Toys, puzzles, scale models" },
    { prefix: "9504", description: "Video game consoles, table/parlour games" },
    { prefix: "9506", description: "Sports equipment" },
  ],
  sports: [
    { prefix: "9506", description: "Sports equipment" },
    { prefix: "6211", description: "Track suits, ski suits, swimwear" },
    { prefix: "9507", description: "Fishing rods, fish-hooks" },
  ],
  documents: [
    { prefix: "4901", description: "Printed books, brochures, leaflets" },
    { prefix: "4907", description: "Unused postage, cheque forms, documents" },
  ],
  samples: [
    { prefix: "9811", description: "Commercial samples (special classification)" },
  ],
  other: [
    { prefix: "9999", description: "Goods not classified elsewhere" },
  ],
};

function buildFallbackCandidates(category: string, itemName: string): HsCandidate[] {
  const prefixes = CATEGORY_HS_PREFIXES[category] || CATEGORY_HS_PREFIXES["other"];
  if (!prefixes) return [];

  return prefixes.map((p, index) => ({
    code: p.prefix + "00",
    description: p.description,
    confidence: Math.max(0.3, 0.7 - index * 0.1),
  }));
}

async function lookupViaFedEx(request: HsLookupRequest): Promise<HsCandidate[]> {
  const clientId = process.env.FEDEX_CLIENT_ID || process.env.FEDEX_API_KEY;
  const clientSecret = process.env.FEDEX_CLIENT_SECRET || process.env.FEDEX_SECRET_KEY;
  const baseUrl = process.env.FEDEX_BASE_URL || "https://apis-sandbox.fedex.com";

  if (!clientId || !clientSecret) {
    logInfo("FedEx HS lookup: credentials not configured, using fallback");
    return [];
  }

  try {
    const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    });

    if (!tokenRes.ok) {
      logError("FedEx HS lookup: token request failed", { status: tokenRes.status });
      return [];
    }

    const tokenData = await tokenRes.json() as any;
    const accessToken = tokenData.access_token;

    const descriptionParts = [request.itemName];
    if (request.itemDescription) descriptionParts.push(request.itemDescription);
    if (request.material) descriptionParts.push(`Material: ${request.material}`);
    if (request.category) descriptionParts.push(`Category: ${request.category}`);
    const combinedDescription = descriptionParts.join(". ");

    const lookupBody = {
      accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER || "" },
      commodityDescription: combinedDescription,
      countryCode: request.countryOfOrigin,
      destinationCountryCode: request.destinationCountry,
    };

    const hsRes = await fetch(`${baseUrl}/globaltrade/v1/commodities/harmonized-codes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(lookupBody),
    });

    if (!hsRes.ok) {
      const errText = await hsRes.text();
      logInfo("FedEx HS lookup: API returned non-200, using fallback", {
        status: hsRes.status,
        body: errText.substring(0, 200),
      });
      return [];
    }

    const hsData = await hsRes.json() as any;

    const candidates: HsCandidate[] = [];
    const results = hsData?.output?.harmonizedCodes || hsData?.output?.commodityHarmonizedCodes || [];

    for (const result of results) {
      const code = result.harmonizedCode || result.code || result.tariffCode;
      const description = result.description || result.commodityDescription || "";
      if (code) {
        candidates.push({
          code: code.replace(/\./g, ""),
          description,
          confidence: result.confidence || 0.7,
        });
      }
    }

    if (candidates.length > 0) {
      logInfo("FedEx HS lookup: found candidates", { count: candidates.length });
    }

    return candidates;
  } catch (error) {
    logError("FedEx HS lookup error", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export async function lookupHsCode(request: HsLookupRequest, clientAccountId?: string): Promise<HsLookupResponse> {
  const key = normalizeKey(request.itemName, request.category, request.material, request.countryOfOrigin);

  const historyMatch = await storage.findHsCodeMapping(key, clientAccountId);
  if (historyMatch) {
    logInfo("HS code found in history", { key, hsCode: historyMatch.hsCode, usedCount: historyMatch.usedCount });
    return {
      candidates: [{
        code: historyMatch.hsCode,
        description: historyMatch.description || "",
        confidence: Math.min(1.0, 0.85 + (historyMatch.usedCount || 0) * 0.01),
      }],
      source: "HISTORY",
    };
  }

  const fedexCandidates = await lookupViaFedEx(request);
  if (fedexCandidates.length > 0) {
    return {
      candidates: fedexCandidates.slice(0, 5),
      source: "FEDEX",
    };
  }

  const fallbackCandidates = buildFallbackCandidates(request.category, request.itemName);
  return {
    candidates: fallbackCandidates,
    source: "UNKNOWN",
  };
}

export async function confirmHsCode(
  clientAccountId: string,
  itemName: string,
  category: string,
  material: string | undefined,
  countryOfOrigin: string,
  hsCode: string,
  description?: string,
): Promise<void> {
  const key = normalizeKey(itemName, category, material, countryOfOrigin);
  await storage.upsertHsCodeMapping({
    clientAccountId,
    normalizedKey: key,
    hsCode,
    description,
  });
  logInfo("HS code confirmed and saved to history", { key, hsCode, clientAccountId });
}
