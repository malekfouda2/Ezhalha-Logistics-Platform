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
