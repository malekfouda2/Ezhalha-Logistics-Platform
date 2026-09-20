import { api } from "@/api/client";

export interface AdminRoleRef {
  id: string;
  name: string;
  hierarchyLevel: string;
}

// Mirrors the web admin panel's `/api/admin/me/access` call
// (client/src/hooks/use-admin-access.ts), plus `role` — the mobile-only
// addition backing the "no access" screen's "Your role is X" line
// (server/routes.ts `getPrimaryRoleRefForUser`).
export interface AdminAccess {
  permissions: string[];
  isAccountManager: boolean;
  managedClientIds: string[];
  role: AdminRoleRef | null;
}

export const adminAccessService = {
  async get(): Promise<AdminAccess> {
    return api.get<AdminAccess>("/api/admin/me/access");
  },
};
