// app/create-shipment/step-2.tsx

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

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

;

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SavedAddressCard } from "@/components/sections/createShipment/express/SavedAddressCard";
import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";

interface SavedAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  type: "home" | "warehouse";
  defaultAddress?: boolean;
}

const SAVED_ADDRESSES: SavedAddress[] = [
  {
    id: "1",
    name: "Al Rajhi Trading — HQ",
    address: "King Fahd Rd, Al Olaya",
    city: "Riyadh 12333",
    type: "home",
    defaultAddress: true,
  },
  {
    id: "2",
    name: "Warehouse — Jeddah",
    address: "Al Khumrah Industrial",
    city: "Jeddah 23762",
    type: "warehouse",
  },
];

export default function SenderDetailsScreen() {
  const router = useRouter();

  const [selectedAddress, setSelectedAddress] =
    useState("1");

  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const handleContinue = () => {
    router.push("/createShipment/express/step-3");
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={styles.safeArea}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <ShipmentStepHeader
            step={2}
            totalSteps={9}
            title="Sender Details"
            subtitle="Pickup address and contact"
            onBack={() => router.back()}
          />

          <Text
            size="large"
            weight="bold"
            style={styles.sectionTitle}
          >
            SAVED SENDER ADDRESSES
          </Text>

          {SAVED_ADDRESSES.map((address) => (
            <SavedAddressCard
              key={address.id}
              name={address.name}
              address={address.address}
              city={address.city}
              type={address.type}
              defaultAddress={address.defaultAddress}
              selected={selectedAddress === address.id}
              onPress={() => {
                setSelectedAddress(address.id);
              }}
            />
          ))}

          <Text
            size="large"
            weight="bold"
            style={[
              styles.sectionTitle,
              styles.newAddressTitle,
            ]}
          >
            OR ENTER A NEW ADDRESS
          </Text>

          <Input
            placeholder="Contact name"
            value={contactName}
            onChangeText={setContactName}
            autoCapitalize="words"
          />

          <Input
            placeholder="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Input
            placeholder="Address line 1"
            value={addressLine1}
            onChangeText={setAddressLine1}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                placeholder="City"
                value={city}
                onChangeText={setCity}
              />
            </View>

            <View style={styles.half}>
              <Input
                placeholder="Postal code"
                value={postalCode}
                onChangeText={setPostalCode}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Continue"
            onPress={handleContinue}
          />
        </View>
      </KeyboardAvoidingView>
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
    paddingTop: rvs(18),
    paddingBottom: rvs(20),
  },

  sectionTitle: {
    color: "#687994",
    letterSpacing: 1.5,
    marginStart: rs(4),
    marginBottom: rvs(16),
  },

  newAddressTitle: {
    marginTop: rvs(8),
  },

  row: {
    flexDirection: "row",
    gap: rs(18),
  },

  half: {
    flex: 1,
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(10),

    backgroundColor: Colors.background,
  },
});