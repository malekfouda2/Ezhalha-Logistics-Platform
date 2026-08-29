// app/create-shipment/express/step-7.tsx

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";
import { DatePill } from "@/components/sections/createShipment/express/DatePill";
import { ToggleCard } from "@/components/sections/createShipment/ToggleCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";

interface DateOption {
  id: string;
  dayLabel: string;
  dateLabel: string;
}

const DATE_OPTIONS: DateOption[] = [
  { id: "mon", dayLabel: "Mon", dateLabel: "18 Aug" },
  { id: "tue", dayLabel: "Tue", dateLabel: "19 Aug" },
  { id: "wed", dayLabel: "Wed", dateLabel: "20 Aug" },
];

export default function CarrierPickupScreen() {
  const router = useRouter();

  const [requestPickup, setRequestPickup] = useState(true);
  const [selectedDateId, setSelectedDateId] = useState("tue");
  const [readyFrom, setReadyFrom] = useState("09:00");
  const [readyTo, setReadyTo] = useState("17:00");
  const [pickupLocation, setPickupLocation] = useState("");
  const [instructions, setInstructions] = useState("");

  const handleReviewOrder = () => {
    router.push("/createShipment/express/step-8");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 20}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ShipmentStepHeader
          step={7}
          totalSteps={8}
          title="Carrier Pickup"
          subtitle="Optional"
          onBack={() => router.back()}
        />

        <ToggleCard
          title="Request a pickup"
          description="Otherwise drop off at a branch"
          value={requestPickup}
          onValueChange={setRequestPickup}
        />

        {requestPickup ? (
          <>
            <SectionTitle title="PICKUP DATE" />

            <View style={styles.dateRow}>
              {DATE_OPTIONS.map((date) => (
                <DatePill
                  key={date.id}
                  dayLabel={date.dayLabel}
                  dateLabel={date.dateLabel}
                  selected={selectedDateId === date.id}
                  onPress={() => setSelectedDateId(date.id)}
                />
              ))}
            </View>

            <SectionTitle title="READY BETWEEN" />

            <View style={styles.timeRow}>
              <View style={styles.timeHalf}>
                <Input
                  value={readyFrom}
                  onChangeText={setReadyFrom}
                  rightElement={
                    <Feather name="clock" size={rs(18)} color="#8A93A3" />
                  }
                />
              </View>

              <View style={styles.timeHalf}>
                <Input
                  value={readyTo}
                  onChangeText={setReadyTo}
                  rightElement={
                    <Feather name="clock" size={rs(18)} color="#8A93A3" />
                  }
                />
              </View>
            </View>

            <SectionTitle title="PICKUP LOCATION" />

            <Input
              placeholder="Reception, Gate 2..."
              value={pickupLocation}
              onChangeText={setPickupLocation}
            />

            <Input
              placeholder="Instructions (optional)"
              value={instructions}
              onChangeText={setInstructions}
            />

            <InfoBox text="Booked after payment. A failed pickup never fails the shipment." />
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Review order" onPress={handleReviewOrder} />
      </View>
    </KeyboardAvoidingView>
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

  dateRow: {
    flexDirection: "row",
    gap: rs(12),
    marginBottom: rvs(10),
  },

  timeRow: {
    flexDirection: "row",
    gap: rs(18),
  },

  timeHalf: {
    flex: 1,
  },

  infoBox: {
    marginTop: rvs(4),

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
    paddingTop: rvs(10),
    paddingBottom: rvs(10),
    backgroundColor: Colors.background,
  },
});
