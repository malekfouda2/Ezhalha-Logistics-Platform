// components/shipment/ShipmentOptionCard.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface ShipmentOptionCardProps {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}

export const ShipmentOptionCard = ({
  title,
  description,
  selected,
  onPress,
}: ShipmentOptionCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.textContainer}>
        <Text size="medium" weight="bold" style={styles.title}>
          {title}
        </Text>

        <Text size="small" style={styles.description}>
          {description}
        </Text>
      </View>

      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: rvs(50),

    backgroundColor: Colors.white,

    borderRadius: rs(22),

    paddingHorizontal: rs(15),
    paddingVertical: rvs(15),

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    marginBottom: rvs(10),

    borderWidth: 1.5,
    borderColor: "transparent",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 6,

    elevation: 1,
  },

  pressed: {
    opacity: 0.85,
  },

  textContainer: {
    flex: 1,
    paddingEnd: rs(20),
  },

  title: {
    color: Colors.text,
  },

  description: {
    color: "#687994",
  },

  radioOuter: {
    width: rs(25),
    height: rs(25),

    borderRadius: 50,

    borderWidth: 2,
    borderColor: "#E9EDF2",

    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: Colors.primary,
  },

  radioInner: {
    width: rs(12),
    height: rs(12),

    borderRadius: 50,

    backgroundColor: Colors.primary,
  },
});
