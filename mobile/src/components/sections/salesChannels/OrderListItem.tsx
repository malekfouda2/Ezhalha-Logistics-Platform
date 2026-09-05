import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { parseOrderJson, type OrderRow } from "@/lib/services/orders";

const STATUS_COLORS: Record<OrderRow["status"], { bg: string; text: string }> = {
  new: { bg: "#FFF3E0", text: "#B4650A" },
  assigned: { bg: "#E3F2FD", text: "#1565C0" },
  shipped: { bg: "#F3E8FF", text: "#7E22CE" },
  delivered: { bg: "#E7F7EE", text: "#1E9E5A" },
  cancelled: { bg: "#FDE8E8", text: Colors.error },
};

export function OrderListItem({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  const { t } = useTranslation();
  const customer = parseOrderJson<{ name?: string }>(order.customer);
  const shipTo = parseOrderJson<{ city?: string; region?: string }>(order.shipTo);
  const canFulfill = !order.shipmentId && order.status !== "cancelled";
  const statusColor = STATUS_COLORS[order.status];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text size="small" weight="bold" style={styles.orderNumber}>
          #{order.externalOrderNumber || order.externalOrderId}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text size="xs" weight="bold" style={{ color: statusColor.text }}>
            {t(`salesChannels.orders.status.${order.status}`)}
          </Text>
        </View>
      </View>

      <Text size="medium" weight="bold" style={styles.customerName} numberOfLines={1}>
        {customer.name || t("salesChannels.orders.unknownCustomer")}
      </Text>
      <Text size="small" dimRate="55%" numberOfLines={1}>
        {[shipTo.city, shipTo.region].filter(Boolean).join(", ") || "—"} · {t("salesChannels.orders.pieces", { count: order.packagePieces })}
        {order.packageWeightKg ? ` · ${Number(order.packageWeightKg)} kg` : ""}
      </Text>

      <View style={styles.footerRow}>
        <Text size="xs" dimRate="55%" style={styles.carrierHint} numberOfLines={1}>
          {order.assignedCarrierCode
            ? t("salesChannels.orders.carrierAssigned", { carrier: order.assignedCarrierCode })
            : t("salesChannels.orders.carrierPending")}
        </Text>

        {canFulfill ? (
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.fulfillButton, pressed && styles.fulfillButtonPressed]}
          >
            <Text size="small" weight="bold" style={styles.fulfillButtonText}>
              {t("salesChannels.orders.fulfill")}
            </Text>
          </Pressable>
        ) : order.shipmentId ? (
          <Pressable onPress={onPress}>
            <Text size="small" weight="bold" style={styles.trackLink}>
              {t("salesChannels.orders.track")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(12),
    gap: rvs(4),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderNumber: {
    color: Colors.textSecondary,
  },
  statusBadge: {
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(3),
  },
  customerName: {
    marginTop: rvs(2),
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: rvs(10),
    paddingTop: rvs(10),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  carrierHint: {
    flex: 1,
  },
  fulfillButton: {
    backgroundColor: Colors.primary,
    borderRadius: rs(20),
    paddingHorizontal: rs(16),
    paddingVertical: rvs(8),
  },
  fulfillButtonPressed: {
    opacity: 0.85,
  },
  fulfillButtonText: {
    color: Colors.white,
  },
  trackLink: {
    color: Colors.primary,
  },
});
