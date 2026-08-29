// components/sections/createShipment/express/DatePill.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface DatePillProps {
  dayLabel: string;
  dateLabel: string;
  selected: boolean;
  onPress: () => void;
}

export const DatePill = ({
  dayLabel,
  dateLabel,
  selected,
  onPress,
}: DatePillProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      <Text
        size="medium"
        weight="bold"
        style={selected ? styles.dayTextSelected : styles.dayText}
      >
        {dayLabel}
      </Text>
      <Text
        size="small"
        style={selected ? styles.dateTextSelected : styles.dateText}
      >
        {dateLabel}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: Colors.white,
    borderRadius: rs(18),
    borderWidth: 1.5,
    borderColor: "transparent",

    paddingVertical: rvs(10),
  },

  pillSelected: {
    backgroundColor: "#FFF3EC",
    borderColor: Colors.primary,
  },

  dayText: {
    color: Colors.text,
  },

  dayTextSelected: {
    color: Colors.primary,
  },

  dateText: {
    color: "#687994",
    marginTop: rvs(2),
  },

  dateTextSelected: {
    color: Colors.primary,
    marginTop: rvs(2),
  },
});