import { useTranslation } from "react-i18next";
import { ShipmentOptionCard } from "@/components/sections/createShipment/express/ShipmentOptionCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useShipmentTypeStep } from "@/lib/hooks/createShipment/express/useShipmentTypeStep";

export default function ShipmentTypeScreen() {
  const { t } = useTranslation();
  const { direction, setDirection, handleback, handleContinue } =
    useShipmentTypeStep();

  return (
    <ShipmentStepLayout
      title={t("createShipment.express.steps.step1.title")}
      subtitle={t("createShipment.express.steps.step1.subtitle")}
      step={1}
      totalSteps={8}
      onContinue={handleContinue}
      onBack={handleback}
    >
      <SectionTitle
        title={t("createShipment.express.steps.step1.direction.title")}
      />

      <ShipmentOptionCard
        title={t("createShipment.express.steps.step1.direction.import.title")}
        description={t(
          "createShipment.express.steps.step1.direction.import.description",
        )}
        selected={direction === "inbound"}
        onPress={() => setDirection("inbound")}
      />

      <ShipmentOptionCard
        title={t("createShipment.express.steps.step1.direction.export.title")}
        description={t(
          "createShipment.express.steps.step1.direction.export.description",
        )}
        selected={direction === "outbound"}
        onPress={() => setDirection("outbound")}
      />

      <InfoBox text={t("createShipment.express.steps.step1.info")} />
    </ShipmentStepLayout>
  );
}
