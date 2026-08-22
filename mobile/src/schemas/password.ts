import i18n from "@/i18n";
import z from "zod";

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, i18n.t("otp.errors.emailRequired"))
    .email(i18n.t("otp.errors.emailInvalid")),
});
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, i18n.t("resetPassword.errors.passwordMin")),
    confirmPassword: z
      .string()
      .min(1, i18n.t("resetPassword.errors.confirmRequired")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: i18n.t("resetPassword.errors.passwordMismatch"),
    path: ["confirmPassword"],
  });
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;