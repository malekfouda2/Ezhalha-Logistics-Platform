import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);
}, 30000);

afterAll(() => {
  server.close();
});

describe("Health Check", () => {
  it("GET /api/health should return healthy status", async () => {
    const res = await request.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("ezhalha");
    expect(res.body.version).toBe("1.0.0");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("Branding Config", () => {
  it("GET /api/config/branding should return branding info", async () => {
    const res = await request.get("/api/config/branding");
    expect(res.status).toBe(200);
    expect(res.body.appName).toBe("ezhalha");
    expect(res.body.primaryColor).toBe("#fe5200");
    expect(res.body.logoUrl).toBeDefined();
  });
});

describe("Authentication - Login", () => {
  it("should login successfully with valid admin credentials", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe("admin");
    expect(res.body.user.userType).toBe("admin");
    expect(res.body.user.password).toBeUndefined();
  });

  it("should not expose password in login response", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
  });

  it("should return 401 for invalid username", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ username: "nonexistent", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("should return 401 for invalid password", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("should return 400 for empty body", async () => {
    const res = await request.post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("should return 400 for missing username", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ password: "password123" });
    expect(res.status).toBe(400);
  });

  it("should return 400 for missing password", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ username: "admin" });
    expect(res.status).toBe(400);
  });
});

describe("Authentication - Session", () => {
  it("GET /api/auth/me should return 401 when not logged in", async () => {
    const res = await request.get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  it("should maintain session after login", async () => {
    const agent = supertest.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    expect(loginRes.status).toBe(200);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.username).toBe("admin");
    expect(meRes.body.user.password).toBeUndefined();
  });

  it("should clear session on logout", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });
});

describe("Authentication - Change Password", () => {
  it("should require authentication for password change", async () => {
    const res = await request
      .post("/api/auth/change-password")
      .send({ currentPassword: "old", newPassword: "newpassword" });
    expect(res.status).toBe(401);
  });

  it("should reject incorrect current password", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "wrongpassword", newPassword: "newpassword123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Current password is incorrect");
  });

  it("should reject short new password", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "admin123", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("should reject empty body", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    const res = await agent.post("/api/auth/change-password").send({});
    expect(res.status).toBe(400);
  });
});

describe("Protected Route Access", () => {
  it("admin routes should return 401 without authentication", async () => {
    const endpoints = [
      "/api/admin/clients",
      "/api/admin/applications",
      "/api/admin/shipments",
      "/api/admin/invoices",
      "/api/admin/payments",
      "/api/admin/pricing-rules",
      "/api/admin/audit-logs",
      "/api/admin/roles",
      "/api/admin/permissions",
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(endpoint);
      expect(res.status).toBe(401);
    }
  });

  it("client routes should return 401 without authentication", async () => {
    const endpoints = [
      "/api/client/account",
      "/api/client/shipments",
      "/api/client/invoices",
      "/api/client/payments",
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(endpoint);
      expect(res.status).toBe(401);
    }
  });

  it("admin routes should return 403 for client users", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "client", password: "welcome123" });

    const res = await agent.get("/api/admin/clients");
    expect(res.status).toBe(403);
  });

  it("client routes should return 403 for admin users", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    const res = await agent.get("/api/client/account");
    expect(res.status).toBe(403);
  });
});
