import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";

import { rs, rvs } from "@/utils/responsive";
import { SavedAddressSelect } from "@/components/sections/createShipment/SavedAddressSelect";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useLocalSenderStep } from "@/lib/hooks/createShipment/local/useSenderStep";

export default function LocalSenderDetailsScreen() {
  const { t } = useTranslation();

  const {
    form,
    handleContinue,
    savedSenderAddresses,
    isLoadingAddresses,
    applySavedAddress,
    selectedAddressId,
  } = useLocalSenderStep();

  const {
    control,
    formState: { errors },
  } = form;

  return (
    <ShipmentStepLayout
      step={1}
      totalSteps={5}
      title={t("createShipment.local.steps.step1.title")}
      subtitle={t("createShipment.local.steps.step1.subtitle")}
      onContinue={handleContinue}
    >
      <SectionTitle title={t("createShipment.local.steps.step1.pickupFrom")} />

      <SavedAddressSelect
        title={t("createShipment.local.steps.step1.pickupFrom")}
        placeholder={t("createShipment.local.steps.step1.pickupPlaceholder")}
        emptyText={t("createShipment.local.steps.step1.pickupEmpty")}
        addresses={savedSenderAddresses}
        isLoading={isLoadingAddresses}
        selectedAddressId={selectedAddressId}
        onSelect={applySavedAddress}
      />

      <View style={styles.selectGap} />

      <SectionTitle title={t("createShipment.local.steps.step1.newAddress")} />

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.local.steps.step1.fullName")}
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
        name="addressLine1"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.local.steps.step1.addressLine1")}
            value={field.value}
            onChangeText={field.onChange}
            error={errors.addressLine1?.message}
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
                placeholder={t("createShipment.local.steps.step1.city")}
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
            name="district"
            render={({ field }) => (
              <Input
                placeholder={t("createShipment.local.steps.step1.district")}
                value={field.value ?? ""}
                onChangeText={field.onChange}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="shortAddress"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.local.steps.step1.shortAddress")}
            value={field.value ?? ""}
            onChangeText={field.onChange}
            autoCapitalize="characters"
            error={errors.shortAddress?.message}
          />
        )}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: rs(18) },
  half: { flex: 1 },
  selectGap: { height: rvs(20) },
});
