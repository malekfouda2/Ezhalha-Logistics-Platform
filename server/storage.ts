import {
  type User,
  type InsertUser,
  type ClientAccount,
  type InsertClientAccount,
  type ClientApplication,
  type InsertClientApplication,
  type Shipment,
  type InsertShipment,
  type Invoice,
  type InsertInvoice,
  type Payment,
  type InsertPayment,
  type PricingRule,
  type InsertPricingRule,
  type AuditLog,
  type InsertAuditLog,
  type Role,
  type InsertRole,
  type Permission,
  type InsertPermission,
  type UserRole,
  type InsertUserRole,
  type RolePermission,
  type InsertRolePermission,
  type IntegrationLog,
  type InsertIntegrationLog,
  type WebhookEvent,
  type InsertWebhookEvent,
  type ShipmentRateQuote,
  type InsertShipmentRateQuote,
  users,
  clientAccounts,
  clientApplications,
  shipments,
  invoices,
  payments,
  pricingRules,
  auditLogs,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  integrationLogs,
  webhookEvents,
  shipmentRateQuotes,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, isNull, and, gt, lt } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByClientAccount(clientAccountId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Client Accounts
  getClientAccounts(): Promise<ClientAccount[]>;
  getClientAccount(id: string): Promise<ClientAccount | undefined>;
  createClientAccount(account: InsertClientAccount): Promise<ClientAccount>;
  updateClientAccount(id: string, updates: Partial<ClientAccount>): Promise<ClientAccount | undefined>;
  deleteClientAccount(id: string): Promise<void>;

  // Client Applications
  getClientApplications(): Promise<ClientApplication[]>;
  getClientApplication(id: string): Promise<ClientApplication | undefined>;
  createClientApplication(application: InsertClientApplication): Promise<ClientApplication>;
  updateClientApplication(id: string, updates: Partial<ClientApplication>): Promise<ClientApplication | undefined>;

  // Shipments
  getShipments(): Promise<Shipment[]>;
  getShipmentsByClientAccount(clientAccountId: string): Promise<Shipment[]>;
  getShipment(id: string): Promise<Shipment | undefined>;
  getShipmentByPaymentId(paymentId: string): Promise<Shipment | undefined>;
  createShipment(shipment: InsertShipment): Promise<Shipment>;
  updateShipment(id: string, updates: Partial<Shipment>): Promise<Shipment | undefined>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoicesByClientAccount(clientAccountId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice | undefined>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPaymentsByClientAccount(clientAccountId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;

  // Pricing Rules
  getPricingRules(): Promise<PricingRule[]>;
  getPricingRuleByProfile(profile: string): Promise<PricingRule | undefined>;
  updatePricingRule(id: string, updates: Partial<PricingRule>): Promise<PricingRule | undefined>;

  // Audit Logs
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // Integration Logs
  getIntegrationLogs(): Promise<IntegrationLog[]>;
  createIntegrationLog(log: InsertIntegrationLog): Promise<IntegrationLog>;

  // Webhook Events
  getWebhookEvents(): Promise<WebhookEvent[]>;
  createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent>;
  updateWebhookEvent(id: string, updates: Partial<WebhookEvent>): Promise<WebhookEvent | undefined>;

  // RBAC - Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, updates: Partial<Role>): Promise<Role | undefined>;
  deleteRole(id: string): Promise<void>;

  // RBAC - Permissions
  getPermissions(): Promise<Permission[]>;
  getPermission(id: string): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  deletePermission(id: string): Promise<void>;

  // RBAC - User Roles
  getUserRoles(userId: string): Promise<UserRole[]>;
  assignUserRole(userRole: InsertUserRole): Promise<UserRole>;
  removeUserRole(userId: string, roleId: string): Promise<void>;

  // RBAC - Role Permissions
  getRolePermissions(roleId: string): Promise<RolePermission[]>;
  assignRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission>;
  removeRolePermission(roleId: string, permissionId: string): Promise<void>;

  // Shipment Rate Quotes
  getShipmentRateQuote(id: string): Promise<ShipmentRateQuote | undefined>;
  getValidShipmentRateQuotes(clientAccountId: string): Promise<ShipmentRateQuote[]>;
  createShipmentRateQuote(quote: InsertShipmentRateQuote): Promise<ShipmentRateQuote>;
  deleteExpiredShipmentRateQuotes(): Promise<void>;

  // Initialization
  initializeDefaults(): Promise<void>;
}

function generateTrackingNumber(): string {
  const prefix = "EZH";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

function generateInvoiceNumber(): string {
  const prefix = "INV";
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${year}-${random}`;
}

// DatabaseStorage implementation using Drizzle ORM
export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUsersByClientAccount(clientAccountId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.clientAccountId, clientAccountId));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // Client Accounts
  async getClientAccounts(): Promise<ClientAccount[]> {
    return db.select().from(clientAccounts)
      .where(isNull(clientAccounts.deletedAt))
      .orderBy(desc(clientAccounts.createdAt));
  }

  async getClientAccount(id: string): Promise<ClientAccount | undefined> {
    const [account] = await db.select().from(clientAccounts)
      .where(and(eq(clientAccounts.id, id), isNull(clientAccounts.deletedAt)));
    return account || undefined;
  }

  async createClientAccount(account: InsertClientAccount): Promise<ClientAccount> {
    const [newAccount] = await db.insert(clientAccounts).values(account).returning();
    return newAccount;
  }

  async updateClientAccount(id: string, updates: Partial<ClientAccount>): Promise<ClientAccount | undefined> {
    const [account] = await db.update(clientAccounts).set(updates)
      .where(and(eq(clientAccounts.id, id), isNull(clientAccounts.deletedAt)))
      .returning();
    return account || undefined;
  }

  async deleteClientAccount(id: string): Promise<void> {
    await db.update(clientAccounts).set({ deletedAt: new Date() }).where(eq(clientAccounts.id, id));
  }

  // Client Applications
  async getClientApplications(): Promise<ClientApplication[]> {
    return db.select().from(clientApplications).orderBy(desc(clientApplications.createdAt));
  }

  async getClientApplication(id: string): Promise<ClientApplication | undefined> {
    const [application] = await db.select().from(clientApplications).where(eq(clientApplications.id, id));
    return application || undefined;
  }

  async createClientApplication(application: InsertClientApplication): Promise<ClientApplication> {
    const [newApplication] = await db.insert(clientApplications).values(application).returning();
    return newApplication;
  }

  async updateClientApplication(id: string, updates: Partial<ClientApplication>): Promise<ClientApplication | undefined> {
    const [application] = await db.update(clientApplications).set(updates).where(eq(clientApplications.id, id)).returning();
    return application || undefined;
  }

  // Shipments
  async getShipments(): Promise<Shipment[]> {
    return db.select().from(shipments)
      .where(isNull(shipments.deletedAt))
      .orderBy(desc(shipments.createdAt));
  }

  async getShipmentsByClientAccount(clientAccountId: string): Promise<Shipment[]> {
    return db.select().from(shipments)
      .where(and(eq(shipments.clientAccountId, clientAccountId), isNull(shipments.deletedAt)))
      .orderBy(desc(shipments.createdAt));
  }

  async getShipment(id: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments)
      .where(and(eq(shipments.id, id), isNull(shipments.deletedAt)));
    return shipment || undefined;
  }

  async getShipmentByPaymentId(paymentId: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments)
      .where(and(eq(shipments.paymentIntentId, paymentId), isNull(shipments.deletedAt)));
    return shipment || undefined;
  }

  async createShipment(shipment: InsertShipment): Promise<Shipment> {
    const [newShipment] = await db.insert(shipments).values({
      ...shipment,
      trackingNumber: generateTrackingNumber(),
    }).returning();
    return newShipment;
  }

  async updateShipment(id: string, updates: Partial<Shipment>): Promise<Shipment | undefined> {
    const [shipment] = await db.update(shipments).set({
      ...updates,
      updatedAt: new Date(),
    }).where(and(eq(shipments.id, id), isNull(shipments.deletedAt))).returning();
    return shipment || undefined;
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(isNull(invoices.deletedAt))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByClientAccount(clientAccountId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(and(eq(invoices.clientAccountId, clientAccountId), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)));
    return invoice || undefined;
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values({
      ...invoice,
      invoiceNumber: generateInvoiceNumber(),
    }).returning();
    return newInvoice;
  }

  async updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice | undefined> {
    const [invoice] = await db.update(invoices).set(updates)
      .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)))
      .returning();
    return invoice || undefined;
  }

  // Payments
  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByClientAccount(clientAccountId: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.clientAccountId, clientAccountId)).orderBy(desc(payments.createdAt));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [payment] = await db.update(payments).set(updates).where(eq(payments.id, id)).returning();
    return payment || undefined;
  }

  // Pricing Rules
  async getPricingRules(): Promise<PricingRule[]> {
    return db.select().from(pricingRules);
  }

  async getPricingRuleByProfile(profile: string): Promise<PricingRule | undefined> {
    const [rule] = await db.select().from(pricingRules).where(eq(pricingRules.profile, profile));
    return rule || undefined;
  }

  async updatePricingRule(id: string, updates: Partial<PricingRule>): Promise<PricingRule | undefined> {
    const [rule] = await db.update(pricingRules).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(pricingRules.id, id)).returning();
    return rule || undefined;
  }

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db.insert(auditLogs).values(log).returning();
    return auditLog;
  }

  // Integration Logs
  async getIntegrationLogs(): Promise<IntegrationLog[]> {
    return db.select().from(integrationLogs).orderBy(desc(integrationLogs.createdAt));
  }

  async createIntegrationLog(log: InsertIntegrationLog): Promise<IntegrationLog> {
    const [integrationLog] = await db.insert(integrationLogs).values(log).returning();
    return integrationLog;
  }

  // Webhook Events
  async getWebhookEvents(): Promise<WebhookEvent[]> {
    return db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt));
  }

  async createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent> {
    const [webhookEvent] = await db.insert(webhookEvents).values(event).returning();
    return webhookEvent;
  }

  async updateWebhookEvent(id: string, updates: Partial<WebhookEvent>): Promise<WebhookEvent | undefined> {
    const [event] = await db.update(webhookEvents).set(updates).where(eq(webhookEvents.id, id)).returning();
    return event || undefined;
  }

  // RBAC - Roles
  async getRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(desc(roles.createdAt));
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [newRole] = await db.insert(roles).values(role).returning();
    return newRole;
  }

  async updateRole(id: string, updates: Partial<Role>): Promise<Role | undefined> {
    const [role] = await db.update(roles).set({ ...updates, updatedAt: new Date() }).where(eq(roles.id, id)).returning();
    return role || undefined;
  }

  async deleteRole(id: string): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  // RBAC - Permissions
  async getPermissions(): Promise<Permission[]> {
    return db.select().from(permissions).orderBy(desc(permissions.createdAt));
  }

  async getPermission(id: string): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions).where(eq(permissions.id, id));
    return permission || undefined;
  }

  async createPermission(permission: InsertPermission): Promise<Permission> {
    const [newPermission] = await db.insert(permissions).values(permission).returning();
    return newPermission;
  }

  async deletePermission(id: string): Promise<void> {
    await db.delete(permissions).where(eq(permissions.id, id));
  }

  // RBAC - User Roles
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }

  async assignUserRole(userRole: InsertUserRole): Promise<UserRole> {
    const [newUserRole] = await db.insert(userRoles).values(userRole).returning();
    return newUserRole;
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
  }

  // RBAC - Role Permissions
  async getRolePermissions(roleId: string): Promise<RolePermission[]> {
    return db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  }

  async assignRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission> {
    const [newRolePermission] = await db.insert(rolePermissions).values(rolePermission).returning();
    return newRolePermission;
  }

  async removeRolePermission(roleId: string, permissionId: string): Promise<void> {
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  }

  // Shipment Rate Quotes
  async getShipmentRateQuote(id: string): Promise<ShipmentRateQuote | undefined> {
    const [quote] = await db.select().from(shipmentRateQuotes)
      .where(and(eq(shipmentRateQuotes.id, id), gt(shipmentRateQuotes.expiresAt, new Date())));
    return quote || undefined;
  }

  async getValidShipmentRateQuotes(clientAccountId: string): Promise<ShipmentRateQuote[]> {
    return db.select().from(shipmentRateQuotes)
      .where(and(
        eq(shipmentRateQuotes.clientAccountId, clientAccountId),
        gt(shipmentRateQuotes.expiresAt, new Date())
      ))
      .orderBy(desc(shipmentRateQuotes.createdAt));
  }

  async createShipmentRateQuote(quote: InsertShipmentRateQuote): Promise<ShipmentRateQuote> {
    const [newQuote] = await db.insert(shipmentRateQuotes).values(quote).returning();
    return newQuote;
  }

  async deleteExpiredShipmentRateQuotes(): Promise<void> {
    await db.delete(shipmentRateQuotes).where(lt(shipmentRateQuotes.expiresAt, new Date()));
  }

  // Initialize default data if database is empty
  async initializeDefaults(): Promise<void> {
    // Check if admin user already exists
    const existingAdmin = await this.getUserByUsername("admin");
    if (existingAdmin) {
      console.log("Database already initialized");
      return;
    }

    console.log("Initializing database with default data...");

    // Create admin user with hashed password
    const adminHashedPassword = await bcrypt.hash("admin123", SALT_ROUNDS);
    await db.insert(users).values({
      username: "admin",
      email: "admin@ezhalha.com",
      password: adminHashedPassword,
      userType: "admin",
      isActive: true,
    });

    // Create default pricing rules (only if they don't exist)
    const existingRules = await this.getPricingRules();
    if (existingRules.length === 0) {
      const pricingData = [
        { profile: "regular", marginPercentage: "20.00" },
        { profile: "mid_level", marginPercentage: "15.00" },
        { profile: "vip", marginPercentage: "10.00" },
      ];

      for (const rule of pricingData) {
        await db.insert(pricingRules).values(rule);
      }
    }

    // Create sample client account (if it doesn't exist)
    const existingClients = await this.getClientAccounts();
    let demoClientAccount = existingClients.find(c => c.email === "demo@company.com");
    
    if (!demoClientAccount) {
      const [clientAccount] = await db.insert(clientAccounts).values({
        name: "Demo Company",
        email: "demo@company.com",
        phone: "+1 555 123 4567",
        country: "United States",
        profile: "regular",
        isActive: true,
      }).returning();
      demoClientAccount = clientAccount;

      // Create sample shipments for new client account
      const shipmentData = [
        { status: "delivered", recipientCity: "New York", recipientCountry: "United States", senderCity: "Los Angeles", senderCountry: "United States" },
        { status: "in_transit", recipientCity: "London", recipientCountry: "United Kingdom", senderCity: "Dubai", senderCountry: "United Arab Emirates" },
        { status: "processing", recipientCity: "Tokyo", recipientCountry: "Japan", senderCity: "Singapore", senderCountry: "Singapore" },
      ];

      for (const data of shipmentData) {
        const baseRate = 50 + Math.random() * 100;
        const margin = baseRate * 0.2;
        await db.insert(shipments).values({
          trackingNumber: generateTrackingNumber(),
          clientAccountId: demoClientAccount.id,
          senderName: "John Sender",
          senderAddress: "123 Main St",
          senderCity: data.senderCity,
          senderCountry: data.senderCountry,
          senderPhone: "+1 555 000 0001",
          recipientName: "Jane Recipient",
          recipientAddress: "456 Oak Ave",
          recipientCity: data.recipientCity,
          recipientCountry: data.recipientCountry,
          recipientPhone: "+1 555 000 0002",
          weight: String((1 + Math.random() * 10).toFixed(2)),
          dimensions: "30x20x15",
          packageType: "parcel",
          status: data.status,
          baseRate: baseRate.toFixed(2),
          margin: margin.toFixed(2),
          finalPrice: (baseRate + margin).toFixed(2),
          carrierName: "FedEx",
          estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

      // Create sample invoices for new client account
      const invoiceData = [
        { status: "completed", amount: "125.50" },
        { status: "pending", amount: "89.00" },
      ];

      for (const data of invoiceData) {
        await db.insert(invoices).values({
          invoiceNumber: generateInvoiceNumber(),
          clientAccountId: demoClientAccount.id,
          amount: data.amount,
          status: data.status,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paidAt: data.status === "completed" ? new Date() : null,
        });
      }
    }

    // Create client user with hashed password (linked to existing or new demo account)
    const clientHashedPassword = await bcrypt.hash("client123", SALT_ROUNDS);
    await db.insert(users).values({
      username: "client",
      email: "demo@company.com",
      password: clientHashedPassword,
      userType: "client",
      clientAccountId: demoClientAccount.id,
      isActive: true,
    });

    // Create sample pending applications (only if none exist)
    const existingApplications = await this.getClientApplications();
    if (existingApplications.length === 0) {
      const applicationData = [
        { name: "Sarah Johnson", email: "sarah@techcorp.com", country: "United States", companyName: "TechCorp Inc" },
        { name: "Mohammed Al-Rashid", email: "mohammed@tradeco.ae", country: "United Arab Emirates", companyName: "TradeCo" },
      ];

      for (const data of applicationData) {
        await db.insert(clientApplications).values({
          name: data.name,
          email: data.email,
          phone: "+1 555 999 0000",
          country: data.country,
          companyName: data.companyName,
          status: "pending",
        });
      }
    }

    console.log("Database initialization complete!");
  }
}

export const storage = new DatabaseStorage();
