// components/sections/shipments/CancelShipmentModal.tsx

import { View, StyleSheet, Modal, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface CancelShipmentModalProps {
  visible: boolean;
  shipment: Shipment | null;
  isPending: boolean;
  cardLast4?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelShipmentModal({
  visible,
  shipment,
  isPending,
  cardLast4 = "4242",
  onConfirm,
  onClose,
}: CancelShipmentModalProps) {
  if (!shipment) return null;

  const paid = parseFloat(shipment.finalPrice as any) || 0;
  const cancellationFee = 0;
  const refund = paid - cancellationFee;
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.iconWrap}>
            <Feather name="alert-triangle" size={rs(22)} color="#DC2626" />
          </View>
          <Text size="medium" weight="bold" style={styles.title}>
            Cancel this shipment?
          </Text>
          <Text size="small" dimRate="65%" style={styles.subtitle}>
            The carrier booking and your pickup will both be cancelled.
          </Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text size="small" dimRate="65%">
                Paid
              </Text>
              <View style={styles.valueRow}>
                <SaudiRiyal
                  size={rs(13)}
                  color={Colors.text}
                  style={styles.riyalIcon}
                />
                <Text size="medium" weight="bold">
                  {paid.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.row}>
              <Text size="small" dimRate="65%">
                Cancellation fee
              </Text>
              <View style={styles.valueRow}>
                <SaudiRiyal
                  size={rs(13)}
                  color={Colors.text}
                  style={styles.riyalIcon}
                />
                <Text size="medium" weight="bold">
                  {cancellationFee.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text size="medium" weight="bold">
                Refund
              </Text>
              <View style={styles.valueRow}>
                <SaudiRiyal
                  size={rs(15)}
                  color={Colors.primary}
                  style={styles.riyalIcon}
                />
                <Text
                  size="large"
                  weight="bold"
                  style={{ color: Colors.primary }}
                >
                  {refund.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.infoBox}>
            <Feather
              name="info"
              size={rs(16)}
              color="#B45309"
              style={styles.infoIcon}
            />
            <Text size="xs" style={styles.infoText}>
              Refunded to card •••• {cardLast4} within 5–10 business days.
            </Text>
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
              {isPending ? "Cancelling..." : "Yes, cancel shipment"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={styles.keepButton}
            disabled={isPending}
          >
            <Text size="medium" weight="semibold" dimRate="65%">
              Keep it
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },

  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: rs(28),
    borderTopRightRadius: rs(28),
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(30),
  },

  grabber: {
    width: rs(40),
    height: rs(4),
    borderRadius: rs(2),
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: rvs(20),
  },

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
    backgroundColor: "white",
    borderRadius: rs(20),
    padding: rs(16),
    marginBottom: rvs(16),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rvs(4) },
    shadowOpacity: 0.1,
    shadowRadius: rs(6),
    elevation: 4,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(4),
  },

  valueRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  riyalIcon: {
    marginRight: rs(3),
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: rvs(6),
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fdf6ef",
    borderRadius: rs(12),
    padding: rs(12),
    marginBottom: rvs(20),
    gap: rs(8),
    borderWidth: 1,
    borderColor: "#fdebda",
  },

  infoIcon: {
    marginTop: rvs(2),
  },

  infoText: {
    flex: 1,
    color: "#B45309",
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
