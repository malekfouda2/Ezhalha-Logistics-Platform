// app/(auth)/login.tsx
import { useState } from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useLoginSchema, LoginFormValues } from "@/schemas/login";
import { useSignIn } from "@/lib/hooks/useAuth";
import Toast from "react-native-toast-message";

export default function LoginScreen() {
  const { t } = useTranslation();
  const loginSchema = useLoginSchema();

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signInMutation = useSignIn();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setIsSubmitting(true);
      await signInMutation.mutateAsync({
        username: data.identifier,
        password: data.password,
      });

      Toast.show({
        type: "success",
        text1: t("toast.login.successTitle"),
        text2: t("toast.login.successMessage"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.login.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.login.invalidCredentials"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
      {/* <View style={styles.topRow}>
        <LanguageSwitch />
      </View> */}

      <Image
        source={require("../../../assets/images/logo.png")}
        style={styles.logo}
        resizeMode="contain"
        height={rvs(200)}
        width={rs(200)}
      />

      <View style={styles.header}>
        <Text size="xxl" weight="bold" style={styles.title}>
          {t("auth.welcomeBack")}
        </Text>
        <Text size="small" dimRate="70%" style={styles.subtitle}>
          {t("auth.signInSubtitle")}
        </Text>
      </View>

      <Controller
        control={control}
        name="identifier"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t("auth.identifierLabel")}
            placeholder={t("auth.identifierPlaceholder")}
            autoCapitalize="none"
            keyboardType="email-address"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.identifier?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t("auth.passwordLabel")}
            placeholder="••••••••••"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
            rightElement={
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={rs(20)}
                color={Colors.placeholder}
              />
            }
            onRightElementPress={() => setShowPassword((prev) => !prev)}
          />
        )}
      />

      <Pressable
        style={styles.forgotPassword}
        onPress={() => {
          router.push("/forgot-password");
        }}
      >
        <Text size="medium" weight="semibold" style={styles.forgotPasswordText}>
          {t("auth.forgotPassword")}
        </Text>
      </Pressable>

      <Button
        title={t("auth.signIn")}
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        style={styles.signInButton}
      />

      <View style={styles.orContainer}>
        <View style={styles.divider} />
        <Text size="small" weight="medium" dimRate="60%" style={styles.orText}>
          {t("auth.or")}
        </Text>
        <View style={styles.divider} />
      </View>

      <Button
        title={t("auth.emailSignInCode")}
        variant="outline"
        onPress={() => {
          router.push("/otp-request");
        }}
      />

      <View style={styles.footer}>
        <Text size="small" dimRate="70%" style={styles.subtitle}>
          {t("auth.newToEzhalha")}
        </Text>
        <Pressable
          onPress={() => {
            // TODO: navigate to apply for account
          }}
        >
          <Text size="small" weight="bold" style={styles.applyText}>
            {t("auth.applyForAccount")}
          </Text>
        </Pressable>
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
  topRow: {
    alignItems: "flex-end",
    marginBottom: rvs(16),
  },
  logo: {
    height: rvs(150),
    width: rvs(150),
    alignSelf: "center",
    marginBottom: rvs(10),
  },
  header: {
    marginBottom: rvs(32),
  },
  title: {
    color: Colors.text,
    textAlign: "center",
    marginBottom: rvs(8),
  },
  subtitle: {
    textAlign: "center",
    color: Colors.textSecondary,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginTop: rvs(-8),
    marginBottom: rvs(24),
  },
  forgotPasswordText: {
    color: Colors.primary,
  },
  signInButton: {
    marginBottom: rvs(24),
  },
  orContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(24),
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orText: {
    marginHorizontal: rs(12),
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: rvs(20),
  },
  applyText: {
    color: Colors.primary,
  },
});
