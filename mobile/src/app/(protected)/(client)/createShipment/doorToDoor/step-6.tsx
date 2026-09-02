// app/create-shipment/doorToDoor/step-6.tsx

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { RateOptionCard } from "@/components/sections/createShipment/RateOptionCard";
import { SummaryCard } from "@/components/sections/createShipment/doorToDoor/SummaryCard";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useRateStep } from "@/lib/hooks/createShipment/doorToDoor/useRateStep";
import { Colors } from "@/constants/colors";

const METHOD_LABEL: Record<string, string> = { air: "Air", sea: "Sea", domestic: "Land" };

export default function SelectRateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { quote, transportMethod, handleContinue, handleBack } = useRateStep();

  useEffect(() => {
    if (!quote) router.replace("/createShipment/doorToDoor/step-5");
  }, [quote]);

  if (!quote) return null;

  const { pricing } = quote;
  const unit = pricing.billingUnit === "CBM" ? "CBM" : "kg";
  const days =
    pricing.transitDaysMin && pricing.transitDaysMax
      ? t("createShipment.freight.steps.step6.days", { min: pricing.transitDaysMin, max: pricing.transitDaysMax })
      : undefined;

  return (
    <ShipmentStepLayout
      step={6}
      totalSteps={9}
      title={t("createShipment.freight.steps.step6.title")}
      subtitle={t("createShipment.freight.steps.step6.subtitle", { method: METHOD_LABEL[transportMethod] })}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <RateOptionCard
        carrierCode="DDP"
        carrierColor={Colors.text}
        serviceName={`${METHOD_LABEL[transportMethod]} · ${t("createShipment.freight.steps.step6.doorToDoor")}`}
        deliveryLabel={days ?? t("createShipment.freight.steps.step6.dutiesPrepaid")}
        price={pricing.totalAmountSar.toFixed(2)}
        selected
        onPress={() => {}}
      />

      <SummaryCard
        rows={[
          { label: t("createShipment.freight.steps.step6.chargeableWeight"), note: `${pricing.billableQuantity} ${unit}` },
          { label: t("createShipment.freight.steps.step6.laneRate"), value: `${pricing.ratePerUnitSar.toFixed(2)} / ${unit}` },
          { label: t("createShipment.freight.steps.step6.dutiesClearance"), note: t("createShipment.freight.steps.step6.included") },
        ]}
        total={{ label: t("createShipment.freight.steps.step6.estimated"), value: pricing.totalAmountSar.toFixed(2) }}
      />
    </ShipmentStepLayout>
  );
}
