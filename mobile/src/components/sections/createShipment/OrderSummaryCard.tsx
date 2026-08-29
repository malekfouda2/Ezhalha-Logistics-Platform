// components/sections/createShipment/express/OrderSummaryCard.tsx

import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SaudiRiyal } from "lucide-react-native";

export interface OrderSummaryLine {
  label: string;
  value: string;
}

interface OrderSummaryCardProps {
  lines: OrderSummaryLine[];
  total: string;
  currencySymbol?: string;
}

export const OrderSummaryCard = ({
  lines,
  total,
  currencySymbol = "ريال",
}: OrderSummaryCardProps) => {
  return (
    <View style={styles.card}>
      {lines.map((line) => (
        <View key={line.label} style={styles.row}>
          <Text size="small" style={styles.label}>
            {line.label}
          </Text>
          <View style={styles.priceRow}>
            <SaudiRiyal size={rs(18)} />
            <Text size="small" weight="semibold" style={styles.value}>
              {line.value}
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text size="large" weight="bold" style={styles.totalLabel}>
          Total
        </Text>
        <View style={styles.priceRow}>
          <SaudiRiyal size={rs(20)} color={Colors.primary} />
          <Text size="medium" weight="bold" style={styles.totalValue}>
            {total}
          </Text>
        </View>
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
    paddingVertical: rvs(15),
    marginBottom: rvs(10),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(5),
  },

  label: {
    color: "#687994",
  },

  value: {
    color: Colors.text,
    paddingStart: rvs(2),
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: rvs(8),
  },

  totalLabel: {
    color: Colors.text,
  },

  totalValue: {
    color: Colors.primary,
    paddingStart: rvs(2),
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
