// app/create-shipment/step-1.tsx

import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";


import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { CurrencySelect } from "@/components/sections/createShipment/express/CurrencySelect";
import { ShipmentOptionCard } from "@/components/sections/createShipment/express/ShipmentOptionCard";
import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";

type ShipmentDirection = "domestic" | "import" | "export";

export default function ShipmentTypeScreen() {
  const router = useRouter();

  const [direction, setDirection] =
    useState<ShipmentDirection>("domestic");

  const [currency, setCurrency] =
    useState("SAR - Saudi Riyal");

  const handleContinue = () => {
    router.push("/createShipment/express/step-2");
  };

  const handleCurrencyPress = () => {
    Alert.alert(
      "Currency",
      "Select currency",
      [
        {
          text: "SAR - Saudi Riyal",
          onPress: () =>
            setCurrency("SAR - Saudi Riyal"),
        },
        {
          text: "USD - US Dollar",
          onPress: () =>
            setCurrency("USD - US Dollar"),
        },
        {
          text: "EUR - Euro",
          onPress: () =>
            setCurrency("EUR - Euro"),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={styles.safeArea}
    >
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <ShipmentStepHeader
            step={1}
            totalSteps={9}
            title="Shipment Type"
            subtitle="Select the shipment direction"
            onBack={() => router.back()}
          />

          <Text
            size="small"
            weight="bold"
            style={styles.sectionTitle}
          >
            DIRECTION
          </Text>

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

          <Text
            size="small"
            weight="bold"
            style={styles.sectionTitle}
          >
            CURRENCY
          </Text>

          <CurrencySelect
            value={currency}
            onPress={handleCurrencyPress}
          />

          <View style={styles.infoBox}>
            <Feather
              name="info"
              size={rs(20)}
              color="#B65B27"
            />

            <Text
              size="small"
              style={styles.infoText}
            >
              Direction decides which customs steps
              you’ll see later.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Continue"
            onPress={handleContinue}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContent: {
    paddingHorizontal: rs(20),
  },

  sectionTitle: {
    color: "#687994",
    letterSpacing: 1,
    marginBottom: rvs(8),
    marginStart: rs(4),
  },

  infoBox: {
    marginTop: rvs(24),

    borderWidth: 1.5,
    borderColor: "#FFCDB6",

    borderRadius: rs(22),

    backgroundColor: "#FFF9F6",

    paddingHorizontal: rs(15),
    paddingVertical: rvs(15),

    flexDirection: "row",
    alignItems: "flex-start",
  },

  infoText: {
    flex: 1,
    color: "#B65B27",
    marginStart: rs(10),
  },

  footer: {
    paddingHorizontal: rs(20),
  },
});