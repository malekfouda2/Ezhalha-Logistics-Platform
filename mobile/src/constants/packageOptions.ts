export interface SelectOption {
  value: string;
  label: string;
}

export const packageTypes: SelectOption[] = [
  { value: "YOUR_PACKAGING", label: "Your Own Packaging" },
  { value: "FEDEX_ENVELOPE", label: "FedEx Envelope" },
  { value: "FEDEX_PAK", label: "FedEx Pak" },
  { value: "FEDEX_BOX", label: "FedEx Box" },
  { value: "FEDEX_SMALL_BOX", label: "FedEx Small Box" },
  { value: "FEDEX_MEDIUM_BOX", label: "FedEx Medium Box" },
  { value: "FEDEX_LARGE_BOX", label: "FedEx Large Box" },
  { value: "FEDEX_10KG_BOX", label: "FedEx 10kg Box" },
  { value: "FEDEX_25KG_BOX", label: "FedEx 25kg Box" },
  { value: "FEDEX_TUBE", label: "FedEx Tube" },
];

export const packageTypeLabels: Record<string, string> = Object.fromEntries(
  packageTypes.map((p) => [p.value, p.label]),
);

export const weightUnitOptions: SelectOption[] = [
  { value: "LB", label: "Pounds (LB)" },
  { value: "KG", label: "Kilograms (KG)" },
];

export const dimensionUnitOptions: SelectOption[] = [
  { value: "IN", label: "Inches (IN)" },
  { value: "CM", label: "Centimeters (CM)" },
];
