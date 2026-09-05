import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientAccount } from "@shared/schema";

import {
  updateClientAccount,
  type ClientAccountUpdate,
} from "@/lib/services/clientAccount";

export const clientAccountKey = ["/api/client/account"];

export function useClientAccount() {
  return useQuery<ClientAccount>({
    queryKey: clientAccountKey,
  });
}

export function useUpdateClientAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClientAccountUpdate) => updateClientAccount(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(clientAccountKey, updated);
    },
  });
}
