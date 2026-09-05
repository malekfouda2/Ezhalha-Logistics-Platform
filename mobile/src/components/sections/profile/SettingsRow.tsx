import React from "react";
import { Pressable, StyleSheet, View, I18nManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackground?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
  danger?: boolean;
}

export function SettingsRow({
  icon,
  iconColor = Colors.primary,
  iconBackground = "#FFF1E8",
  title,
  subtitle,
  onPress,
  right,
  showChevron = true,
  danger = false,
}: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}
    >
      <View
        style={[
          styles.iconBox,
          { backgroundColor: danger ? "#FDE8E8" : iconBackground },
        ]}
      >
        <Ionicons
          name={icon}
          size={rs(19)}
          color={danger ? Colors.error : iconColor}
        />
      </View>

      <View style={styles.textBlock}>
        <Text
          size="medium"
          weight="bold"
          style={danger ? styles.dangerTitle : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text size="small" dimRate="55%" style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}

      {!right && showChevron && onPress ? (
        <Ionicons
          name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
          size={rs(18)}
          color={Colors.textSecondary}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(13),
    gap: rs(12),
  },
  pressed: {
    opacity: 0.6,
  },
  iconBox: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  subtitle: {
    marginTop: rvs(2),
  },
  dangerTitle: {
    color: Colors.error,
  },
});
