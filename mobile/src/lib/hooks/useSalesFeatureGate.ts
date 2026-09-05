import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getSalesFeatureStatus,
  requestSalesFeatureAccess,
  type SalesFeatureStatus,
} from "@/lib/services/salesFeatures";

export const salesFeatureStatusKey = ["/api/client/sales-features"];

export function useSalesFeatureStatus() {
  return useQuery<SalesFeatureStatus>({
    queryKey: salesFeatureStatusKey,
    queryFn: getSalesFeatureStatus,
  });
}

export function useRequestSalesFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) => requestSalesFeatureAccess(reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesFeatureStatusKey });
    },
  });
}
