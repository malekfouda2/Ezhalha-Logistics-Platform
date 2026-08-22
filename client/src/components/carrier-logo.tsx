import { useQuery } from "@tanstack/react-query";
import dhlLogo from "@/assets/carriers/dhl-logo.png";
import { carrierBrandName } from "@shared/carriers";

/**
 * Admin-uploaded carrier logos (Apps tab) keyed by upper-case carrier code, e.g.
 * { FEDEX: "data:image/png;base64,...", SMSA: "..." }. Cached app-wide so every carrier
 * surface renders the same uploaded logo. Falls back to built-in brand marks, then a
 * generic name chip, when no logo has been uploaded.
 */
export function useCarrierLogos() {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ["/api/carrier-logos"],
    staleTime: 5 * 60 * 1000,
  });
  return data ?? {};
}

interface CarrierLogoProps {
  carrierCode: string;
  carrierName?: string;
  /** Max rendered height for the logo image / brand mark. Defaults to a compact rate-row size. */
  className?: string;
}

/**
 * Renders a carrier's visual mark. Priority:
 *  1. Admin-uploaded logo from the Apps tab (reflects everywhere once uploaded).
 *  2. Built-in brand mark for the historic international carriers (FedEx / DHL / Aramex).
 *  3. A neutral chip with the carrier's display name (used for local carriers with no logo).
 */
export function CarrierLogo({ carrierCode, carrierName, className }: CarrierLogoProps) {
  const logos = useCarrierLogos();
  const code = (carrierCode || "").trim().toUpperCase();
  // Brand first: carrierName can hold the carrier's service level ("EXPRESS WORLDWIDE"), which
  // is not a label for a logo.
  const name = carrierBrandName(carrierCode, carrierName) || "Carrier";
  const uploaded = logos[code];

  if (uploaded) {
    return (
      <div className="inline-flex items-center justify-center" aria-label={name}>
        <img
          src={uploaded}
          alt={name}
          className={className ?? "h-8 w-auto max-w-[140px] object-contain"}
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  if (code === "FEDEX") {
    return (
      <div className="inline-flex items-center justify-center" aria-label="FedEx">
        <span className="text-2xl font-black tracking-tight">
          <span className="text-[#4D148C]">Fed</span>
          <span className="text-[#FF6600]">Ex</span>
        </span>
      </div>
    );
  }

  if (code === "ARAMEX") {
    return (
      <div
        className="inline-flex min-w-[132px] items-center justify-center rounded-md bg-[#D71920] px-4 py-2 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
        aria-label="Aramex"
      >
        <span className="text-xl font-black tracking-tight">Aramex</span>
      </div>
    );
  }

  if (code === "DHL") {
    return (
      <div
        className="inline-flex min-w-[132px] items-center justify-center rounded-md bg-[#FFCC00] px-4 py-2 shadow-[inset_0_0_0_1px_rgba(212,5,17,0.15)]"
        aria-label="DHL"
      >
        <img
          src={dhlLogo}
          alt="DHL"
          className="h-[18px] w-auto object-contain"
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  // Generic fallback — local carriers (SMSA / Naqel / J&T / RedBox / Zajil) before
  // a logo is uploaded, or any future carrier.
  return (
    <div
      className="inline-flex min-w-[110px] items-center justify-center rounded-md border bg-muted px-4 py-2"
      aria-label={name}
    >
      <span className="text-sm font-bold tracking-tight text-foreground">{name}</span>
    </div>
  );
}
