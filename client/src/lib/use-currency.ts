import { useQuery } from "@tanstack/react-query";

// Client billing currency + live SAR→currency rate.
//
// The backend keeps every price in SAR. This hook exposes the account's billing currency
// and a live rate so the UI can render (and preview) amounts in that currency. Post-payment,
// prefer a shipment's snapshotted `fxRate` over this live rate for historical accuracy.

interface FxRateResponse {
  currency: string;
  rate: number;
  base: string;
}

const CURRENCY_LOCALE: Record<string, string> = {
  SAR: "en-SA",
  USD: "en-US",
};

export function useCurrency() {
  const { data } = useQuery<FxRateResponse>({
    queryKey: ["/api/client/fx-rate"],
    staleTime: 30 * 60 * 1000, // 30 min; rate is snapshotted at checkout anyway
  });

  const currency = (data?.currency || "SAR").toUpperCase();
  const rate = data?.rate ?? 1;

  // Convert a SAR amount into the account currency. Pass an explicit `snapshotRate`
  // (e.g. shipment.fxRate) for already-charged amounts so history stays exact.
  const convert = (amountSar: number | string | null | undefined, snapshotRate?: number | null): number => {
    const sar = Number(amountSar || 0);
    if (currency === "SAR") return sar;
    return sar * (snapshotRate ?? rate);
  };

  // Format a SAR amount in the account currency (symbol + grouping).
  const format = (amountSar: number | string | null | undefined, snapshotRate?: number | null): string => {
    const value = convert(amountSar, snapshotRate);
    try {
      return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || "en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency}`;
    }
  };

  return { currency, rate, isConverted: currency !== "SAR", convert, format };
}
