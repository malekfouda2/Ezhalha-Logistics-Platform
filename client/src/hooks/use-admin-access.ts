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

  const { data, isLoading } = useQuery<AdminAccessResponse>({
    queryKey: ["/api/admin/me/access"],
    enabled: isAdmin,
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
    isLoading: isAdmin ? isLoading : false,
    managedClientIds,
    hasPermissionName,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
