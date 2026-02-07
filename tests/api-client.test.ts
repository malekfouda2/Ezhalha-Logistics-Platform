import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import bcrypt from "bcrypt";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let clientAgent: supertest.SuperAgentTest;
let testClientUsername: string;
const TEST_CLIENT_PASSWORD = "TestClient123!";

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);

  testClientUsername = `test_client_${Date.now()}`;
  const hashedPassword = await bcrypt.hash(TEST_CLIENT_PASSWORD, 10);
  const clientAccount = await storage.createClientAccount({
    name: "Test Client Account",
    email: `${testClientUsername}@test.com`,
    phone: "55500001111",
    country: "United States",
    profile: "regular",
    accountType: "company",
    companyName: "Test Corp",
    isActive: true,
    shippingContactName: "Test Contact",
    shippingContactPhone: "55500001111",
    shippingCountryCode: "US",
    shippingStateOrProvince: "Texas",
    shippingCity: "Houston",
    shippingPostalCode: "77001",
    shippingAddressLine1: "100 Test Blvd Suite 1",
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
  await clientAgent
    .post("/api/auth/login")
    .send({ username: testClientUsername, password: TEST_CLIENT_PASSWORD });
}, 30000);

afterAll(() => {
  server.close();
});

describe("Client - Account", () => {
  it("GET /api/client/account should return client account details", async () => {
    const res = await clientAgent.get("/api/client/account");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("email");
    expect(res.body).toHaveProperty("profile");
    expect(res.body).toHaveProperty("accountNumber");
  });

  it("PATCH /api/client/account should update shipping address", async () => {
    const res = await clientAgent
      .patch("/api/client/account")
      .send({
        shippingContactName: "Updated Contact",
        shippingContactPhone: "999999999",
      });
    expect(res.status).toBe(200);
    expect(res.body.shippingContactName).toBe("Updated Contact");
  });
});

describe("Client - Shipments", () => {
  it("GET /api/client/shipments should return client shipments", async () => {
    const res = await clientAgent.get("/api/client/shipments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Client - Invoices", () => {
  it("GET /api/client/invoices should return client invoices", async () => {
    const res = await clientAgent.get("/api/client/invoices");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Client - Payments", () => {
  it("GET /api/client/payments should return client payments", async () => {
    const res = await clientAgent.get("/api/client/payments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Client - Dashboard", () => {
  it("GET /api/client/stats should return dashboard stats", async () => {
    const res = await clientAgent.get("/api/client/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalShipments");
    expect(res.body).toHaveProperty("shipmentsInTransit");
    expect(res.body).toHaveProperty("shipmentsDelivered");
    expect(res.body).toHaveProperty("pendingInvoices");
    expect(res.body).toHaveProperty("totalSpent");
    expect(typeof res.body.totalShipments).toBe("number");
  });
});

describe("Client - Users (Team Members)", () => {
  it("GET /api/client/users should return team members for primary contact", async () => {
    const res = await clientAgent.get("/api/client/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("username");
      expect(res.body[0]).toHaveProperty("email");
    }
  });
});

describe("Public - Application Submission", () => {
  it("POST /api/applications should accept valid application", async () => {
    const uniqueEmail = `test_${Date.now()}@example.com`;
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        accountType: "company",
        name: "Test Company Application",
        email: uniqueEmail,
        phone: "55512345678",
        companyName: "Test Corp Ltd",
        shippingContactName: "Test Contact",
        shippingContactPhone: "55512345678",
        shippingCountryCode: "US",
        shippingStateOrProvince: "Texas",
        shippingCity: "Houston",
        shippingPostalCode: "77001",
        shippingAddressLine1: "456 Business Blvd Suite 200",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Test Company Application");
    expect(res.body.status).toBe("pending");
  });

  it("POST /api/applications should reject invalid data", async () => {
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        name: "A",
        email: "not-an-email",
      });
    expect(res.status).toBe(400);
  });

  it("POST /api/applications should require short address for SA", async () => {
    const uniqueEmail = `test_sa_${Date.now()}@example.com`;
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        accountType: "individual",
        name: "Saudi Test",
        email: uniqueEmail,
        phone: "55512345678",
        shippingContactName: "SA Contact",
        shippingContactPhone: "55512345678",
        shippingCountryCode: "SA",
        shippingStateOrProvince: "Riyadh",
        shippingCity: "Riyadh",
        shippingPostalCode: "12345",
        shippingAddressLine1: "123 Saudi Street Block 5",
      });
    expect(res.status).toBe(400);
  });

  it("POST /api/applications should accept SA application with short address", async () => {
    const uniqueEmail = `test_sa_ok_${Date.now()}@example.com`;
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        accountType: "individual",
        name: "Saudi Test OK",
        email: uniqueEmail,
        phone: "55512345678",
        shippingContactName: "SA Contact",
        shippingContactPhone: "55512345678",
        shippingCountryCode: "SA",
        shippingStateOrProvince: "Riyadh",
        shippingCity: "Riyadh",
        shippingPostalCode: "12345",
        shippingAddressLine1: "123 Saudi Street Block 5",
        shippingShortAddress: "RCTB4359",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });
});

describe("Cross-role Access Control", () => {
  it("client should not access admin stats", async () => {
    const res = await clientAgent.get("/api/admin/stats");
    expect(res.status).toBe(403);
  });

  it("client should not access admin clients", async () => {
    const res = await clientAgent.get("/api/admin/clients");
    expect(res.status).toBe(403);
  });

  it("client should not access admin applications", async () => {
    const res = await clientAgent.get("/api/admin/applications");
    expect(res.status).toBe(403);
  });

  it("client should not access admin audit logs", async () => {
    const res = await clientAgent.get("/api/admin/audit-logs");
    expect(res.status).toBe(403);
  });

  it("client should not access admin pricing", async () => {
    const res = await clientAgent.get("/api/admin/pricing");
    expect(res.status).toBe(403);
  });

  it("client should not create pricing rules", async () => {
    const res = await clientAgent
      .post("/api/admin/pricing")
      .send({
        profile: "hacker_profile",
        displayName: "Hacker",
        marginPercentage: "0.00",
      });
    expect(res.status).toBe(403);
  });
});
