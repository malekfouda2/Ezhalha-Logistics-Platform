// components/sections/dashboard/RecentShipments.tsx
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";
import { SaudiRiyal } from "lucide-react-native";

const statusStyles: Record<
  string,
  { backgroundColor: string; color: string; label: string }
> = {
  draft: { backgroundColor: "#F1F2F4", color: "#65748B", label: "Draft" },
  pending: { backgroundColor: "#FFF3D6", color: "#9A7410", label: "Pending" },
  processing: {
    backgroundColor: "#FFF3D6",
    color: "#9A7410",
    label: "Processing",
  },
  in_transit: {
    backgroundColor: "#E4EEFF",
    color: "#2454B8",
    label: "In Transit",
  },
  out_for_delivery: {
    backgroundColor: "#E4EEFF",
    color: "#2454B8",
    label: "Out for Delivery",
  },
  delivered: {
    backgroundColor: "#E1F5E9",
    color: "#16713B",
    label: "Delivered",
  },
  cancelled: {
    backgroundColor: "#FBE3E3",
    color: "#B3261E",
    label: "Cancelled",
  },
};

const getStatusStyle = (status: string) =>
  statusStyles[status] ?? {
    backgroundColor: "#F1F2F4",
    color: "#65748B",
    label: status,
  };

type RecentShipmentsProps = {
  shipments?: Shipment[];
  isLoading?: boolean;
  onShipmentPress?: (shipment: Shipment) => void;
  seeAllHref?: string;
};

export const RecentShipments = ({
  shipments,
  isLoading,
  onShipmentPress,
  seeAllHref = "/shipments",
}: RecentShipmentsProps) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text size="large" weight="bold" style={styles.sectionTitle}>
          Recent Shipments
        </Text>

        <Pressable onPress={() => router.push(seeAllHref)}>
          <Text size="small" weight="bold" style={styles.seeAll}>
            See all
          </Text>
        </Pressable>
      </View>

      <View style={styles.shipmentsCard}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : !shipments || shipments.length === 0 ? (
          <View style={styles.loadingRow}>
            <Text size="small" style={{ color: "#65748B" }}>
              No shipments yet
            </Text>
          </View>
        ) : (
          shipments.map((shipment, index) => {
            const statusStyle = getStatusStyle(shipment.status);

            return (
              <Pressable
                key={shipment.id}
                onPress={() => onShipmentPress?.(shipment)}
                style={[
                  styles.shipmentRow,
                  index !== shipments.length - 1 && styles.shipmentBorder,
                ]}
              >
                <View style={styles.shipmentIcon}>
                  <Feather
                    name="hexagon"
                    size={rs(19)}
                    color={Colors.primary}
                  />
                </View>

                <View style={styles.shipmentInfo}>
                  <Text
                    size="medium"
                    weight="bold"
                    numberOfLines={1}
                    style={styles.shipmentName}
                  >
                    {shipment.recipientName}
                  </Text>

                  <Text
                    size="xs"
                    style={styles.shipmentDetails}
                    numberOfLines={1}
                  >
                    {shipment.trackingNumber} · {shipment.recipientCity}
                  </Text>
                </View>

                <View style={styles.shipmentRight}>
                  <View style={styles.priceContainer}>
                    <SaudiRiyal
                      size={rs(14)}
                      style={styles.currencyIcon}
                    />
                    <Text size="small" weight="bold" style={styles.price}>
                      {shipment.finalPrice}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.status,
                      { backgroundColor: statusStyle.backgroundColor },
                    ]}
                  >
                    <Text
                      size="xs"
                      weight="semibold"
                      style={{ color: statusStyle.color }}
                    >
                      {statusStyle.label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginVertical: rvs(18),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(10),
  },
  sectionTitle: {
    color: Colors.text,
  },
  seeAll: {
    color: Colors.primary,
  },
  shipmentsCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  loadingRow: {
    minHeight: rvs(80),
    alignItems: "center",
    justifyContent: "center",
  },
  shipmentRow: {
    minHeight: rvs(70),
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(13),
    paddingVertical: rvs(10),
  },
  shipmentBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF1",
  },
  shipmentIcon: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: "#F4F6F8",
    alignItems: "center",
    justifyContent: "center",
  },
  shipmentInfo: {
    flex: 1,
    marginLeft: rs(10),
    marginRight: rs(6),
  },
  shipmentName: {
    color: Colors.text,
  },
  shipmentDetails: {
    color: "#65748B",
    marginTop: rvs(3),
  },
  shipmentRight: {
    alignItems: "flex-end",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems:"center"
  },
  price: {
    color: Colors.text,
  },
  currencyIcon: {
    marginRight: rs(3),
  },
  status: {
    paddingHorizontal: rs(8),
    paddingVertical: rvs(3),
    borderRadius: rs(16),
    marginTop: rvs(5),
  },
});
