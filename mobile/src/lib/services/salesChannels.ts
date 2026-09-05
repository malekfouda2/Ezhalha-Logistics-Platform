import { apiRequest } from "@/api/client";

export interface SalesChannelSyncSettings {
  importPaidOnly?: "paid" | "all" | "tagged";
  onNewOrder?: "review" | "auto";
  pickup?: "default";
}

export interface SalesChannel {
  id: string;
  platform: string;
  name: string;
  storeUrl: string | null;
  status: string;
  carrierMode?: "manual" | "auto";
  lastSyncedAt: string | null;
  syncSettings: SalesChannelSyncSettings | null;
  hasCredentials: boolean;
}

export interface ConnectSalesChannelInput {
  platform: string;
  name: string;
  storeUrl: string;
  carrierMode: "manual" | "auto";
  syncSettings?: SalesChannelSyncSettings;
  credentials?: { consumer_key: string; consumer_secret: string };
}

export async function listSalesChannels() {
  return apiRequest<SalesChannel[]>("/api/client/sales-channels", { method: "GET" });
}

export async function connectSalesChannel(data: ConnectSalesChannelInput) {
  return apiRequest<SalesChannel & { webhookSecret: string }>("/api/client/sales-channels", {
    method: "POST",
    body: data,
  });
}

export async function updateSalesChannel(
  id: string,
  data: Partial<Pick<SalesChannel, "carrierMode" | "syncSettings">>,
) {
  return apiRequest<SalesChannel>(`/api/client/sales-channels/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export async function disconnectSalesChannel(id: string) {
  return apiRequest<void>(`/api/client/sales-channels/${id}`, { method: "DELETE" });
}

export async function syncSalesChannel(id: string) {
  return apiRequest<{ imported: number }>(`/api/client/sales-channels/${id}/sync`, {
    method: "POST",
  });
}
