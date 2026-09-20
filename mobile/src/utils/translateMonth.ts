import type { TFunction } from "i18next";

// Server month labels (server/routes.ts `monthNames`, e.g. "Jan") are English
// abbreviations regardless of locale — map them onto the app's own `months.*`
// strings the same way the client dashboard does.
const MONTH_KEYS: Record<string, string> = {
  jan: "months.jan",
  january: "months.jan",
  feb: "months.feb",
  february: "months.feb",
  mar: "months.mar",
  march: "months.mar",
  apr: "months.apr",
  april: "months.apr",
  may: "months.may",
  jun: "months.jun",
  june: "months.jun",
  jul: "months.jul",
  july: "months.jul",
  aug: "months.aug",
  august: "months.aug",
  sep: "months.sep",
  september: "months.sep",
  oct: "months.oct",
  october: "months.oct",
  nov: "months.nov",
  november: "months.nov",
  dec: "months.dec",
  december: "months.dec",
};

export function translateMonth(label: string, t: TFunction): string {
  const key = MONTH_KEYS[label.trim().toLowerCase()];
  return key ? t(key) : label;
}
