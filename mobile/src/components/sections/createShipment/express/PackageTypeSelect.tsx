// components/sections/createShipment/express/PackageTypeSelect.tsx

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SelectOption } from "@/constants/packageOptions";

interface PackageTypeSelectProps {
  title: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

export const PackageTypeSelect = ({
  title,
  value,
  options,
  onChange,
}: PackageTypeSelectProps) => {
  const [visible, setVisible] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text size="medium" weight="semibold" style={styles.value}>
          {selectedLabel}
        </Text>

        <Feather name="chevron-down" size={rs(24)} color="#8CA0BC" />
      </Pressable>

      <BottomSheet visible={visible} onClose={() => setVisible(false)}>
        <Text size="xl" weight="bold" style={styles.title}>
          {title}
        </Text>

        <ScrollView style={styles.list}>
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setVisible(false);
                }}
                style={styles.option}
              >
                <Text size="medium" weight="semibold" style={styles.optionLabel}>
                  {option.label}
                </Text>

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
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    width: "100%",
    height: rvs(50),

    backgroundColor: Colors.white,

    borderRadius: rs(18),
    borderWidth: 1,
    borderColor: Colors.border,

    paddingHorizontal: rs(15),

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  value: {
    color: Colors.text,
  },

  pressed: {
    opacity: 0.8,
  },

  title: {
    color: Colors.text,
    marginBottom: rvs(12),
  },

  list: {
    maxHeight: rvs(400),
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    backgroundColor: Colors.white,
    borderRadius: rs(18),

    paddingHorizontal: rs(16),
    paddingVertical: rvs(16),
    marginBottom: rvs(10),
  },

  optionLabel: {
    flex: 1,
    color: Colors.text,
    marginEnd: rs(10),
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
