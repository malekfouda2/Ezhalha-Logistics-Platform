import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/Input";
import { rs } from "@/utils/responsive";
import { CountrySelect } from "@/components/ui/CountrySelect";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { SavedAddressCard } from "@/components/sections/createShipment/express/SavedAddressCard";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

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
  const { t } = useTranslation();

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
    <ShipmentStepLayout
      step={3}
      totalSteps={8}
      title={t("createShipment.express.steps.step3.title")}
      subtitle={t("createShipment.express.steps.step3.subtitle")}
      onContinue={handleContinue}
    >
      <SectionTitle
        title={t("createShipment.express.steps.step3.country.title")}
      />

      <CountrySelect
        value={countryCode}
        onChange={(selected) => setCountryCode(selected.code)}
        placeholder={t(
          "createShipment.express.steps.step3.country.placeholder"
        )}
      />

      <SectionTitle
        title={t(
          "createShipment.express.steps.step3.savedRecipients.title"
        )}
      />

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

      <SectionTitle
        title={t("createShipment.express.steps.step3.newAddress.title")}
      />

      <Input
        placeholder={t(
          "createShipment.express.steps.step3.newAddress.recipientName"
        )}
        value={recipientName}
        onChangeText={setRecipientName}
        autoCapitalize="words"
      />

      <Input
        placeholder={t("createShipment.express.steps.step3.newAddress.phone")}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Input
            placeholder={t(
              "createShipment.express.steps.step3.newAddress.city"
            )}
            value={city}
            onChangeText={setCity}
          />
        </View>

        <View style={styles.half}>
          <Input
            placeholder={t(
              "createShipment.express.steps.step3.newAddress.postalCode"
            )}
            value={postalCode}
            onChangeText={setPostalCode}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <InfoBox
        text={t("createShipment.express.steps.step3.info")}
      />
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