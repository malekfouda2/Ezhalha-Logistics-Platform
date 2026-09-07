/**
 * Tap's Card SDK (card-react-native / TapCardEntry.tsx) only ever needs the public key —
 * the same EXPO_PUBLIC_TAP_PUBLIC_KEY already used for this account (mirrors the server's
 * TAP_PUBLIC_KEY). Nothing secret ever ships in the app for this integration.
 */
export function isTapCardSdkAvailable(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_TAP_PUBLIC_KEY);
}

export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Customer", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || parts[0] };
}
