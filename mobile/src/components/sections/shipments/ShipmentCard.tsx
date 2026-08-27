import { memo } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";
import { normalizeCountryCode } from "@shared/countries";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface ShipmentCardProps {
  shipment: Shipment;
  onPress: () => void;
}

export const ShipmentCard = memo(function ShipmentCard({
  shipment,
  onPress,
}: ShipmentCardProps) {
  const { i18n, t } = useTranslation();

  const isRTL = i18n.dir() === "rtl";

  const senderCountryCode =
    normalizeCountryCode(shipment.senderCountry) ?? shipment.senderCountry;

  const recipientCountryCode =
    normalizeCountryCode(shipment.recipientCountry) ??
    shipment.recipientCountry;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      {/* Header */}
      <View style={styles.cardTopRow}>
        <View style={styles.trackingRow}>
          {shipment.isQuote && (
            <View style={styles.quoteBadge}>
              <Feather
                name="file-text"
                size={rs(11)}
                color={Colors.primary}
              />

              <Text
                size="xs"
                weight="semibold"
                style={styles.quoteBadgeText}
              >
                {t("shipments.quotationBadge")}
              </Text>
            </View>
          )}

          <Text size="small" weight="bold">
            {shipment.trackingNumber}
          </Text>
        </View>

        <StatusBadge status={shipment.status} />
      </View>

      {/* Route */}
      <View style={styles.routeRow}>
        {/* Sender */}
        <View style={styles.routeSide}>
          <Text size="small" weight="bold">
            {shipment.senderCity}
          </Text>

          <Text size="xs" dimRate="60%">
            {senderCountryCode}
          </Text>
        </View>

        {/* Route Line */}
        <View style={styles.routeMiddle}>
          <View style={styles.dashedLine} />

          <MaterialIcons
            name={isRTL ? "arrow-back-ios" : "arrow-forward-ios"}
            size={rs(18)}
            color={Colors.border}
          />

          <View style={styles.routeIconCircle}>
            <Feather
              name="hexagon"
              size={rs(15)}
              color={Colors.primary}
            />
          </View>
        </View>

        {/* Recipient */}
        <View style={styles.routeSideRight}>
          <Text
            size="small"
            weight="bold"
            style={styles.recipientCity}
          >
            {shipment.recipientCity}
          </Text>

          <Text size="xs" dimRate="60%">
            {recipientCountryCode}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Footer */}
      <View style={styles.cardBottomRow}>
        <Text size="xs" dimRate="60%" style={styles.carrierText}>
          {shipment.carrierName ?? "Carrier"} · {shipment.recipientName}
        </Text>

        <View style={styles.priceContainer}>
          <SaudiRiyal
            size={rs(14)}
            style={styles.currencyIcon}
          />

          <Text size="small" weight="bold">
            {shipment.finalPrice}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(10),

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: rvs(2),
    },
    shadowOpacity: 0.05,
    shadowRadius: rs(6),

    elevation: 2,
  },

  cardPressed: {
    opacity: 0.9,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(12),
  },

  trackingRow: {
    gap: rs(7),
    flexShrink: 1,
  },

  quoteBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),

    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),

    borderRadius: 999,
    borderWidth: 1,

    backgroundColor: setOpacity(Colors.primary, 0.1),
    borderColor: Colors.primary,
  },

  quoteBadgeText: {
    color: Colors.primary,
  },

  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  routeSide: {
    flexShrink: 0,
    maxWidth: "30%",
  },

  routeSideRight: {
    flexShrink: 0,
    maxWidth: "30%",
    alignItems: "flex-end",
  },

  recipientCity: {
    textAlign: "right",
  },

  routeMiddle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",

    marginHorizontal: rs(6),
  },

  dashedLine: {
    flex: 1,

    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,

    marginHorizontal: rs(4),
  },

  routeIconCircle: {
    width: rs(30),
    height: rs(30),

    borderRadius: rs(15),

    backgroundColor: setOpacity(
      Colors.primary,
      0.12,
    ),

    alignItems: "center",
    justifyContent: "center",

    marginHorizontal: rs(5),
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: rvs(10),
  },

  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    gap: rs(8),
  },

  carrierText: {
    flex: 1,
  },

  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },

  currencyIcon: {
    marginRight: rs(3),
  },
});