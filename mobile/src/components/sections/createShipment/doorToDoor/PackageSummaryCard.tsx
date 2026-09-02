// components/sections/createShipment/doorToDoor/PackageSummaryCard.tsx

import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface PackageSummaryRow {
  label: string;
  value: string;
}

interface PackageSummaryCardProps {
  rows: PackageSummaryRow[];
}

export const PackageSummaryCard = ({ rows }: PackageSummaryCardProps) => {
  return (
    <View style={styles.card}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text size="small" style={styles.label}>
            {row.label}
          </Text>

          <Text size="medium" weight="bold" style={styles.value}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    paddingHorizontal: rs(18),
    paddingVertical: rvs(6),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(10),
  },

  label: {
    color: Colors.textSecondary,
  },

  value: {
    color: Colors.text,
  },
});
