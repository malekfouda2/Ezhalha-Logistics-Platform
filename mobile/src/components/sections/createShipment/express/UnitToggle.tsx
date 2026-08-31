// components/sections/createShipment/express/UnitToggle.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SelectOption } from "@/constants/packageOptions";

interface UnitToggleProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

export const UnitToggle = ({ options, value, onChange }: UnitToggleProps) => {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.pill, selected && styles.pillSelected]}
          >
            <Text
              size="small"
              weight="bold"
              style={selected ? styles.labelSelected : styles.label}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    borderWidth: 1,
    borderColor: Colors.border,
    padding: rs(4),
    gap: rs(4),
  },

  pill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rs(14),
    paddingVertical: rvs(10),
  },

  pillSelected: {
    backgroundColor: Colors.primary,
  },

  label: {
    color: Colors.text,
  },

  labelSelected: {
    color: Colors.white,
  },
});
