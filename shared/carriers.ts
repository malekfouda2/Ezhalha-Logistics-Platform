/**
 * Carrier brand names, keyed by carrier code.
 *
 * `shipments.carrier_name` is not a reliable brand: carriers write their own service level into
 * it at booking time, so production holds "EXPRESS WORLDWIDE", "FedEx International Priority®"
 * and "FedEx International Economy®" alongside plain "FedEx" and "DHL". A list column showing
 * that reads as if the business used eight carriers when it uses five.
 *
 * `carrier_code` stays clean because it is ours, so it is the key here. Mirrors the `name` /
 * `carrierCode` pairs declared on the adapters in server/integrations, plus the DDP pseudo-carrier
 * used for manually fulfilled door-to-door freight.
 */
export const CARRIER_BRAND_NAMES: Record<string, string> = {
  FEDEX: "FedEx",
  DHL: "DHL",
  ARAMEX: "Aramex",
  SMSA: "SMSA Express",
  NAQEL: "Naqel Express",
  JT: "J&T Express",
  REDBOX: "RedBox",
  ZAJIL: "Zajil Express",
  IMILE: "iMile",
  FIZZPA: "Fizzpa",
  SHIPOX: "Shipox",
  WEPIK: "Wepik",
  DDP: "Door to Door",
};

/**
 * Strip a trailing service level from a carrier-supplied name, for the rows whose code we do not
 * recognise. "FedEx International Priority®" is the carrier's own wording, not ours, so this only
 * runs as a fallback — the brand map above is the primary source.
 */
function stripServiceLevel(name: string): string {
  const cleaned = name.replace(/[®™]/g, "").trim();
  for (const brand of Object.values(CARRIER_BRAND_NAMES)) {
    // "FedEx International Priority" starts with a known brand — keep just the brand.
    if (cleaned.toLowerCase().startsWith(brand.toLowerCase())) return brand;
  }
  return cleaned;
}

/**
 * The carrier to show in a list: the brand, never the service level.
 *
 * Prefers the code because it is ours and stable. Falls back to a cleaned-up carrier name, then
 * to the raw code, so a carrier added to the database before it is added here still shows
 * something meaningful rather than a blank.
 */
export function carrierBrandName(
  carrierCode?: string | null,
  carrierName?: string | null,
): string {
  const code = (carrierCode || "").trim().toUpperCase();
  if (code && CARRIER_BRAND_NAMES[code]) return CARRIER_BRAND_NAMES[code];

  const name = (carrierName || "").trim();
  if (name) return stripServiceLevel(name);

  return (carrierCode || "").trim() || "";
}
