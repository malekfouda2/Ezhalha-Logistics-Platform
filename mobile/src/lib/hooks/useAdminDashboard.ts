import { useQuery } from "@tanstack/react-query";

import { adminDashboardService } from "@/lib/services/adminDashboard";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import type { AdminDashboardStats, ClientApplication, Shipment } from "@shared/schema";

// Same three queries the web admin dashboard fires
// (client/src/pages/admin/dashboard.tsx), each gated on the permission its
// endpoint requires so a scoped admin never sees a 403 flash through.
export function useAdminDashboard() {
  const { hasPermission } = useAdminAccess();

  const canReadDashboard = hasPermission("dashboard", "read");
  const canReadShipments = hasPermission("shipments", "read");
  const canReadApplications = hasPermission("applications", "read");

  const stats = useQuery<AdminDashboardStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: adminDashboardService.getStats,
    enabled: canReadDashboard,
  });

  const recentShipments = useQuery<Shipment[]>({
    queryKey: ["/api/admin/shipments/recent"],
    queryFn: adminDashboardService.getRecentShipments,
    enabled: canReadShipments,
  });

  const pendingApplications = useQuery<ClientApplication[]>({
    queryKey: ["/api/admin/applications/pending"],
    queryFn: adminDashboardService.getPendingApplications,
    enabled: canReadApplications,
  });

  return {
    canReadDashboard,
    canReadShipments,
    canReadApplications,
    stats: stats.data,
    isStatsLoading: canReadDashboard && stats.isLoading,
    recentShipments: recentShipments.data,
    isRecentShipmentsLoading: canReadShipments && recentShipments.isLoading,
    pendingApplications: pendingApplications.data,
    isPendingApplicationsLoading: canReadApplications && pendingApplications.isLoading,
  };
}
