// components/sections/createShipment/doorToDoor/MethodOptionCard.tsx

import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface MethodOptionCardProps {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}

export const MethodOptionCard = ({ title, subtitle, selected, onPress }: MethodOptionCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
    >
      <Text size="medium" weight="bold" style={[styles.title, selected && styles.titleSelected]}>
        {title}
      </Text>

      <Text size="xs" weight="semibold" style={[styles.subtitle, selected && styles.subtitleSelected]}>
        {subtitle}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: Colors.white,

    borderRadius: rs(20),
    borderWidth: 1.5,
    borderColor: "transparent",

    paddingVertical: rvs(16),
    paddingHorizontal: rs(6),

    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF1E9",
  },

  pressed: {
    opacity: 0.85,
  },

  title: {
    color: Colors.text,
    marginBottom: rvs(4),
  },

  titleSelected: {
    color: Colors.primary,
  },

  subtitle: {
    color: Colors.textSecondary,
    textAlign: "center",
  },

  subtitleSelected: {
    color: Colors.primary,
  },
});
