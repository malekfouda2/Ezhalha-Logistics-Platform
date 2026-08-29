// app/create-shipment/express/step-3.tsx

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
import { CountrySelect } from "@/components/ui/CountrySelect";
import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { SavedAddressCard } from "@/components/sections/createShipment/express/SavedAddressCard";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentFooter";
import InfoBox from "@/components/sections/createShipment/InfoBox";

interface SavedRecipient {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  countryFlag: string;
}

const SAVED_RECIPIENTS: SavedRecipient[] = [
  {
    id: "1",
    name: "Gulf Retail LLC",
    addressLine: "Sheikh Zayed Rd, Al Quoz",
    city: "Dubai",
    countryFlag: "🇦🇪",
  },
];

export default function RecipientDetailsScreen() {
  const router = useRouter();

  const [countryCode, setCountryCode] = useState("AE");

  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const handleContinue = () => {
    router.push("/createShipment/express/step-4");
  };

  const handleUseSaved = (recipient: SavedRecipient) => {
    setRecipientName(recipient.name);
    setCity(recipient.city);
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
          step={3}
          totalSteps={8}
          title="Recipient Details"
          subtitle="Delivery address and contact"
          onBack={() => router.back()}
        />

        <SectionTitle title="COUNTRY" />

        <CountrySelect
          value={countryCode}
          onChange={(selected) => setCountryCode(selected.code)}
          placeholder="Select country"
        />

        <SectionTitle title="SAVED RECIPIENT ADDRESSES" />

        {SAVED_RECIPIENTS.map((recipient) => (
          <SavedAddressCard
            key={recipient.id}
            variant="use"
            name={recipient.name}
            address={recipient.addressLine}
            city={recipient.city}
            countryFlag={recipient.countryFlag}
            onPress={() => handleUseSaved(recipient)}
          />
        ))}

        <SectionTitle title="OR ENTER A NEW ADDRESS" />

        <Input
          placeholder="Recipient name"
          value={recipientName}
          onChangeText={setRecipientName}
          autoCapitalize="words"
        />

        <Input
          placeholder="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Input placeholder="City" value={city} onChangeText={setCity} />
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

        <InfoBox text="Some countries also require a state or province." />
      </ScrollView>

      <ShipmentFooter onPress={handleContinue} />
    </KeyboardAvoidingView>
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

  sectionTitle: {
    color: "#687994",
    letterSpacing: 1.5,
    marginStart: rs(4),
    marginBottom: rvs(12),
  },

  row: {
    flexDirection: "row",
    gap: rs(18),
  },

  half: {
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
});
