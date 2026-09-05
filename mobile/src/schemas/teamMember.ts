import i18n from "@/i18n";
import { z } from "zod";

export const teamMemberSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, i18n.t("teamMembers.form.errors.usernameMin"))
    .regex(/^[a-zA-Z0-9_.]+$/, i18n.t("teamMembers.form.errors.usernameInvalid")),
  email: z
    .string()
    .trim()
    .min(1, i18n.t("teamMembers.form.errors.emailInvalid"))
    .email(i18n.t("teamMembers.form.errors.emailInvalid")),
  password: z.string().min(8, i18n.t("teamMembers.form.errors.passwordMin")),
});

export type TeamMemberFormData = z.infer<typeof teamMemberSchema>;
