import { createHash } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { InternalDepartmentSlug, RoleHierarchyLevel, UserInvitationStatus } from "../shared/internal-users";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[] = [];

const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);
const asAdmin = {
  get: (path: string) => withCookies(request.get(path), adminCookies),
  post: (path: string) => withCookies(request.post(path), adminCookies),
  patch: (path: string) => withCookies(request.patch(path), adminCookies),
};

async function loginAndGetCookies(username: string, password: string): Promise<string[]> {
  const res = await request.post("/api/auth/login").send({ username, password });
  return res.headers["set-cookie"] || [];
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);
  adminCookies = await loginAndGetCookies("admin", "admin123");
}, 30000);

afterAll(() => {
  server.close();
});

describe("Internal users hierarchy APIs", () => {
  it("should expose seeded departments and hierarchy roles", async () => {
    const departmentsRes = await asAdmin.get("/api/admin/departments");
    expect(departmentsRes.status).toBe(200);
    expect(departmentsRes.body.some((department: any) => department.slug === InternalDepartmentSlug.OPERATIONS)).toBe(true);
    expect(departmentsRes.body.some((department: any) => department.slug === InternalDepartmentSlug.ACCOUNT_MANAGEMENT)).toBe(true);

    const rolesRes = await asAdmin.get("/api/admin/roles");
    expect(rolesRes.status).toBe(200);
    expect(rolesRes.body.some((role: any) => role.name === "Operations Manager")).toBe(true);
    expect(rolesRes.body.some((role: any) => role.name === "Operations Team Lead")).toBe(true);
    expect(rolesRes.body.some((role: any) => role.name === "Operations Officer")).toBe(true);
    expect(rolesRes.body.some((role: any) => role.name === "Operations Agent")).toBe(true);
  });

  it("should expose internal user detail with real activity", async () => {
    const adminUser = await storage.getUserByUsername("admin");
    expect(adminUser).toBeDefined();

    const detailRes = await asAdmin.get(`/api/admin/users/${adminUser!.id}/detail`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.row.id).toBe(adminUser!.id);
    expect(Array.isArray(detailRes.body.permissions)).toBe(true);
    expect(detailRes.body.permissions.length).toBeGreaterThan(0);
    expect(Array.isArray(detailRes.body.activity)).toBe(true);
    expect(detailRes.body.activity.some((item: any) => item.action === "account_created" || item.action === "login" || item.action === "last_login")).toBe(true);
  });

  it("should create internal invitations and list them in pending invites", async () => {
    const departments = await storage.getDepartments();
    const salesDepartment = departments.find((department) => department.slug === InternalDepartmentSlug.SALES);
    expect(salesDepartment).toBeDefined();

    const roles = await storage.getRoles();
    const salesAgentRole = roles.find(
      (role) =>
        role.departmentId === salesDepartment!.id &&
        role.hierarchyLevel === RoleHierarchyLevel.AGENT,
    );
    expect(salesAgentRole).toBeDefined();

    const email = `internal-invite-${Date.now()}@test.com`;
    const res = await asAdmin.post("/api/admin/invitations").send({
      fullName: "Invitation Test User",
      email,
      departmentId: salesDepartment!.id,
      roleId: salesAgentRole!.id,
      personalMessage: "Join sales team.",
    });

    expect(res.status).toBe(201);
    expect(res.body.row.status).toBe("pending");

    const pendingRes = await asAdmin.get("/api/admin/invitations");
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.some((row: any) => row.email === email && row.status === "pending")).toBe(true);
  });

  it("should accept a public invitation and create an active internal user", async () => {
    const departments = await storage.getDepartments();
    const operationsDepartment = departments.find((department) => department.slug === InternalDepartmentSlug.OPERATIONS);
    expect(operationsDepartment).toBeDefined();

    const roles = await storage.getRoles();
    const operationsOfficerRole = roles.find(
      (role) =>
        role.departmentId === operationsDepartment!.id &&
        role.hierarchyLevel === RoleHierarchyLevel.SPECIALIST,
    );
    expect(operationsOfficerRole).toBeDefined();

    const token = `accept-${Date.now()}`;
    const email = `accepted-invite-${Date.now()}@test.com`;
    const invitation = await storage.createUserInvitation({
      fullName: "Accepted Invite User",
      email,
      departmentId: operationsDepartment!.id,
      roleId: operationsOfficerRole!.id,
      personalMessage: "Assigned to operations.",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: UserInvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      invitedByUserId: null,
      acceptedUserId: null,
    });

    const previewRes = await request.get(`/api/public/invitations/${token}`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.email).toBe(email);

    const acceptRes = await request.post(`/api/public/invitations/${token}/accept`).send({
      password: "AcceptedInvite123!",
    });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    const acceptedUser = await storage.getUserByEmail(email);
    expect(acceptedUser).toBeDefined();
    expect(acceptedUser?.isActive).toBe(true);
    expect(acceptedUser?.userType).toBe("operations");
    expect(acceptedUser?.fullName).toBe("Accepted Invite User");

    const updatedInvitation = await storage.getUserInvitation(invitation.id);
    expect(updatedInvitation?.status).toBe(UserInvitationStatus.ACCEPTED);
    expect(updatedInvitation?.acceptedUserId).toBe(acceptedUser?.id);

    const staffRes = await asAdmin.get("/api/admin/users");
    expect(staffRes.status).toBe(200);
    expect(
      staffRes.body.some(
        (row: any) =>
          row.email === email &&
          row.department?.slug === InternalDepartmentSlug.OPERATIONS &&
          row.role?.name === "Operations Officer",
      ),
    ).toBe(true);
  });
});
