// app/create-shipment/express/step-9.tsx

import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentFooter";

export default function ShipmentConfirmationScreen() {
  const router = useRouter();

  const shipmentId = "EZH977158300";
  const carrier = "FedEx";
  const trackingNumber = "7940 5613 3021";
  const status = "Processing";

  const handleTrackShipment = () => {
    router.push("/(tabs)/shipments");
  };

  return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.successCircle}>
            <Feather name="check" size={rs(40)} color="#2FB463" />
          </View>

          <Text
            size="xxl"
            weight="bold"
            style={styles.title}
          >
            Shipment Created{"\n"}Successfully!
          </Text>

          <Text size="small" weight="semibold" style={styles.subtitle}>
            Your shipment has been booked with the carrier.
          </Text>

          <View style={styles.idCard}>
            <Text size="xs" weight="bold" style={styles.idLabel}>
              SHIPMENT ID
            </Text>

            <Text size="medium" weight="bold" style={styles.idValue}>
              {shipmentId}
            </Text>

            <View style={styles.divider} />

            <View style={styles.trackingRow}>
              <Text size="small" weight="semibold" style={styles.trackingText}>
                {carrier} · {trackingNumber}
              </Text>

              <View style={styles.statusPill}>
                <Text size="xs" weight="bold" style={styles.statusText}>
                  {status}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.docRow}>
            <View style={styles.docButton}>
              <Feather name="file-text" size={rs(18)} color={Colors.text} />
              <Text size="medium" weight="bold" style={styles.docLabel}>
                Label
              </Text>
            </View>

            <View style={styles.docButton}>
              <Feather name="file-text" size={rs(18)} color={Colors.text} />
              <Text size="medium" weight="bold" style={styles.docLabel}>
                Invoice
              </Text>
            </View>
          </View>
        </View>

        <ShipmentFooter title="Track shipment" onPress={handleTrackShipment}/>
      </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "space-between",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(20),
  },

  successCircle: {
    width: rs(80),
    height: rs(80),
    borderRadius: 50,
    backgroundColor: "#DDF5E4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(20),
  },

  title: {
    color: Colors.text,
    textAlign: "center",
    marginBottom: rvs(10),
  },

  subtitle: {
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: rvs(20),
  },

  idCard: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    paddingHorizontal: rs(20),
    paddingVertical: rvs(15),
    alignItems: "center",
    marginBottom: rvs(10),
  },

  idLabel: {
    color: "#687994",
    letterSpacing: 1,
    marginBottom: rvs(8),
  },

  idValue: {
    color: Colors.text,
    marginBottom: rvs(16),
  },

  divider: {
    width: "100%",
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: rvs(16),
  },

  trackingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  trackingText: {
    color: Colors.textSecondary,
  },

  statusPill: {
    backgroundColor: "#FDF3D6",
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(6),
  },

  statusText: {
    color: "#8A6D0F",
  },

  docRow: {
    flexDirection: "row",
    gap: rs(10),
    width: "100%",
  },

  docButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: Colors.white,
    borderRadius: rs(16),
    borderWidth: 1,
    borderColor: Colors.border,

    paddingVertical: rvs(12),
    gap: rs(8),
  },

  docLabel: {
    color: Colors.text,
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingBottom: rvs(10),
  },
});