import { z } from "zod";
import {
    isStateRequired,
    postalFormatError,
    SA_SHORT_ADDRESS_REGEX,
} from "@/utils/shipmentValidation";

export const addressSchema = z
    .object({
        name: z.string().trim().min(1, "Full name is required"),
        company: z.string().optional(),
        phone: z.string().trim().min(5, "Phone is required"),
        email: z
            .string()
            .trim()
            .refine(
                (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
                "Enter a valid email"
            ),
        countryCode: z.string().trim().min(1, "Country is required"),
        country: z.string().trim().min(1, "Country is required"),
        city: z.string().trim().min(1, "City is required"),
        postalCode: z.string().trim().min(1, "Postal code is required"),
        addressLine1: z.string().trim().min(1, "Address line 1 is required"),
        addressLine2: z.string().optional(),
        stateOrProvince: z.string().optional(),
        shortAddress: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        const hint = postalFormatError(data.countryCode, data.postalCode);
        if (hint) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["postalCode"], message: hint });
        }

        if (data.countryCode === "SA" && !data.shortAddress) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["shortAddress"],
                message: "National address is required",
            });
        } else if (
            data.countryCode === "SA" &&
            data.shortAddress &&
            !SA_SHORT_ADDRESS_REGEX.test(data.shortAddress.trim())
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["shortAddress"],
                message: "National address format is invalid",
            });
        }

        if (isStateRequired(data.countryCode) && !data.stateOrProvince) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["stateOrProvince"],
                message: "State/Province is required",
            });
        }
    });

export type AddressFormInput = z.input<typeof addressSchema>;
export type AddressFormValues = z.output<typeof addressSchema>;