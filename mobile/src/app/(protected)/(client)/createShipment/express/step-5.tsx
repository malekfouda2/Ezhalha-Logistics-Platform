import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs } from "@/utils/responsive";
import { RateOptionCard } from "@/components/sections/createShipment/RateOptionCard";
import { SaudiRiyal } from "lucide-react-native";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useRatesStep } from "@/lib/hooks/createShipment/express/useRatesStep";
import { RateQuote } from "@/store/createExpressShipmentStore";

const CARRIER_COLORS: Record<string, string> = {
  FEDEX: "#4D148C",
  DHL: "#FFCC00",
  ARAMEX: "#C8102E",
};

function getCarrierColor(carrierCode: string) {
  return CARRIER_COLORS[carrierCode.toUpperCase()] ?? Colors.secondary;
}

function getDeliveryLabel(quote: RateQuote) {
  if (quote.estimatedDelivery) {
    const date = new Date(quote.estimatedDelivery);
    if (!Number.isNaN(date.getTime())) {
      const formatted = new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(date);
      return `${formatted} · ${quote.transitDays} day${quote.transitDays === 1 ? "" : "s"}`;
    }
  }
  return `${quote.transitDays} day${quote.transitDays === 1 ? "" : "s"}`;
}

export default function SelectShippingRateScreen() {
  const { t } = useTranslation();

  const { rates, selectedQuoteId, setSelectedQuoteId, selectedQuote, handleContinue, handleBack } =
    useRatesStep();

  const quotes = rates?.quotes ?? [];
  const cheapestQuoteId = quotes.reduce<string | null>((cheapestId, quote) => {
    if (!cheapestId) return quote.quoteId;
    const cheapest = quotes.find((q) => q.quoteId === cheapestId);
    return cheapest && quote.finalPrice < cheapest.finalPrice ? quote.quoteId : cheapestId;
  }, null);

  return (
    <ShipmentStepLayout
      step={5}
      totalSteps={8}
      title={t("createShipment.express.steps.step5.title")}
      subtitle={t("createShipment.express.steps.step5.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      continueLabel={
        selectedQuote ? (
          <View style={styles.continueTitle}>
            <Text size="medium" weight="semibold" style={styles.continueText}>
              {t("createShipment.express.steps.step5.continueWith")}{" "}
              {selectedQuote.carrierCode} ·
            </Text>

            <SaudiRiyal size={rs(18)} color={Colors.white} />

            <Text size="medium" weight="semibold" style={styles.continueText}>
              {selectedQuote.finalPrice.toFixed(2)}
            </Text>
          </View>
        ) : (
          t("createShipment.express.common.continue")
        )
      }
    >
      {quotes.map((quote) => (
        <RateOptionCard
          key={quote.quoteId}
          carrierCode={quote.carrierCode}
          carrierColor={getCarrierColor(quote.carrierCode)}
          serviceName={quote.serviceName}
          deliveryLabel={getDeliveryLabel(quote)}
          price={quote.finalPrice.toFixed(2)}
          badge={quote.quoteId === cheapestQuoteId ? "cheapest" : undefined}
          selected={selectedQuoteId === quote.quoteId}
          onPress={() => setSelectedQuoteId(quote.quoteId)}
        />
      ))}

      <InfoBox
        text={t("createShipment.express.steps.step5.info")}
        borderWidth={0}
        backgroundColor={Colors.white}
        textColor={Colors.secondary}
        iconColor={Colors.secondary}
        iconName="clock"
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
