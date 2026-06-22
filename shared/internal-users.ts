export const InternalDepartmentSlug = {
  PLATFORM: "platform",
  OPERATIONS: "operations",
  SALES: "sales",
  CUSTOMER_SERVICE: "customer-service",
  MARKETING: "marketing",
  FINANCE: "finance",
  ACCOUNT_MANAGEMENT: "account-management",
} as const;

export type InternalDepartmentSlugValue =
  typeof InternalDepartmentSlug[keyof typeof InternalDepartmentSlug];

export const RoleHierarchyLevel = {
  PLATFORM_ADMIN: "platform_admin",
  MANAGER: "manager",
  TEAM_LEAD: "team_lead",
  SPECIALIST: "specialist",
  AGENT: "agent",
} as const;

export type RoleHierarchyLevelValue =
  typeof RoleHierarchyLevel[keyof typeof RoleHierarchyLevel];

export const UserInvitationStatus = {
  PENDING: "pending",
  REVOKED: "revoked",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
} as const;

export type UserInvitationStatusValue =
  typeof UserInvitationStatus[keyof typeof UserInvitationStatus];

export const DepartmentIconKey = {
  SHIELD: "shield",
  BOXES: "boxes",
  CHART: "chart",
  HEADSET: "headset",
  ACTIVITY: "activity",
  DOLLAR: "dollar",
  USERS: "users",
} as const;

export type DepartmentIconKeyValue =
  typeof DepartmentIconKey[keyof typeof DepartmentIconKey];

export const DepartmentColorKey = {
  PURPLE: "purple",
  ORANGE: "orange",
  GREEN: "green",
  CORAL: "coral",
  BLUE: "blue",
  EMERALD: "emerald",
  INDIGO: "indigo",
} as const;

export type DepartmentColorKeyValue =
  typeof DepartmentColorKey[keyof typeof DepartmentColorKey];

export const HIERARCHY_LEVEL_LABELS: Record<RoleHierarchyLevelValue, string> = {
  [RoleHierarchyLevel.PLATFORM_ADMIN]: "Admin",
  [RoleHierarchyLevel.MANAGER]: "Manager",
  [RoleHierarchyLevel.TEAM_LEAD]: "Team Lead",
  [RoleHierarchyLevel.SPECIALIST]: "Specialist / Officer",
  [RoleHierarchyLevel.AGENT]: "Agent",
};

export const HIERARCHY_LEVEL_SORT_ORDER: Record<RoleHierarchyLevelValue, number> = {
  [RoleHierarchyLevel.PLATFORM_ADMIN]: 0,
  [RoleHierarchyLevel.MANAGER]: 1,
  [RoleHierarchyLevel.TEAM_LEAD]: 2,
  [RoleHierarchyLevel.SPECIALIST]: 3,
  [RoleHierarchyLevel.AGENT]: 4,
};

export const INTERNAL_DEPARTMENT_STYLE_PRESETS = [
  { iconKey: DepartmentIconKey.SHIELD, colorKey: DepartmentColorKey.PURPLE, label: "Shield / Purple" },
  { iconKey: DepartmentIconKey.BOXES, colorKey: DepartmentColorKey.ORANGE, label: "Boxes / Orange" },
  { iconKey: DepartmentIconKey.CHART, colorKey: DepartmentColorKey.GREEN, label: "Chart / Green" },
  { iconKey: DepartmentIconKey.HEADSET, colorKey: DepartmentColorKey.CORAL, label: "Headset / Coral" },
  { iconKey: DepartmentIconKey.ACTIVITY, colorKey: DepartmentColorKey.BLUE, label: "Activity / Blue" },
  { iconKey: DepartmentIconKey.DOLLAR, colorKey: DepartmentColorKey.EMERALD, label: "Dollar / Emerald" },
  { iconKey: DepartmentIconKey.USERS, colorKey: DepartmentColorKey.INDIGO, label: "Users / Indigo" },
] as const;

export const DEFAULT_INTERNAL_DEPARTMENTS = [
  {
    slug: InternalDepartmentSlug.PLATFORM,
    name: "Platform",
    description: "Platform administration and cross-platform governance.",
    iconKey: DepartmentIconKey.SHIELD,
    colorKey: DepartmentColorKey.PURPLE,
    sortOrder: 0,
    isSystem: true,
  },
  {
    slug: InternalDepartmentSlug.OPERATIONS,
    name: "Operations",
    description: "Shipment execution, monitoring, escalation, and delivery operations.",
    iconKey: DepartmentIconKey.BOXES,
    colorKey: DepartmentColorKey.ORANGE,
    sortOrder: 10,
    isSystem: true,
  },
  {
    slug: InternalDepartmentSlug.SALES,
    name: "Sales",
    description: "Commercial growth, account development, and pipeline ownership.",
    iconKey: DepartmentIconKey.CHART,
    colorKey: DepartmentColorKey.GREEN,
    sortOrder: 20,
    isSystem: true,
  },
  {
    slug: InternalDepartmentSlug.CUSTOMER_SERVICE,
    name: "Customer Service",
    description: "Client communication, issue resolution, and support workflows.",
    iconKey: DepartmentIconKey.HEADSET,
    colorKey: DepartmentColorKey.CORAL,
    sortOrder: 30,
    isSystem: true,
  },
  {
    slug: InternalDepartmentSlug.MARKETING,
    name: "Marketing",
    description: "Brand, content, campaigns, and acquisition support.",
    iconKey: DepartmentIconKey.ACTIVITY,
    colorKey: DepartmentColorKey.BLUE,
    sortOrder: 40,
    isSystem: true,
  },
  {
    slug: InternalDepartmentSlug.FINANCE,
    name: "Finance",
    description: "Billing, reconciliations, and financial controls.",
    iconKey: DepartmentIconKey.DOLLAR,
    colorKey: DepartmentColorKey.EMERALD,
    sortOrder: 50,
    isSystem: true,
  },
  {
    slug: InternalDepartmentSlug.ACCOUNT_MANAGEMENT,
    name: "Account Management",
    description: "Assigned client ownership, profile updates, and approval-led account care.",
    iconKey: DepartmentIconKey.USERS,
    colorKey: DepartmentColorKey.INDIGO,
    sortOrder: 60,
    isSystem: true,
  },
] as const;
