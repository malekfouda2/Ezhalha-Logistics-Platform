// Representative IANA timezone per country. Used wherever a shipper-local wall clock matters —
// carrier pickup windows (a pickup is booked in the ORIGIN's local time, not KSA time) and the
// DHL "GMT±HH:MM" offset on plannedPickupDateAndTime. Covers common shipping origins; unknown
// countries fall back to UTC.
const COUNTRY_TZ: Record<string, string> = {
  DE: "Europe/Berlin", GB: "Europe/London", FR: "Europe/Paris", NL: "Europe/Amsterdam",
  BE: "Europe/Brussels", IT: "Europe/Rome", ES: "Europe/Madrid", CH: "Europe/Zurich",
  AT: "Europe/Vienna", PL: "Europe/Warsaw", CZ: "Europe/Prague", SE: "Europe/Stockholm",
  DK: "Europe/Copenhagen", IE: "Europe/Dublin", PT: "Europe/Lisbon", TR: "Europe/Istanbul",
  AE: "Asia/Dubai", SA: "Asia/Riyadh", QA: "Asia/Qatar", KW: "Asia/Kuwait", BH: "Asia/Bahrain",
  OM: "Asia/Muscat", EG: "Africa/Cairo", JO: "Asia/Amman", CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong", IN: "Asia/Kolkata", JP: "Asia/Tokyo", KR: "Asia/Seoul",
  SG: "Asia/Singapore", US: "America/New_York", CA: "America/Toronto", BR: "America/Sao_Paulo",
  AU: "Australia/Sydney",
};

/** IANA timezone for a 2-letter country code; "UTC" when the country isn't mapped. */
export function countryTimeZone(countryCode?: string | null): string {
  return COUNTRY_TZ[(countryCode || "").trim().toUpperCase()] || "UTC";
}

/** Wall-clock parts (`YYYY-MM-DD` + minutes-since-midnight + day-of-week) in a country's timezone. */
export function countryLocalNow(
  countryCode?: string | null,
  now: Date = new Date(),
): { date: string; minutes: number; dayOfWeek: number } {
  const tz = countryTimeZone(countryCode);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const [y, m, d] = date.split("-").map(Number);
  return {
    date,
    minutes: hour * 60 + Number(parts.minute),
    dayOfWeek: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
  };
}

/**
 * Countries whose working week runs Sunday–Thursday, so the weekend is Friday and Saturday.
 *
 * Everywhere else is assumed Saturday/Sunday. This list is the one that matters for pickups: a
 * carrier refuses a collection booked on a non-working day at the *origin*, and the origin is
 * usually not where this system runs.
 *
 * The UAE is deliberately absent — it moved to a Saturday/Sunday weekend in 2022.
 */
const FRIDAY_SATURDAY_WEEKEND_COUNTRIES = new Set([
  "SA", "KW", "QA", "BH", "OM", "EG", "JO", "IQ", "SY", "YE", "LY", "SD", "PS", "IL",
]);

/** Day-of-week numbers (0 = Sunday) that are weekend in a country. */
export function weekendDaysForCountry(countryCode?: string | null): number[] {
  const normalized = (countryCode || "").trim().toUpperCase();
  return FRIDAY_SATURDAY_WEEKEND_COUNTRIES.has(normalized) ? [5, 6] : [0, 6];
}

function dayOfWeekForDateString(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Is this `YYYY-MM-DD` a working day in the given country?
 *
 * Pickup dates were previously checked against Saudi weekend rules regardless of origin, which
 * meant a Sunday was always considered a working day. A Sunday collection from Turkey or China is
 * refused outright — DHL answers `5006: Pickup is not allowed for this shipment date` — and the
 * parcel then travels with no courier ever booked, because the waybill call succeeds separately.
 */
export function isBusinessDayInCountry(dateStr: string, countryCode?: string | null): boolean {
  return !weekendDaysForCountry(countryCode).includes(dayOfWeekForDateString(dateStr));
}

/** The first working day at or after `dateStr`, in the given country's calendar. */
export function nextBusinessDayOnOrAfter(dateStr: string, countryCode?: string | null): string {
  const weekend = weekendDaysForCountry(countryCode);
  const [y, m, d] = dateStr.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  while (weekend.includes(cur.getUTCDay())) {
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return cur.toISOString().slice(0, 10);
}

/** The first working day strictly after `dateStr`, in the given country's calendar. */
export function nextBusinessDayAfterInCountry(dateStr: string, countryCode?: string | null): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  cur.setUTCDate(cur.getUTCDate() + 1);
  return nextBusinessDayOnOrAfter(cur.toISOString().slice(0, 10), countryCode);
}
