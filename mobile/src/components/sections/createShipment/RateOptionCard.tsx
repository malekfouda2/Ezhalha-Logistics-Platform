import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface RateOptionCardProps {
  carrierCode: string;
  carrierColor: string;
  serviceName: string;
  deliveryLabel: string;
  price: string;
  currencySymbol?: string;
  badge?: "cheapest" | "selected";
}

export const RateOptionCard = ({
  carrierCode,
  carrierColor,
  serviceName,
  deliveryLabel,
  price,
  badge,
}: RateOptionCardProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.logo, { backgroundColor: carrierColor }]}>
          <Text
            size="xs"
            weight="bold"
            style={styles.logoText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
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
                {t("createShipment.express.steps.step5.cheapest")}
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
            {t("createShipment.express.steps.step5.includingVat")}
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
    borderWidth: 1.5,
    borderColor: "transparent",
    padding: rs(15),
    marginVertical: rvs(8),
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
    minWidth: rs(45),
    maxWidth: rs(72),
    height: rs(45),
    paddingHorizontal: rs(6),
    borderRadius: rs(10),
    alignItems: "center",
    justifyContent: "center",
    marginEnd: rs(10),
  },

  logoText: {
    color: Colors.white,
    padding: rvs(4),
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
});
