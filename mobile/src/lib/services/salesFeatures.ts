import { apiRequest } from "@/api/client";

export interface SalesFeatureRequest {
  status: "pending" | "approved" | "rejected";
  reason?: string | null;
  adminNotes?: string | null;
}

export interface SalesFeatureStatus {
  enabled: boolean;
  request: SalesFeatureRequest | null;
}

export async function getSalesFeatureStatus() {
  return apiRequest<SalesFeatureStatus>("/api/client/sales-features", { method: "GET" });
}

export async function requestSalesFeatureAccess(reason?: string) {
  return apiRequest<{ success: boolean; request: SalesFeatureRequest }>(
    "/api/client/sales-features/request",
    { method: "POST", body: { reason } },
  );
}
