import { useState } from "react";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Shield, Key, Trash2, Settings2 } from "lucide-react";
import type { Role, Permission } from "@shared/schema";
import { format } from "date-fns";

interface RoleWithPermissions extends Role {
  permissions?: Permission[];
}

export default function AdminRBAC() {
  const [activeTab, setActiveTab] = useState("roles");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newPermResource, setNewPermResource] = useState("");
  const [newPermAction, setNewPermAction] = useState("");
  const [newPermDescription, setNewPermDescription] = useState("");
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [assignPermDialogOpen, setAssignPermDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const { toast } = useToast();

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ["/api/admin/permissions"],
  });

  const { data: selectedRoleData, isLoading: selectedRoleLoading } = useQuery<RoleWithPermissions>({
    queryKey: ["/api/admin/roles", selectedRole?.id],
    enabled: !!selectedRole?.id && assignPermDialogOpen,
  });

  const assignPermissionMutation = useMutation({
    mutationFn: async ({ roleId, permissionId }: { roleId: string; permissionId: string }) => {
      const res = await apiRequest("POST", `/api/admin/roles/${roleId}/permissions/${permissionId}`);
      return res.json();
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
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles", selectedRole?.id] });
      toast({ title: "Permission removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove permission", description: error.message, variant: "destructive" });
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

  const openAssignPermissionsDialog = (role: Role) => {
    setSelectedRole(role);
    setAssignPermDialogOpen(true);
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
    return selectedRoleData?.permissions?.some(p => p.id === permissionId) || false;
  };

  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/admin/roles", data);
      return res.json();
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
      return res.json();
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
      return res.json();
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
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      toast({ title: "Permission deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete permission", description: error.message, variant: "destructive" });
    },
  });

  if (rolesLoading || permissionsLoading) {
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
              Manage roles and permissions for platform users
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              <Shield className="h-3 w-3 mr-1" />
              {roles?.length || 0} roles
            </Badge>
            <Badge variant="outline" className="text-sm">
              <Key className="h-3 w-3 mr-1" />
              {permissions?.length || 0} permissions
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="roles" data-testid="tab-roles">
              <Shield className="h-4 w-4 mr-2" />
              Roles
            </TabsTrigger>
            <TabsTrigger value="permissions" data-testid="tab-permissions">
              <Key className="h-4 w-4 mr-2" />
              Permissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <CardTitle className="text-lg">System Roles</CardTitle>
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
                            <Badge variant="outline">{role.name}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {role.description || "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(role.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openAssignPermissionsDialog(role)}
                                data-testid={`button-assign-permissions-${role.id}`}
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteRoleMutation.mutate(role.id)}
                                disabled={deleteRoleMutation.isPending}
                                data-testid={`button-delete-role-${role.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
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

          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <CardTitle className="text-lg">System Permissions</CardTitle>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deletePermissionMutation.mutate(permission.id)}
                              disabled={deletePermissionMutation.isPending}
                              data-testid={`button-delete-permission-${permission.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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
        </Tabs>

        <Dialog open={assignPermDialogOpen} onOpenChange={setAssignPermDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Assign Permissions to "{selectedRole?.name}"</DialogTitle>
              <DialogDescription>
                Select which permissions this role should have. Changes are saved automatically.
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
                          const isPending = assignPermissionMutation.isPending || removePermissionMutation.isPending;
                          return (
                            <div
                              key={perm.id}
                              className="flex items-start gap-3 p-2 rounded-md hover-elevate"
                            >
                              <Checkbox
                                id={`perm-${perm.id}`}
                                checked={isAssigned}
                                onCheckedChange={() => handlePermissionToggle(perm.id, isAssigned)}
                                disabled={isPending}
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
      </div>
    </AdminLayout>
  );
}
