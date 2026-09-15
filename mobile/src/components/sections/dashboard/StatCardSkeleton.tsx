import { View, StyleSheet } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";
import { rs, rvs, screenWidth } from "@/utils/responsive";

// The stat card is 48.2% of the content column (screen width minus the
// screen's own horizontal padding), minus its own inner padding — matching
// that here keeps the shimmer bars from over/undershooting the real card.
const CARD_CONTENT_WIDTH =
  (screenWidth - rs(16) * 2) * 0.482 - rs(10) * 2;

export const StatCardSkeleton = () => {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Skeleton
          width={CARD_CONTENT_WIDTH * 0.6}
          height={rvs(12)}
          borderRadius={rs(4)}
        />
        <Skeleton width={rs(26)} height={rs(26)} borderRadius={rs(9)} />
      </View>

      <Skeleton
        width={CARD_CONTENT_WIDTH * 0.45}
        height={rvs(20)}
        borderRadius={rs(5)}
        style={styles.valueSkeleton}
      />

      <Skeleton
        width={CARD_CONTENT_WIDTH * 0.35}
        height={rvs(10)}
        borderRadius={rs(4)}
        style={styles.subtitleSkeleton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  statCard: {
    width: "48.2%",
    minHeight: rvs(100),
    backgroundColor: "#FFFFFF",
    borderRadius: rs(14),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(9),
    marginBottom: rvs(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  statHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  valueSkeleton: {
    marginTop: rvs(8),
  },
  subtitleSkeleton: {
    marginTop: rvs(7),
  },
});
