import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { Text } from "@/components/ui/Text";

interface StatusBadgeProps {
  status: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

type StatusColor =
  | "gray"
  | "purple"
  | "cyan"
  | "amber"
  | "blue"
  | "green"
  | "red"
  | "orange";

interface ColorStyle {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  dotColor: string;
}

const colorStyles: Record<StatusColor, ColorStyle> = {
  gray: {
    backgroundColor: "#6B7280",
    textColor: "#4B5563",
    borderColor: "#6B728033",
    dotColor: "#6B7280",
  },
  purple: {
    backgroundColor: "#A855F7",
    textColor: "#7E22CE",
    borderColor: "#A855F733",
    dotColor: "#A855F7",
  },
  cyan: {
    backgroundColor: "#06B6D4",
    textColor: "#0E7490",
    borderColor: "#06B6D433",
    dotColor: "#06B6D4",
  },
  amber: {
    backgroundColor: "#F59E0B",
    textColor: "#B45309",
    borderColor: "#F59E0B33",
    dotColor: "#F59E0B",
  },
  blue: {
    backgroundColor: "#3B82F6",
    textColor: "#1D4ED8",
    borderColor: "#3B82F633",
    dotColor: "#3B82F6",
  },
  green: {
    backgroundColor: "#22C55E",
    textColor: "#15803D",
    borderColor: "#22C55E33",
    dotColor: "#22C55E",
  },
  red: {
    backgroundColor: "#EF4444",
    textColor: "#B91C1C",
    borderColor: "#EF444433",
    dotColor: "#EF4444",
  },
  orange: {
    backgroundColor: "#F97316",
    textColor: "#C2410C",
    borderColor: "#F9731633",
    dotColor: "#F97316",
  },
};

const statusColors: Record<string, StatusColor> = {
  draft: "gray",
  payment_pending: "purple",
  created: "cyan",
  processing: "amber",
  picked_up: "blue",
  in_transit: "blue",
  customs_clearance: "amber",
  out_for_delivery: "blue",
  on_hold: "orange",
  returned: "orange",
  delivered: "green",
  cancelled: "red",
  carrier_error: "orange",
  pending: "amber",
  approved: "green",
  rejected: "red",
  completed: "green",
  failed: "red",
  active: "green",
  inactive: "gray",
  paid: "green",
  unpaid: "amber",
  refunded: "blue",

  // Dangerous goods manual flow (shared/dangerous-goods.ts) — dg_review/dg_awaiting_carrier
  // are pre-quote waiting states (amber, same bucket as payment_pending); dg_booking is paid
  // and waiting on an operator to record the air waybill, same bucket as "created".
  dg_review: "amber",
  dg_awaiting_carrier: "amber",
  dg_booking: "cyan",

  // Door-to-door manual flow (shared/domain.ts DdpShipmentStatus) — paid, waiting on an
  // operator to review before booking with the supplier.
  awaiting_review: "amber",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  payment_pending: "Awaiting Payment",
  created: "Booked",
  processing: "Processing",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  customs_clearance: "Customs Clearance",
  out_for_delivery: "Out for Delivery",
  on_hold: "On Hold",
  returned: "Returned to Shipper",
  delivered: "Delivered",
  cancelled: "Cancelled",
  carrier_error: "Carrier Error",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  failed: "Failed",
  active: "Active",
  inactive: "Inactive",
  paid: "Paid",
  unpaid: "Unpaid",
  refunded: "Refunded",

  dg_review: "Under Review",
  dg_awaiting_carrier: "With the Carrier",
  dg_booking: "Booking with the Carrier",

  awaiting_review: "Awaiting Review",
};

const liveStatuses = new Set([
  "processing",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "payment_pending",
  "pending",
  "dg_review",
  "dg_awaiting_carrier",
  "awaiting_review",
]);

export function StatusBadge({ status, style, textStyle }: StatusBadgeProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  const color = statusColors[status] ?? "amber";
  const colors = colorStyles[color];

  const label = statusLabels[status] ?? status;
  const isLive = liveStatuses.has(status);

  useEffect(() => {
    if (!isLive) {
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 2.2,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isLive, pulse]);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${colors.backgroundColor}1A`,
          borderColor: colors.borderColor,
        },
        style,
      ]}
    >
      <Text
        size="xs"
        weight="bold"
        style={[
          {
            color: colors.textColor,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,

    paddingHorizontal: 10,
    paddingVertical: 5,

    borderRadius: 999,
    borderWidth: 1,
  },

  dotContainer: {
    width: 6,
    height: 6,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: "absolute",
  },

  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: "absolute",
  },
});
