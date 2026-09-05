import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSelectProps {
  label?: string;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
}

export function ChipSelect({ label, options, value, onChange }: ChipSelectProps) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View style={styles.chipsRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text size="xs" weight="bold" style={selected ? styles.chipLabelSelected : styles.chipLabel}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: rvs(14),
  },
  label: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(8),
  },
  chip: {
    paddingHorizontal: rs(14),
    paddingVertical: rvs(9),
    borderRadius: rs(20),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF3EC",
  },
  chipLabel: {
    color: Colors.textSecondary,
  },
  chipLabelSelected: {
    color: Colors.primary,
  },
});
