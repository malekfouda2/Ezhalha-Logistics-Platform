import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let adminAgent: supertest.SuperAgentTest;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);

  adminAgent = supertest.agent(app);
  await adminAgent
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
}, 30000);

afterAll(() => {
  server.close();
});

describe("Admin - Dashboard", () => {
  it("GET /api/admin/stats should return stats", async () => {
    const res = await adminAgent.get("/api/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalClients");
    expect(res.body).toHaveProperty("activeClients");
    expect(res.body).toHaveProperty("pendingApplications");
    expect(res.body).toHaveProperty("totalShipments");
    expect(res.body).toHaveProperty("totalRevenue");
    expect(typeof res.body.totalClients).toBe("number");
    expect(typeof res.body.activeClients).toBe("number");
  });
});

describe("Admin - Client Management", () => {
  it("GET /api/admin/clients should return paginated clients list", async () => {
    const res = await adminAgent.get("/api/admin/clients");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("clients");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("totalPages");
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it("GET /api/admin/clients should support pagination parameters", async () => {
    const res = await adminAgent.get("/api/admin/clients?page=1&limit=2");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.clients.length).toBeLessThanOrEqual(2);
  });

  it("GET /api/admin/clients should support search filter", async () => {
    const res = await adminAgent.get("/api/admin/clients?search=test");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it("GET /api/admin/clients should support profile filter", async () => {
    const res = await adminAgent.get("/api/admin/clients?profile=regular");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it("GET /api/admin/clients/:id should return a specific client", async () => {
    const listRes = await adminAgent.get("/api/admin/clients");
    if (listRes.body.clients.length > 0) {
      const clientId = listRes.body.clients[0].id;
      const res = await adminAgent.get(`/api/admin/clients/${clientId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(clientId);
      expect(res.body.name).toBeDefined();
      expect(res.body.email).toBeDefined();
    }
  });

  it("GET /api/admin/clients/:id should return 404 for non-existent client", async () => {
    const res = await adminAgent.get("/api/admin/clients/nonexistent-id-999");
    expect(res.status).toBe(404);
  });

});

describe("Admin - Applications", () => {
  it("GET /api/admin/applications should return paginated applications", async () => {
    const res = await adminAgent.get("/api/admin/applications");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("applications");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.applications)).toBe(true);
  });

  it("GET /api/admin/applications should support status filter", async () => {
    const res = await adminAgent.get("/api/admin/applications?status=pending");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.applications)).toBe(true);
  });
});

describe("Admin - Shipments", () => {
  it("GET /api/admin/shipments should return paginated shipments", async () => {
    const res = await adminAgent.get("/api/admin/shipments");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("shipments");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.shipments)).toBe(true);
  });
});

describe("Admin - Invoices", () => {
  it("GET /api/admin/invoices should return paginated invoices", async () => {
    const res = await adminAgent.get("/api/admin/invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("invoices");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });
});

describe("Admin - Payments", () => {
  it("GET /api/admin/payments should return paginated payments", async () => {
    const res = await adminAgent.get("/api/admin/payments");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("payments");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.payments)).toBe(true);
  });
});

describe("Admin - Pricing Rules", () => {
  it("GET /api/admin/pricing should return pricing rules", async () => {
    const res = await adminAgent.get("/api/admin/pricing");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/admin/pricing should create a pricing rule", async () => {
    const uniqueName = `test_profile_${Date.now()}`;
    const res = await adminAgent
      .post("/api/admin/pricing")
      .send({
        profile: uniqueName,
        displayName: "Test Profile",
        marginPercentage: "15.00",
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.profile).toBe(uniqueName);
    expect(res.body.displayName).toBe("Test Profile");
  });

  it("POST /api/admin/pricing should reject duplicate profile", async () => {
    const uniqueName = `dup_test_${Date.now()}`;
    await adminAgent
      .post("/api/admin/pricing")
      .send({
        profile: uniqueName,
        displayName: "Dup Test",
        marginPercentage: "10.00",
        isActive: true,
      });

    const res = await adminAgent
      .post("/api/admin/pricing")
      .send({
        profile: uniqueName,
        displayName: "Dup Test 2",
        marginPercentage: "12.00",
        isActive: true,
      });
    expect(res.status).toBe(400);
  });
});

describe("Admin - RBAC Roles", () => {
  it("GET /api/admin/roles should return roles", async () => {
    const res = await adminAgent.get("/api/admin/roles");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/admin/roles should create a new role", async () => {
    const uniqueName = `TestRole_${Date.now()}`;
    const res = await adminAgent
      .post("/api/admin/roles")
      .send({
        name: uniqueName,
        description: "A test role",
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(uniqueName);
  });
});

describe("Admin - RBAC Permissions", () => {
  it("GET /api/admin/permissions should return permissions", async () => {
    const res = await adminAgent.get("/api/admin/permissions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("Admin - Audit Logs", () => {
  it("GET /api/admin/audit-logs should return paginated audit logs", async () => {
    const res = await adminAgent.get("/api/admin/audit-logs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});

describe("Admin - Integration Logs", () => {
  it("GET /api/admin/integration-logs should return paginated logs", async () => {
    const res = await adminAgent.get("/api/admin/integration-logs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});

describe("Admin - Webhook Events", () => {
  it("GET /api/admin/webhook-events should return paginated events", async () => {
    const res = await adminAgent.get("/api/admin/webhook-events");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.events)).toBe(true);
  });
});
