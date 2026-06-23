import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { readJsonResponse } from "@/lib/queryClient";

interface AdminAccessResponse {
  permissions: string[];
  isAccountManager: boolean;
  managedClientIds: string[];
}

export function useAdminAccess() {
  const { user } = useAuth();
  const isAdmin = user?.userType === "admin";
  // Internal staff (admin + operations) share the same RBAC permission set, so
  // both load their effective admin permissions to drive nav + route access.
  const isInternalStaff = user?.userType === "admin" || user?.userType === "operations";

  const { data, isLoading } = useQuery<AdminAccessResponse>({
    queryKey: ["/api/admin/me/access"],
    enabled: isInternalStaff,
    queryFn: async () => {
      const res = await fetch("/api/admin/me/access", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch admin access");
      }

      return readJsonResponse<AdminAccessResponse>(res);
    },
  });

  const permissions = data?.permissions || [];
  const isAccountManager = data?.isAccountManager || false;
  const managedClientIds = data?.managedClientIds || [];

  const hasPermissionName = (permissionName: string) => permissions.includes(permissionName);
  const hasPermission = (resource: string, action: string) => hasPermissionName(`${resource}:${action}`);
  const hasAnyPermission = (permissionNames: string[]) => permissionNames.some(hasPermissionName);
  const hasAllPermissions = (permissionNames: string[]) => permissionNames.every(hasPermissionName);

  return {
    permissions,
    isAdmin,
    isAccountManager,
    isInternalStaff,
    isLoading: isInternalStaff ? isLoading : false,
    managedClientIds,
    hasPermissionName,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
