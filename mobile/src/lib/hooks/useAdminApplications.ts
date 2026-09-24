import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ClientApplication } from "@shared/schema";

import type { Paginated } from "@/api/pagination";
import {
  adminApplicationsService,
  type AdminApplicationListParams,
  type ApplicationStatus,
  type ReviewApplicationInput,
} from "@/lib/services/adminApplications";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

const PAGE_SIZE = 25;
const COUNT_STATUSES: (ApplicationStatus | undefined)[] = [undefined, "pending", "approved", "rejected"];

export const adminApplicationsKeys = {
  all: ["/api/admin/applications"] as const,
  list: (params: AdminApplicationListParams) => ["/api/admin/applications", "list", params] as const,
  count: (status?: ApplicationStatus) => ["/api/admin/applications", "count", status ?? "all"] as const,
  // Shared with the dashboard/More summary (useAdminDashboard) so both refresh together.
  pending: ["/api/admin/applications/pending"] as const,
};

export function useAdminApplicationsList(params: AdminApplicationListParams) {
  const { hasPermission } = useAdminAccess();
  const enabled = hasPermission("applications", "read");

  const query = useInfiniteQuery({
    queryKey: adminApplicationsKeys.list(params),
    queryFn: ({ pageParam }) => adminApplicationsService.list(pageParam, PAGE_SIZE, params),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.pagination.hasNextPage ? lastPage.pagination.page + 1 : undefined),
    enabled,
  });

  const applications = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;

  return { ...query, applications, total, enabled };
}

/** Totals per status tab — a one-row page each, read only for `pagination.total`. */
export function useAdminApplicationCounts() {
  const { hasPermission } = useAdminAccess();
  const enabled = hasPermission("applications", "read");

  const results = useQueries({
    queries: COUNT_STATUSES.map((status) => ({
      queryKey: adminApplicationsKeys.count(status),
      queryFn: () => adminApplicationsService.list(1, 1, { status }),
      enabled,
    })),
  });

  const [all, pending, approved, rejected] = results.map((r) => r.data?.pagination.total);
  return { all, pending, approved, rejected, refetch: () => Promise.all(results.map((r) => r.refetch())) };
}

/**
 * There is no single-application endpoint. The cached list row is only the instant first paint —
 * the fetch always goes to the server (searching by the applicant's email, which the list
 * endpoint matches on), otherwise a refetch would just re-read the same stale cached row and an
 * approved application would keep showing as pending.
 */
export function useAdminApplication(id: string | undefined) {
  const queryClient = useQueryClient();
  const { hasPermission } = useAdminAccess();

  const findCached = (): ClientApplication | undefined => {
    if (!id) return undefined;
    const lists = queryClient.getQueriesData<InfiniteData<Paginated<ClientApplication>>>({
      queryKey: [...adminApplicationsKeys.all, "list"],
    });
    for (const [, data] of lists) {
      const match = data?.pages.flatMap((p) => p.data).find((a) => a.id === id);
      if (match) return match;
    }
    return queryClient.getQueryData<ClientApplication[]>(adminApplicationsKeys.pending)?.find((a) => a.id === id);
  };

  return useQuery({
    queryKey: [...adminApplicationsKeys.all, "detail", id ?? ""],
    queryFn: async () => {
      const cached = findCached();
      if (cached) {
        const page = await adminApplicationsService.list(1, 100, { search: cached.email });
        const match = page.data.find((a) => a.id === id);
        if (match) return match;
      }
      const pending = await adminApplicationsService.listPending();
      const match = pending.find((a) => a.id === id);
      if (!match) throw new Error("Application not found");
      return match;
    },
    initialData: findCached,
    // initialData counts as fresh by default — mark it stale so the server read runs on open.
    initialDataUpdatedAt: 0,
    refetchOnMount: "always",
    enabled: !!id && hasPermission("applications", "read"),
  });
}

export function useReviewApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewApplicationInput }) =>
      adminApplicationsService.review(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminApplicationsKeys.all });
      queryClient.invalidateQueries({ queryKey: adminApplicationsKeys.pending });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });
}
