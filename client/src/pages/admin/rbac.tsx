import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, readJsonResponse } from "@/lib/queryClient";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { Plus, Shield, Key, Trash2, Settings2, Users, UserPlus } from "lucide-react";
import {
  ACCOUNT_MANAGER_SYSTEM_ROLE_ID,
  type Permission,
  type Role,
} from "@shared/schema";
import { format } from "date-fns";

interface RoleWithPermissions extends Role {
  permissions?: Permission[];
}

interface AssignedClientSummary {
  id: string;
  accountNumber: string;
  name: string;
  profile: string;
  isActive: boolean;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  userType: "admin";
  isActive: boolean;
  isAccountManager: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
  assignedClients?: AssignedClientSummary[];
}

interface ClientListResponse {
  clients: AssignedClientSummary[];
}

export default function AdminRBAC() {
  const adminAccess = useAdminAccess();
  const [activeTab, setActiveTab] = useState("roles");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newPermResource, setNewPermResource] = useState("");
  const [newPermAction, setNewPermAction] = useState("");
  const [newPermDescription, setNewPermDescription] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRoleIds, setNewAdminRoleIds] = useState<string[]>([]);
  const [newAdminAccountManagerClientIds, setNewAdminAccountManagerClientIds] = useState<string[]>([]);
  const [newAdminIsActive, setNewAdminIsActive] = useState(true);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [assignPermDialogOpen, setAssignPermDialogOpen] = useState(false);
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminUser | null>(null);
  const [scopeClientIds, setScopeClientIds] = useState<string[]>([]);
  const { toast } = useToast();

  const canReadRoles = adminAccess.hasPermission("roles", "read");
  const canCreateRoles = adminAccess.hasPermission("roles", "create");
  const canDeleteRoles = adminAccess.hasPermission("roles", "delete");
  const canReadPermissions = adminAccess.hasPermission("permissions", "read");
  const canCreatePermissions = adminAccess.hasPermission("permissions", "create");
  const canDeletePermissions = adminAccess.hasPermission("permissions", "delete");
  const canAssignPermissions = adminAccess.hasPermission("permissions", "assign");
  const canReadUsers = adminAccess.hasPermission("users", "read");
  const canCreateUsers = adminAccess.hasPermission("users", "create");
  const canAssignUserRoles = adminAccess.hasPermission("roles", "assign");
  const canReadClients = adminAccess.hasPermission("clients", "read");
  const canCreateAccountManagers = adminAccess.hasPermission("account-managers", "create");
  const canAssignAccountManagers = adminAccess.hasPermission("account-managers", "assign");

  const availableTabs = [
    canReadRoles ? "roles" : null,
    canReadPermissions ? "permissions" : null,
    canReadUsers ? "admin-users" : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    if (!availableTabs.includes(activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0]);
    }
  }, [activeTab, availableTabs]);

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: canReadRoles || canAssignUserRoles,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ["/api/admin/permissions"],
    enabled: canReadPermissions,
  });

  const { data: adminUsers, isLoading: adminUsersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: canReadUsers && activeTab === "admin-users",
  });

  const { data: availableClients } = useQuery<ClientListResponse>({
    queryKey: ["/api/admin/clients", "account-manager-options"],
    enabled:
      canReadClients &&
      ((canCreateUsers && canCreateAccountManagers) || canAssignAccountManagers),
    queryFn: async () => {
      const res = await fetch("/api/admin/clients?page=1&limit=1000", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch clients");
      }
      return readJsonResponse<ClientListResponse>(res);
    },
  });

  const { data: selectedRoleData, isLoading: selectedRoleLoading } = useQuery<RoleWithPermissions>({
    queryKey: ["/api/admin/roles", selectedRole?.id],
    enabled: !!selectedRole?.id && assignPermDialogOpen && canReadRoles && canReadPermissions,
  });

  const { data: selectedAdminUserRoles, isLoading: selectedAdminUserRolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/users", selectedAdminUser?.id, "roles"],
    enabled: !!selectedAdminUser?.id && assignRoleDialogOpen && canReadRoles && canAssignUserRoles,
  });

  const sortedRoles = [...(roles ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const activeRoles = sortedRoles.filter((role) => role.isActive);
  const availableClientOptions = availableClients?.clients ?? [];
  const isNewAdminAccountManager = newAdminRoleIds.includes(ACCOUNT_MANAGER_SYSTEM_ROLE_ID);
  const selectedAdminHasAccountManagerRole =
    selectedAdminUserRoles?.some((role) => role.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID) ?? false;

  const resetAdminUserForm = () => {
    setNewAdminUsername("");
    setNewAdminEmail("");
    setNewAdminPassword("");
    setNewAdminRoleIds([]);
    setNewAdminAccountManagerClientIds([]);
    setNewAdminIsActive(true);
  };

  const assignPermissionMutation = useMutation({
    mutationFn: async ({ roleId, permissionId }: { roleId: string; permissionId: string }) => {
      const res = await apiRequest("POST", `/api/admin/roles/${roleId}/permissions/${permissionId}`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles", selectedRole?.id] });
      toast({ title: "Permission assigned" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to assign permission", description: error.message, variant: "destructive" });
    },
  });

  const removePermissionMutation = useMutation({
    mutationFn: async ({ roleId, permissionId }: { roleId: string; permissionId: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/roles/${roleId}/permissions/${permissionId}`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles", selectedRole?.id] });
      toast({ title: "Permission removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove permission", description: error.message, variant: "destructive" });
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/admin/roles", data);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      setNewRoleName("");
      setNewRoleDescription("");
      setRoleDialogOpen(false);
      toast({ title: "Role created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create role", description: error.message, variant: "destructive" });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/roles/${roleId}`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      toast({ title: "Role deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete role", description: error.message, variant: "destructive" });
    },
  });

  const createPermissionMutation = useMutation({
    mutationFn: async (data: { resource: string; action: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/admin/permissions", data);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      setNewPermResource("");
      setNewPermAction("");
      setNewPermDescription("");
      setPermDialogOpen(false);
      toast({ title: "Permission created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create permission", description: error.message, variant: "destructive" });
    },
  });

  const deletePermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/permissions/${permissionId}`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      toast({ title: "Permission deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete permission", description: error.message, variant: "destructive" });
    },
  });

  const createAdminUserMutation = useMutation({
    mutationFn: async (data: {
      username: string;
      email: string;
      password: string;
      roleIds: string[];
      accountManagerClientIds: string[];
      isActive: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers"] });
      resetAdminUserForm();
      setUserDialogOpen(false);
      toast({ title: "Admin user created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create admin user", description: error.message, variant: "destructive" });
    },
  });

  const assignUserRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/roles/${roleId}`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedAdminUser?.id, "roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers"] });
      toast({ title: "Role assigned" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to assign role", description: error.message, variant: "destructive" });
    },
  });

  const removeUserRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}/roles/${roleId}`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedAdminUser?.id, "roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers"] });
      toast({ title: "Role removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove role", description: error.message, variant: "destructive" });
    },
  });

  const updateAccountManagerAssignmentsMutation = useMutation({
    mutationFn: async ({ userId, clientAccountIds }: { userId: string; clientAccountIds: string[] }) => {
      const res = await apiRequest("PUT", `/api/admin/account-managers/${userId}/clients`, {
        clientAccountIds,
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers"] });
      setScopeDialogOpen(false);
      setSelectedAdminUser(null);
      setScopeClientIds([]);
      toast({ title: "Assigned clients updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update assigned clients", description: error.message, variant: "destructive" });
    },
  });

  const handlePermissionToggle = (permissionId: string, isAssigned: boolean) => {
    if (!selectedRole) return;

    if (isAssigned) {
      removePermissionMutation.mutate({ roleId: selectedRole.id, permissionId });
    } else {
      assignPermissionMutation.mutate({ roleId: selectedRole.id, permissionId });
    }
  };

  const handleAdminRoleToggle = (roleId: string, isAssigned: boolean) => {
    if (!selectedAdminUser) return;

    if (isAssigned) {
      removeUserRoleMutation.mutate({ userId: selectedAdminUser.id, roleId });
    } else {
      assignUserRoleMutation.mutate({ userId: selectedAdminUser.id, roleId });
    }
  };

  const openAssignPermissionsDialog = (role: Role) => {
    setSelectedRole(role);
    setAssignPermDialogOpen(true);
  };

  const openAssignRolesDialog = (adminUser: AdminUser) => {
    setSelectedAdminUser(adminUser);
    setAssignRoleDialogOpen(true);
  };

  const openScopeDialog = (adminUser: AdminUser) => {
    setSelectedAdminUser(adminUser);
    setScopeClientIds(adminUser.assignedClients?.map((client) => client.id) ?? []);
    setScopeDialogOpen(true);
  };

  const toggleRoleSelection = (
    roleId: string,
    checked: boolean,
    setRoleIds: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setRoleIds((currentRoleIds) => {
      if (checked) {
        if (roleId === ACCOUNT_MANAGER_SYSTEM_ROLE_ID) {
          return [ACCOUNT_MANAGER_SYSTEM_ROLE_ID];
        }

        const nextRoleIds = currentRoleIds.filter((currentRoleId) => currentRoleId !== ACCOUNT_MANAGER_SYSTEM_ROLE_ID);
        return nextRoleIds.includes(roleId) ? nextRoleIds : [...nextRoleIds, roleId];
      }

      return currentRoleIds.filter((currentRoleId) => currentRoleId !== roleId);
    });
  };

  const toggleClientSelection = (
    clientId: string,
    checked: boolean,
    setClientIds: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setClientIds((currentClientIds) => {
      if (checked) {
        return currentClientIds.includes(clientId) ? currentClientIds : [...currentClientIds, clientId];
      }

      return currentClientIds.filter((currentClientId) => currentClientId !== clientId);
    });
  };

  const getPermissionsByResource = () => {
    if (!permissions) return {};
    return permissions.reduce((acc, perm) => {
      if (!acc[perm.resource]) acc[perm.resource] = [];
      acc[perm.resource].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);
  };

  const isPermissionAssigned = (permissionId: string) => {
    return selectedRoleData?.permissions?.some((permission) => permission.id === permissionId) || false;
  };

  const isUserRoleAssigned = (roleId: string) => {
    return selectedAdminUserRoles?.some((role) => role.id === roleId) || false;
  };

  const isSelectedRoleSystemRole = selectedRole?.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID;
  const selectedUserHasStandardRoles =
    selectedAdminUserRoles?.some((role) => role.id !== ACCOUNT_MANAGER_SYSTEM_ROLE_ID) ?? false;

  const togglePending = assignPermissionMutation.isPending || removePermissionMutation.isPending;
  const roleTogglePending = assignUserRoleMutation.isPending || removeUserRoleMutation.isPending;

  const isPageLoading =
    (canReadRoles && rolesLoading) ||
    (canReadPermissions && permissionsLoading) ||
    (canReadUsers && activeTab === "admin-users" && adminUsersLoading);

  if (isPageLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading access control settings..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Access Control (RBAC)</h1>
            <p className="text-muted-foreground">
              Manage roles, permissions, and admin access across the platform
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-sm">
              <Shield className="h-3 w-3 mr-1" />
              {canReadRoles ? roles?.length || 0 : 0} roles
            </Badge>
            <Badge variant="outline" className="text-sm">
              <Key className="h-3 w-3 mr-1" />
              {canReadPermissions ? permissions?.length || 0 : 0} permissions
            </Badge>
            <Badge variant="outline" className="text-sm">
              <Users className="h-3 w-3 mr-1" />
              {canReadUsers ? adminUsers?.length || 0 : 0} admin users
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {canReadRoles && (
              <TabsTrigger value="roles" data-testid="tab-roles">
                <Shield className="h-4 w-4 mr-2" />
                Roles
              </TabsTrigger>
            )}
            {canReadPermissions && (
              <TabsTrigger value="permissions" data-testid="tab-permissions">
                <Key className="h-4 w-4 mr-2" />
                Permissions
              </TabsTrigger>
            )}
            {canReadUsers && (
              <TabsTrigger value="admin-users" data-testid="tab-admin-users">
                <Users className="h-4 w-4 mr-2" />
                Admin Users
              </TabsTrigger>
            )}
          </TabsList>

          {canReadRoles && (
            <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <CardTitle className="text-lg">System Roles</CardTitle>
                {canCreateRoles && (
                  <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-role">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Role
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Role</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="roleName">Role Name</Label>
                          <Input
                            id="roleName"
                            placeholder="e.g., manager, supervisor"
                            value={newRoleName}
                            onChange={(e) => setNewRoleName(e.target.value)}
                            data-testid="input-role-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="roleDescription">Description</Label>
                          <Textarea
                            id="roleDescription"
                            placeholder="Brief description of this role"
                            value={newRoleDescription}
                            onChange={(e) => setNewRoleDescription(e.target.value)}
                            data-testid="input-role-description"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => createRoleMutation.mutate({ name: newRoleName, description: newRoleDescription || undefined })}
                          disabled={!newRoleName || createRoleMutation.isPending}
                          data-testid="button-create-role"
                        >
                          {createRoleMutation.isPending ? "Creating..." : "Create Role"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {roles && roles.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={role.id} data-testid={`row-role-${role.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{role.name}</Badge>
                              {role.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID && (
                                <Badge variant="secondary">System</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {role.description || "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {role.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID
                              ? "Built in"
                              : format(new Date(role.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {canAssignPermissions && canReadPermissions && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openAssignPermissionsDialog(role)}
                                  data-testid={`button-assign-permissions-${role.id}`}
                                >
                                  <Settings2 className="h-4 w-4" />
                                </Button>
                              )}
                              {canDeleteRoles && role.id !== ACCOUNT_MANAGER_SYSTEM_ROLE_ID && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteRoleMutation.mutate(role.id)}
                                  disabled={deleteRoleMutation.isPending}
                                  data-testid={`button-delete-role-${role.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No roles defined yet
                  </div>
                )}
              </CardContent>
            </Card>
            </TabsContent>
          )}

          {canReadPermissions && (
            <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <CardTitle className="text-lg">System Permissions</CardTitle>
                {canCreatePermissions && (
                  <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-permission">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Permission
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Permission</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="permResource">Resource</Label>
                          <Input
                            id="permResource"
                            placeholder="e.g., shipments, clients, invoices"
                            value={newPermResource}
                            onChange={(e) => setNewPermResource(e.target.value)}
                            data-testid="input-permission-resource"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="permAction">Action</Label>
                          <Input
                            id="permAction"
                            placeholder="e.g., create, read, update, delete"
                            value={newPermAction}
                            onChange={(e) => setNewPermAction(e.target.value)}
                            data-testid="input-permission-action"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="permDescription">Description</Label>
                          <Textarea
                            id="permDescription"
                            placeholder="Brief description of this permission"
                            value={newPermDescription}
                            onChange={(e) => setNewPermDescription(e.target.value)}
                            data-testid="input-permission-description"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => createPermissionMutation.mutate({
                            resource: newPermResource,
                            action: newPermAction,
                            description: newPermDescription || undefined,
                          })}
                          disabled={!newPermResource || !newPermAction || createPermissionMutation.isPending}
                          data-testid="button-create-permission"
                        >
                          {createPermissionMutation.isPending ? "Creating..." : "Create Permission"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {permissions && permissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resource</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {permissions.map((permission) => (
                        <TableRow key={permission.id} data-testid={`row-permission-${permission.id}`}>
                          <TableCell>
                            <Badge variant="outline">{permission.resource}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {permission.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {permission.description || "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(permission.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {canDeletePermissions && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deletePermissionMutation.mutate(permission.id)}
                                disabled={deletePermissionMutation.isPending}
                                data-testid={`button-delete-permission-${permission.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No permissions defined yet
                  </div>
                )}
              </CardContent>
            </Card>
            </TabsContent>
          )}

          {canReadUsers && (
            <TabsContent value="admin-users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <CardTitle className="text-lg">Admin Users</CardTitle>
                {canCreateUsers && (
                  <Dialog
                    open={userDialogOpen}
                    onOpenChange={(open) => {
                      setUserDialogOpen(open);
                      if (!open) {
                        resetAdminUserForm();
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-admin-user">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Admin User
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Create Admin User</DialogTitle>
                        <DialogDescription>
                          Create a staff admin account and assign the access it should use.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="adminUsername">Username</Label>
                          <Input
                            id="adminUsername"
                            placeholder="ops_manager"
                            value={newAdminUsername}
                            onChange={(e) => setNewAdminUsername(e.target.value)}
                            data-testid="input-admin-username"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="adminEmail">Email</Label>
                          <Input
                            id="adminEmail"
                            type="email"
                            placeholder="ops@example.com"
                            value={newAdminEmail}
                            onChange={(e) => setNewAdminEmail(e.target.value)}
                            data-testid="input-admin-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="adminPassword">Temporary Password</Label>
                          <Input
                            id="adminPassword"
                            type="password"
                            placeholder="At least 8 characters"
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            data-testid="input-admin-password"
                          />
                          <p className="text-xs text-muted-foreground">
                            The new admin will be required to change this password after signing in.
                          </p>
                        </div>
                        <div className="flex items-start gap-3 rounded-md border p-3">
                          <Checkbox
                            id="admin-active"
                            checked={newAdminIsActive}
                            onCheckedChange={(checked) => setNewAdminIsActive(checked === true)}
                            data-testid="checkbox-admin-active"
                          />
                          <div className="space-y-1">
                            <Label htmlFor="admin-active" className="cursor-pointer">
                              Active immediately
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Turn this off if you want to create the account now and activate it later.
                            </p>
                          </div>
                        </div>
                        {canAssignUserRoles && canReadRoles && (
                          <div className="space-y-2">
                            <Label>Assign Roles</Label>
                            {activeRoles.length > 0 ? (
                              <ScrollArea className="h-[220px] rounded-md border p-3">
                                <div className="space-y-3">
                                  {activeRoles.map((role) => {
                                    const isChecked = newAdminRoleIds.includes(role.id);
                                    const isSystemRole = role.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID;
                                    const hasStandardRolesSelected = newAdminRoleIds.some(
                                      (currentRoleId) => currentRoleId !== ACCOUNT_MANAGER_SYSTEM_ROLE_ID,
                                    );
                                    const disabled =
                                      createAdminUserMutation.isPending ||
                                      (isSystemRole && !canCreateAccountManagers) ||
                                      (isSystemRole
                                        ? hasStandardRolesSelected
                                        : isNewAdminAccountManager);

                                    return (
                                      <div key={role.id} className="flex items-start gap-3">
                                        <Checkbox
                                          id={`new-admin-role-${role.id}`}
                                          checked={isChecked}
                                          disabled={disabled}
                                          onCheckedChange={(checked) =>
                                            toggleRoleSelection(
                                              role.id,
                                              checked === true,
                                              setNewAdminRoleIds,
                                            )
                                          }
                                          data-testid={`checkbox-new-admin-role-${role.id}`}
                                        />
                                        <div className="grid gap-1 leading-none">
                                          <label
                                            htmlFor={`new-admin-role-${role.id}`}
                                            className="text-sm font-medium cursor-pointer"
                                          >
                                            {role.name}
                                          </label>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-xs text-muted-foreground">
                                              {role.description || "No description provided"}
                                            </p>
                                            {isSystemRole && (
                                              <Badge variant="secondary">Built in</Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </ScrollArea>
                            ) : (
                              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                No active roles are available yet. Create roles first, then assign them here.
                              </div>
                            )}
                          </div>
                        )}
                        {isNewAdminAccountManager && (
                          <div className="space-y-2">
                            <Label>Assigned Clients</Label>
                            <p className="text-xs text-muted-foreground">
                              Choose the client accounts this account manager can access.
                            </p>
                            {canReadClients ? (
                              availableClientOptions.length > 0 ? (
                                <ScrollArea className="h-[220px] rounded-md border p-3">
                                  <div className="space-y-3">
                                    {availableClientOptions.map((client) => {
                                      const isChecked = newAdminAccountManagerClientIds.includes(client.id);
                                      return (
                                        <div key={client.id} className="flex items-start gap-3">
                                          <Checkbox
                                            id={`new-admin-client-${client.id}`}
                                            checked={isChecked}
                                            onCheckedChange={(checked) =>
                                              toggleClientSelection(
                                                client.id,
                                                checked === true,
                                                setNewAdminAccountManagerClientIds,
                                              )
                                            }
                                            data-testid={`checkbox-new-admin-client-${client.id}`}
                                          />
                                          <div className="grid gap-1 leading-none">
                                            <label
                                              htmlFor={`new-admin-client-${client.id}`}
                                              className="text-sm font-medium cursor-pointer"
                                            >
                                              {client.name}
                                            </label>
                                            <p className="text-xs text-muted-foreground">
                                              {client.accountNumber} • {client.profile}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              ) : (
                                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                  No client accounts are available yet.
                                </div>
                              )
                            ) : (
                              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                Client access is required to assign account manager scope.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() =>
                            createAdminUserMutation.mutate({
                              username: newAdminUsername,
                              email: newAdminEmail,
                              password: newAdminPassword,
                              roleIds: canAssignUserRoles ? newAdminRoleIds : [],
                              accountManagerClientIds: isNewAdminAccountManager ? newAdminAccountManagerClientIds : [],
                              isActive: newAdminIsActive,
                            })
                          }
                          disabled={!newAdminUsername || !newAdminEmail || !newAdminPassword || createAdminUserMutation.isPending}
                          data-testid="button-create-admin-user"
                        >
                          {createAdminUserMutation.isPending ? "Creating..." : "Create Admin User"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {adminUsersLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading admin users...</div>
                ) : adminUsers && adminUsers.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminUsers.map((adminUser) => (
                        <TableRow key={adminUser.id} data-testid={`row-admin-user-${adminUser.id}`}>
                          <TableCell className="font-medium">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span>{adminUser.username}</span>
                              </div>
                              {adminUser.mustChangePassword && (
                                <div className="text-xs text-muted-foreground">
                                  Password change required
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{adminUser.email}</TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                              {adminUser.roles.length > 0 ? (
                                adminUser.roles.map((role) => (
                                  <Badge key={role.id} variant="outline">
                                    {role.name}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No roles assigned</span>
                              )}
                              </div>
                              {adminUser.isAccountManager && (
                                <div className="text-xs text-muted-foreground">
                                  {adminUser.assignedClients?.length || 0} assigned client(s)
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={adminUser.isActive ? "default" : "secondary"}>
                              {adminUser.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(adminUser.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              {canAssignUserRoles && canReadRoles && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openAssignRolesDialog(adminUser)}
                                  data-testid={`button-manage-admin-roles-${adminUser.id}`}
                                >
                                  <Settings2 className="h-4 w-4 mr-2" />
                                  Roles
                                </Button>
                              )}
                              {adminUser.isAccountManager && canAssignAccountManagers && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openScopeDialog(adminUser)}
                                  data-testid={`button-manage-admin-scope-${adminUser.id}`}
                                >
                                  <Users className="h-4 w-4 mr-2" />
                                  Clients
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No admin users created yet
                  </div>
                )}
              </CardContent>
            </Card>
            </TabsContent>
          )}
        </Tabs>

        {canAssignPermissions && canReadRoles && canReadPermissions && (
          <Dialog
            open={assignPermDialogOpen}
            onOpenChange={(open) => {
              setAssignPermDialogOpen(open);
              if (!open) {
                setSelectedRole(null);
              }
            }}
          >
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Assign Permissions to "{selectedRole?.name}"</DialogTitle>
                <DialogDescription>
                  {isSelectedRoleSystemRole
                    ? "This built-in role uses fixed permissions."
                    : "Select which permissions this role should have. Changes are saved automatically."}
                </DialogDescription>
              </DialogHeader>
              {selectedRoleLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading permissions...</div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-6">
                    {Object.entries(getPermissionsByResource()).map(([resource, perms]) => (
                      <div key={resource} className="space-y-3">
                        <h4 className="font-medium text-sm capitalize border-b pb-2">
                          {resource.replace(/-/g, " ")}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {perms.map((perm) => {
                            const isAssigned = isPermissionAssigned(perm.id);
                            return (
                              <div
                                key={perm.id}
                                className="flex items-start gap-3 p-2 rounded-md hover-elevate"
                              >
                                <Checkbox
                                  id={`perm-${perm.id}`}
                                  checked={isAssigned}
                                  onCheckedChange={() => handlePermissionToggle(perm.id, isAssigned)}
                                  disabled={togglePending || isSelectedRoleSystemRole}
                                  data-testid={`checkbox-permission-${perm.id}`}
                                />
                                <div className="grid gap-1 leading-none">
                                  <label
                                    htmlFor={`perm-${perm.id}`}
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    {perm.action}
                                  </label>
                                  {perm.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {perm.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAssignPermDialogOpen(false)}
                  data-testid="button-close-assign-permissions"
                >
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canAssignUserRoles && canReadRoles && (
          <Dialog
            open={assignRoleDialogOpen}
            onOpenChange={(open) => {
              setAssignRoleDialogOpen(open);
              if (!open) {
                setSelectedAdminUser(null);
              }
            }}
          >
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Assign Roles to "{selectedAdminUser?.username}"</DialogTitle>
                <DialogDescription>
                  Assign one or more standard roles, or use the built-in Account Manager role by itself.
                </DialogDescription>
              </DialogHeader>
              {selectedAdminUserRolesLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading roles...</div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  {sortedRoles.length > 0 ? (
                    <div className="space-y-3">
                      {sortedRoles.map((role) => {
                        const isAssigned = isUserRoleAssigned(role.id);
                        const isSystemRole = role.id === ACCOUNT_MANAGER_SYSTEM_ROLE_ID;
                        const disabled =
                          roleTogglePending ||
                          (!role.isActive && !isAssigned) ||
                          (isSystemRole && !canCreateAccountManagers && !isAssigned) ||
                          (isSystemRole
                            ? selectedUserHasStandardRoles && !isAssigned
                            : selectedAdminHasAccountManagerRole && !isAssigned);
                        return (
                          <div
                            key={role.id}
                            className="flex items-start gap-3 rounded-md border p-3"
                          >
                            <Checkbox
                              id={`user-role-${role.id}`}
                              checked={isAssigned}
                              onCheckedChange={() => handleAdminRoleToggle(role.id, isAssigned)}
                              disabled={disabled}
                              data-testid={`checkbox-admin-user-role-${role.id}`}
                            />
                            <div className="grid gap-1 leading-none">
                              <label
                                htmlFor={`user-role-${role.id}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {role.name}
                              </label>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-muted-foreground">
                                  {role.description || "No description provided"}
                                </p>
                                {isSystemRole && (
                                  <Badge variant="secondary">Built in</Badge>
                                )}
                                {!role.isActive && (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      No roles defined yet
                    </div>
                  )}
                </ScrollArea>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAssignRoleDialogOpen(false)}
                  data-testid="button-close-assign-roles"
                >
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canAssignAccountManagers && (
          <Dialog
            open={scopeDialogOpen}
            onOpenChange={(open) => {
              setScopeDialogOpen(open);
              if (!open) {
                setSelectedAdminUser(null);
                setScopeClientIds([]);
              }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Manage Assigned Clients</DialogTitle>
                <DialogDescription>
                  Update the client accounts that "{selectedAdminUser?.username}" can manage.
                </DialogDescription>
              </DialogHeader>
              {canReadClients ? (
                availableClientOptions.length > 0 ? (
                  <ScrollArea className="h-[360px] rounded-md border p-3">
                    <div className="space-y-3">
                      {availableClientOptions.map((client) => {
                        const isChecked = scopeClientIds.includes(client.id);
                        return (
                          <div key={client.id} className="flex items-start gap-3">
                            <Checkbox
                              id={`scope-client-${client.id}`}
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                toggleClientSelection(client.id, checked === true, setScopeClientIds)
                              }
                              data-testid={`checkbox-scope-client-${client.id}`}
                            />
                            <div className="grid gap-1 leading-none">
                              <label
                                htmlFor={`scope-client-${client.id}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {client.name}
                              </label>
                              <p className="text-xs text-muted-foreground">
                                {client.accountNumber} • {client.profile}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    No client accounts are available yet.
                  </div>
                )
              ) : (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  Client access is required to manage account manager assignments.
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setScopeDialogOpen(false)}
                  data-testid="button-close-scope-dialog"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedAdminUser) {
                      return;
                    }
                    updateAccountManagerAssignmentsMutation.mutate({
                      userId: selectedAdminUser.id,
                      clientAccountIds: scopeClientIds,
                    });
                  }}
                  disabled={!selectedAdminUser || updateAccountManagerAssignmentsMutation.isPending}
                  data-testid="button-save-account-manager-scope"
                >
                  {updateAccountManagerAssignmentsMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
}
