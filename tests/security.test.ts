import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import bcrypt from "bcrypt";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

let adminAgent: supertest.SuperAgentTest;
let clientAgent: supertest.SuperAgentTest;
let testClientUsername: string;
const TEST_CLIENT_PASSWORD = "SecTestClient123!";

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  adminAgent = supertest.agent(app);
  const adminLogin = await adminAgent
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
  if (adminLogin.status !== 200) {
    throw new Error("Admin login failed in security test setup");
  }

  testClientUsername = `sec_test_client_${Date.now()}`;
  const hashedPassword = await bcrypt.hash(TEST_CLIENT_PASSWORD, 10);
  const clientAccount = await storage.createClientAccount({
    name: "Security Test Client",
    email: `${testClientUsername}@test.com`,
    phone: "55500003333",
    country: "United States",
    profile: "regular",
    accountType: "individual",
    isActive: true,
    shippingContactName: "Sec Contact",
    shippingContactPhone: "55500003333",
    shippingCountryCode: "US",
    shippingStateOrProvince: "CA",
    shippingCity: "San Francisco",
    shippingPostalCode: "94105",
    shippingAddressLine1: "300 Security Ave Suite 1",
  });
  await storage.createUser({
    username: testClientUsername,
    email: `${testClientUsername}@test.com`,
    password: hashedPassword,
    userType: "client",
    isPrimaryContact: true,
    mustChangePassword: false,
    isActive: true,
    clientAccountId: clientAccount.id,
  });

  clientAgent = supertest.agent(app);
  const clientLogin = await clientAgent
    .post("/api/auth/login")
    .send({ username: testClientUsername, password: TEST_CLIENT_PASSWORD });
  if (clientLogin.status !== 200) {
    throw new Error("Client login failed in security test setup");
  }
}, 30000);

afterAll(() => {
  server.close();
});

describe("Security Headers", () => {
  it("should include security headers from Helmet", async () => {
    const res = await request.get("/api/health");
    expect(res.headers).toHaveProperty("x-content-type-options");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("Session Security", () => {
  it("session cookie should be httpOnly", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    
    const setCookieHeader = res.headers["set-cookie"];
    if (setCookieHeader) {
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join("; ")
        : setCookieHeader;
      expect(cookieStr.toLowerCase()).toContain("httponly");
    }
  });

  it("password should never be exposed in responses", async () => {
    const meRes = await adminAgent.get("/api/auth/me");
    expect(meRes.body.user.password).toBeUndefined();
  });
});

describe("Input Validation", () => {
  it("should reject SQL injection in login", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({
        username: "admin'; DROP TABLE users; --",
        password: "test",
      });
    expect(res.status).toBe(401);
  });

  it("should handle malformed JSON gracefully", async () => {
    const res = await request
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("not valid json{{{");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("should handle empty POST body for login", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("Authorization Enforcement", () => {
  it("unauthenticated user cannot access admin routes", async () => {
    const adminEndpoints = [
      { method: "get", path: "/api/admin/stats" },
      { method: "get", path: "/api/admin/clients" },
      { method: "get", path: "/api/admin/applications" },
      { method: "get", path: "/api/admin/shipments" },
      { method: "get", path: "/api/admin/invoices" },
      { method: "get", path: "/api/admin/payments" },
      { method: "get", path: "/api/admin/pricing" },
      { method: "get", path: "/api/admin/audit-logs" },
      { method: "get", path: "/api/admin/roles" },
      { method: "get", path: "/api/admin/permissions" },
      { method: "get", path: "/api/admin/integration-logs" },
      { method: "get", path: "/api/admin/webhook-events" },
    ];

    for (const endpoint of adminEndpoints) {
      const res = await (request as any)[endpoint.method](endpoint.path);
      expect(res.status).toBe(401);
    }
  });

  it("unauthenticated user cannot access client routes", async () => {
    const clientEndpoints = [
      { method: "get", path: "/api/client/account" },
      { method: "get", path: "/api/client/shipments" },
      { method: "get", path: "/api/client/invoices" },
      { method: "get", path: "/api/client/payments" },
      { method: "get", path: "/api/client/stats" },
    ];

    for (const endpoint of clientEndpoints) {
      const res = await (request as any)[endpoint.method](endpoint.path);
      expect(res.status).toBe(401);
    }
  });

  it("client user cannot access admin endpoints", async () => {
    const endpoints = [
      "/api/admin/stats",
      "/api/admin/clients",
      "/api/admin/applications",
      "/api/admin/audit-logs",
      "/api/admin/roles",
    ];

    for (const endpoint of endpoints) {
      const res = await clientAgent.get(endpoint);
      expect(res.status).toBe(403);
    }
  });

  it("admin user cannot access client endpoints", async () => {
    const endpoints = [
      "/api/client/account",
      "/api/client/shipments",
      "/api/client/invoices",
      "/api/client/payments",
    ];

    for (const endpoint of endpoints) {
      const res = await adminAgent.get(endpoint);
      expect(res.status).toBe(403);
    }
  });

  it("POST requests to admin write endpoints should be blocked for clients", async () => {
    const postRes = await clientAgent
      .post("/api/admin/pricing")
      .send({
        profile: "unauthorized_profile",
        displayName: "Unauthorized",
        marginPercentage: "0.00",
      });
    expect(postRes.status).toBe(403);
  });
});

describe("Inactive Account Handling", () => {
  it("deactivated user should not be able to login", async () => {
    const uniqueUsername = `inactive_${Date.now()}`;
    const hashedPassword = await bcrypt.hash("testpass123", 10);

    await storage.createUser({
      username: uniqueUsername,
      email: `${uniqueUsername}@test.com`,
      password: hashedPassword,
      userType: "client",
      isPrimaryContact: false,
      mustChangePassword: false,
      isActive: false,
    });

    const res = await request
      .post("/api/auth/login")
      .send({ username: uniqueUsername, password: "testpass123" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account is deactivated");
  });
});

describe("Password Security", () => {
  it("passwords should be hashed with bcrypt", async () => {
    const user = await storage.getUserByUsername("admin");
    expect(user).toBeDefined();
    expect(user!.password).not.toBe("admin123");
    expect(user!.password.startsWith("$2")).toBe(true);
  });
});
