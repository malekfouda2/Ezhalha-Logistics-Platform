export interface PlatformMeta {
  id: string;
  label: string;
  code: string;
  color: string;
  available: boolean;
}

export const PLATFORMS: PlatformMeta[] = [
  { id: "woocommerce", label: "WooCommerce", code: "WOO", color: "#96bf48", available: true },
  { id: "salla", label: "Salla", code: "سل", color: "#0a5c4d", available: false },
  { id: "shopify", label: "Shopify", code: "S", color: "#95bf47", available: false },
  { id: "zid", label: "Zid", code: "ز", color: "#5b3df5", available: false },
];

export function platformMeta(id: string): PlatformMeta {
  return (
    PLATFORMS.find((p) => p.id === id.toLowerCase()) || {
      id,
      label: id,
      code: id.slice(0, 3).toUpperCase(),
      color: "#6b7280",
      available: false,
    }
  );
}
