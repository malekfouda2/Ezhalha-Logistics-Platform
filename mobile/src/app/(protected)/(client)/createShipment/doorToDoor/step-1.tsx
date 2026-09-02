// app/create-shipment/doorToDoor/step-1.tsx

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { MethodOptionCard } from "@/components/sections/createShipment/doorToDoor/MethodOptionCard";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useMethodStep } from "@/lib/hooks/createShipment/doorToDoor/useMethodStep";
import { rs } from "@/utils/responsive";
import { DdpTransportMethodValue } from "@shared/domain";

const METHODS: Array<{ value: DdpTransportMethodValue; titleKey: string; subtitleKey: string }> = [
  { value: "air", titleKey: "createShipment.freight.steps.step1.air.title", subtitleKey: "createShipment.freight.steps.step1.air.subtitle" },
  { value: "sea", titleKey: "createShipment.freight.steps.step1.sea.title", subtitleKey: "createShipment.freight.steps.step1.sea.subtitle" },
];

export default function ShipmentMethodScreen() {
  const { t } = useTranslation();
  const { transportMethod, setTransportMethod, handleContinue, handleBack } = useMethodStep();

  return (
    <ShipmentStepLayout
      title={t("createShipment.freight.steps.step1.title")}
      subtitle={t("createShipment.freight.steps.step1.subtitle")}
      step={1}
      totalSteps={9}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <View style={styles.row}>
        {METHODS.map((method) => (
          <MethodOptionCard
            key={method.value}
            title={t(method.titleKey)}
            subtitle={t(method.subtitleKey)}
            selected={transportMethod === method.value}
            onPress={() => setTransportMethod(method.value)}
          />
        ))}
      </View>

      <InfoBox text={t("createShipment.freight.steps.step1.info")} />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: rs(10),
    marginBottom: rs(16),
  },
});
