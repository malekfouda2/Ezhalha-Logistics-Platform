// Countries that do not use postal codes, and what to send a carrier when they don't.
//
// Dependency-free, same rule as `shared/domain.ts`, so the server validator and the React
// wizard can share one list instead of keeping two.
//
// They used to be two. The copies drifted — the server had 47 entries, the client 60, with 19
// countries in one but not the other — and neither had Lebanon. The consequence was concrete:
// the wizard demanded a postal code for a Lebanese shipper, the client typed "00000", and
// FedEx rejected it, because FedEx accepts no postal code at all for Lebanon. The shipment's
// collection failed for three days behind a misleading "service not available for this
// location" error.

export const POSTAL_CODE_EXEMPT_COUNTRIES = new Set([
  // Gulf and Middle East
  "AE", "QA", "BH", "OM", "SY", "YE",
  // Lebanon. Verified directly against FedEx: a pickup availability request for a Lebanese
  // address returns POSTALCODE.INFO.INVALID with ANY postal code — "00000", a real Beirut
  // code, or an 8-digit one — and succeeds only when the field is omitted.
  "LB",
  // Asia Pacific
  "HK", "TL", "FJ", "KI", "KP", "NR", "SB", "TO", "TV", "VU", "TK",
  // Europe
  "IE",
  // Americas
  "PA", "BO", "BS", "BZ", "AG", "AW", "DM", "GD", "GY", "KN", "LC", "SR",
  // Africa
  "BJ", "BF", "BI", "BW", "CM", "CF", "CD", "CG", "CI", "DJ", "ER", "GA",
  "GH", "GM", "GN", "GQ", "GW", "LY", "ML", "MR", "MW", "NA", "RW", "SC",
  "SL", "SO", "ST", "TD", "TG", "UG", "ZW",
  // French Southern Territories
  "TF",
]);

export function isPostalCodeRequired(countryCode?: string | null): boolean {
  const code = (countryCode || "").trim().toUpperCase();
  if (!code) return false;
  return !POSTAL_CODE_EXEMPT_COUNTRIES.has(code);
}

/**
 * A postal code that looks like a stand-in rather than a real one.
 *
 * When a form insists on a value the sender does not have, people type zeros. Carriers then
 * reject "00000" as an invalid postal code — which is true, but the error names the postal
 * code while the actual fault is that we asked for one at all.
 */
export function isPlaceholderPostalCode(postalCode?: string | null): boolean {
  const value = (postalCode || "").trim();
  if (!value) return false;
  return /^[0\s\-]+$/.test(value);
}

/**
 * The postal code to put in a carrier request.
 *
 * Returns an empty string when the country has no postal codes, or when the value is an
 * obvious placeholder. Sending nothing is accepted by the carriers; sending "00000" is not,
 * so an empty string is strictly safer than passing the stored value through.
 */
export function carrierPostalCode(
  countryCode?: string | null,
  postalCode?: string | null,
): string {
  const value = (postalCode || "").trim();
  if (!value) return "";
  if (!isPostalCodeRequired(countryCode)) return "";
  if (isPlaceholderPostalCode(value)) return "";
  return value;
}
