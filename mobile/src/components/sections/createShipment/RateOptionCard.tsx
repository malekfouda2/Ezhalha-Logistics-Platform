// components/sections/createShipment/express/RateOptionCard.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SaudiRiyal } from "lucide-react-native";

interface RateOptionCardProps {
  carrierCode: string;
  carrierColor: string;
  serviceName: string;
  deliveryLabel: string;
  price: string;
  currencySymbol?: string;
  badge?: "cheapest" | "selected";
  selected?: boolean;
  onPress: () => void;
}

export const RateOptionCard = ({
  carrierCode,
  carrierColor,
  serviceName,
  deliveryLabel,
  price,
  currencySymbol = "ريال",
  badge,
  selected = false,
  onPress,
}: RateOptionCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {selected ? (
        <View style={styles.selectedBadge}>
          <Text size="xs" weight="bold" style={styles.selectedBadgeText}>
            SELECTED
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={[styles.logo, { backgroundColor: carrierColor }]}>
          <Text size="xs" weight="bold" style={styles.logoText}>
            {carrierCode}
          </Text>
        </View>

        <View style={styles.info}>
          <Text size="medium" weight="bold" style={styles.serviceName}>
            {serviceName}
          </Text>

          {badge === "cheapest" ? (
            <View style={styles.cheapestPill}>
              <Text size="xs" weight="bold" style={styles.cheapestText}>
                CHEAPEST
              </Text>
            </View>
          ) : null}

          <Text size="xs" weight="semibold" style={styles.delivery}>
            {deliveryLabel}
          </Text>
        </View>

        <View style={styles.priceContainer}>
          <View style={styles.priceRow}>
            <SaudiRiyal size={rs(20)} />
            <Text size="large" weight="bold" style={styles.price}>
              {price}
            </Text>
          </View>
          <Text size="xs" style={styles.vatLabel}>
            incl. VAT
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    borderWidth: 1.5,
    borderColor: "transparent",
    padding: rs(15),
    marginBottom: rvs(16),
  },

  cardSelected: {
    borderColor: Colors.primary,
  },

  selectedBadge: {
    position: "absolute",
    top: rvs(-10),
    right: rs(16),

    backgroundColor: Colors.primary,
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(2),
  },

  selectedBadgeText: {
    color: Colors.white,
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  logo: {
    width: rs(45),
    height: rs(45),
    borderRadius: rs(15),
    alignItems: "center",
    justifyContent: "center",
    marginEnd: rs(10),
  },

  logoText: {
    color: Colors.white,
  },

  info: {
    flex: 1,
  },

  serviceName: {
    color: Colors.text,
  },

  cheapestPill: {
    alignSelf: "flex-start",
    backgroundColor: "#DDF5E4",
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rvs(2),
    marginBottom: rvs(4),
  },

  cheapestText: {
    color: "#1E8A4C",
    letterSpacing: 0.5,
  },

  delivery: {
    color: "#687994",
  },

  priceContainer: {
    alignItems: "flex-end",
  },

  price: {
    color: Colors.text,
    paddingTop: rvs(3),
    paddingStart: rs(2),
  },

  vatLabel: {
    color: "#8A93A3",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalPrice: {
    paddingStart: rvs(2),
    color: Colors.text,
  },
});
