import i18n from "@/i18n";
import { z } from "zod";

export const profileInformationSchema = z.object({
  contactName: z
    .string()
    .trim()
    .min(1, i18n.t("profileInformation.errors.nameRequired")),
  companyName: z.string().optional(),
  email: z
    .string()
    .trim()
    .min(1, i18n.t("profileInformation.errors.emailInvalid"))
    .email(i18n.t("profileInformation.errors.emailInvalid")),
  phone: z.string().trim().min(5, i18n.t("profileInformation.errors.phoneRequired")),
});

export type ProfileInformationFormData = z.infer<typeof profileInformationSchema>;
