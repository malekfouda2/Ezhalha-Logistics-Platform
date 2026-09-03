// components/ui/InfoCard.tsx
import { View, StyleSheet, ViewStyle } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

/**
 * Section label used above cards, e.g. "SHIPMENT DETAILS"
 */
export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: ViewStyle;
}) {
  return (
    <Text
      size="xs"
      weight="semibold"
      dimRate="55%"
      textTransform="uppercase"
      style={[styles.sectionLabel, style]}
    >
      {children}
    </Text>
  );
}

/**
 * White rounded card container. Wrap InfoRow children and it will
 * automatically insert dividers between them.
 */
export function InfoCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const items = Array.isArray(children) ? children : [children];

  return (
    <View style={[styles.card, style]}>
      {items
        .filter(Boolean)
        .map((child, index) => (
          <View key={index}>
            {index > 0 && <View style={styles.rowDivider} />}
            {child}
          </View>
        ))}
    </View>
  );
}

/**
 * A single label/value row inside an InfoCard.
 * `valueWeight` lets you emphasize totals, `valueColor` for accent colors.
 */
export function InfoRow({
  label,
  value,
  valueSize = "small",
  valueWeight = "bold",
  valueColor,
  labelSize = "small",
  icon,
}: {
  label: string;
  value: string;
  valueSize?: "small" | "medium" | "large" | "xl" | "xxl";
  valueWeight?: "regular" | "medium" | "semibold" | "bold";
  valueColor?: string;
  labelSize?: "xs" | "small" | "medium";
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text size={labelSize} dimRate="65%">
        {label}
      </Text>
      <View style={styles.valueWrap}>
        {icon}
        <Text
          size={valueSize}
          weight={valueWeight}
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(20),
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
    gap: rs(10),
  },
  valueWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
});