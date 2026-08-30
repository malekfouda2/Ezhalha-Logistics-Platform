// app/create-shipment/express/step-2.tsx

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Input } from "@/components/ui/Input";
import { rs } from "@/utils/responsive";
import { SavedAddressCard } from "@/components/sections/createShipment/express/SavedAddressCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

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

  const [selectedAddress, setSelectedAddress] = useState("1");

  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const handleContinue = () => {
    router.push("/createShipment/express/step-3");
  };

  return (
    <ShipmentStepLayout
      step={2}
      totalSteps={8}
      title="Sender Details"
      subtitle="Pickup address and contact"
      onContinue={handleContinue}
    >
      <SectionTitle title="SAVED SENDER ADDRESSES" />
      {SAVED_ADDRESSES.map((address) => (
        <SavedAddressCard
          key={address.id}
          name={address.name}
          address={address.address}
          city={address.city}
          type={address.type}
          defaultAddress={address.defaultAddress}
          selected={selectedAddress === address.id}
          onPress={() => setSelectedAddress(address.id)}
        />
      ))}

      <SectionTitle title="OR ENTER A NEW ADDRESS" />

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
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: rs(18),
  },

  half: {
    flex: 1,
  },
});
