import * as SecureStore from "expo-secure-store";

// Refresh tokens are long-lived bearer credentials. They go in the iOS Keychain /
// Android Keystore via expo-secure-store — never AsyncStorage, which is plain
// unencrypted files readable on a rooted or jailbroken device.
//
// The access token is short-lived (15 min) and kept in memory only: persisting it buys
// nothing, since a cold start can always mint a new one from the refresh token.

const REFRESH_TOKEN_KEY = "ezhalha.refreshToken";
const DEVICE_ID_KEY = "ezhalha.deviceId";

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

export function getAccessToken(): string | null {
  if (!accessToken || Date.now() >= accessTokenExpiresAt) {
    return null;
  }
  return accessToken;
}

/** `expiresIn` is seconds, as returned by the API. */
export function setAccessToken(token: string, expiresIn: number) {
  accessToken = token;
  // Expire our copy 30s early so a request never leaves with a token that dies in flight.
  accessTokenExpiresAt = Date.now() + Math.max(0, expiresIn - 30) * 1000;
}

export function clearAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearAllTokens(): Promise<void> {
  clearAccessToken();
  await clearRefreshToken();
}

/**
 * Stable per-install identifier. The API records it against each refresh token so the
 * user can see and revoke individual devices. Not a hardware id — it survives app
 * restarts but is regenerated on reinstall, which is the intended granularity.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}
