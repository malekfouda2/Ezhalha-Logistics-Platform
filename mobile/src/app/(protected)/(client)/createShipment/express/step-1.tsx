import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CurrencySelect } from "@/components/sections/createShipment/express/CurrencySelect";
import { ShipmentOptionCard } from "@/components/sections/createShipment/express/ShipmentOptionCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

type ShipmentDirection = "domestic" | "import" | "export";

type Currency = "sar" | "usd" | "eur";

export default function ShipmentTypeScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [direction, setDirection] =
    useState<ShipmentDirection>("domestic");

  const [currency, setCurrency] = useState<Currency>("sar");

  const handleContinue = () => {
    router.push("/createShipment/express/step-2");
  };

  const handleCurrencyPress = () => {
    Alert.alert(
      t("currency.title"),
      t("currency.selectCurrency"),
      [
        {
          text: t("currency.options.sar"),
          onPress: () => setCurrency("sar"),
        },
        {
          text: t("currency.options.usd"),
          onPress: () => setCurrency("usd"),
        },
        {
          text: t("currency.options.eur"),
          onPress: () => setCurrency("eur"),
        },
        {
          text: t("currency.cancel"),
          style: "cancel",
        },
      ]
    );
  };

  return (
    <ShipmentStepLayout
      title={t("createShipment.express.steps.step1.title")}
      subtitle={t("createShipment.express.steps.step1.subtitle")}
      step={1}
      totalSteps={8}
      onContinue={handleContinue}
    >
      <SectionTitle title={t("createShipment.express.steps.step1.direction.title")} />

      <ShipmentOptionCard
        title={t("createShipment.express.steps.step1.direction.domestic.title")}
        description={t(
          "createShipment.express.steps.step1.direction.domestic.description"
        )}
        selected={direction === "domestic"}
        onPress={() => setDirection("domestic")}
      />

      <ShipmentOptionCard
        title={t("createShipment.express.steps.step1.direction.import.title")}
        description={t(
          "createShipment.express.steps.step1.direction.import.description"
        )}
        selected={direction === "import"}
        onPress={() => setDirection("import")}
      />

      <ShipmentOptionCard
        title={t("createShipment.express.steps.step1.direction.export.title")}
        description={t(
          "createShipment.express.steps.step1.direction.export.description"
        )}
        selected={direction === "export"}
        onPress={() => setDirection("export")}
      />

      <SectionTitle title={t("createShipment.express.steps.step1.currency.title")} />

      <CurrencySelect
        value={t(`createShipment.express.currency.options.${currency}`)}
        onPress={handleCurrencyPress}
      />

      <InfoBox text={t("createShipment.express.steps.step1.info")} />
    </ShipmentStepLayout>
  );
}