import { Platform } from "react-native";
import Constants from "expo-constants";
import type { User } from "@shared/schema";

import { apiRequest, api } from "@/api/client";
import { clearAllTokens, getDeviceId, getRefreshToken, setAccessToken, setRefreshToken } from "@/api/tokens";

// Auth calls, bound to the endpoints in server/routes.ts. Types for the user object come
// straight from @shared/schema, so a column added to the users table shows up here as a
// type change rather than a runtime surprise.

export type SafeUser = Omit<User, "password">;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: SafeUser;
}

async function describeDevice() {
  return {
    deviceId: await getDeviceId(),
    deviceName: Constants.deviceName ?? undefined,
    platform: Platform.OS === "ios" ? ("ios" as const) : ("android" as const),
    appVersion: Constants.expoConfig?.version ?? undefined,
  };
}

async function persist(pair: TokenPair): Promise<SafeUser> {
  setAccessToken(pair.accessToken, pair.expiresIn);
  await setRefreshToken(pair.refreshToken);
  return pair.user;
}

/** Password login. `username` accepts a username, an email, or a phone number. */
export async function signIn(username: string, password: string): Promise<SafeUser> {
  const pair = await apiRequest<TokenPair>("/api/auth/token", {
    method: "POST",
    anonymous: true,
    body: { username, password, ...(await describeDevice()) },
  });
  return persist(pair);
}

/** Step 1 of passwordless login. Always resolves — the API never reveals whether the email exists. */
export async function requestLoginCode(email: string): Promise<void> {
  await apiRequest("/api/auth/otp/request", {
    method: "POST",
    anonymous: true,
    body: { email },
  });
}

/** Step 2 of passwordless login. */
export async function signInWithCode(email: string, code: string): Promise<SafeUser> {
  const pair = await apiRequest<TokenPair>("/api/auth/token/otp", {
    method: "POST",
    anonymous: true,
    body: { email, code, ...(await describeDevice()) },
  });
  return persist(pair);
}

/**
 * Signs out. Revoking server-side is best-effort: if the device is offline we still clear
 * local tokens, because leaving a usable credential on the device is the worse failure.
 */
export async function signOut(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await apiRequest("/api/auth/revoke", {
        method: "POST",
        anonymous: true,
        body: { refreshToken },
      });
    } catch {
      // ignored — local cleanup below is what matters
    }
  }
  await clearAllTokens();
}

/** Current user, or null when there is no live session. */
export async function fetchCurrentUser(): Promise<SafeUser | null> {
  if (!(await getRefreshToken())) {
    return null;
  }
  const { user } = await api.get<{ user: SafeUser }>("/api/auth/me");
  return user;
}

export interface SignedInDevice {
  id: string;
  deviceName: string | null;
  platform: string;
  appVersion: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listDevices(): Promise<SignedInDevice[]> {
  const { devices } = await api.get<{ devices: SignedInDevice[] }>("/api/auth/devices");
  return devices;
}

export async function revokeDevice(id: string): Promise<void> {
  await api.delete(`/api/auth/devices/${id}`);
}
