// components/sections/createShipment/express/WeightSummaryCard.tsx

import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface WeightSummaryCardProps {
  actualWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  unit?: string;
}

export const WeightSummaryCard = ({
  actualWeight,
  volumetricWeight,
  chargeableWeight,
  unit = "kg",
}: WeightSummaryCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text size="small" style={styles.label}>
          Actual weight
        </Text>
        <Text size="small" weight="bold" style={styles.value}>
          {actualWeight.toFixed(1)} {unit}
        </Text>
      </View>

      <View style={styles.row}>
        <Text size="small" style={styles.label}>
          Volumetric weight
        </Text>
        <Text size="small" weight="bold" style={styles.value}>
          {volumetricWeight.toFixed(1)} {unit}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text size="medium" weight="bold" style={styles.chargeableLabel}>
          Chargeable weight
        </Text>
        <Text size="large" weight="bold" style={styles.chargeableValue}>
          {chargeableWeight.toFixed(1)} {unit}
        </Text>
      </View>
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
        paddingVertical: rvs(8),

  },

  label: {
    color: Colors.textSecondary,
  },

  value: {
    color: Colors.text,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  chargeableLabel: {
    color: Colors.text,
  },

  chargeableValue: {
    color: Colors.primary,
  },
});