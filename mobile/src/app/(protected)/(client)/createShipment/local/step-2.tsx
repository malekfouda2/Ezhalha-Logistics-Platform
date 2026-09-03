import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";

import { rs, rvs } from "@/utils/responsive";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useLocalRecipientStep } from "@/lib/hooks/createShipment/local/useRecipientStep";

export default function LocalRecipientDetailsScreen() {
  const { t } = useTranslation();

  const { form, handleContinue, handleBack } = useLocalRecipientStep();

  const {
    control,
    formState: { errors },
  } = form;

  return (
    <ShipmentStepLayout
      step={2}
      totalSteps={5}
      title={t("createShipment.local.steps.step2.title")}
      subtitle={t("createShipment.local.steps.step2.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.local.steps.step2.fullName")}
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
            placeholder={t("createShipment.local.steps.step2.addressLine1")}
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
                placeholder={t("createShipment.local.steps.step2.city")}
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
                placeholder={t("createShipment.local.steps.step2.district")}
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
            placeholder={t("createShipment.local.steps.step2.shortAddress")}
            value={field.value ?? ""}
            onChangeText={field.onChange}
            autoCapitalize="characters"
            error={errors.shortAddress?.message}
          />
        )}
      />

      <InfoBox text={t("createShipment.local.steps.step2.info")} />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: rs(18) },
  half: { flex: 1 },
  selectGap: { height: rvs(20) },
});
