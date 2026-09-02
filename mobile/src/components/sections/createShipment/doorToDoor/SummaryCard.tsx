// components/sections/createShipment/doorToDoor/SummaryCard.tsx
// Same visual language as OrderSummaryCard, extended with a `note` row (e.g. "Included")
// for lines that aren't a currency amount.

import React from "react";
import { StyleSheet, View } from "react-native";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface SummaryRow {
  label: string;
  value?: string;
  note?: string;
}

interface SummaryCardProps {
  rows: SummaryRow[];
  total?: { label: string; value: string };
}

export const SummaryCard = ({ rows, total }: SummaryCardProps) => {
  return (
    <View style={styles.card}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text size="small" style={styles.label}>
            {row.label}
          </Text>

          {row.note ? (
            <Text size="small" weight="bold" style={styles.note}>
              {row.note}
            </Text>
          ) : (
            <View style={styles.priceRow}>
              <SaudiRiyal size={rs(18)} />
              <Text size="small" weight="semibold" style={styles.value}>
                {row.value}
              </Text>
            </View>
          )}
        </View>
      ))}

      {total ? (
        <>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text size="large" weight="bold" style={styles.totalLabel}>
              {total.label}
            </Text>

            <View style={styles.priceRow}>
              <SaudiRiyal size={rs(20)} color={Colors.primary} />
              <Text size="medium" weight="bold" style={styles.totalValue}>
                {total.value}
              </Text>
            </View>
          </View>
        </>
      ) : null}
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

  note: {
    color: Colors.text,
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
