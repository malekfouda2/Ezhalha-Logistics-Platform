import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { PhoneInput } from "@/components/ui/PhoneInput";

import { rs, rvs } from "@/utils/responsive";
import { SavedAddressSelect } from "@/components/sections/createShipment/express/SavedAddressSelect";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useSenderStep } from "@/lib/hooks/createShipment/express/useSenderStep";
import { isStateRequired } from "@/utils/shipmentValidation";

export default function SenderDetailsScreen() {
  const { t } = useTranslation();

  const {
    form,
    handleContinue,
    savedSenderAddresses,
    isLoadingAddresses,
    applySavedAddress,
    selectedAddressId,
  } = useSenderStep();

  const {
    control,
    watch,
    formState: { errors },
  } = form;
  const countryCode = watch("countryCode");
  const senderNeedsShortAddress = countryCode === "SA";

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

      <Text size="small" style={styles.description}>
        {t("createShipment.express.steps.step2.savedAddresses.description")}
      </Text>

      <SavedAddressSelect
        title={t("createShipment.express.steps.step2.savedAddresses.title")}
        placeholder={t(
          "createShipment.express.steps.step2.savedAddresses.placeholder",
        )}
        emptyText={t(
          "createShipment.express.steps.step2.savedAddresses.empty",
        )}
        addresses={savedSenderAddresses}
        isLoading={isLoadingAddresses}
        selectedAddressId={selectedAddressId}
        onSelect={applySavedAddress}
      />

      <View style={styles.selectGap} />

      <SectionTitle
        title={t("createShipment.express.steps.step2.newAddress")}
      />

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
            placeholder={t("createShipment.express.steps.step2.country")}
            title={t("createShipment.express.steps.step2.country")}
            error={errors.countryCode?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.express.steps.step2.senderFullName")}
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
            placeholder={t("createShipment.express.steps.step2.senderCompany")}
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
          <PhoneInput
            value={field.value}
            onChangeValue={field.onChange}
            error={errors.phone?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            placeholder="Sender@example.com"
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
            placeholder={t("createShipment.express.steps.step2.addressLine1")}
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
            placeholder={t("createShipment.express.steps.step2.addressLine2")}
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
                placeholder={t("createShipment.express.steps.step2.city")}
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
                placeholder={t("createShipment.express.steps.step2.postalCode")}
                value={field.value}
                onChangeText={field.onChange}
                keyboardType="number-pad"
                error={errors.postalCode?.message}
              />
            )}
          />
        </View>
      </View>

      {isStateRequired(countryCode) && (
        <Controller
          control={control}
          name="stateOrProvince"
          render={({ field }) => (
            <Input
              placeholder={t(
                "createShipment.express.steps.step2.stateOrProvince",
              )}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.stateOrProvince?.message}
            />
          )}
        />
      )}

      {senderNeedsShortAddress && (
        <Controller
          control={control}
          name="shortAddress"
          render={({ field }) => (
            <Input
              placeholder={t(
                "createShipment.express.steps.step2.shortAddress",
              )}
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
  description: { color: "#687994", marginBottom: rvs(12) },
  selectGap: { height: rvs(20) },
});
