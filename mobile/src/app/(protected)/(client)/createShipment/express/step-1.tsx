// app/create-shipment/express/step-1.tsx

import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { CurrencySelect } from "@/components/sections/createShipment/express/CurrencySelect";
import { ShipmentOptionCard } from "@/components/sections/createShipment/express/ShipmentOptionCard";
import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentFooter";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";

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
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ShipmentStepHeader
          step={1}
          totalSteps={8}
          title="Shipment Type"
          subtitle="Select the shipment direction"
          onBack={() => router.back()}
        />

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
      </ScrollView>

      <ShipmentFooter onPress={handleContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },
});
