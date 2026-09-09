// app/create-shipment/dangerousGoods/step-1.tsx

import { useTranslation } from "react-i18next";

import { ShipmentOptionCard } from "@/components/sections/createShipment/express/ShipmentOptionCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useShipmentTypeStep } from "@/lib/hooks/createShipment/dangerousGoods/useShipmentTypeStep";

export default function DangerousGoodsShipmentTypeScreen() {
  const { t } = useTranslation();
  const { shipmentType, setShipmentType, handleContinue, handleBack } = useShipmentTypeStep();

  return (
    <ShipmentStepLayout
      title={t("createShipment.dangerousGoods.steps.step1.title")}
      subtitle={t("createShipment.dangerousGoods.steps.step1.subtitle")}
      step={1}
      totalSteps={8}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <SectionTitle title={t("createShipment.dangerousGoods.steps.step1.direction.title")} />

      <ShipmentOptionCard
        title={t("createShipment.dangerousGoods.steps.step1.direction.import.title")}
        description={t("createShipment.dangerousGoods.steps.step1.direction.import.description")}
        selected={shipmentType === "inbound"}
        onPress={() => setShipmentType("inbound")}
      />

      <ShipmentOptionCard
        title={t("createShipment.dangerousGoods.steps.step1.direction.export.title")}
        description={t("createShipment.dangerousGoods.steps.step1.direction.export.description")}
        selected={shipmentType === "outbound"}
        onPress={() => setShipmentType("outbound")}
      />

      <InfoBox text={t("createShipment.dangerousGoods.steps.step1.info")} />
    </ShipmentStepLayout>
  );
}
