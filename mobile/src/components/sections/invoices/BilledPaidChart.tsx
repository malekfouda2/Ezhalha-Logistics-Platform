// components/sections/invoices/BilledPaidChart.tsx
import { View, StyleSheet } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface BilledPaidPoint {
  label: string;
  billed: number;
  paid: number;
}

interface BilledPaidChartProps {
  data: BilledPaidPoint[];
}

export function BilledPaidChart({ data }: BilledPaidChartProps) {
  const rawMax = Math.max(...data.flatMap((d) => [d.billed, d.paid]), 0);
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
        {data.map((item) => (
          <View key={item.label} style={styles.chartColumn}>
            <View style={styles.barsGroup}>
              <View style={styles.barTrack}>
                {item.billed > 0 && (
                  <View
                    style={[
                      styles.bar,
                      styles.barBilled,
                      { height: `${(item.billed / niceMax) * 100}%` },
                    ]}
                  />
                )}
              </View>
              <View style={styles.barTrack}>
                {item.paid > 0 && (
                  <View
                    style={[
                      styles.bar,
                      styles.barPaid,
                      { height: `${(item.paid / niceMax) * 100}%` },
                    ]}
                  />
                )}
              </View>
            </View>

            <Text size="xs" weight="semibold" style={styles.month}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const CHART_HEIGHT = rvs(140);

const styles = StyleSheet.create({
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
  barsGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: rs(3),
    height: CHART_HEIGHT,
  },
  barTrack: {
    width: rs(20),
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: rs(4),
    minHeight: rs(3),
  },
  barBilled: {
    backgroundColor: "#FFD5C3",
  },
  barPaid: {
    backgroundColor: Colors.primary,
  },
  month: {
    marginTop: rvs(3),
    color: Colors.textSecondary,
  },
});
