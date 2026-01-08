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

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  userType: text("user_type").notNull().default("client"),
  clientAccountId: varchar("client_account_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  profile: text("profile").notNull().default("regular"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClientAccountSchema = createInsertSchema(clientAccounts).omit({
  id: true,
  createdAt: true,
});

export type InsertClientAccount = z.infer<typeof insertClientAccountSchema>;
export type ClientAccount = typeof clientAccounts.$inferSelect;

// Client Applications table
export const clientApplications = pgTable("client_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
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

// Shipments table
export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackingNumber: text("tracking_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderAddress: text("sender_address").notNull(),
  senderCity: text("sender_city").notNull(),
  senderCountry: text("sender_country").notNull(),
  senderPhone: text("sender_phone").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  recipientCity: text("recipient_city").notNull(),
  recipientCountry: text("recipient_country").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  weight: decimal("weight", { precision: 10, scale: 2 }).notNull(),
  dimensions: text("dimensions"),
  packageType: text("package_type").notNull(),
  status: text("status").notNull().default("processing"),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }).notNull(),
  margin: decimal("margin", { precision: 10, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  carrierName: text("carrier_name"),
  estimatedDelivery: timestamp("estimated_delivery"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  trackingNumber: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

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

// Login schema for validation
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

// Application form schema
export const applicationFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(8, "Phone number must be at least 8 digits"),
  country: z.string().min(2, "Country is required"),
  companyName: z.string().min(2, "Company name is required"),
  crNumber: z.string().min(5, "Commercial Registration number is required"),
  taxNumber: z.string().min(5, "Tax number is required"),
  nationalAddressStreet: z.string().min(3, "Street address is required"),
  nationalAddressBuilding: z.string().min(1, "Building number is required"),
  nationalAddressDistrict: z.string().min(2, "District is required"),
  nationalAddressCity: z.string().min(2, "City is required"),
  nationalAddressPostalCode: z.string().min(4, "Postal code is required"),
});

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
