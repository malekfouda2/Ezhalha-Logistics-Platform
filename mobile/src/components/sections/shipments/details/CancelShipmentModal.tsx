// components/sections/shipments/CancelShipmentModal.tsx

import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";
import { describeCancellationConsequences } from "@shared/cancellation";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/ui/BottomSheet";

export interface CancelShipmentModalProps {
  visible: boolean;
  shipment: Shipment | null;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelShipmentModal({
  visible,
  shipment,
  isPending,
  onConfirm,
  onClose,
}: CancelShipmentModalProps) {
  if (!shipment) return null;
  const { t } = useTranslation();

  // Same wording the web client shows (client/src/components/cancel-shipment-dialog.tsx) —
  // shared/cancellation.ts exists specifically so the automatic-refund vs.
  // refund-request-for-approval claim can't drift between the two clients or fall out of
  // sync with the server's own branch.
  const { effects } = describeCancellationConsequences({
    carrierStatus: shipment.carrierStatus,
    carrierName: shipment.carrierName,
    hasPickupBooked: Boolean(shipment.pickupConfirmationNumber),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.iconWrap}>
        <Feather name="alert-triangle" size={rs(22)} color="#DC2626" />
      </View>
      <Text size="medium" weight="bold" style={styles.title}>
        {t("shipments.cancel.title", { trackingNumber: shipment.trackingNumber })}
      </Text>

      <Text size="small" dimRate="65%" style={styles.subtitle}>
        {t("shipments.cancel.subtitle")}
      </Text>

      <View style={styles.card}>
        <Text size="small" weight="bold" style={styles.cardTitle}>
          {t("shipments.cancel.whatHappensNext")}
        </Text>

        {effects.map((effect, index) => (
          <View key={index} style={styles.effectRow}>
            <View style={styles.bullet} />
            <Text size="small" style={styles.effectText}>
              {effect}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.confirmButton,
          pressed && { opacity: 0.9 },
          isPending && { opacity: 0.6 },
        ]}
        onPress={onConfirm}
        disabled={isPending}
      >
        <Text size="medium" weight="bold" style={{ color: Colors.white }}>
          {isPending
            ? t("shipments.cancel.cancelling")
            : t("shipments.cancel.confirm")}
        </Text>
      </Pressable>
      <Pressable
        onPress={onClose}
        style={styles.keepButton}
        disabled={isPending}
      >
        <Text size="medium" weight="semibold" dimRate="65%">
          {t("shipments.cancel.keep")}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: rs(45),
    height: rs(45),
    borderRadius: rs(16),
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(16),
  },

  title: {
    marginBottom: rvs(8),
  },

  subtitle: {
    marginBottom: rvs(20),
    lineHeight: rvs(20),
  },

  card: {
    backgroundColor: Colors.background,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(20),
  },

  cardTitle: {
    marginBottom: rvs(8),
  },

  effectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    marginBottom: rvs(6),
  },

  bullet: {
    width: rs(4),
    height: rs(4),
    borderRadius: rs(2),
    backgroundColor: Colors.textSecondary,
    marginTop: rvs(7),
  },

  effectText: {
    flex: 1,
    lineHeight: rvs(18),
  },

  confirmButton: {
    width: "100%",
    height: rvs(56),
    borderRadius: rs(16),
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(14),
  },

  keepButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: rvs(6),
  },
});
