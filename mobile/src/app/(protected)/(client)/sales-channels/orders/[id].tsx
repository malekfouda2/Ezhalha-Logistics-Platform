import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TapCheckoutWebView } from "@/components/ui/TapCheckoutWebView";
import { InfoRow } from "@/components/ui/InfoCard";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { SalesFeatureGate } from "@/components/sections/salesChannels/SalesFeatureGate";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useOrder, useOrderRates } from "@/lib/hooks/useOrders";
import { useOrderFulfillPayment } from "@/lib/hooks/useOrderFulfillPayment";
import { parseOrderJson } from "@/lib/services/orders";

const VAT_RATE = 0.15;

export default function OrderFulfillScreen() {
  return (
    <SalesFeatureGate>
      <OrderFulfillScreenContent />
    </SalesFeatureGate>
  );
}

function OrderFulfillScreenContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: order, isLoading } = useOrder(id);
  const [weight, setWeight] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);

  useEffect(() => {
    if (order?.packageWeightKg && !weight) {
      setWeight(String(Number(order.packageWeightKg)));
    }
  }, [order?.packageWeightKg]);

  const effectiveWeight = Number(weight) || 0;
  const { data: rateData, isLoading: ratesLoading } = useOrderRates(id, effectiveWeight);

  const {
    isFulfilling,
    isPayingLater,
    creditAccess,
    checkoutWebViewUrl,
    handleFulfill,
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  } = useOrderFulfillPayment(id);

  useEffect(() => {
    if (rateData?.rates.length && !selectedCarrier) {
      setSelectedCarrier(rateData.rates[0].carrierCode);
    }
  }, [rateData, selectedCarrier]);

  if (isLoading || !order) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const customer = parseOrderJson<{ name?: string; phone?: string }>(order.customer);
  const shipTo = parseOrderJson<{ address?: string; city?: string; region?: string }>(order.shipTo);
  const orderLabel = `#${order.externalOrderNumber || order.externalOrderId}`;
  const selectedRate = rateData?.rates.find((r) => r.carrierCode === selectedCarrier);
  const total = selectedRate?.totalAmountSar ?? 0;
  const vatAmount = total - total / (1 + VAT_RATE);
  const deliveryAmount = total - vatAmount;

  return (
    <>
      <View style={styles.screen}>
        <View style={styles.content}>
          <ScreenHeader title={t("orderFulfill.title", { order: orderLabel })} subtitle={customer.name || undefined} />

          <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
            {t("orderFulfill.reviewOrder")}
          </Text>
          <View style={styles.card}>
            <InfoRow label={t("orderFulfill.recipient")} value={customer.name || "—"} />
            <InfoRow
              label={t("orderFulfill.destination")}
              value={[shipTo.city, shipTo.region].filter(Boolean).join(", ") || "—"}
            />
            <InfoRow
              label={t("orderFulfill.items")}
              value={`${order.packagePieces} · ${order.packageWeightKg ? Number(order.packageWeightKg) : "—"} kg`}
            />
            {order.orderTotal ? (
              <InfoRow label={t("orderFulfill.orderValue")} value={`${order.currency} ${Number(order.orderTotal).toFixed(2)}`} />
            ) : null}
          </View>

          <Input
            label={t("orderFulfill.weight")}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="1.0"
          />

          <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
            {t("orderFulfill.selectCarrier")}
          </Text>

          {ratesLoading ? (
            <ActivityIndicator color={Colors.primary} style={styles.ratesLoading} />
          ) : !rateData?.rates.length ? (
            <Text size="small" dimRate="55%" style={styles.noRates}>
              {t("orderFulfill.noRates")}
            </Text>
          ) : (
            <View style={styles.ratesList}>
              {rateData.rates.map((rate) => {
                const selected = rate.carrierCode === selectedCarrier;
                return (
                  <Pressable
                    key={rate.carrierCode}
                    onPress={() => setSelectedCarrier(rate.carrierCode)}
                    style={[styles.rateCard, selected && styles.rateCardSelected]}
                  >
                    <View style={styles.rateInfo}>
                      <Text size="medium" weight="bold">
                        {rate.carrierName}
                      </Text>
                      <Text size="xs" dimRate="55%">
                        {rate.serviceName}
                      </Text>
                    </View>
                    <Text size="medium" weight="bold" style={selected ? styles.ratePriceSelected : undefined}>
                      {rate.currency} {rate.totalAmountSar.toFixed(2)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedRate ? (
            <View style={styles.paymentCard}>
              <InfoRow label={t("orderFulfill.delivery")} value={deliveryAmount.toFixed(2)} />
              <InfoRow label={t("orderFulfill.vat")} value={vatAmount.toFixed(2)} />
              <InfoRow
                label={t("orderFulfill.total")}
                value={total.toFixed(2)}
                valueSize="large"
                valueColor={Colors.primary}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          {creditAccess?.creditEnabled ? (
            <Pressable
              onPress={() => selectedCarrier && handleFulfill(selectedCarrier, effectiveWeight, "later")}
              disabled={!selectedCarrier || isFulfilling || isPayingLater}
              style={styles.payLaterLink}
            >
              <Text size="small" weight="bold" style={styles.payLaterLinkText}>
                {isPayingLater ? t("orderFulfill.payingLater") : t("orderFulfill.payLater")}
              </Text>
            </Pressable>
          ) : null}
          <Button
            title={
              isFulfilling
                ? t("orderFulfill.fulfilling")
                : t("orderFulfill.fulfill", { amount: total.toFixed(2) })
            }
            onPress={() => selectedCarrier && handleFulfill(selectedCarrier, effectiveWeight, "now")}
            loading={isFulfilling}
            disabled={!selectedCarrier || isFulfilling || isPayingLater}
          />
        </View>
      </View>

      <TapCheckoutWebView
        url={checkoutWebViewUrl}
        onResult={handleCheckoutWebViewResult}
        onClose={closeCheckoutWebView}
      />
    </>
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
  content: {
    flex: 1,
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  sectionLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(16),
  },
  ratesLoading: {
    marginVertical: rvs(16),
  },
  noRates: {
    marginBottom: rvs(16),
  },
  ratesList: {
    gap: rs(10),
    marginBottom: rvs(16),
  },
  rateCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: rs(16),
    paddingVertical: rvs(14),
  },
  rateCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF3EC",
  },
  rateInfo: {
    flex: 1,
  },
  ratePriceSelected: {
    color: Colors.primary,
  },
  paymentCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(16),
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(20),
  },
  payLaterLink: {
    alignSelf: "center",
    paddingVertical: rvs(10),
  },
  payLaterLinkText: {
    color: Colors.primary,
  },
});
