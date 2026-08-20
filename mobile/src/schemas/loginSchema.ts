// schemas/loginSchema.ts
import { z } from "zod";
import { useTranslation } from "react-i18next";

export type LoginFormValues = {
  identifier: string;
  password: string;
};

export const useLoginSchema = () => {
  const { t } = useTranslation();

  return z.object({
    identifier: z
      .string()
      .min(1, t("auth.errors.identifierRequired"))
      .min(3, t("auth.errors.identifierMin")),
    password: z
      .string()
      .min(1, t("auth.errors.passwordRequired"))
      .min(6, t("auth.errors.passwordMin")),
  });
};