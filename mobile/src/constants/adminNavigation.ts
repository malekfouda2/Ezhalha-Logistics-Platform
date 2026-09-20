import { Feather, Ionicons } from "@expo/vector-icons";

// Same permission names as the web admin sidebar
// (client/src/lib/admin-navigation.ts `ADMIN_ROUTE_PERMISSIONS`) — kept in
// sync by hand since the mobile app and the web client don't share a bundle.
export type AdminNavIcon =
  | { library: "feather"; name: keyof typeof Feather.glyphMap }
  | { library: "ionicons"; name: keyof typeof Ionicons.glyphMap };

export interface AdminNavItem {
  key: string;
  /** i18n key under `admin.nav.items` — resolved with `t()` at render time. */
  labelKey: string;
  icon: AdminNavIcon;
  /** Permission names — the item is enabled when the user holds any one of these. */
  anyOf: string[];
}

export interface AdminNavSection {
  /** i18n key under `admin.nav.sections` — resolved with `t()` at render time. */
  titleKey: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    titleKey: "clients",
    items: [
      { key: "clients", labelKey: "clients", icon: { library: "feather", name: "users" }, anyOf: ["clients:read"] },
      { key: "applications", labelKey: "applications", icon: { library: "feather", name: "file-text" }, anyOf: ["applications:read"] },
      { key: "account-managers", labelKey: "accountManagers", icon: { library: "ionicons", name: "star-outline" }, anyOf: ["account-managers:read"] },
    ],
  },
  {
    // Internal staff management — Users, Access Control (moved out of System)
    // and Tasks (moved out of the old Overview section, which is gone now
    // that Dashboard lives on the Home tab).
    titleKey: "staff",
    items: [
      { key: "users", labelKey: "users", icon: { library: "ionicons", name: "person-outline" }, anyOf: ["users:read"] },
      { key: "access-control", labelKey: "accessControl", icon: { library: "feather", name: "key" }, anyOf: ["roles:read", "permissions:read", "users:read"] },
      { key: "tasks", labelKey: "tasks", icon: { library: "feather", name: "list" }, anyOf: ["tasks:read"] },
    ],
  },
  {
    titleKey: "movement",
    items: [
      { key: "operations", labelKey: "operations", icon: { library: "feather", name: "truck" }, anyOf: ["operations:read"] },
      { key: "shipments", labelKey: "shipments", icon: { library: "feather", name: "hexagon" }, anyOf: ["shipments:read"] },
      { key: "quotations", labelKey: "quotations", icon: { library: "feather", name: "tag" }, anyOf: ["shipments:create"] },
      { key: "abandoned-shipments", labelKey: "abandonedShipments", icon: { library: "feather", name: "clock" }, anyOf: ["shipments:read"] },
    ],
  },
  {
    titleKey: "money",
    items: [
      { key: "invoices", labelKey: "invoices", icon: { library: "feather", name: "file-text" }, anyOf: ["invoices:read"] },
      { key: "payments", labelKey: "payments", icon: { library: "feather", name: "bar-chart-2" }, anyOf: ["payments:read"] },
      { key: "refund-requests", labelKey: "refundRequests", icon: { library: "feather", name: "rotate-ccw" }, anyOf: ["refund-requests:read"] },
      { key: "credit-requests", labelKey: "creditRequests", icon: { library: "feather", name: "credit-card" }, anyOf: ["credit-requests:read"] },
      { key: "sales-feature-requests", labelKey: "salesFeatureRequests", icon: { library: "ionicons", name: "storefront-outline" }, anyOf: ["sales-feature-requests:read"] },
      { key: "dangerous-goods-requests", labelKey: "dangerousGoodsRequests", icon: { library: "feather", name: "alert-triangle" }, anyOf: ["dangerous-goods-requests:read"] },
      { key: "credit-invoices", labelKey: "creditInvoices", icon: { library: "feather", name: "calendar" }, anyOf: ["credit-invoices:read"] },
      { key: "pricing", labelKey: "pricing", icon: { library: "ionicons", name: "scale-outline" }, anyOf: ["pricing-rules:read"] },
    ],
  },
  {
    titleKey: "system",
    items: [
      { key: "system-logs", labelKey: "systemLogs", icon: { library: "ionicons", name: "bug-outline" }, anyOf: ["system-logs:read"] },
      { key: "audit-logs", labelKey: "auditLogs", icon: { library: "feather", name: "shield" }, anyOf: ["audit-logs:read"] },
      { key: "integrations", labelKey: "integrations", icon: { library: "feather", name: "zap" }, anyOf: ["integrations:read"] },
      { key: "integration-health", labelKey: "integrationHealth", icon: { library: "feather", name: "activity" }, anyOf: ["integrations:read"] },
      { key: "apps", labelKey: "apps", icon: { library: "feather", name: "grid" }, anyOf: ["integrations:read"] },
      { key: "webhooks", labelKey: "webhooks", icon: { library: "feather", name: "refresh-cw" }, anyOf: ["webhooks:read"] },
      { key: "email-settings", labelKey: "emailSettings", icon: { library: "feather", name: "mail" }, anyOf: ["email-templates:read"] },
      { key: "policies", labelKey: "policies", icon: { library: "feather", name: "file" }, anyOf: ["policies:read"] },
    ],
  },
];

export function hasAdminNavAccess(permissions: string[], item: AdminNavItem): boolean {
  return item.anyOf.some((permission) => permissions.includes(permission));
}
