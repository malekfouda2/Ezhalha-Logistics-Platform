// components/sections/createShipment/express/ToggleCard.tsx

import React from "react";
import { StyleSheet, Switch, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface ToggleCardProps {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export const ToggleCard = ({
  title,
  description,
  value,
  onValueChange,
}: ToggleCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.textContainer}>
        <Text size="medium" weight="bold" style={styles.title}>
          {title}
        </Text>
        <Text size="small" style={styles.description}>
          {description}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.border, true: Colors.primary }}
        thumbColor={Colors.white}
        ios_backgroundColor={Colors.border}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    backgroundColor: Colors.white,
    borderRadius: rs(20),

    paddingHorizontal: rs(15),
    paddingVertical: rvs(12),

    marginBottom: rvs(15),
  },

  textContainer: {
    flex: 1,
  },

  title: {
    color: Colors.text,
  },

  description: {
    color: Colors.textSecondary,
  },
});
