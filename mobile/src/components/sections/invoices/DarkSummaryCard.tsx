// components/sections/invoices/DarkSummaryCard.tsx
import { View, StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

const GLOW_SIZE = rs(220);

interface DarkSummaryStat {
  label: string;
  value: string;
  valueColor?: string;
}

interface DarkSummaryCardProps {
  label: string;
  amount: string;
  decimals?: string;
  /** 0-1, renders a progress bar under the amount when provided */
  progress?: number;
  stats: DarkSummaryStat[];
}

export function DarkSummaryCard({
  label,
  amount,
  decimals = ".00",
  progress,
  stats,
}: DarkSummaryCardProps) {
  return (
    <View style={styles.card}>
      <Svg style={styles.glow} width={GLOW_SIZE} height={GLOW_SIZE}>
        <Defs>
          <RadialGradient id="cardGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={Colors.primary} stopOpacity={0.55} />
            <Stop offset="55%" stopColor={Colors.primary} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={Colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#cardGlow)" />
      </Svg>

      <Text size="small" style={styles.label}>
        {label}
      </Text>

      <View style={styles.amountRow}>
        <SaudiRiyal size={rs(24)} color={Colors.primary} style={styles.riyalIcon} />
        <Text size={32} weight="bold" style={styles.amount}>
          {amount}
        </Text>
        <Text size="large" weight="bold" style={styles.decimals}>
          {decimals}
        </Text>
      </View>

      {progress !== undefined ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(Math.max(progress, 0), 1) * 100}%` },
            ]}
          />
        </View>
      ) : null}

      <View style={[styles.statsRow, progress === undefined && styles.statsRowNoProgress]}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statItem}>
            <Text size="xs" style={styles.statLabel}>
              {stat.label}
            </Text>
            <Text
              size="medium"
              weight="bold"
              style={[styles.statValue, stat.valueColor ? { color: stat.valueColor } : null]}
            >
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "black",
    borderRadius: rs(20),
    paddingHorizontal: rs(18),
    paddingVertical: rvs(20),
    marginBottom: rvs(20),
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    top: -rs(70),
    right: -rs(70),
  },
  label: {
    color: setOpacity(Colors.white, 0.65),
    marginBottom: rvs(10),
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  riyalIcon: {
    marginBottom: rvs(6),
    marginRight: rs(6),
  },
  amount: {
    color: Colors.white,
  },
  decimals: {
    color: setOpacity(Colors.white, 0.55),
    marginBottom: rvs(2),
  },
  progressTrack: {
    height: rvs(6),
    borderRadius: rs(3),
    backgroundColor: setOpacity(Colors.white, 0.15),
    marginTop: rvs(16),
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: rs(3),
    backgroundColor: Colors.primary,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: rvs(18),
  },
  statsRowNoProgress: {
    marginTop: rvs(22),
  },
  statItem: {
    gap: rvs(4),
    marginEnd: rs(30),
  },
  statLabel: {
    color: setOpacity(Colors.white, 0.55),
  },
  statValue: {
    color: Colors.white,
  },
});
