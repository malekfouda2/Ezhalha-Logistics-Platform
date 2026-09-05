import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Toast from "react-native-toast-message";

import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { CountrySelect } from "@/components/ui/CountrySelect";
import {
  GeoSuggestInput,
  type GeoSuggestion,
} from "@/components/ui/GeoSuggestInput";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import InfoBox from "@/components/ui/InfoBox";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import {
  useClientAccount,
  useUpdateClientAccount,
} from "@/lib/hooks/useClientAccount";
import {
  defaultShippingAddressSchema,
  type DefaultShippingAddressFormData,
} from "@/schemas/defaultShippingAddress";

export default function DefaultShippingAddressScreen() {
  const { t } = useTranslation();
  const { data: account, isLoading } = useClientAccount();
  const updateMutation = useUpdateClientAccount();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DefaultShippingAddressFormData>({
    resolver: zodResolver(defaultShippingAddressSchema),
    defaultValues: {
      shippingContactName: "",
      shippingContactPhone: "",
      shippingCountryCode: "",
      shippingStateOrProvince: "",
      shippingCity: "",
      shippingPostalCode: "",
      shippingAddressLine1: "",
      shippingAddressLine2: "",
    },
  });

  const countryCode = watch("shippingCountryCode");

  useEffect(() => {
    if (!account) return;
    reset({
      shippingContactName: account.shippingContactName ?? "",
      shippingContactPhone: account.shippingContactPhone ?? "",
      shippingCountryCode: account.shippingCountryCode || account.country || "",
      shippingStateOrProvince: account.shippingStateOrProvince ?? "",
      shippingCity: account.shippingCity ?? "",
      shippingPostalCode: account.shippingPostalCode ?? "",
      shippingAddressLine1: account.shippingAddressLine1 ?? "",
      shippingAddressLine2: account.shippingAddressLine2 ?? "",
    });
  }, [account, reset]);

  const pickGeo = (suggestion: GeoSuggestion) => {
    setValue("shippingCity", suggestion.city, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("shippingPostalCode", suggestion.postalCode, {
      shouldValidate: true,
      shouldDirty: true,
    });
    if (suggestion.state) {
      setValue("shippingStateOrProvince", suggestion.state, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };

  const onSubmit = async (data: DefaultShippingAddressFormData) => {
    try {
      await updateMutation.mutateAsync({
        shippingContactName: data.shippingContactName.trim(),
        shippingContactPhone: data.shippingContactPhone.trim(),
        shippingCountryCode: data.shippingCountryCode,
        shippingStateOrProvince:
          data.shippingStateOrProvince?.trim() || undefined,
        shippingCity: data.shippingCity.trim(),
        shippingPostalCode: data.shippingPostalCode.trim(),
        shippingAddressLine1: data.shippingAddressLine1.trim(),
        shippingAddressLine2: data.shippingAddressLine2?.trim() || undefined,
      });
      Toast.show({
        type: "success",
        text1: t("defaultShippingAddress.successTitle"),
        text2: t("defaultShippingAddress.successMessage"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("defaultShippingAddress.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const isSaving = isSubmitting || updateMutation.isPending;

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen
        contentContainerStyle={styles.content}
        footer={
          <View style={styles.footer}>
            <Button
              title={
                isSaving
                  ? t("defaultShippingAddress.saving")
                  : t("defaultShippingAddress.save")
              }
              onPress={handleSubmit(onSubmit)}
              loading={isSaving}
              disabled={isLoading || isSaving}
            />
          </View>
        }
      >
        <ScreenHeader
          title={t("defaultShippingAddress.title")}
          subtitle={t("defaultShippingAddress.subtitle")}
        />

        <Controller
          control={control}
          name="shippingContactName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t("defaultShippingAddress.contactName")}
              placeholder={t("defaultShippingAddress.contactNamePlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="words"
              error={errors.shippingContactName?.message}
            />
          )}
        />

        <Text size="medium" weight="semibold" style={styles.fieldLabel}>
          {t("defaultShippingAddress.contactPhone")}
        </Text>
        <Controller
          control={control}
          name="shippingContactPhone"
          render={({ field: { onChange, value } }) => (
            <PhoneInput
              value={value ?? ""}
              onChangeValue={onChange}
              placeholder={t("defaultShippingAddress.contactPhonePlaceholder")}
              searchPlaceholder={t("phoneInput.searchPlaceholder")}
              error={errors.shippingContactPhone?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="shippingCountryCode"
          render={({ field: { onChange, value } }) => (
            <CountrySelect
              value={value}
              onChange={(country) => onChange(country.code)}
              placeholder={t("defaultShippingAddress.country")}
              title={t("defaultShippingAddress.country")}
              searchPlaceholder={t("countryPicker.searchPlaceholder")}
              error={errors.shippingCountryCode?.message}
            />
          )}
        />
        <Text size="medium" weight="semibold" style={styles.fieldLabel}>
          {t("defaultShippingAddress.city")}
        </Text>
        <Controller
          control={control}
          name="shippingCity"
          render={({ field: { onChange, value } }) => (
            <GeoSuggestInput
              mode="city"
              country={countryCode}
              placeholder={t("defaultShippingAddress.cityPlaceholder")}
              value={value}
              onChangeText={onChange}
              onPick={pickGeo}
              error={errors.shippingCity?.message}
            />
          )}
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Controller
              control={control}
              name="shippingStateOrProvince"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t("defaultShippingAddress.stateOrProvince")}
                  placeholder={t(
                    "defaultShippingAddress.stateOrProvincePlaceholder",
                  )}
                  value={value ?? ""}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.shippingStateOrProvince?.message}
                />
              )}
            />
          </View>
          <View style={styles.half}>
            <Text size="medium" weight="semibold" style={styles.fieldLabel}>
              {t("defaultShippingAddress.postalCode")}
            </Text>
            <Controller
              control={control}
              name="shippingPostalCode"
              render={({ field: { onChange, value } }) => (
                <GeoSuggestInput
                  mode="postal"
                  country={countryCode}
                  placeholder={t(
                    "defaultShippingAddress.postalCodePlaceholder",
                  )}
                  value={value}
                  onChangeText={onChange}
                  onPick={pickGeo}
                  keyboardType="number-pad"
                  error={errors.shippingPostalCode?.message}
                />
              )}
            />
          </View>
        </View>

        <Controller
          control={control}
          name="shippingAddressLine1"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t("defaultShippingAddress.addressLine1")}
              placeholder={t("defaultShippingAddress.addressLine1Placeholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.shippingAddressLine1?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="shippingAddressLine2"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t("defaultShippingAddress.addressLine2")}
              placeholder={t("defaultShippingAddress.addressLine2Placeholder")}
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.shippingAddressLine2?.message}
            />
          )}
        />

      </KeyboardAwareScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  fieldLabel: {
    color: Colors.text,
    marginBottom: rvs(10),
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    backgroundColor: Colors.background,
  },
  row: { flexDirection: "row", gap: rs(14) },
  half: { flex: 1 },
});
