// components/sections/shipments/ShipmentCard.tsx

import { useState } from "react";
import { Pressable, View, StyleSheet, LayoutChangeEvent } from "react-native";
import { Feather, MaterialIcons, AntDesign } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";
import { normalizeCountryCode } from "@shared/countries";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

function getStatusMeta(status: string): {
  label: string;
  bg: string;
  color: string;
} {
  const s = status.toLowerCase();
  if (s === "delivered") {
    return { label: "Delivered", bg: "#DCFCE7", color: "#15803D" };
  }
  if (["on_hold", "returned", "carrier_error"].includes(s)) {
    return { label: "Attention", bg: "#FEE2E2", color: "#B91C1C" };
  }
  if (["draft", "payment_pending", "created", "processing"].includes(s)) {
    return { label: "Processing", bg: "#FEF3C7", color: "#92400E" };
  }
  return { label: "In Transit", bg: "#DBEAFE", color: "#1D4ED8" };
}

const DASH_SIZE = rs(20);
const DASH_GAP = rs(2); // approximate spacing AntDesign's "dash" glyph already carries
const ICON_CIRCLE_WIDTH = rs(30) + rs(5) * 2; // width + horizontal margin
const ARROW_WIDTH = rs(20);
const RESERVED_WIDTH = ICON_CIRCLE_WIDTH + ARROW_WIDTH;

export interface ShipmentCardProps {
  shipment: Shipment;
  onPress: () => void;
}

export function ShipmentCard({ shipment, onPress }: ShipmentCardProps) {
  const [dashCount, setDashCount] = useState(4);
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const statusMeta = getStatusMeta(shipment.status);
  const senderCountryCode =
    normalizeCountryCode(shipment.senderCountry) ?? shipment.senderCountry;
  const recipientCountryCode =
    normalizeCountryCode(shipment.recipientCountry) ??
    shipment.recipientCountry;

  const handleMiddleLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    const availableForDashes = width - RESERVED_WIDTH;
    const count = Math.max(1, Math.floor(availableForDashes / (DASH_SIZE + DASH_GAP)));
    if (count !== dashCount) {
      setDashCount(count);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.cardTopRow}>
        <Text size="small" weight="bold">
          {shipment.trackingNumber}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
          <Text size="xs" weight="semibold" style={{ color: statusMeta.color }}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeSide}>
          <Text size="small" weight="bold">
            {shipment.senderCity}
          </Text>
          <Text size="xs" dimRate="60%">
            {senderCountryCode}
          </Text>
        </View>

        <View style={styles.routeMiddle} onLayout={handleMiddleLayout}>
          {Array.from({ length: dashCount }).map((_, i) => (
            <AntDesign key={i} name="dash" size={DASH_SIZE} color={Colors.border} />
          ))}

          <MaterialIcons
            name={isRTL ? "arrow-back-ios" : "arrow-forward-ios"}
            size={rs(20)}
            color={Colors.border}
          />
          <View style={styles.routeIconCircle}>
            <Feather name={"hexagon"} size={rs(15)} color={Colors.primary} />
          </View>
        </View>

        <View style={[styles.routeSide, { alignItems: "flex-end" }]}>
          <Text size="small" weight="bold" style={{ flexWrap: "wrap" }}>
            {shipment.recipientCity}
          </Text>
          <Text size="xs" dimRate="60%">
            {recipientCountryCode}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.cardBottomRow}>
        <Text size="xs" dimRate="60%" style={{ flex: 1 }}>
          {shipment.carrierName ?? "Carrier"} · {shipment.recipientName}
        </Text>
        <View style={styles.priceContainer}>
          <SaudiRiyal size={rs(14)} style={styles.currencyIcon} />

          <Text size="small" weight="bold">
            {shipment.finalPrice}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rvs(2) },
    shadowOpacity: 0.05,
    shadowRadius: rs(6),
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(12),
  },
  statusPill: {
    paddingHorizontal: rs(9),
    paddingVertical: rvs(4),
    borderRadius: rs(10),
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeSide: {},
  routeMiddle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    position: "relative",
    marginHorizontal: rs(6),
    overflow: "hidden",
  },
  routeIconCircle: {
    width: rs(30),
    height: rs(30),
    borderRadius: 50,
    backgroundColor: setOpacity(Colors.primary, 0.12),
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
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyIcon: {
    marginRight: rs(3),
  },
});