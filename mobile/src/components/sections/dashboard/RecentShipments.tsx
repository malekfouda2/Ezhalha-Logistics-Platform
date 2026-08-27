// components/sections/dashboard/RecentShipments.tsx

import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";

type RecentShipmentsProps = {
  shipments?: Shipment[];
  isLoading?: boolean;
  seeAllHref?: string;
};

export const RecentShipments = ({
  shipments,
  isLoading,
  seeAllHref = "/shipments",
}: RecentShipmentsProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text size="large" weight="bold" style={styles.sectionTitle}>
          {t("dashboard.recentShipments.title")}
        </Text>

        <Pressable onPress={() => router.push(seeAllHref)}>
          <Text size="small" weight="bold" style={styles.seeAll}>
            {t("dashboard.recentShipments.seeAll")}
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
            <Text size="small" style={styles.emptyText}>
              No shipments yet
            </Text>
          </View>
        ) : (
          shipments.map((shipment, index) => (
            <Pressable
              key={shipment.id}
              onPress={() =>
                shipment.isQuote
                  ? router.push(`/shipments/${shipment.id}/quotation`)
                  : router.push(`/shipments/${shipment.id}`)
              }
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

                  <Text
                    size="small"
                    weight="bold"
                    style={styles.price}
                  >
                    {shipment.finalPrice}
                  </Text>
                </View>

                <StatusBadge
                  status={shipment.status}
                  style={styles.statusBadge}
                />
              </View>
            </Pressable>
          ))
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },

  loadingRow: {
    minHeight: rvs(80),
    alignItems: "center",
    justifyContent: "center",
  },

  emptyText: {
    color: "#65748B",
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
    alignItems: "center",
  },

  price: {
    color: Colors.text,
  },

  currencyIcon: {
    marginRight: rs(3),
  },

  statusBadge: {
    marginTop: rvs(5),
  },
});