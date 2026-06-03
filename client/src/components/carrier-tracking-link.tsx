import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

interface CarrierTrackingLinkProps {
  trackingNumber: string;
  carrierCode?: string | null;
  carrierName?: string | null;
  className?: string;
}

function normalizeCarrierCode(carrierCode?: string | null, carrierName?: string | null): string | null {
  const normalizedCode = carrierCode?.trim().toUpperCase();
  if (normalizedCode) {
    if (normalizedCode.includes("FEDEX")) return "FEDEX";
    if (normalizedCode.includes("DHL")) return "DHL";
    if (normalizedCode.includes("ARAMEX")) return "ARAMEX";
  }

  const normalizedName = carrierName?.trim().toUpperCase();
  if (normalizedName) {
    if (normalizedName.includes("FEDEX")) return "FEDEX";
    if (normalizedName.includes("DHL")) return "DHL";
    if (normalizedName.includes("ARAMEX")) return "ARAMEX";
  }

  return null;
}

export function getCarrierTrackingUrl(
  trackingNumber: string,
  carrierCode?: string | null,
  carrierName?: string | null,
): string | null {
  const normalizedTrackingNumber = trackingNumber.trim();
  if (!normalizedTrackingNumber) {
    return null;
  }

  const normalizedCarrier = normalizeCarrierCode(carrierCode, carrierName);
  if (normalizedCarrier === "FEDEX") {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(normalizedTrackingNumber)}`;
  }

  if (normalizedCarrier === "DHL") {
    return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(normalizedTrackingNumber)}`;
  }

  if (normalizedCarrier === "ARAMEX") {
    return `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(normalizedTrackingNumber)}`;
  }

  return null;
}

export function CarrierTrackingLink({
  trackingNumber,
  carrierCode,
  carrierName,
  className,
}: CarrierTrackingLinkProps) {
  const trackingUrl = getCarrierTrackingUrl(trackingNumber, carrierCode, carrierName);

  if (!trackingUrl) {
    return <span className={cn("font-mono", className)}>{trackingNumber}</span>;
  }

  return (
    <a
      href={trackingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-primary underline-offset-4 hover:underline",
        className,
      )}
    >
      <span>{trackingNumber}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
