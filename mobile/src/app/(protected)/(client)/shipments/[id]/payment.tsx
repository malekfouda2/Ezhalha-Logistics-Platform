// app/shipments/[id]/payment.tsx

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { PaymentMethodCard } from "@/components/sections/createShipment/PaymentMethodCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { TapCheckoutEntry, TapCheckoutEntryHandle } from "@/components/ui/TapCheckoutEntry";
import { TapCheckoutWebView } from "@/components/ui/TapCheckoutWebView";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useQuotationPayment } from "@/lib/hooks/useQuotationPayment";
import { Shipment } from "@shared/schema";

type PaymentMethodId = "saved-card" | "new-card" | "pay-later";

function toNumber(value?: number | string | null): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n === undefined || n === null || Number.isNaN(n) ? 0 : n;
}

export default function QuotationPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("pay-later");
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const cardEntryRef = useRef<TapCheckoutEntryHandle>(null);

  const { data: quotation, isLoading } = useQuery<Shipment>({
    queryKey: [`/api/client/shipments/${id}`],
    enabled: !!id,
  });

  const {
    isPaying,
    isPayingLater,
    isConfirming,
    savedCards,
    creditAccess,
    checkoutWebViewUrl,
    handlePayNow,
    handleNativeCheckoutResult,
    handlePayLater,
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  } = useQuotationPayment(id, { isQuote: quotation?.isQuote });

  const defaultCard = savedCards.find((c) => c.isDefault) ?? savedCards[0];
  const canPayLater = creditAccess?.creditEnabled ?? false;

  useEffect(() => {
    if (creditAccess && !canPayLater && selectedMethod === "pay-later") {
      setSelectedMethod(defaultCard ? "saved-card" : "new-card");
    }
  }, [creditAccess, canPayLater, defaultCard, selectedMethod]);

  const totalAmount = toNumber(quotation?.clientTotalAmountSar) || toNumber(quotation?.finalPrice);
  const total = totalAmount.toFixed(2);

  const handlePay = async () => {
    if (selectedMethod === "pay-later" && canPayLater) {
      handlePayLater();
    } else if (selectedMethod === "saved-card" && defaultCard) {
      handlePayNow(defaultCard.tapCardId);
    } else if (selectedMethod === "new-card") {
      setIsOpeningCheckout(true);
      try {
        const payResult = await cardEntryRef.current?.pay();
        if (payResult) await handleNativeCheckoutResult(payResult);
      } finally {
        setIsOpeningCheckout(false);
      }
    }
  };

  if (isLoading || !quotation) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const isBusy = isPaying || isPayingLater || isConfirming || isOpeningCheckout;

  return (
    <>
      <View style={styles.screen}>
        <View style={styles.headerRow}>
          <BackButton />

          <View style={styles.headerTitleBlock}>
            <Text size="medium" weight="bold">
              {t("shipments.quotation.payment.title")}
            </Text>
            <Text size="small" weight="semibold" dimRate="60%">
              {quotation.trackingNumber}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.totalCard}>
            <Text size="small" weight="semibold" dimRate="60%">
              {t("shipments.quotation.payment.total")}
            </Text>
            <View style={styles.totalValueRow}>
              <SaudiRiyal size={rs(20)} color={Colors.primary} style={styles.riyalIcon} />
              <Text size="xl" weight="bold" style={{ color: Colors.primary }}>
                {total}
              </Text>
            </View>
          </View>

          <SectionTitle title={t("shipments.quotation.payment.payWith")} />

          {defaultCard ? (
            <PaymentMethodCard
              title={t("createShipment.express.payment.savedCard.title")}
              subtitle={`${defaultCard.brand ?? ""} •••• ${defaultCard.lastFour ?? ""}`.trim()}
              iconLabel={(defaultCard.brand ?? "CARD").slice(0, 4).toUpperCase()}
              iconBackground="navy"
              iconColor={Colors.white}
              selected={selectedMethod === "saved-card"}
              onPress={() => setSelectedMethod("saved-card")}
            />
          ) : null}

          <PaymentMethodCard
            title={t("createShipment.express.payment.newCard.title")}
            subtitle={t("createShipment.express.payment.newCard.subtitle")}
            iconLabel="+"
            iconBackground="#F2F3F5"
            iconColor={Colors.secondary}
            selected={selectedMethod === "new-card"}
            onPress={() => setSelectedMethod("new-card")}
          />

          {selectedMethod === "new-card" ? (
            <TapCheckoutEntry ref={cardEntryRef} shipmentId={id} saveCard style={styles.cardEntry} />
          ) : null}

          {canPayLater ? (
            <PaymentMethodCard
              title={t("createShipment.express.payment.payLater.title")}
              subtitle={
                <Text size="xs" weight="semibold" style={styles.creditAvailableText}>
                  {t("createShipment.express.payment.payLater.creditAvailable")}
                </Text>
              }
              icon={<Feather name="credit-card" size={rs(20)} color={Colors.primary} />}
              iconBackground="#FFE8DA"
              selected={selectedMethod === "pay-later"}
              onPress={() => setSelectedMethod("pay-later")}
            />
          ) : (
            <View style={styles.noAccessBox}>
              <View style={styles.noAccessHeading}>
                <Feather name="clock" size={rs(16)} color={Colors.textSecondary} />
                <Text size="small" weight="semibold" style={styles.noAccessHeadingText}>
                  {t("createShipment.express.payment.payLater.noAccess.heading")}
                </Text>
              </View>

              <Text size="xs" style={styles.noAccessText}>
                {t(
                  creditAccess?.request?.status === "pending"
                    ? "createShipment.express.payment.payLater.noAccess.pending"
                    : creditAccess?.request?.status === "rejected"
                      ? "createShipment.express.payment.payLater.noAccess.rejected"
                      : "createShipment.express.payment.payLater.noAccess.notEnabled",
                )}
              </Text>
            </View>
          )}

          <View style={{ height: rvs(20) }} />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={
              <View style={styles.payTitle}>
                <Text size="medium" weight="semibold" style={styles.payText}>
                  {t("shipments.quotation.payment.pay")}
                </Text>
                <SaudiRiyal size={rs(18)} color={Colors.white} />
                <Text size="medium" weight="semibold" style={styles.payText}>
                  {total}
                </Text>
              </View>
            }
            onPress={handlePay}
            loading={isBusy}
            disabled={isBusy}
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

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    marginBottom: rvs(12),
  },

  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
  },

  scrollContent: {
    paddingHorizontal: rs(16),
  },

  totalCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingVertical: rvs(16),
    paddingHorizontal: rs(16),
    alignItems: "center",
    marginBottom: rvs(20),
  },

  totalValueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: rvs(4),
  },

  riyalIcon: {
    marginRight: rs(4),
  },

  cardEntry: {
    marginBottom: rs(16),
  },

  creditAvailableText: {
    color: Colors.textSecondary,
  },

  noAccessBox: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: rs(16),
    padding: rs(16),
    gap: rs(8),
  },

  noAccessHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
  },

  noAccessHeadingText: {
    color: Colors.textSecondary,
  },

  noAccessText: {
    color: Colors.textSecondary,
    lineHeight: rs(18),
  },

  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(10),
    paddingBottom: rvs(20),
    backgroundColor: Colors.background,
  },

  payTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(4),
  },

  payText: {
    color: Colors.white,
  },
});
