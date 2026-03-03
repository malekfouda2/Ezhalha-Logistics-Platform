import { z } from "zod";

export const POSTAL_CODE_EXEMPT_COUNTRIES = new Set([
  "AE", "QA", "BH", "OM", "HK", "IE", "PA", "BO", "BS", "BZ",
  "CM", "DJ", "DM", "ER", "FJ", "GD", "GH", "GM", "GN", "GQ",
  "GY", "KI", "KM", "KP", "LC", "ML", "MR", "MW", "NR", "RW",
  "SB", "SC", "SL", "SO", "SR", "ST", "SY", "TF", "TG", "TK",
  "TL", "TO", "TV", "UG", "VU", "YE", "ZW",
]);

export const STATE_REQUIRED_COUNTRIES = new Set(["US", "CA"]);

const addressFieldSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  stateOrProvince: z.string().optional(),
  shortAddress: z.string().optional(),
});

export type AddressInput = z.infer<typeof addressFieldSchema>;

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function validateSingleAddress(
  address: AddressInput,
  prefix: string,
  strictMode: boolean
): ValidationError[] {
  const errors: ValidationError[] = [];
  const cc = (address.countryCode || "").trim().toUpperCase();

  if (!cc || cc.length !== 2) {
    errors.push({ field: `${prefix}.countryCode`, message: `${prefix} country code is required (2-letter ISO)` });
  }

  if (!address.city || address.city.trim() === "") {
    errors.push({ field: `${prefix}.city`, message: `${prefix} city is required` });
  }

  if (!address.addressLine1 || address.addressLine1.trim() === "") {
    errors.push({ field: `${prefix}.addressLine1`, message: `${prefix} address line 1 is required` });
  }

  if (!address.phone || address.phone.trim() === "") {
    errors.push({ field: `${prefix}.phone`, message: `${prefix} phone number is required` });
  }

  if (cc && !POSTAL_CODE_EXEMPT_COUNTRIES.has(cc)) {
    if (!address.postalCode || address.postalCode.trim() === "") {
      errors.push({ field: `${prefix}.postalCode`, message: `${prefix} postal code is required for ${cc}` });
    }
  }

  if (cc && STATE_REQUIRED_COUNTRIES.has(cc)) {
    if (!address.stateOrProvince || address.stateOrProvince.trim() === "") {
      errors.push({ field: `${prefix}.stateOrProvince`, message: `${prefix} state/province is required for ${cc}` });
    }
  }

  return errors;
}

export function validateShippingAddresses(
  shipper: AddressInput,
  recipient: AddressInput
): ValidationResult {
  const strictMode = process.env.FEDEX_STRICT_ADDRESS !== "false";

  const shipperErrors = validateSingleAddress(shipper, "shipper", strictMode);
  const recipientErrors = validateSingleAddress(recipient, "recipient", strictMode);

  const errors = [...shipperErrors, ...recipientErrors];
  return { valid: errors.length === 0, errors };
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `${e.field}: ${e.message}`).join("; ");
}
