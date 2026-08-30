// app/create-shipment/express/step-1.tsx

import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { CurrencySelect } from "@/components/sections/createShipment/express/CurrencySelect";
import { ShipmentOptionCard } from "@/components/sections/createShipment/express/ShipmentOptionCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

type ShipmentDirection = "domestic" | "import" | "export";

export default function ShipmentTypeScreen() {
  const router = useRouter();

  const [direction, setDirection] = useState<ShipmentDirection>("domestic");

  const [currency, setCurrency] = useState("SAR - Saudi Riyal");

  const handleContinue = () => {
    router.push("/createShipment/express/step-2");
  };

  const handleCurrencyPress = () => {
    Alert.alert("Currency", "Select currency", [
      {
        text: "SAR - Saudi Riyal",
        onPress: () => setCurrency("SAR - Saudi Riyal"),
      },
      {
        text: "USD - US Dollar",
        onPress: () => setCurrency("USD - US Dollar"),
      },
      {
        text: "EUR - Euro",
        onPress: () => setCurrency("EUR - Euro"),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  return (
    <ShipmentStepLayout
      title="Shipment Type"
      subtitle="Select the shipment direction"
      step={1}
      totalSteps={8}
      onContinue={handleContinue}
    >
      <SectionTitle title="DIRECTION" />

      <ShipmentOptionCard
        title="Domestic"
        description="Inside Saudi Arabia"
        selected={direction === "domestic"}
        onPress={() => setDirection("domestic")}
      />

      <ShipmentOptionCard
        title="Import"
        description="Into Saudi Arabia (inbound)"
        selected={direction === "import"}
        onPress={() => setDirection("import")}
      />

      <ShipmentOptionCard
        title="Export"
        description="Out of Saudi Arabia (outbound)"
        selected={direction === "export"}
        onPress={() => setDirection("export")}
      />

      <SectionTitle title="CURRENCY" />
      <CurrencySelect value={currency} onPress={handleCurrencyPress} />

      <InfoBox text="Direction decides which customs steps you’ll see later." />
    </ShipmentStepLayout>
  );
}
