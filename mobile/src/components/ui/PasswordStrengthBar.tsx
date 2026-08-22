import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import {
  getPasswordStrength,
  strengthToFilledBars,
} from "@/utils/passwordStrength";

const TOTAL_BARS = 3;

const STRENGTH_COLOR: Record<string, string> = {
  weak: "#E53E3E",
  medium: "#DD6B20",
  strong: "#38A169",
};

const STRENGTH_LABEL_KEY: Record<string, string> = {
  weak: "resetPassword.strength.weak",
  medium: "resetPassword.strength.medium",
  strong: "resetPassword.strength.strong",
};

export const PasswordStrengthBar = ({ password }: { password: string }) => {
  const { t } = useTranslation();

  if (!password) return null;

  const strength = getPasswordStrength(password);
  const filledBars = strengthToFilledBars(strength);
  const color = STRENGTH_COLOR[strength];

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {Array.from({ length: TOTAL_BARS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: i < filledBars ? color : Colors.border },
            ]}
          />
        ))}
      </View>
      <Text size="small" weight="regular" style={{ color, marginTop: rvs(6) }}>
        {t(STRENGTH_LABEL_KEY[strength])}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: rvs(20),
  },
  barsRow: {
    flexDirection: "row",
    gap: rs(6),
  },
  bar: {
    flex: 1,
    height: rvs(4),
    borderRadius: rs(2),
  },
});