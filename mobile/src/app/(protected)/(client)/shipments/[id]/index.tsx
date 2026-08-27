// app/shipments/[id].tsx

import { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { SectionLabel, InfoCard, InfoRow } from "@/components/ui/InfoCard";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";
import { BackButton } from "@/components/ui/BackButton";
import { apiRequest } from "@/api/client";
import { CancelShipmentModal } from "@/components/sections/shipments/details/CancelShipmentModal";
import Toast from "react-native-toast-message";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  handleDownloadCarrierLabel,
  handleDownloadCommercialInvoice,
} from "@/utils/utils";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${weekday}, ${day} ${month} · ${time}`;
}

function formatPickupWindow(shipment: Shipment): string {
  if (!shipment.pickupDate) return "—";
  const d = new Date(shipment.pickupDate);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const ready = shipment.pickupReadyTime ?? "";
  const close = shipment.pickupCloseTime ?? "";
  const window = ready && close ? `${ready}–${close}` : ready || close;
  return window
    ? `${weekday} ${day} ${month} · ${window}`
    : `${weekday} ${day} ${month}`;
}

export default function ShipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cancelling, setCancelling] = useState(false);
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const {
    data: shipment,
    isLoading,
    isError,
  } = useQuery<Shipment>({
    queryKey: [`/api/client/shipments/${id}`],
    enabled: !!id,
  });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelModalVisible, setCancelModalVisible] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      return apiRequest<{ refundRequest?: boolean }>(
        `/api/client/shipments/${shipmentId}/cancel`,
        { method: "POST" },
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/client/shipments/recent"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
      setCancelModalVisible(false);
      Toast.show({
        type: "success",
        text1: t("shipments.details.cancel.successTitle"),
        text2: data?.refundRequest
          ? t("shipments.details.cancel.refundSubmitted")
          : t("shipments.details.cancel.success"),
      });
    },
    onError: (error: Error) => {
      Toast.show({
        type: "error",
        text1: t("shipments.details.cancel.errorTitle"),
        text2: error.message,
      });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !shipment) {
    return (
      <View style={styles.centerScreen}>
        <Text size="medium" dimRate="60%">
          {t("shipments.details.errors.loadFailed")}
        </Text>
      </View>
    );
  }

  const packagesCount = shipment.numberOfPackages ?? 1;
  const weightDisplay = shipment.chargeableWeight
    ? `${shipment.chargeableWeight} ${shipment.chargeableWeightUnit ?? "KG"}`
    : `${shipment.weight} ${shipment.weightUnit ?? "LB"}`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <BackButton />

          <View style={styles.headerTitleBlock}>
            <Text size="medium" weight="bold">
              {shipment.trackingNumber}
            </Text>
            <Text size="small" weight="semibold" dimRate="60%">
              {shipment.carrierName ?? t("shipments.details.carrier")}
              {shipment.carrierServiceType
                ? ` ${shipment.carrierServiceType}`
                : ""}
            </Text>
          </View>

          <StatusBadge status={shipment.status} />
        </View>

        {/* Estimated delivery banner */}
        <LinearGradient
          colors={[Colors.primaryDark, Colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.deliveryBanner}
        >
          <View style={{ flex: 1 }}>
            <Text size="small" style={styles.deliveryLabel}>
              {t("shipments.details.estimatedDelivery")}
            </Text>
            <Text size="large" weight="bold" style={styles.deliveryValue}>
              {formatDate(shipment.estimatedDelivery as any)}
            </Text>
          </View>
          <Feather name="truck" size={rs(30)} color={Colors.white} />
        </LinearGradient>

        {/* Documents */}
        {(shipment.carrierLabelBase64 || shipment.itemsData) && (
          <>
            <SectionLabel>{t("shipments.details.documents")}</SectionLabel>

            <View style={styles.docCard}>
              {shipment.carrierLabelBase64 && (
                <>
                  <View style={styles.docRow}>
                    <View style={styles.docIconWrap}>
                      <Feather
                        name="file-text"
                        size={rs(18)}
                        color={Colors.primary}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text size="small" weight="bold">
                        {t("shipments.details.shippingLabel")}
                      </Text>

                      <Text size="xs" dimRate="55%">
                        {(
                          shipment.carrierLabelFormat ??
                          t("shipments.details.pdf")
                        ).toUpperCase()}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => handleDownloadCarrierLabel(shipment.id)}
                      hitSlop={8}
                    >
                      <Text
                        size="small"
                        weight="bold"
                        style={{ color: Colors.primary }}
                      >
                        {t("shipments.details.download")}
                      </Text>
                    </Pressable>
                  </View>

                  {shipment.itemsData && <View style={styles.rowDivider} />}
                </>
              )}

              {shipment.itemsData && (
                <View style={styles.docRow}>
                  <View style={styles.docIconWrap}>
                    <Feather
                      name="file-text"
                      size={rs(18)}
                      color={Colors.primary}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text size="small" weight="bold">
                      {t("shipments.details.commercialInvoice")}
                    </Text>

                    <Text size="xs" dimRate="55%">
                      {t("shipments.details.pdf")}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleDownloadCommercialInvoice(shipment.id)}
                    hitSlop={8}
                  >
                    <Text
                      size="small"
                      weight="bold"
                      style={{ color: Colors.primary }}
                    >
                      {t("shipments.details.download")}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </>
        )}

        {/* From / To */}
        <View style={styles.addressSection}>
          {/* From */}
          <View>
            <View style={styles.addressHeader}>
              <Ionicons
                name="location-outline"
                size={rs(15)}
                color={Colors.textSecondary}
              />
              <Text size="small" weight="semibold" dimRate="55%">
                {t("shipments.details.from")}
              </Text>
            </View>
            <View style={styles.addressCard}>
              <Text size="small" weight="bold" style={styles.addressName}>
                {shipment.senderName}
              </Text>

              <Text size="small" dimRate="60%">
                {shipment.senderAddress}
              </Text>

              <Text size="small" dimRate="60%">
                {shipment.senderCity}, {shipment.senderCountry}
              </Text>

              {shipment.senderPhone && (
                <Text size="small" dimRate="60%">
                  {shipment.senderPhone}
                </Text>
              )}
            </View>
          </View>

          {/* To */}
          <View>
            <View style={styles.addressHeader}>
              <Ionicons
                name="location-outline"
                size={rs(15)}
                color={Colors.primary}
              />
              <Text size="small" weight="semibold" dimRate="55%">
                {t("shipments.details.to")}
              </Text>
            </View>
            <View style={styles.addressCard}>
              <Text size="small" weight="bold" style={styles.addressName}>
                {shipment.recipientName}
              </Text>

              <Text size="small" dimRate="60%">
                {shipment.recipientAddress}
              </Text>

              <Text size="small" dimRate="60%">
                {shipment.recipientCity}, {shipment.recipientCountry}
              </Text>

              {shipment.recipientPhone && (
                <Text size="small" dimRate="60%">
                  {shipment.recipientPhone}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Details */}
        <SectionLabel>{t("shipments.details.details")}</SectionLabel>
        <InfoCard>
          <InfoRow
            label={t("shipments.details.carrierTracking")}
            value={shipment.carrierTrackingNumber ?? "—"}
          />
          <InfoRow
            label={t("shipments.details.packages")}
            value={`${packagesCount} · ${weightDisplay}`}
          />
          <InfoRow
            label={t("shipments.details.pickup")}
            value={formatPickupWindow(shipment)}
          />
          <InfoRow
            label={t("shipments.details.paid")}
            value={shipment.finalPrice}
            icon={
              <SaudiRiyal
                size={rs(14)}
                color={Colors.text}
                style={styles.riyalIcon}
              />
            }
          />
        </InfoCard>

        {/* Need something changed */}
        {shipment.status.toLowerCase() === "processing" ? (
          <>
            <SectionLabel>
              {t("shipments.details.needSomethingChanged")}
            </SectionLabel>

            <Pressable
              style={({ pressed }) => [
                styles.cancelCard,
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => setCancelModalVisible(true)}
              disabled={cancelling}
            >
              <View style={styles.cancelIconWrap}>
                <Ionicons name="close" size={rs(18)} color={Colors.error} />
              </View>

              <View style={{ flex: 1 }}>
                <Text size="small" weight="bold">
                  {t("shipments.details.cancelShipment")}
                </Text>

                <Text size="xs" dimRate="55%">
                  {t("shipments.details.refundedIfNotYetCollected")}
                </Text>
              </View>

              <Ionicons
                name={isRTL ? "chevron-back" : "chevron-forward"}
                size={rs(18)}
                color={Colors.placeholder}
              />
            </Pressable>
          </>
        ) : null}

        <View style={{ height: rvs(90) }} />
      </ScrollView>

      {/* Track live button */}
      <View style={styles.footer}>
        <Button
          title={t("shipments.details.trackLive")}
          onPress={() => {
            router.push(`/shipments/${id}/tracking`);
          }}
        />
      </View>
      <CancelShipmentModal
        visible={cancelModalVisible}
        shipment={shipment}
        isPending={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate(shipment.id)}
        onClose={() => setCancelModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },

  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(16),
  },

  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
  },

  statusPill: {
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
    borderRadius: rs(10),
  },

  deliveryBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: rs(20),
    padding: rs(16),
    marginBottom: rvs(20),
  },

  deliveryLabel: {
    color: setOpacity(Colors.white, 0.85),
    marginBottom: rvs(4),
  },

  deliveryValue: {
    color: Colors.white,
  },

  docCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(20),
  },

  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(12),
    gap: rs(10),
  },

  docIconWrap: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(10),
    backgroundColor: setOpacity(Colors.primary, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },

  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  riyalIcon: {
    marginRight: rs(3),
  },

  addressSection: {
    gap: rvs(12),
    marginBottom: rvs(20),
  },

  addressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    marginBottom: rvs(10),
  },
  addressCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
  },
  addressName: {
    marginBottom: rvs(2),
  },

  cancelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    gap: rs(10),
  },

  cancelIconWrap: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(10),
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: rs(16),
    paddingTop: rvs(10),
    paddingBottom: rvs(20),
    backgroundColor: Colors.background,
  },
});
