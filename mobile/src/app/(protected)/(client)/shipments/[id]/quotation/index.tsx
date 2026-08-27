// app/quotations/[id].tsx

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
import { Feather } from "@expo/vector-icons";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { SectionLabel, InfoCard, InfoRow } from "@/components/ui/InfoCard";
import { AcceptTermsSheet } from "@/components/sections/shipments/quotation/AcceptTermsModal";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { apiRequest } from "@/api/client";
import { Shipment } from "@shared/schema";
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
  return `${weekday} ${day} ${month}`;
}

function formatMoney(value?: number | string | null): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

function toNumber(value?: number | string | null): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n === undefined || n === null || Number.isNaN(n) ? 0 : n;
}

interface ParsedItem {
  quantity?: number;
  declaredValue?: number;
}

function parseItemsData(itemsData?: string | null): {
  itemsCount: number;
  unitsCount: number;
  declaredValue: number;
} {
  if (!itemsData) return { itemsCount: 0, unitsCount: 0, declaredValue: 0 };
  try {
    const parsed: ParsedItem[] = JSON.parse(itemsData);
    const itemsCount = parsed.length;
    const unitsCount = parsed.reduce((sum, i) => sum + (i.quantity ?? 1), 0);
    const declaredValue = parsed.reduce(
      (sum, i) => sum + (i.declaredValue ?? 0) * (i.quantity ?? 1),
      0,
    );
    return { itemsCount, unitsCount, declaredValue };
  } catch {
    return { itemsCount: 0, unitsCount: 0, declaredValue: 0 };
  }
}

export default function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [acceptSheetVisible, setAcceptSheetVisible] = useState(false);

  const {
    data: quotation,
    isLoading,
    isError,
  } = useQuery<Shipment>({
    queryKey: [`/api/client/shipments/${id}`],
    enabled: !!id,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({
      shipmentId,
      accept,
    }: {
      shipmentId: string;
      accept: boolean;
    }) => {
      return apiRequest<{ shipmentId?: string }>(
        `/api/client/quotations/${shipmentId}/accept-terms`,
        {
          method: "POST",
          body: {
            customsComplianceAccepted: accept,
            termsAccepted: accept,
            brokerAuthorizationAccepted: accept,
          },
        },
      );
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/client/shipments"],
      });

      queryClient.invalidateQueries({
        queryKey: ["/api/client/shipments/recent"],
      });

      setAcceptSheetVisible(false);
      router.push(`/shipments/${id}/quotation/accepted`);
    },

    onError: (error: Error) => {
      Toast.show({
        type: "error",
        text1: t("shipments.quotation.details.errors.acceptFailedTitle"),
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

  if (isError || !quotation) {
    return (
      <View style={styles.centerScreen}>
        <Text size="medium" dimRate="60%">
          {t("shipments.quotation.details.errors.loadFailed")}
        </Text>
      </View>
    );
  }

  const packagesCount = quotation.numberOfPackages ?? 1;
  const weightDisplay = quotation.chargeableWeight
    ? `${quotation.chargeableWeight} ${quotation.chargeableWeightUnit ?? "KG"}`
    : `${quotation.weight} ${quotation.weightUnit ?? "KG"}`;

  const { itemsCount, unitsCount, declaredValue } = parseItemsData(
    quotation.itemsData,
  );

  // Price breakdown derived from the shipment's SAR-denominated fields.
  const shippingAmount =
    toNumber(quotation.sellSubtotalAmountSar) || toNumber(quotation.baseRate);
  const discountAmount = toNumber(quotation.quoteDiscountSar);
  const vatAmount = toNumber(quotation.sellTaxAmountSar);
  const vatRate = quotation.taxScenario === "zero_rated" ? 0 : 15;
  const totalAmount =
    toNumber(quotation.clientTotalAmountSar) || toNumber(quotation.finalPrice);

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
              {t("shipments.quotation.details.title", {
                number: quotation.trackingNumber,
              })}
            </Text>
            <Text size="small" weight="semibold" dimRate="60%">
              {t("shipments.quotation.details.preparedBy")}
            </Text>
          </View>
        </View>

        {/* Shipment details */}
        <SectionLabel>
          {t("shipments.quotation.details.shipmentDetails")}
        </SectionLabel>
        <InfoCard>
          <InfoRow
            label={t("shipments.quotation.details.route")}
            value={`${quotation.senderCity} → ${quotation.recipientCity}`}
          />
          <InfoRow
            label={t("shipments.quotation.details.service")}
            value={`${quotation.carrierName ?? ""} ${quotation.carrierServiceType ?? ""}`.trim()}
          />
          <InfoRow
            label={t("shipments.quotation.details.packages")}
            value={`${packagesCount} · ${weightDisplay}`}
          />
          <InfoRow
            label={t("shipments.quotation.details.ready")}
            value={formatDate(quotation.pickupReadyTime as any)}
          />
        </InfoCard>

        {/* Customs & documents */}
        {(quotation.carrierLabelBase64 || quotation.itemsData) && (
          <>
            <SectionLabel>{t("shipments.details.documents")}</SectionLabel>

            <View style={styles.docCard}>
              {quotation.carrierLabelBase64 && (
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
                          quotation.carrierLabelFormat ??
                          t("shipments.details.pdf")
                        ).toUpperCase()}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => handleDownloadCarrierLabel(quotation.id)}
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

                  {quotation.itemsData && <View style={styles.rowDivider} />}
                </>
              )}

              {quotation.itemsData && (
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
                    onPress={() =>
                      handleDownloadCommercialInvoice(quotation.id)
                    }
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

        {/* Customs declaration */}
        <SectionLabel>
          {t("shipments.quotation.details.customsDeclaration")}
        </SectionLabel>
        <InfoCard>
          <InfoRow
            label={t("shipments.quotation.details.items")}
            value={`${itemsCount} · ${t("shipments.quotation.details.units", {
              count: unitsCount,
            })}`}
          />
          <InfoRow
            label={t("shipments.quotation.details.declaredValue")}
            value={`${quotation.currency ?? "SAR"} ${formatMoney(declaredValue)}`}
          />
          <InfoRow
            label={t("shipments.quotation.details.incoterm")}
            value={quotation.isDdp ? "DDP" : "DAP"}
          />
        </InfoCard>

        {/* Price */}
        <SectionLabel>{t("shipments.quotation.details.price")}</SectionLabel>
        <InfoCard>
          <InfoRow
            label={t("shipments.quotation.details.shipping")}
            value={formatMoney(shippingAmount)}
            icon={
              <SaudiRiyal
                size={rs(13)}
                color={Colors.text}
                style={styles.riyalIcon}
              />
            }
          />
          {discountAmount > 0 ? (
            <InfoRow
              label={t("shipments.quotation.details.discount")}
              value={`-${formatMoney(discountAmount)}`}
              icon={
                <SaudiRiyal
                  size={rs(13)}
                  color={Colors.text}
                  style={styles.riyalIcon}
                />
              }
            />
          ) : null}
          <InfoRow
            label={t("shipments.quotation.details.vat", { rate: vatRate })}
            value={formatMoney(vatAmount)}
            icon={
              <SaudiRiyal
                size={rs(13)}
                color={Colors.text}
                style={styles.riyalIcon}
              />
            }
          />
          <View style={styles.totalRow}>
            <Text size="medium" weight="bold">
              {t("shipments.quotation.details.total")}
            </Text>
            <View style={styles.totalValueRow}>
              <SaudiRiyal
                size={rs(18)}
                color={Colors.primary}
                style={styles.riyalIconLarge}
              />
              <Text size="xl" weight="bold" style={{ color: Colors.primary }}>
                {formatMoney(totalAmount)}
              </Text>
            </View>
          </View>
        </InfoCard>

        <View style={{ height: rvs(90) }} />
      </ScrollView>

      {/* Accept quotation button */}
      <View style={styles.footer}>
        <Button
          title={t("shipments.quotation.details.acceptQuotation")}
          onPress={() => setAcceptSheetVisible(true)}
        />
      </View>

      <AcceptTermsSheet
        visible={acceptSheetVisible}
        total={formatMoney(totalAmount)}
        isPending={acceptMutation.isPending}
        onConfirm={(accepted) =>
          acceptMutation.mutate({
            shipmentId: quotation.id,
            accept: accepted,
          })
        }
        onClose={() => setAcceptSheetVisible(false)}
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
    marginBottom: rvs(20),
  },

  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
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

  riyalIconLarge: {
    marginRight: rs(4),
  },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(14),
  },

  totalValueRow: {
    flexDirection: "row",
    alignItems: "center",
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
