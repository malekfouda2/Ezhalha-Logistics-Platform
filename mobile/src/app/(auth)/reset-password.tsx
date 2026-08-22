import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";

import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { ResetPasswordFormData, resetPasswordSchema } from "@/schemas/password";
import { useResetPassword } from "@/lib/hooks/useAuth";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import Toast from "react-native-toast-message";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const { token: rawToken } = useLocalSearchParams<{
    token?: string | string[];
  }>();

  const token = Array.isArray(rawToken) ? rawToken[0] : (rawToken ?? "");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resetPasswordMutation = useResetPassword();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  });

  const password = watch("password");

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (resetPasswordMutation.isPending) {
      return;
    }

    try {
      await resetPasswordMutation.mutateAsync({
        token,
        password: data.password,
      });

      router.replace("/login");
      Toast.show({
        type: "success",
        text1: t("toast.resetPassword.successTitle"),
        text2: t("toast.resetPassword.successMessage"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.resetPassword.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.resetPassword.errorMessage"),
      });
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
      <BackButton style={styles.backButton} />

      <View style={styles.header}>
        <Text size="title" weight="bold" style={styles.centerText}>
          {t("resetPassword.title")}
        </Text>

        <Text
          size="medium"
          weight="regular"
          dimRate="70%"
          style={styles.subtitle}
        >
          {t("resetPassword.subtitle")}
        </Text>
      </View>

      {/* New Password */}
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t("resetPassword.newPasswordLabel")}
            placeholder="••••••••••"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            rightElement={
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={rs(20)}
                color={Colors.textSecondary}
              />
            }
            onRightElementPress={() => setShowPassword((previous) => !previous)}
          />
        )}
      />

      {/* Confirm Password */}
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t("resetPassword.confirmPasswordLabel")}
            placeholder="••••••••••"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirmPassword?.message}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            rightElement={
              <Ionicons
                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                size={rs(20)}
                color={Colors.textSecondary}
              />
            }
            onRightElementPress={() =>
              setShowConfirmPassword((previous) => !previous)
            }
          />
        )}
      />

      {/* Password Strength */}
      <PasswordStrengthBar password={password} />

      {/* Submit */}
      <Button
        title={
          resetPasswordMutation.isPending
            ? t("resetPassword.saving")
            : t("resetPassword.saveAndSignIn")
        }
        onPress={handleSubmit(onSubmit)}
        loading={resetPasswordMutation.isPending}
        disabled={resetPasswordMutation.isPending}
      />

      {/* Information */}
      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={rs(20)}
          color={Colors.primary}
          style={styles.infoIcon}
        />

        <Text size="small" weight="regular" style={styles.infoText}>
          {t("resetPassword.infoText")}
        </Text>
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: rs(24),
    paddingTop: rvs(24),
    paddingBottom: rvs(24),
  },

  backButton: {
    marginBottom: rvs(40),
  },

  header: {
    alignItems: "center",
    marginBottom: rvs(36),
  },

  centerText: {
    textAlign: "center",
  },

  subtitle: {
    textAlign: "center",
    marginTop: rvs(8),
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: setOpacity(Colors.primary, 0.08),
    borderRadius: rs(14),
    padding: rs(16),
    marginTop: rvs(20),
  },

  infoIcon: {
    marginRight: rs(10),
  },

  infoText: {
    flex: 1,
    color: Colors.primaryDark,
  },
});
