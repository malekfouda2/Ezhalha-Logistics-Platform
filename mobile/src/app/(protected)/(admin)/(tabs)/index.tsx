// app/(protected)/(admin)/index.tsx
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { StatCard } from "@/components/sections/dashboard/StatCard";
import { StatCardSkeleton } from "@/components/sections/dashboard/StatCardSkeleton";
import { RecentShipments } from "@/components/sections/dashboard/RecentShipments";
import { ShipmentActivityChart } from "@/components/sections/dashboard/ShipmentActivityChart";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminDashboard } from "@/lib/hooks/useAdminDashboard";
import type { Shipment } from "@shared/schema";

function trendSubtitle(value: number | undefined) {
  if (value === undefined) return undefined;
  return `${value >= 0 ? "▲" : "▼"} ${Math.abs(value)}%`;
}

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { stats, isStatsLoading, recentShipments, isRecentShipmentsLoading, canReadShipments } =
    useAdminDashboard();

  return (
    <View style={styles.container}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <AdminTabHeader title={t("admin.dashboard.title")} onMenuPress={() => setDrawerVisible(true)} />

        {isStatsLoading ? (
          <View style={styles.statsGrid}>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard
              title={t("admin.dashboard.stats.totalClients")}
              value={String(stats?.totalClients ?? 0)}
              icon="users"
              subtitle={trendSubtitle(stats?.trends.clients.value)}
              subtitleColor="#16713B"
            />

            <StatCard
              title={t("admin.dashboard.stats.activeShipments")}
              value={String(stats?.shipmentsInTransit ?? 0)}
              icon="hexagon"
              subtitle={trendSubtitle(stats?.trends.shipments.value)}
              subtitleColor="#16713B"
            />

            <StatCard
              title={t("admin.dashboard.stats.pendingApplications")}
              value={String(stats?.pendingApplications ?? 0)}
              icon="file-text"
            />

            <StatCard
              title={t("admin.dashboard.stats.monthlyRevenue")}
              value={(stats?.monthlyRevenue ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
              valuePrefix
              icon="trending-up"
              subtitle={trendSubtitle(stats?.trends.revenue.value)}
              subtitleColor="#16713B"
            />
          </View>
        )}

        <ShipmentActivityChart data={stats?.shipmentsByMonth} isLoading={isStatsLoading} />

        {canReadShipments && (
          <RecentShipments
            shipments={recentShipments}
            isLoading={isRecentShipmentsLoading}
            seeAllHref="/(protected)/(admin)/(tabs)/shipments"
            onShipmentPress={(shipment: Shipment) =>
              Toast.show({
                type: "info",
                text1: shipment.trackingNumber,
                text2: t("admin.comingSoonTitle"),
              })
            }
          />
        )}
      </RefreshableScreen>

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: rs(16),
    paddingBottom: rvs(32),
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
});
