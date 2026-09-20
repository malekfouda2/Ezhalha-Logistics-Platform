// app/(protected)/(admin)/(tabs)/finance.tsx
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { StatCard } from "@/components/sections/dashboard/StatCard";
import { StatCardSkeleton } from "@/components/sections/dashboard/StatCardSkeleton";
import { AdminScreenHeader } from "@/components/layout/AdminScreenHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { Colors } from "@/constants/colors";
import { rs, rvs, screenWidth } from "@/utils/responsive";
import { translateMonth } from "@/utils/translateMonth";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useAdminDashboard } from "@/lib/hooks/useAdminDashboard";

const CHART_HEIGHT = rvs(160);
const CHART_CARD_WIDTH = screenWidth - rs(16) * 2 - rs(14) * 2;
const REQUIRED_PERMISSION = "dashboard:read";

function trendSubtitle(value: number | undefined) {
  if (value === undefined) return undefined;
  return `${value >= 0 ? "▲" : "▼"} ${Math.abs(value)}%`;
}

export default function AdminFinanceScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const { stats, isStatsLoading } = useAdminDashboard();

  const hasRevenueData = (stats?.revenueByMonth ?? []).some((m) => m.value > 0);
  const canReadFinance = hasPermission("dashboard", "read");
  const title = t("admin.finance.title");

  return (
    <View style={styles.container}>
      <AdminScreenHeader
        title={title}
        subtitle={canReadFinance ? undefined : REQUIRED_PERMISSION}
        onMenuPress={() => setDrawerVisible(true)}
      />

      {!canReadFinance ? (
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
      ) : (
        <RefreshableScreen contentContainerStyle={styles.content}>
          {isStatsLoading ? (
            <View style={styles.statsGrid}>
              <StatCardSkeleton />
              <StatCardSkeleton />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <StatCard
                title={t("admin.finance.totalRevenue")}
                value={(stats?.totalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                valuePrefix
                icon="trending-up"
              />
              <StatCard
                title={t("admin.finance.monthlyRevenue")}
                value={(stats?.monthlyRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                valuePrefix
                icon="bar-chart-2"
                subtitle={trendSubtitle(stats?.trends.revenue.value)}
                subtitleColor="#16713B"
              />
            </View>
          )}

          <View style={styles.section}>
            <Text size="large" weight="bold" style={styles.sectionTitle}>
              {t("admin.finance.revenueChart")}
            </Text>

            <View style={styles.chartCard}>
              {isStatsLoading ? (
                <Skeleton width={CHART_CARD_WIDTH} height={CHART_HEIGHT} borderRadius={rs(10)} />
              ) : !hasRevenueData ? (
                <View style={styles.chartEmpty}>
                  <Text size="small" dimRate="55%">
                    {t("admin.finance.noRevenueData")}
                  </Text>
                </View>
              ) : (
                (() => {
                  const rawMax = Math.max(...(stats?.revenueByMonth?.map((m) => m.value) ?? [0]), 0);
                  const axisMax = Math.max(rawMax, 4);
                  const step = Math.ceil(axisMax / 4);
                  const niceMax = step * 4;
                  const yLabels = [4, 3, 2, 1, 0].map((i) => i * step);

                  return (
                    <View style={styles.chartRow}>
                      <View style={styles.yAxis}>
                        {yLabels.map((label) => (
                          <Text key={label} size="xs" style={styles.yAxisLabel}>
                            {label.toLocaleString()}
                          </Text>
                        ))}
                      </View>

                      <View style={styles.chart}>
                        {(stats?.revenueByMonth ?? []).map((item, index, arr) => (
                          <View key={item.label} style={styles.chartColumn}>
                            <View style={styles.barTrack}>
                              {item.value > 0 && (
                                <View
                                  style={[
                                    styles.bar,
                                    {
                                      height: `${(item.value / niceMax) * 100}%`,
                                      backgroundColor: index === arr.length - 1 ? Colors.primary : "#FFD5C3",
                                    },
                                  ]}
                                />
                              )}
                            </View>
                            <Text size="xs" weight="semibold" style={styles.month}>
                              {translateMonth(item.label, t)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()
              )}
            </View>
          </View>

          <View style={styles.infoBox}>
            <SaudiRiyal size={rs(14)} color="#9A7410" />
            <Text size="xs" style={styles.infoText}>
              {t("admin.finance.info")}
            </Text>
          </View>
        </RefreshableScreen>
      )}

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
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  section: {
    marginTop: rvs(6),
    marginBottom: rvs(10),
  },
  sectionTitle: {
    marginBottom: rvs(10),
  },
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    padding: rs(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  chartEmpty: {
    height: CHART_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  chartRow: {
    flexDirection: "row",
  },
  yAxis: {
    justifyContent: "space-between",
    height: CHART_HEIGHT,
    marginRight: rs(8),
    paddingBottom: rvs(22),
  },
  yAxisLabel: {
    color: Colors.textSecondary,
  },
  chart: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    height: CHART_HEIGHT + rvs(22),
  },
  chartColumn: {
    alignItems: "center",
    flex: 1,
  },
  barTrack: {
    width: rs(22),
    height: CHART_HEIGHT,
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: rs(6),
    minHeight: rs(3),
  },
  month: {
    marginTop: rvs(6),
    color: Colors.textSecondary,
  },
  infoBox: {
    flexDirection: "row",
    gap: rs(10),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: rs(14),
    padding: rs(14),
  },
  infoText: {
    flex: 1,
    color: "#92400E",
  },
});
