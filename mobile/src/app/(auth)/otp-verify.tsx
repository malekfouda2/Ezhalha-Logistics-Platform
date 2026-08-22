import React, { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";
import { OtpVerifyFormData, otpVerifySchema } from "@/schemas/otp";
import { BackButton } from "@/components/ui/BackButton";
import { useRequestLoginCode, useSignInWithCode } from "@/lib/hooks/useAuth";
import Toast from "react-native-toast-message";

const CODE_LENGTH = 6;
const EXPIRY_SECONDS = 10 * 60;

export default function OtpVerifyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [verifying, setVerifying] = useState(false);

  const signInWithCodeMutation = useSignInWithCode();
  const requestLoginCodeMutation = useRequestLoginCode();
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<OtpVerifyFormData>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  });

  const code = watch("code");
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? "");
  const isComplete = code.length === CODE_LENGTH;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const formatTime = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleDigitChange = (text: string, index: number) => {
    const value = text.replace(/[^0-9]/g, "");
    const chars = code.split("");

    if (!value) {
      chars[index] = "";
      setValue("code", chars.join("").slice(0, CODE_LENGTH), {
        shouldValidate: false,
      });
      return;
    }

    chars[index] = value[value.length - 1];
    const next = chars.join("").slice(0, CODE_LENGTH);
    setValue("code", next, { shouldValidate: false });

    if (index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onSubmit = async (data: OtpVerifyFormData) => {
    try {
      setVerifying(true);

      await signInWithCodeMutation.mutateAsync({
        email,
        code: data.code,
      });

      router.replace("/(tabs)");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.otp.verify.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.otp.verify.errorMessage"),
      });
        } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || secondsLeft > 0) return;

    try {
      await requestLoginCodeMutation.mutateAsync(email);

      setSecondsLeft(EXPIRY_SECONDS);
      reset({ code: "" });
      inputRefs.current[0]?.focus();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.otp.verify.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.otp.verify.errorMessage"),
      });
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
              {t("otp.verify.title")}
            </Text>
            <Text
              size="medium"
              weight="regular"
              dimRate="70%"
              style={[styles.centerText, { marginTop: rvs(8) }]}
            >
              {t("otp.verify.codeSentTo")}
            </Text>
            <Text size="medium" weight="bold" style={styles.centerText}>
              {email}
            </Text>
          </View>

          <Controller
            control={control}
            name="code"
            render={() => (
              <>
                <View style={styles.otpRow}>
                  {digits.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      style={[
                        styles.otpBox,
                        digit ? styles.otpBoxFilled : styles.otpBoxEmpty,
                        errors.code && styles.otpBoxError,
                      ]}
                      value={digit}
                      onChangeText={(text) => handleDigitChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      textAlign="center"
                      selectTextOnFocus
                    />
                  ))}
                </View>
                {errors.code ? (
                  <Text
                    size="xs"
                    weight="medium"
                    style={[styles.centerText, styles.errorText]}
                  >
                    {errors.code.message}
                  </Text>
                ) : null}
              </>
            )}
          />

          <Text
            size="medium"
            weight="regular"
            dimRate="70%"
            style={[styles.centerText, styles.expiryText]}
          >
            {t("otp.verify.expiresIn")}{" "}
            <Text size="medium" weight="bold">
              {formatTime(secondsLeft)}
            </Text>
          </Text>

          <Button
            title={
              verifying ? t("otp.verify.verifying") : t("otp.verify.verify")
            }
            onPress={handleSubmit(onSubmit)}
            loading={verifying}
            disabled={!isComplete || verifying}
          />

          <TouchableOpacity
            onPress={handleResend}
            disabled={secondsLeft > 0}
            style={[
              styles.resendWrap,
              secondsLeft > 0 && styles.resendDisabled,
            ]}
          >
            <Text size="medium" weight="regular" dimRate="70%">
              {t("otp.verify.didntGetIt")}
              <Text
                size="medium"
                weight="bold"
                style={{
                  color: Colors.primary,
                  opacity: secondsLeft > 0 ? 0.4 : 1,
                }}
              >
                {t("otp.verify.resend")}
              </Text>
            </Text>
          </TouchableOpacity>
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
    marginBottom: rvs(32),
  },
  centerText: {
    textAlign: "center",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: rvs(8),
  },
  otpBox: {
    width: rs(46),
    height: rvs(58),
    borderRadius: rs(14),
    borderWidth: 1.5,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xxl,
    color: Colors.text,
    backgroundColor: Colors.white,
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
  },
  otpBoxEmpty: {
    borderColor: Colors.border,
  },
  otpBoxError: {
    borderColor: "#E53E3E",
  },
  errorText: {
    color: "#E53E3E",
    marginBottom: rvs(12),
  },
  expiryText: {
    marginBottom: rvs(28),
  },
  resendWrap: {
    marginTop: rvs(20),
    alignItems: "center",
  },
  resendDisabled: {
    opacity: 0.4,
  },
});
