import { useQuery } from "@tanstack/react-query";

import { adminStaffService, countPendingInvitations } from "@/lib/services/adminStaff";
import { adminTasksService } from "@/lib/services/adminTasks";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

/**
 * The live counts behind the More tab's "Staff" section (and the permissions
 * pill on the profile card) — each query only fires when the signed-in admin
 * actually holds the permission its endpoint requires.
 */
export function useAdminMoreSummary() {
  const { permissions, hasPermission } = useAdminAccess();

  const canReadAccountManagers = hasPermission("account-managers", "read");
  const canReadUsers = hasPermission("users", "read");
  const canReadRoles = hasPermission("roles", "read");
  const canReadPermissionsCatalog = hasPermission("permissions", "read");
  const canReadTasks = hasPermission("tasks", "read");

  const accountManagers = useQuery({
    queryKey: ["/api/admin/account-managers", "count"],
    queryFn: adminStaffService.listAccountManagers,
    enabled: canReadAccountManagers,
  });

  const users = useQuery({
    queryKey: ["/api/admin/users", "count"],
    queryFn: adminStaffService.listUsers,
    enabled: canReadUsers,
  });

  const invitations = useQuery({
    queryKey: ["/api/admin/invitations", "count"],
    queryFn: adminStaffService.listInvitations,
    enabled: canReadUsers,
  });

  const roles = useQuery({
    queryKey: ["/api/admin/roles", "count"],
    queryFn: adminStaffService.listRoles,
    enabled: canReadRoles,
  });

  const permissionsCatalog = useQuery({
    queryKey: ["/api/admin/permissions", "count"],
    queryFn: adminStaffService.listPermissionsCatalog,
    enabled: canReadPermissionsCatalog,
  });

  const myTasks = useQuery({
    queryKey: ["/api/tasks", "my", "pending-count"],
    queryFn: adminTasksService.myPendingCount,
    enabled: canReadTasks,
  });

  const permissionsCatalogCount = permissionsCatalog.data?.length;
  const hasAllPermissions =
    permissionsCatalogCount !== undefined && permissionsCatalogCount === permissions.length;

  return {
    canReadAccountManagers,
    canReadUsers,
    canReadAccessControl: canReadRoles || canReadPermissionsCatalog,
    canReadTasks,
    accountManagersCount: accountManagers.data?.length,
    staffCount: users.data?.length,
    pendingInvitesCount: invitations.data ? countPendingInvitations(invitations.data) : undefined,
    rolesCount: roles.data?.length,
    permissionsCatalogCount,
    hasAllPermissions,
    myTasksCount: myTasks.data,
  };
}
