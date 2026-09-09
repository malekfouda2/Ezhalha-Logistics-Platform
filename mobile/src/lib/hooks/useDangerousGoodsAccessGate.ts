import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getDangerousGoodsAccessStatus,
  requestDangerousGoodsAccess,
  type DangerousGoodsAccessStatus,
} from "@/lib/services/dangerousGoodsAccess";

export const dangerousGoodsAccessKey = ["/api/client/dangerous-goods"];

export function useDangerousGoodsAccessStatus() {
  return useQuery<DangerousGoodsAccessStatus>({
    queryKey: dangerousGoodsAccessKey,
    queryFn: getDangerousGoodsAccessStatus,
  });
}

export function useRequestDangerousGoodsAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) => requestDangerousGoodsAccess(reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dangerousGoodsAccessKey });
    },
  });
}
