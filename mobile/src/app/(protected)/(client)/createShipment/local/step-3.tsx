import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/Input";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useLocalPackagesStep } from "@/lib/hooks/createShipment/local/usePackagesStep";

export default function LocalPackageDetailsScreen() {
  const { t } = useTranslation();

  const { pieces, weight, setPieces, setWeight, isLoadingRates, handleContinue, handleBack } =
    useLocalPackagesStep();

  return (
    <ShipmentStepLayout
      step={3}
      totalSteps={5}
      title={t("createShipment.local.steps.step3.title")}
      subtitle={t("createShipment.local.steps.step3.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      continueLabel={t("createShipment.local.steps.step3.getRates")}
      loading={isLoadingRates}
    >
      <Input
        label={t("createShipment.local.steps.step3.numberOfPackages")}
        placeholder="1"
        value={pieces ? String(pieces) : ""}
        onChangeText={(v) => setPieces(Number(v.replace(/[^0-9]/g, "")) || 0)}
        keyboardType="number-pad"
      />

      <Input
        label={t("createShipment.local.steps.step3.totalWeight")}
        placeholder="0.0"
        value={weight ? String(weight) : ""}
        onChangeText={(v) => setWeight(Number(v.replace(/[^0-9.]/g, "")) || 0)}
        keyboardType="decimal-pad"
      />
    </ShipmentStepLayout>
  );
}
