// components/sections/dashboard/PerformanceStats.tsx
//
// The Performance screen's bottom grid — same four figures as the web admin dashboard's
// "Performance Overview" card (client/src/pages/admin/dashboard.tsx): Total Shipments,
// Delivered, In Transit and Total Revenue, all already on AdminDashboardStats.
import { View, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import type { AdminDashboardStats } from "@shared/schema";

interface PerformanceStatsProps {
  stats?: AdminDashboardStats;
  isLoading?: boolean;
}

export function PerformanceStats({ stats, isLoading }: PerformanceStatsProps) {
  const { t } = useTranslation();

  const cells = [
    {
      key: "totalShipments",
      label: t("admin.performance.stats.totalShipments"),
      value: String(stats?.totalShipments ?? 0),
      color: Colors.primary,
    },
    {
      key: "delivered",
      label: t("admin.performance.stats.delivered"),
      value: String(stats?.shipmentsDelivered ?? 0),
      color: "#16A34A",
    },
    {
      key: "inTransit",
      label: t("admin.performance.stats.inTransit"),
      value: String(stats?.shipmentsInTransit ?? 0),
      color: "#3B82F6",
    },
    {
      key: "totalRevenue",
      label: t("admin.performance.stats.totalRevenue"),
      value: (stats?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      color: Colors.text,
      showCurrency: true,
    },
  ];

  return (
    <View style={styles.card}>
      <Text size="medium" weight="bold" style={styles.title}>
        {t("admin.performance.performanceOverviewTitle")}
      </Text>

      <View style={styles.grid}>
        {cells.map((cell) => (
          <View key={cell.key} style={styles.cell}>
            {isLoading ? (
              <Skeleton width={rs(56)} height={rvs(26)} borderRadius={rs(6)} style={styles.valueSkeleton} />
            ) : (
              <View style={styles.valueRow}>
                {cell.showCurrency && (
                  <SaudiRiyal size={rs(15)} color={cell.color} style={styles.currencyIcon} />
                )}
                <Text size={rs(22)} weight="bold" style={{ color: cell.color }}>
                  {cell.value}
                </Text>
              </View>
            )}
            <Text size="xs" dimRate="65%" style={styles.cellLabel}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    padding: rs(14),
    marginTop: rvs(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  title: {
    color: Colors.text,
    marginBottom: rvs(12),
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "50%",
    alignItems: "center",
    marginBottom: rvs(18),
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  valueSkeleton: {
    marginBottom: rvs(2),
  },
  currencyIcon: {
    marginEnd: rs(2),
  },
  cellLabel: {
    marginTop: rvs(4),
    textAlign: "center",
  },
});
