import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { sendEmail } from "./email";
import { getRenderedTemplate } from "./email-templates";
import { logError, logInfo } from "./logger";
import {
  clientAccounts,
  notifications,
  operationProfiles,
  OperationAssignmentStatus,
  OperationAttentionStatus,
  OperationEventAudience,
  InvoiceType,
  OperationNoteVisibility,
  OperationShipmentKind,
  OperationSpecialHandlingStatus,
  OperationTaskStatus,
  rolePermissions,
  roles,
  shipmentAssignments,
  shipmentAttentionFlags,
  shipmentOperationEvents,
  shipmentOperationNoteMentions,
  shipmentOperationNotes,
  shipmentOperationTasks,
  shipmentSpecialHandling,
  shipments,
  users,
  userRoles,
  type ClientAccount,
  type Notification,
  type OperationShipmentKindValue,
  type Shipment,
  type ShipmentAssignment,
  type ShipmentAttentionFlag,
  type ShipmentOperationEvent,
  type ShipmentOperationNote,
  type ShipmentOperationTask,
  type ShipmentSpecialHandling,
  type User,
} from "@shared/schema";

export const OPERATION_ROLE_NAMES = {
  manager: "Operations Manager",
  teamLead: "Operations Team Lead",
  specialist: "Operations Officer",
  agent: "Operations Agent",
} as const;

export const OPERATION_PERMISSION_NAMES = [
  "operations:read",
  "operations:update",
  "operations:assign",
  "operations:message-client",
  "operations:financial-breakdown",
  "operations:special-handling",
  "operations:attention",
  "notifications:read",
  "notifications:update",
] as const;

const TERMINAL_SHIPMENT_STATUSES = new Set(["delivered", "cancelled"]);
const OPERATION_ACTIVE_PAYMENT_STATUSES = new Set(["paid", "unpaid"]);
const APP_BASE_URL = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3002";
const DDP_PLANNING_TASK_KEYS = ["ddp_review_order", "ddp_contact_supplier", "ddp_schedule_pickup"] as const;
const DDP_WAREHOUSE_TASK_KEYS = ["ddp_received_warehouse", "ddp_quality_check", "ddp_photos_uploaded"] as const;
const DDP_SHIPPING_TASK_KEYS = [
  "ddp_origin_warehouse_received",
  "ddp_origin_customs_cleared",
  "ddp_departed_origin",
  "ddp_in_transit",
  "ddp_arrived_destination",
  "ddp_destination_customs_cleared",
  "ddp_last_mile_delivery",
] as const;
const DDP_DELIVERY_TASK_KEYS = ["ddp_delivery_confirmation"] as const;
const QC_ATTENTION_ISSUE_TYPE = "qc_exception";

const QC_PACKAGING_STATUS_LABELS: Record<string, string> = {
  sealed_good: "Sealed and good",
  repacked: "Repacked",
  damaged: "Damaged",
};

const QC_QUANTITY_STATUS_LABELS: Record<string, string> = {
  matched: "Matched",
  mismatch: "Mismatch found",
};

const QC_DAMAGE_STATUS_LABELS: Record<string, string> = {
  clear: "Clear",
  minor: "Minor damage",
  major: "Major damage",
};

const QC_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  complete: "Complete",
  missing: "Missing",
  correction_needed: "Needs correction",
};

type UserWithOperationProfile = User & {
  operationProfile?: typeof operationProfiles.$inferSelect | null;
};

type OperationViewerScope = "agent" | "lead" | "manager" | "admin";

export type OperationShipmentSummary = {
  id: string;
  trackingNumber: string;
  clientAccountId: string;
  clientName: string;
  shipmentKind: OperationShipmentKindValue;
  ddpCurrentStage: number | null;
  status: string;
  carrierStatus: string | null;
  paymentStatus: string | null;
  carrierCode: string | null;
  carrierName: string | null;
  carrierTrackingNumber: string | null;
  finalPrice: string;
  currency: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedAt: Date | null;
  assignedTeam: OperationAssignedTeamMember[];
  specialHandlingPriority: string | null;
  specialHandling: (ShipmentSpecialHandling & { assignedToName: string | null }) | null;
  attentionFlags: ShipmentAttentionFlag[];
  attentionCount: number;
  sender: {
    name: string;
    city: string;
    country: string;
    phone: string;
    address: string;
  };
  recipient: {
    name: string;
    city: string;
    country: string;
    phone: string;
    address: string;
  };
  serviceType: string | null;
  estimatedDelivery: Date | null;
  actualDelivery: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OperationShipmentDetail = OperationShipmentSummary & {
  operationEvents: ShipmentOperationEvent[];
  operationTasks: ShipmentOperationTask[];
  operationNotes: Array<ShipmentOperationNote & { authorName: string | null }>;
  ddpChargeConfig?: {
    billingUnit: "KG" | "CBM";
    chargeLabel: string;
    currentBillableQuantity: string;
    currentRawQuantity: string;
    currentMeasuredQuantity: string;
    currentRatePerUnitSar: string;
    extraWeightQuantity: string;
    extraWeightAmountSar: string;
    extraCostAmountSar: string;
    customChargesAmountSar: string;
    totalAdjustmentsAmountSar: string;
  };
  financialBreakdown?: {
    baseRate: string;
    marginAmount: string | null;
    finalPrice: string;
    costAmountSar: string | null;
    sellSubtotalAmountSar: string | null;
    sellTaxAmountSar: string | null;
    clientTotalAmountSar: string | null;
    systemCostTotalAmountSar: string | null;
    revenueExcludingTaxAmountSar: string | null;
  };
};

export type OperationAssignedTeamMember = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  level: string | null;
  assignedAt: Date | null;
  isPrimary: boolean;
};

export class OperationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationInputError";
  }
}

export function getOperationShipmentKind(shipment: Shipment): OperationShipmentKindValue | null {
  if (shipment.fulfillmentType === "ddp_manual" || shipment.isDdp || shipment.carrierCode === "DDP") {
    return OperationShipmentKind.DDP;
  }

  if (shipment.carrierCode || shipment.carrierName || shipment.carrierTrackingNumber) {
    return OperationShipmentKind.EXPRESS;
  }

  return null;
}

export function isOperationsEligibleShipment(shipment: Shipment): boolean {
  if (TERMINAL_SHIPMENT_STATUSES.has(shipment.status)) {
    return false;
  }

  if (!OPERATION_ACTIVE_PAYMENT_STATUSES.has(shipment.paymentStatus || "")) {
    return false;
  }

  return getOperationShipmentKind(shipment) !== null;
}

export async function getUserPermissionNames(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name, permissionName: rolePermissions.permissionId })
    .from(userRoles)
    .innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.isActive, true)))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  if (rows.length === 0) {
    return [];
  }

  const rolePermissionIds = rows.map((row) => row.permissionName);
  const allPermissions = await storage.getPermissions();
  const permissionById = new Map(allPermissions.map((permission) => [permission.id, permission.name]));
  return Array.from(new Set(rolePermissionIds.map((id) => permissionById.get(id)).filter(Boolean) as string[])).sort();
}

export async function getOperationRoleNames(userId: string): Promise<string[]> {
  const assignedRoles = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.isActive, true)))
    .where(eq(userRoles.userId, userId));

  return assignedRoles.map((role) => role.name);
}

function getOperationDisplayName(user?: Pick<User, "username" | "email"> | null): string {
  return user?.username || user?.email || "Operations user";
}

function parseNumericValue(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumericValue(value: number, precision = 2): string {
  return parseNumericValue(value).toFixed(precision);
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getTaskMetadata(task: Pick<ShipmentOperationTask, "metadata">): Record<string, unknown> {
  return parseJsonObject(task.metadata) || {};
}

function isTaskCompleted(task?: Pick<ShipmentOperationTask, "status"> | null): boolean {
  return task?.status === OperationTaskStatus.COMPLETED;
}

function getTaskByKey(tasks: ShipmentOperationTask[], taskKey: string): ShipmentOperationTask | undefined {
  return tasks.find((task) => task.taskKey === taskKey);
}

function ensureWarehouseCheckpointPayload(task: ShipmentOperationTask, tasks: ShipmentOperationTask[], metadata: Record<string, unknown>) {
  if (task.taskKey === "ddp_received_warehouse") {
    const receiptDate = typeof metadata.receiptDate === "string" ? metadata.receiptDate.trim() : "";
    const receivedPieces = Number(metadata.receivedPieces);

    if (!receiptDate) {
      throw new OperationInputError("Receipt date is required before completing the warehouse receipt checkpoint.");
    }
    if (!Number.isFinite(receivedPieces) || receivedPieces <= 0) {
      throw new OperationInputError("Received pieces must be greater than zero.");
    }
    return;
  }

  if (task.taskKey === "ddp_quality_check") {
    if (!isTaskCompleted(getTaskByKey(tasks, "ddp_received_warehouse"))) {
      throw new OperationInputError("Complete the warehouse receipt checkpoint first.");
    }

    const requiredSelectFields = [
      ["packagingStatus", "Packaging status"],
      ["quantityStatus", "Quantity check"],
      ["damageStatus", "Damage check"],
      ["documentsStatus", "Documents check"],
    ] as const;

    for (const [field, label] of requiredSelectFields) {
      const value = typeof metadata[field] === "string" ? metadata[field].trim() : "";
      if (!value) {
        throw new OperationInputError(`${label} is required before completing the QC checkpoint.`);
      }
    }
    return;
  }

  if (task.taskKey === "ddp_photos_uploaded") {
    if (!isTaskCompleted(getTaskByKey(tasks, "ddp_quality_check"))) {
      throw new OperationInputError("Complete the QC checkpoint first.");
    }

    const photos = Array.isArray(metadata.photos) ? metadata.photos : [];
    if (photos.length === 0) {
      throw new OperationInputError("Upload at least one warehouse condition photo before completing this checkpoint.");
    }
  }
}

function ensureDeliveryPodPayload(task: ShipmentOperationTask, metadata: Record<string, unknown>) {
  if (task.taskKey !== "ddp_delivery_confirmation") return;

  const photos = Array.isArray(metadata.photos) ? metadata.photos : [];
  if (photos.length === 0) {
    throw new OperationInputError("Upload at least one POD photo before completing the delivery checkpoint");
  }
}

function ensureShippingCheckpointPayload(task: ShipmentOperationTask, tasks: ShipmentOperationTask[], shipment?: Pick<Shipment, "status"> | null) {
  if (!DDP_SHIPPING_TASK_KEYS.includes(task.taskKey as (typeof DDP_SHIPPING_TASK_KEYS)[number])) {
    return;
  }

  const currentStage = getRawDdpStageFromStatus(shipment?.status);
  if (currentStage < 4) {
    throw new OperationInputError("Move the shipment to Shipping first before completing shipping checkpoints.");
  }

  const currentIndex = DDP_SHIPPING_TASK_KEYS.findIndex((taskKey) => taskKey === task.taskKey);
  if (currentIndex <= 0) {
    return;
  }

  const previousTaskKey = DDP_SHIPPING_TASK_KEYS[currentIndex - 1];
  if (!isTaskCompleted(getTaskByKey(tasks, previousTaskKey))) {
    throw new OperationInputError("Complete the previous shipping checkpoint first.");
  }
}

type DdpQcStatusSnapshot = {
  packagingStatus: string;
  quantityStatus: string;
  damageStatus: string;
  documentsStatus: string;
  qcNotes: string | null;
};

type DdpQcTriggeredIssue = {
  code: string;
  label: string;
};

function buildDdpQcStatusSnapshot(metadata: Record<string, unknown>): DdpQcStatusSnapshot {
  const readValue = (key: string) => (typeof metadata[key] === "string" ? metadata[key].trim() : "");

  return {
    packagingStatus: readValue("packagingStatus"),
    quantityStatus: readValue("quantityStatus"),
    damageStatus: readValue("damageStatus"),
    documentsStatus: readValue("documentsStatus"),
    qcNotes: readValue("qcNotes") || null,
  };
}

function getDdpQcTriggeredIssues(snapshot: DdpQcStatusSnapshot): DdpQcTriggeredIssue[] {
  const issues: DdpQcTriggeredIssue[] = [];

  if (snapshot.packagingStatus === "damaged") {
    issues.push({ code: "packaging_damaged", label: "Packaging damaged" });
  }
  if (snapshot.quantityStatus === "mismatch") {
    issues.push({ code: "quantity_mismatch", label: "Quantity mismatch found" });
  }
  if (snapshot.damageStatus === "minor") {
    issues.push({ code: "minor_damage", label: "Minor damage reported" });
  }
  if (snapshot.damageStatus === "major") {
    issues.push({ code: "major_damage", label: "Major damage reported" });
  }
  if (snapshot.documentsStatus === "missing") {
    issues.push({ code: "documents_missing", label: "Documents missing" });
  }
  if (snapshot.documentsStatus === "correction_needed") {
    issues.push({ code: "documents_need_correction", label: "Documents need correction" });
  }

  return issues;
}

function buildDdpQcAttentionPayload(metadata: Record<string, unknown>) {
  const snapshot = buildDdpQcStatusSnapshot(metadata);
  const triggeredIssues = getDdpQcTriggeredIssues(snapshot);
  if (triggeredIssues.length === 0) {
    return null;
  }

  const severity =
    snapshot.packagingStatus === "damaged" || snapshot.damageStatus === "major"
      ? "high"
      : "medium";

  const statusSummary = [
    `Packaging: ${QC_PACKAGING_STATUS_LABELS[snapshot.packagingStatus] || snapshot.packagingStatus || "Unknown"}`,
    `Quantity: ${QC_QUANTITY_STATUS_LABELS[snapshot.quantityStatus] || snapshot.quantityStatus || "Unknown"}`,
    `Damage: ${QC_DAMAGE_STATUS_LABELS[snapshot.damageStatus] || snapshot.damageStatus || "Unknown"}`,
    `Documents: ${QC_DOCUMENT_STATUS_LABELS[snapshot.documentsStatus] || snapshot.documentsStatus || "Unknown"}`,
  ].join("; ");

  const issueSummary = triggeredIssues.map((issue) => issue.label).join("; ");
  const notesSummary = snapshot.qcNotes ? ` Notes: ${snapshot.qcNotes}` : "";

  return {
    severity,
    details: `QC issue detected. ${statusSummary}. Triggered issues: ${issueSummary}.${notesSummary}`,
    metadata: {
      source: "ddp_quality_check",
      qcStatuses: snapshot,
      triggeredIssues,
    },
  };
}

function summarizeAssignedTeam(team: OperationAssignedTeamMember[]): string | null {
  if (team.length === 0) {
    return null;
  }
  if (team.length === 1) {
    return team[0].displayName;
  }
  if (team.length === 2) {
    return `${team[0].displayName}, ${team[1].displayName}`;
  }
  return `${team[0].displayName} +${team.length - 1}`;
}

export async function getOperationViewerScope(user: User): Promise<OperationViewerScope> {
  if (user.userType === "admin") {
    return "admin";
  }

  const roleNames = await getOperationRoleNames(user.id);
  if (roleNames.includes(OPERATION_ROLE_NAMES.manager)) return "manager";
  if (roleNames.includes(OPERATION_ROLE_NAMES.teamLead)) return "lead";
  return "agent";
}

export async function canViewOperationFinancialBreakdown(user: User): Promise<boolean> {
  if (user.userType !== "admin") {
    return false;
  }

  const permissionNames = await getUserPermissionNames(user.id);
  return permissionNames.includes("operations:financial-breakdown");
}

export async function ensureOperationProfile(userId: string, level = "agent"): Promise<void> {
  const normalizedLevel = level === "lead" ? "team_lead" : level;
  const canReceiveAssignments = normalizedLevel === "agent" || normalizedLevel === "specialist";

  await db
    .insert(operationProfiles)
    .values({
      userId,
      level: normalizedLevel,
      canReceiveAssignments,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: operationProfiles.userId,
      set: {
        level: normalizedLevel,
        canReceiveAssignments,
        updatedAt: new Date(),
      },
    });
}

async function getAssignableOperationsUsers(): Promise<UserWithOperationProfile[]> {
  const rows = await db
    .select({ user: users, profile: operationProfiles })
    .from(users)
    .leftJoin(operationProfiles, eq(operationProfiles.userId, users.id))
    .where(
      and(
        eq(users.userType, "operations"),
        eq(users.isActive, true),
        or(isNull(operationProfiles.id), eq(operationProfiles.isActive, true)),
        or(isNull(operationProfiles.id), eq(operationProfiles.canReceiveAssignments, true)),
      ),
    );

  const agents = rows.filter((row) => {
    const level = row.profile?.level || "agent";
    return level === "agent" || level === "specialist";
  });
  const selectedRows = agents.length > 0 ? agents : rows;
  return selectedRows.map((row) => ({ ...row.user, operationProfile: row.profile }));
}

async function getActiveAssignmentCounts(kind: OperationShipmentKindValue): Promise<Map<string, number>> {
  const rows = await db
    .select({
      assignedToUserId: shipmentAssignments.assignedToUserId,
      assignmentCount: count(shipmentAssignments.id),
    })
    .from(shipmentAssignments)
    .where(
      and(
        eq(shipmentAssignments.status, OperationAssignmentStatus.ACTIVE),
        eq(shipmentAssignments.shipmentKind, kind),
      ),
    )
    .groupBy(shipmentAssignments.assignedToUserId);

  return new Map(rows.map((row) => [row.assignedToUserId, Number(row.assignmentCount || 0)]));
}

async function pickLeastLoadedOperationsUser(kind: OperationShipmentKindValue): Promise<UserWithOperationProfile | null> {
  const eligibleUsers = await getAssignableOperationsUsers();
  if (eligibleUsers.length === 0) {
    return null;
  }

  const counts = await getActiveAssignmentCounts(kind);
  return [...eligibleUsers].sort((a, b) => {
    const countDiff = (counts.get(a.id) || 0) - (counts.get(b.id) || 0);
    if (countDiff !== 0) return countDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

function getDefaultTasksForShipment(shipment: Shipment): Array<{
  taskKey: string;
  stageKey: string;
  title: string;
  description?: string;
}> {
  if (getOperationShipmentKind(shipment) === OperationShipmentKind.DDP) {
    return [
      { taskKey: "ddp_review_order", stageKey: "planning", title: "Review & confirm order details", description: "Verify shipment info and origin" },
      { taskKey: "ddp_contact_supplier", stageKey: "planning", title: "Contact supplier via WhatsApp", description: "Confirm goods are ready" },
      { taskKey: "ddp_schedule_pickup", stageKey: "planning", title: "Schedule pickup (if requested)", description: "Coordinate pickup date and address" },
      { taskKey: "ddp_received_warehouse", stageKey: "warehouse", title: "Shipment received at warehouse", description: "Log receipt date and pieces" },
      { taskKey: "ddp_quality_check", stageKey: "warehouse", title: "QC completed", description: "Packaging, quantity, damage, documents" },
      { taskKey: "ddp_photos_uploaded", stageKey: "warehouse", title: "Photos uploaded", description: "Warehouse condition photos" },
      { taskKey: "ddp_actual_weight", stageKey: "billing", title: "Enter weight & invoice", description: "Review measured quantity and generate the invoice" },
      { taskKey: "ddp_payment_followup", stageKey: "billing", title: "Confirm payment status" },
      { taskKey: "ddp_origin_warehouse_received", stageKey: "shipping", title: "Received at origin warehouse" },
      { taskKey: "ddp_origin_customs_cleared", stageKey: "shipping", title: "Customs clearance - origin" },
      { taskKey: "ddp_departed_origin", stageKey: "shipping", title: "Departed origin" },
      { taskKey: "ddp_in_transit", stageKey: "shipping", title: "In transit" },
      { taskKey: "ddp_arrived_destination", stageKey: "shipping", title: "Arrived destination" },
      { taskKey: "ddp_destination_customs_cleared", stageKey: "shipping", title: "Customs clearance - destination" },
      { taskKey: "ddp_last_mile_delivery", stageKey: "shipping", title: "Last-mile delivery" },
      { taskKey: "ddp_delivery_confirmation", stageKey: "delivery", title: "Upload photo / POD", description: "Upload proof of delivery photos or signed POD files" },
    ];
  }

  return [
    { taskKey: "express_review_booking", stageKey: "received", title: "Review carrier booking" },
    { taskKey: "express_monitor_pickup", stageKey: "pickup", title: "Monitor pickup" },
    { taskKey: "express_monitor_transit", stageKey: "transit", title: "Monitor carrier transit updates" },
    { taskKey: "express_customs_watch", stageKey: "customs", title: "Watch customs exceptions" },
    { taskKey: "express_delivery_followup", stageKey: "delivery", title: "Confirm delivery" },
  ];
}

function getRawDdpStageFromStatus(status?: string | null): number {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "delivered" || normalizedStatus === "out_for_delivery") {
    return 5;
  }
  if (["in_transit", "customs_clearance"].includes(normalizedStatus)) {
    return 4;
  }
  if (["awaiting_payment", "payment_pending"].includes(normalizedStatus)) {
    return 3;
  }
  if (["processing", "supplier_pickup"].includes(normalizedStatus)) {
    return 2;
  }
  return 1;
}

function areAllTaskKeysCompleted(
  tasks: Array<Pick<ShipmentOperationTask, "taskKey" | "status">>,
  taskKeys: readonly string[],
): boolean {
  if (tasks.length === 0) {
    return false;
  }

  return taskKeys.every((taskKey) =>
    tasks.some((task) => task.taskKey === taskKey && task.status === OperationTaskStatus.COMPLETED),
  );
}

export function getDdpEffectiveStage(
  shipment: Pick<Shipment, "status" | "paymentStatus">,
  tasks: Array<Pick<ShipmentOperationTask, "taskKey" | "status">>,
): number {
  const rawStage = getRawDdpStageFromStatus(shipment.status);
  if (tasks.length === 0) {
    return rawStage;
  }

  const planningComplete = areAllTaskKeysCompleted(tasks, DDP_PLANNING_TASK_KEYS);
  const warehouseComplete = areAllTaskKeysCompleted(tasks, DDP_WAREHOUSE_TASK_KEYS);

  let maxAllowedStage = 1;
  if (planningComplete) {
    maxAllowedStage = 2;
  }
  if (maxAllowedStage >= 2 && warehouseComplete) {
    maxAllowedStage = 3;
  }
  if (maxAllowedStage >= 3 && shipment.paymentStatus === "paid") {
    maxAllowedStage = 4;
  }
  if (maxAllowedStage >= 4 && areAllTaskKeysCompleted(tasks, DDP_SHIPPING_TASK_KEYS) && rawStage >= 5) {
    maxAllowedStage = 5;
  }

  return Math.min(rawStage, maxAllowedStage);
}

export function validateDdpStageTransition(params: {
  shipment: Pick<Shipment, "status" | "paymentStatus">;
  tasks: Array<Pick<ShipmentOperationTask, "taskKey" | "status">>;
  nextStatus: string;
}): string | null {
  if (params.nextStatus === "delivered" && !areAllTaskKeysCompleted(params.tasks, DDP_DELIVERY_TASK_KEYS)) {
    return "Upload POD before marking this shipment as delivered.";
  }

  const currentStage = getDdpEffectiveStage(params.shipment, params.tasks);
  const targetStage = getRawDdpStageFromStatus(params.nextStatus);

  if (targetStage <= currentStage) {
    return null;
  }

  if (targetStage > currentStage + 1) {
    return `Complete Stage ${currentStage} before moving this shipment to Stage ${targetStage}.`;
  }

  if (targetStage >= 2 && !areAllTaskKeysCompleted(params.tasks, DDP_PLANNING_TASK_KEYS)) {
    return "Complete the full Planning & Coordination checklist before moving this shipment to Warehouse.";
  }

  if (targetStage >= 3 && !areAllTaskKeysCompleted(params.tasks, DDP_WAREHOUSE_TASK_KEYS)) {
    return "Complete the full Warehouse Receipt & QC checklist before moving this shipment to Billing.";
  }

  if (targetStage >= 4 && params.shipment.paymentStatus !== "paid") {
    return "Confirm the shipment payment before moving this shipment to Shipping.";
  }

  if (targetStage >= 5 && !areAllTaskKeysCompleted(params.tasks, DDP_SHIPPING_TASK_KEYS)) {
    return "Complete the full Shipping & Tracking checklist before moving this shipment to Delivery.";
  }

  return null;
}

export async function ensureDefaultOperationTasks(
  shipment: Shipment,
  assignedToUserId?: string | null,
): Promise<void> {
  const tasks = getDefaultTasksForShipment(shipment);
  if (tasks.length === 0) {
    return;
  }

  await db
    .insert(shipmentOperationTasks)
    .values(tasks.map((task) => ({
      shipmentId: shipment.id,
      taskKey: task.taskKey,
      stageKey: task.stageKey,
      title: task.title,
      description: task.description || null,
      status: OperationTaskStatus.PENDING,
      assignedToUserId: assignedToUserId || null,
    })))
    .onConflictDoNothing({
      target: [shipmentOperationTasks.shipmentId, shipmentOperationTasks.taskKey],
    });
}

export async function createOperationEvent(params: {
  shipmentId: string;
  actorUserId?: string | null;
  eventType: string;
  title: string;
  description?: string | null;
  audience?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<ShipmentOperationEvent> {
  const [event] = await db
    .insert(shipmentOperationEvents)
    .values({
      shipmentId: params.shipmentId,
      actorUserId: params.actorUserId || null,
      eventType: params.eventType,
      title: params.title,
      description: params.description || null,
      audience: params.audience || OperationEventAudience.INTERNAL,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
    .returning();
  return event;
}

function buildNotificationEmailHtml(title: string, body: string, actionUrl?: string | null): string {
  const action = actionUrl
    ? `<p><a href="${actionUrl}" style="display:inline-block;padding:10px 14px;background:#ff3d00;color:#fff;text-decoration:none;border-radius:8px;">Open in ezhalha</a></p>`
    : "";
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2>${title}</h2>
      <p>${body}</p>
      ${action}
    </div>
  `;
}

export async function notifyUser(params: {
  userId: string;
  title: string;
  body: string;
  type?: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  sendEmail?: boolean;
}): Promise<Notification> {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: params.userId,
      title: params.title,
      body: params.body,
      type: params.type || "info",
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      actionUrl: params.actionUrl || null,
    })
    .returning();

  if (params.sendEmail !== false) {
    try {
      const user = await storage.getUser(params.userId);
      if (user?.email) {
        const actionBlock = params.actionUrl
          ? `<p style="text-align: center; margin: 30px 0;"><a href="${params.actionUrl}" class="button">Open in ezhalha</a></p>`
          : "";
        const rendered = await getRenderedTemplate("operation_notification", {
          title: params.title,
          body: params.body,
          action_block: actionBlock,
          year: new Date().getFullYear().toString(),
        });
        const emailSent = await sendEmail({
          to: user.email,
          subject: rendered?.subject ?? params.title,
          html: rendered?.html ?? buildNotificationEmailHtml(params.title, params.body, params.actionUrl),
        });
        await db
          .update(notifications)
          .set({
            emailSentAt: emailSent ? new Date() : null,
            emailStatus: emailSent ? "sent" : "not_configured",
          })
          .where(eq(notifications.id, notification.id));
      }
    } catch (error) {
      logError("Failed to send operation notification email", error);
      await db
        .update(notifications)
        .set({ emailStatus: "failed" })
        .where(eq(notifications.id, notification.id));
    }
  }

  return notification;
}

export async function notifyUsers(
  userIds: string[],
  payload: Omit<Parameters<typeof notifyUser>[0], "userId">,
): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(uniqueUserIds.map((userId) => notifyUser({ ...payload, userId })));
}

async function notifyClientUsersForShipment(
  shipment: Shipment,
  payload: Omit<Parameters<typeof notifyUser>[0], "userId">,
): Promise<void> {
  const clientUsers = await storage.getUsersByClientAccount(shipment.clientAccountId);
  await notifyUsers(
    clientUsers.filter((user) => user.isActive).map((user) => user.id),
    payload,
  );
}

function operationShipmentUrl(shipmentId: string, userType: "admin" | "operations" = "operations"): string {
  const path = userType === "admin" ? `/admin/operations?shipmentId=${shipmentId}` : `/operations?shipmentId=${shipmentId}`;
  return `${APP_BASE_URL}${path}`;
}

export async function ensureOperationAssignmentForShipment(params: {
  shipment: Shipment;
  actorUserId?: string | null;
  reason?: string | null;
}): Promise<ShipmentAssignment | null> {
  const shipment = params.shipment;
  if (!isOperationsEligibleShipment(shipment)) {
    return null;
  }

  const kind = getOperationShipmentKind(shipment);
  if (!kind) {
    return null;
  }

  const [existingAssignment] = await getActiveAssignmentsForShipment(shipment.id);

  if (existingAssignment) {
    await ensureDefaultOperationTasks(shipment, existingAssignment.assignedToUserId);
    return existingAssignment;
  }

  const assignee = await pickLeastLoadedOperationsUser(kind);
  if (!assignee) {
    await createAttentionFlag({
      shipmentId: shipment.id,
      issueType: "no_operations_agent",
      severity: "high",
      details: "No active operations agent is available for automatic assignment.",
    });
    logError("No operations agent available for shipment assignment", {
      shipmentId: shipment.id,
      shipmentKind: kind,
    });
    return null;
  }

  const [assignment] = await db
    .insert(shipmentAssignments)
    .values({
      shipmentId: shipment.id,
      assignedToUserId: assignee.id,
      assignedByUserId: params.actorUserId || null,
      shipmentKind: kind,
      status: OperationAssignmentStatus.ACTIVE,
      reason: params.reason || "auto_assignment",
    })
    .returning();

  await ensureDefaultOperationTasks(shipment, assignee.id);
  await createOperationEvent({
    shipmentId: shipment.id,
    actorUserId: params.actorUserId,
    eventType: "assigned",
    title: `Assigned to ${assignee.username}`,
    description: `${kind} shipment ${shipment.trackingNumber} was assigned automatically.`,
    audience: OperationEventAudience.INTERNAL,
    metadata: { assignedToUserId: assignee.id, reason: params.reason || "auto_assignment" },
  });

  await notifyUser({
    userId: assignee.id,
    title: "New shipment assigned",
    body: `${kind} shipment ${shipment.trackingNumber} has been assigned to you.`,
    type: "operations_assignment",
    entityType: "shipment",
    entityId: shipment.id,
    actionUrl: operationShipmentUrl(shipment.id),
  });

  return assignment;
}

function getClientFriendlyMilestone(status: string): string | null {
  const normalized = status.toLowerCase();
  const milestones: Record<string, string> = {
    awaiting_review: "Your shipment is being reviewed by our operations team.",
    booked: "Your shipment has been booked.",
    created: "Your shipment has been created with the carrier.",
    processing: "Your shipment is being prepared.",
    picked_up: "Your shipment has been picked up.",
    in_transit: "Your shipment is in transit.",
    customs_clearance: "Your shipment is in customs clearance.",
    out_for_delivery: "Your shipment is out for delivery.",
    delivered: "Your shipment has been delivered.",
    cancelled: "Your shipment has been cancelled.",
    carrier_error: "Your shipment needs operational attention.",
  };
  return milestones[normalized] || null;
}

export async function recordShipmentStatusChange(params: {
  shipment: Shipment;
  previousStatus?: string | null;
  nextStatus: string;
  actorUserId?: string | null;
  source?: string;
  notifyClient?: boolean;
}): Promise<void> {
  const shipment = params.shipment;
  const previousStatus = params.previousStatus || shipment.status;
  const nextStatus = params.nextStatus;

  await createOperationEvent({
    shipmentId: shipment.id,
    actorUserId: params.actorUserId,
    eventType: "status_changed",
    title: `Status changed to ${nextStatus}`,
    description: previousStatus && previousStatus !== nextStatus
      ? `Shipment moved from ${previousStatus} to ${nextStatus}.`
      : `Shipment status is ${nextStatus}.`,
    audience: params.notifyClient === false ? OperationEventAudience.INTERNAL : OperationEventAudience.BOTH,
    metadata: { previousStatus, nextStatus, source: params.source || "system" },
  });

  const activeAssignments = await getActiveAssignmentsForShipment(shipment.id);
  if (activeAssignments.length > 0) {
    await notifyUsers(
      activeAssignments.map((assignment) => assignment.assignedToUserId),
      {
        title: "Shipment status updated",
        body: `${shipment.trackingNumber} is now ${nextStatus}.`,
        type: "shipment_status",
        entityType: "shipment",
        entityId: shipment.id,
        actionUrl: operationShipmentUrl(shipment.id),
      },
    );
  }

  const milestone = getClientFriendlyMilestone(nextStatus);
  if (params.notifyClient !== false && milestone) {
    await notifyClientUsersForShipment(shipment, {
      title: "Shipment update",
      body: `${shipment.trackingNumber}: ${milestone}`,
      type: "shipment_milestone",
      entityType: "shipment",
      entityId: shipment.id,
      actionUrl: `${APP_BASE_URL}/client/shipments?shipmentId=${shipment.id}`,
    });
  }

  if (TERMINAL_SHIPMENT_STATUSES.has(nextStatus) && activeAssignments.length > 0) {
    await db
      .update(shipmentAssignments)
      .set({ status: OperationAssignmentStatus.COMPLETED, releasedAt: new Date() })
      .where(
        and(
          eq(shipmentAssignments.shipmentId, shipment.id),
          eq(shipmentAssignments.status, OperationAssignmentStatus.ACTIVE),
        ),
      );
  }
}

export async function getActiveAssignmentsForShipment(shipmentId: string): Promise<ShipmentAssignment[]> {
  return db
    .select()
    .from(shipmentAssignments)
    .where(
      and(
        eq(shipmentAssignments.shipmentId, shipmentId),
        eq(shipmentAssignments.status, OperationAssignmentStatus.ACTIVE),
      ),
    )
    .orderBy(asc(shipmentAssignments.assignedAt), asc(shipmentAssignments.createdAt));
}

export async function getActiveAssignmentForShipment(shipmentId: string): Promise<ShipmentAssignment | null> {
  const [assignment] = await getActiveAssignmentsForShipment(shipmentId);
  return assignment || null;
}

async function getAssignedTeamMembersForShipment(shipmentId: string): Promise<OperationAssignedTeamMember[]> {
  const map = await getAssignedTeamMembersByShipmentIds([shipmentId]);
  return map.get(shipmentId) || [];
}

async function getAssignedTeamMembersByShipmentIds(
  shipmentIds: string[],
): Promise<Map<string, OperationAssignedTeamMember[]>> {
  const teamMap = new Map<string, OperationAssignedTeamMember[]>();
  if (shipmentIds.length === 0) {
    return teamMap;
  }

  const rows = await db
    .select({ assignment: shipmentAssignments, user: users, profile: operationProfiles })
    .from(shipmentAssignments)
    .innerJoin(users, eq(users.id, shipmentAssignments.assignedToUserId))
    .leftJoin(operationProfiles, eq(operationProfiles.userId, users.id))
    .where(
      and(
        inArray(shipmentAssignments.shipmentId, shipmentIds),
        eq(shipmentAssignments.status, OperationAssignmentStatus.ACTIVE),
      ),
    )
    .orderBy(asc(shipmentAssignments.shipmentId), asc(shipmentAssignments.assignedAt), asc(users.username));

  for (const row of rows) {
    const members = teamMap.get(row.assignment.shipmentId) || [];
    members.push({
      userId: row.user.id,
      username: row.user.username,
      email: row.user.email,
      displayName: getOperationDisplayName(row.user),
      level: row.profile?.level || null,
      assignedAt: row.assignment.assignedAt,
      isPrimary: members.length === 0,
    });
    teamMap.set(row.assignment.shipmentId, members);
  }

  return teamMap;
}

export async function createAttentionFlag(params: {
  shipmentId: string;
  issueType: string;
  severity?: string;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [flag] = await db
    .insert(shipmentAttentionFlags)
    .values({
      shipmentId: params.shipmentId,
      issueType: params.issueType,
      severity: params.severity || "medium",
      status: OperationAttentionStatus.OPEN,
      details: params.details || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
    .onConflictDoNothing()
    .returning();
  return flag || null;
}

export async function upsertOpenAttentionFlag(params: {
  shipmentId: string;
  issueType: string;
  severity?: string;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<ShipmentAttentionFlag> {
  const [existing] = await db
    .select()
    .from(shipmentAttentionFlags)
    .where(and(
      eq(shipmentAttentionFlags.shipmentId, params.shipmentId),
      eq(shipmentAttentionFlags.issueType, params.issueType),
      eq(shipmentAttentionFlags.status, OperationAttentionStatus.OPEN),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(shipmentAttentionFlags)
      .set({
        severity: params.severity || existing.severity,
        details: params.details || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        updatedAt: new Date(),
      })
      .where(eq(shipmentAttentionFlags.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(shipmentAttentionFlags)
    .values({
      shipmentId: params.shipmentId,
      issueType: params.issueType,
      severity: params.severity || "medium",
      status: OperationAttentionStatus.OPEN,
      details: params.details || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
    .returning();

  return created;
}

export async function getOperationsUsers(): Promise<Array<UserWithOperationProfile & { roleNames: string[] }>> {
  const rows = await db
    .select({ user: users, profile: operationProfiles })
    .from(users)
    .leftJoin(operationProfiles, eq(operationProfiles.userId, users.id))
    .where(eq(users.userType, "operations"))
    .orderBy(asc(users.username));

  return Promise.all(rows.map(async (row) => ({
    ...row.user,
    operationProfile: row.profile,
    roleNames: await getOperationRoleNames(row.user.id),
  })));
}

async function buildShipmentSummary(
  shipment: Shipment,
  options?: { includeFinancialBreakdown?: boolean },
): Promise<OperationShipmentDetail> {
  await ensureDefaultOperationTasks(shipment);

  const [
    client,
    assignedTeam,
    events,
    tasks,
    notes,
    relatedInvoices,
    specialHandling,
    openAttention,
  ] = await Promise.all([
    storage.getClientAccount(shipment.clientAccountId),
    getAssignedTeamMembersForShipment(shipment.id),
    db.select().from(shipmentOperationEvents).where(eq(shipmentOperationEvents.shipmentId, shipment.id)).orderBy(desc(shipmentOperationEvents.createdAt)),
    db.select().from(shipmentOperationTasks).where(eq(shipmentOperationTasks.shipmentId, shipment.id)).orderBy(asc(shipmentOperationTasks.createdAt)),
    db.select({ note: shipmentOperationNotes, author: users })
      .from(shipmentOperationNotes)
      .leftJoin(users, eq(users.id, shipmentOperationNotes.authorUserId))
      .where(and(eq(shipmentOperationNotes.shipmentId, shipment.id), isNull(shipmentOperationNotes.deletedAt)))
      .orderBy(desc(shipmentOperationNotes.createdAt)),
    storage.getInvoicesByShipmentId(shipment.id),
    db.select().from(shipmentSpecialHandling).where(eq(shipmentSpecialHandling.shipmentId, shipment.id)).limit(1),
    db.select().from(shipmentAttentionFlags).where(and(eq(shipmentAttentionFlags.shipmentId, shipment.id), eq(shipmentAttentionFlags.status, OperationAttentionStatus.OPEN))),
  ]);

  const activeSpecialHandling = specialHandling[0] || null;
  const specialAssignee = activeSpecialHandling?.assignedToUserId
    ? await storage.getUser(activeSpecialHandling.assignedToUserId)
    : null;
  const assignedSummary = summarizeAssignedTeam(assignedTeam);
  const shipmentKind = getOperationShipmentKind(shipment) || OperationShipmentKind.EXPRESS;

  const summary: OperationShipmentDetail = {
    id: shipment.id,
    trackingNumber: shipment.trackingNumber,
    clientAccountId: shipment.clientAccountId,
    clientName: client?.name || "Unknown client",
    shipmentKind,
    ddpCurrentStage: shipmentKind === OperationShipmentKind.DDP ? getDdpEffectiveStage(shipment, tasks) : null,
    status: shipment.status,
    carrierStatus: shipment.carrierStatus,
    paymentStatus: shipment.paymentStatus,
    carrierCode: shipment.carrierCode,
    carrierName: shipment.carrierName,
    carrierTrackingNumber: shipment.carrierTrackingNumber,
    finalPrice: shipment.clientTotalAmountSar || shipment.finalPrice,
    currency: shipment.currency,
    assignedToUserId: assignedTeam[0]?.userId || null,
    assignedToName: assignedSummary,
    assignedAt: assignedTeam[0]?.assignedAt || null,
    assignedTeam,
    specialHandlingPriority: activeSpecialHandling?.priority || null,
    specialHandling: activeSpecialHandling
      ? {
          ...activeSpecialHandling,
          assignedToName: specialAssignee?.username || specialAssignee?.email || null,
        }
      : null,
    attentionFlags: openAttention,
    attentionCount: openAttention.length,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    sender: {
      name: shipment.senderName,
      city: shipment.senderCity,
      country: shipment.senderCountry,
      phone: shipment.senderPhone,
      address: [shipment.senderAddress, shipment.senderAddressLine2].filter(Boolean).join(", "),
    },
    recipient: {
      name: shipment.recipientName,
      city: shipment.recipientCity,
      country: shipment.recipientCountry,
      phone: shipment.recipientPhone,
      address: [shipment.recipientAddress, shipment.recipientAddressLine2].filter(Boolean).join(", "),
    },
    serviceType: shipment.serviceType,
    estimatedDelivery: shipment.estimatedDelivery,
    actualDelivery: shipment.actualDelivery,
    operationEvents: events,
    operationTasks: tasks,
    operationNotes: notes.map((row) => ({ ...row.note, authorName: row.author?.username || row.author?.email || null })),
  };

  if (shipment.fulfillmentType === "ddp_manual" && (shipment.ddpBillingUnit === "KG" || shipment.ddpBillingUnit === "CBM")) {
    const chargeDetails = parseJsonObject(shipment.chargeableWeightDetails);
    const billingUnit = shipment.ddpBillingUnit;
    const currentRawQuantity = billingUnit === "CBM"
      ? parseNumericValue(chargeDetails?.totalCbm ?? shipment.ddpTotalCbm ?? shipment.ddpBillableQuantity)
      : parseNumericValue(chargeDetails?.rawBillableQuantity ?? shipment.chargeableWeight ?? shipment.ddpBillableQuantity ?? shipment.weight);
    const currentBillableQuantity = parseNumericValue(
      shipment.ddpBillableQuantity ?? shipment.chargeableWeight ?? chargeDetails?.billableQuantity,
    );
    const extraWeightQuantity = parseNumericValue(shipment.extraFeesWeightValue);
    const extraCostAmountSar = parseNumericValue(shipment.extraFeesCostAmountSar);
    const totalExtraFeesAmountSar = parseNumericValue(shipment.extraFeesAmountSar);
    const extraWeightAmountSar = Math.max(totalExtraFeesAmountSar - extraCostAmountSar, 0);
    const customChargesAmountSar = relatedInvoices
      .filter((invoice) => invoice.invoiceType === InvoiceType.DDP_ADJUSTMENT && !invoice.deletedAt)
      .reduce((sum, invoice) => sum + parseNumericValue(invoice.amount), 0);
    const currentMeasuredQuantity = currentRawQuantity + extraWeightQuantity;
    const totalAdjustmentsAmountSar = extraWeightAmountSar + extraCostAmountSar + customChargesAmountSar;

    summary.ddpChargeConfig = {
      billingUnit,
      chargeLabel: billingUnit === "CBM" ? "Extra Volume" : "Extra Weight",
      currentBillableQuantity: formatNumericValue(currentBillableQuantity, 4),
      currentRawQuantity: formatNumericValue(currentRawQuantity, 4),
      currentMeasuredQuantity: formatNumericValue(currentMeasuredQuantity, 4),
      currentRatePerUnitSar: formatNumericValue(parseNumericValue(shipment.ddpRatePerUnitSar), 2),
      extraWeightQuantity: formatNumericValue(extraWeightQuantity, 4),
      extraWeightAmountSar: formatNumericValue(extraWeightAmountSar, 2),
      extraCostAmountSar: formatNumericValue(extraCostAmountSar, 2),
      customChargesAmountSar: formatNumericValue(customChargesAmountSar, 2),
      totalAdjustmentsAmountSar: formatNumericValue(totalAdjustmentsAmountSar, 2),
    };
  }

  if (options?.includeFinancialBreakdown) {
    summary.financialBreakdown = {
      baseRate: shipment.baseRate,
      marginAmount: shipment.marginAmount,
      finalPrice: shipment.finalPrice,
      costAmountSar: shipment.costAmountSar,
      sellSubtotalAmountSar: shipment.sellSubtotalAmountSar,
      sellTaxAmountSar: shipment.sellTaxAmountSar,
      clientTotalAmountSar: shipment.clientTotalAmountSar,
      systemCostTotalAmountSar: shipment.systemCostTotalAmountSar,
      revenueExcludingTaxAmountSar: shipment.revenueExcludingTaxAmountSar,
    };
  }

  return summary;
}

async function buildShipmentListSummaries(
  shipmentList: Shipment[],
): Promise<OperationShipmentSummary[]> {
  if (shipmentList.length === 0) {
    return [];
  }

  const shipmentIds = shipmentList.map((shipment) => shipment.id);
  const clientAccountIds = Array.from(new Set(shipmentList.map((shipment) => shipment.clientAccountId)));

  const [clientRows, assignedTeamMap, taskRows, attentionRows, specialRows] = await Promise.all([
    db.select().from(clientAccounts).where(inArray(clientAccounts.id, clientAccountIds)),
    getAssignedTeamMembersByShipmentIds(shipmentIds),
    db
      .select({
        shipmentId: shipmentOperationTasks.shipmentId,
        taskKey: shipmentOperationTasks.taskKey,
        status: shipmentOperationTasks.status,
      })
      .from(shipmentOperationTasks)
      .where(inArray(shipmentOperationTasks.shipmentId, shipmentIds)),
    db
      .select()
      .from(shipmentAttentionFlags)
      .where(
        and(
          inArray(shipmentAttentionFlags.shipmentId, shipmentIds),
          eq(shipmentAttentionFlags.status, OperationAttentionStatus.OPEN),
        ),
      ),
    db
      .select({ special: shipmentSpecialHandling, user: users })
      .from(shipmentSpecialHandling)
      .leftJoin(users, eq(users.id, shipmentSpecialHandling.assignedToUserId))
      .where(
        and(
          inArray(shipmentSpecialHandling.shipmentId, shipmentIds),
          eq(shipmentSpecialHandling.status, OperationSpecialHandlingStatus.OPEN),
        ),
      )
      .orderBy(desc(shipmentSpecialHandling.updatedAt)),
  ]);

  const clientsById = new Map(clientRows.map((client) => [client.id, client]));
  const tasksByShipmentId = new Map<string, Array<Pick<ShipmentOperationTask, "taskKey" | "status">>>();
  for (const row of taskRows) {
    const tasks = tasksByShipmentId.get(row.shipmentId) || [];
    tasks.push({
      taskKey: row.taskKey,
      status: row.status,
    });
    tasksByShipmentId.set(row.shipmentId, tasks);
  }
  const attentionByShipment = new Map<string, ShipmentAttentionFlag[]>();
  for (const flag of attentionRows) {
    const flags = attentionByShipment.get(flag.shipmentId) || [];
    flags.push(flag);
    attentionByShipment.set(flag.shipmentId, flags);
  }

  const specialByShipment = new Map<string, ShipmentSpecialHandling & { assignedToName: string | null }>();
  for (const row of specialRows) {
    if (!specialByShipment.has(row.special.shipmentId)) {
      specialByShipment.set(row.special.shipmentId, {
        ...row.special,
        assignedToName: getOperationDisplayName(row.user),
      });
    }
  }

  return shipmentList.map((shipment) => {
    const client = clientsById.get(shipment.clientAccountId);
    const shipmentKind = getOperationShipmentKind(shipment) || OperationShipmentKind.EXPRESS;
    const assignedTeam = assignedTeamMap.get(shipment.id) || [];
    const tasks = tasksByShipmentId.get(shipment.id) || [];
    const attentionFlags = attentionByShipment.get(shipment.id) || [];
    const specialHandling = specialByShipment.get(shipment.id) || null;

    return {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      clientAccountId: shipment.clientAccountId,
      clientName: client?.name || "Unknown client",
      shipmentKind,
      ddpCurrentStage: shipmentKind === OperationShipmentKind.DDP ? getDdpEffectiveStage(shipment, tasks) : null,
      status: shipment.status,
      carrierStatus: shipment.carrierStatus,
      paymentStatus: shipment.paymentStatus,
      carrierCode: shipment.carrierCode,
      carrierName: shipment.carrierName,
      carrierTrackingNumber: shipment.carrierTrackingNumber,
      finalPrice: shipment.clientTotalAmountSar || shipment.finalPrice,
      currency: shipment.currency,
      assignedToUserId: assignedTeam[0]?.userId || null,
      assignedToName: summarizeAssignedTeam(assignedTeam),
      assignedAt: assignedTeam[0]?.assignedAt || null,
      assignedTeam,
      specialHandlingPriority: specialHandling?.priority || null,
      specialHandling,
      attentionFlags,
      attentionCount: attentionFlags.length,
      sender: {
        name: shipment.senderName,
        city: shipment.senderCity,
        country: shipment.senderCountry,
        phone: shipment.senderPhone,
        address: [shipment.senderAddress, shipment.senderAddressLine2].filter(Boolean).join(", "),
      },
      recipient: {
        name: shipment.recipientName,
        city: shipment.recipientCity,
        country: shipment.recipientCountry,
        phone: shipment.recipientPhone,
        address: [shipment.recipientAddress, shipment.recipientAddressLine2].filter(Boolean).join(", "),
      },
      serviceType: shipment.serviceType,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    };
  });
}

async function getVisibleOperationShipmentIds(user: User): Promise<Set<string> | null> {
  const scope = await getOperationViewerScope(user);
  if (scope !== "agent") {
    return null;
  }

  const assigned = await db
    .select({ shipmentId: shipmentAssignments.shipmentId })
    .from(shipmentAssignments)
    .where(
      and(
        eq(shipmentAssignments.assignedToUserId, user.id),
        eq(shipmentAssignments.status, OperationAssignmentStatus.ACTIVE),
      ),
  );
  return new Set(assigned.map((row) => row.shipmentId));
}

function getDdpShipmentSqlCondition() {
  return sql`(${shipments.fulfillmentType} = 'ddp_manual' or coalesce(${shipments.isDdp}, false) = true or ${shipments.carrierCode} = 'DDP')`;
}

function getExpressShipmentSqlCondition() {
  return sql`((${shipments.carrierCode} is not null or ${shipments.carrierName} is not null or ${shipments.carrierTrackingNumber} is not null)
    and not (${shipments.fulfillmentType} = 'ddp_manual' or coalesce(${shipments.isDdp}, false) = true or ${shipments.carrierCode} = 'DDP'))`;
}

async function queryOperationsEligibleShipments(params: {
  viewer: User;
  queue?: string;
  search?: string;
  limit?: number;
}): Promise<Shipment[]> {
  const visibleShipmentIds = await getVisibleOperationShipmentIds(params.viewer);
  if (visibleShipmentIds && visibleShipmentIds.size === 0) {
    return [];
  }

  const [openAttentionRows, openSpecialRows] = await Promise.all([
    db.select({ shipmentId: shipmentAttentionFlags.shipmentId })
      .from(shipmentAttentionFlags)
      .where(eq(shipmentAttentionFlags.status, OperationAttentionStatus.OPEN)),
    db.select({ shipmentId: shipmentSpecialHandling.shipmentId })
      .from(shipmentSpecialHandling)
      .where(eq(shipmentSpecialHandling.status, OperationSpecialHandlingStatus.OPEN)),
  ]);

  const attentionShipmentIds = openAttentionRows.map((row) => row.shipmentId);
  const specialShipmentIds = openSpecialRows.map((row) => row.shipmentId);
  const isDeliveredQueue = params.queue === "delivered";

  const ddpCondition = getDdpShipmentSqlCondition();
  const expressCondition = getExpressShipmentSqlCondition();
  const conditions = [
    isNull(shipments.deletedAt),
    ne(shipments.status, "cancelled"),
    inArray(shipments.paymentStatus, Array.from(OPERATION_ACTIVE_PAYMENT_STATUSES)),
    params.queue === "ddp"
      ? ddpCondition
      : params.queue === "express"
        ? expressCondition
        : sql`(${ddpCondition} or ${expressCondition})`,
  ];

  if (isDeliveredQueue) {
    conditions.push(eq(shipments.status, "delivered"));
  } else {
    conditions.push(ne(shipments.status, "delivered"));
  }

  if (visibleShipmentIds) {
    conditions.push(inArray(shipments.id, Array.from(visibleShipmentIds)));
  }

  if (params.queue === "attention") {
    if (attentionShipmentIds.length > 0) {
      conditions.push(or(eq(shipments.status, "carrier_error"), inArray(shipments.id, attentionShipmentIds))!);
    } else {
      conditions.push(eq(shipments.status, "carrier_error"));
    }
  }

  if (params.queue === "special") {
    if (specialShipmentIds.length === 0) {
      return [];
    }
    conditions.push(inArray(shipments.id, specialShipmentIds));
  }

  const normalizedSearch = (params.search || "").trim();
  if (normalizedSearch) {
    conditions.push(
      or(
        ilike(shipments.trackingNumber, `%${normalizedSearch}%`),
        ilike(shipments.carrierTrackingNumber, `%${normalizedSearch}%`),
        ilike(shipments.recipientName, `%${normalizedSearch}%`),
        ilike(shipments.senderName, `%${normalizedSearch}%`),
      )!,
    );
  }

  const baseQuery = db
    .select()
    .from(shipments)
    .where(and(...conditions))
    .orderBy(desc(shipments.updatedAt));

  return typeof params.limit === "number"
    ? baseQuery.limit(params.limit)
    : baseQuery;
}

export async function listOperationShipments(params: {
  viewer: User;
  queue?: string;
  search?: string;
  limit?: number;
}): Promise<OperationShipmentSummary[]> {
  const shipmentsList = await queryOperationsEligibleShipments(params);
  return buildShipmentListSummaries(shipmentsList);
}

export async function getOperationShipmentDetail(
  shipmentId: string,
  viewer: User,
): Promise<OperationShipmentDetail | null> {
  const shipment = await storage.getShipment(shipmentId);
  if (!shipment || !getOperationShipmentKind(shipment)) {
    return null;
  }

  const visibleShipmentIds = await getVisibleOperationShipmentIds(viewer);
  if (visibleShipmentIds && !visibleShipmentIds.has(shipment.id)) {
    return null;
  }

  return buildShipmentSummary(shipment, {
    includeFinancialBreakdown: await canViewOperationFinancialBreakdown(viewer),
  });
}

export async function getOperationSummary(viewer: User) {
  const [activeShipments, attentionShipments, specialShipments, deliveredShipments, usersList] = await Promise.all([
    queryOperationsEligibleShipments({ viewer, limit: 10000 }),
    queryOperationsEligibleShipments({ viewer, queue: "attention", limit: 10000 }),
    queryOperationsEligibleShipments({ viewer, queue: "special", limit: 10000 }),
    queryOperationsEligibleShipments({ viewer, queue: "delivered", limit: 10000 }),
    getOperationsUsers(),
  ]);

  const attentionShipmentIds = new Set(attentionShipments.map((shipment) => shipment.id));
  const specialShipmentIds = new Set(specialShipments.map((shipment) => shipment.id));

  let ddpCount = 0;
  let expressCount = 0;
  let attentionCount = 0;
  let specialHandlingCount = 0;
  let deliveredCount = 0;

  for (const shipment of activeShipments) {
    const kind = getOperationShipmentKind(shipment);
    if (!kind) continue;

    if (kind === OperationShipmentKind.DDP) {
      ddpCount += 1;
    } else if (kind === OperationShipmentKind.EXPRESS) {
      expressCount += 1;
    }

    if (shipment.status === "carrier_error" || attentionShipmentIds.has(shipment.id)) {
      attentionCount += 1;
    }

    if (specialShipmentIds.has(shipment.id)) {
      specialHandlingCount += 1;
    }
  }

  for (const shipment of deliveredShipments) {
    if (getOperationShipmentKind(shipment)) {
      deliveredCount += 1;
    }
  }

  return {
    ddpCount,
    expressCount,
    attentionCount,
    specialHandlingCount,
    deliveredCount,
    operationsUserCount: usersList.filter((user) => user.isActive).length,
  };
}

export async function updateOperationShipmentStatus(params: {
  shipmentId: string;
  status: string;
  actorUser: User;
  notifyClient?: boolean;
}): Promise<Shipment | null> {
  const shipment = await storage.getShipment(params.shipmentId);
  if (!shipment) return null;
  const previousStatus = shipment.status;
  const updated = await storage.updateShipment(shipment.id, {
    status: params.status,
    carrierStatus: params.status,
    updatedAt: new Date(),
  });
  if (!updated) return null;

  await recordShipmentStatusChange({
    shipment: updated,
    previousStatus,
    nextStatus: params.status,
    actorUserId: params.actorUser.id,
    source: "operations",
    notifyClient: params.notifyClient,
  });

  return updated;
}

export async function completeOperationTask(params: {
  shipmentId: string;
  taskId: string;
  actorUser: User;
  metadata?: Record<string, unknown> | null;
}): Promise<ShipmentOperationTask | null> {
  const shipment = await storage.getShipment(params.shipmentId);
  const shipmentTasks = await db
    .select()
    .from(shipmentOperationTasks)
    .where(eq(shipmentOperationTasks.shipmentId, params.shipmentId))
    .orderBy(asc(shipmentOperationTasks.createdAt));

  const existingTask = shipmentTasks.find((task) => task.id === params.taskId);
  if (!existingTask) {
    return null;
  }

  const metadata = params.metadata || getTaskMetadata(existingTask);
  if (existingTask.stageKey === "warehouse") {
    ensureWarehouseCheckpointPayload(existingTask, shipmentTasks, metadata);
  }
  if (existingTask.stageKey === "shipping") {
    ensureShippingCheckpointPayload(existingTask, shipmentTasks, shipment);
  }
  ensureDeliveryPodPayload(existingTask, metadata);

  const [task] = await db
    .update(shipmentOperationTasks)
    .set({
      status: OperationTaskStatus.COMPLETED,
      completedByUserId: params.actorUser.id,
      completedAt: new Date(),
      metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : existingTask.metadata,
      updatedAt: new Date(),
    })
    .where(and(eq(shipmentOperationTasks.id, params.taskId), eq(shipmentOperationTasks.shipmentId, params.shipmentId)))
    .returning();

  if (task) {
    await createOperationEvent({
      shipmentId: params.shipmentId,
      actorUserId: params.actorUser.id,
      eventType: "task_completed",
      title: `Task completed: ${task.title}`,
      audience: OperationEventAudience.INTERNAL,
    });

    if (task.taskKey === "ddp_quality_check") {
      const qcAttention = buildDdpQcAttentionPayload(metadata);
      if (qcAttention) {
        await upsertOpenAttentionFlag({
          shipmentId: params.shipmentId,
          issueType: QC_ATTENTION_ISSUE_TYPE,
          severity: qcAttention.severity,
          details: qcAttention.details,
          metadata: qcAttention.metadata,
        });

        await createOperationEvent({
          shipmentId: params.shipmentId,
          actorUserId: params.actorUser.id,
          eventType: "attention_flagged",
          title: "QC escalated to Needs Attention",
          description: qcAttention.details,
          audience: OperationEventAudience.INTERNAL,
          metadata: qcAttention.metadata,
        });
      }
    }
  }

  return task || null;
}

export async function createOperationNote(params: {
  shipmentId: string;
  authorUser: User;
  body: string;
  visibility?: string;
  mentionUserIds?: string[];
}): Promise<ShipmentOperationNote> {
  const [note] = await db
    .insert(shipmentOperationNotes)
    .values({
      shipmentId: params.shipmentId,
      authorUserId: params.authorUser.id,
      body: params.body,
      visibility: params.visibility || OperationNoteVisibility.INTERNAL,
    })
    .returning();

  const assignedUserIds = new Set((await getAssignedTeamMembersForShipment(params.shipmentId)).map((member) => member.userId));
  const mentionUserIds = Array.from(new Set([
    ...(params.mentionUserIds || []),
    ...(await resolveMentionedUserIdsFromBody(params.body)),
  ])).filter((userId) => assignedUserIds.has(userId));
  if (mentionUserIds.length > 0) {
    await db.insert(shipmentOperationNoteMentions)
      .values(mentionUserIds.map((mentionedUserId) => ({
        noteId: note.id,
        mentionedUserId,
      })))
      .onConflictDoNothing();

    const shipment = await storage.getShipment(params.shipmentId);
    await notifyUsers(mentionUserIds, {
      title: "You were mentioned in operations",
      body: `${params.authorUser.username} mentioned you${shipment ? ` on ${shipment.trackingNumber}` : ""}.`,
      type: "mention",
      entityType: "shipment",
      entityId: params.shipmentId,
      actionUrl: operationShipmentUrl(params.shipmentId),
    });
  }

  await createOperationEvent({
    shipmentId: params.shipmentId,
    actorUserId: params.authorUser.id,
    eventType: "note_added",
    title: "Operation note added",
    audience: params.visibility === OperationNoteVisibility.CLIENT ? OperationEventAudience.BOTH : OperationEventAudience.INTERNAL,
  });

  return note;
}

async function resolveMentionedUserIdsFromBody(body: string): Promise<string[]> {
  const mentionTokens = Array.from(body.matchAll(/(?:^|\s)@([a-zA-Z0-9._%+-]+(?:@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?)/g))
    .map((match) => match[1]?.toLowerCase())
    .filter(Boolean) as string[];

  if (mentionTokens.length === 0) {
    return [];
  }

  const mentionSet = new Set(mentionTokens);
  const candidates = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        inArray(users.userType, ["admin", "operations"]),
      ),
    );

  return candidates
    .filter((user) =>
      mentionSet.has(user.username.toLowerCase()) ||
      mentionSet.has(user.email.toLowerCase()),
    )
    .map((user) => user.id);
}

export async function upsertSpecialHandling(params: {
  shipmentId: string;
  priority: string;
  reason: string;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  notes?: string | null;
}) {
  const [special] = await db
    .insert(shipmentSpecialHandling)
    .values({
      shipmentId: params.shipmentId,
      priority: params.priority,
      reason: params.reason,
      assignedToUserId: params.assignedToUserId || null,
      createdByUserId: params.createdByUserId || null,
      notes: params.notes || null,
      status: OperationSpecialHandlingStatus.OPEN,
    })
    .onConflictDoUpdate({
      target: shipmentSpecialHandling.shipmentId,
      set: {
        priority: params.priority,
        reason: params.reason,
        assignedToUserId: params.assignedToUserId || null,
        notes: params.notes || null,
        status: OperationSpecialHandlingStatus.OPEN,
        updatedAt: new Date(),
      },
    })
    .returning();

  await createOperationEvent({
    shipmentId: params.shipmentId,
    actorUserId: params.createdByUserId,
    eventType: "special_handling",
    title: `Special handling: ${params.priority}`,
    description: params.reason,
    audience: OperationEventAudience.INTERNAL,
  });

  if (params.assignedToUserId) {
    await notifyUser({
      userId: params.assignedToUserId,
      title: "Special handling assigned",
      body: params.reason,
      type: "special_handling",
      entityType: "shipment",
      entityId: params.shipmentId,
      actionUrl: operationShipmentUrl(params.shipmentId),
    });
  }

  return special;
}

export async function resolveAttentionFlags(params: {
  shipmentId: string;
  actorUserId?: string | null;
  resolutionNote?: string | null;
}) {
  const resolvedAt = new Date();
  const resolved = await db
    .update(shipmentAttentionFlags)
    .set({
      status: OperationAttentionStatus.RESOLVED,
      resolvedByUserId: params.actorUserId || null,
      resolvedAt,
      updatedAt: resolvedAt,
    })
    .where(and(
      eq(shipmentAttentionFlags.shipmentId, params.shipmentId),
      eq(shipmentAttentionFlags.status, OperationAttentionStatus.OPEN),
    ))
    .returning();

  if (resolved.length > 0) {
    await createOperationEvent({
      shipmentId: params.shipmentId,
      actorUserId: params.actorUserId,
      eventType: "attention_resolved",
      title: "Attention flags resolved",
      description: params.resolutionNote || `Resolved ${resolved.length} attention flag${resolved.length === 1 ? "" : "s"}.`,
      audience: OperationEventAudience.INTERNAL,
    });
  }

  return resolved;
}

export async function resolveSpecialHandling(params: {
  shipmentId: string;
  actorUserId?: string | null;
  resolutionNote?: string | null;
}) {
  const resolvedAt = new Date();
  const resolved = await db
    .update(shipmentSpecialHandling)
    .set({
      status: OperationSpecialHandlingStatus.RESOLVED,
      resolvedByUserId: params.actorUserId || null,
      resolvedAt,
      notes: params.resolutionNote || null,
      updatedAt: resolvedAt,
    })
    .where(and(
      eq(shipmentSpecialHandling.shipmentId, params.shipmentId),
      eq(shipmentSpecialHandling.status, OperationSpecialHandlingStatus.OPEN),
    ))
    .returning();

  if (resolved.length > 0) {
    await createOperationEvent({
      shipmentId: params.shipmentId,
      actorUserId: params.actorUserId,
      eventType: "special_handling_resolved",
      title: "Special handling resolved",
      description: params.resolutionNote || "Special handling was marked as resolved.",
      audience: OperationEventAudience.INTERNAL,
    });
  }

  return resolved[0] || null;
}

export async function reassignOperationShipment(params: {
  shipmentId: string;
  assignedToUserId: string;
  actorUserId?: string | null;
  reason?: string | null;
}): Promise<ShipmentAssignment | null> {
  const [assignment] = await setOperationShipmentAssignments({
    shipmentId: params.shipmentId,
    assignedToUserIds: [params.assignedToUserId],
    actorUserId: params.actorUserId,
    reason: params.reason,
  });

  return assignment || null;
}

export async function setOperationShipmentAssignments(params: {
  shipmentId: string;
  assignedToUserIds: string[];
  actorUserId?: string | null;
  reason?: string | null;
}): Promise<ShipmentAssignment[]> {
  const shipment = await storage.getShipment(params.shipmentId);
  if (!shipment) return [];
  const kind = getOperationShipmentKind(shipment);
  if (!kind) return [];

  const assignedToUserIds = Array.from(new Set(params.assignedToUserIds.filter(Boolean)));
  if (assignedToUserIds.length === 0) {
    throw new OperationInputError("Select at least one team member.");
  }

  const eligibleUsers = (await getOperationsUsers()).filter(
    (user) => user.isActive && user.operationProfile?.canReceiveAssignments !== false,
  );
  const eligibleUserIds = new Set(eligibleUsers.map((user) => user.id));
  const invalidUserIds = assignedToUserIds.filter((userId) => !eligibleUserIds.has(userId));
  if (invalidUserIds.length > 0) {
    throw new OperationInputError("Some selected team members cannot receive assignments.");
  }

  const currentAssignments = await getActiveAssignmentsForShipment(shipment.id);
  const currentAssignedIds = currentAssignments.map((assignment) => assignment.assignedToUserId);
  if (
    currentAssignedIds.length === assignedToUserIds.length &&
    currentAssignedIds.every((userId, index) => userId === assignedToUserIds[index])
  ) {
    return currentAssignments;
  }

  await db
    .update(shipmentAssignments)
    .set({ status: OperationAssignmentStatus.REASSIGNED, releasedAt: new Date() })
    .where(
      and(
        eq(shipmentAssignments.shipmentId, shipment.id),
        eq(shipmentAssignments.status, OperationAssignmentStatus.ACTIVE),
      ),
    );

  const assignments = await db
    .insert(shipmentAssignments)
    .values(
      assignedToUserIds.map((assignedToUserId) => ({
        shipmentId: shipment.id,
        assignedToUserId,
        assignedByUserId: params.actorUserId || null,
        shipmentKind: kind,
        status: OperationAssignmentStatus.ACTIVE,
        reason: params.reason || "manual_reassignment",
      })),
    )
    .returning();

  await ensureDefaultOperationTasks(shipment, assignedToUserIds[0]);
  await db
    .update(shipmentOperationTasks)
    .set({
      assignedToUserId: assignedToUserIds[0],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(shipmentOperationTasks.shipmentId, shipment.id),
        ne(shipmentOperationTasks.status, OperationTaskStatus.COMPLETED),
      ),
    );

  await createOperationEvent({
    shipmentId: shipment.id,
    actorUserId: params.actorUserId,
    eventType: "reassigned",
    title: assignedToUserIds.length > 1 ? "Shipment team updated" : "Shipment reassigned",
    description: params.reason || null,
    audience: OperationEventAudience.INTERNAL,
    metadata: { assignedToUserIds },
  });

  await notifyUsers(assignedToUserIds, {
    title: assignedToUserIds.length > 1 ? "Shipment assigned to your team" : "Shipment reassigned to you",
    body: assignedToUserIds.length > 1
      ? `${shipment.trackingNumber} is now assigned to your team.`
      : `${shipment.trackingNumber} is now assigned to you.`,
    type: "operations_assignment",
    entityType: "shipment",
    entityId: shipment.id,
    actionUrl: operationShipmentUrl(shipment.id),
  });

  return assignments;
}

export async function listNotificationsForUser(userId: string): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ unreadCount: count(notifications.id) })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.unreadCount || 0);
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.id, notificationId)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function detectOperationAttentionFlags(): Promise<number> {
  const staleSince = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const candidates = await db
    .select()
    .from(shipments)
    .where(
      and(
        ne(shipments.status, "delivered"),
        ne(shipments.status, "cancelled"),
        inArray(shipments.paymentStatus, ["paid", "unpaid"]),
      ),
    );

  let created = 0;
  for (const shipment of candidates) {
    if (shipment.status === "carrier_error") {
      const flag = await createAttentionFlag({
        shipmentId: shipment.id,
        issueType: "carrier_error",
        severity: "high",
        details: shipment.carrierErrorMessage || "Carrier returned an error.",
      });
      if (flag) created++;
    }

    if (shipment.updatedAt < staleSince) {
      const flag = await createAttentionFlag({
        shipmentId: shipment.id,
        issueType: "no_recent_update",
        severity: "medium",
        details: "Shipment has not received a status update for more than 36 hours.",
      });
      if (flag) created++;
    }
  }

  if (created > 0) {
    logInfo(`Created ${created} operations attention flag${created === 1 ? "" : "s"}`);
  }

  return created;
}
