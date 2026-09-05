import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { useChangePassword, useSignOut } from "@/lib/hooks/useAuth";

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const changePasswordMutation = useChangePassword();
  const signOutMutation = useSignOut();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (!currentPassword) nextErrors.currentPassword = t("changePassword.errors.currentRequired");
    if (newPassword.length < 8) nextErrors.newPassword = t("changePassword.errors.passwordMin");
    if (!confirmPassword) nextErrors.confirmPassword = t("changePassword.errors.confirmRequired");
    else if (confirmPassword !== newPassword)
      nextErrors.confirmPassword = t("changePassword.errors.passwordMismatch");
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
      Toast.show({
        type: "success",
        text1: t("changePassword.successTitle"),
        text2: t("changePassword.successMessage"),
      });
      await signOutMutation.mutateAsync();
      router.replace("/(auth)/login");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("changePassword.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen
        contentContainerStyle={styles.content}
        footer={
          <View style={styles.footer}>
            <Button
              title={
                changePasswordMutation.isPending
                  ? t("changePassword.saving")
                  : t("changePassword.save")
              }
              onPress={handleSave}
              loading={changePasswordMutation.isPending}
              disabled={changePasswordMutation.isPending}
            />
          </View>
        }
      >
        <ScreenHeader
          title={t("changePassword.title")}
          subtitle={t("changePassword.subtitle")}
        />

        <Input
          label={t("changePassword.currentPasswordLabel")}
          placeholder="••••••••••"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry={!showCurrent}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          error={errors.currentPassword}
          rightElement={
            <Ionicons
              name={showCurrent ? "eye-off-outline" : "eye-outline"}
              size={rs(20)}
              color={Colors.textSecondary}
            />
          }
          onRightElementPress={() => setShowCurrent((v) => !v)}
        />

        <Input
          label={t("changePassword.newPasswordLabel")}
          placeholder="••••••••••"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showNew}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          error={errors.newPassword}
          rightElement={
            <Ionicons
              name={showNew ? "eye-off-outline" : "eye-outline"}
              size={rs(20)}
              color={Colors.textSecondary}
            />
          }
          onRightElementPress={() => setShowNew((v) => !v)}
        />

        <Input
          label={t("changePassword.confirmPasswordLabel")}
          placeholder="••••••••••"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showNew}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          error={errors.confirmPassword}
        />

        <PasswordStrengthBar password={newPassword} />
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
  footer: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(20),
    paddingTop: rvs(8),
    backgroundColor: Colors.background,
  },
});
