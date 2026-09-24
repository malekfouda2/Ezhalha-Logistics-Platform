import type { ClientApplication } from "@shared/schema";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export function applicationDisplayName(application: ClientApplication): string {
  return (application.accountType === "company" && application.companyName) || application.name;
}

export function applicationInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function applicationLocation(application: ClientApplication): string {
  const city = application.nationalAddressCity || application.shippingCity;
  return [city, application.country].filter(Boolean).join(", ");
}

export function applicationTimeAgo(date: string | Date, t: Translate): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("adminAccountManagersScreen.time.justNow");
  if (minutes < 60) return t("adminAccountManagersScreen.time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("adminAccountManagersScreen.time.hoursAgo", { count: hours });
  return t("adminAccountManagersScreen.time.daysAgo", { count: Math.floor(hours / 24) });
}

export function applicationStatusColors(status: string): { background: string; text: string } {
  switch (status) {
    case "approved":
      return { background: "#E4F7EA", text: "#1E9E4B" };
    case "rejected":
      return { background: "#FDE8E8", text: "#B91C1C" };
    default:
      return { background: "#FEF3C7", text: "#92400E" };
  }
}
