// utils/invoiceFormat.ts

export function formatShortDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${day} ${month}`;
}

/** e.g. "Sep 3, 2026 12:46 PM" */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "international_economy" / "INTERNATIONAL_ECONOMY" -> "INTERNATIONAL ECONOMY" */
export function formatEnumLabel(value?: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").toUpperCase();
}

export function formatMoney(value?: number | string | null): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === undefined || n === null || Number.isNaN(n)) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toNumber(value?: number | string | null): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n === undefined || n === null || Number.isNaN(n) ? 0 : n;
}

/** Whole number of days from now until `value` (negative when overdue). */
export function daysUntil(value?: string | Date | null): number | null {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfTarget.getTime() - startOfNow.getTime()) / msPerDay);
}
