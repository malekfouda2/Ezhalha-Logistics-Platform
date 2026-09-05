import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCarrierRule,
  deleteCarrierRule,
  listCarrierRules,
  updateCarrierRule,
  type CarrierRule,
  type CreateCarrierRuleInput,
} from "@/lib/services/carrierRules";

export const carrierRulesKey = ["/api/client/carrier-rules"];

export function useCarrierRules() {
  return useQuery<CarrierRule[]>({
    queryKey: carrierRulesKey,
    queryFn: listCarrierRules,
  });
}

export function useCreateCarrierRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCarrierRuleInput) => createCarrierRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: carrierRulesKey });
    },
  });
}

export function useToggleCarrierRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rule: CarrierRule) => updateCarrierRule(rule.id, { enabled: !rule.enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: carrierRulesKey });
    },
  });
}

export function useDeleteCarrierRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCarrierRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: carrierRulesKey });
    },
  });
}
