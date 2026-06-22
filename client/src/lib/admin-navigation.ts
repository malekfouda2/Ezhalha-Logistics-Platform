export interface AdminRoutePermissionConfig {
  anyOf?: string[];
  allOf?: string[];
}

export interface AdminNavItem {
  href: string;
  label: string;
  permissions: AdminRoutePermissionConfig;
  children?: AdminNavItem[];
}

export const ADMIN_ROUTE_PERMISSIONS = {
  dashboard: { anyOf: ["dashboard:read"] },
  users: {
    anyOf: [
      "users:read",
      "roles:read",
      "permissions:read",
    ],
  },
  allUsers: { anyOf: ["users:read"] },
  userRoles: { anyOf: ["roles:read", "permissions:read"] },
  userInvites: { anyOf: ["users:read", "users:create", "users:update"] },
  clients: { anyOf: ["clients:read"] },
  editClient: { allOf: ["clients:read", "clients:update"] },
  applications: { anyOf: ["applications:read"] },
  operations: { anyOf: ["operations:read"] },
  tasks: { anyOf: ["tasks:read"] },
  shipments: { anyOf: ["shipments:read"] },
  financialManagement: {
    anyOf: [
      "invoices:read",
      "payments:read",
      "refund-requests:read",
      "credit-requests:read",
      "credit-invoices:read",
      "pricing-rules:read",
    ],
  },
  invoices: { anyOf: ["invoices:read"] },
  payments: { anyOf: ["payments:read"] },
  refundRequests: { anyOf: ["refund-requests:read"] },
  creditRequests: { anyOf: ["credit-requests:read"] },
  creditInvoices: { anyOf: ["credit-invoices:read"] },
  pricing: { anyOf: ["pricing-rules:read"] },
  system: {
    anyOf: [
      "system-logs:read",
      "audit-logs:read",
      "integrations:read",
      "webhooks:read",
      "email-templates:read",
    ],
  },
  systemLogs: { anyOf: ["system-logs:read"] },
  auditLogs: { anyOf: ["audit-logs:read"] },
  integrations: { anyOf: ["integrations:read"] },
  apps: { anyOf: ["integrations:read"] },
  webhooks: { anyOf: ["webhooks:read"] },
  accessControl: { anyOf: ["roles:read", "permissions:read", "users:read"] },
  emailTemplates: { anyOf: ["email-templates:read"] },
  policies: { anyOf: ["policies:read"] },
} satisfies Record<string, AdminRoutePermissionConfig>;

export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", permissions: ADMIN_ROUTE_PERMISSIONS.dashboard },
  {
    href: "/admin/users",
    label: "Users",
    permissions: ADMIN_ROUTE_PERMISSIONS.users,
    children: [
      { href: "/admin/users", label: "All Users", permissions: ADMIN_ROUTE_PERMISSIONS.allUsers },
      { href: "/admin/users/roles", label: "Roles & Permissions", permissions: ADMIN_ROUTE_PERMISSIONS.userRoles },
      { href: "/admin/users/invites", label: "Pending Invites", permissions: ADMIN_ROUTE_PERMISSIONS.userInvites },
    ],
  },
  { href: "/admin/clients", label: "Clients", permissions: ADMIN_ROUTE_PERMISSIONS.clients },
  { href: "/admin/applications", label: "Applications", permissions: ADMIN_ROUTE_PERMISSIONS.applications },
  {
    href: "/admin/operations",
    label: "Operations Hub",
    permissions: ADMIN_ROUTE_PERMISSIONS.operations,
    children: [
      { href: "/admin/operations?view=d2d", label: "Door to Door", permissions: ADMIN_ROUTE_PERMISSIONS.operations },
      { href: "/admin/operations?view=express", label: "Express Shipments", permissions: ADMIN_ROUTE_PERMISSIONS.operations },
      { href: "/admin/operations?view=attention", label: "Needs Attention", permissions: ADMIN_ROUTE_PERMISSIONS.operations },
      { href: "/admin/operations?view=special", label: "Special Handling", permissions: ADMIN_ROUTE_PERMISSIONS.operations },
      { href: "/admin/operations?view=delivered", label: "Delivered", permissions: ADMIN_ROUTE_PERMISSIONS.operations },
    ],
  },
  {
    href: "/admin/shipments",
    label: "Shipments",
    permissions: ADMIN_ROUTE_PERMISSIONS.shipments,
    children: [
      { href: "/admin/shipments", label: "All Shipments", permissions: ADMIN_ROUTE_PERMISSIONS.shipments },
      { href: "/admin/shipments/abandoned", label: "Abandoned Shipments", permissions: ADMIN_ROUTE_PERMISSIONS.shipments },
    ],
  },
  {
    href: "/admin/financial-management",
    label: "Financial Management",
    permissions: ADMIN_ROUTE_PERMISSIONS.financialManagement,
    children: [
      { href: "/admin/invoices", label: "Invoices", permissions: ADMIN_ROUTE_PERMISSIONS.invoices },
      { href: "/admin/payments", label: "Financial Statements", permissions: ADMIN_ROUTE_PERMISSIONS.payments },
      { href: "/admin/refund-requests", label: "Refund Requests", permissions: ADMIN_ROUTE_PERMISSIONS.refundRequests },
      { href: "/admin/credit-requests", label: "Credit Requests", permissions: ADMIN_ROUTE_PERMISSIONS.creditRequests },
      { href: "/admin/credit-invoices", label: "Credit Invoices", permissions: ADMIN_ROUTE_PERMISSIONS.creditInvoices },
      { href: "/admin/pricing", label: "Pricing", permissions: ADMIN_ROUTE_PERMISSIONS.pricing },
      { href: "/admin/ddp-pricing", label: "DDP Pricing", permissions: ADMIN_ROUTE_PERMISSIONS.pricing },
    ],
  },
  {
    href: "/admin/system",
    label: "System",
    permissions: ADMIN_ROUTE_PERMISSIONS.system,
    children: [
      { href: "/admin/system-logs", label: "Bugs & Errors", permissions: ADMIN_ROUTE_PERMISSIONS.systemLogs },
      { href: "/admin/audit-logs", label: "Audit Logs", permissions: ADMIN_ROUTE_PERMISSIONS.auditLogs },
      { href: "/admin/integration-logs", label: "Integrations", permissions: ADMIN_ROUTE_PERMISSIONS.integrations },
      { href: "/admin/apps", label: "Apps", permissions: ADMIN_ROUTE_PERMISSIONS.apps },
      { href: "/admin/webhook-events", label: "Webhooks", permissions: ADMIN_ROUTE_PERMISSIONS.webhooks },
      { href: "/admin/email-templates", label: "Email Templates", permissions: ADMIN_ROUTE_PERMISSIONS.emailTemplates },
    ],
  },
  { href: "/admin/tasks", label: "Tasks", permissions: ADMIN_ROUTE_PERMISSIONS.tasks },
  { href: "/admin/policies", label: "Policies", permissions: ADMIN_ROUTE_PERMISSIONS.policies },
] satisfies AdminNavItem[];

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

  const firstVisibleChild = firstVisibleNavItem?.children?.find((item) =>
    hasAdminPermissionAccess(permissionNames, item.permissions),
  );

  return firstVisibleChild?.href || firstVisibleNavItem?.href || "/admin/settings";
}
