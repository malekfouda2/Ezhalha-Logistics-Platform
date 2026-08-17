import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { User } from "@shared/schema";

// Token auth for native clients (React Native). The web SPA keeps its cookie session;
// this module only backs the Bearer path.
//
// Access token  : stateless JWT (HS256), short TTL, carries the user's tokenVersion so
//                 deactivation / password change can invalidate it before it expires.
// Refresh token : opaque random string, rotating, hashed at rest in mobile_refresh_tokens.

export const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.MOBILE_ACCESS_TOKEN_TTL || 15 * 60);
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.MOBILE_REFRESH_TOKEN_TTL_DAYS || 60);

export class MobileAuthConfigError extends Error {}

/**
 * Signing secret for access tokens. Deliberately separate from SESSION_SECRET so that
 * rotating one does not silently invalidate the other. Required in production; in dev and
 * test we fall back so the app still boots without extra setup.
 */
export function getAccessTokenSecret(): string {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (secret && secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new MobileAuthConfigError(
      "MOBILE_JWT_SECRET is required in production for mobile token auth",
    );
  }
  return process.env.SESSION_SECRET || "ezhalha-mobile-dev-secret";
}

/** True when this deployment can issue mobile tokens at all. */
export function isMobileAuthConfigured(): boolean {
  try {
    getAccessTokenSecret();
    return true;
  } catch {
    return false;
  }
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────
// Implemented directly on node crypto rather than pulling in a JWT dependency: the
// signing side is ~20 lines and the verification rules we need (alg pinning, exp, typ)
// are easier to audit here than to configure in a library.

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function sign(payload: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(payload).digest());
}

export interface AccessTokenClaims {
  /** user id */
  sub: string;
  /** admin | client | operations */
  typ: string;
  /** client account id, when the user is a client */
  acc?: string;
  /** users.tokenVersion at mint time */
  tv: number;
  iat: number;
  exp: number;
}

export function issueAccessToken(user: User): { token: string; expiresIn: number } {
  const secret = getAccessTokenSecret();
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    sub: user.id,
    typ: user.userType,
    ...(user.clientAccountId ? { acc: user.clientAccountId } : {}),
    tv: user.tokenVersion ?? 0,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(claims));
  const signature = sign(`${header}.${body}`, secret);

  return { token: `${header}.${body}.${signature}`, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export type AccessTokenFailure = "malformed" | "bad_signature" | "expired";

export type VerifyResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: AccessTokenFailure };

export function verifyAccessToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed" };
  }

  const [header, body, signature] = parts;

  // Pin the algorithm from our own header parse — never trust alg from the token.
  let parsedHeader: { alg?: unknown; typ?: unknown };
  try {
    parsedHeader = JSON.parse(base64UrlDecode(header).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") {
    return { ok: false, reason: "bad_signature" };
  }

  let secret: string;
  try {
    secret = getAccessTokenSecret();
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  const expected = Buffer.from(sign(`${header}.${body}`, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "bad_signature" };
  }

  let claims: AccessTokenClaims;
  try {
    claims = JSON.parse(base64UrlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof claims.sub !== "string" ||
    typeof claims.exp !== "number" ||
    typeof claims.tv !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (claims.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, claims };
}

// ── Refresh tokens ───────────────────────────────────────────────────────────

/** Opaque, high-entropy, URL-safe. Returned to the client exactly once. */
export function generateRefreshToken(): string {
  return base64UrlEncode(randomBytes(48));
}

/** Refresh tokens are stored hashed so a database read cannot mint sessions. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Extracts a bearer token from the Authorization header. Case-insensitive scheme. */
export function extractBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== "string") {
    return null;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}
