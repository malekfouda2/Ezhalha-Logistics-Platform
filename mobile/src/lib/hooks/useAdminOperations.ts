import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  adminOperationsService,
  type OperationQueue,
  type OperationShipmentDetail,
  type OperationShipmentSummary,
  type OperationSort,
} from "@/lib/services/adminOperations";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

export const adminOperationsKeys = {
  all: ["/api/operations"] as const,
  summary: ["/api/operations", "summary"] as const,
  list: (params: { queue?: OperationQueue; search?: string; sort?: OperationSort }) =>
    ["/api/operations", "list", params] as const,
  detail: (id: string) => ["/api/operations", "detail", id] as const,
  users: ["/api/operations", "users"] as const,
};

function useCanReadOperations() {
  const { hasPermission } = useAdminAccess();
  return hasPermission("operations", "read");
}

export function useOperationsSummary() {
  const enabled = useCanReadOperations();
  return useQuery({ queryKey: adminOperationsKeys.summary, queryFn: adminOperationsService.summary, enabled });
}

export function useOperationsQueue(params: { queue?: OperationQueue; search?: string; sort?: OperationSort }) {
  const enabled = useCanReadOperations();
  return useQuery({
    queryKey: adminOperationsKeys.list(params),
    queryFn: () => adminOperationsService.list(params),
    enabled,
    // The app-wide `staleTime: Infinity` would keep the first answer forever; ops data moves
    // under us (carriers, schedulers, the web hub), so re-read on every visit like the web does.
    refetchOnMount: "always",
  });
}

/** Waybill / tracking lookup for the scanner — active queues first, then delivered. */
export function useOperationsLookup(code: string) {
  const enabled = useCanReadOperations() && code.trim().length >= 4;
  return useQuery({
    queryKey: [...adminOperationsKeys.all, "lookup", code.trim()],
    queryFn: async (): Promise<OperationShipmentSummary[]> => {
      const search = code.trim();
      const active = await adminOperationsService.list({ search, limit: 10 });
      if (active.length > 0) return active;
      return adminOperationsService.list({ search, queue: "delivered", limit: 10 });
    },
    enabled,
  });
}

export function useOperationShipment(id: string | undefined) {
  const enabled = useCanReadOperations() && !!id;
  return useQuery({
    queryKey: adminOperationsKeys.detail(id ?? ""),
    queryFn: () => adminOperationsService.detail(id!),
    enabled,
    // Same freshness as the web hub's open shipment panel: re-read on open and poll every minute,
    // so "Hours since update" and the stage never show a snapshot from an earlier visit.
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });
}

export function useOperationsUsers(enabled: boolean) {
  return useQuery({ queryKey: adminOperationsKeys.users, queryFn: adminOperationsService.users, enabled });
}

/**
 * Every ops mutation answers with the refreshed shipment `detail` — write it straight into the
 * detail cache so the screen updates without a second round trip, then let the queues and the hub
 * counts refetch.
 */
export function useOperationMutation<TVars, TResult>(
  shipmentId: string,
  mutationFn: (vars: TVars) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      const detail = (result as { detail?: OperationShipmentDetail } | undefined)?.detail;
      if (detail) {
        queryClient.setQueryData(adminOperationsKeys.detail(shipmentId), detail);
      } else {
        queryClient.invalidateQueries({ queryKey: adminOperationsKeys.detail(shipmentId) });
      }
      queryClient.invalidateQueries({ queryKey: [...adminOperationsKeys.all, "list"] });
      queryClient.invalidateQueries({ queryKey: adminOperationsKeys.summary });
    },
  });
}
