import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface CarrierModeSelectProps {
  value: "manual" | "auto";
  onChange: (value: "manual" | "auto") => void;
}

export function CarrierModeSelect({ value, onChange }: CarrierModeSelectProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      {(["manual", "auto"] as const).map((mode) => {
        const selected = value === mode;
        const suffix = mode === "manual" ? "Manual" : "Auto";
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[styles.card, selected && styles.cardSelected]}
          >
            <Text size="medium" weight="bold" style={selected ? styles.titleSelected : undefined}>
              {t(`salesChannels.connect.carrierMode${suffix}`)}
            </Text>
            <Text size="xs" dimRate="55%" style={styles.description}>
              {t(`salesChannels.connect.carrierMode${suffix}Description`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: rs(10),
    marginBottom: rvs(14),
  },
  card: {
    flex: 1,
    borderRadius: rs(14),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    padding: rs(14),
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF3EC",
  },
  titleSelected: {
    color: Colors.primary,
  },
  description: {
    marginTop: rvs(4),
  },
});
