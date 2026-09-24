// app/(protected)/(admin)/performance.tsx
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { RevenueChart } from "@/components/sections/dashboard/RevenueChart";
import { ShipmentStatusChart } from "@/components/sections/dashboard/ShipmentStatusChart";
import { PerformanceStats } from "@/components/sections/dashboard/PerformanceStats";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminDashboard } from "@/lib/hooks/useAdminDashboard";

export default function AdminPerformanceScreen() {
  const { t } = useTranslation();
  const { stats, isStatsLoading } = useAdminDashboard();

  return (
    <View style={styles.container}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <AdminTabHeader title={t("admin.performance.title")} onBackPress={() => router.back()} />

        <RevenueChart
          total={stats?.monthlyRevenue}
          trendValue={stats?.trends.revenue.value}
          data={stats?.revenueByMonth}
          isLoading={isStatsLoading}
        />

        <ShipmentStatusChart statusDistribution={stats?.statusDistribution} isLoading={isStatsLoading} />

        <PerformanceStats stats={stats} isLoading={isStatsLoading} />
      </RefreshableScreen>
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
});
