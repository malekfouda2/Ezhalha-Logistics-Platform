import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";

import { rs, rvs } from "@/utils/responsive";
import { SavedAddressCard } from "@/components/sections/createShipment/express/SavedAddressCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useSenderStep } from "@/lib/hooks/createShipment/express/useSenderStep";

export default function SenderDetailsScreen() {
  const { t } = useTranslation();

  const {
    shipper,
    updateShipper,
    handleContinue,
    savedSenderAddresses,
    isLoadingAddresses,
    applySavedAddress,
    selectedAddressId,
  } = useSenderStep();

  return (
    <ShipmentStepLayout
      step={2}
      totalSteps={8}
      title={t("createShipment.express.steps.step2.title")}
      subtitle={t("createShipment.express.steps.step2.subtitle")}
      onContinue={handleContinue}
    >
      <SectionTitle
        title={t("createShipment.express.steps.step2.savedAddresses.title")}
      />

      {isLoadingAddresses ? (
        <Text size="small" style={styles.emptyText}>
          {t("common.loading")}
        </Text>
      ) : savedSenderAddresses.length > 0 ? (
        savedSenderAddresses.map((address) => (
          <SavedAddressCard
            key={address.id}
            name={address.label}
            address={address.addressLine1}
            city={
              address.postalCode
                ? `${address.city} ${address.postalCode}`
                : address.city
            }
            countryFlag={address.countryCode === "SA" ? "🇸🇦" : "🌍"}
            defaultAddress={address.source === "default_shipping"}
            selected={selectedAddressId === address.id}
            onPress={() => applySavedAddress(address)}
          />
        ))
      ) : (
        <Text size="small" style={styles.emptyText}>
          {t("createShipment.express.steps.step2.savedAddresses.empty")}
        </Text>
      )}

      <SectionTitle
        title={t("createShipment.express.steps.step2.newAddress")}
      />

      <Input
        placeholder={t("createShipment.express.steps.step2.contactName")}
        value={shipper.name}
        onChangeText={(value) => updateShipper({ name: value })}
        autoCapitalize="words"
      />

      <Input
        placeholder={t("createShipment.express.steps.step2.phone")}
        value={shipper.phone}
        onChangeText={(value) => updateShipper({ phone: value })}
        keyboardType="phone-pad"
      />

      <Input
        placeholder={t("createShipment.express.steps.step2.addressLine1")}
        value={shipper.addressLine1}
        onChangeText={(value) => updateShipper({ addressLine1: value })}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Input
            placeholder={t("createShipment.express.steps.step2.city")}
            value={shipper.city}
            onChangeText={(value) => updateShipper({ city: value })}
          />
        </View>

        <View style={styles.half}>
          <Input
            placeholder={t("createShipment.express.steps.step2.postalCode")}
            value={shipper.postalCode}
            onChangeText={(value) => updateShipper({ postalCode: value })}
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
  emptyText: {
    color: "#687994",
    marginBottom: rvs(15),
  },
});
