/**
 * Turns raw backend / carrier error strings into clear, actionable messages for end users
 * (clients and admins). Carrier APIs return codes like "SERVICES.AVAILABLE.INVALID" or leak
 * credential details; those should never reach a user verbatim.
 *
 * Usage: humanizeError(error) in a toast/onError handler.
 */

interface Rule {
  // Any of these substrings (case-insensitive) in the raw message triggers the friendly text.
  match: string[];
  message: string;
}

// Ordered — first match wins, so put specific rules before generic ones.
const RULES: Rule[] = [
  {
    match: ["services.available.invalid", "services are not available", "no service", "rate.location.noservice", "location.noservice"],
    message:
      "We couldn't find a shipping rate for this route. Please double-check the sender and recipient postal codes and cities — a wrong or unsupported postal code is the usual cause.",
  },
  {
    match: ["postal", "zip"],
    message:
      "The postal / ZIP code looks invalid for the selected country. Please review the sender and recipient postal codes and try again.",
  },
  {
    // Must stay specific. A bare "state" also matches "Shipment is not in a payable state",
    // which is how a Pay Later rejection got reported to clients as an address problem and sent
    // them hunting through a form that was fine.
    match: ["stateorprovince", "state/province", "state or province", "state / province", "province"],
    message: "The state / province is missing or invalid for the selected country. Please correct it and try again.",
  },
  {
    match: ["customsclearancedetail", "customs", "commercial invoice", "hs code", "hscode"],
    message: "Some customs details are missing or invalid. Please review the item information (HS codes, values, country of origin) and try again.",
  },
  {
    match: ["weight", "dimension", "packagecombination", "package"],
    message: "The package weight or dimensions aren't accepted for this service. Please review the package details and try again.",
  },
  {
    match: ["authorize your credentials", "forbidden", "not.authorized", "unauthorized", "oauth", "401", "403"],
    message: "We hit a temporary problem reaching the carrier. Please try again in a moment — if it keeps happening, contact support.",
  },
  {
    match: ["price mismatch", "price changed", "quote not found", "quote expired", "expired"],
    message: "The rate expired or the price changed. Please refresh the rates and try again.",
  },
  {
    match: ["insufficient", "credit limit", "not enabled"],
    message: "This action isn't available on your account yet. Please contact support or your account manager.",
  },
  {
    match: ["failed to fetch", "networkerror", "network request failed", "load failed", "err_network"],
    message: "Network problem — please check your connection and try again.",
  },
  {
    match: ["timeout", "timed out", "etimedout", "econnreset", "socket hang up"],
    message: "The request took too long. Please try again in a moment.",
  },
  {
    match: ["internal server error", "500", "unexpected", "econnrefused"],
    message: "Something went wrong on our end. Please try again — if it persists, contact support.",
  },
];

/** True when a string looks like a raw technical error (codes, dotted enums, stack-ish). */
function looksTechnical(text: string): boolean {
  if (!text) return true;
  if (/[A-Z]{2,}\.[A-Z]{2,}/.test(text)) return true; // FEDEX.STYLE.CODES
  if (/\b(error|exception|null|undefined|econn|http\s?\d{3}|status\s?\d{3})\b/i.test(text)) return true;
  if (text.length > 180) return true;
  return false;
}

export function humanizeError(input: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : (input as any)?.message || (input as any)?.error || "";

  const text = String(raw || "").trim();
  if (!text) return fallback;

  const lower = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.match.some((m) => lower.includes(m))) {
      return rule.message;
    }
  }

  // Unknown message: show it only if it already reads like a plain sentence, else the fallback.
  return looksTechnical(text) ? fallback : text;
}
