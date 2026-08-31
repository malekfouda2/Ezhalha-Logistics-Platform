// app/create-shipment/express/step-8.tsx

import { useState } from "react";
import { StyleSheet, View } from "react-native";
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

type PaymentMethodId = "saved-card" | "new-card" | "pay-later";

export default function PaymentOptionsScreen() {
  const { t } = useTranslation();

  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethodId>("pay-later");

  const { checkoutData, isPayingLater, handlePayLater, handleBack } =
    usePaymentStep();

  const total = (checkoutData?.amount ?? 0).toFixed(2);
  const summaryLines = checkoutData
    ? [
        {
          label:
            [checkoutData.carrierName, checkoutData.serviceName]
              .filter(Boolean)
              .join(" · ") || t("createShipment.express.steps.step8.summary.shipping"),
          value: total,
        },
      ]
    : [];

  const handlePay = () => {
    if (selectedMethod === "pay-later") {
      handlePayLater();
    }
  };

  return (
    <ShipmentStepLayout
      step={8}
      totalSteps={8}
      title={t("createShipment.express.steps.step8.title")}
      subtitle={t("createShipment.express.steps.step8.subtitle")}
      onContinue={handlePay}
      onBack={handleBack}
      continueLabel={
        isPayingLater ? (
          t("common.loading")
        ) : (
          <View style={styles.continueTitle}>
            <Text size="medium" weight="semibold" style={styles.continueText}>
              {t("createShipment.express.steps.step8.pay")}
            </Text>

            <SaudiRiyal size={rs(18)} color={Colors.white} />

            <Text size="medium" weight="semibold" style={styles.continueText}>
              {total}
            </Text>
          </View>
        )
      }
      footerNote={t("createShipment.express.steps.step8.footerNote")}
    >
      <OrderSummaryCard lines={summaryLines} total={total} />

      <SectionTitle
        title={t("createShipment.express.steps.step8.payWith")}
      />

      <PaymentMethodCard
        title={t("createShipment.express.payment.savedCard.title")}
        subtitle={t("createShipment.express.payment.comingSoon")}
        iconLabel="VISA"
        iconBackground={Colors.border}
        iconColor={Colors.secondary}
        selected={false}
        onPress={() => {}}
      />

      <PaymentMethodCard
        title={t("createShipment.express.payment.newCard.title")}
        subtitle={t("createShipment.express.payment.comingSoon")}
        iconLabel="+"
        iconBackground="#F2F3F5"
        iconColor={Colors.secondary}
        selected={false}
        onPress={() => {}}
      />

      <PaymentMethodCard
        title={t("createShipment.express.payment.payLater.title")}
        subtitle={t("createShipment.express.payment.payLater.creditAvailable")}
        iconLabel=""
        iconBackground="#FFE8DA"
        iconColor={Colors.primary}
        selected={selectedMethod === "pay-later"}
        onPress={() => setSelectedMethod("pay-later")}
      />
    </ShipmentStepLayout>
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
});
