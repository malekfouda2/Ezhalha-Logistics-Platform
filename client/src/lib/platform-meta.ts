// Visual + capability metadata for sales-channel platforms. Mirrors the prototype's
// colored 3-letter icons. Only WooCommerce is fully wired end-to-end today; the others
// are shown for parity and marked `available: false` until their OAuth apps are live.

export type AuthKind = "oauth" | "keys" | "token" | "webhook";

export interface PlatformMeta {
  id: string;
  label: string;
  code: string; // 3-letter badge
  color: string;
  auth: AuthKind;
  available: boolean;
}

export const PLATFORMS: PlatformMeta[] = [
  { id: "salla", label: "Salla", code: "SAL", color: "#3fb27f", auth: "oauth", available: false },
  { id: "zid", label: "Zid", code: "ZID", color: "#5b3df5", auth: "oauth", available: false },
  { id: "woocommerce", label: "WooCommerce", code: "WOO", color: "#96bf48", auth: "keys", available: true },
  { id: "shopify", label: "Shopify", code: "SHP", color: "#95bf47", auth: "oauth", available: false },
  { id: "magento", label: "Magento", code: "MAG", color: "#e2553c", auth: "token", available: false },
  { id: "custom", label: "Custom API", code: "{ }", color: "#374151", auth: "webhook", available: false },
];

export function platformMeta(id: string): PlatformMeta {
  return (
    PLATFORMS.find((p) => p.id === id.toLowerCase()) || {
      id,
      label: id,
      code: id.slice(0, 3).toUpperCase(),
      color: "#6b7280",
      auth: "keys",
      available: false,
    }
  );
}
