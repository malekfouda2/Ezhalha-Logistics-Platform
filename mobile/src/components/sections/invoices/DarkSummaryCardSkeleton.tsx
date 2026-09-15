// components/sections/invoices/DarkSummaryCardSkeleton.tsx
import { View, StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";

import { Skeleton } from "@/components/ui/Skeleton";
import { Colors } from "@/constants/colors";
import { rs, rvs, screenWidth } from "@/utils/responsive";

const GLOW_SIZE = rs(220);
// Matches DarkSummaryCard's own horizontal padding, on top of the screen's
// scroll/list content padding both call sites share (rs(16) each side).
const CARD_CONTENT_WIDTH = screenWidth - rs(16) * 2 - rs(18) * 2;

// A muted gray sweep instead of Skeleton's default light-gray one — the
// default reads as near-white blocks on this card's solid black background.
const BAR_SHIMMER_COLORS = ["#333333", "#565656", "#333333"];

interface DarkSummaryCardSkeletonProps {
  /** Mirrors the real card's `progress` prop — render a progress-bar placeholder too. */
  showProgress?: boolean;
  statCount?: number;
}

export function DarkSummaryCardSkeleton({
  showProgress = false,
  statCount = 3,
}: DarkSummaryCardSkeletonProps) {
  return (
    <View style={styles.card}>
      <Svg style={styles.glow} width={GLOW_SIZE} height={GLOW_SIZE}>
        <Defs>
          <RadialGradient id="cardGlowSkeleton" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={Colors.primary} stopOpacity={0.55} />
            <Stop offset="55%" stopColor={Colors.primary} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={Colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#cardGlowSkeleton)" />
      </Svg>

      <Skeleton
        width={rs(110)}
        height={rvs(13)}
        borderRadius={rs(4)}
        shimmerColors={BAR_SHIMMER_COLORS}
        style={styles.label}
      />

      <Skeleton
        width={rs(150)}
        height={rvs(32)}
        borderRadius={rs(6)}
        shimmerColors={BAR_SHIMMER_COLORS}
        style={styles.amount}
      />

      {showProgress ? (
        <Skeleton
          width={CARD_CONTENT_WIDTH}
          height={rvs(6)}
          borderRadius={rs(3)}
          shimmerColors={BAR_SHIMMER_COLORS}
          style={styles.progress}
        />
      ) : null}

      <View style={[styles.statsRow, !showProgress && styles.statsRowNoProgress]}>
        {Array.from({ length: statCount }).map((_, i) => (
          <View key={i} style={styles.statItem}>
            <Skeleton
              width={rs(50)}
              height={rvs(9)}
              borderRadius={rs(3)}
              shimmerColors={BAR_SHIMMER_COLORS}
            />
            <Skeleton
              width={rs(40)}
              height={rvs(14)}
              borderRadius={rs(4)}
              shimmerColors={BAR_SHIMMER_COLORS}
              style={styles.statValue}
            />
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
    marginBottom: rvs(10),
  },
  amount: {
    marginBottom: rvs(2),
  },
  progress: {
    marginTop: rvs(16),
  },
  statsRow: {
    flexDirection: "row",
    marginTop: rvs(18),
  },
  statsRowNoProgress: {
    marginTop: rvs(22),
  },
  statItem: {
    gap: rvs(6),
    marginEnd: rs(30),
  },
  statValue: {
    marginTop: rvs(2),
  },
});
