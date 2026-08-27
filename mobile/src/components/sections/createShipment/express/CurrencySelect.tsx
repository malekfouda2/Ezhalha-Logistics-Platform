// components/shipment/CurrencySelect.tsx

import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface CurrencySelectProps {
  value: string;
  onPress: () => void;
}

export const CurrencySelect = ({
  value,
  onPress,
}: CurrencySelectProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <Text
        size="medium"
        weight="semibold"
        style={styles.value}
      >
        {value}
      </Text>

      <Feather
        name="chevron-down"
        size={rs(24)}
        color="#8CA0BC"
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: rvs(55),

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
});