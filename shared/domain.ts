// Pure domain constants and their value types.
//
// Deliberately dependency-free: this module imports nothing from drizzle, zod, or any
// server package, so it is safe to bundle into the React Native app. Importing a *value*
// (e.g. ShipmentStatus) from `@shared/schema` instead would pull all 62 Drizzle table
// definitions plus drizzle-orm and drizzle-zod into the mobile bundle at runtime.
//
// Rule of thumb:
//   values (enums, permission lists) -> import from "@shared/domain"
//   row/insert types                 -> import type from "@shared/schema"
//
// `shared/schema.ts` re-exports everything here, so existing server and web imports keep
// working unchanged.


// User types enum
export const UserType = {
  ADMIN: "admin",
  CLIENT: "client",
  OPERATIONS: "operations",
} as const;

export type UserTypeValue = typeof UserType[keyof typeof UserType];

export const OperationShipmentKind = {
  DDP: "DDP",
  EXPRESS: "EXPRESS",
  LOCAL: "LOCAL",
} as const;

export type OperationShipmentKindValue =
  typeof OperationShipmentKind[keyof typeof OperationShipmentKind];

export const OperationAssignmentStatus = {
  ACTIVE: "ACTIVE",
  REASSIGNED: "REASSIGNED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type OperationAssignmentStatusValue =
  typeof OperationAssignmentStatus[keyof typeof OperationAssignmentStatus];

export const OperationEventAudience = {
  INTERNAL: "INTERNAL",
  CLIENT: "CLIENT",
  BOTH: "BOTH",
} as const;

export type OperationEventAudienceValue =
  typeof OperationEventAudience[keyof typeof OperationEventAudience];

export const OperationTaskStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  SKIPPED: "SKIPPED",
} as const;

export type OperationTaskStatusValue =
  typeof OperationTaskStatus[keyof typeof OperationTaskStatus];

export const OperationSpecialHandlingStatus = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
} as const;

export type OperationSpecialHandlingStatusValue =
  typeof OperationSpecialHandlingStatus[keyof typeof OperationSpecialHandlingStatus];

export const OperationAttentionStatus = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export type OperationAttentionStatusValue =
  typeof OperationAttentionStatus[keyof typeof OperationAttentionStatus];

export const OperationNoteVisibility = {
  INTERNAL: "INTERNAL",
  CLIENT: "CLIENT",
} as const;

export type OperationNoteVisibilityValue =
  typeof OperationNoteVisibility[keyof typeof OperationNoteVisibility];

export const IntegrationAccountCountryBasis = {
  SHIPPING_ACCOUNT_COUNTRY: "shipping_account_country",
  CLIENT_BASE_ACCOUNT_COUNTRY: "client_base_account_country",
} as const;

export type IntegrationAccountCountryBasisValue =
  typeof IntegrationAccountCountryBasis[keyof typeof IntegrationAccountCountryBasis];

export const INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY = "integration_account_country_basis";

// Client profile tiers
export const ClientProfile = {
  REGULAR: "regular",
  MID_LEVEL: "mid_level",
  VIP: "vip",
} as const;

export type ClientProfileValue = typeof ClientProfile[keyof typeof ClientProfile];

// Shipment type (direction)
export const ShipmentType = {
  DOMESTIC: "domestic",
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const;

export type ShipmentTypeValue = typeof ShipmentType[keyof typeof ShipmentType];

export const ShipmentTaxScenario = {
  DCE: "DCE",
  IMPORT: "IMPORT",
  EXPORT: "EXPORT",
  DDP: "DDP",
} as const;

export type ShipmentTaxScenarioValue =
  typeof ShipmentTaxScenario[keyof typeof ShipmentTaxScenario];

export const DdpTransportMethod = {
  AIR: "air",
  SEA: "sea",
  DOMESTIC: "domestic",
} as const;

export type DdpTransportMethodValue =
  typeof DdpTransportMethod[keyof typeof DdpTransportMethod];

export const DdpShipmentStatus = {
  AWAITING_REVIEW: "awaiting_review",
  BOOKED: "booked",
  SUPPLIER_PICKUP: "supplier_pickup",
  IN_TRANSIT: "in_transit",
  CUSTOMS_CLEARANCE: "customs_clearance",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export const ShipmentExtraFeeType = {
  EXTRA_WEIGHT: "EXTRA_WEIGHT",
  EXTRA_COST: "EXTRA_COST",
  COMBINED: "COMBINED",
} as const;

export type ShipmentExtraFeeTypeValue =
  typeof ShipmentExtraFeeType[keyof typeof ShipmentExtraFeeType];

export const CarrierPaymentStatus = {
  UNPAID: "UNPAID",
  BATCHED: "BATCHED",
  PAID: "PAID",
} as const;

export type CarrierPaymentStatusValue =
  typeof CarrierPaymentStatus[keyof typeof CarrierPaymentStatus];

export const CarrierPayoutBatchStatus = {
  OPEN: "OPEN",
  PAID: "PAID",
} as const;

export type CarrierPayoutBatchStatusValue =
  typeof CarrierPayoutBatchStatus[keyof typeof CarrierPayoutBatchStatus];

// Shipment status
// Carrier statuses that mean the goods have physically left the shipper. Cancelling before this
// point is a clean reversal; after it, the money question needs a human.
//
// Lives here rather than in the server so the web and mobile clients can warn with the same rule
// the server will actually apply — a confirmation dialog that promises an automatic refund the
// server then routes to manual approval is worse than no dialog at all.
export const COLLECTED_OR_MOVING_CARRIER_STATUSES: ReadonlySet<string> = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
]);

/**
 * Whether a shipment is still merely booked — the carrier has a waybill but has not collected.
 * Cancelling in this state refunds the client automatically; after collection the cancellation
 * raises a refund request for approval instead.
 */
export function isCarrierStatusStillBooked(carrierStatus?: string | null): boolean {
  const normalized = (carrierStatus || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return !COLLECTED_OR_MOVING_CARRIER_STATUSES.has(normalized);
}

export const ShipmentStatus = {
  PROCESSING: "processing",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export type ShipmentStatusValue = typeof ShipmentStatus[keyof typeof ShipmentStatus];

// Application status
export const ApplicationStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ApplicationStatusValue = typeof ApplicationStatus[keyof typeof ApplicationStatus];

// Payment status
export const PaymentStatus = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type PaymentStatusValue = typeof PaymentStatus[keyof typeof PaymentStatus];

export const InvoiceType = {
  SHIPMENT: "SHIPMENT",
  EXTRA_WEIGHT: "EXTRA_WEIGHT",
  EXTRA_COST: "EXTRA_COST",
  DDP_ADJUSTMENT: "DDP_ADJUSTMENT",
} as const;

export type InvoiceTypeValue = typeof InvoiceType[keyof typeof InvoiceType];

export const ShipmentRefundRequestStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
} as const;

export type ShipmentRefundRequestStatusValue =
  typeof ShipmentRefundRequestStatus[keyof typeof ShipmentRefundRequestStatus];

export const ShipmentRefundApprovalStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  NOT_REQUIRED: "NOT_REQUIRED",
  REJECTED: "REJECTED",
} as const;

export type ShipmentRefundApprovalStatusValue =
  typeof ShipmentRefundApprovalStatus[keyof typeof ShipmentRefundApprovalStatus];

export const ShipmentRefundRequestActorType = {
  CLIENT: "CLIENT",
  ACCOUNT_MANAGER: "ACCOUNT_MANAGER",
  ADMIN: "ADMIN",
} as const;

export type ShipmentRefundRequestActorTypeValue =
  typeof ShipmentRefundRequestActorType[keyof typeof ShipmentRefundRequestActorType];

export const AbandonedShipmentRecoveryStatus = {
  NOT_CONTACTED: "not_contacted",
  DISCOUNT_SENT: "discount_sent",
  EXPIRED: "expired",
  REMINDER_SENT: "reminder_sent",
  DISMISSED: "dismissed",
  RECOVERED: "recovered",
} as const;

export type AbandonedShipmentRecoveryStatusValue =
  typeof AbandonedShipmentRecoveryStatus[keyof typeof AbandonedShipmentRecoveryStatus];

export const AbandonedShipmentRecoveryChannel = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
} as const;

export type AbandonedShipmentRecoveryChannelValue =
  typeof AbandonedShipmentRecoveryChannel[keyof typeof AbandonedShipmentRecoveryChannel];

// Account type (company vs individual)
export const AccountType = {
  COMPANY: "company",
  INDIVIDUAL: "individual",
} as const;

export type AccountTypeValue = typeof AccountType[keyof typeof AccountType];

// Client permissions
export const ClientPermission = {
  VIEW_SHIPMENTS: "view_shipments",
  CREATE_SHIPMENTS: "create_shipments",
  VIEW_INVOICES: "view_invoices",
  VIEW_PAYMENTS: "view_payments",
  MAKE_PAYMENTS: "make_payments",
  MANAGE_USERS: "manage_users",
} as const;

export type ClientPermissionValue = typeof ClientPermission[keyof typeof ClientPermission];

// All client permissions array for convenience
export const ALL_CLIENT_PERMISSIONS = Object.values(ClientPermission);

