import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  connectSalesChannel,
  disconnectSalesChannel,
  listSalesChannels,
  syncSalesChannel,
  updateSalesChannel,
  type ConnectSalesChannelInput,
  type SalesChannel,
} from "@/lib/services/salesChannels";

export const salesChannelsKey = ["/api/client/sales-channels"];

export function useSalesChannels() {
  return useQuery<SalesChannel[]>({
    queryKey: salesChannelsKey,
    queryFn: listSalesChannels,
  });
}

export function useConnectSalesChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConnectSalesChannelInput) => connectSalesChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesChannelsKey });
    },
  });
}

export function useUpdateSalesChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<SalesChannel, "carrierMode" | "syncSettings">> }) =>
      updateSalesChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesChannelsKey });
    },
  });
}

export function useDisconnectSalesChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => disconnectSalesChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesChannelsKey });
    },
  });
}

export function useSyncSalesChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => syncSalesChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesChannelsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/client/orders"] });
    },
  });
}
