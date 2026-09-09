import { apiRequest } from "@/api/client";

export interface DangerousGoodsAccessRequest {
  status: "pending" | "rejected";
  reason?: string | null;
}

export interface DangerousGoodsAccessStatus {
  enabled: boolean;
  request: DangerousGoodsAccessRequest | null;
}

export async function getDangerousGoodsAccessStatus() {
  return apiRequest<DangerousGoodsAccessStatus>("/api/client/dangerous-goods", { method: "GET" });
}

export async function requestDangerousGoodsAccess(reason?: string) {
  return apiRequest<{ success: boolean; request: DangerousGoodsAccessRequest }>(
    "/api/client/dangerous-goods/request",
    { method: "POST", body: { reason } },
  );
}
