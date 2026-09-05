import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientPermissionValue } from "@shared/domain";

import {
  createTeamMember,
  getMyPermissions,
  listTeamMembers,
  removeTeamMember,
  updateTeamMemberPermissions,
  type CreateTeamMemberInput,
  type MyPermissions,
  type TeamMember,
} from "@/lib/services/team";

export const teamKeys = {
  members: ["/api/client/users"] as const,
  myPermissions: ["/api/client/my-permissions"] as const,
};

export function useMyPermissions() {
  return useQuery<MyPermissions>({
    queryKey: teamKeys.myPermissions,
    queryFn: getMyPermissions,
  });
}

export function useTeamMembers(enabled: boolean) {
  return useQuery<TeamMember[]>({
    queryKey: teamKeys.members,
    queryFn: listTeamMembers,
    enabled,
  });
}

export function useCreateTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTeamMemberInput) => createTeamMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members });
    },
  });
}

export function useUpdateTeamMemberPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      permissions,
    }: {
      userId: string;
      permissions: ClientPermissionValue[];
    }) => updateTeamMemberPermissions(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => removeTeamMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members });
    },
  });
}
