import { apiRequest } from "@/api/client";

export interface CarrierRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: string | null;
  strategy: "specific_carrier" | "cheapest" | "fastest";
  carrierCode: string | null;
}

export interface CarrierRuleConditions {
  weight: string;
  region: string;
  value: string;
  channel: string;
}

export interface CreateCarrierRuleInput {
  name: string;
  priority: number;
  enabled: boolean;
  conditions: string;
  strategy: CarrierRule["strategy"];
  carrierCode: string | null;
}

export async function listCarrierRules() {
  return apiRequest<CarrierRule[]>("/api/client/carrier-rules", { method: "GET" });
}

export async function createCarrierRule(data: CreateCarrierRuleInput) {
  return apiRequest<CarrierRule>("/api/client/carrier-rules", { method: "POST", body: data });
}

export async function updateCarrierRule(id: string, data: Partial<Pick<CarrierRule, "enabled">>) {
  return apiRequest<CarrierRule>(`/api/client/carrier-rules/${id}`, { method: "PATCH", body: data });
}

export async function deleteCarrierRule(id: string) {
  return apiRequest<void>(`/api/client/carrier-rules/${id}`, { method: "DELETE" });
}

export function parseRuleConditions(conditions: string | null): Partial<CarrierRuleConditions> {
  if (!conditions) return {};
  try {
    return JSON.parse(conditions) as Partial<CarrierRuleConditions>;
  } catch {
    return {};
  }
}
