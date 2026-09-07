import crypto from "crypto";
import { getIntegrationEnv } from "./integration-runtime";
import { logError, logInfo } from "./logger";

/**
 * Zid OAuth 2.0.
 *
 * Two things about Zid differ from every other OAuth integration and are the usual source of
 * a broken connection:
 *
 * 1. The token response carries TWO tokens. `authorization` is the API bearer; `access_token`
 *    is the store-manager token. They go in DIFFERENT headers and swapping them fails with an
 *    unhelpful 401. See `zidAuthHeaders`.
 * 2. Both tokens last a year, and so does the refresh token. Zid's own guidance is to refresh
 *    before month ten. Nothing warns you: if the refresh is missed, every connected store
 *    stops working at roughly the same moment, about a year after launch, when nobody
 *    remembers this integration exists. `needsRefresh` exists for that reason alone.
 */

const ZID_OAUTH_BASE = "https://oauth.zid.sa";
const ZID_API_BASE = "https://api.zid.sa";

/** Refresh once a token is within this long of expiry. Zid says refresh by month ten. */
const REFRESH_LEAD_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export interface ZidCredentials {
  /** Sent as `Authorization: Bearer …`. */
  authorization: string;
  /** Sent as `X-Manager-Token: …`. */
  access_token: string;
  refresh_token: string;
  /** ISO timestamp. Absent on older rows connected before expiry tracking. */
  expires_at?: string;
  store_id?: string;
}

export function isZidConfigured(): boolean {
  return Boolean(getZidClientId() && getZidClientSecret());
}

export function getZidClientId(): string | undefined {
  return getIntegrationEnv("ZID_CLIENT_ID");
}

function getZidClientSecret(): string | undefined {
  return getIntegrationEnv("ZID_CLIENT_SECRET");
}

/** The app identifier Zid requires when registering a webhook (`original_id`). */
export function getZidAppId(): string | undefined {
  return getIntegrationEnv("ZID_APP_ID");
}

/**
 * The public origin merchants are redirected back to.
 *
 * Must match a redirect URI registered on the Zid app exactly, including scheme and path —
 * Zid rejects the token exchange otherwise.
 */
function getAppBaseUrl(): string {
  return (getIntegrationEnv("APP_BASE_URL") || "https://app.ezhalha.co").replace(/\/+$/, "");
}

export function getZidRedirectUri(): string {
  return `${getAppBaseUrl()}/api/sales-channels/zid/callback`;
}

/**
 * Where to send the merchant to authorise.
 *
 * `state` carries our own signed handle for the pending connection. It is not decoration:
 * without it the callback cannot tell which client account is connecting, and it is the
 * standard CSRF defence for the authorization-code flow.
 */
export function buildZidAuthorizeUrl(state: string): string {
  const clientId = getZidClientId();
  if (!clientId) throw new Error("Zid is not configured (ZID_CLIENT_ID missing)");

  const url = new URL("/oauth/authorize", ZID_OAUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getZidRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

interface ZidTokenResponse {
  access_token?: string;
  authorization?: string;
  refresh_token?: string;
  expires_in?: number | string;
}

function toCredentials(payload: ZidTokenResponse): ZidCredentials {
  const authorization = payload.authorization?.trim();
  const accessToken = payload.access_token?.trim();
  const refreshToken = payload.refresh_token?.trim();

  if (!authorization || !accessToken) {
    throw new Error("Zid token response did not include both tokens");
  }

  // `expires_in` is documented as a timestamp in places and as seconds in others, so treat a
  // small number as a duration and a large one as an absolute epoch. Falling back to a year
  // matches Zid's documented lifetime and keeps the refresh scheduler working either way.
  const raw = Number(payload.expires_in);
  let expiresAt: Date;
  if (Number.isFinite(raw) && raw > 0) {
    expiresAt = raw > 1_000_000_000
      ? new Date(raw * (raw > 1_000_000_000_000 ? 1 : 1000))
      : new Date(Date.now() + raw * 1000);
  } else {
    expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }

  return {
    authorization,
    access_token: accessToken,
    refresh_token: refreshToken || "",
    expires_at: expiresAt.toISOString(),
  };
}

async function postTokenRequest(body: Record<string, string>): Promise<ZidCredentials> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${ZID_OAUTH_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      // Never echo the response wholesale — a token endpoint's error body can carry the
      // credential that was just rejected.
      throw new Error(`Zid token request failed (${res.status})`);
    }

    let payload: ZidTokenResponse;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Zid token endpoint returned a non-JSON response");
    }

    return toCredentials(payload);
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeZidAuthorizationCode(code: string): Promise<ZidCredentials> {
  const clientId = getZidClientId();
  const clientSecret = getZidClientSecret();
  if (!clientId || !clientSecret) throw new Error("Zid is not configured");

  return postTokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getZidRedirectUri(),
    code,
  });
}

export async function refreshZidCredentials(credentials: ZidCredentials): Promise<ZidCredentials> {
  const clientId = getZidClientId();
  const clientSecret = getZidClientSecret();
  if (!clientId || !clientSecret) throw new Error("Zid is not configured");
  if (!credentials.refresh_token) throw new Error("Zid channel has no refresh token stored");

  const refreshed = await postTokenRequest({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getZidRedirectUri(),
    refresh_token: credentials.refresh_token,
  });

  return {
    ...refreshed,
    // Zid does not always return a new refresh token; keep the existing one so a rotation
    // that omits it does not silently orphan the connection.
    refresh_token: refreshed.refresh_token || credentials.refresh_token,
    store_id: credentials.store_id,
  };
}

/** True when the token is close enough to expiry that it should be renewed now. */
export function needsRefresh(credentials: ZidCredentials, now = Date.now()): boolean {
  if (!credentials.expires_at) return true;
  const expiresAt = Date.parse(credentials.expires_at);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - now <= REFRESH_LEAD_MS;
}

/**
 * The two headers every Zid API call needs.
 *
 * `authorization` is the bearer; `access_token` is the manager token. Swapping them is the
 * single most common Zid integration bug, so they are built in one place and never inline.
 */
export function zidAuthHeaders(credentials: ZidCredentials): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.authorization}`,
    "X-Manager-Token": credentials.access_token,
    Accept: "application/json",
  };
}

export function zidApiUrl(path: string): string {
  return `${ZID_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Register the order webhooks for one connected store.
 *
 * Registered per store rather than once for the app, because the target URL carries the
 * sales-channel id — that is how an inbound order is attributed to the right client. An
 * app-wide webhook would arrive without it and orders could be filed against the wrong
 * account.
 *
 * Zid authenticates its webhook calls with HTTP Basic rather than an HMAC signature, so the
 * credential is generated per channel and handed over here.
 */
export async function registerZidWebhooks(params: {
  credentials: ZidCredentials;
  targetUrl: string;
  basicAuthUsername: string;
  basicAuthPassword: string;
}): Promise<{ registered: string[]; failed: Array<{ event: string; reason: string }> }> {
  const originalId = getZidAppId();
  const events = ["order.create", "order.status.update", "order.payment_status.update"];
  const registered: string[] = [];
  const failed: Array<{ event: string; reason: string }> = [];

  for (const event of events) {
    try {
      const res = await fetch(zidApiUrl("/v1/managers/webhooks"), {
        method: "POST",
        headers: { ...zidAuthHeaders(params.credentials), "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          target_url: params.targetUrl,
          ...(originalId ? { original_id: originalId } : {}),
          username: params.basicAuthUsername,
          password: params.basicAuthPassword,
        }),
      });

      if (res.ok) {
        registered.push(event);
      } else {
        failed.push({ event, reason: `HTTP ${res.status}` });
      }
    } catch (error) {
      failed.push({ event, reason: error instanceof Error ? error.message : "request failed" });
    }
  }

  if (failed.length > 0) {
    // Not fatal. The five-minute poll still imports orders, so a store with no webhooks is
    // slower but not broken — worth a log, not worth refusing the connection.
    logError("Some Zid webhooks could not be registered", { failed });
  }
  if (registered.length > 0) {
    logInfo(`Registered ${registered.length} Zid webhook(s)`);
  }

  return { registered, failed };
}

/** Random per-channel Basic-auth credential for inbound Zid webhooks. */
export function generateZidWebhookCredential(): { username: string; password: string; secret: string } {
  const username = `zid_${crypto.randomBytes(6).toString("hex")}`;
  const password = crypto.randomBytes(24).toString("hex");
  // Stored as `user:pass` so the adapter can rebuild the exact Basic header Zid will send.
  return { username, password, secret: `${username}:${password}` };
}
