import { z } from "zod";
import type { TFunction } from "i18next";

export const createApplySchema = (t: TFunction) => {
  const baseSchema = {
    fullName: z.string().min(1, t("apply.errors.fullNameRequired")),
    email: z
      .string()
      .min(1, t("apply.errors.emailRequired"))
      .email(t("apply.errors.emailInvalid")),
    phone: z
      .string()
      .min(1, t("apply.errors.phoneRequired"))
      .regex(/^\d{7,12}$/, t("apply.errors.phoneInvalid")),
    phoneDialCode: z.string().min(1, t("apply.errors.dialCodeRequired")),
    phoneFlag: z.string().optional(),
    country: z.string().min(1, t("apply.errors.countryRequired")),
    addressLine1: z.string().min(1, t("apply.errors.addressLine1Required")),
    addressLine2: z.string().optional(),
    stateProvince: z.string().min(1, t("apply.errors.stateProvinceRequired")),
    city: z.string().min(1, t("apply.errors.cityRequired")),
    postalCode: z.string().min(1, t("apply.errors.postalCodeRequired")),
  };

  const companySchema = z.object({
    accountType: z.literal("company"),
    ...baseSchema,
    companyName: z.string().min(1, t("apply.errors.companyNameRequired")),
    contactName: z.string().min(1, t("apply.errors.contactNameRequired")),
    contactPhone: z
      .string()
      .min(1, t("apply.errors.contactPhoneRequired"))
      .regex(/^\d{7,12}$/, t("apply.errors.phoneInvalid")),
    contactPhoneDialCode: z.string().min(1, t("apply.errors.dialCodeRequired")),
    contactPhoneFlag: z.string().optional(),
    taxCertificate: z.string().min(1, t("apply.errors.taxCertificateRequired")),
    commercialRegistration: z
      .string()
      .min(1, t("apply.errors.commercialRegistrationRequired")),
    memorandumOfAssociation: z
      .string()
      .min(1, t("apply.errors.memorandumOfAssociationRequired")),
    directorId: z.string().min(1, t("apply.errors.directorIdRequired")),
  });

  const individualSchema = z.object({
    accountType: z.literal("individual"),
    ...baseSchema,
  });

  return z.discriminatedUnion("accountType", [companySchema, individualSchema]);
};

export type ApplyFormValues = z.infer<ReturnType<typeof createApplySchema>>;