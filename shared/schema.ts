import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User types enum
export const UserType = {
  ADMIN: "admin",
  CLIENT: "client",
} as const;

export type UserTypeValue = typeof UserType[keyof typeof UserType];

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

// Shipment status
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

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  userType: text("user_type").notNull().default("client"),
  clientAccountId: varchar("client_account_id"),
  isPrimaryContact: boolean("is_primary_contact").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Client Accounts table
export const clientAccounts = pgTable("client_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountNumber: text("account_number").notNull().unique(), // Human-readable ID: EZ0001, EZ0002, etc.
  accountType: text("account_type").notNull().default("company"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  companyName: text("company_name"),
  crNumber: text("cr_number"), // Commercial Registration number
  taxNumber: text("tax_number"), // Tax Number
  nationalAddressStreet: text("national_address_street"),
  nationalAddressBuilding: text("national_address_building"),
  nationalAddressDistrict: text("national_address_district"),
  nationalAddressCity: text("national_address_city"),
  nationalAddressPostalCode: text("national_address_postal_code"),
  // Arabic (Secondary Language) fields - Admin only
  nameAr: text("name_ar"),
  companyNameAr: text("company_name_ar"),
  nationalAddressStreetAr: text("national_address_street_ar"),
  nationalAddressBuildingAr: text("national_address_building_ar"),
  nationalAddressDistrictAr: text("national_address_district_ar"),
  nationalAddressCityAr: text("national_address_city_ar"),
  // Default Shipping Address fields
  shippingContactName: text("shipping_contact_name"),
  shippingContactPhone: text("shipping_contact_phone"),
  shippingCountryCode: text("shipping_country_code"),
  shippingStateOrProvince: text("shipping_state_or_province"),
  shippingCity: text("shipping_city"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingShortAddress: text("shipping_short_address"), // Short address code for KSA
  // Arabic Shipping Address fields
  shippingContactNameAr: text("shipping_contact_name_ar"),
  shippingContactPhoneAr: text("shipping_contact_phone_ar"),
  shippingCountryCodeAr: text("shipping_country_code_ar"),
  shippingStateOrProvinceAr: text("shipping_state_or_province_ar"),
  shippingCityAr: text("shipping_city_ar"),
  shippingPostalCodeAr: text("shipping_postal_code_ar"),
  shippingAddressLine1Ar: text("shipping_address_line1_ar"),
  shippingAddressLine2Ar: text("shipping_address_line2_ar"),
  shippingShortAddressAr: text("shipping_short_address_ar"),
  documents: text("documents").array(), // Array of document object paths
  profile: text("profile").notNull().default("regular"),
  isActive: boolean("is_active").notNull().default(true),
  zohoCustomerId: text("zoho_customer_id"), // Zoho Books customer ID for invoice sync
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertClientAccountSchema = createInsertSchema(clientAccounts).omit({
  id: true,
  accountNumber: true, // Generated automatically: EZ0001, EZ0002, etc.
  createdAt: true,
});

export type InsertClientAccount = z.infer<typeof insertClientAccountSchema>;
export type ClientAccount = typeof clientAccounts.$inferSelect;

// Client Applications table
export const clientApplications = pgTable("client_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountType: text("account_type").notNull().default("company"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  companyName: text("company_name"),
  crNumber: text("cr_number"), // Commercial Registration number
  taxNumber: text("tax_number"), // Tax Number
  nationalAddressStreet: text("national_address_street"),
  nationalAddressBuilding: text("national_address_building"),
  nationalAddressDistrict: text("national_address_district"),
  nationalAddressCity: text("national_address_city"),
  nationalAddressPostalCode: text("national_address_postal_code"),
  // Default Shipping Address fields
  shippingContactName: text("shipping_contact_name"),
  shippingContactPhone: text("shipping_contact_phone"),
  shippingCountryCode: text("shipping_country_code"),
  shippingStateOrProvince: text("shipping_state_or_province"),
  shippingCity: text("shipping_city"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingShortAddress: text("shipping_short_address"), // Short address code for KSA
  documents: text("documents").array(), // Array of document object paths
  status: text("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClientApplicationSchema = createInsertSchema(clientApplications).omit({
  id: true,
  createdAt: true,
  reviewedBy: true,
  reviewNotes: true,
});

export type InsertClientApplication = z.infer<typeof insertClientApplicationSchema>;
export type ClientApplication = typeof clientApplications.$inferSelect;

// Pricing Rules table (margins per profile)
export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profile: text("profile").notNull().unique(),
  displayName: text("display_name").notNull(),
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPricingRuleSchema = createInsertSchema(pricingRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRules.$inferSelect;

// Pricing Tiers table (tiered margins per profile based on shipment value)
export const pricingTiers = pgTable("pricing_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPricingTierSchema = createInsertSchema(pricingTiers).omit({
  id: true,
  createdAt: true,
});

export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type PricingTier = typeof pricingTiers.$inferSelect;

// Shipments table
export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackingNumber: text("tracking_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderAddress: text("sender_address").notNull(),
  senderCity: text("sender_city").notNull(),
  senderPostalCode: text("sender_postal_code"),
  senderCountry: text("sender_country").notNull(),
  senderPhone: text("sender_phone").notNull(),
  senderShortAddress: text("sender_short_address"),
  recipientName: text("recipient_name").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  recipientCity: text("recipient_city").notNull(),
  recipientPostalCode: text("recipient_postal_code"),
  recipientCountry: text("recipient_country").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  recipientShortAddress: text("recipient_short_address"),
  weight: decimal("weight", { precision: 10, scale: 2 }).notNull(),
  weightUnit: text("weight_unit").default("LB"),
  length: decimal("length", { precision: 10, scale: 2 }),
  width: decimal("width", { precision: 10, scale: 2 }),
  height: decimal("height", { precision: 10, scale: 2 }),
  dimensionUnit: text("dimension_unit").default("IN"),
  dimensions: text("dimensions"),
  packageType: text("package_type").notNull(),
  numberOfPackages: integer("number_of_packages").default(1),
  shipmentType: text("shipment_type").default("domestic"),
  serviceType: text("service_type"),
  currency: text("currency").default("USD"),
  status: text("status").notNull().default("draft"),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }).notNull(),
  marginAmount: decimal("margin_amount", { precision: 10, scale: 2 }),
  margin: decimal("margin", { precision: 10, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  carrierCode: text("carrier_code"),
  carrierName: text("carrier_name"),
  carrierServiceType: text("carrier_service_type"),
  carrierShipmentId: text("carrier_shipment_id"),
  carrierTrackingNumber: text("carrier_tracking_number"),
  labelUrl: text("label_url"),
  paymentIntentId: text("payment_intent_id"),
  paymentStatus: text("payment_status").default("pending"),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualDelivery: timestamp("actual_delivery"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  trackingNumber: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

// Shipment Rate Quotes table (for rate discovery)
export const shipmentRateQuotes = pgTable("shipment_rate_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  shipmentData: text("shipment_data").notNull(),
  carrierCode: text("carrier_code").notNull(),
  carrierName: text("carrier_name").notNull(),
  serviceType: text("service_type").notNull(),
  serviceName: text("service_name").notNull(),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }).notNull(),
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  marginAmount: decimal("margin_amount", { precision: 10, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  transitDays: integer("transit_days"),
  estimatedDelivery: timestamp("estimated_delivery"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShipmentRateQuoteSchema = createInsertSchema(shipmentRateQuotes).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentRateQuote = z.infer<typeof insertShipmentRateQuoteSchema>;
export type ShipmentRateQuote = typeof shipmentRateQuotes.$inferSelect;

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  shipmentId: varchar("shipment_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  zohoInvoiceId: text("zoho_invoice_id"), // Zoho Books invoice ID
  zohoInvoiceUrl: text("zoho_invoice_url"), // Link to Zoho invoice
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  invoiceNumber: true,
  createdAt: true,
  paidAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Payments table
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  clientAccountId: varchar("client_account_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status").notNull().default("pending"),
  transactionId: text("transaction_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"), // Stripe payment intent ID (legacy)
  moyasarPaymentId: text("moyasar_payment_id"), // Moyasar payment ID
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Client User Permissions table - stores permissions for each client user
export const clientUserPermissions = pgTable("client_user_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  clientAccountId: varchar("client_account_id").notNull(),
  permissions: text("permissions").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientUserPermissionSchema = createInsertSchema(clientUserPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientUserPermission = z.infer<typeof insertClientUserPermissionSchema>;
export type ClientUserPermission = typeof clientUserPermissions.$inferSelect;

// Audit Logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================
// RBAC TABLES (Role-Based Access Control)
// ============================================

// Roles table
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

// Permissions table
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  resource: text("resource").notNull(), // e.g., "shipments", "clients", "invoices"
  action: text("action").notNull(), // e.g., "create", "read", "update", "delete"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

// UserRoles junction table
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  roleId: varchar("role_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
});

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// RolePermissions junction table
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull(),
  permissionId: varchar("permission_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true,
});

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

// ============================================
// INTEGRATION AND WEBHOOK TABLES
// ============================================

// Integration Logs table (for FedEx, Zoho, etc.)
export const integrationLogs = pgTable("integration_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: text("service_name").notNull(), // e.g., "fedex", "zoho"
  operation: text("operation").notNull(), // e.g., "create_shipment", "sync_invoice"
  requestPayload: text("request_payload"),
  responsePayload: text("response_payload"),
  statusCode: integer("status_code"),
  success: boolean("success").notNull().default(false),
  errorMessage: text("error_message"),
  duration: integer("duration"), // in milliseconds
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertIntegrationLog = z.infer<typeof insertIntegrationLogSchema>;
export type IntegrationLog = typeof integrationLogs.$inferSelect;

// Webhook Events table
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // e.g., "fedex", "stripe"
  eventType: text("event_type").notNull(), // e.g., "shipment.status_update", "payment.completed"
  payload: text("payload").notNull(),
  signature: text("signature"),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// Login schema for validation
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

// Application form schema
export const applicationFormSchema = z.object({
  accountType: z.enum(["company", "individual"]),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(8, "Phone number must be at least 8 digits"),
  companyName: z.string().optional(),
  documents: z.array(z.string()).optional(),
  // Default Shipping Address
  shippingContactName: z.string().min(2, "Contact name is required"),
  shippingContactPhone: z.string().min(8, "Contact phone is required"),
  shippingCountryCode: z.string().min(2, "Country is required"),
  shippingStateOrProvince: z.string().min(2, "State/Province is required"),
  shippingCity: z.string().min(2, "City is required"),
  shippingPostalCode: z.string().min(3, "Postal code is required"),
  shippingAddressLine1: z.string().min(5, "Address is required"),
  shippingAddressLine2: z.string().optional(),
  shippingShortAddress: z.string().optional(),
}).refine(
  (data) => {
    // Require short address for Saudi Arabia
    if (data.shippingCountryCode === "SA") {
      return !!data.shippingShortAddress && data.shippingShortAddress.length >= 3;
    }
    return true;
  },
  {
    message: "Short address is required for Saudi Arabia addresses",
    path: ["shippingShortAddress"],
  }
);

export type ApplicationFormData = z.infer<typeof applicationFormSchema>;

// Shipment form schema for clients
export const createShipmentSchema = z.object({
  senderName: z.string().min(2, "Sender name is required"),
  senderAddress: z.string().min(5, "Sender address is required"),
  senderCity: z.string().min(2, "Sender city is required"),
  senderCountry: z.string().min(2, "Sender country is required"),
  senderPhone: z.string().min(8, "Sender phone is required"),
  recipientName: z.string().min(2, "Recipient name is required"),
  recipientAddress: z.string().min(5, "Recipient address is required"),
  recipientCity: z.string().min(2, "Recipient city is required"),
  recipientCountry: z.string().min(2, "Recipient country is required"),
  recipientPhone: z.string().min(8, "Recipient phone is required"),
  weight: z.string().min(1, "Weight is required"),
  dimensions: z.string().optional(),
  packageType: z.string().min(1, "Package type is required"),
});

export type CreateShipmentData = z.infer<typeof createShipmentSchema>;

// Idempotency records table for API idempotency
export const idempotencyRecords = pgTable("idempotency_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  response: text("response").notNull(),
  statusCode: integer("status_code").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertIdempotencyRecordSchema = createInsertSchema(idempotencyRecords).omit({
  id: true,
});

export type InsertIdempotencyRecord = z.infer<typeof insertIdempotencyRecordSchema>;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;

// Branding config type
export interface BrandingConfig {
  appName: string;
  primaryColor: string;
  logoUrl: string;
}

// Dashboard stats types
export interface AdminDashboardStats {
  totalClients: number;
  activeClients: number;
  pendingApplications: number;
  totalShipments: number;
  shipmentsInTransit: number;
  shipmentsDelivered: number;
  totalRevenue: number;
  monthlyRevenue: number;
}

export interface ClientDashboardStats {
  totalShipments: number;
  shipmentsInTransit: number;
  shipmentsDelivered: number;
  pendingInvoices: number;
  totalSpent: number;
}
