// components/sections/createShipment/express/DashedActionButton.tsx

import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { rs, rvs } from "@/utils/responsive";

interface DashedActionButtonProps {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
}

export const DashedActionButton = ({
  label,
  icon,
  onPress,
}: DashedActionButtonProps) => {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Feather name={icon} size={rs(15)} color="#fe5200" />

      <Text
        size="small"
        weight="bold"
        style={styles.label}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1.5,
    borderColor: "#FFCDB6",
    borderStyle: "dashed",
    borderRadius: rs(18),

    backgroundColor: "#FFF9F6",

    paddingVertical: rvs(16),
    marginBottom: rvs(14),

    gap: rs(8),
  },

  label: {
    color: "#fe5200",
  },
});