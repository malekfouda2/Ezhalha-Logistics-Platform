import { api } from "@/api/client";

// Admin "Operations Hub" — the same endpoints the web hub uses
// (client/src/pages/operations/hub.tsx → server/routes.ts `/api/operations/*`). Those routes accept
// admin users too, gated on `operations:<action>` permissions. No backend changes.

export type OperationQueue =
  | "express"
  | "ddp"
  | "local"
  | "dangerous_goods"
  | "attention"
  | "special"
  | "delivered"
  | "returned";

export type OperationShipmentKind = "DDP" | "EXPRESS" | "LOCAL" | "DANGEROUS_GOODS";

export type OperationSort = "queue" | "newest" | "updated" | "stale" | "amount_desc" | "amount_asc";

export interface OperationsSummary {
  ddpCount: number;
  expressCount: number;
  localCount: number;
  attentionCount: number;
  specialHandlingCount: number;
  deliveredCount: number;
  returnedCount: number;
  dangerousGoodsCount: number;
  operationsUserCount: number;
}

export interface OperationParty {
  name: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  address: string | null;
}

export interface OperationAttentionFlag {
  id: string;
  issueType: string;
  severity: string | null;
  status: string;
  details: string | null;
  detectedAt: string | null;
}

export interface OperationSpecialHandling {
  id: string;
  priority: string;
  reason: string;
  status: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface OperationShipmentSummary {
  id: string;
  trackingNumber: string;
  clientAccountId: string;
  clientName: string;
  shipmentKind: OperationShipmentKind;
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
  specialHandlingPriority: string | null;
  specialHandling: OperationSpecialHandling | null;
  attentionFlags: OperationAttentionFlag[];
  attentionCount: number;
  duplicateStatus: boolean;
  hasDangerousGoods: boolean;
  dangerousGoodsStatus: string | null;
  statusChangedAt: string | null;
  sender: OperationParty;
  recipient: OperationParty;
  serviceType: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationTask {
  id: string;
  taskKey: string;
  stageKey: string;
  title: string;
  description: string | null;
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  completedAt: string | null;
  /** JSON string. */
  metadata: string | null;
}

export interface OperationEvent {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  audience: "INTERNAL" | "CLIENT" | "BOTH";
  createdAt: string;
}

export interface OperationNote {
  id: string;
  body: string;
  visibility: "INTERNAL" | "CLIENT";
  authorName: string | null;
  createdAt: string;
}

export interface OperationShipmentDetail extends OperationShipmentSummary {
  operationEvents: OperationEvent[];
  operationTasks: OperationTask[];
  operationNotes: OperationNote[];
  details: {
    weight: string | null;
    weightUnit: string | null;
    dimensionalWeight: string | null;
    chargeableWeight: string | null;
    chargeableWeightUnit: string | null;
    numberOfPackages: number | null;
    packageType: string | null;
  };
  carrierContact: { channels: string[]; phone: string | null; email: string | null; whatsapp: string | null } | null;
  ddpChargeConfig?: {
    billingUnit: "KG" | "CBM";
    chargeLabel: string;
    currentMeasuredQuantity: string;
    currentRatePerUnitSar: string;
    totalAdjustmentsAmountSar: string;
  };
  dangerousGoods?: {
    declarationSummary: unknown;
    quotedAt: string | null;
    quoteExpiresAt: string | null;
    carrierCostSar: string | null;
    awaitingBooking: boolean;
  };
  financialBreakdown?: {
    costAmountSar: string | null;
    clientTotalAmountSar: string | null;
    sellTaxAmountSar: string | null;
    marginAmount: string | null;
  };
}

export interface OperationsUser {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  operationProfile: { level: string | null; canReceiveAssignments: boolean; isActive: boolean } | null;
}

export interface ExtraWeightPreview {
  billingUnit: "KG" | "CBM";
  currentMeasuredQuantity: number;
  targetMeasuredQuantity: number;
  adjustmentQuantity: number;
  effectiveRateSarPerUnit: number;
  deltaAmountSar: number;
}

export interface DangerousGoodsQuoteInput {
  carrierCode: string;
  carrierName?: string;
  carrierCostSar: number;
  validUntil?: string;
  note?: string;
}

export interface DangerousGoodsQuoteResult {
  pricing: {
    carrierCostSar: number;
    marginAmount: number;
    vatAmountSar: number;
    clientTotalSar: number;
    validUntil: string;
  };
}

export type ClientMessageChannel = "email" | "whatsapp";

type WithDetail<T = object> = T & { detail: OperationShipmentDetail };

function listPath(params: { queue?: OperationQueue; search?: string; sort?: OperationSort; limit?: number }) {
  const query = new URLSearchParams();
  if (params.queue) query.set("queue", params.queue);
  if (params.search) query.set("search", params.search);
  if (params.sort) query.set("sort", params.sort);
  // Sub-filters (stage, issue type, priority…) are applied on the phone, exactly like the web
  // hub — which is why each queue is read in one 200-row request.
  query.set("limit", String(params.limit ?? 200));
  return `/api/operations/shipments?${query.toString()}`;
}

const base = (id: string) => `/api/operations/shipments/${id}`;

export const adminOperationsService = {
  summary: () => api.get<OperationsSummary>("/api/operations/summary"),

  list: (params: { queue?: OperationQueue; search?: string; sort?: OperationSort; limit?: number }) =>
    api.get<OperationShipmentSummary[]>(listPath(params)),

  detail: (id: string) => api.get<OperationShipmentDetail>(base(id)),

  users: () => api.get<OperationsUser[]>("/api/operations/users"),

  updateStatus: (id: string, data: { status: string; notifyClient: boolean }) =>
    api.patch<WithDetail>(`${base(id)}/status`, data),

  addNote: (id: string, data: { body: string; visibility: "INTERNAL" | "CLIENT" }) =>
    api.post<WithDetail>(`${base(id)}/notes`, data),

  previewExtraWeight: (id: string, targetMeasuredQuantity: number) =>
    api.post<ExtraWeightPreview>(`${base(id)}/charges/extra-weight/preview`, { targetMeasuredQuantity }),

  addExtraWeight: (id: string, data: { targetMeasuredQuantity: number; notes?: string }) =>
    api.post<WithDetail>(`${base(id)}/charges/extra-weight`, data),

  addCustomCharge: (id: string, data: { description: string; amount: number }) =>
    api.post<WithDetail>(`${base(id)}/charges/custom`, data),

  addExpense: (id: string, data: { description: string; amountSar: number }) =>
    api.post<WithDetail>(`${base(id)}/expenses`, data),

  messageClient: (id: string, data: { message: string; template?: string; channel: ClientMessageChannel }) =>
    api.post<WithDetail<{ deliveryStatus: "sent" | "not_configured" | "logged_only"; deliveryMessage: string }>>(
      `${base(id)}/client-message`,
      data,
    ),

  escalate: (id: string, data: { priority: "urgent" | "high" | "normal"; reason: string }) =>
    api.post<WithDetail>(`${base(id)}/special-handling`, data),

  resolveSpecialHandling: (id: string, resolutionNote?: string) =>
    api.post<WithDetail>(`${base(id)}/special-handling/resolve`, { resolutionNote }),

  resolveAttention: (id: string, resolutionNote?: string) =>
    api.post<WithDetail>(`${base(id)}/attention/resolve`, { resolutionNote }),

  reassign: (id: string, data: { assignedToUserIds: string[]; reason?: string }) =>
    api.post<WithDetail>(`${base(id)}/reassign`, data),

  completeTask: (id: string, taskId: string, metadata: Record<string, unknown>) =>
    api.post<WithDetail>(`${base(id)}/tasks/${taskId}/complete`, { metadata }),

  updateTaskMetadata: (id: string, taskId: string, metadata: Record<string, unknown>) =>
    api.patch<WithDetail>(`${base(id)}/tasks/${taskId}/metadata`, { metadata }),

  quoteDangerousGoods: (id: string, data: DangerousGoodsQuoteInput) =>
    api.post<DangerousGoodsQuoteResult>(`${base(id)}/dangerous-goods/quote`, data),

  // Full cancel — carrier cancellation, pickup release and refund request. Lives on the admin
  // shipments namespace (`shipments:cancel`), not under /api/operations.
  cancel: (id: string) => api.post<unknown>(`/api/admin/shipments/${id}/cancel`),
};
