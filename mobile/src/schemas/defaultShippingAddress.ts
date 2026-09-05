import i18n from "@/i18n";
import { z } from "zod";
import { isStateRequired, postalFormatError } from "@/utils/shipmentValidation";

export const defaultShippingAddressSchema = z
  .object({
    shippingContactName: z
      .string()
      .trim()
      .min(1, i18n.t("defaultShippingAddress.errors.contactNameRequired")),
    shippingContactPhone: z
      .string()
      .trim()
      .min(5, i18n.t("defaultShippingAddress.errors.contactPhoneRequired")),
    shippingCountryCode: z
      .string()
      .trim()
      .min(1, i18n.t("defaultShippingAddress.errors.countryRequired")),
    shippingStateOrProvince: z.string().optional(),
    shippingCity: z
      .string()
      .trim()
      .min(1, i18n.t("defaultShippingAddress.errors.cityRequired")),
    shippingPostalCode: z
      .string()
      .trim()
      .min(1, i18n.t("defaultShippingAddress.errors.postalCodeRequired")),
    shippingAddressLine1: z
      .string()
      .trim()
      .min(1, i18n.t("defaultShippingAddress.errors.addressLine1Required")),
    shippingAddressLine2: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hint = postalFormatError(data.shippingCountryCode, data.shippingPostalCode);
    if (hint) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shippingPostalCode"], message: hint });
    }

    if (isStateRequired(data.shippingCountryCode) && !data.shippingStateOrProvince?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shippingStateOrProvince"],
        message: i18n.t("defaultShippingAddress.errors.stateRequired"),
      });
    }
  });

export type DefaultShippingAddressFormData = z.infer<typeof defaultShippingAddressSchema>;
