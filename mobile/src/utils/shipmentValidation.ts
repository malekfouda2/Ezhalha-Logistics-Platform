import { CustomsItem, PackageItem } from "@/store/createShipmentStore";

export const POSTAL_CODE_EXEMPT_COUNTRIES = new Set([
  "AE", "QA", "BH", "OM", "HK", "IE", "AG", "AW", "BS", "BZ", "BJ", "BW",
  "BF", "BI", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "DM", "GQ",
  "ER", "FJ", "GA", "GM", "GH", "GD", "GN", "GW", "GY", "KI", "KP", "LY",
  "MW", "ML", "MR", "NA", "NR", "PA", "RW", "KN", "LC", "ST", "SC",
  "SL", "SB", "SO", "SR", "SY", "TL", "TG", "TO", "TV", "UG", "VU", "YE", "ZW",
]);

export const STATE_REQUIRED_COUNTRIES = new Set(["US", "CA"]);

export const POSTAL_FORMATS: Record<
  string,
  { regex: RegExp; hint: string }
> = {
  SA: {
    regex: /^\d{5}$/,
    hint: "Saudi postal codes are 5 digits (e.g. 12345).",
  },
  US: {
    regex: /^\d{5}(-\d{4})?$/,
    hint: "US ZIP codes are 5 digits (e.g. 90210).",
  },
  CA: {
    regex: /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/,
    hint: "Canadian codes look like A1A 1A1.",
  },
  GB: {
    regex: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
    hint: "UK postcodes look like SW1A 1AA.",
  },
  DE: {
    regex: /^\d{5}$/,
    hint: "German postal codes are 5 digits.",
  },
  FR: {
    regex: /^\d{5}$/,
    hint: "French postal codes are 5 digits.",
  },
  EG: {
    regex: /^\d{5}$/,
    hint: "Egyptian postal codes are 5 digits.",
  },
  IN: {
    regex: /^\d{6}$/,
    hint: "Indian PIN codes are 6 digits.",
  },
  CN: {
    regex: /^\d{6}$/,
    hint: "Chinese postal codes are 6 digits.",
  },
  JP: {
    regex: /^\d{3}-?\d{4}$/,
    hint: "Japanese postal codes look like 100-0001.",
  },
  AU: {
    regex: /^\d{4}$/,
    hint: "Australian postcodes are 4 digits.",
  },
  NL: {
    regex: /^\d{4}\s?[A-Za-z]{2}$/,
    hint: "Dutch codes look like 1011 AB.",
  },
  ES: {
    regex: /^\d{5}$/,
    hint: "Spanish postal codes are 5 digits.",
  },
  IT: {
    regex: /^\d{5}$/,
    hint: "Italian postal codes are 5 digits.",
  },
};

export const SA_SHORT_ADDRESS_REGEX = /^[A-Za-z]{4}\d{4}$/;

export function isPostalRequired(countryCode: string) {
  return (
    !!countryCode &&
    !POSTAL_CODE_EXEMPT_COUNTRIES.has(countryCode.toUpperCase())
  );
}

export function isStateRequired(countryCode: string) {
  return STATE_REQUIRED_COUNTRIES.has(
    (countryCode || "").toUpperCase(),
  );
}

export function postalFormatError(
  countryCode: string,
  postalCode: string,
): string | null {
  const fmt = POSTAL_FORMATS[(countryCode || "").toUpperCase()];

  if (!fmt) return null;

  return fmt.regex.test((postalCode || "").trim())
    ? null
    : fmt.hint;
}

export interface ValidationResult {
  ok: boolean;
  title?: string;
  description?: string;
  values?: Record<string, string | number>;
}

const ok: ValidationResult = { ok: true };

export function validateShipmentType(
  shipmentType: string,
): ValidationResult {
  if (!shipmentType) {
    return {
      ok: false,
      title: "toast.shipmentValidation.shipmentTypeRequired",
    };
  }

  return ok;
}

export function validatePackages(
  packageType: string,
  packages: PackageItem[],
): ValidationResult {
  if (!packageType || packages.length < 1) {
    return {
      ok: false,
      title: "toast.shipmentValidation.packageDetailsRequired",
    };
  }

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];

    if (!pkg.weight || !pkg.length || !pkg.width || !pkg.height) {
      return {
        ok: false,
        title: "toast.shipmentValidation.packageDetailsRequiredForPackage",
        values: {
          packageNumber: i + 1,
        },
      };
    }
  }

  return ok;
}

export function validateRateSelection(
  selectedQuoteId: string | null,
): ValidationResult {
  if (!selectedQuoteId) {
    return {
      ok: false,
      title: "toast.shipmentValidation.shippingRateRequired",
    };
  }

  return ok;
}

export function validateCustoms(
  customsInputMode: "invoice" | "manual",
  hasInvoiceDocument: boolean,
  items: CustomsItem[],
): ValidationResult {
  if (customsInputMode === "invoice" && !hasInvoiceDocument) {
    return {
      ok: false,
      title: "toast.shipmentValidation.invoiceRequired",
    };
  }

  const validItems = items.filter(
    (item) => item.itemName.trim() !== "",
  );

  if (validItems.length === 0) {
    return {
      ok: false,
      title: "toast.shipmentValidation.customsItemRequired",
    };
  }

  for (const item of validItems) {
    if (
      !item.category ||
      !item.countryOfOrigin ||
      item.price <= 0 ||
      item.quantity < 1
    ) {
      return {
        ok: false,
        title: "toast.shipmentValidation.customsItemIncomplete",
        values: {
          itemName: item.itemName,
        },
      };
    }
  }

  return ok;
}