import { z } from "zod";
import { SA_SHORT_ADDRESS_REGEX } from "@/utils/shipmentValidation";

// Local (domestic KSA) shipments only collect a lean address: no country picker (always
// Saudi Arabia), no postal code — mirrors the server's `localAddressSchema` in routes.ts.
export const localAddressSchema = z
  .object({
    name: z.string().trim().min(1, "Full name is required"),
    phone: z.string().trim().min(5, "Phone is required"),
    addressLine1: z.string().trim().min(1, "Address line is required"),
    city: z.string().trim().min(1, "City is required"),
    district: z.string().optional(),
    shortAddress: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.shortAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shortAddress"],
        message: "National address is required (4 letters followed by 4 digits, e.g. RCTB4359)",
      });
    } else if (!SA_SHORT_ADDRESS_REGEX.test(data.shortAddress.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shortAddress"],
        message: "Must be 4 letters followed by 4 digits, e.g. RCTB4359",
      });
    }
  });

export type LocalAddressFormInput = z.input<typeof localAddressSchema>;
export type LocalAddressFormValues = z.output<typeof localAddressSchema>;
