import { and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { logError } from "./logger";
import { notifyUser } from "./operations";
import {
  TaskActivityEventType,
  TaskPriority,
  TaskStatus,
  taskActivityEvents,
  taskAttachments,
  taskComments,
  taskCompletionRecipients,
  tasks,
  users,
  type Task,
  type TaskActivityEvent,
  type TaskActivityEventTypeValue,
  type TaskAttachment,
  type TaskComment,
  type TaskPriorityValue,
  type TaskStatusValue,
  type User,
} from "@shared/schema";

const APP_BASE_URL = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002";

const PRIORITY_RANK: Record<string, number> = {
  [TaskPriority.URGENT]: 0,
  [TaskPriority.HIGH]: 1,
  [TaskPriority.MEDIUM]: 2,
  [TaskPriority.LOW]: 3,
};

const PRIORITY_LABELS: Record<string, string> = {
  [TaskPriority.URGENT]: "Urgent",
  [TaskPriority.HIGH]: "High",
  [TaskPriority.MEDIUM]: "Medium",
  [TaskPriority.LOW]: "Low",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskViewKey =
  | "all"
  | "my"
  | "assigned_by_me"
  | "completed"
  | "overdue";

export type TaskUserRef = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  userType: string;
  isActive: boolean;
};

export type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  deadlineAt: Date | null;
  isOverdue: boolean;
  createdAt: Date;
  completedAt: Date | null;
  lastActivityAt: Date;
  creator: TaskUserRef | null;
  assignee: TaskUserRef | null;
  commentCount: number;
  attachmentCount: number;
  completionRecipientCount: number;
};

export type TaskListResult = {
  items: TaskListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type TaskCommentNode = {
  id: string;
  body: string;
  author: TaskUserRef | null;
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  replies: TaskCommentNode[];
};

export type TaskActivityItem = {
  id: string;
  eventType: TaskActivityEventTypeValue | string;
  title: string;
  description: string | null;
  actor: TaskUserRef | null;
  createdAt: Date;
};

export type TaskCapabilities = {
  canEdit: boolean;
  canComplete: boolean;
  canReopen: boolean;
  canComment: boolean;
};

export type TaskDetail = {
  task: Task & { isOverdue: boolean; creator: TaskUserRef | null; assignee: TaskUserRef | null };
  completionRecipients: TaskUserRef[];
  attachments: TaskAttachment[];
  comments: TaskCommentNode[];
  activity: TaskActivityItem[];
  capabilities: TaskCapabilities;
};

export type TaskSummary = {
  myPending: number;
  dueToday: number;
  overdue: number;
  recentlyCompleted: number;
  allPending: number;
  assignedByMePending: number;
};

export type TaskListFilters = {
  view?: TaskViewKey;
  search?: string;
  assigneeId?: string;
  creatorId?: string;
  status?: TaskStatusValue;
  priority?: TaskPriorityValue;
  deadlinePreset?: "overdue" | "today" | "week" | "none";
  createdFrom?: Date;
  createdTo?: Date;
  page?: number;
  pageSize?: number;
  sort?: "activity" | "deadline" | "created" | "priority";
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  assignedToUserId: string;
  deadlineAt?: Date | null;
  priority?: TaskPriorityValue;
  completionRecipientUserIds?: string[];
  attachments?: Array<{
    objectPath: string;
    fileName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
  }>;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  assignedToUserId?: string;
  deadlineAt?: Date | null;
  priority?: TaskPriorityValue;
  completionRecipientUserIds?: string[];
  attachments?: Array<{
    objectPath: string;
    fileName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INTERNAL_USER_TYPES = ["admin", "operations"] as const;

function toUserRef(user?: Pick<User, "id" | "fullName" | "username" | "email" | "userType" | "isActive"> | null): TaskUserRef | null {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    fullName: user.fullName?.trim() || user.username || user.email,
    username: user.username,
    email: user.email,
    userType: user.userType,
    isActive: user.isActive,
  };
}

function isTaskOverdue(task: Pick<Task, "status" | "deadlineAt">): boolean {
  if (task.status !== TaskStatus.PENDING || !task.deadlineAt) {
    return false;
  }
  return task.deadlineAt.getTime() < Date.now();
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function endOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

async function getUserRefsByIds(userIds: string[]): Promise<Map<string, TaskUserRef>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const rows = await db.select().from(users).where(inArray(users.id, uniqueIds));
  const map = new Map<string, TaskUserRef>();
  for (const row of rows) {
    const ref = toUserRef(row);
    if (ref) {
      map.set(row.id, ref);
    }
  }
  return map;
}

function taskUrlForUser(taskId: string, user?: Pick<User, "userType"> | null): string {
  const shell = user?.userType === "operations" ? "/operations/tasks" : "/admin/tasks";
  return `${APP_BASE_URL}${shell}?taskId=${taskId}`;
}

export async function recordTaskActivity(params: {
  taskId: string;
  actorUserId?: string | null;
  eventType: TaskActivityEventTypeValue;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<TaskActivityEvent> {
  const [event] = await db
    .insert(taskActivityEvents)
    .values({
      taskId: params.taskId,
      actorUserId: params.actorUserId || null,
      eventType: params.eventType,
      title: params.title,
      description: params.description || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
    .returning();
  return event;
}

async function touchTaskActivity(taskId: string): Promise<void> {
  await db
    .update(tasks)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

// Admins can act on any task as a supervisory override (complete / reopen / edit),
// in addition to the per-task creator/assignee rules.
function isAdmin(viewer: User): boolean {
  return viewer.userType === "admin";
}

function buildCapabilities(task: Task, viewer: User): TaskCapabilities {
  const admin = isAdmin(viewer);
  return {
    canEdit: task.createdByUserId === viewer.id || admin,
    canComplete: (task.assignedToUserId === viewer.id || admin) && task.status === TaskStatus.PENDING,
    canReopen: (task.createdByUserId === viewer.id || admin) && task.status === TaskStatus.COMPLETED,
    canComment: true,
  };
}

// ---------------------------------------------------------------------------
// User directory
// ---------------------------------------------------------------------------

export async function getTaskUsers(): Promise<TaskUserRef[]> {
  const rows = await db
    .select()
    .from(users)
    .where(and(inArray(users.userType, INTERNAL_USER_TYPES as unknown as string[]), eq(users.isActive, true)))
    .orderBy(asc(users.fullName), asc(users.username));

  return rows.map((row) => toUserRef(row)!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listTasks(viewer: User, filters: TaskListFilters): Promise<TaskListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 25));
  const conditions = [];

  switch (filters.view) {
    case "my":
      conditions.push(eq(tasks.assignedToUserId, viewer.id));
      break;
    case "assigned_by_me":
      conditions.push(eq(tasks.createdByUserId, viewer.id));
      break;
    case "completed":
      conditions.push(eq(tasks.status, TaskStatus.COMPLETED));
      break;
    case "overdue":
      conditions.push(eq(tasks.status, TaskStatus.PENDING));
      conditions.push(lt(tasks.deadlineAt, new Date()));
      break;
    default:
      break;
  }

  if (filters.status) {
    conditions.push(eq(tasks.status, filters.status));
  }
  if (filters.priority) {
    conditions.push(eq(tasks.priority, filters.priority));
  }
  if (filters.assigneeId) {
    conditions.push(eq(tasks.assignedToUserId, filters.assigneeId));
  }
  if (filters.creatorId) {
    conditions.push(eq(tasks.createdByUserId, filters.creatorId));
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(tasks.title, term), ilike(tasks.description, term)));
  }
  if (filters.createdFrom) {
    conditions.push(gte(tasks.createdAt, filters.createdFrom));
  }
  if (filters.createdTo) {
    conditions.push(lte(tasks.createdAt, filters.createdTo));
  }
  switch (filters.deadlinePreset) {
    case "overdue":
      conditions.push(eq(tasks.status, TaskStatus.PENDING));
      conditions.push(lt(tasks.deadlineAt, new Date()));
      break;
    case "today":
      conditions.push(gte(tasks.deadlineAt, startOfToday()));
      conditions.push(lte(tasks.deadlineAt, endOfToday()));
      break;
    case "week": {
      const weekEnd = new Date(endOfToday().getTime() + 6 * 24 * 60 * 60 * 1000);
      conditions.push(gte(tasks.deadlineAt, startOfToday()));
      conditions.push(lte(tasks.deadlineAt, weekEnd));
      break;
    }
    case "none":
      conditions.push(sql`${tasks.deadlineAt} is null`);
      break;
    default:
      break;
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = (() => {
    switch (filters.sort) {
      case "deadline":
        return [asc(tasks.deadlineAt), desc(tasks.lastActivityAt)];
      case "created":
        return [desc(tasks.createdAt)];
      case "priority":
        return [
          sql`case ${tasks.priority}
            when ${TaskPriority.URGENT} then 0
            when ${TaskPriority.HIGH} then 1
            when ${TaskPriority.MEDIUM} then 2
            else 3 end`,
          desc(tasks.lastActivityAt),
        ];
      default:
        return [desc(tasks.lastActivityAt)];
    }
  })();

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(whereClause);

  const rows = await db
    .select()
    .from(tasks)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const taskIds = rows.map((row) => row.id);
  const userRefs = await getUserRefsByIds(rows.flatMap((row) => [row.createdByUserId, row.assignedToUserId]));

  const commentCounts = new Map<string, number>();
  const attachmentCounts = new Map<string, number>();
  const recipientCounts = new Map<string, number>();

  if (taskIds.length > 0) {
    const [commentRows, attachmentRows, recipientRows] = await Promise.all([
      db
        .select({ taskId: taskComments.taskId, value: count() })
        .from(taskComments)
        .where(and(inArray(taskComments.taskId, taskIds), sql`${taskComments.deletedAt} is null`))
        .groupBy(taskComments.taskId),
      db
        .select({ taskId: taskAttachments.taskId, value: count() })
        .from(taskAttachments)
        .where(inArray(taskAttachments.taskId, taskIds))
        .groupBy(taskAttachments.taskId),
      db
        .select({ taskId: taskCompletionRecipients.taskId, value: count() })
        .from(taskCompletionRecipients)
        .where(inArray(taskCompletionRecipients.taskId, taskIds))
        .groupBy(taskCompletionRecipients.taskId),
    ]);
    for (const row of commentRows) commentCounts.set(row.taskId, Number(row.value));
    for (const row of attachmentRows) attachmentCounts.set(row.taskId, Number(row.value));
    for (const row of recipientRows) recipientCounts.set(row.taskId, Number(row.value));
  }

  const items: TaskListItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status as TaskStatusValue,
    priority: row.priority as TaskPriorityValue,
    deadlineAt: row.deadlineAt,
    isOverdue: isTaskOverdue(row),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    lastActivityAt: row.lastActivityAt,
    creator: userRefs.get(row.createdByUserId) ?? null,
    assignee: userRefs.get(row.assignedToUserId) ?? null,
    commentCount: commentCounts.get(row.id) ?? 0,
    attachmentCount: attachmentCounts.get(row.id) ?? 0,
    completionRecipientCount: recipientCounts.get(row.id) ?? 0,
  }));

  return { items, total: Number(total), page, pageSize };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getTaskById(taskId: string): Promise<Task | null> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return task ?? null;
}

export async function getTaskDetail(taskId: string, viewer: User): Promise<TaskDetail | null> {
  const task = await getTaskById(taskId);
  if (!task) {
    return null;
  }

  const [recipientRows, attachmentRows, commentRows, activityRows] = await Promise.all([
    db
      .select({ user: users })
      .from(taskCompletionRecipients)
      .innerJoin(users, eq(users.id, taskCompletionRecipients.userId))
      .where(eq(taskCompletionRecipients.taskId, taskId)),
    db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.sortOrder), asc(taskAttachments.createdAt)),
    db
      .select()
      .from(taskComments)
      .where(and(eq(taskComments.taskId, taskId), sql`${taskComments.deletedAt} is null`))
      .orderBy(asc(taskComments.createdAt)),
    db
      .select()
      .from(taskActivityEvents)
      .where(eq(taskActivityEvents.taskId, taskId))
      .orderBy(desc(taskActivityEvents.createdAt)),
  ]);

  const refIds = [
    task.createdByUserId,
    task.assignedToUserId,
    ...commentRows.map((row) => row.authorUserId),
    ...activityRows.map((row) => row.actorUserId).filter((value): value is string => Boolean(value)),
  ];
  const userRefs = await getUserRefsByIds(refIds);

  // Threaded comments (one level deep).
  const nodeById = new Map<string, TaskCommentNode>();
  const roots: TaskCommentNode[] = [];
  for (const row of commentRows) {
    nodeById.set(row.id, {
      id: row.id,
      body: row.body,
      author: userRefs.get(row.authorUserId) ?? null,
      parentCommentId: row.parentCommentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      replies: [],
    });
  }
  for (const row of commentRows) {
    const node = nodeById.get(row.id)!;
    if (row.parentCommentId && nodeById.has(row.parentCommentId)) {
      nodeById.get(row.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return {
    task: {
      ...task,
      isOverdue: isTaskOverdue(task),
      creator: userRefs.get(task.createdByUserId) ?? null,
      assignee: userRefs.get(task.assignedToUserId) ?? null,
    },
    completionRecipients: recipientRows.map((row) => toUserRef(row.user)!).filter(Boolean),
    attachments: attachmentRows,
    comments: roots,
    activity: activityRows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      title: row.title,
      description: row.description,
      actor: row.actorUserId ? userRefs.get(row.actorUserId) ?? null : null,
      createdAt: row.createdAt,
    })),
    capabilities: buildCapabilities(task, viewer),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function setCompletionRecipients(taskId: string, userIds: string[]): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await db.delete(taskCompletionRecipients).where(eq(taskCompletionRecipients.taskId, taskId));
  if (unique.length > 0) {
    await db
      .insert(taskCompletionRecipients)
      .values(unique.map((userId) => ({ taskId, userId })))
      .onConflictDoNothing();
  }
}

async function addAttachments(
  taskId: string,
  uploadedByUserId: string,
  attachments: CreateTaskInput["attachments"],
  startSortOrder = 0,
): Promise<TaskAttachment[]> {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  const inserted = await db
    .insert(taskAttachments)
    .values(
      attachments.map((attachment, index) => ({
        taskId,
        objectPath: attachment.objectPath,
        fileName: attachment.fileName,
        contentType: attachment.contentType || null,
        sizeBytes: attachment.sizeBytes ?? null,
        uploadedByUserId,
        sortOrder: startSortOrder + index,
      })),
    )
    .returning();
  return inserted;
}

export async function createTask(viewer: User, input: CreateTaskInput): Promise<Task> {
  const [created] = await db
    .insert(tasks)
    .values({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: TaskStatus.PENDING,
      priority: input.priority || TaskPriority.MEDIUM,
      createdByUserId: viewer.id,
      assignedToUserId: input.assignedToUserId,
      deadlineAt: input.deadlineAt || null,
    })
    .returning();

  await setCompletionRecipients(created.id, input.completionRecipientUserIds || []);
  await addAttachments(created.id, viewer.id, input.attachments);

  await recordTaskActivity({
    taskId: created.id,
    actorUserId: viewer.id,
    eventType: TaskActivityEventType.TASK_CREATED,
    title: "Task created",
    description: `${toUserRef(viewer)?.fullName ?? "Someone"} created this task`,
  });

  // Notify the assignee (unless they assigned it to themselves).
  if (created.assignedToUserId !== viewer.id) {
    try {
      const assignee = await db.select().from(users).where(eq(users.id, created.assignedToUserId)).limit(1);
      await notifyUser({
        userId: created.assignedToUserId,
        title: "New task assigned to you",
        body: `${toUserRef(viewer)?.fullName ?? "A teammate"} assigned you the task "${created.title}".`,
        type: "task",
        entityType: "task",
        entityId: created.id,
        actionUrl: taskUrlForUser(created.id, assignee[0]),
        sendEmail: false,
      });
    } catch (error) {
      logError("Failed to notify task assignee", error);
    }
  }

  return created;
}

export async function updateTask(viewer: User, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
  const existing = await getTaskById(taskId);
  if (!existing) {
    return null;
  }
  if (existing.createdByUserId !== viewer.id && !isAdmin(viewer)) {
    throw new TaskPermissionError("Only the task creator can edit this task");
  }

  const updates: Partial<Task> = { updatedAt: new Date() };
  const activityNotes: Array<{ eventType: TaskActivityEventTypeValue; title: string; description?: string }> = [];
  let newAssigneeId: string | null = null;
  let deadlineChanged = false;

  if (input.title !== undefined && input.title.trim() && input.title.trim() !== existing.title) {
    updates.title = input.title.trim();
  }
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    updates.priority = input.priority;
    activityNotes.push({
      eventType: TaskActivityEventType.PRIORITY_CHANGED,
      title: "Priority changed",
      description: `Priority set to ${PRIORITY_LABELS[input.priority] ?? input.priority}`,
    });
  }
  if (input.assignedToUserId !== undefined && input.assignedToUserId !== existing.assignedToUserId) {
    updates.assignedToUserId = input.assignedToUserId;
    newAssigneeId = input.assignedToUserId;
    activityNotes.push({
      eventType: TaskActivityEventType.ASSIGNMENT_CHANGED,
      title: "Assignment changed",
    });
  }
  if (input.deadlineAt !== undefined) {
    const nextDeadline = input.deadlineAt ? input.deadlineAt.getTime() : null;
    const prevDeadline = existing.deadlineAt ? existing.deadlineAt.getTime() : null;
    if (nextDeadline !== prevDeadline) {
      updates.deadlineAt = input.deadlineAt || null;
      deadlineChanged = true;
      activityNotes.push({
        eventType: TaskActivityEventType.DEADLINE_CHANGED,
        title: "Deadline changed",
        description: input.deadlineAt ? `Deadline set to ${input.deadlineAt.toISOString()}` : "Deadline cleared",
      });
    }
  }

  updates.lastActivityAt = new Date();

  const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, taskId)).returning();

  if (input.completionRecipientUserIds !== undefined) {
    await setCompletionRecipients(taskId, input.completionRecipientUserIds);
  }
  if (input.attachments && input.attachments.length > 0) {
    const [{ value: existingCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId));
    await addAttachments(taskId, viewer.id, input.attachments, Number(existingCount));
    activityNotes.push({ eventType: TaskActivityEventType.ATTACHMENT_ADDED, title: "Attachment added" });
  }

  for (const note of activityNotes) {
    await recordTaskActivity({
      taskId,
      actorUserId: viewer.id,
      eventType: note.eventType,
      title: note.title,
      description: note.description ?? null,
    });
  }

  if (newAssigneeId && newAssigneeId !== viewer.id) {
    try {
      const assignee = await db.select().from(users).where(eq(users.id, newAssigneeId)).limit(1);
      await notifyUser({
        userId: newAssigneeId,
        title: "A task was assigned to you",
        body: `${toUserRef(viewer)?.fullName ?? "A teammate"} assigned you the task "${updated.title}".`,
        type: "task",
        entityType: "task",
        entityId: taskId,
        actionUrl: taskUrlForUser(taskId, assignee[0]),
        sendEmail: false,
      });
    } catch (error) {
      logError("Failed to notify reassigned task user", error);
    }
  }

  if (deadlineChanged && updated.assignedToUserId !== viewer.id) {
    try {
      const assignee = await db.select().from(users).where(eq(users.id, updated.assignedToUserId)).limit(1);
      await notifyUser({
        userId: updated.assignedToUserId,
        title: "Task deadline updated",
        body: `The deadline for "${updated.title}" was updated.`,
        type: "task",
        entityType: "task",
        entityId: taskId,
        actionUrl: taskUrlForUser(taskId, assignee[0]),
        sendEmail: false,
      });
    } catch (error) {
      logError("Failed to notify deadline change", error);
    }
  }

  return updated;
}

export async function completeTask(viewer: User, taskId: string): Promise<Task | null> {
  const existing = await getTaskById(taskId);
  if (!existing) {
    return null;
  }
  if (existing.assignedToUserId !== viewer.id && !isAdmin(viewer)) {
    throw new TaskPermissionError("Only the assignee can complete this task");
  }
  if (existing.status !== TaskStatus.PENDING) {
    throw new TaskStateError("Task is not pending");
  }

  const completedAt = new Date();
  const [updated] = await db
    .update(tasks)
    .set({
      status: TaskStatus.COMPLETED,
      completedAt,
      completedByUserId: viewer.id,
      lastActivityAt: completedAt,
      updatedAt: completedAt,
    })
    .where(eq(tasks.id, taskId))
    .returning();

  const completerName = toUserRef(viewer)?.fullName ?? "The assignee";
  await recordTaskActivity({
    taskId,
    actorUserId: viewer.id,
    eventType: TaskActivityEventType.TASK_COMPLETED,
    title: "Task completed",
    description: `${completerName} marked this task complete`,
  });

  // Notify creator + completion recipients (excluding the actor).
  try {
    const recipientRows = await db
      .select({ userId: taskCompletionRecipients.userId })
      .from(taskCompletionRecipients)
      .where(eq(taskCompletionRecipients.taskId, taskId));
    const recipientIds = new Set<string>([updated.createdByUserId, ...recipientRows.map((row) => row.userId)]);
    recipientIds.delete(viewer.id);

    const recipientUsers = recipientIds.size
      ? await db.select().from(users).where(inArray(users.id, Array.from(recipientIds)))
      : [];
    await Promise.all(
      recipientUsers.map((recipient) =>
        notifyUser({
          userId: recipient.id,
          title: "Task completed",
          body: `${completerName} completed "${updated.title}" on ${completedAt.toLocaleString()}.`,
          type: "task",
          entityType: "task",
          entityId: taskId,
          actionUrl: taskUrlForUser(taskId, recipient),
          sendEmail: false,
        }),
      ),
    );
  } catch (error) {
    logError("Failed to notify task completion recipients", error);
  }

  return updated;
}

export async function reopenTask(viewer: User, taskId: string): Promise<Task | null> {
  const existing = await getTaskById(taskId);
  if (!existing) {
    return null;
  }
  if (existing.createdByUserId !== viewer.id && !isAdmin(viewer)) {
    throw new TaskPermissionError("Only the task creator can reopen this task");
  }
  if (existing.status !== TaskStatus.COMPLETED) {
    throw new TaskStateError("Task is not completed");
  }

  const reopenedAt = new Date();
  const [updated] = await db
    .update(tasks)
    .set({
      status: TaskStatus.PENDING,
      reopenedAt,
      reopenedByUserId: viewer.id,
      completedAt: null,
      completedByUserId: null,
      lastActivityAt: reopenedAt,
      updatedAt: reopenedAt,
    })
    .where(eq(tasks.id, taskId))
    .returning();

  await recordTaskActivity({
    taskId,
    actorUserId: viewer.id,
    eventType: TaskActivityEventType.TASK_REOPENED,
    title: "Task reopened",
    description: `${toUserRef(viewer)?.fullName ?? "The creator"} reopened this task`,
  });

  if (updated.assignedToUserId !== viewer.id) {
    try {
      const assignee = await db.select().from(users).where(eq(users.id, updated.assignedToUserId)).limit(1);
      await notifyUser({
        userId: updated.assignedToUserId,
        title: "Task reopened",
        body: `"${updated.title}" was reopened and needs your attention again.`,
        type: "task",
        entityType: "task",
        entityId: taskId,
        actionUrl: taskUrlForUser(taskId, assignee[0]),
        sendEmail: false,
      });
    } catch (error) {
      logError("Failed to notify task reopen", error);
    }
  }

  return updated;
}

export async function addTaskComment(
  viewer: User,
  taskId: string,
  body: string,
  parentCommentId?: string | null,
): Promise<TaskComment | null> {
  const existing = await getTaskById(taskId);
  if (!existing) {
    return null;
  }

  let resolvedParentId: string | null = null;
  if (parentCommentId) {
    const [parent] = await db
      .select()
      .from(taskComments)
      .where(and(eq(taskComments.id, parentCommentId), eq(taskComments.taskId, taskId)))
      .limit(1);
    if (parent) {
      // Keep threads one level deep: replies to replies attach to the top-level parent.
      resolvedParentId = parent.parentCommentId || parent.id;
    }
  }

  const [comment] = await db
    .insert(taskComments)
    .values({
      taskId,
      authorUserId: viewer.id,
      parentCommentId: resolvedParentId,
      body: body.trim(),
    })
    .returning();

  await recordTaskActivity({
    taskId,
    actorUserId: viewer.id,
    eventType: TaskActivityEventType.COMMENT_ADDED,
    title: "Comment added",
    description: `${toUserRef(viewer)?.fullName ?? "Someone"} commented`,
  });
  await touchTaskActivity(taskId);

  return comment;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getTaskSummary(viewer: User): Promise<TaskSummary> {
  const now = new Date();
  const recentThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    myPending,
    dueToday,
    overdue,
    recentlyCompleted,
    allPending,
    assignedByMePending,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.assignedToUserId, viewer.id), eq(tasks.status, TaskStatus.PENDING))),
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedToUserId, viewer.id),
          eq(tasks.status, TaskStatus.PENDING),
          gte(tasks.deadlineAt, startOfToday()),
          lte(tasks.deadlineAt, endOfToday()),
        ),
      ),
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.assignedToUserId, viewer.id), eq(tasks.status, TaskStatus.PENDING), lt(tasks.deadlineAt, now))),
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.status, TaskStatus.COMPLETED), gte(tasks.completedAt, recentThreshold))),
    db.select({ value: count() }).from(tasks).where(eq(tasks.status, TaskStatus.PENDING)),
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.createdByUserId, viewer.id), eq(tasks.status, TaskStatus.PENDING))),
  ]);

  return {
    myPending: Number(myPending[0]?.value ?? 0),
    dueToday: Number(dueToday[0]?.value ?? 0),
    overdue: Number(overdue[0]?.value ?? 0),
    recentlyCompleted: Number(recentlyCompleted[0]?.value ?? 0),
    allPending: Number(allPending[0]?.value ?? 0),
    assignedByMePending: Number(assignedByMePending[0]?.value ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TaskPermissionError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "TaskPermissionError";
  }
}

export class TaskStateError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "TaskStateError";
  }
}
