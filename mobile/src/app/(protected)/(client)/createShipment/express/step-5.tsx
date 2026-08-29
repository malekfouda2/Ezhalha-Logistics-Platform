// app/create-shipment/express/step-5.tsx

import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { RateOptionCard } from "@/components/sections/createShipment/RateOptionCard";
import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentFooter";
import { SaudiRiyal } from "lucide-react-native";
import InfoBox from "@/components/sections/createShipment/InfoBox";

interface RateOption {
  id: string;
  carrierCode: string;
  carrierColor: string;
  serviceName: string;
  deliveryLabel: string;
  price: string;
  badge?: "cheapest";
}

const RATE_OPTIONS: RateOption[] = [
  {
    id: "fedex",
    carrierCode: "FedEx",
    carrierColor: "#4D148C",
    serviceName: "International Priority",
    deliveryLabel: "Delivered Tue 19 Aug · 2 days",
    price: "795",
  },
  {
    id: "dhl",
    carrierCode: "DHL",
    carrierColor: "#FFCC00",
    serviceName: "Express Worldwide",
    deliveryLabel: "Delivered Wed 20 Aug · 3 days",
    price: "712",
    badge: "cheapest",
  },
  {
    id: "arx",
    carrierCode: "ARX",
    carrierColor: "#C8102E",
    serviceName: "Priority Document",
    deliveryLabel: "Delivered Wed 20 Aug · 3 days",
    price: "864",
  },
];

export default function SelectShippingRateScreen() {
  const router = useRouter();

  const [selectedRateId, setSelectedRateId] = useState("fedex");

  const selectedRate = RATE_OPTIONS.find((rate) => rate.id === selectedRateId);

  const handleContinue = () => {
    router.push("/createShipment/express/step-6");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ShipmentStepHeader
          step={5}
          totalSteps={8}
          title="Select Shipping Rate"
          subtitle="Riyadh → Dubai · 6.5 kg"
          onBack={() => router.back()}
        />

        {RATE_OPTIONS.map((rate) => (
          <RateOptionCard
            key={rate.id}
            carrierCode={rate.carrierCode}
            carrierColor={rate.carrierColor}
            serviceName={rate.serviceName}
            deliveryLabel={rate.deliveryLabel}
            price={rate.price}
            badge={rate.badge}
            selected={selectedRateId === rate.id}
            onPress={() => setSelectedRateId(rate.id)}
          />
        ))}

        <InfoBox
          text="Prices held for 30 minutes. Re-quote after that."
          borderWidth={0}
          backgroundColor={Colors.white}
          textColor={Colors.secondary}
          iconColor={Colors.secondary}
          iconName="clock"
        />
      </ScrollView>

      <ShipmentFooter
        onPress={handleContinue}
        title={
          <View style={styles.continueTitle}>
            <Text size="medium" weight="semibold" style={styles.continueText}>
              Continue with {selectedRate?.carrierCode ?? ""} ·
            </Text>

            <SaudiRiyal size={rs(18)} color={Colors.white} />

            <Text size="medium" weight="semibold" style={styles.continueText}>
              {selectedRate?.price ?? ""}
            </Text>
          </View>
        }
      />
    </View>
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
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },

  infoBox: {
    flexDirection: "row",

    backgroundColor: Colors.white,
    borderRadius: rs(18),

    paddingHorizontal: rs(16),
    paddingVertical: rvs(14),

    gap: rs(10),
  },

  infoText: {
    flex: 1,
    color: Colors.secondary,
  },
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
