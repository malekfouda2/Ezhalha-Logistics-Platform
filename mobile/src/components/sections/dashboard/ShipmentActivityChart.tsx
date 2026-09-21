// components/sections/dashboard/ShipmentActivityChart.tsx
//
// The "Shipment Activity" bar chart — the client dashboard is the reference
// implementation this was extracted from verbatim; the admin dashboard uses
// the same component rather than its own copy.
import { Pressable, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors } from "@/constants/colors";
import { rs, rvs, screenWidth } from "@/utils/responsive";
import { translateMonth } from "@/utils/translateMonth";
import type { ChartDataPoint } from "@shared/schema";

// Matches `content`'s and `chartCard`'s own horizontal padding, so the
// loading skeleton fills the same width the real chart renders at.
const CHART_CARD_WIDTH = screenWidth - rs(16) * 2 - rs(10) * 2;

interface ShipmentActivityChartProps {
  data?: ChartDataPoint[];
  isLoading?: boolean;
  /** Overrides the default "Shipment Activity (Last 6 Months)" title — the admin dashboard
   * labels this section "Shipments (Last 6 Months)" instead. */
  title?: string;
  /** e.g. "Performance" — shown next to the title and only rendered when both are given. */
  actionLabel?: string;
  onActionPress?: () => void;
}

export function ShipmentActivityChart({
  data,
  isLoading,
  title,
  actionLabel,
  onActionPress,
}: ShipmentActivityChartProps) {
  const { t } = useTranslation();

  // No point drawing a chart that's all zeros — a brand-new account (or a guest) has nothing
  // to plot yet.
  const hasActivityData = (data ?? []).some((m) => m.value > 0);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text size="large" weight="bold" style={styles.sectionTitle}>
          {title ?? t("dashboard.shipmentActivity")}
        </Text>

        {actionLabel && onActionPress ? (
          <Pressable onPress={onActionPress} hitSlop={rs(8)}>
            <Text size="small" weight="bold" style={styles.action}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chartCard}>
        {isLoading ? (
          <Skeleton width={CHART_CARD_WIDTH} height={rvs(100)} borderRadius={rs(10)} />
        ) : !hasActivityData ? (
          <View style={styles.chartEmpty}>
            <Text size="small" style={styles.chartEmptyText}>
              No shipments yet
            </Text>
          </View>
        ) : (
          (() => {
            const rawMax = Math.max(...(data?.map((m) => m.value) ?? [0]), 0);
            const axisMax = Math.max(rawMax, 4);
            const step = Math.ceil(axisMax / 4);
            const niceMax = step * 4;
            const yLabels = [4, 3, 2, 1, 0].map((i) => i * step);

            return (
              <View style={styles.chartRow}>
                <View style={styles.yAxis}>
                  {yLabels.map((label) => (
                    <Text key={label} size="xs" style={styles.yAxisLabel}>
                      {label}
                    </Text>
                  ))}
                </View>

                <View style={styles.chart}>
                  {(data ?? []).map((item, index, arr) => (
                    <View key={item.label} style={styles.chartColumn}>
                      <View style={styles.barTrack}>
                        {item.value > 0 && (
                          <View
                            style={[
                              styles.bar,
                              {
                                height: `${(item.value / niceMax) * 100}%`,
                                backgroundColor:
                                  index === arr.length - 1 ? Colors.primary : "#FFD5C3",
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
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: rvs(12),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: Colors.text,
  },
  action: {
    color: Colors.primary,
  },
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    paddingHorizontal: rs(10),
    paddingTop: rvs(15),
    paddingBottom: rvs(10),
    marginTop: rvs(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  chartRow: {
    flexDirection: "row",
  },
  yAxis: {
    height: rvs(100),
    justifyContent: "space-between",
    marginRight: rs(8),
  },
  yAxisLabel: {
    color: "#9AA5B4",
    textAlign: "right",
    minWidth: rs(16),
  },
  chart: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  chartEmpty: {
    minHeight: rvs(100),
    alignItems: "center",
    justifyContent: "center",
  },
  chartEmptyText: {
    color: "#65748B",
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
  },
  barTrack: {
    height: rvs(90),
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "60%",
    borderTopLeftRadius: rs(8),
    borderTopRightRadius: rs(8),
  },
  month: {
    color: "#65748B",
    marginTop: rvs(6),
  },
});
