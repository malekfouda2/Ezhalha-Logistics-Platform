// app/create-shipment/doorToDoor/step-3.tsx

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { GeoSuggestInput, type GeoSuggestion } from "@/components/ui/GeoSuggestInput";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { SavedAddressSelect } from "@/components/sections/createShipment/SavedAddressSelect";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useRecipientStep } from "@/lib/hooks/createShipment/doorToDoor/useRecipientStep";
import { rs } from "@/utils/responsive";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";

function countryLabel(code: string) {
  return COUNTRY_CODE_SELECT_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

export default function RecipientDetailsScreen() {
  const { t } = useTranslation();

  const {
    form,
    destinationCountryCode,
    savedRecipientAddresses,
    isLoadingAddresses,
    applySavedAddress,
    selectedAddressId,
    handleContinue,
    handleBack,
  } = useRecipientStep();

  const { control, formState: { errors } } = form;
  const recipientNeedsShortAddress = destinationCountryCode === "SA";

  // Fill city + postal (+ state when empty) from a picked city/postal suggestion.
  const pickGeo = (s: GeoSuggestion) => {
    form.setValue("city", s.city, { shouldValidate: true });
    form.setValue("postalCode", s.postalCode, { shouldValidate: true });
    if (!form.getValues("stateOrProvince")) {
      form.setValue("stateOrProvince", s.state || "", { shouldValidate: true });
    }
  };

  return (
    <ShipmentStepLayout
      step={3}
      totalSteps={9}
      title={t("createShipment.freight.steps.step3.title")}
      subtitle={t("createShipment.freight.steps.step3.subtitle", { country: countryLabel(destinationCountryCode) })}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <SavedAddressSelect
        title={t("createShipment.freight.steps.step3.savedRecipients.title")}
        placeholder={t("createShipment.freight.steps.step3.savedRecipients.placeholder")}
        emptyText={t("createShipment.freight.steps.step3.savedRecipients.empty")}
        addresses={savedRecipientAddresses}
        isLoading={isLoadingAddresses}
        selectedAddressId={selectedAddressId}
        onSelect={applySavedAddress}
      />

      <View style={styles.selectGap} />

      <SectionTitle title={t("createShipment.freight.steps.step3.newAddress")} />

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step3.recipientName")}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="words"
            error={errors.name?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <PhoneInput value={field.value} onChangeValue={field.onChange} error={errors.phone?.message} />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step3.email")}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="addressLine1"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step3.addressLine1")}
            value={field.value}
            onChangeText={field.onChange}
            error={errors.addressLine1?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="addressLine2"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step3.addressLine2")}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Controller
            control={control}
            name="city"
            render={({ field }) => (
              <GeoSuggestInput
                mode="city"
                country={destinationCountryCode}
                placeholder={t("createShipment.freight.steps.step3.city")}
                value={field.value}
                onChangeText={field.onChange}
                onPick={pickGeo}
                error={errors.city?.message}
              />
            )}
          />
        </View>

        <View style={styles.half}>
          <Controller
            control={control}
            name="postalCode"
            render={({ field }) => (
              <GeoSuggestInput
                mode="postal"
                country={destinationCountryCode}
                placeholder={t("createShipment.freight.steps.step3.postalCode")}
                value={field.value}
                onChangeText={field.onChange}
                onPick={pickGeo}
                keyboardType="number-pad"
                error={errors.postalCode?.message}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="stateOrProvince"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step3.stateOrProvince")}
            value={field.value}
            onChangeText={field.onChange}
            error={errors.stateOrProvince?.message}
          />
        )}
      />

      {recipientNeedsShortAddress && (
        <Controller
          control={control}
          name="shortAddress"
          render={({ field }) => (
            <Input
              placeholder={t("createShipment.freight.steps.step3.shortAddress")}
              value={field.value ?? ""}
              onChangeText={field.onChange}
              autoCapitalize="characters"
              error={errors.shortAddress?.message}
            />
          )}
        />
      )}
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: rs(18) },
  half: { flex: 1 },
  selectGap: { height: rs(20) },
});
