import { api } from "@/api/client";
import type { ClientPermissionValue } from "@shared/domain";

export interface TeamMember {
  id: string;
  username: string;
  email: string;
  isPrimaryContact: boolean;
  permissions: ClientPermissionValue[];
  createdAt: string;
}

export interface MyPermissions {
  permissions: ClientPermissionValue[];
  isPrimaryContact: boolean;
}

export interface CreateTeamMemberInput {
  username: string;
  email: string;
  password: string;
  permissions: ClientPermissionValue[];
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  return api.get<TeamMember[]>("/api/client/users");
}

export async function getMyPermissions(): Promise<MyPermissions> {
  return api.get<MyPermissions>("/api/client/my-permissions");
}

export async function createTeamMember(
  data: CreateTeamMemberInput,
): Promise<TeamMember> {
  return api.post<TeamMember>("/api/client/users", data);
}

export async function updateTeamMemberPermissions(
  userId: string,
  permissions: ClientPermissionValue[],
): Promise<TeamMember> {
  return api.patch<TeamMember>(`/api/client/users/${userId}/permissions`, {
    permissions,
  });
}

export async function removeTeamMember(userId: string): Promise<void> {
  await api.delete(`/api/client/users/${userId}`);
}
