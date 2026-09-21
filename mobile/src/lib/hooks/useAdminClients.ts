import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  adminClientsService,
  type AdminClientListParams,
  type CreateClientInput,
  type UpdateClientInput,
} from "@/lib/services/adminClients";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

const PAGE_SIZE = 25;

export const adminClientsKeys = {
  list: (params: Omit<AdminClientListParams, "page" | "pageSize">) =>
    ["/api/admin/clients", "list", params] as const,
  detail: (id: string) => ["/api/admin/clients", id] as const,
  profileOptions: ["/api/admin/client-profile-options"] as const,
  analytics: (id: string) => ["/api/admin/clients", id, "analytics"] as const,
  credit: (id: string) => ["/api/admin/clients", id, "credit"] as const,
  accountManagers: ["/api/admin/account-managers"] as const,
  changeRequests: (status?: string) => ["/api/admin/account-managers/change-requests", status ?? "pending"] as const,
};

export function useAdminClientsList(
  params: Omit<AdminClientListParams, "page" | "pageSize">,
  options?: { enabled?: boolean },
) {
  const { hasPermission } = useAdminAccess();
  const enabled = hasPermission("clients", "read") && (options?.enabled ?? true);

  const query = useInfiniteQuery({
    queryKey: adminClientsKeys.list(params),
    queryFn: ({ pageParam }) => adminClientsService.list(pageParam, PAGE_SIZE, params),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.pagination.hasNextPage ? lastPage.pagination.page + 1 : undefined),
    enabled,
  });

  const clients = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;

  return { ...query, clients, total, enabled };
}

export function useAdminClientProfileOptions() {
  const { hasPermission } = useAdminAccess();
  return useQuery({
    queryKey: adminClientsKeys.profileOptions,
    queryFn: adminClientsService.getProfileOptions,
    enabled: hasPermission("clients", "read"),
  });
}

export function useAdminAccountManagerOptions() {
  const { hasPermission } = useAdminAccess();
  return useQuery({
    queryKey: adminClientsKeys.accountManagers,
    queryFn: adminClientsService.listAccountManagers,
    enabled: hasPermission("account-managers", "read"),
  });
}

export function useAdminClientDetails(id: string | undefined) {
  const { hasPermission } = useAdminAccess();
  return useQuery({
    queryKey: adminClientsKeys.detail(id ?? ""),
    queryFn: () => adminClientsService.get(id as string),
    enabled: !!id && hasPermission("clients", "read"),
  });
}

export function useAdminClientAnalytics(id: string | undefined) {
  const { hasPermission } = useAdminAccess();
  return useQuery({
    queryKey: adminClientsKeys.analytics(id ?? ""),
    queryFn: () => adminClientsService.getAnalytics(id as string),
    enabled: !!id && hasPermission("clients", "read"),
  });
}

export function useAdminClientCredit(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: adminClientsKeys.credit(id ?? ""),
    queryFn: () => adminClientsService.getCredit(id as string),
    enabled: !!id && enabled,
  });
}

function useInvalidateClients() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers"] });
    if (id) {
      queryClient.invalidateQueries({ queryKey: adminClientsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: adminClientsKeys.analytics(id) });
    }
  };
}

export function useCreateAdminClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (data: CreateClientInput) => adminClientsService.create(data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAdminClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientInput }) => adminClientsService.update(id, data),
    onSuccess: (_result, variables) => invalidate(variables.id),
  });
}

export function useUpdateAdminClientStatus() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminClientsService.updateStatus(id, isActive),
    onSuccess: (_result, variables) => invalidate(variables.id),
  });
}

export function useDeleteAdminClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (id: string) => adminClientsService.remove(id),
    onSuccess: () => invalidate(),
  });
}

export function useSetAdminClientCreditLimit() {
  const invalidate = useInvalidateClients();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, creditLimitSar }: { id: string; creditLimitSar: number }) =>
      adminClientsService.setCreditLimit(id, creditLimitSar),
    onSuccess: (_result, variables) => {
      invalidate(variables.id);
      queryClient.invalidateQueries({ queryKey: adminClientsKeys.credit(variables.id) });
    },
  });
}

export function useSetAdminClientDangerousGoods() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminClientsService.setDangerousGoodsEnabled(id, enabled),
    onSuccess: (_result, variables) => invalidate(variables.id),
  });
}

export function useSetAdminClientSalesFeatures() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminClientsService.setSalesFeaturesEnabled(id, enabled),
    onSuccess: (_result, variables) => invalidate(variables.id),
  });
}

export function useAssignClientsToAccountManager() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountManagerUserId, clientAccountIds }: { accountManagerUserId: string; clientAccountIds: string[] }) =>
      adminClientsService.assignClients(accountManagerUserId, clientAccountIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminClientsKeys.accountManagers });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    },
  });
}

export function useAdminChangeRequests(status: string) {
  const { hasPermission } = useAdminAccess();
  return useQuery({
    queryKey: adminClientsKeys.changeRequests(status),
    queryFn: () => adminClientsService.listChangeRequests(status === "all" ? undefined : status),
    enabled: hasPermission("account-manager-requests", "read"),
  });
}

export function useReviewChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, adminNotes }: { id: string; action: "approve" | "reject"; adminNotes?: string }) =>
      action === "approve"
        ? adminClientsService.approveChangeRequest(id, adminNotes)
        : adminClientsService.rejectChangeRequest(id, adminNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    },
  });
}
