import i18n from "@/i18n";
import { z } from "zod";

export const createClientSchema = z.object({
  companyName: z.string().trim().optional(),
  contactName: z.string().trim().min(1, i18n.t("adminClientsScreen.form.errors.contactNameRequired")),
  email: z
    .string()
    .trim()
    .min(1, i18n.t("adminClientsScreen.form.errors.emailInvalid"))
    .email(i18n.t("adminClientsScreen.form.errors.emailInvalid")),
});

export type CreateClientFormData = z.infer<typeof createClientSchema>;
