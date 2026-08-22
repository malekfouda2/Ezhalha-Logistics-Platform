import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import {
  ForgotPasswordFormData,
  forgotPasswordSchema,
} from "@/schemas/password";
import { useForgotPassword } from "@/lib/hooks/useAuth";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import Toast from "react-native-toast-message";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const forgotPasswordMutation = useForgotPassword();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      await forgotPasswordMutation.mutateAsync(data.email);
        router.push({
          pathname: "/(auth)/reset-password",
          params: { email: data.email },
        });
      Toast.show({
        type: "success",
        text1: t("toast.forgotPassword.successTitle"),
        text2: t("toast.forgotPassword.successMessage"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.forgotPassword.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.forgotPassword.errorMessage"),
      });
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
      <BackButton style={{ marginBottom: rvs(40) }} />

      <View style={styles.header}>
        <Text size="title" weight="bold" style={styles.centerText}>
          {t("forgotPassword.title")}
        </Text>
        <Text
          size="medium"
          weight="regular"
          dimRate="70%"
          style={[styles.centerText, { marginTop: rvs(8) }]}
        >
          {t("forgotPassword.subtitle")}
        </Text>
      </View>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t("forgotPassword.emailLabel")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            placeholder={t("forgotPassword.emailPlaceholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
      />

      <Button
        title={
          forgotPasswordMutation.isPending
            ? t("forgotPassword.sending")
            : t("forgotPassword.sendResetLink")
        }
        onPress={handleSubmit(onSubmit)}
        loading={forgotPasswordMutation.isPending}
        disabled={forgotPasswordMutation.isPending}
      />

      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={rs(20)}
          color={Colors.primary}
          style={{ marginRight: rs(10) }}
        />
        <Text
          size="small"
          weight="regular"
          style={[styles.infoText, { color: Colors.primaryDark }]}
        >
          {t("forgotPassword.infoText")}
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
  header: { alignItems: "center", marginBottom: rvs(36) },
  centerText: { textAlign: "center" },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: setOpacity(Colors.primary, 0.08),
    borderRadius: rs(14),
    padding: rs(16),
    marginTop: rvs(20),
  },
  infoText: { flex: 1 },
});
