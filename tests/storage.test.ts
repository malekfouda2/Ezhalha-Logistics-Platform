import { describe, it, expect, beforeAll } from "vitest";
import { storage } from "../server/storage";

describe("Storage - Users", () => {
  it("should get user by username", async () => {
    const user = await storage.getUserByUsername("admin");
    expect(user).toBeDefined();
    expect(user!.username).toBe("admin");
    expect(user!.userType).toBe("admin");
  });

  it("should get user by email", async () => {
    const user = await storage.getUserByEmail("admin@ezhalha.com");
    expect(user).toBeDefined();
    expect(user!.username).toBe("admin");
  });

  it("should return undefined for non-existent username", async () => {
    const user = await storage.getUserByUsername("nonexistent_user_xyz");
    expect(user).toBeUndefined();
  });

  it("should return undefined for non-existent email", async () => {
    const user = await storage.getUserByEmail("nonexistent@nowhere.com");
    expect(user).toBeUndefined();
  });

  it("should get user by id", async () => {
    const adminUser = await storage.getUserByUsername("admin");
    expect(adminUser).toBeDefined();
    const user = await storage.getUser(adminUser!.id);
    expect(user).toBeDefined();
    expect(user!.id).toBe(adminUser!.id);
  });

  it("should return undefined for non-existent user id", async () => {
    const user = await storage.getUser("nonexistent-id-12345");
    expect(user).toBeUndefined();
  });

  it("should create a new user", async () => {
    const uniqueUsername = `testuser_${Date.now()}`;
    const uniqueEmail = `${uniqueUsername}@test.com`;
    const bcrypt = await import("bcrypt");
    const hashedPassword = await bcrypt.hash("testpass123", 10);

    const user = await storage.createUser({
      username: uniqueUsername,
      email: uniqueEmail,
      password: hashedPassword,
      userType: "client",
      isPrimaryContact: false,
      mustChangePassword: false,
      isActive: true,
    });

    expect(user).toBeDefined();
    expect(user.username).toBe(uniqueUsername);
    expect(user.email).toBe(uniqueEmail);
    expect(user.userType).toBe("client");
    expect(user.id).toBeDefined();
  });

  it("should update a user", async () => {
    const user = await storage.getUserByUsername("admin");
    expect(user).toBeDefined();

    const updated = await storage.updateUser(user!.id, {
      updatedAt: new Date(),
    });
    expect(updated).toBeDefined();
    expect(updated!.id).toBe(user!.id);
  });
});

describe("Storage - Client Accounts", () => {
  it("should get all client accounts", async () => {
    const accounts = await storage.getClientAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
  });

  it("should get paginated client accounts", async () => {
    const result = await storage.getClientAccountsPaginated({
      page: 1,
      limit: 5,
    });
    expect(result).toHaveProperty("clients");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("totalPages");
    expect(result.page).toBe(1);
    expect(Array.isArray(result.clients)).toBe(true);
  });

  it("should get a specific client account", async () => {
    const accounts = await storage.getClientAccounts();
    if (accounts.length > 0) {
      const account = await storage.getClientAccount(accounts[0].id);
      expect(account).toBeDefined();
      expect(account!.id).toBe(accounts[0].id);
    }
  });

  it("should return undefined for non-existent client account", async () => {
    const account = await storage.getClientAccount("nonexistent-id");
    expect(account).toBeUndefined();
  });
});

describe("Storage - Client Applications", () => {
  it("should create a client application", async () => {
    const uniqueEmail = `storage_test_${Date.now()}@test.com`;
    const application = await storage.createClientApplication({
      accountType: "individual",
      name: "Storage Test User",
      email: uniqueEmail,
      phone: "55511112222",
      country: "United States",
      shippingContactName: "Test Contact",
      shippingContactPhone: "55511112222",
      shippingCountryCode: "US",
      shippingStateOrProvince: "New York",
      shippingCity: "New York",
      shippingPostalCode: "10001",
      shippingAddressLine1: "789 Test Avenue Suite 100",
      status: "pending",
    });
    expect(application).toBeDefined();
    expect(application.name).toBe("Storage Test User");
    expect(application.status).toBe("pending");
    expect(application.id).toBeDefined();
  });

  it("should get all applications", async () => {
    const apps = await storage.getClientApplications();
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThan(0);
  });

  it("should get paginated applications", async () => {
    const result = await storage.getClientApplicationsPaginated({
      page: 1,
      limit: 5,
    });
    expect(result).toHaveProperty("applications");
    expect(result).toHaveProperty("total");
    expect(result.page).toBe(1);
  });
});

describe("Storage - Pricing Rules", () => {
  it("should get all pricing rules", async () => {
    const rules = await storage.getPricingRules();
    expect(Array.isArray(rules)).toBe(true);
  });

  it("should create a pricing rule", async () => {
    const uniqueProfile = `storage_test_${Date.now()}`;
    const rule = await storage.createPricingRule({
      profile: uniqueProfile,
      displayName: "Storage Test",
      marginPercentage: "20.00",
      isActive: true,
    });
    expect(rule).toBeDefined();
    expect(rule.profile).toBe(uniqueProfile);
    expect(rule.marginPercentage).toBe("20.00");
  });

  it("should get pricing rule by profile", async () => {
    const rule = await storage.getPricingRuleByProfile("regular");
    if (rule) {
      expect(rule.profile).toBe("regular");
    }
  });
});

describe("Storage - Audit Logs", () => {
  it("should create an audit log", async () => {
    const log = await storage.createAuditLog({
      userId: null,
      action: "test_action",
      entityType: "test_entity",
      entityId: null,
      details: "Storage test audit log",
      ipAddress: "127.0.0.1",
    });
    expect(log).toBeDefined();
    expect(log.action).toBe("test_action");
    expect(log.entityType).toBe("test_entity");
  });

  it("should get paginated audit logs", async () => {
    const result = await storage.getAuditLogsPaginated({
      page: 1,
      limit: 10,
    });
    expect(result).toHaveProperty("logs");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.logs)).toBe(true);
  });
});

describe("Storage - RBAC", () => {
  it("should get roles", async () => {
    const roles = await storage.getRoles();
    expect(Array.isArray(roles)).toBe(true);
  });

  it("should create a role", async () => {
    const uniqueName = `StorageTestRole_${Date.now()}`;
    const role = await storage.createRole({
      name: uniqueName,
      description: "Created by storage test",
      isActive: true,
    });
    expect(role).toBeDefined();
    expect(role.name).toBe(uniqueName);
  });

  it("should get permissions", async () => {
    const permissions = await storage.getPermissions();
    expect(Array.isArray(permissions)).toBe(true);
    expect(permissions.length).toBeGreaterThan(0);
  });
});

describe("Storage - Integration Logs", () => {
  it("should create an integration log", async () => {
    const log = await storage.createIntegrationLog({
      serviceName: "test_service",
      operation: "test_operation",
      success: true,
      statusCode: 200,
      duration: 150,
      requestPayload: JSON.stringify({ test: true }),
      responsePayload: JSON.stringify({ ok: true }),
      errorMessage: null,
    });
    expect(log).toBeDefined();
    expect(log.serviceName).toBe("test_service");
    expect(log.success).toBe(true);
  });

  it("should get paginated integration logs", async () => {
    const result = await storage.getIntegrationLogsPaginated({
      page: 1,
      limit: 10,
    });
    expect(result).toHaveProperty("logs");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.logs)).toBe(true);
  });
});

describe("Storage - Webhook Events", () => {
  it("should create a webhook event", async () => {
    const event = await storage.createWebhookEvent({
      source: "test",
      eventType: "test.event",
      payload: JSON.stringify({ test: true }),
      signature: null,
      processed: false,
      errorMessage: null,
      retryCount: 0,
    });
    expect(event).toBeDefined();
    expect(event.source).toBe("test");
    expect(event.processed).toBe(false);
  });
});
