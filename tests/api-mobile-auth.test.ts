import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import bcrypt from "bcrypt";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { hashRefreshToken } from "../server/services/mobile-auth";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

let clientUsername: string;
let clientUserId: string;
const PASSWORD = "MobileAuthTest123!";

const device = {
  deviceId: "test-device-001",
  deviceName: "Test iPhone",
  platform: "ios" as const,
  appVersion: "1.0.0",
};

async function getTokens(overrides: Record<string, unknown> = {}) {
  const res = await request
    .post("/api/auth/token")
    .send({ username: clientUsername, password: PASSWORD, ...device, ...overrides });
  return res;
}

beforeAll(async () => {
  process.env.MOBILE_JWT_SECRET = "integration-test-secret";

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  clientUsername = `mobile_auth_client_${Date.now()}`;
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const clientAccount = await storage.createClientAccount({
    name: "Mobile Auth Test Client",
    email: `${clientUsername}@test.com`,
    phone: "55500003333",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "individual",
    isActive: true,
    shippingContactName: "Mobile Contact",
    shippingContactPhone: "55500003333",
    shippingCountryCode: "SA",
    shippingStateOrProvince: "Riyadh",
    shippingCity: "Riyadh",
    shippingPostalCode: "12345",
    shippingAddressLine1: "1 Mobile Test Street",
  });

  const user = await storage.createUser({
    username: clientUsername,
    email: `${clientUsername}@test.com`,
    password: hashedPassword,
    userType: "client",
    isPrimaryContact: true,
    mustChangePassword: false,
    isActive: true,
    clientAccountId: clientAccount.id,
  });
  clientUserId = user.id;
});

describe("POST /api/auth/token", () => {
  it("issues an access + refresh pair for valid credentials", async () => {
    const res = await getTokens();

    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe("Bearer");
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.expiresIn).toBeGreaterThan(0);
    expect(res.body.user.id).toBe(clientUserId);
  });

  it("never returns the password hash", async () => {
    const res = await getTokens();
    expect(res.body.user.password).toBeUndefined();
  });

  it("sets no session cookie — token clients must not get one", async () => {
    const res = await getTokens();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    const res = await getTokens({ password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it("requires a deviceId", async () => {
    const res = await request
      .post("/api/auth/token")
      .send({ username: clientUsername, password: PASSWORD, platform: "ios" });
    expect(res.status).toBe(400);
  });
});

describe("bearer authentication on existing routes", () => {
  it("authenticates /api/auth/me with a bearer token and no cookie", async () => {
    const { body } = await getTokens();

    const res = await request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(clientUserId);
  });

  it("reaches a client-portal route that reads req.session.userId", async () => {
    const { body } = await getTokens();

    const res = await request
      .get("/api/client/shipments")
      .set("Authorization", `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
  });

  it("rejects a garbage token with token_invalid", async () => {
    const res = await request
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("token_invalid");
  });

  it("still rejects unauthenticated requests", async () => {
    const res = await request.get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the pair and returns a different refresh token", async () => {
    const { body } = await getTokens();

    const res = await request.post("/api/auth/refresh").send({ refreshToken: body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(body.refreshToken);
  });

  it("invalidates the presented token after rotation", async () => {
    const { body } = await getTokens();
    await request.post("/api/auth/refresh").send({ refreshToken: body.refreshToken });

    const replay = await request.post("/api/auth/refresh").send({ refreshToken: body.refreshToken });
    expect(replay.status).toBe(401);
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const { body } = await getTokens();
    const rotated = await request
      .post("/api/auth/refresh")
      .send({ refreshToken: body.refreshToken });

    // Replaying the original signals a leaked chain.
    const replay = await request.post("/api/auth/refresh").send({ refreshToken: body.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("refresh_reused");

    // The legitimate successor must die with the family.
    const successor = await request
      .post("/api/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    expect(successor.status).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await request
      .post("/api/auth/refresh")
      .send({ refreshToken: "a".repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("refresh_invalid");
  });

  it("stores only the hash, never the raw refresh token", async () => {
    const { body } = await getTokens();
    const stored = await storage.getMobileRefreshTokenByHash(hashRefreshToken(body.refreshToken));

    expect(stored).toBeTruthy();
    expect(stored!.tokenHash).not.toBe(body.refreshToken);
    expect(stored!.userId).toBe(clientUserId);
  });
});

describe("POST /api/auth/revoke", () => {
  it("retires the refresh token", async () => {
    const { body } = await getTokens();

    const res = await request.post("/api/auth/revoke").send({ refreshToken: body.refreshToken });
    expect(res.status).toBe(200);

    const after = await request.post("/api/auth/refresh").send({ refreshToken: body.refreshToken });
    expect(after.status).toBe(401);
  });

  it("reports success for an unknown token, to avoid probing", async () => {
    const res = await request.post("/api/auth/revoke").send({ refreshToken: "b".repeat(64) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("token invalidation", () => {
  it("rejects a live access token after tokenVersion is bumped", async () => {
    const { body } = await getTokens();

    // Confirm it works first.
    const before = await request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.accessToken}`);
    expect(before.status).toBe(200);

    await storage.bumpUserTokenVersion(clientUserId);

    const after = await request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.accessToken}`);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("token_revoked");
  });
});

describe("GET /api/auth/devices", () => {
  it("lists signed-in devices for the token holder", async () => {
    const { body } = await getTokens();

    const res = await request
      .get("/api/auth/devices")
      .set("Authorization", `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.devices)).toBe(true);
    expect(res.body.devices.some((d: any) => d.deviceName === device.deviceName)).toBe(true);
  });

  it("requires authentication", async () => {
    const res = await request.get("/api/auth/devices");
    expect(res.status).toBe(401);
  });
});

describe("cookie sessions still work", () => {
  it("logs in with a cookie and reaches an authenticated route", async () => {
    const login = await request
      .post("/api/auth/login")
      .send({ username: clientUsername, password: PASSWORD });

    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"];
    expect(cookies).toBeTruthy();

    const res = await request.get("/api/auth/me").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(clientUserId);
  });
});
