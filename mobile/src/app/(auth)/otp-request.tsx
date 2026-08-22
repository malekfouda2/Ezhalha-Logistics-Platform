import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { otpRequestSchema, OtpRequestFormData } from "@/schemas/otp";
import { BackButton } from "@/components/ui/BackButton";
import { useRequestLoginCode } from "@/lib/hooks/useAuth";
import Toast from "react-native-toast-message";

export default function OtpRequestScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const requestLoginCodeMutation = useRequestLoginCode();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpRequestFormData>({
    resolver: zodResolver(otpRequestSchema),
    defaultValues: {
      email: "",
    },
    mode: "onSubmit",
  });

  const onSubmit = async (data: OtpRequestFormData) => {
    try {
      setLoading(true);

      await requestLoginCodeMutation.mutateAsync(data.email);

      router.push({
        pathname: "/(auth)/otp-verify",
        params: { email: data.email },
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.otp.request.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.otp.request.errorMessage"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <BackButton style={{ marginBottom: rvs(40) }} />

          <View style={styles.header}>
            <Text size="title" weight="bold" style={styles.centerText}>
              {t("otp.request.title")}
            </Text>
            <Text
              size="medium"
              weight="regular"
              dimRate="70%"
              style={[styles.centerText, { marginTop: rvs(8) }]}
            >
              {t("otp.request.subtitle")}
            </Text>
          </View>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t("otp.request.emailLabel")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                placeholder={t("otp.request.emailPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />

          <Button
            title={
              loading ? t("otp.request.sending") : t("otp.request.sendCode")
            }
            onPress={handleSubmit(onSubmit)}
            loading={loading}
            disabled={loading}
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
              {t("otp.request.infoText")}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: rs(24),
    paddingTop: rvs(12),
  },
  backButton: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(14),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(40),
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    alignItems: "center",
    marginBottom: rvs(36),
  },
  centerText: {
    textAlign: "center",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: setOpacity(Colors.primary, 0.08),
    borderRadius: rs(14),
    padding: rs(16),
    marginTop: rvs(20),
  },
  infoText: {
    flex: 1,
  },
});
