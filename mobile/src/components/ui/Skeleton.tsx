// components/ui/Skeleton.tsx
import { ViewStyle } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";

const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);

// Bars are sized in fixed points, not percentages — the library's sweep
// animation interpolates off the numeric `width` prop, so a "48%" would
// break the shimmer's translateX math.
export interface SkeletonProps {
  width?: number;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  /** Overrides the default light-gray sweep — e.g. a darker set for a dark-card skeleton. */
  shimmerColors?: string[];
}

export function Skeleton({
  width = 100,
  height = 14,
  borderRadius = 8,
  style,
  shimmerColors = SHIMMER_COLORS,
}: SkeletonProps) {
  return (
    <ShimmerPlaceholder
      width={width}
      height={height}
      duration={1100}
      shimmerColors={shimmerColors}
      style={[{ borderRadius }, style]}
    />
  );
}

const SHIMMER_COLORS = ["#E7E9ED", "#F5F6F8", "#E7E9ED"];
