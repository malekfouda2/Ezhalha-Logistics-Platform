import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs } from "@/utils/responsive";
import { RateOptionCard } from "@/components/sections/createShipment/RateOptionCard";
import { SaudiRiyal } from "lucide-react-native";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

interface RateOption {
  id: string;
  carrierCode: string;
  carrierColor: string;
  serviceName: string;
  deliveryLabel: string;
  price: string;
  badge?: "cheapest";
}

export default function SelectShippingRateScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [selectedRateId, setSelectedRateId] = useState("fedex");

  const selectedRate = RATE_OPTIONS.find(
    (rate) => rate.id === selectedRateId
  );

  const handleContinue = () => {
    router.push("/createShipment/express/step-6");
  };

  return (
    <ShipmentStepLayout
      step={5}
      totalSteps={8}
      title={t("createShipment.express.steps.step5.title")}
      subtitle={t("createShipment.express.steps.step5.subtitle")}
      onContinue={handleContinue}
      continueLabel={
        <View style={styles.continueTitle}>
          <Text size="medium" weight="semibold" style={styles.continueText}>
            {t("createShipment.express.steps.step5.continueWith")}{" "}
            {selectedRate?.carrierCode ?? ""} ·
          </Text>

          <SaudiRiyal size={rs(18)} color={Colors.white} />

          <Text size="medium" weight="semibold" style={styles.continueText}>
            {selectedRate?.price ?? ""}
          </Text>
        </View>
      }
    >
      {RATE_OPTIONS.map((rate) => (
        <RateOptionCard
          key={rate.id}
          carrierCode={rate.carrierCode}
          carrierColor={rate.carrierColor}
          serviceName={t(
            `createShipment.express.steps.step5.rates.${rate.id}.serviceName`
          )}
          deliveryLabel={t(
            `createShipment.express.steps.step5.rates.${rate.id}.delivery`
          )}
          price={rate.price}
          badge={rate.badge}
          selected={selectedRateId === rate.id}
          onPress={() => setSelectedRateId(rate.id)}
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

const RATE_OPTIONS: RateOption[] = [
  {
    id: "fedex",
    carrierCode: "FedEx",
    carrierColor: "#4D148C",
    serviceName: "",
    deliveryLabel: "",
    price: "795",
  },
  {
    id: "dhl",
    carrierCode: "DHL",
    carrierColor: "#FFCC00",
    serviceName: "",
    deliveryLabel: "",
    price: "712",
    badge: "cheapest",
  },
  {
    id: "arx",
    carrierCode: "ARX",
    carrierColor: "#C8102E",
    serviceName: "",
    deliveryLabel: "",
    price: "864",
  },
];

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