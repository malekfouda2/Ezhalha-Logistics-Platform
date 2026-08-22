import i18n from "@/i18n";
import { z } from "zod";

export const otpRequestSchema = z.object({
  email: z
    .string()
    .min(1, i18n.t("otp.errors.emailRequired"))
    .email(i18n.t("otp.errors.emailInvalid")),
});

export type OtpRequestFormData = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  code: z
    .string()
    .length(6, i18n.t("otp.errors.codeIncomplete"))
    .regex(/^\d{6}$/, i18n.t("otp.errors.codeInvalid")),
});

export type OtpVerifyFormData = z.infer<typeof otpVerifySchema>;