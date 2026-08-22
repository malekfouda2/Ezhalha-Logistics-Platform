import Constants from "expo-constants";
import {
  clearAllTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./tokens";

// Typed fetch wrapper for the ezhalha API.
//
// The important behaviour here is transparent token refresh: when a request comes back
// 401 with code `token_expired`, we mint a new pair and replay the original request once.
// Refreshes are single-flighted — if ten screens fire requests at the same moment and all
// get a 401, exactly one refresh call goes out and the rest wait on it. Without that, the
// server's rotation-reuse detection would see nine replays of an already-rotated token
// and revoke the whole family, logging the user out.

/**
 * Where the API lives. Resolved in order:
 *
 *  1. `EXPO_PUBLIC_API_BASE_URL` from `.env` — per-developer override, inlined at build time.
 *  2. `expo.extra.apiBaseUrl` in app.json — the shared default committed to the repo.
 *  3. localhost, for running the API on your own machine.
 *
 * The env var comes first so pointing at a local server never means editing a tracked file.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "http://localhost:5000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Raised when the session is gone for good and the UI must return to the login screen. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, "Your session has expired. Please sign in again.", "session_expired");
    this.name = "SessionExpiredError";
  }
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

/** Register the app-level handler that drops the user back to login. */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

async function endSession(): Promise<never> {
  await clearAllTokens();
  sessionExpiredListeners.forEach((listener) => listener());
  throw new SessionExpiredError();
}

// ── Single-flight refresh ────────────────────────────────────────────────────

let inFlightRefresh: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return endSession();
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      // refresh_expired / refresh_reused / refresh_invalid all mean the same thing here.
      return endSession();
    }

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };

    setAccessToken(data.accessToken, data.expiresIn);
    await setRefreshToken(data.refreshToken);
    return data.accessToken;
  })().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

// ── Request ──────────────────────────────────────────────────────────────────

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the Authorization header (login, OTP request, public endpoints). */
  anonymous?: boolean;
  /** Locale for server-rendered strings. Wire this to the active i18n language. */
  language?: string;
  /** Value for the Idempotency-Key header on sensitive POSTs. */
  idempotencyKey?: string;
}

async function send(path: string, options: RequestOptions, token: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.language) {
    headers["Accept-Language"] = options.language;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  });
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let token = options.anonymous ? null : getAccessToken();

  // No usable access token but we do have a refresh token — refresh before the round trip
  // rather than spending a request to learn what we already know.
  if (!options.anonymous && !token && (await getRefreshToken())) {
    token = await refreshAccessToken();
  }

  let response = await send(path, options, token);

  if (response.status === 401 && !options.anonymous) {
    const body = await response.clone().json().catch(() => ({}) as Record<string, unknown>);
    const code = (body as { code?: string }).code;

    if (code === "token_expired" || code === "token_invalid" || code === "token_revoked") {
      const fresh = await refreshAccessToken();
      response = await send(path, options, fresh);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      return endSession();
    }
    const message =
      (payload as { error?: string; message?: string } | null)?.error ??
      (payload as { error?: string; message?: string } | null)?.message ??
      `Request failed with status ${response.status}`;
    throw new ApiError(
      response.status,
      message,
      (payload as { code?: string } | null)?.code,
      payload,
    );
  }

  return payload as T;
}

// ── Authenticated file download ──────────────────────────────────────────────

/**
 * Downloads an authenticated file (shipping label, commercial invoice, invoice PDF) to
 * local storage and returns the file URI.
 *
 * This exists because the obvious approach does not work. Endpoints like
 * `/api/client/shipments/:id/label.pdf` stream binary behind an auth guard; on the web the
 * session cookie rides along automatically, but on device `Linking.openURL` and every
 * common PDF viewer send no Authorization header, so the request 401s. The file has to be
 * fetched with the header, written to disk, and then opened or shared from there.
 *
 * ```ts
 * const uri = await downloadFile(`/api/client/shipments/${id}/label.pdf`, `label-${id}.pdf`);
 * await Sharing.shareAsync(uri);   // expo-sharing — opens the system viewer/share sheet
 * ```
 *
 * `<Image>` is the exception: it accepts headers directly via
 * `source={{ uri, headers: { Authorization: ... } }}`, so images need no download step.
 */
export async function downloadFile(path: string, filename: string): Promise<string> {
  const FileSystem = await import("expo-file-system");

  let token = getAccessToken();
  if (!token && (await getRefreshToken())) {
    token = await refreshAccessToken();
  }
  if (!token) {
    return endSession();
  }

  const destination = `${FileSystem.cacheDirectory}${filename}`;

  const attempt = (bearer: string) =>
    FileSystem.downloadAsync(`${API_BASE_URL}${path}`, destination, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

  let result = await attempt(token);

  // downloadAsync writes the error body to the file rather than throwing, so the status
  // has to be checked explicitly — otherwise a 401 lands on disk named "label.pdf".
  if (result.status === 401) {
    result = await attempt(await refreshAccessToken());
  }

  if (result.status === 401) {
    return endSession();
  }
  if (result.status >= 400) {
    throw new ApiError(result.status, `Could not download ${filename}.`);
  }

  return result.uri;
}

/** Header bundle for `<Image source={{ uri, headers }} />` on protected images. */
export function authImageHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
