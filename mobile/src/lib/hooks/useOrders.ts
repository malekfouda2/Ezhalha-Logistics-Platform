import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fulfillOrder,
  getOrder,
  getOrderRates,
  listOrders,
  type OrderRow,
} from "@/lib/services/orders";

export const ordersKey = ["/api/client/orders"];

export function useOrders() {
  return useQuery<OrderRow[]>({
    queryKey: ordersKey,
    queryFn: listOrders,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery<OrderRow>({
    queryKey: [...ordersKey, id],
    queryFn: () => getOrder(id!),
    enabled: Boolean(id),
  });
}

export function useOrderRates(id: string | undefined, weightKg: number) {
  return useQuery({
    queryKey: [...ordersKey, id, "rates", weightKg],
    queryFn: () => getOrderRates(id!, weightKg),
    enabled: Boolean(id) && weightKg > 0,
  });
}

export function useFulfillOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, carrierCode, weightKg }: { id: string; carrierCode: string; weightKg?: number }) =>
      fulfillOrder(id, { carrierCode, weightKg }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKey });
    },
  });
}
