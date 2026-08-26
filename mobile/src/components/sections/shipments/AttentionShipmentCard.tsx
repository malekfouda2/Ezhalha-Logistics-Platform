// components/sections/shipments/AttentionShipmentCard.tsx

import { Pressable, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";

interface AttentionMeta {
  label: string;
  bg: string;
  color: string;
  accentColor: string;
  reason: string;
  actionLabel: string;
}

// Derives the "Attention" card copy from shipment status/carrier error fields.
// Adjust the status strings and messages to match what your backend actually sends.
function getAttentionMeta(shipment: Shipment): AttentionMeta {
  const s = shipment.status.toLowerCase();

  if (s === "on_hold" || s === "customs_hold") {
    return {
      label: "Customs hold",
      bg: "#FEE2E2",
      color: "#B91C1C",
      accentColor: "#B91C1C",
      reason:
        shipment.carrierErrorMessage ??
        "Awaiting an updated commercial invoice",
      actionLabel: "Fix it",
    };
  }

  if (s === "carrier_error" || shipment.pickupStatus === "failed") {
    return {
      label: "Pickup failed",
      bg: "#FEF3C7",
      color: "#92400E",
      accentColor: "#F59E0B",
      reason:
        shipment.pickupError ?? "Driver could not collect — rebook a slot",
      actionLabel: "Rebook",
    };
  }

  if (s === "returned") {
    return {
      label: "Returned",
      bg: "#FEE2E2",
      color: "#B91C1C",
      accentColor: "#B91C1C",
      reason: shipment.carrierErrorMessage ?? "Shipment returned to sender",
      actionLabel: "View details",
    };
  }

  return {
    label: "Needs attention",
    bg: "#FEF3C7",
    color: "#92400E",
    accentColor: "#F59E0B",
    reason: shipment.carrierErrorMessage ?? "This shipment needs your review",
    actionLabel: "Review",
  };
}

// Formats a relative "time ago" string from a Date. Swap for your date lib
// (date-fns, dayjs, etc.) if you already use one elsewhere in the app.
function formatRelativeTime(date?: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours} h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} d ago`;
}

export interface AttentionShipmentCardProps {
  shipment: Shipment;
  onPress: () => void;
  onActionPress?: () => void;
}

export function AttentionShipmentCard({
  shipment,
  onPress,
  onActionPress,
}: AttentionShipmentCardProps) {
  const meta = getAttentionMeta(shipment);
  const timeAgo = formatRelativeTime(
    shipment.statusChangedAt ?? shipment.updatedAt,
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={[styles.accentBar, { backgroundColor: meta.accentColor }]} />

      <View style={styles.content}>
        <View style={styles.topRow}>
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
                  style={{ color: Colors.primary }}
                >
                  Quotation
                </Text>
              </View>
            )}
            <Text size="small" weight="bold">
              {shipment.trackingNumber}
            </Text>

         
          </View>

          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <Text size="xs" weight="semibold" style={{ color: meta.color }}>
              {meta.label}
            </Text>
          </View>
        </View>

        <Text size="small" dimRate="65%" style={styles.reasonText}>
          {meta.reason}
        </Text>

        <View style={styles.divider} />

        <View style={styles.bottomRow}>
          <Text size="xs" dimRate="55%">
            {timeAgo}
          </Text>

          <Pressable
            onPress={onActionPress ?? onPress}
            hitSlop={8}
            style={styles.actionRow}
          >
            <Text size="small" weight="bold" style={{ color: Colors.primary }}>
              {meta.actionLabel}
            </Text>
            <Feather
              name="arrow-right"
              size={rs(14)}
              color={Colors.primary}
              style={styles.actionIcon}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    marginBottom: rvs(10),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rvs(2) },
    shadowOpacity: 0.05,
    shadowRadius: rs(6),
    elevation: 2,
  },

  accentBar: {
    width: rs(4),
  },

  content: {
    flex: 1,
    padding: rs(14),
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(8),
  },
  trackingRow: {
    gap: rs(7),
  },

  quoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    paddingHorizontal: rs(7),
    paddingVertical: rvs(3),
    borderRadius: rs(8),
    backgroundColor: setOpacity(Colors.primary, 0.1),
  },
  statusPill: {
    paddingHorizontal: rs(9),
    paddingVertical: rvs(4),
    borderRadius: rs(10),
  },

  reasonText: {
    marginBottom: rvs(10),
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: rvs(10),
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  actionIcon: {
    marginStart: rs(4),
  },
});
