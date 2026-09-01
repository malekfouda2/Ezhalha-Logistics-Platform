// components/sections/createShipment/express/PaymentMethodCard.tsx

import React, { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface PaymentMethodCardProps {
  title: string;
  subtitle: ReactNode;
  icon?: ReactNode;
  iconLabel?: string;
  iconBackground?: string;
  iconColor?: string;
  selected: boolean;
  onPress: () => void;
}

export const PaymentMethodCard = ({
  title,
  subtitle,
  icon,
  iconLabel,
  iconBackground = "#F2F3F5",
  iconColor = Colors.white,
  selected,
  onPress,
}: PaymentMethodCardProps) => {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      {/* Payment method icon */}
      <View style={[styles.icon, { backgroundColor: iconBackground }]}>
        {icon ? (
          icon
        ) : iconLabel ? (
          <Text size="xs" weight="bold" style={{ color: iconColor }}>
            {iconLabel}
          </Text>
        ) : null}
      </View>

      {/* Payment method information */}
      <View style={styles.info}>
        <Text size="small" weight="bold" style={styles.title}>
          {title}
        </Text>

        <View style={styles.subtitle}>
          {typeof subtitle === "string" ? (
            <Text
              size="xs"
              weight="semibold"
              style={styles.subtitleText}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
        </View>
      </View>

      {/* Radio button */}
      <View
        style={[
          styles.radioOuter,
          selected && styles.radioOuterSelected,
        ]}
      >
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(20),
    paddingHorizontal: rs(16),
    paddingVertical: rvs(14),
    marginBottom: rvs(16),
  },

  icon: {
    width: rs(50),
    height: rs(35),
    borderRadius: rs(7),
    alignItems: "center",
    justifyContent: "center",
    marginEnd: rs(14),
  },

  info: {
    flex: 1,
  },

  title: {
    color: Colors.text,
    marginBottom: rvs(2),
  },

  subtitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
  },

  subtitleText: {
    color: Colors.textSecondary,
  },

  radioOuter: {
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: Colors.primary,
  },

  radioInner: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
  },
});