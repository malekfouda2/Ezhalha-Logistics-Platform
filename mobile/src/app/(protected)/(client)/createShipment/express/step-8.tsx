// app/create-shipment/express/step-8.tsx

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs } from "@/utils/responsive";
import { OrderSummaryCard } from "@/components/sections/createShipment/OrderSummaryCard";
import { PaymentMethodCard } from "@/components/sections/createShipment/PaymentMethodCard";
import { SaudiRiyal } from "lucide-react-native";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { usePaymentStep } from "@/lib/hooks/createShipment/express/usePaymentStep";
import { TapCheckoutWebView } from "@/components/payments/TapCheckoutWebView";

type PaymentMethodId = "saved-card" | "new-card" | "pay-later";

export default function PaymentOptionsScreen() {
  const { t } = useTranslation();

  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethodId>("pay-later");

  const {
    checkoutData,
    isPaying,
    isPayingLater,
    isConfirming,
    savedCards,
    creditAccess,
    checkoutWebViewUrl,
    handlePayNow,
    handlePayLater,
    handleBack,
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  } = usePaymentStep();

  const defaultCard = savedCards.find((c) => c.isDefault) ?? savedCards[0];
  const canPayLater = creditAccess?.creditEnabled ?? false;

  useEffect(() => {
    if (creditAccess && !canPayLater && selectedMethod === "pay-later") {
      setSelectedMethod(defaultCard ? "saved-card" : "new-card");
    }
  }, [creditAccess, canPayLater, defaultCard, selectedMethod]);

  const total = (checkoutData?.amount ?? 0).toFixed(2);
  const summaryLines = checkoutData
    ? [
        {
          label:
            [checkoutData.carrierName, checkoutData.serviceName]
              .filter(Boolean)
              .join(" · ") ||
            t("createShipment.express.steps.step8.summary.shipping"),
          value: total,
        },
      ]
    : [];

  const handlePay = () => {
    if (selectedMethod === "pay-later" && canPayLater) {
      handlePayLater();
    } else if (selectedMethod === "saved-card" && defaultCard) {
      handlePayNow(defaultCard.tapCardId);
    } else if (selectedMethod === "new-card") {
      handlePayNow(undefined, true);
    }
  };

  return (
    <>
      <ShipmentStepLayout
        step={8}
        totalSteps={8}
        title={t("createShipment.express.steps.step8.title")}
        subtitle={t("createShipment.express.steps.step8.subtitle")}
        onContinue={handlePay}
        onBack={handleBack}
        loading={isPayingLater || isPaying || isConfirming}
        continueLabel={
          <View style={styles.continueTitle}>
            <Text size="medium" weight="semibold" style={styles.continueText}>
              {t("createShipment.express.steps.step8.pay")}
            </Text>

            <SaudiRiyal size={rs(18)} color={Colors.white} />

            <Text size="medium" weight="semibold" style={styles.continueText}>
              {total}
            </Text>
          </View>
        }
        footerNote={t("createShipment.express.steps.step8.footerNote")}
      >
        <OrderSummaryCard lines={summaryLines} total={total} />

        <SectionTitle title={t("createShipment.express.steps.step8.payWith")} />

        {defaultCard ? (
          <PaymentMethodCard
            title={t("createShipment.express.payment.savedCard.title")}
            subtitle={`${defaultCard.brand ?? ""} •••• ${defaultCard.lastFour ?? ""}`.trim()}
            iconLabel={(defaultCard.brand ?? "CARD").slice(0, 4).toUpperCase()}
            iconBackground={"navy"}
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

        {canPayLater ? (
          <>
            <PaymentMethodCard
              title={t("createShipment.express.payment.payLater.title")}
              subtitle={
                <>
                  <Text size="xs" weight="semibold" style={styles.creditAvailableText}>
                    {t("createShipment.express.payment.payLater.creditAvailable")}
                  </Text>
                </>
              }
              icon={
                <Feather name="credit-card" size={rs(20)} color={Colors.primary} />
              }
              iconBackground="#FFE8DA"
              selected={selectedMethod === "pay-later"}
              onPress={() => setSelectedMethod("pay-later")}
            />
          </>
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
      </ShipmentStepLayout>

      <TapCheckoutWebView
        url={checkoutWebViewUrl}
        onResult={handleCheckoutWebViewResult}
        onClose={closeCheckoutWebView}
      />
    </>
  );
}

const styles = StyleSheet.create({
  continueTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(4),
  },

  continueText: {
    color: Colors.white,
  },

  creditAvailableText: {
    color: Colors.textSecondary,
  },

  payLaterDescription: {
    color: Colors.textSecondary,
    lineHeight: rs(18),
    marginBottom: rs(16),
    paddingHorizontal: rs(4),
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
});
