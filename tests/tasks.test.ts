import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { OPERATION_ROLE_NAMES, ensureOperationProfile } from "../server/services/operations";
import type { User } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

const TEST_PASSWORD = "TasksTest123!";

const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);

async function loginAndGetCookies(username: string, password = TEST_PASSWORD): Promise<string[]> {
  const res = await request.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return res.headers["set-cookie"] || [];
}

async function createOperationsUser(level: keyof typeof OPERATION_ROLE_NAMES = "agent"): Promise<User> {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const role = (await storage.getRoles()).find((candidate) => candidate.name === OPERATION_ROLE_NAMES[level]);
  if (!role) {
    throw new Error(`Missing operations role: ${OPERATION_ROLE_NAMES[level]}`);
  }
  const user = await storage.createUser({
    username: `tasks_ops_${unique}`,
    email: `tasks_ops_${unique}@test.com`,
    fullName: `Ops User ${unique}`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "operations",
    isActive: true,
    mustChangePassword: false,
  });
  await storage.assignUserRole({ userId: user.id, roleId: role.id });
  await ensureOperationProfile(user.id, level);
  return user;
}

async function createClientUser(): Promise<User> {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `Tasks Client ${unique}`,
    email: `tasks_client_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "Tasks Client Co",
    isActive: true,
  });
  return storage.createUser({
    username: `tasks_client_${unique}`,
    email: `tasks_client_user_${unique}@test.com`,
    fullName: `Client User ${unique}`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });
}

async function createTask(cookies: string[], body: Record<string, unknown>) {
  const res = await withCookies(request.post("/api/tasks"), cookies).send(body);
  return res;
}

let creator: User;
let assignee: User;
let creatorCookies: string[];
let assigneeCookies: string[];
let adminCookies: string[];
let adminUserId: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const admin = await storage.getUserByUsername("admin");
  adminUserId = admin!.id;
  adminCookies = await loginAndGetCookies("admin", "admin123");

  creator = await createOperationsUser();
  assignee = await createOperationsUser();
  creatorCookies = await loginAndGetCookies(creator.username);
  assigneeCookies = await loginAndGetCookies(assignee.username);
}, 30000);

afterAll(() => {
  server.close();
});

describe("Tasks API", () => {
  it("rejects client sessions from task endpoints", async () => {
    const clientUser = await createClientUser();
    const clientCookies = await loginAndGetCookies(clientUser.username);
    const res = await withCookies(request.get("/api/tasks"), clientCookies);
    expect(res.status).toBe(403);
  });

  it("lets an internal user create, assign, and list a task", async () => {
    const created = await createTask(creatorCookies, {
      title: "Coordinate carrier pickup",
      description: "Call the carrier",
      assignedToUserId: assignee.id,
      priority: "HIGH",
    });
    expect(created.status).toBe(201);
    expect(created.body.task.title).toBe("Coordinate carrier pickup");
    expect(created.body.task.assignee.id).toBe(assignee.id);
    expect(created.body.capabilities.canEdit).toBe(true);

    const listed = await withCookies(request.get("/api/tasks?view=my"), assigneeCookies);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((item: any) => item.id === created.body.task.id)).toBe(true);
  });

  it("allows only the assignee to complete and only the creator to reopen", async () => {
    const created = await createTask(creatorCookies, {
      title: "Complete me",
      assignedToUserId: assignee.id,
    });
    const taskId = created.body.task.id;

    const creatorComplete = await withCookies(request.post(`/api/tasks/${taskId}/complete`), creatorCookies);
    expect(creatorComplete.status).toBe(403);

    const assigneeComplete = await withCookies(request.post(`/api/tasks/${taskId}/complete`), assigneeCookies);
    expect(assigneeComplete.status).toBe(200);
    expect(assigneeComplete.body.task.status).toBe("COMPLETED");

    const assigneeReopen = await withCookies(request.post(`/api/tasks/${taskId}/reopen`), assigneeCookies);
    expect(assigneeReopen.status).toBe(403);

    const creatorReopen = await withCookies(request.post(`/api/tasks/${taskId}/reopen`), creatorCookies);
    expect(creatorReopen.status).toBe(200);
    expect(creatorReopen.body.task.status).toBe("PENDING");
  });

  it("allows only the creator to edit core fields", async () => {
    const created = await createTask(creatorCookies, {
      title: "Editable task",
      assignedToUserId: assignee.id,
    });
    const taskId = created.body.task.id;

    const assigneeEdit = await withCookies(request.patch(`/api/tasks/${taskId}`), assigneeCookies).send({
      title: "Hacked title",
    });
    expect(assigneeEdit.status).toBe(403);

    const creatorEdit = await withCookies(request.patch(`/api/tasks/${taskId}`), creatorCookies).send({
      title: "Updated title",
      priority: "URGENT",
    });
    expect(creatorEdit.status).toBe(200);
    expect(creatorEdit.body.task.title).toBe("Updated title");
    expect(creatorEdit.body.task.priority).toBe("URGENT");
  });

  it("lets an admin complete and reopen any task as an override", async () => {
    const created = await createTask(creatorCookies, {
      title: "Admin override",
      assignedToUserId: assignee.id,
    });
    const taskId = created.body.task.id;

    const detail = await withCookies(request.get(`/api/tasks/${taskId}`), adminCookies);
    expect(detail.status).toBe(200);
    expect(detail.body.capabilities.canComplete).toBe(true);

    const adminComplete = await withCookies(request.post(`/api/tasks/${taskId}/complete`), adminCookies);
    expect(adminComplete.status).toBe(200);
    expect(adminComplete.body.task.status).toBe("COMPLETED");

    const adminReopen = await withCookies(request.post(`/api/tasks/${taskId}/reopen`), adminCookies);
    expect(adminReopen.status).toBe(200);
    expect(adminReopen.body.task.status).toBe("PENDING");
  });

  it("persists completion recipients", async () => {
    const created = await createTask(creatorCookies, {
      title: "With recipients",
      assignedToUserId: assignee.id,
      completionRecipientUserIds: [adminUserId],
    });
    expect(created.status).toBe(201);
    expect(created.body.completionRecipients.map((r: any) => r.id)).toContain(adminUserId);
  });

  it("records comments and activity events", async () => {
    const created = await createTask(creatorCookies, {
      title: "Discussable task",
      assignedToUserId: assignee.id,
    });
    const taskId = created.body.task.id;

    const comment = await withCookies(request.post(`/api/tasks/${taskId}/comments`), assigneeCookies).send({
      body: "On it!",
    });
    expect(comment.status).toBe(201);
    expect(comment.body.comments.length).toBe(1);
    expect(comment.body.comments[0].body).toBe("On it!");
    expect(comment.body.activity.some((event: any) => event.eventType === "comment_added")).toBe(true);
    expect(comment.body.activity.some((event: any) => event.eventType === "task_created")).toBe(true);
  });

  it("returns summary counters and an internal user directory", async () => {
    await createTask(creatorCookies, { title: "Summary task", assignedToUserId: assignee.id });

    const summary = await withCookies(request.get("/api/tasks/summary"), assigneeCookies);
    expect(summary.status).toBe(200);
    expect(summary.body.myPending).toBeGreaterThanOrEqual(1);
    expect(typeof summary.body.allPending).toBe("number");

    const users = await withCookies(request.get("/api/tasks/users"), creatorCookies);
    expect(users.status).toBe(200);
    expect(users.body.some((u: any) => u.id === assignee.id)).toBe(true);
    expect(users.body.every((u: any) => u.userType === "admin" || u.userType === "operations")).toBe(true);
  });
});
