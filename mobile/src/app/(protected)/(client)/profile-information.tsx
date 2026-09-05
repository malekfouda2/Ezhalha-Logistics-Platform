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
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { useClientAccount, useUpdateClientAccount } from "@/lib/hooks/useClientAccount";
import {
  profileInformationSchema,
  type ProfileInformationFormData,
} from "@/schemas/profileInformation";

export default function ProfileInformationScreen() {
  const { t } = useTranslation();
  const { data: account, isLoading } = useClientAccount();
  const updateMutation = useUpdateClientAccount();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInformationFormData>({
    resolver: zodResolver(profileInformationSchema),
    defaultValues: {
      contactName: "",
      companyName: "",
      email: "",
      phone: "",
    },
  });

  useEffect(() => {
    if (!account) return;
    reset({
      contactName: account.name ?? "",
      companyName: account.companyName ?? "",
      email: account.email ?? "",
      phone: account.phone ?? "",
    });
  }, [account, reset]);

  const onSubmit = async (data: ProfileInformationFormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.contactName.trim(),
        companyName: data.companyName?.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
      });
      Toast.show({
        type: "success",
        text1: t("profileInformation.successTitle"),
        text2: t("profileInformation.successMessage"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("profileInformation.errorTitle"),
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
              title={isSaving ? t("profileInformation.saving") : t("profileInformation.save")}
              onPress={handleSubmit(onSubmit)}
              loading={isSaving}
              disabled={isLoading || isSaving}
            />
          </View>
        }
      >
        <ScreenHeader
          title={t("profileInformation.title")}
          subtitle={t("profileInformation.subtitle")}
        />

        <Controller
          control={control}
          name="contactName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t("profileInformation.contactNameLabel")}
              placeholder={t("profileInformation.contactNamePlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="words"
              error={errors.contactName?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="companyName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t("profileInformation.companyNameLabel")}
              placeholder={t("profileInformation.companyNamePlaceholder")}
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="words"
              error={errors.companyName?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t("profileInformation.emailLabel")}
              placeholder={t("profileInformation.emailPlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
            />
          )}
        />

        <Text size="medium" weight="semibold" style={styles.phoneLabel}>
          {t("profileInformation.phoneLabel")}
        </Text>
        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, value } }) => (
            <PhoneInput
              value={value ?? ""}
              onChangeValue={onChange}
              placeholder={t("profileInformation.phonePlaceholder")}
              searchPlaceholder={t("phoneInput.searchPlaceholder")}
              error={errors.phone?.message}
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
  phoneLabel: {
    color: Colors.text,
    marginBottom: rvs(10),
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    backgroundColor: Colors.background,
  },
});
