import { api } from "@/api/client";
import { UserInvitationStatus } from "@shared/internal-users";

// Backs the More tab's "Staff" section — the same endpoints the web admin's
// Users/Roles/Account Managers pages already use (server/routes.ts), read
// here only for their counts.
export interface AdminInvitationRow {
  status: string;
}

export const adminStaffService = {
  listAccountManagers: () => api.get<unknown[]>("/api/admin/account-managers"),
  listUsers: () => api.get<unknown[]>("/api/admin/users"),
  listInvitations: () => api.get<AdminInvitationRow[]>("/api/admin/invitations"),
  listRoles: () => api.get<unknown[]>("/api/admin/roles"),
  listPermissionsCatalog: () => api.get<unknown[]>("/api/admin/permissions"),
};

export function countPendingInvitations(rows: AdminInvitationRow[]): number {
  return rows.filter((row) => row.status === UserInvitationStatus.PENDING).length;
}
