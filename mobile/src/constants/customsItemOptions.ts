import { ItemCategory } from "@shared/schema";
import { SelectOption } from "@/constants/packageOptions";

// Mirrors web's itemCategories (client/src/pages/client/create-shipment.tsx)
export const itemCategoryOptions: SelectOption[] = Object.entries(ItemCategory).map(
  ([key, value]) => ({
    value,
    label: key.charAt(0) + key.slice(1).toLowerCase(),
  }),
);

// Mirrors web's itemCurrencies (client/src/pages/client/create-shipment.tsx)
export const itemCurrencyOptions: SelectOption[] = [
  { value: "SAR", label: "SAR - Saudi Riyal" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "KWD", label: "KWD - Kuwaiti Dinar" },
  { value: "QAR", label: "QAR - Qatari Riyal" },
  { value: "BHD", label: "BHD - Bahraini Dinar" },
  { value: "OMR", label: "OMR - Omani Rial" },
  { value: "EGP", label: "EGP - Egyptian Pound" },
  { value: "JOD", label: "JOD - Jordanian Dinar" },
  { value: "CNY", label: "CNY - Chinese Yuan" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "TRY", label: "TRY - Turkish Lira" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
];
