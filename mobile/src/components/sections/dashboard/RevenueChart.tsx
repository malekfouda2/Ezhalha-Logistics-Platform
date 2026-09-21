// components/sections/dashboard/RevenueChart.tsx
//
// The Performance screen's "Revenue (Last 6 Months)" card: the big total (with its trend
// badge, same figures the dashboard's Monthly Revenue stat card shows) over a hand-drawn
// area/line chart — this app has no charting library, so the line is a plain SVG Path built
// from the same six-point series as the bar chart on the dashboard.
import { View, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors } from "@/constants/colors";
import { rs, rvs, screenWidth } from "@/utils/responsive";
import { translateMonth } from "@/utils/translateMonth";
import type { ChartDataPoint } from "@shared/schema";

const CARD_WIDTH = screenWidth - rs(16) * 2 - rs(14) * 2;
const CHART_HEIGHT = rvs(120);

interface RevenueChartProps {
  total?: number;
  trendValue?: number;
  data?: ChartDataPoint[];
  isLoading?: boolean;
}

export function RevenueChart({ total, trendValue, data, isLoading }: RevenueChartProps) {
  const { t } = useTranslation();
  const points = data ?? [];
  const hasData = points.some((p) => p.value > 0);

  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const topPadding = rvs(14);
  const step = points.length > 1 ? CARD_WIDTH / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: i * step,
    y: topPadding + (CHART_HEIGHT - topPadding) * (1 - p.value / maxValue),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x} ${CHART_HEIGHT} L ${coords[0].x} ${CHART_HEIGHT} Z`
    : "";

  return (
    <View style={styles.card}>
      <Text size="medium" weight="bold" style={styles.title}>
        {t("admin.performance.revenueTitle")}
      </Text>

      {isLoading ? (
        <Skeleton width={rs(160)} height={rvs(32)} borderRadius={rs(6)} style={styles.totalSkeleton} />
      ) : (
        <View style={styles.totalRow}>
          <SaudiRiyal size={rs(20)} color={Colors.text} style={styles.currencyIcon} />
          <Text size={rs(26)} weight="bold" style={styles.total}>
            {(total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </Text>
          {trendValue !== undefined && (
            <Text size="small" weight="bold" style={styles.trend}>
              {`${trendValue >= 0 ? "▲" : "▼"} ${Math.abs(trendValue)}%`}
            </Text>
          )}
        </View>
      )}

      {isLoading ? (
        <Skeleton width={CARD_WIDTH} height={CHART_HEIGHT} borderRadius={rs(10)} style={styles.chartSkeleton} />
      ) : !hasData ? (
        <View style={[styles.chartEmpty, { height: CHART_HEIGHT }]}>
          <Text size="small" style={styles.chartEmptyText}>
            {t("admin.performance.noData")}
          </Text>
        </View>
      ) : (
        <>
          <Svg width={CARD_WIDTH} height={CHART_HEIGHT} style={styles.chartSkeleton}>
            <Defs>
              <LinearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colors.primary} stopOpacity={0.25} />
                <Stop offset="1" stopColor={Colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#revenueFill)" />
            <Path d={linePath} stroke={Colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>

          <View style={styles.monthsRow}>
            {points.map((p) => (
              <Text key={p.label} size="xs" weight="semibold" style={styles.month}>
                {translateMonth(p.label, t)}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    padding: rs(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  title: {
    color: Colors.text,
    marginBottom: rvs(10),
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(12),
  },
  totalSkeleton: {
    marginBottom: rvs(12),
  },
  currencyIcon: {
    marginEnd: rs(4),
  },
  total: {
    color: Colors.text,
  },
  trend: {
    color: "#16713B",
    marginStart: rs(10),
  },
  chartSkeleton: {
    alignSelf: "center",
  },
  chartEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  chartEmptyText: {
    color: "#65748B",
  },
  monthsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: rvs(6),
  },
  month: {
    color: "#65748B",
  },
});
