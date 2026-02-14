import { cn } from "@/lib/utils";

interface SarSymbolProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-4",
  md: "w-4 h-[1.125rem]",
  lg: "w-5 h-[1.375rem]",
  xl: "w-6 h-[1.625rem]",
};

export function SarSymbol({ className, size = "sm" }: SarSymbolProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1124.14 1256.39"
      className={cn(sizeMap[size], "inline-block shrink-0", className)}
      fill="currentColor"
      aria-label="SAR"
      data-testid="icon-sar-symbol"
    >
      <path d="M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z" />
      <path d="M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z" />
    </svg>
  );
}

export function formatSAR(amount: number | string, decimals: number = 2): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface SarAmountProps {
  amount: number | string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  decimals?: number;
  showDecimals?: boolean;
}

export function SarAmount({ amount, className, size = "sm", decimals = 2, showDecimals = true }: SarAmountProps) {
  const num = typeof amount === "string" ? Number(amount) : amount;
  const formatted = showDecimals ? formatSAR(num, decimals) : num.toLocaleString();
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} data-testid="text-sar-amount">
      <SarSymbol size={size} />
      {formatted}
    </span>
  );
}
