// components/sections/createShipment/express/CustomsSummaryCard.tsx

import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SaudiRiyal } from "lucide-react-native";

interface CustomsSummaryCardProps {
  itemCount: number;
  unitCount: number;
  totalPrice: string;
  declaredValue: string;
  declaredCurrency?: string;
}

export const CustomsSummaryCard = ({
  itemCount,
  unitCount,
  totalPrice,
  declaredValue,
  declaredCurrency = "USD",
}: CustomsSummaryCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text size="small" weight="semibold" style={styles.label}>
          {itemCount} items · {unitCount} units
        </Text>

        <View style={styles.priceRow}>
          <SaudiRiyal size={rs(20)} />
          <Text size="medium" weight="bold" style={styles.totalPrice}>
            {totalPrice}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text size="small" weight="semibold" style={styles.label}>
          Declared value
        </Text>

        <Text size="medium" weight="bold" style={styles.value}>
          {declaredCurrency} {declaredValue}
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
    paddingVertical: rvs(10),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(5),
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalPrice: {
    paddingStart: rvs(2),
    color: Colors.text,
  },
  label: {
    color: Colors.textSecondary,
  },

  value: {
    color: Colors.text,
  },
});
