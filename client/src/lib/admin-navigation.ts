export interface AdminRoutePermissionConfig {
  anyOf?: string[];
  allOf?: string[];
}

export const ADMIN_ROUTE_PERMISSIONS = {
  dashboard: { anyOf: ["dashboard:read"] },
  clients: { anyOf: ["clients:read"] },
  editClient: { allOf: ["clients:read", "clients:update"] },
  applications: { anyOf: ["applications:read"] },
  shipments: { anyOf: ["shipments:read"] },
  invoices: { anyOf: ["invoices:read"] },
  payments: { anyOf: ["payments:read"] },
  creditRequests: { anyOf: ["credit-requests:read"] },
  creditInvoices: { anyOf: ["credit-invoices:read"] },
  pricing: { anyOf: ["pricing-rules:read"] },
  systemLogs: { anyOf: ["system-logs:read"] },
  auditLogs: { anyOf: ["audit-logs:read"] },
  integrations: { anyOf: ["integrations:read"] },
  webhooks: { anyOf: ["webhooks:read"] },
  accountManagers: { anyOf: ["account-managers:read", "account-manager-requests:read"] },
  accessControl: { anyOf: ["roles:read", "permissions:read", "users:read"] },
  emailTemplates: { anyOf: ["email-templates:read"] },
  policies: { anyOf: ["policies:read"] },
} satisfies Record<string, AdminRoutePermissionConfig>;

export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", permissions: ADMIN_ROUTE_PERMISSIONS.dashboard },
  { href: "/admin/clients", label: "Clients", permissions: ADMIN_ROUTE_PERMISSIONS.clients },
  { href: "/admin/applications", label: "Applications", permissions: ADMIN_ROUTE_PERMISSIONS.applications },
  { href: "/admin/shipments", label: "Shipments", permissions: ADMIN_ROUTE_PERMISSIONS.shipments },
  { href: "/admin/invoices", label: "Invoices", permissions: ADMIN_ROUTE_PERMISSIONS.invoices },
  { href: "/admin/payments", label: "Financial Statements", permissions: ADMIN_ROUTE_PERMISSIONS.payments },
  { href: "/admin/credit-requests", label: "Credit Requests", permissions: ADMIN_ROUTE_PERMISSIONS.creditRequests },
  { href: "/admin/credit-invoices", label: "Credit Invoices", permissions: ADMIN_ROUTE_PERMISSIONS.creditInvoices },
  { href: "/admin/pricing", label: "Pricing", permissions: ADMIN_ROUTE_PERMISSIONS.pricing },
  { href: "/admin/system-logs", label: "Bugs & Errors", permissions: ADMIN_ROUTE_PERMISSIONS.systemLogs },
  { href: "/admin/audit-logs", label: "Audit Logs", permissions: ADMIN_ROUTE_PERMISSIONS.auditLogs },
  { href: "/admin/integration-logs", label: "Integrations", permissions: ADMIN_ROUTE_PERMISSIONS.integrations },
  { href: "/admin/webhook-events", label: "Webhooks", permissions: ADMIN_ROUTE_PERMISSIONS.webhooks },
  { href: "/admin/account-managers", label: "Account Managers", permissions: ADMIN_ROUTE_PERMISSIONS.accountManagers },
  { href: "/admin/rbac", label: "Access Control", permissions: ADMIN_ROUTE_PERMISSIONS.accessControl },
  { href: "/admin/email-templates", label: "Email Templates", permissions: ADMIN_ROUTE_PERMISSIONS.emailTemplates },
  { href: "/admin/policies", label: "Policies", permissions: ADMIN_ROUTE_PERMISSIONS.policies },
] as const;

export function hasAdminPermissionAccess(
  permissionNames: string[],
  requirements?: AdminRoutePermissionConfig,
): boolean {
  if (!requirements) {
    return true;
  }

  const hasAll = !requirements.allOf || requirements.allOf.every((permission) => permissionNames.includes(permission));
  const hasAny = !requirements.anyOf || requirements.anyOf.some((permission) => permissionNames.includes(permission));

  return hasAll && hasAny;
}

export function getFirstAccessibleAdminPath(permissionNames: string[]): string {
  const firstVisibleNavItem = ADMIN_NAV_ITEMS.find((item) =>
    hasAdminPermissionAccess(permissionNames, item.permissions),
  );

  return firstVisibleNavItem?.href || "/admin/settings";
}
