import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs } from "@/utils/responsive";
import { RateOptionCard } from "@/components/sections/createShipment/RateOptionCard";
import { SaudiRiyal } from "lucide-react-native";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useLocalRatesStep } from "@/lib/hooks/createShipment/local/useRatesStep";

const CARRIER_COLORS: Record<string, string> = {
  SMSA: "#0B3C6E",
  NQL: "#0E7C4A",
  RDX: "#C8102E",
  AJX: "#7A4EA0",
};

function getCarrierColor(carrierCode: string) {
  return CARRIER_COLORS[carrierCode.toUpperCase()] ?? Colors.secondary;
}

export default function LocalSelectRateScreen() {
  const { t } = useTranslation();

  const { rates, selectedQuoteId, setSelectedQuoteId, selectedQuote, isSubmitting, handleContinue, handleBack } =
    useLocalRatesStep();

  const quotes = rates?.quotes ?? [];
  const cheapestQuoteId = quotes.reduce<string | null>((cheapestId, quote) => {
    if (!cheapestId) return quote.quoteId;
    const cheapest = quotes.find((q) => q.quoteId === cheapestId);
    return cheapest && quote.finalPrice < cheapest.finalPrice ? quote.quoteId : cheapestId;
  }, null);

  return (
    <ShipmentStepLayout
      step={4}
      totalSteps={5}
      title={t("createShipment.local.steps.step4.title")}
      subtitle={t("createShipment.local.steps.step4.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      loading={isSubmitting}
      continueLabel={
        selectedQuote ? (
          <View style={styles.continueTitle}>
            <Text size="medium" weight="semibold" style={styles.continueText}>
              {t("createShipment.local.steps.step4.continueWith")}
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
          deliveryLabel={`${quote.transitDays} day${quote.transitDays === 1 ? "" : "s"}`}
          price={quote.finalPrice.toFixed(2)}
          badge={quote.quoteId === cheapestQuoteId ? "cheapest" : undefined}
          selected={selectedQuoteId === quote.quoteId}
          onPress={() => setSelectedQuoteId(quote.quoteId)}
        />
      ))}

      <InfoBox
        text={t("createShipment.local.steps.step4.info")}
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
