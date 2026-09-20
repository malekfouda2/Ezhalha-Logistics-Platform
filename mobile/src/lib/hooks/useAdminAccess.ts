import { useQuery } from "@tanstack/react-query";

import { adminAccessService, type AdminAccess } from "@/lib/services/adminAccess";
import { useCurrentUser } from "@/lib/hooks/useAuth";

export const adminAccessKeys = {
  access: ["/api/admin/me/access"] as const,
};

/**
 * Mirrors the web admin panel's `useAdminAccess` (client/src/hooks/use-admin-access.ts):
 * same endpoint, same permission-check helpers, so the mobile nav/drawer gates access the
 * exact way the web sidebar does.
 */
export function useAdminAccess() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.userType === "admin";

  const { data, isLoading } = useQuery<AdminAccess>({
    queryKey: adminAccessKeys.access,
    queryFn: adminAccessService.get,
    enabled: isAdmin,
  });

  const permissions = data?.permissions ?? [];

  const hasPermissionName = (permissionName: string) => permissions.includes(permissionName);
  const hasPermission = (resource: string, action: string) => hasPermissionName(`${resource}:${action}`);
  const hasAnyPermission = (permissionNames: string[]) => permissionNames.some(hasPermissionName);
  const hasAllPermissions = (permissionNames: string[]) => permissionNames.every(hasPermissionName);

  return {
    user,
    isAdmin,
    permissions,
    isAccountManager: data?.isAccountManager ?? false,
    managedClientIds: data?.managedClientIds ?? [],
    role: data?.role ?? null,
    isLoading: isAdmin ? isLoading : false,
    hasPermissionName,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
