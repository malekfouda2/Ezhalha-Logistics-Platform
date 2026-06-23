import { readFileSync } from "fs";
import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import bcrypt from "bcrypt";
import { registerRoutes, DEFAULT_PERMISSIONS } from "../server/routes";
import { storage } from "../server/storage";
import { ADMIN_ROUTE_PERMISSIONS } from "../client/src/lib/admin-navigation";

const SEEDED_PERMISSION_NAMES = new Set(
  DEFAULT_PERMISSIONS.map((permission) => `${permission.resource}:${permission.action}`),
);

describe("RBAC config consistency", () => {
  it("seeds a unique, non-trivial permission catalog", () => {
    expect(DEFAULT_PERMISSIONS.length).toBeGreaterThan(50);
    expect(SEEDED_PERMISSION_NAMES.size).toBe(DEFAULT_PERMISSIONS.length); // no duplicates
  });

  it("every permission referenced by admin navigation/route config is seeded", () => {
    const navPermissions = new Set<string>();
    for (const config of Object.values(ADMIN_ROUTE_PERMISSIONS)) {
      for (const name of config.anyOf ?? []) navPermissions.add(name);
      for (const name of config.allOf ?? []) navPermissions.add(name);
    }

    const missing = [...navPermissions].filter((name) => !SEEDED_PERMISSION_NAMES.has(name));
    expect(missing).toEqual([]);
  });

  it("every permission enforced by server routes is seeded", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const guardRegex =
      /(?:requireAdminPermission|requireOperationsPermission|ensureAdminPermission)\(\s*(?:req,\s*res,\s*)?"([a-z-]+)"\s*,\s*"([a-z-]+)"/g;

    const used = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = guardRegex.exec(source)) !== null) {
      used.add(`${match[1]}:${match[2]}`);
    }

    expect(used.size).toBeGreaterThan(40);
    const missing = [...used].filter((name) => !SEEDED_PERMISSION_NAMES.has(name));
    expect(missing).toEqual([]);
  });
});

describe("Internal-staff access enforcement", () => {
  let app: express.Express;
  let server: ReturnType<typeof createServer>;
  let request: supertest.SuperTest<supertest.Test>;

  let adminCookies: string[] = [];
  let opsScopedCookies: string[] = [];
  let opsNoRoleCookies: string[] = [];
  let clientCookies: string[] = [];

  const login = async (username: string, password: string): Promise<string[]> => {
    const res = await request.post("/api/auth/login").send({ username, password });
    expect(res.status, `login ${username} -> ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
    return res.headers["set-cookie"] || [];
  };
  const as = (cookies: string[]) => (path: string) => request.get(path).set("Cookie", cookies);

  const PASSWORD = "test12345";

  // Idempotent find-or-create so reruns reuse the same fixtures (no row growth).
  const upsertUser = async (
    username: string,
    fields: { userType: string; clientAccountId?: string | null },
  ) => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return (
        (await storage.updateUser(existing.id, {
          password: hash,
          userType: fields.userType,
          clientAccountId: fields.clientAccountId ?? existing.clientAccountId,
          isActive: true,
        })) || existing
      );
    }
    return storage.createUser({
      username,
      email: `${username}@test.local`,
      password: hash,
      userType: fields.userType,
      clientAccountId: fields.clientAccountId ?? null,
      isActive: true,
    });
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    server = createServer(app);
    await registerRoutes(server, app);
    request = supertest(app);

    adminCookies = await login("admin", "admin123");

    // Role scoped to only `clients:read`.
    const permissions = await storage.getPermissions();
    const clientsRead = permissions.find((p) => p.name === "clients:read");
    expect(clientsRead).toBeTruthy();
    const roleName = "RBAC Test Clients-Read";
    const existingRoles = await storage.getRoles();
    const scopedRole =
      existingRoles.find((r) => r.name === roleName) ||
      (await storage.createRole({
        name: roleName,
        description: "RBAC test role",
        departmentId: null,
        isSystem: false,
        isActive: true,
      }));
    const rolePerms = await storage.getRolePermissions(scopedRole.id);
    if (!rolePerms.some((rp) => rp.permissionId === clientsRead!.id)) {
      await storage.assignRolePermission({ roleId: scopedRole.id, permissionId: clientsRead!.id });
    }

    // Operations user scoped to that role.
    const opsScoped = await upsertUser("rbac_ops_scoped", { userType: "operations" });
    const opsScopedRoles = await storage.getUserRoles(opsScoped.id);
    if (!opsScopedRoles.some((r) => r.roleId === scopedRole.id)) {
      await storage.assignUserRole({ userId: opsScoped.id, roleId: scopedRole.id });
    }
    opsScopedCookies = await login("rbac_ops_scoped", PASSWORD);

    // Operations user with no roles -> no permissions.
    await upsertUser("rbac_ops_norole", { userType: "operations" });
    opsNoRoleCookies = await login("rbac_ops_norole", PASSWORD);

    // External client user (must have an active client account to log in).
    const existingClient = await storage.getUserByUsername("rbac_client");
    let clientAccountId = existingClient?.clientAccountId ?? null;
    if (!clientAccountId) {
      const account = await storage.createClientAccount({
        name: "RBAC Test Co",
        email: `rbac_co_${Date.now()}@test.local`,
        phone: "+966500000000",
        country: "SA",
      });
      clientAccountId = account.id;
    }
    await upsertUser("rbac_client", { userType: "client", clientAccountId });
    clientCookies = await login("rbac_client", PASSWORD);
  }, 30000);

  afterAll(() => {
    server.close();
  });

  it("admin resolves the full permission set and can reach admin endpoints", async () => {
    const access = await as(adminCookies)("/api/admin/me/access");
    expect(access.status).toBe(200);
    expect(access.body.permissions.length).toBeGreaterThan(50);

    const clients = await as(adminCookies)("/api/admin/clients");
    expect(clients.status).toBe(200);
  });

  it("operations user reaches admin pages it has the permission for", async () => {
    const access = await as(opsScopedCookies)("/api/admin/me/access");
    expect(access.status).toBe(200);
    expect(access.body.permissions).toContain("clients:read");

    const clients = await as(opsScopedCookies)("/api/admin/clients");
    expect(clients.status).toBe(200);
  });

  it("operations user is denied admin pages it lacks permission for", async () => {
    const users = await as(opsScopedCookies)("/api/admin/users");
    expect(users.status).toBe(403);
  });

  it("operations user with no role has no admin access", async () => {
    const access = await as(opsNoRoleCookies)("/api/admin/me/access");
    expect(access.status).toBe(200);
    expect(access.body.permissions).toEqual([]);

    const clients = await as(opsNoRoleCookies)("/api/admin/clients");
    expect(clients.status).toBe(403);
  });

  it("external client users are blocked from the internal-staff surface", async () => {
    const access = await as(clientCookies)("/api/admin/me/access");
    expect(access.status).toBe(403);

    const clients = await as(clientCookies)("/api/admin/clients");
    expect(clients.status).toBe(403);
  });
});
