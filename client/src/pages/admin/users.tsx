import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { ProfileBadge } from "@/components/profile-badge";
import { StatusBadge } from "@/components/status-badge";
import { AccountManagersPanel } from "@/pages/admin/account-managers";
import { AdminRBACPanel } from "@/pages/admin/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { readJsonResponse } from "@/lib/queryClient";
import { ACCOUNT_MANAGER_SYSTEM_ROLE_ID, type ClientAccount, type Role } from "@shared/schema";
import { Key, Shield, UserCog, Users } from "lucide-react";

interface AssignedAccountManagerSummary {
  id: string;
  username: string;
  email: string;
}

interface ClientListItem extends ClientAccount {
  assignedAccountManager?: AssignedAccountManagerSummary | null;
}

interface ClientListResponse {
  clients: ClientListItem[];
  total: number;
}

interface AdminUserSummary {
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
  assignedClients?: Array<Pick<ClientAccount, "id" | "accountNumber" | "name" | "profile" | "isActive">>;
}

function buildRoleTabValue(role: Role) {
  return `role-${role.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function AdminUsersTable({
  users,
  emptyMessage,
}: {
  users: AdminUserSummary[];
  emptyMessage: string;
}) {
  if (users.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id} data-testid={`row-admin-user-${user.id}`}>
            <TableCell>
              <div>
                <p className="font-medium">{user.username}</p>
                {user.mustChangePassword && (
                  <p className="text-xs text-muted-foreground">Password change required</p>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{user.email}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <Badge key={role.id} variant="outline">
                      {role.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No roles assigned</span>
                )}
              </div>
              {user.isAccountManager && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {user.assignedClients?.length || 0} assigned client(s)
                </p>
              )}
            </TableCell>
            <TableCell>
              <StatusBadge status={user.isActive ? "active" : "inactive"} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(user.createdAt), "MMM d, yyyy")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ClientsTable({ clients }: { clients: ClientListItem[] }) {
  if (clients.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No clients found.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Account Manager</TableHead>
          <TableHead>Pricing Profile</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) => (
          <TableRow key={client.id} data-testid={`row-client-user-${client.id}`}>
            <TableCell className="font-mono text-sm">{client.accountNumber}</TableCell>
            <TableCell>
              <div>
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-muted-foreground">{client.country}</p>
              </div>
            </TableCell>
            <TableCell>
              <div>
                <p className="text-sm">{client.email}</p>
                <p className="text-sm text-muted-foreground">{client.phone}</p>
              </div>
            </TableCell>
            <TableCell>
              {client.assignedAccountManager ? (
                <div>
                  <p className="text-sm font-medium">{client.assignedAccountManager.username}</p>
                  <p className="text-xs text-muted-foreground">{client.assignedAccountManager.email}</p>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              )}
            </TableCell>
            <TableCell>
              <ProfileBadge profile={client.profile} />
            </TableCell>
            <TableCell>
              <StatusBadge status={client.isActive ? "active" : "inactive"} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(client.createdAt), "MMM d, yyyy")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AdminUsers() {
  const adminAccess = useAdminAccess();
  const [activeTab, setActiveTab] = useState("clients");

  const canReadClients = adminAccess.hasPermission("clients", "read");
  const canReadAdminUsers = adminAccess.hasPermission("users", "read");
  const canReadRoles = adminAccess.hasPermission("roles", "read");
  const canReadPermissions = adminAccess.hasPermission("permissions", "read");
  const canReadAccountManagers = adminAccess.hasPermission("account-managers", "read");
  const canReadAccessControl = canReadRoles || canReadPermissions || canReadAdminUsers;

  const { data: clientsData, isLoading: clientsLoading } = useQuery<ClientListResponse>({
    queryKey: ["/api/admin/clients", "users-page"],
    enabled: canReadClients,
    queryFn: async () => {
      const res = await fetch("/api/admin/clients?page=1&limit=1000", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch clients");
      }
      return readJsonResponse<ClientListResponse>(res);
    },
  });

  const { data: adminUsers, isLoading: adminUsersLoading } = useQuery<AdminUserSummary[]>({
    queryKey: ["/api/admin/users"],
    enabled: canReadAdminUsers,
  });

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: canReadRoles,
  });

  const clients = clientsData?.clients || [];
  const allAdminUsers = adminUsers || [];
  const standardRoles = useMemo(
    () =>
      [...(roles || [])]
        .filter((role) => role.id !== ACCOUNT_MANAGER_SYSTEM_ROLE_ID)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roles],
  );

  const availableTabs = useMemo(() => {
    const tabs = [
      canReadClients ? "clients" : null,
      canReadAccountManagers ? "account-managers" : null,
      canReadAdminUsers ? "admins" : null,
      canReadAccessControl ? "access-control" : null,
      ...(canReadAdminUsers && canReadRoles ? standardRoles.map(buildRoleTabValue) : []),
    ].filter(Boolean) as string[];

    return tabs;
  }, [canReadClients, canReadAccountManagers, canReadAdminUsers, canReadAccessControl, canReadRoles, standardRoles]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0]);
    }
  }, [activeTab, availableTabs]);

  const isLoading =
    (canReadClients && clientsLoading) ||
    (canReadAdminUsers && adminUsersLoading) ||
    (canReadRoles && rolesLoading);

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading users..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-muted-foreground">
              Manage users, user types, roles, and permissions from one place.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canReadClients && (
              <Badge variant="outline" className="text-sm">
                <Users className="h-3 w-3 mr-1" />
                {clients.length} clients
              </Badge>
            )}
            {canReadAdminUsers && (
              <Badge variant="outline" className="text-sm">
                <Shield className="h-3 w-3 mr-1" />
                {allAdminUsers.length} admin users
              </Badge>
            )}
            {canReadRoles && (
              <Badge variant="outline" className="text-sm">
                <UserCog className="h-3 w-3 mr-1" />
                {standardRoles.length} roles
              </Badge>
            )}
            {canReadPermissions && (
              <Badge variant="outline" className="text-sm">
                <Key className="h-3 w-3 mr-1" />
                Permissions
              </Badge>
            )}
          </div>
        </div>

        {availableTabs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              You do not have permission to view user records.
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex h-auto flex-wrap justify-start">
              {canReadClients && (
                <TabsTrigger value="clients" data-testid="tab-users-clients">
                  Clients
                </TabsTrigger>
              )}
              {canReadAccountManagers && (
                <TabsTrigger value="account-managers" data-testid="tab-users-account-managers">
                  Account Managers
                </TabsTrigger>
              )}
              {canReadAdminUsers && (
                <TabsTrigger value="admins" data-testid="tab-users-admins">
                  Admins
                </TabsTrigger>
              )}
              {canReadAccessControl && (
                <TabsTrigger value="access-control" data-testid="tab-users-access-control">
                  Roles & Permissions
                </TabsTrigger>
              )}
              {canReadAdminUsers &&
                canReadRoles &&
                standardRoles.map((role) => (
                  <TabsTrigger key={role.id} value={buildRoleTabValue(role)} data-testid={`tab-users-role-${role.id}`}>
                    {role.name}
                  </TabsTrigger>
                ))}
            </TabsList>

            {canReadClients && (
              <TabsContent value="clients">
                <Card>
                  <CardHeader>
                    <CardTitle>Clients</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ClientsTable clients={clients} />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {canReadAccountManagers && (
              <TabsContent value="account-managers">
                <AccountManagersPanel embedded />
              </TabsContent>
            )}

            {canReadAdminUsers && (
              <TabsContent value="admins">
                <Card>
                  <CardHeader>
                    <CardTitle>Admins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <AdminUsersTable users={allAdminUsers} emptyMessage="No admin users found." />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {canReadAccessControl && (
              <TabsContent value="access-control">
                <AdminRBACPanel embedded showHeader={false} />
              </TabsContent>
            )}

            {canReadAdminUsers &&
              canReadRoles &&
              standardRoles.map((role) => {
                const roleUsers = allAdminUsers.filter((user) =>
                  user.roles.some((assignedRole) => assignedRole.id === role.id),
                );

                return (
                  <TabsContent key={role.id} value={buildRoleTabValue(role)}>
                    <Card>
                      <CardHeader>
                        <CardTitle>{role.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <AdminUsersTable
                          users={roleUsers}
                          emptyMessage={`No users are assigned to the ${role.name} role yet.`}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
