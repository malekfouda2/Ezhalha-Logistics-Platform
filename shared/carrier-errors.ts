// Turning carrier error strings into something a human can act on.
//
// Dependency-free, same rule as `shared/domain.ts`, so the mobile bundle and the React client
// can both read it.
//
// Why this exists: a shipment sat for three days while an operator retried a DHL pickup
// fourteen times. DHL had answered the first attempt with "5006: Pickup is not allowed for
// this shipment date" — the collection date was a Sunday, then a UK bank holiday — but the
// message reached nobody in a form that said what to change, and it ended with "please
// update and re-try", so they re-tried. The carrier almost always tells us what is wrong.
// The gap is that nothing translates it.

export const CarrierErrorCategory = {
  /** The date asked for is not one the carrier will work on. */
  DATE: "date",
  /** The address, postal code or city was rejected or is incomplete. */
  ADDRESS: "address",
  /** Our API credentials were refused. Nothing about the shipment will fix this. */
  CREDENTIALS: "credentials",
  /** The carrier account is not enabled for what we asked of it. */
  ACCOUNT: "account",
  /** Something about the goods themselves — customs data, commodity, weight. */
  COMMODITY: "commodity",
  /** The service or route asked for is not available on this lane. */
  SERVICE: "service",
  /** The carrier broke, not us. Usually worth retrying unchanged. */
  CARRIER_FAULT: "carrier_fault",
  /** Our own bug surfaced as a carrier failure. */
  PLATFORM_BUG: "platform_bug",
  UNKNOWN: "unknown",
} as const;

export type CarrierErrorCategoryValue =
  (typeof CarrierErrorCategory)[keyof typeof CarrierErrorCategory];

/**
 * Whether trying the same thing again could possibly work.
 *
 * This is the single most valuable field here. "no" and "after_fix" both mean *stop pressing
 * the button* — the difference is whether a human can fix it at all.
 */
export const CarrierRetryAdvice = {
  /** Retrying unchanged may well work — a timeout, a 5xx, a transient carrier fault. */
  RETRY: "retry",
  /** Retrying unchanged will fail again. Change something first. */
  AFTER_FIX: "after_fix",
  /** No amount of retrying or editing helps; someone has to fix an account or credential. */
  NOT_RETRYABLE: "not_retryable",
} as const;

export type CarrierRetryAdviceValue =
  (typeof CarrierRetryAdvice)[keyof typeof CarrierRetryAdvice];

export interface CarrierErrorExplanation {
  /** Normalised identifier, e.g. "DHL_5006" or "FEDEX_PICKUP.STREETLINE.MISSING". */
  code: string | null;
  category: CarrierErrorCategoryValue;
  /** One line an operator can read at a glance. */
  title: string;
  /** What the carrier actually objected to, in plain words. */
  cause: string;
  /** The next action. Never "try again" unless retrying is genuinely the answer. */
  action: string;
  retry: CarrierRetryAdviceValue;
  /** True when this was matched to a known error rather than falling through. */
  recognised: boolean;
  /** The original string, always preserved — the catalogue is a lens, never a replacement. */
  raw: string;
}

interface CatalogueEntry {
  /** Restrict to one carrier when the same code means different things elsewhere. */
  carrier?: string;
  match: RegExp;
  code?: string;
  category: CarrierErrorCategoryValue;
  title: string;
  cause: string;
  action: string;
  retry: CarrierRetryAdviceValue;
}

/**
 * Every entry here was seen in production. Adding speculative codes would make the catalogue
 * look thorough while quietly widening the chance of explaining an error wrongly, which is
 * worse than not explaining it — a confident wrong answer sends someone down the wrong path.
 */
const CATALOGUE: CatalogueEntry[] = [
  {
    carrier: "DHL",
    match: /\b5006\b|pickup is not allowed for this shipment date/i,
    code: "DHL_5006",
    category: CarrierErrorCategory.DATE,
    title: "DHL will not collect on the requested date",
    cause:
      "The collection date falls on a day DHL does not work at the origin — a weekend, or a public holiday in the sender's country. It can also mean the date no longer matches the waybill's planned shipping date.",
    action:
      "Set the pickup date to the next working day at the ORIGIN, not at your own location. Check the sender country's public holidays too: a weekday can still be a national holiday. If the waybill's own ship date has already passed, the waybill has to be reissued rather than the pickup rescheduled.",
    retry: CarrierRetryAdvice.AFTER_FIX,
  },
  {
    carrier: "DHL",
    match: /\b420504\b|pickup location.*not.*(found|valid)/i,
    code: "DHL_420504",
    category: CarrierErrorCategory.ADDRESS,
    title: "DHL does not recognise the collection address",
    cause:
      "The city or postal code is not in DHL's gazetteer for that country, so it cannot route a courier to it.",
    action:
      "Check the sender's city and postal code against DHL's own spelling. We normally substitute DHL's canonical location automatically, so this usually means the address validation call also failed.",
    retry: CarrierRetryAdvice.AFTER_FIX,
  },
  {
    carrier: "DHL",
    match: /\b7008\b|requested special service code.*not available/i,
    code: "DHL_7008",
    category: CarrierErrorCategory.ACCOUNT,
    title: "DHL account is not approved for that service",
    cause:
      "A value added service was requested that this DHL account is not contracted for — dangerous goods and some delivery options each need explicit approval.",
    action:
      "Ask DHL to add the service to the account, then enable it on the DHL integration account in Apps. Nothing about the shipment itself will change this.",
    retry: CarrierRetryAdvice.NOT_RETRYABLE,
  },
  {
    match: /forbidden\.error|could not authorize your credentials|\b401\b.*unauthor/i,
    code: "CREDENTIALS_REJECTED",
    category: CarrierErrorCategory.CREDENTIALS,
    title: "The carrier refused our credentials",
    cause:
      "The API key for this call was rejected. Nothing about the shipment is wrong — the credential is expired, revoked, or lacks permission for this specific API.",
    action:
      "Check the carrier's credentials in Apps. FedEx tracking is a separate project and key from Ship and Rate, so tracking can fail this way while booking keeps working.",
    retry: CarrierRetryAdvice.NOT_RETRYABLE,
  },
  {
    carrier: "FEDEX",
    match: /pickup\.streetline\.missing|streetline is missing/i,
    code: "FEDEX_PICKUP.STREETLINE.MISSING",
    category: CarrierErrorCategory.ADDRESS,
    title: "FedEx rejected the collection street address",
    // The error says "missing", but in practice it is far more often "too long". FedEx caps
    // a street line at 35 characters; /ship tolerates an over-length line while /pickup
    // rejects it with this code. Reading it literally sends people hunting an empty field
    // that is actually full — which is exactly what happened on EZH503313541.
    cause:
      "FedEx caps each street line at 35 characters, and reports an over-length line with the same code it uses for a missing one. The sender's address is usually present but too long — often a whole address block pasted into line 1, including the city, country or phone number.",
    action:
      "Check the sender's first address line. If it is longer than 35 characters, shorten it to just the street and building — the city, postal code, country and phone all have their own fields and do not belong there. Only if it is genuinely empty does it need adding.",
    retry: CarrierRetryAdvice.AFTER_FIX,
  },
  {
    match: /postalcode\.info\.invalid|postal code and country do not match|invalid postal code/i,
    code: "POSTALCODE_INVALID",
    category: CarrierErrorCategory.ADDRESS,
    title: "The carrier rejected the postal code",
    // Counter-intuitive but common: the usual cause is sending a postal code for a country
    // that has none. FedEx refuses ANY value for Lebanon, including a real Beirut code, and
    // succeeds only when the field is omitted. A placeholder like "00000" fails the same way.
    cause:
      "Either the postal code does not match the country, or the country does not use postal codes at all. Sending a placeholder such as \"00000\" for a country with no postal system is rejected the same way a wrong code would be.",
    action:
      "Check whether the country uses postal codes. If it does not — Lebanon, the UAE, Hong Kong, Ireland and many others — clear the field entirely rather than filling it with zeros. If it does, correct the code to match the city.",
    retry: CarrierRetryAdvice.AFTER_FIX,
  },
  {
    match: /system\.unexpected\.error|general failure/i,
    code: "CARRIER_UNEXPECTED",
    category: CarrierErrorCategory.CARRIER_FAULT,
    title: "The carrier hit an internal error",
    cause:
      "The carrier returned a generic failure with no detail. This is usually theirs, not ours, and is often transient.",
    action:
      "Retry once. If it keeps failing on the same shipment, something in the payload is upsetting them silently — check the address and package details, then raise it with the carrier quoting the time of the attempt.",
    retry: CarrierRetryAdvice.RETRY,
  },
  {
    match: /\b(50[0234])\b(?!\d)|gateway timeout|service unavailable|econnreset|etimedout|network|fetch failed/i,
    code: "CARRIER_UNAVAILABLE",
    category: CarrierErrorCategory.CARRIER_FAULT,
    title: "Could not reach the carrier",
    cause: "The carrier's API was unreachable, timed out, or returned a server error.",
    action: "Retry in a few minutes. If it persists across several shipments, the carrier is having an outage.",
    retry: CarrierRetryAdvice.RETRY,
  },
  {
    match: /hs_code_required|harmonized.*required|commodity.*(required|invalid)/i,
    code: "COMMODITY_INCOMPLETE",
    category: CarrierErrorCategory.COMMODITY,
    title: "Customs details are incomplete",
    cause: "The carrier rejected the commodity data — usually a missing HS code or an item without a value.",
    action: "Open the shipment's customs details and complete the missing item fields, then rebook.",
    retry: CarrierRetryAdvice.AFTER_FIX,
  },
  {
    match: /no rates|did not return any rates|not serviceable|no service.*available/i,
    code: "LANE_UNSERVICEABLE",
    category: CarrierErrorCategory.SERVICE,
    title: "The carrier does not serve this route",
    cause: "The carrier returned no service for this origin and destination, or for the postal code given.",
    action:
      "Check the destination postal code is one the carrier serves, and try another carrier for the lane.",
    retry: CarrierRetryAdvice.AFTER_FIX,
  },
  {
    match: /cannot read propert|undefined is not|is not a function|typeerror/i,
    code: "PLATFORM_BUG",
    category: CarrierErrorCategory.PLATFORM_BUG,
    title: "This one is ours, not the carrier's",
    cause:
      "The call failed inside our own code while handling the carrier's response, so the carrier may well have answered fine.",
    action: "Retrying will not help. Send this to engineering with the tracking number.",
    retry: CarrierRetryAdvice.NOT_RETRYABLE,
  },
  {
    match: /<\?xml|env:envelope|soap/i,
    code: "CARRIER_WRONG_ENDPOINT",
    category: CarrierErrorCategory.CARRIER_FAULT,
    title: "The carrier answered with an unexpected format",
    cause:
      "We received a SOAP or XML fault where JSON was expected, which usually means the operation is not supported on this endpoint or account.",
    action:
      "Check whether the carrier actually offers this operation on our account — DHL, for example, has no cancellation API. Send to engineering if it should be supported.",
    retry: CarrierRetryAdvice.NOT_RETRYABLE,
  },
];

/**
 * Pull the carrier's own error code out of a message.
 *
 * Handles the shapes we actually store: FedEx `400 - PICKUP.STREETLINE.MISSING: ...`,
 * DHL `400 - 5006: ...`, and our own `CarrierError [DHL_API_ERROR]: ...` wrapper.
 */
export function parseCarrierErrorCode(message: string): string | null {
  const afterStatus = /\b\d{3}\s*-\s*([A-Z0-9_.]{3,60})\s*:/.exec(message);
  if (afterStatus) return afterStatus[1];

  const numeric = /\b\d{3}\s*-\s*(\d{3,6})\s*:/.exec(message);
  if (numeric) return numeric[1];

  const wrapped = /CarrierError\s*\[([A-Z0-9_]+)\]/i.exec(message);
  if (wrapped) return wrapped[1];

  return null;
}

/** The HTTP status the carrier returned, when the message carries one. */
export function parseCarrierStatusCode(message: string): number | null {
  const match = /\b(?:error|status)?\s*:?\s*(\d{3})\s*-\s/.exec(message);
  if (!match) return null;
  const status = Number(match[1]);
  return status >= 100 && status <= 599 ? status : null;
}

/**
 * Explain a carrier failure.
 *
 * Always returns something. An unrecognised error still gets a category and an honest action
 * rather than being dressed up — pretending to understand an error is worse than admitting we
 * do not, because it sends the operator somewhere confidently wrong.
 */
export function explainCarrierError(input: {
  message?: string | null;
  carrierCode?: string | null;
  statusCode?: number | null;
}): CarrierErrorExplanation {
  const raw = (input.message || "").trim();
  const carrier = (input.carrierCode || "").trim().toUpperCase();
  const code = parseCarrierErrorCode(raw);
  const status = input.statusCode ?? parseCarrierStatusCode(raw);

  if (!raw) {
    return {
      code: null,
      category: CarrierErrorCategory.UNKNOWN,
      title: "The carrier call failed without a reason",
      cause:
        "No error detail was recorded for this failure, so we cannot say what the carrier objected to.",
      action:
        "Retry once and, if it fails again, check the integration health page — the detail is captured there now.",
      retry: CarrierRetryAdvice.RETRY,
      recognised: false,
      raw,
    };
  }

  const searchText = status ? `${raw} ${status}` : raw;
  const entry = CATALOGUE.find((candidate) => {
    if (candidate.carrier && candidate.carrier !== carrier) return false;
    return candidate.match.test(searchText);
  });

  if (entry) {
    return {
      code: entry.code || code,
      category: entry.category,
      title: entry.title,
      cause: entry.cause,
      action: entry.action,
      retry: entry.retry,
      recognised: true,
      raw,
    };
  }

  // Unrecognised. A 4xx means the carrier rejected what we sent, so retrying it unchanged is
  // pointless even when we cannot say precisely why — that distinction alone saves the
  // fourteen-retry loop this catalogue was built for.
  const clientError = typeof status === "number" && status >= 400 && status < 500;

  return {
    code,
    category: CarrierErrorCategory.UNKNOWN,
    title: clientError ? "The carrier rejected this shipment" : "The carrier call failed",
    cause: clientError
      ? "The carrier refused what we sent but returned a reason we do not have a translation for yet."
      : "The call failed for a reason we do not have a translation for yet.",
    action: clientError
      ? "Read the carrier's own message below — it usually names the field. Retrying without changing anything will fail the same way."
      : "Retry once. If it persists, send the carrier's message below to engineering.",
    retry: clientError ? CarrierRetryAdvice.AFTER_FIX : CarrierRetryAdvice.RETRY,
    recognised: false,
    raw,
  };
}

/** Short label for lists and badges. */
export function carrierRetryLabel(advice: CarrierRetryAdviceValue): string {
  if (advice === CarrierRetryAdvice.RETRY) return "Worth retrying";
  if (advice === CarrierRetryAdvice.AFTER_FIX) return "Fix before retrying";
  return "Retrying will not help";
}
