import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  issueAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  extractBearerToken,
  getAccessTokenSecret,
  MobileAuthConfigError,
  ACCESS_TOKEN_TTL_SECONDS,
} from "../server/services/mobile-auth";
import type { User } from "../shared/schema";

const baseUser = {
  id: "user-1",
  username: "someone",
  email: "someone@example.com",
  phone: null,
  fullName: "Some One",
  password: "hashed",
  userType: "client",
  clientAccountId: "acct-1",
  isPrimaryContact: true,
  isAccountManager: false,
  mustChangePassword: false,
  isActive: true,
  tokenVersion: 0,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as User;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.MOBILE_JWT_SECRET = "test-mobile-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("access tokens", () => {
  it("round-trips claims for a client user", () => {
    const { token, expiresIn } = issueAccessToken(baseUser);
    expect(expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);

    const result = verifyAccessToken(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.claims.sub).toBe("user-1");
    expect(result.claims.typ).toBe("client");
    expect(result.claims.acc).toBe("acct-1");
    expect(result.claims.tv).toBe(0);
    expect(result.claims.exp).toBeGreaterThan(result.claims.iat);
  });

  it("omits the account claim for internal users", () => {
    const admin = { ...baseUser, userType: "admin", clientAccountId: null } as User;
    const result = verifyAccessToken(issueAccessToken(admin).token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.acc).toBeUndefined();
    expect(result.claims.typ).toBe("admin");
  });

  it("carries the user's tokenVersion so bumps can invalidate it", () => {
    const bumped = { ...baseUser, tokenVersion: 7 } as User;
    const result = verifyAccessToken(issueAccessToken(bumped).token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.tv).toBe(7);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = issueAccessToken(baseUser);
    process.env.MOBILE_JWT_SECRET = "a-different-secret";

    const result = verifyAccessToken(token);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects a tampered payload", () => {
    const { token } = issueAccessToken(baseUser);
    const [header, , signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "someone-else", typ: "admin", tv: 0, iat: 1, exp: 99999999999 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = verifyAccessToken(`${header}.${forgedBody}.${signature}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad_signature");
  });

  it("refuses the alg=none downgrade", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
      .toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "user-1", typ: "admin", tv: 0, iat: 1, exp: 99999999999 }),
    ).toString("base64url");

    const result = verifyAccessToken(`${header}.${body}.`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toBe(undefined);
  });

  it("reports expiry distinctly so clients know to refresh", () => {
    process.env.MOBILE_ACCESS_TOKEN_TTL = "1";
    const issuedAt = Math.floor(Date.now() / 1000);
    // Build a token that is already past its exp without waiting on the clock.
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "user-1", typ: "client", tv: 0, iat: issuedAt - 100, exp: issuedAt - 10 }),
    ).toString("base64url");
    const { createHmac } = require("crypto");
    const signature = createHmac("sha256", "test-mobile-secret")
      .update(`${header}.${body}`)
      .digest("base64url");

    const result = verifyAccessToken(`${header}.${body}.${signature}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("expired");
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "a.b", "a.b.c.d"]) {
      const result = verifyAccessToken(bad);
      expect(result.ok).toBe(false);
    }
  });
});

describe("secret configuration", () => {
  it("throws in production when MOBILE_JWT_SECRET is missing", () => {
    delete process.env.MOBILE_JWT_SECRET;
    process.env.NODE_ENV = "production";
    expect(() => getAccessTokenSecret()).toThrow(MobileAuthConfigError);
  });

  it("falls back outside production so local dev still boots", () => {
    delete process.env.MOBILE_JWT_SECRET;
    process.env.NODE_ENV = "development";
    expect(getAccessTokenSecret()).toBeTruthy();
  });
});

describe("refresh tokens", () => {
  it("generates unique, high-entropy, URL-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(60);
    }
  });

  it("hashes deterministically and does not echo the raw token", () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toBe(hashRefreshToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("expires in the future", () => {
    expect(refreshTokenExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});

describe("bearer header parsing", () => {
  it("accepts the standard header and is scheme-case-insensitive", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("bearer abc")).toBe("abc");
    expect(extractBearerToken("BEARER abc")).toBe("abc");
  });

  it("ignores anything that is not a bearer credential", () => {
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer   ")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(123)).toBeNull();
  });
});
