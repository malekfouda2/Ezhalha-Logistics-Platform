import { normalizeCountryCode } from "@shared/countries";

export function countryCodeToFlag(countryCode?: string | null): string {
  const code = normalizeCountryCode(countryCode);

  if (!code) return "";

  return code
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}