import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  HIERARCHY_LEVEL_LABELS,
  INTERNAL_DEPARTMENT_STYLE_PRESETS,
  InternalDepartmentSlug,
  RoleHierarchyLevel,
} from "@shared/internal-users";
import {
  Activity,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  DollarSign,
  Eye,
  Headset,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";

type PageView = "all-users" | "roles" | "invites";

interface DepartmentRef {
  id: string;
  name: string;
  slug: string;
  iconKey: string;
  colorKey: string;
}

interface RoleRef {
  id: string;
  name: string;
  hierarchyLevel: string | null;
}

interface StaffUserRow {
  kind: "user";
  id: string;
  fullName: string;
  username: string;
  email: string;
  department: DepartmentRef | null;
  role: RoleRef | null;
  status: "active" | "inactive";
  lastLoginAt: string | null;
  userType: "admin" | "operations";
  isActive: boolean;
}

interface InvitationRow {
  kind: "invitation";
  id: string;
  fullName: string;
  email: string;
  department: DepartmentRef | null;
  role: RoleRef | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  lastLoginAt: null;
  userType: "admin" | "operations";
  isActive: false;
  sentAt: string;
  expiresAt: string;
}

interface DepartmentSummary extends DepartmentRef {
  description: string | null;
  sortOrder: number;
  isSystem: boolean;
  roleCount: number;
  userCount: number;
  invitationCount: number;
}

interface PermissionRecord {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
}

interface HierarchicalRole {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  hierarchyLevel: string | null;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  department: DepartmentRef | null;
  permissions?: PermissionRecord[];
}

interface UserActivityItem {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
}

interface UserDetailResponse {
  row: StaffUserRow;
  createdAt: string;
  phone: string | null;
  permissions: PermissionRecord[];
  activity: UserActivityItem[];
}

type MergedUserRow = StaffUserRow | InvitationRow;

interface RoleFormState {
  id: string;
  name: string;
  departmentId: string;
  hierarchyLevel: string;
  copyRoleId: string;
  description: string;
  permissionIds: string[];
}

const DEPARTMENT_ICON_MAP = {
  shield: Shield,
  boxes: Boxes,
  chart: BarChart3,
  headset: Headset,
  activity: Activity,
  dollar: DollarSign,
  users: Users,
} as const;

const DEPARTMENT_TONE_MAP: Record<string, { icon: string; bg: string; chip: string; chipText: string }> = {
  purple: {
    icon: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200",
    bg: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200",
    chip: "border-purple-200 bg-purple-50 dark:border-purple-500/40 dark:bg-purple-500/10",
    chipText: "text-purple-700 dark:text-purple-200",
  },
  orange: {
    icon: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200",
    bg: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200",
    chip: "border-orange-200 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/10",
    chipText: "text-orange-700 dark:text-orange-200",
  },
  green: {
    icon: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
    bg: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
    chip: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10",
    chipText: "text-emerald-700 dark:text-emerald-200",
  },
  coral: {
    icon: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
    bg: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
    chip: "border-rose-200 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10",
    chipText: "text-rose-700 dark:text-rose-200",
  },
  blue: {
    icon: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200",
    bg: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200",
    chip: "border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10",
    chipText: "text-blue-700 dark:text-blue-200",
  },
  emerald: {
    icon: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200",
    bg: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200",
    chip: "border-teal-200 bg-teal-50 dark:border-teal-500/40 dark:bg-teal-500/10",
    chipText: "text-teal-700 dark:text-teal-200",
  },
  indigo: {
    icon: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
    bg: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
    chip: "border-indigo-200 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10",
    chipText: "text-indigo-700 dark:text-indigo-200",
  },
};

const HIERARCHY_OPTIONS = [
  { value: RoleHierarchyLevel.AGENT, label: "Agent" },
  { value: RoleHierarchyLevel.SPECIALIST, label: "Specialist / Officer" },
  { value: RoleHierarchyLevel.TEAM_LEAD, label: "Team Lead" },
  { value: RoleHierarchyLevel.MANAGER, label: "Manager" },
] as const;

const PLATFORM_HIERARCHY_OPTIONS = [
  { value: RoleHierarchyLevel.PLATFORM_ADMIN, label: "Admin" },
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  "shipments:read": "View all shipments",
  "shipments:create": "Create shipments",
  "shipments:update": "Edit shipment details",
  "shipments:delete": "Delete shipments",
  "shipments:cancel": "Delete / cancel shipments",
  "shipments:track": "Track shipments",
  "clients:read": "View client profiles",
  "clients:update": "Edit client details",
  "clients:create": "Create client accounts",
  "clients:activate": "Activate / deactivate clients",
  "invoices:read": "View invoices",
  "invoices:update": "Edit invoice details",
  "invoices:download": "Download invoices",
  "payments:read": "View payment records",
  "refund-requests:read": "View refund requests",
  "refund-requests:approve-account-manager": "Approve refund as account manager",
  "refund-requests:approve-finance": "Approve refund as finance",
  "pricing-rules:read": "View shipping rates",
  "operations:read": "View operations hub",
  "operations:update": "Update shipment workflow",
  "operations:assign": "Assign shipments to team",
  "operations:message-client": "Send WhatsApp messages",
  "operations:special-handling": "Mark as special handling",
  "operations:attention": "Escalate tickets",
  "operations:financial-breakdown": "View financial breakdown",
  "notifications:read": "View notifications",
  "notifications:update": "Update notifications",
  "account-managers:read": "View account management",
  "account-managers:assign": "Assign client portfolios",
  "account-manager-requests:read": "View change requests",
  "account-manager-requests:approve": "Approve change requests",
  "account-manager-requests:reject": "Reject change requests",
  "credit-invoices:read": "View credit invoices",
  "credit-invoices:update": "Edit credit invoices",
  "credit-requests:read": "View credit requests",
  "credit-requests:approve": "Approve credit requests",
  "credit-requests:reject": "Reject credit requests",
  "dashboard:read": "View reports",
};

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  shipments: "Shipments",
  clients: "Clients",
  invoices: "Finance",
  payments: "Finance",
  "refund-requests": "Finance",
  "credit-requests": "Finance",
  "credit-invoices": "Finance",
  "pricing-rules": "Pricing",
  operations: "Operations",
  notifications: "Communications",
  "account-managers": "Clients",
  "account-manager-requests": "Clients",
  dashboard: "Reports",
};

function getPageView(pathname: string): PageView {
  if (pathname === "/admin/users/roles") return "roles";
  if (pathname === "/admin/users/invites") return "invites";
  return "all-users";
}

function getDepartmentTone(department?: DepartmentRef | DepartmentSummary | null) {
  return DEPARTMENT_TONE_MAP[department?.colorKey || "orange"] || DEPARTMENT_TONE_MAP.orange;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "MMM d, yyyy");
}

function getRolePermissions(role?: HierarchicalRole | null) {
  return role?.permissions || [];
}

function getHierarchyLabel(level?: string | null) {
  if (!level) return "Role";
  return HIERARCHY_LEVEL_LABELS[level as keyof typeof HIERARCHY_LEVEL_LABELS] || level;
}

function permissionLabel(permission: PermissionRecord) {
  return PERMISSION_LABELS[permission.name] || permission.description || permission.name;
}

function permissionGroup(permission: PermissionRecord) {
  return PERMISSION_GROUP_LABELS[permission.resource] || permission.resource;
}

function roleScopeLabel(role: HierarchicalRole, resourceKey: "shipments" | "clients" | "reports") {
  const permissions = getRolePermissions(role);
  const hasMatch = permissions.some((permission) => {
    if (resourceKey === "shipments") {
      return permission.resource === "shipments" || permission.resource === "operations";
    }
    if (resourceKey === "clients") {
      return ["clients", "account-managers", "account-manager-requests"].includes(permission.resource);
    }
    return ["dashboard", "invoices", "payments", "pricing-rules", "credit-requests", "credit-invoices", "refund-requests"].includes(permission.resource);
  });

  if (!hasMatch) {
    return "No access";
  }

  switch (role.hierarchyLevel) {
    case RoleHierarchyLevel.PLATFORM_ADMIN:
    case RoleHierarchyLevel.MANAGER:
      return resourceKey === "reports" ? "Department records" : "All records";
    case RoleHierarchyLevel.TEAM_LEAD:
      return "Team records";
    case RoleHierarchyLevel.SPECIALIST:
      return resourceKey === "reports" ? "No access" : "Assigned to me";
    case RoleHierarchyLevel.AGENT:
    default:
      return resourceKey === "reports" ? "No access" : "Assigned to me";
  }
}

function scopeChip(scope: string) {
  if (scope === "All records") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200";
  }
  if (scope === "Department records") {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200";
  }
  if (scope === "Team records") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";
  }
  if (scope === "Assigned to me") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200";
  }
  return "border-border bg-muted text-muted-foreground";
}

function groupedPermissions(permissions: PermissionRecord[]) {
  const groups = new Map<string, PermissionRecord[]>();
  for (const permission of permissions) {
    const group = permissionGroup(permission);
    groups.set(group, [...(groups.get(group) || []), permission]);
  }

  return Array.from(groups.entries()).map(([group, records]) => ({
    group,
    permissions: [...records].sort((left, right) => permissionLabel(left).localeCompare(permissionLabel(right))),
  }));
}

function getDepartmentIcon(department?: DepartmentRef | DepartmentSummary | null) {
  return DEPARTMENT_ICON_MAP[department?.iconKey as keyof typeof DEPARTMENT_ICON_MAP] || Users;
}

function buildRoleSummary(role?: HierarchicalRole | null) {
  if (!role) return "";
  const labels = {
    [RoleHierarchyLevel.MANAGER]: "Full department visibility and control.",
    [RoleHierarchyLevel.TEAM_LEAD]: "Team-level execution, assignment, and oversight.",
    [RoleHierarchyLevel.SPECIALIST]: "Assigned workflow execution and updates.",
    [RoleHierarchyLevel.AGENT]: "Assigned record access and first-line actions.",
    [RoleHierarchyLevel.PLATFORM_ADMIN]: "Cross-platform administration and governance.",
  } as Record<string, string>;
  return labels[role.hierarchyLevel || ""] || role.description || "";
}

function getInitials(value: string) {
  return value
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function getActivityMeta(action: string) {
  switch (action) {
    case "account_created":
      return {
        label: "Account created",
        tone: "bg-emerald-500",
        Icon: CheckCircle2,
      };
    case "login":
    case "last_login":
      return {
        label: "Last login",
        tone: "bg-orange-500",
        Icon: Clock3,
      };
    case "update_internal_user":
      return {
        label: "Profile updated",
        tone: "bg-blue-500",
        Icon: Pencil,
      };
    case "activate_internal_user":
      return {
        label: "Account activated",
        tone: "bg-emerald-500",
        Icon: CheckCircle2,
      };
    case "deactivate_internal_user":
      return {
        label: "Account deactivated",
        tone: "bg-rose-500",
        Icon: TriangleAlert,
      };
    case "change_password":
      return {
        label: "Password changed",
        tone: "bg-violet-500",
        Icon: Shield,
      };
    default:
      return {
        label: action.replace(/_/g, " "),
        tone: "bg-muted-foreground",
        Icon: Activity,
      };
  }
}

function createInitialRoleForm(departmentId = "", departmentSlug = ""): RoleFormState {
  return {
    id: "",
    name: "",
    departmentId,
    hierarchyLevel:
      departmentSlug === InternalDepartmentSlug.PLATFORM
        ? RoleHierarchyLevel.PLATFORM_ADMIN
        : RoleHierarchyLevel.SPECIALIST,
    copyRoleId: "",
    description: "",
    permissionIds: [] as string[],
  };
}

export default function AdminUsers() {
  const [location] = useLocation();
  const { toast } = useToast();
  const currentPath = location.split("?")[0];
  const view = getPageView(currentPath);

  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedDepartmentId, setExpandedDepartmentId] = useState("");
  const [departmentTabs, setDepartmentTabs] = useState<Record<string, string>>({});
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUserRow | null>(null);
  const [viewUser, setViewUser] = useState<StaffUserRow | null>(null);

  const [departmentForm, setDepartmentForm] = useState({
    id: "",
    name: "",
    description: "",
    styleKey: `${INTERNAL_DEPARTMENT_STYLE_PRESETS[0].iconKey}:${INTERNAL_DEPARTMENT_STYLE_PRESETS[0].colorKey}`,
  });
  const [roleForm, setRoleForm] = useState<RoleFormState>(createInitialRoleForm());
  const [inviteForm, setInviteForm] = useState({
    fullName: "",
    email: "",
    departmentId: "",
    roleId: "",
    personalMessage: "",
  });
  const [userForm, setUserForm] = useState({
    id: "",
    firstName: "",
    lastName: "",
    email: "",
    departmentId: "",
    roleId: "",
    status: "active" as "active" | "inactive",
    phone: "",
    internalNotes: "",
  });

  const staffUsersQuery = useQuery<StaffUserRow[]>({
    queryKey: ["/api/admin/users"],
  });

  const invitationsQuery = useQuery<InvitationRow[]>({
    queryKey: ["/api/admin/invitations"],
  });

  const departmentsQuery = useQuery<DepartmentSummary[]>({
    queryKey: ["/api/admin/departments"],
    queryFn: async () => {
      const res = await fetch("/api/admin/departments", { credentials: "include" });
      if (res.status === 403) return [];
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to fetch departments");
      }
      return readJsonResponse<DepartmentSummary[]>(res);
    },
  });

  const rolesQuery = useQuery<HierarchicalRole[]>({
    queryKey: ["/api/admin/roles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/roles", { credentials: "include" });
      if (res.status === 403) return [];
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to fetch roles");
      }
      return readJsonResponse<HierarchicalRole[]>(res);
    },
  });

  const permissionsQuery = useQuery<PermissionRecord[]>({
    queryKey: ["/api/admin/permissions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/permissions", { credentials: "include" });
      if (res.status === 403) return [];
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to fetch permissions");
      }
      return readJsonResponse<PermissionRecord[]>(res);
    },
  });

  const userDetailQuery = useQuery<UserDetailResponse>({
    queryKey: ["/api/admin/users/detail", viewUser?.id],
    enabled: Boolean(viewUser?.id),
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${viewUser?.id}/detail`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to fetch user detail");
      }
      return readJsonResponse<UserDetailResponse>(res);
    },
  });

  const invalidateUsersArea = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/departments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users/detail"] });
  };

  const createDepartmentMutation = useMutation({
    mutationFn: async () => {
      const [iconKey, colorKey] = departmentForm.styleKey.split(":");
      const method = departmentForm.id ? "PATCH" : "POST";
      const url = departmentForm.id ? `/api/admin/departments/${departmentForm.id}` : "/api/admin/departments";
      const res = await apiRequest(method, url, {
        name: departmentForm.name,
        description: departmentForm.description || undefined,
        iconKey,
        colorKey,
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      invalidateUsersArea();
      setDepartmentModalOpen(false);
      setDepartmentForm({
        id: "",
        name: "",
        description: "",
        styleKey: `${INTERNAL_DEPARTMENT_STYLE_PRESETS[0].iconKey}:${INTERNAL_DEPARTMENT_STYLE_PRESETS[0].colorKey}`,
      });
      toast({ title: "Department saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save department", description: error.message, variant: "destructive" }),
  });

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const method = roleForm.id ? "PATCH" : "POST";
      const url = roleForm.id ? `/api/admin/roles/${roleForm.id}` : "/api/admin/roles";
      const res = await apiRequest(method, url, {
        name: roleForm.name,
        departmentId: roleForm.departmentId,
        hierarchyLevel: roleForm.hierarchyLevel,
        description: roleForm.description || undefined,
        permissionIds: roleForm.permissionIds,
        isActive: true,
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      invalidateUsersArea();
      setRoleModalOpen(false);
      setRoleForm(createInitialRoleForm());
      toast({ title: "Role saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save role", description: error.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/invitations", {
        fullName: inviteForm.fullName,
        email: inviteForm.email,
        departmentId: inviteForm.departmentId,
        roleId: inviteForm.roleId,
        personalMessage: inviteForm.personalMessage || undefined,
      });
      return readJsonResponse<{ emailSent: boolean }>(res);
    },
    onSuccess: (payload) => {
      invalidateUsersArea();
      setInviteModalOpen(false);
      setInviteForm({ fullName: "", email: "", departmentId: "", roleId: "", personalMessage: "" });
      toast({
        title: "Invitation created",
        description: payload.emailSent ? "Invite email sent." : "Invite saved. Email service did not send.",
      });
    },
    onError: (error: Error) => toast({ title: "Could not invite user", description: error.message, variant: "destructive" }),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/admin/invitations/${invitationId}/resend`);
      return readJsonResponse<{ emailSent: boolean }>(res);
    },
    onSuccess: (payload) => {
      invalidateUsersArea();
      toast({ title: payload.emailSent ? "Invitation resent" : "Invitation refreshed without email delivery" });
    },
    onError: (error: Error) => toast({ title: "Could not resend invitation", description: error.message, variant: "destructive" }),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/admin/invitations/${invitationId}/revoke`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      invalidateUsersArea();
      toast({ title: "Invitation revoked" });
    },
    onError: (error: Error) => toast({ title: "Could not revoke invitation", description: error.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/status`, { isActive });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      invalidateUsersArea();
      toast({ title: "User status updated" });
    },
    onError: (error: Error) => toast({ title: "Could not update user", description: error.message, variant: "destructive" }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      const fullName = `${userForm.firstName} ${userForm.lastName}`.trim();
      const res = await apiRequest("PATCH", `/api/admin/users/${userForm.id}`, {
        fullName,
        email: userForm.email,
        roleId: userForm.roleId,
      });
      const response = await readJsonResponse(res);

      if (editingUser && editingUser.isActive !== (userForm.status === "active")) {
        await readJsonResponse(
          await apiRequest("PATCH", `/api/admin/users/${userForm.id}/status`, {
            isActive: userForm.status === "active",
          }),
        );
      }

      return response;
    },
    onSuccess: () => {
      invalidateUsersArea();
      setEditUserModalOpen(false);
      setEditingUser(null);
      toast({ title: "User updated" });
    },
    onError: (error: Error) => toast({ title: "Could not update user", description: error.message, variant: "destructive" }),
  });

  const staffUsers = staffUsersQuery.data || [];
  const invitations = invitationsQuery.data || [];
  const departments = departmentsQuery.data || [];
  const roles = rolesQuery.data || [];
  const permissions = permissionsQuery.data || [];

  const rolesByDepartment = useMemo(() => {
    const map = new Map<string, HierarchicalRole[]>();
    for (const department of departments) {
      map.set(
        department.id,
        roles
          .filter((role) => role.departmentId === department.id)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
      );
    }
    return map;
  }, [departments, roles]);

  const mergedRows = useMemo<MergedUserRow[]>(
    () => [
      ...staffUsers,
      ...invitations.filter((invitation) => invitation.status === "pending"),
    ],
    [staffUsers, invitations],
  );

  const filteredAllUserRows = useMemo(() => {
    return mergedRows
      .filter((row) => {
        if (statusFilter !== "all" && row.status !== statusFilter) {
          return false;
        }
        if (departmentFilter !== "all" && row.department?.id !== departmentFilter) {
          return false;
        }
        if (roleFilter !== "all" && row.role?.id !== roleFilter) {
          return false;
        }
        if (!search.trim()) {
          return true;
        }
        const needle = search.trim().toLowerCase();
        return [row.fullName, row.email, row.department?.name || "", row.role?.name || ""]
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((left, right) => {
        const leftPending = left.kind === "invitation" ? 1 : 0;
        const rightPending = right.kind === "invitation" ? 1 : 0;
        if (leftPending !== rightPending) {
          return rightPending - leftPending;
        }
        return left.fullName.localeCompare(right.fullName);
      });
  }, [departmentFilter, mergedRows, roleFilter, search, statusFilter]);

  const filteredInviteRows = useMemo(() => {
    return invitations.filter((row) => {
      if (departmentFilter !== "all" && row.department?.id !== departmentFilter) {
        return false;
      }
      if (roleFilter !== "all" && row.role?.id !== roleFilter) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }
      const needle = search.trim().toLowerCase();
      return [row.fullName, row.email, row.department?.name || "", row.role?.name || ""]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [departmentFilter, invitations, roleFilter, search]);

  const stats = useMemo(() => {
    const activeUsers = staffUsers.filter((row) => row.isActive).length;
    const inactiveUsers = staffUsers.filter((row) => !row.isActive).length;
    const pendingInvites = invitations.filter((row) => row.status === "pending").length;
    return {
      totalUsers: staffUsers.length,
      activeUsers,
      inactiveUsers,
      pendingInvites,
    };
  }, [staffUsers, invitations]);

  const selectedInviteRole = roles.find((role) => role.id === inviteForm.roleId) || null;
  const selectedUserRole = roles.find((role) => role.id === userForm.roleId) || null;
  const viewUserDetail = userDetailQuery.data || null;
  const groupedViewPermissions = useMemo(
    () => groupedPermissions(viewUserDetail?.permissions || []),
    [viewUserDetail?.permissions],
  );
  const viewedRole =
    roles.find((role) => role.id === viewUserDetail?.row.role?.id) ||
    roles.find((role) => role.id === viewUser?.role?.id) ||
    null;

  const pageTitle =
    view === "roles"
      ? "Users - Roles & Permissions"
      : view === "invites"
        ? "Users - Pending Invites"
        : "Users - All";
  const pageDescription =
    view === "roles"
      ? "Define what each role can view, create, edit, or delete"
      : view === "invites"
        ? `${stats.pendingInvites} invites awaiting acceptance - resend or revoke as needed`
        : "Manage team members, roles, and access permissions across all departments";

  const openDepartmentModal = (department?: DepartmentSummary) => {
    if (!department) {
      setDepartmentForm({
        id: "",
        name: "",
        description: "",
        styleKey: `${INTERNAL_DEPARTMENT_STYLE_PRESETS[0].iconKey}:${INTERNAL_DEPARTMENT_STYLE_PRESETS[0].colorKey}`,
      });
    } else {
      setDepartmentForm({
        id: department.id,
        name: department.name,
        description: department.description || "",
        styleKey: `${department.iconKey}:${department.colorKey}`,
      });
    }
    setDepartmentModalOpen(true);
  };

  const openRoleModal = (department?: DepartmentSummary, role?: HierarchicalRole) => {
    if (role) {
      setRoleForm({
        id: role.id,
        name: role.name,
        departmentId: role.departmentId || department?.id || "",
        hierarchyLevel: role.hierarchyLevel || RoleHierarchyLevel.SPECIALIST,
        copyRoleId: "",
        description: role.description || "",
        permissionIds: getRolePermissions(role).map((permission) => permission.id),
      });
    } else {
      setRoleForm(createInitialRoleForm(department?.id || "", department?.slug || ""));
    }
    setRoleModalOpen(true);
  };

  const openInviteModal = () => {
    setInviteForm({ fullName: "", email: "", departmentId: "", roleId: "", personalMessage: "" });
    setInviteModalOpen(true);
  };

  const openEditUserModal = (user: StaffUserRow) => {
    const { firstName, lastName } = splitFullName(user.fullName);
    setEditingUser(user);
    setUserForm({
      id: user.id,
      firstName,
      lastName,
      email: user.email,
      departmentId: user.department?.id || "",
      roleId: user.role?.id || "",
      status: user.isActive ? "active" : "inactive",
      phone: "",
      internalNotes: "",
    });
    setEditUserModalOpen(true);
  };

  const availableRoleOptionsForDepartment = (departmentId: string) =>
    roles.filter((role) => role.departmentId === departmentId).sort((left, right) => left.sortOrder - right.sortOrder);

  useEffect(() => {
    if (!roleModalOpen || !roleForm.copyRoleId) return;
    const sourceRole = roles.find((role) => role.id === roleForm.copyRoleId);
    if (!sourceRole) return;
    setRoleForm((current) => ({
      ...current,
      permissionIds: getRolePermissions(sourceRole).map((permission) => permission.id),
    }));
  }, [roleForm.copyRoleId, roleModalOpen, roles]);

  const loading =
    staffUsersQuery.isLoading ||
    invitationsQuery.isLoading ||
    departmentsQuery.isLoading ||
    rolesQuery.isLoading ||
    permissionsQuery.isLoading;

  if (loading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading users..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-full bg-background text-foreground">
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold leading-tight">{pageTitle}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{pageDescription}</p>
            </div>
            {view === "roles" ? (
              <Button className="min-h-9 rounded-lg px-4" onClick={() => openDepartmentModal()}>
                <Plus className="mr-2 h-4 w-4" />
                New department
              </Button>
            ) : (
              <Button className="min-h-9 rounded-lg px-4" onClick={openInviteModal}>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite user
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {view === "all-users" ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: "TOTAL USERS", value: stats.totalUsers, sub: "Accepted staff accounts" },
                  { label: "ACTIVE", value: stats.activeUsers, sub: `${stats.totalUsers ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}% of staff`, accent: "text-emerald-600" },
                  { label: "PENDING ACTIVATION", value: stats.pendingInvites, sub: "Invites sent", accent: "text-amber-600" },
                  { label: "INACTIVE", value: stats.inactiveUsers, sub: "Deactivated accounts", accent: "text-muted-foreground" },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">{card.label}</div>
                    <div className={cn("mt-3 text-3xl font-semibold leading-none", card.accent)}>{card.value}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{card.sub}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    {[
                      { value: "all", label: "All" },
                      { value: "active", label: "Active" },
                      { value: "pending", label: "Pending" },
                      { value: "inactive", label: "Inactive" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStatusFilter(option.value)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium",
                          statusFilter === option.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}

                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="h-9 w-[220px] rounded-lg border-border bg-background text-sm">
                        <SelectValue placeholder="All departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="h-9 w-[220px] rounded-lg border-border bg-background text-sm">
                        <SelectValue placeholder="All roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All roles</SelectItem>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative w-full max-w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name or email..."
                      className="h-9 rounded-lg border-border bg-background pl-9 text-sm"
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-border">
                  <Table>
                    <TableHeader className="bg-card">
                      <TableRow className="hover:bg-card">
                        <TableHead className="h-11 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">USER</TableHead>
                        <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">DEPARTMENT</TableHead>
                        <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">ROLE</TableHead>
                        <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">STATUS</TableHead>
                        <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">LAST LOGIN</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">ACTIONS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-card">
                      {filteredAllUserRows.map((row) => {
                        const tone = getDepartmentTone(row.department);
                        return (
                          <TableRow key={`${row.kind}-${row.id}`} className="hover:bg-muted/40">
                            <TableCell className="py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white", row.kind === "invitation" ? "bg-amber-500" : "bg-primary")}>
                                  {getInitials(row.fullName)}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-foreground">{row.fullName}</div>
                                  <div className="text-sm text-muted-foreground">{row.email}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {row.department ? (
                                <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tone.bg)}>
                                  {row.department.name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-foreground">{row.role?.name || "-"}</TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                                  row.status === "active"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                                    : row.status === "pending"
                                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                                      : "border-border bg-muted text-muted-foreground",
                                )}
                              >
                                {row.status === "pending" ? "Pending" : row.status === "active" ? "Active" : "Inactive"}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.kind === "invitation" ? "Pending" : formatRelativeTime(row.lastLoginAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {row.kind === "user" ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 rounded-lg border-border"
                                      onClick={() => openEditUserModal(row)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 rounded-lg border-border"
                                      onClick={() => setViewUser(row)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "min-h-9 rounded-lg px-3.5 text-sm",
                                        row.isActive
                                          ? "border-rose-200 text-rose-600"
                                          : "border-emerald-200 text-emerald-600",
                                      )}
                                      onClick={() => updateStatusMutation.mutate({ userId: row.id, isActive: !row.isActive })}
                                    >
                                      {row.isActive ? "Deactivate" : "Activate"}
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    className="min-h-9 rounded-lg border-blue-200 px-3.5 text-sm font-medium text-blue-600 dark:border-blue-500/40 dark:text-blue-200"
                                    onClick={() => resendInviteMutation.mutate(row.id)}
                                  >
                                    Resend
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          ) : null}

          {view === "roles" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold leading-tight">Roles & Permissions</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Hierarchical roles per department - Manager - Team Lead - Specialist / Officer - Agent
                </p>
              </div>

              <Accordion
                type="single"
                collapsible
                value={expandedDepartmentId}
                onValueChange={(value) => setExpandedDepartmentId(value)}
                className="space-y-4"
              >
                {departments.map((department) => {
                  const departmentRoles = rolesByDepartment.get(department.id) || [];
                  const Icon = getDepartmentIcon(department);
                  const tone = getDepartmentTone(department);
                  const activeTab = departmentTabs[department.id] || "overview";
                  const permissionUniverse = groupedPermissions(
                    departmentRoles.flatMap((role) => getRolePermissions(role)).filter(
                      (permission, index, collection) => collection.findIndex((item) => item.id === permission.id) === index,
                    ),
                  );

                  return (
                    <AccordionItem
                      key={department.id}
                      value={department.id}
                      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex w-full items-center gap-4">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", tone.icon)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="text-xl font-semibold text-foreground">{department.name}</div>
                            <div className="text-sm text-muted-foreground">{department.roleCount} roles - {department.userCount} users</div>
                            <div className="hidden flex-wrap gap-2 md:flex">
                              {departmentRoles.map((role) => (
                                <span
                                  key={role.id}
                                  className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", scopeChip(roleScopeLabel(role, "shipments")))}
                                >
                                  {getHierarchyLabel(role.hierarchyLevel)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="mr-3 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-9 rounded-lg border-border px-3.5 text-sm"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openRoleModal(department);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              New role
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-9 rounded-lg border-border px-3.5 text-sm"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openDepartmentModal(department);
                              }}
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="border-t border-border pb-0">
                        <Tabs
                          value={activeTab}
                          onValueChange={(value) => setDepartmentTabs((current) => ({ ...current, [department.id]: value }))}
                        >
                          <TabsList className="h-auto w-full justify-start rounded-none bg-transparent px-4 pt-2">
                            <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground">
                              Overview
                            </TabsTrigger>
                            <TabsTrigger value="data-scope" className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground">
                              Data scope
                            </TabsTrigger>
                            <TabsTrigger value="permissions" className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground">
                              Permissions
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="overview" className="m-0 border-t border-border p-4">
                            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                              {departmentRoles.map((role) => (
                                <div key={role.id} className="rounded-xl border border-border p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", scopeChip(roleScopeLabel(role, "shipments")))}>
                                      {getHierarchyLabel(role.hierarchyLevel)}
                                    </span>
                                    <Button variant="outline" size="sm" className="h-8 rounded-lg border-border px-3" onClick={() => openRoleModal(department, role)}>
                                      Edit
                                    </Button>
                                  </div>
                                  <div className="mt-3 text-lg font-semibold text-foreground">{role.name}</div>
                                  <p className="mt-2 min-h-[42px] text-sm leading-6 text-muted-foreground">
                                    {role.description || buildRoleSummary(role)}
                                  </p>
                                  <div className="mt-4 space-y-3">
                                    {[
                                      { key: "shipments" as const, label: "Shipments" },
                                      { key: "clients" as const, label: "Clients" },
                                      { key: "reports" as const, label: "Reports" },
                                    ].map((resource) => {
                                      const scope = roleScopeLabel(role, resource.key);
                                      return (
                                        <div key={resource.key} className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
                                          <span className="text-sm text-muted-foreground">{resource.label}</span>
                                          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", scopeChip(scope))}>
                                            {scope}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TabsContent>

                          <TabsContent value="data-scope" className="m-0 border-t border-border p-0">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-card">
                                    <TableHead className="px-5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">DATA</TableHead>
                                    {departmentRoles.map((role) => (
                                      <TableHead key={role.id} className="text-center text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">
                                        <div className="text-base font-semibold text-foreground">{getHierarchyLabel(role.hierarchyLevel)}</div>
                                        <div className="text-xs text-muted-foreground">{role.name}</div>
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {[
                                    { key: "shipments" as const, label: "Shipments" },
                                    { key: "clients" as const, label: "Clients" },
                                    { key: "reports" as const, label: "Reports" },
                                  ].map((resource) => (
                                    <TableRow key={resource.key} className="hover:bg-muted/40">
                                      <TableCell className="px-5 text-sm font-semibold text-foreground">{resource.label}</TableCell>
                                      {departmentRoles.map((role) => {
                                        const scope = roleScopeLabel(role, resource.key);
                                        return (
                                          <TableCell key={role.id} className="text-center">
                                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", scopeChip(scope))}>
                                              {scope}
                                            </span>
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TabsContent>

                          <TabsContent value="permissions" className="m-0 border-t border-border p-0">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-card">
                                    <TableHead className="px-5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">PERMISSION</TableHead>
                                    {departmentRoles.map((role) => (
                                      <TableHead key={role.id} className="text-center text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">
                                        <div className="text-base font-semibold text-foreground">{getHierarchyLabel(role.hierarchyLevel)}</div>
                                        <div className="text-xs text-muted-foreground">{role.name}</div>
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {permissionUniverse.map((group) => (
                                    <Fragment key={`${department.id}-${group.group}`}>
                                      <TableRow key={`${department.id}-${group.group}-label`} className="bg-muted/40 hover:bg-muted/40">
                                        <TableCell className="px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                          {group.group}
                                        </TableCell>
                                        {departmentRoles.map((role) => (
                                          <TableCell key={`${group.group}-${role.id}`} />
                                        ))}
                                      </TableRow>
                                      {group.permissions.map((permission) => (
                                        <TableRow key={permission.id} className="hover:bg-muted/40">
                                          <TableCell className="px-5 text-sm text-foreground">{permissionLabel(permission)}</TableCell>
                                          {departmentRoles.map((role) => {
                                            const hasPermission = getRolePermissions(role).some((item) => item.id === permission.id);
                                            return (
                                              <TableCell key={`${permission.id}-${role.id}`} className="text-center text-base font-semibold text-primary">
                                                {hasPermission ? "✓" : <span className="text-muted-foreground/40">-</span>}
                                              </TableCell>
                                            );
                                          })}
                                        </TableRow>
                                      ))}
                                    </Fragment>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          ) : null}

          {view === "invites" ? (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xl font-semibold text-foreground">Pending Invites</div>
                  <div className="mt-1.5 text-sm text-muted-foreground">{stats.pendingInvites} invites awaiting acceptance - resend or revoke as needed</div>
                </div>
                <div className="flex w-full max-w-[320px] items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search email..."
                      className="h-9 rounded-lg border-border bg-background pl-9 text-sm"
                    />
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-card">
                    <TableHead className="px-5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">EMAIL</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">DEPARTMENT</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">ROLE</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">SENT</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInviteRows.map((row) => {
                    const tone = getDepartmentTone(row.department);
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/40">
                        <TableCell className="px-5 text-sm font-semibold text-foreground">{row.email}</TableCell>
                        <TableCell>
                          {row.department ? (
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tone.bg)}>
                              {row.department.name}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{row.role?.name || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateLabel(row.sentAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              className="min-h-9 rounded-lg border-blue-200 px-3.5 text-sm font-medium text-blue-600 dark:border-blue-500/40 dark:text-blue-200"
                              onClick={() => resendInviteMutation.mutate(row.id)}
                            >
                              Resend
                            </Button>
                            <Button
                              variant="outline"
                              className="min-h-9 rounded-lg border-rose-200 px-3.5 text-sm font-medium text-rose-600 dark:border-rose-500/40 dark:text-rose-200"
                              onClick={() => revokeInviteMutation.mutate(row.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>

        <Dialog open={departmentModalOpen} onOpenChange={setDepartmentModalOpen}>
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>{departmentForm.id ? "Edit department" : "Create new department"}</DialogTitle>
              <DialogDescription>Configure a department name, description, and curated style preset.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">DEPARTMENT NAME</div>
                <Input value={departmentForm.name} onChange={(event) => setDepartmentForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Compliance" />
              </div>
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">DESCRIPTION</div>
                <Textarea value={departmentForm.description} onChange={(event) => setDepartmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe this department..." />
              </div>
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">STYLE PRESET</div>
                <Select value={departmentForm.styleKey} onValueChange={(value) => setDepartmentForm((current) => ({ ...current, styleKey: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERNAL_DEPARTMENT_STYLE_PRESETS.map((preset) => (
                      <SelectItem key={`${preset.iconKey}:${preset.colorKey}`} value={`${preset.iconKey}:${preset.colorKey}`}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDepartmentModalOpen(false)}>Cancel</Button>
              <Button onClick={() => createDepartmentMutation.mutate()} disabled={createDepartmentMutation.isPending}>
                {departmentForm.id ? "Save department" : "Create department"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
          <DialogContent className="max-w-4xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>{roleForm.id ? "Edit role" : "Create new role"}</DialogTitle>
              <DialogDescription>Define a role and set its permissions across the department.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">ROLE NAME</div>
                  <Input value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Warehouse Officer" />
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">DEPARTMENT</div>
                  <Select
                    value={roleForm.departmentId}
                    onValueChange={(value) => {
                      const selectedDepartment = departments.find((department) => department.id === value);
                      setRoleForm((current) => ({
                        ...current,
                        departmentId: value,
                        hierarchyLevel:
                          selectedDepartment?.slug === InternalDepartmentSlug.PLATFORM
                            ? RoleHierarchyLevel.PLATFORM_ADMIN
                            : current.hierarchyLevel === RoleHierarchyLevel.PLATFORM_ADMIN
                              ? RoleHierarchyLevel.SPECIALIST
                              : current.hierarchyLevel,
                        copyRoleId: "",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">HIERARCHY LEVEL</div>
                  <Select
                    value={roleForm.hierarchyLevel}
                    onValueChange={(value) => setRoleForm((current) => ({ ...current, hierarchyLevel: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {(departments.find((department) => department.id === roleForm.departmentId)?.slug === InternalDepartmentSlug.PLATFORM
                        ? PLATFORM_HIERARCHY_OPTIONS
                        : HIERARCHY_OPTIONS
                      ).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">COPY PERMISSIONS FROM</div>
                  <Select value={roleForm.copyRoleId || "__none"} onValueChange={(value) => setRoleForm((current) => ({ ...current, copyRoleId: value === "__none" ? "" : value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Start from scratch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Start from scratch</SelectItem>
                      {roles
                        .filter((role) => role.id !== roleForm.id)
                        .map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">DESCRIPTION</div>
                <Textarea value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe this role's responsibilities..." />
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">PERMISSIONS</div>
                <ScrollArea className="h-[340px] rounded-xl border border-border">
                  <div className="space-y-4 p-4">
                    {groupedPermissions(permissions).map((group) => (
                      <div key={group.group} className="rounded-xl border border-border">
                        <div className="border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {group.group}
                        </div>
                        <div className="space-y-3 p-4">
                          {group.permissions.map((permission) => {
                            const checked = roleForm.permissionIds.includes(permission.id);
                            return (
                              <label key={permission.id} className="flex items-center gap-3 text-sm text-foreground">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) =>
                                    setRoleForm((current) => ({
                                      ...current,
                                      permissionIds: next
                                        ? [...current.permissionIds, permission.id]
                                        : current.permissionIds.filter((id) => id !== permission.id),
                                    }))
                                  }
                                />
                                <span>{permissionLabel(permission)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleModalOpen(false)}>Cancel</Button>
              <Button onClick={() => saveRoleMutation.mutate()} disabled={saveRoleMutation.isPending}>
                {roleForm.id ? "Save role" : "Create role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>Invite a new user</DialogTitle>
              <DialogDescription>An email will be sent with a secure link to set up their account.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">FULL NAME</div>
                <Input value={inviteForm.fullName} onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="e.g. Sara Al-Omari" />
              </div>
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">EMAIL ADDRESS</div>
                <Input value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="sara@ezhalha.sa" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">DEPARTMENT</div>
                  <Select
                    value={inviteForm.departmentId}
                    onValueChange={(value) => setInviteForm((current) => ({ ...current, departmentId: value, roleId: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">ROLE</div>
                  <Select value={inviteForm.roleId} onValueChange={(value) => setInviteForm((current) => ({ ...current, roleId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={inviteForm.departmentId ? "Select role" : "Select department first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoleOptionsForDepartment(inviteForm.departmentId).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">PERSONAL MESSAGE</div>
                <Textarea value={inviteForm.personalMessage} onChange={(event) => setInviteForm((current) => ({ ...current, personalMessage: event.target.value }))} placeholder="Add a personal note to the invite email..." />
              </div>
              {selectedInviteRole ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">
                  <span className={cn("mr-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", scopeChip(roleScopeLabel(selectedInviteRole, "shipments")))}>
                    {getHierarchyLabel(selectedInviteRole.hierarchyLevel)}
                  </span>
                  <strong>{selectedInviteRole.name}</strong> - {selectedInviteRole.description || buildRoleSummary(selectedInviteRole)}
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
              <Button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />
                Send invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editUserModalOpen}
          onOpenChange={(open) => {
            setEditUserModalOpen(open);
            if (!open) {
              setEditingUser(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl rounded-2xl p-0">
            <DialogHeader>
              <div className="border-b border-border px-7 py-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {getInitials(`${userForm.firstName} ${userForm.lastName}`.trim() || editingUser?.fullName || "")}
                  </div>
                  <div>
                    <DialogTitle className="text-2xl leading-none">
                      {`${userForm.firstName} ${userForm.lastName}`.trim() || editingUser?.fullName || "Edit user"}
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-sm">
                      {userForm.email || "Update the staff member identity and assigned position."}
                    </DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <div className="grid gap-5 px-7 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">FIRST NAME</div>
                  <Input value={userForm.firstName} onChange={(event) => setUserForm((current) => ({ ...current, firstName: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">LAST NAME</div>
                  <Input value={userForm.lastName} onChange={(event) => setUserForm((current) => ({ ...current, lastName: event.target.value }))} />
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">EMAIL ADDRESS</div>
                <Input value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">DEPARTMENT</div>
                  <Select
                    value={userForm.departmentId}
                    onValueChange={(value) => setUserForm((current) => ({ ...current, departmentId: value, roleId: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">ROLE</div>
                  <Select value={userForm.roleId} onValueChange={(value) => setUserForm((current) => ({ ...current, roleId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoleOptionsForDepartment(userForm.departmentId).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">STATUS</div>
                  <Select value={userForm.status} onValueChange={(value: "active" | "inactive") => setUserForm((current) => ({ ...current, status: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">PHONE</div>
                  <Input value={userForm.phone} placeholder="+966 5x xxx xxxx" disabled />
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">INTERNAL NOTES (admin only)</div>
                <Textarea value={userForm.internalNotes} placeholder="Notes about this user..." disabled />
              </div>
              {selectedUserRole ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">
                  <span className={cn("mr-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", scopeChip(roleScopeLabel(selectedUserRole, "shipments")))}>
                    {getHierarchyLabel(selectedUserRole.hierarchyLevel)}
                  </span>
                  <strong>{selectedUserRole.name}</strong> - {selectedUserRole.description || buildRoleSummary(selectedUserRole)}
                </div>
              ) : null}

              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-rose-700 dark:text-rose-200">Danger zone</div>
                    <div className="mt-1 text-sm text-rose-600/80 dark:text-rose-200/80">Permanently deactivate or remove this user.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="border-rose-200 text-rose-600 dark:border-rose-500/30 dark:text-rose-200"
                      onClick={() =>
                        updateStatusMutation.mutate(
                          { userId: userForm.id, isActive: userForm.status !== "active" },
                          {
                            onSuccess: () => {
                              setEditUserModalOpen(false);
                              setEditingUser(null);
                            },
                          },
                        )
                      }
                    >
                      {userForm.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="outline" className="border-rose-200 text-rose-600 dark:border-rose-500/30 dark:text-rose-200" disabled>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="border-t border-border px-7 py-4">
              <Button variant="outline" onClick={() => { setEditUserModalOpen(false); setEditingUser(null); }}>Cancel</Button>
              <Button onClick={() => updateUserMutation.mutate()} disabled={updateUserMutation.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={Boolean(viewUser)} onOpenChange={(open) => !open && setViewUser(null)}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-[460px]">
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border px-6 py-5">
                <SheetTitle className="text-2xl">User profile</SheetTitle>
                <SheetDescription className="sr-only">Internal staff profile summary.</SheetDescription>
              </SheetHeader>

              <ScrollArea className="flex-1">
                {viewUser ? (
                  <div className="space-y-6 px-6 py-6">
                    <div className="flex flex-col items-center border-b border-border pb-6 text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-3xl font-semibold text-primary-foreground">
                        {getInitials(viewUser.fullName)}
                      </div>
                      <div className="mt-4 text-2xl font-semibold leading-none text-foreground">{viewUser.fullName}</div>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {viewedRole ? (
                          <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", scopeChip(roleScopeLabel(viewedRole, "shipments")))}>
                            {getHierarchyLabel(viewedRole.hierarchyLevel)}
                          </span>
                        ) : null}
                        {viewUser.department ? (
                          <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", getDepartmentTone(viewUser.department).bg)}>
                            {viewUser.department.name}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">{viewUser.email}</div>
                    </div>

                    {userDetailQuery.isLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading profile...
                      </div>
                    ) : viewUserDetail ? (
                      <>
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <TriangleAlert className="h-4 w-4 text-primary" />
                            Account details
                          </div>
                          <div className="space-y-0.5 rounded-xl border border-border bg-card">
                            {[
                              { label: "Role", value: viewUserDetail.row.role?.name || "-" },
                              { label: "Status", value: userForm.id === viewUserDetail.row.id ? userForm.status[0].toUpperCase() + userForm.status.slice(1) : (viewUserDetail.row.status[0].toUpperCase() + viewUserDetail.row.status.slice(1)) },
                              { label: "Last login", value: formatRelativeTime(viewUserDetail.row.lastLoginAt) },
                              { label: "Phone", value: viewUserDetail.phone || "-" },
                              { label: "Email", value: viewUserDetail.row.email },
                            ].map((item) => (
                              <div key={item.label} className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0">
                                <div className="text-sm text-muted-foreground">{item.label}</div>
                                <div className="text-right text-sm font-semibold text-foreground">{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Shield className="h-4 w-4 text-primary" />
                            Permissions summary
                          </div>
                          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                            {groupedViewPermissions.map((group) => (
                              <div key={group.group}>
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.group}</div>
                                <div className="mt-3 space-y-2">
                                  {group.permissions.map((permission) => (
                                    <div key={permission.id} className="flex items-start gap-3 text-sm text-foreground">
                                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                      <span>{permissionLabel(permission)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Activity className="h-4 w-4 text-primary" />
                            Activity
                          </div>
                          <div className="rounded-xl border border-border bg-card px-5">
                            {viewUserDetail.activity.length > 0 ? (
                              viewUserDetail.activity.map((item, index) => {
                                const meta = getActivityMeta(item.action);
                                const Icon = meta.Icon;
                                return (
                                  <div
                                    key={item.id}
                                    className={cn(
                                      "flex gap-3 py-4",
                                      index < viewUserDetail.activity.length - 1 && "border-b border-border",
                                    )}
                                  >
                                    <div className={cn("mt-1 flex h-6 w-6 items-center justify-center rounded-full text-white", meta.tone)}>
                                      <Icon className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                                      {item.details ? (
                                        <div className="mt-1 text-sm text-muted-foreground">{item.details}</div>
                                      ) : null}
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        {formatDateLabel(item.createdAt)} - {formatRelativeTime(item.createdAt)}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="py-4 text-sm text-muted-foreground">No activity yet.</div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                        Could not load user profile.
                      </div>
                    )}
                  </div>
                ) : null}
              </ScrollArea>

              <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-between sm:space-x-0">
                <Button
                  className="w-full sm:flex-1"
                  onClick={() => {
                    if (!viewUser) return;
                    const target = viewUser;
                    setViewUser(null);
                    openEditUserModal(target);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit user
                </Button>
                <Button variant="outline" onClick={() => setViewUser(null)}>
                  Close
                </Button>
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AdminLayout>
  );
}
