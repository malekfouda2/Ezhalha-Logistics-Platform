import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { rs, rvs } from "@/utils/responsive";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { PhoneInput } from "@/components/ui/PhoneInput";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { SavedAddressSelect } from "@/components/sections/createShipment/SavedAddressSelect";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useRecipientStep } from "@/lib/hooks/createShipment/express/useRecipientStep";

export default function RecipientDetailsScreen() {
  const { t } = useTranslation();

  const {
    form,
    handleContinue,
    savedRecipientAddresses,
    isLoadingAddresses,
    applySavedAddress,
    selectedAddressId,
  } = useRecipientStep();

  const { control, watch, formState: { errors } } = form;
  const countryCode = watch("countryCode");
  const recipientNeedsShortAddress = countryCode === "SA";

  return (
    <ShipmentStepLayout
      step={3}
      totalSteps={8}
      title={t("createShipment.express.steps.step3.title")}
      subtitle={t("createShipment.express.steps.step3.subtitle")}
      onContinue={handleContinue}
    >
      <SectionTitle title={t("createShipment.express.steps.step3.savedRecipients.title")} />

      <Text size="small" style={styles.description}>
        {t("createShipment.express.steps.step3.savedRecipients.description")}
      </Text>

      <SavedAddressSelect
        title={t("createShipment.express.steps.step3.savedRecipients.title")}
        placeholder={t(
          "createShipment.express.steps.step3.savedRecipients.placeholder",
        )}
        emptyText={t(
          "createShipment.express.steps.step3.savedRecipients.empty",
        )}
        addresses={savedRecipientAddresses}
        isLoading={isLoadingAddresses}
        selectedAddressId={selectedAddressId}
        onSelect={applySavedAddress}
      />

      <View style={styles.selectGap} />

      <SectionTitle title={t("createShipment.express.steps.step3.newAddress.title")} />

      <Controller
        control={control}
        name="countryCode"
        render={({ field }) => (
          <CountrySelect
            value={field.value}
            onChange={(selected) => {
              field.onChange(selected.code);
              form.setValue("country", selected.name, { shouldValidate: true });
            }}
            placeholder={t("createShipment.express.steps.step3.country.placeholder")}
            error={errors.countryCode?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.express.steps.step3.newAddress.recipientFullName")}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="words"
            error={errors.name?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="company"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.express.steps.step3.newAddress.recipientCompany")}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="words"
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
            placeholder={"Recipient@example.com"}
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
            placeholder={t("createShipment.express.steps.step3.newAddress.addressLine1")}
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
            placeholder={t("createShipment.express.steps.step3.newAddress.addressLine2")}
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
              <Input
                placeholder={t("createShipment.express.steps.step3.newAddress.city")}
                value={field.value}
                onChangeText={field.onChange}
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
              <Input
                placeholder={t("createShipment.express.steps.step3.newAddress.postalCode")}
                value={field.value}
                onChangeText={field.onChange}
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
            placeholder={t("createShipment.express.steps.step3.newAddress.stateOrProvince")}
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
              placeholder={t("createShipment.express.steps.step3.newAddress.shortAddress")}
              value={field.value ?? ""}
              onChangeText={field.onChange}
              autoCapitalize="characters"
              error={errors.shortAddress?.message}
            />
          )}
        />
      )}

      <InfoBox text={t("createShipment.express.steps.step3.info")} />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: rs(18) },
  half: { flex: 1 },
  description: { color: "#687994", marginBottom: rvs(12) },
  selectGap: { height: rvs(20) },
});