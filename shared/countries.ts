export interface CountryOption {
  code: string;
  name: string;
}

const COUNTRY_OPTIONS_UNSORTED: CountryOption[] = [
  { code: "DZ", name: "Algeria" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KE", name: "Kenya" },
  { code: "KW", name: "Kuwait" },
  { code: "LB", name: "Lebanon" },
  { code: "MY", name: "Malaysia" },
  { code: "MA", name: "Morocco" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PS", name: "Palestine" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
];

export const COUNTRY_CODE_OPTIONS = [...COUNTRY_OPTIONS_UNSORTED].sort((a, b) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
);

export const COUNTRY_CODE_SELECT_OPTIONS = COUNTRY_CODE_OPTIONS.map(({ code, name }) => ({
  value: code,
  label: name,
}));

export const COUNTRY_NAME_SELECT_OPTIONS = COUNTRY_CODE_OPTIONS.map(({ name }) => ({
  value: name,
  label: name,
}));

const COUNTRY_CODES_BY_NAME = new Map(
  COUNTRY_CODE_OPTIONS.map(({ code, name }) => [name.toUpperCase(), code]),
);

export function normalizeCountryCode(value?: string | null): string | undefined {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return undefined;
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return COUNTRY_CODES_BY_NAME.get(normalized);
}

// International dialing codes (without the leading "+") keyed by ISO 3166-1 alpha-2 code.
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  DZ: "213", AR: "54", AU: "61", AT: "43", BH: "973", BD: "880", BE: "32", BR: "55",
  CA: "1", CL: "56", CN: "86", CO: "57", CZ: "420", DK: "45", EG: "20", FI: "358",
  FR: "33", DE: "49", GH: "233", GR: "30", HK: "852", HU: "36", IN: "91", ID: "62",
  IQ: "964", IE: "353", IT: "39", JP: "81", JO: "962", KE: "254", KW: "965", LB: "961",
  MY: "60", MA: "212", MX: "52", NL: "31", NZ: "64", NG: "234", NO: "47", OM: "968",
  PK: "92", PS: "970", PE: "51", PH: "63", PL: "48", PT: "351", QA: "974", RO: "40",
  RU: "7", SA: "966", SG: "65", ZA: "27", KR: "82", ES: "34", LK: "94", SE: "46",
  CH: "41", SY: "963", TW: "886", TH: "66", TN: "216", TR: "90", UA: "380", AE: "971",
  GB: "44", US: "1", VN: "84", YE: "967",
};

export const DEFAULT_PHONE_COUNTRY = "SA";

/** Country options that have a dialing code, each carrying its `+<code>` for phone selectors. */
export const COUNTRY_DIAL_OPTIONS = COUNTRY_CODE_OPTIONS
  .filter((option) => COUNTRY_DIAL_CODES[option.code])
  .map((option) => ({
    code: option.code,
    name: option.name,
    dialCode: COUNTRY_DIAL_CODES[option.code],
  }));

export function getDialCode(countryCode?: string | null): string | undefined {
  const normalized = normalizeCountryCode(countryCode);
  return normalized ? COUNTRY_DIAL_CODES[normalized] : undefined;
}

/**
 * Split a stored phone string into a country + national number. Best-effort: if the value starts
 * with "+", the longest matching dialing code wins; otherwise it falls back to `defaultCountry`.
 */
export function parsePhoneNumber(
  value?: string | null,
  defaultCountry: string = DEFAULT_PHONE_COUNTRY,
): { countryCode: string; nationalNumber: string } {
  const raw = (value || "").trim();
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    // Match the longest dialing code (codes range 1–4 digits).
    let best: { countryCode: string; dialCode: string } | null = null;
    for (const option of COUNTRY_DIAL_OPTIONS) {
      if (digits.startsWith(option.dialCode)) {
        if (!best || option.dialCode.length > best.dialCode.length) {
          best = { countryCode: option.code, dialCode: option.dialCode };
        }
      }
    }
    if (best) {
      return { countryCode: best.countryCode, nationalNumber: digits.slice(best.dialCode.length) };
    }
    return { countryCode: defaultCountry, nationalNumber: digits };
  }
  return { countryCode: defaultCountry, nationalNumber: raw.replace(/\D/g, "") };
}

/** Compose an E.164-style phone string from a country + national number. Empty national ⇒ "". */
export function composePhoneNumber(countryCode: string, nationalNumber: string): string {
  const national = (nationalNumber || "").replace(/\D/g, "");
  if (!national) return "";
  const dial = COUNTRY_DIAL_CODES[normalizeCountryCode(countryCode) || ""] || "";
  return dial ? `+${dial}${national}` : national;
}
