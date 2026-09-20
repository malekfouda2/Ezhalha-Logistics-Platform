import { api } from "@/api/client";
import type { AdminDashboardStats, ClientApplication, Shipment } from "@shared/schema";

// Same three endpoints the web admin dashboard reads
// (client/src/pages/admin/dashboard.tsx) — no new API surface.
export const adminDashboardService = {
  async getStats(): Promise<AdminDashboardStats> {
    return api.get<AdminDashboardStats>("/api/admin/stats");
  },

  async getRecentShipments(): Promise<Shipment[]> {
    return api.get<Shipment[]>("/api/admin/shipments/recent");
  },

  async getPendingApplications(): Promise<ClientApplication[]> {
    return api.get<ClientApplication[]>("/api/admin/applications/pending");
  },
};
