import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import type { ClientAccount } from "@shared/schema";
import { logInfo, logError, logAuditToFile, logApiRequest, logWebhook, logPricingChange, logProfileChange } from "./services/logger";
import { sendAccountCredentials, sendApplicationReceived, sendApplicationRejected, notifyAdminNewApplication } from "./services/email";
import { fedexAdapter } from "./integrations/fedex";
import { zohoService } from "./integrations/zoho";
import { stripeService } from "./integrations/stripe";
import { moyasarService } from "./integrations/moyasar";
import Stripe from "stripe";
import { getIdempotencyRecord, setIdempotencyRecord } from "./services/idempotency";

const SALT_ROUNDS = 10;

// Rate limiter for general API requests
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: { error: "Too many login attempts, please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

// Track failed login attempts for additional brute-force protection
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: number }>();

function checkBruteForce(identifier: string): { blocked: boolean; remainingTime?: number } {
  const now = Date.now();
  const maxAttempts = 5;
  const lockoutTime = 15 * 60 * 1000; // 15 minutes
  
  const attempts = failedLoginAttempts.get(identifier);
  if (!attempts) return { blocked: false };
  
  // Reset if lockout period has passed
  if (now - attempts.lastAttempt > lockoutTime) {
    failedLoginAttempts.delete(identifier);
    return { blocked: false };
  }
  
  if (attempts.count >= maxAttempts) {
    return { 
      blocked: true, 
      remainingTime: Math.ceil((lockoutTime - (now - attempts.lastAttempt)) / 1000) 
    };
  }
  
  return { blocked: false };
}

function recordFailedLogin(identifier: string) {
  const now = Date.now();
  const attempts = failedLoginAttempts.get(identifier);
  
  if (attempts) {
    attempts.count++;
    attempts.lastAttempt = now;
  } else {
    failedLoginAttempts.set(identifier, { count: 1, lastAttempt: now });
  }
}

function clearFailedLogins(identifier: string) {
  failedLoginAttempts.delete(identifier);
}
import {
  loginSchema,
  applicationFormSchema,
  createShipmentSchema,
  type BrandingConfig,
  type AdminDashboardStats,
  type ClientDashboardStats,
} from "@shared/schema";
import { z } from "zod";

// Password change validation schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});
import MemoryStore from "memorystore";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const MemoryStoreSession = MemoryStore(session);

// Middleware to check authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Middleware to check admin role
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.userType !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// Middleware to check client role
async function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.userType !== "client") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// Audit logging helper - writes to both database and file
async function logAudit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
  ipAddress?: string
) {
  try {
    // Write to database
    await storage.createAuditLog({
      userId: userId || null,
      action,
      entityType,
      entityId: entityId || null,
      details: details || null,
      ipAddress: ipAddress || null,
    });
    
    // Write to file for persistent storage
    logAuditToFile({
      userId: userId || "system",
      action,
      resource: entityType,
      resourceId: entityId,
      details,
      ipAddress,
    });
  } catch (error) {
    logError("Failed to create audit log", error);
  }
}

// Default permissions for the platform
const DEFAULT_PERMISSIONS = [
  // Clients
  { resource: "clients", action: "create", description: "Create new client accounts" },
  { resource: "clients", action: "read", description: "View client information" },
  { resource: "clients", action: "update", description: "Update client details" },
  { resource: "clients", action: "delete", description: "Delete client accounts" },
  { resource: "clients", action: "activate", description: "Activate or deactivate clients" },
  
  // Shipments
  { resource: "shipments", action: "create", description: "Create new shipments" },
  { resource: "shipments", action: "read", description: "View shipment information" },
  { resource: "shipments", action: "update", description: "Update shipment details" },
  { resource: "shipments", action: "delete", description: "Delete shipments" },
  { resource: "shipments", action: "cancel", description: "Cancel shipments" },
  { resource: "shipments", action: "track", description: "Track shipment status" },
  
  // Invoices
  { resource: "invoices", action: "create", description: "Create new invoices" },
  { resource: "invoices", action: "read", description: "View invoice information" },
  { resource: "invoices", action: "update", description: "Update invoice details" },
  { resource: "invoices", action: "delete", description: "Delete invoices" },
  { resource: "invoices", action: "download", description: "Download invoice PDFs" },
  { resource: "invoices", action: "sync", description: "Sync invoices with Zoho" },
  
  // Payments
  { resource: "payments", action: "read", description: "View payment information" },
  { resource: "payments", action: "create", description: "Process payments" },
  { resource: "payments", action: "refund", description: "Issue payment refunds" },
  
  // Applications
  { resource: "applications", action: "read", description: "View client applications" },
  { resource: "applications", action: "approve", description: "Approve client applications" },
  { resource: "applications", action: "reject", description: "Reject client applications" },
  
  // Pricing Rules
  { resource: "pricing-rules", action: "create", description: "Create pricing rules" },
  { resource: "pricing-rules", action: "read", description: "View pricing rules" },
  { resource: "pricing-rules", action: "update", description: "Update pricing rules" },
  { resource: "pricing-rules", action: "delete", description: "Delete pricing rules" },
  
  // Audit Logs
  { resource: "audit-logs", action: "read", description: "View audit logs" },
  
  // Users
  { resource: "users", action: "create", description: "Create new users" },
  { resource: "users", action: "read", description: "View user information" },
  { resource: "users", action: "update", description: "Update user details" },
  { resource: "users", action: "delete", description: "Delete users" },
  { resource: "users", action: "reset-password", description: "Reset user passwords" },
  
  // Roles
  { resource: "roles", action: "create", description: "Create new roles" },
  { resource: "roles", action: "read", description: "View roles" },
  { resource: "roles", action: "update", description: "Update role details" },
  { resource: "roles", action: "delete", description: "Delete roles" },
  { resource: "roles", action: "assign", description: "Assign roles to users" },
  
  // Permissions
  { resource: "permissions", action: "create", description: "Create new permissions" },
  { resource: "permissions", action: "read", description: "View permissions" },
  { resource: "permissions", action: "delete", description: "Delete permissions" },
  { resource: "permissions", action: "assign", description: "Assign permissions to roles" },
  
  // Settings
  { resource: "settings", action: "read", description: "View system settings" },
  { resource: "settings", action: "update", description: "Update system settings" },
  
  // Integrations
  { resource: "integrations", action: "read", description: "View integration status" },
  { resource: "integrations", action: "configure", description: "Configure integrations" },
  
  // Webhooks
  { resource: "webhooks", action: "read", description: "View webhook events" },
  
  // Dashboard
  { resource: "dashboard", action: "read", description: "View admin dashboard" },
  { resource: "dashboard", action: "export", description: "Export dashboard reports" },
];

async function seedDefaultPermissions() {
  try {
    const existingPermissions = await storage.getPermissions();
    
    if (existingPermissions.length === 0) {
      logInfo("Seeding default permissions...");
      
      for (const perm of DEFAULT_PERMISSIONS) {
        await storage.createPermission({
          name: `${perm.resource}:${perm.action}`,
          resource: perm.resource,
          action: perm.action,
          description: perm.description,
        });
      }
      
      logInfo(`Seeded ${DEFAULT_PERMISSIONS.length} default permissions`);
    }
  } catch (error) {
    logError("Error seeding default permissions", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed default permissions on startup
  await seedDefaultPermissions();
  
  // Trust proxy for rate limiting behind reverse proxy
  app.set("trust proxy", 1);

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
    })
  );

  // General rate limiting
  app.use("/api/", generalLimiter);

  // Session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "ezhalha-secret-key-dev",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStoreSession({
        checkPeriod: 86400000, // prune expired entries every 24h
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "lax", // CSRF protection
      },
    })
  );

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      service: "ezhalha"
    });
  });

  // ============================================
  // BRANDING CONFIG
  // ============================================
  app.get("/api/config/branding", (_req, res) => {
    const config: BrandingConfig = {
      appName: "ezhalha",
      primaryColor: "#fe5200",
      logoUrl: "/assets/branding/logo.png",
    };
    res.json(config);
  });

  // ============================================
  // AUTH ROUTES
  // ============================================
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const identifier = req.ip || data.username;
      
      // Check brute-force protection
      const bruteForceCheck = checkBruteForce(identifier);
      if (bruteForceCheck.blocked) {
        await logAudit(undefined, "login_blocked", "security", undefined, 
          `Login blocked for ${identifier} due to brute-force protection`, req.ip);
        return res.status(429).json({ 
          error: `Too many failed attempts. Try again in ${bruteForceCheck.remainingTime} seconds.` 
        });
      }
      
      const user = await storage.getUserByUsername(data.username);

      if (!user) {
        recordFailedLogin(identifier);
        await logAudit(undefined, "login_failed", "security", undefined, 
          `Failed login attempt for username: ${data.username}`, req.ip);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.password);
      if (!passwordMatch) {
        recordFailedLogin(identifier);
        await logAudit(user.id, "login_failed", "security", user.id, 
          `Failed login attempt for user: ${user.username}`, req.ip);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "Account is deactivated" });
      }

      // Clear failed login attempts on successful login
      clearFailedLogins(identifier);
      
      req.session.userId = user.id;
      
      // Log successful login
      await logAudit(user.id, "login", "user", user.id, `User ${user.username} logged in`, req.ip);
      
      // Don't send password to client
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const { password, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  });

  // Change Password (requires authentication)
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      // Validate request body with Zod schema
      const validationResult = changePasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors[0].message });
      }
      
      const { currentPassword, newPassword } = validationResult.data;
      
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword, updatedAt: new Date() });
      
      // Clear brute-force tracking for this user on successful password change
      if (user.username) {
        clearFailedLogins(user.username);
      }
      if (user.email) {
        clearFailedLogins(user.email);
      }
      
      // Log the password change to audit log
      await logAudit(user.id, "change_password", "user", user.id, 
        `User changed their password`, req.ip);
      
      logInfo("User changed password", { userId: user.id });
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to change password", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // ============================================
  // PUBLIC ROUTES - CLIENT APPLICATIONS
  // ============================================
  app.post("/api/applications", async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }
      
      const data = applicationFormSchema.parse(req.body);
      const application = await storage.createClientApplication({
        ...data,
        documents: data.documents || null,
        status: "pending",
      });
      
      // Send confirmation email to applicant
      await sendApplicationReceived(data.email, data.name, application.id);
      
      // Notify admin of new application
      await notifyAdminNewApplication(
        application.id, 
        data.name, 
        data.email, 
        data.companyName || undefined
      );
      
      // Log the application
      logInfo("New client application received", { 
        applicationId: application.id, 
        email: data.email,
        name: data.name 
      });
      
      const response = application;
      
      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 201);
      }
      
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create application", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ADMIN ROUTES
  // ============================================

  // Admin Dashboard Stats
  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    const clients = await storage.getClientAccounts();
    const shipments = await storage.getShipments();
    const applications = await storage.getClientApplications();

    const stats: AdminDashboardStats = {
      totalClients: clients.length,
      activeClients: clients.filter((c) => c.isActive).length,
      pendingApplications: applications.filter((a) => a.status === "pending").length,
      totalShipments: shipments.length,
      shipmentsInTransit: shipments.filter((s) => s.status === "in_transit").length,
      shipmentsDelivered: shipments.filter((s) => s.status === "delivered").length,
      totalRevenue: shipments.reduce((sum, s) => sum + Number(s.finalPrice), 0),
      monthlyRevenue: shipments
        .filter((s) => {
          const shipmentDate = new Date(s.createdAt);
          const now = new Date();
          return (
            shipmentDate.getMonth() === now.getMonth() &&
            shipmentDate.getFullYear() === now.getFullYear()
          );
        })
        .reduce((sum, s) => sum + Number(s.finalPrice), 0),
    };

    res.json(stats);
  });

  // Admin - Recent Shipments
  app.get("/api/admin/shipments/recent", requireAdmin, async (_req, res) => {
    const shipments = await storage.getShipments();
    res.json(shipments.slice(0, 10));
  });

  // Admin - All Shipments
  app.get("/api/admin/shipments", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await storage.getShipmentsPaginated({ page, limit, search, status });
      res.json(result);
    } catch (error) {
      logError("Error fetching shipments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Shipment Status (cancelled is handled by dedicated cancel endpoint)
  const statusUpdateSchema = z.object({
    status: z.enum(["created", "processing", "in_transit", "delivered"]),
  });

  app.patch("/api/admin/shipments/:id/status", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const parseResult = statusUpdateSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      
      const { status } = parseResult.data;

      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const updated = await storage.updateShipment(id, { status });
      
      // Log status change
      await logAudit(req.session.userId, "update_shipment_status", "shipment", id,
        `Changed shipment ${shipment.trackingNumber} status from ${shipment.status} to ${status}`, req.ip);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Cancel Shipment
  app.post("/api/admin/shipments/:id/cancel", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.status === "delivered") {
        return res.status(400).json({ error: "Cannot cancel delivered shipment" });
      }

      if (shipment.status === "cancelled") {
        return res.status(400).json({ error: "Shipment already cancelled" });
      }

      const updated = await storage.updateShipment(id, { status: "cancelled" });
      
      // Log cancellation
      await logAudit(req.session.userId, "cancel_shipment", "shipment", id,
        `Cancelled shipment ${shipment.trackingNumber}`, req.ip);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Pending Applications
  app.get("/api/admin/applications/pending", requireAdmin, async (_req, res) => {
    const applications = await storage.getClientApplications();
    res.json(applications.filter((a) => a.status === "pending"));
  });

  // Admin - All Applications
  app.get("/api/admin/applications", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await storage.getClientApplicationsPaginated({ page, limit, search, status });
      res.json(result);
    } catch (error) {
      logError("Error fetching applications", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Review Application
  app.post("/api/admin/applications/:id/review", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { action, profile, notes } = req.body;

      const application = await storage.getClientApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status !== "pending") {
        return res.status(400).json({ error: "Application already reviewed" });
      }

      if (action === "approve") {
        // Check if a user with this email already exists
        const existingUser = await storage.getUserByEmail(application.email);
        if (existingUser) {
          return res.status(400).json({ error: "A user with this email already exists" });
        }

        // Create client account with all company document fields
        const clientAccount = await storage.createClientAccount({
          name: application.name,
          email: application.email,
          phone: application.phone,
          country: application.country,
          companyName: application.companyName,
          crNumber: application.crNumber,
          taxNumber: application.taxNumber,
          nationalAddressStreet: application.nationalAddressStreet,
          nationalAddressBuilding: application.nationalAddressBuilding,
          nationalAddressDistrict: application.nationalAddressDistrict,
          nationalAddressCity: application.nationalAddressCity,
          nationalAddressPostalCode: application.nationalAddressPostalCode,
          documents: application.documents,
          profile: profile || "regular",
          isActive: true,
        });

        // Create Zoho Books customer (if configured)
        if (zohoService.isConfigured()) {
          try {
            const zohoCustomerId = await zohoService.createCustomer({
              name: application.name,
              email: application.email,
              phone: application.phone,
              companyName: application.companyName || undefined,
              country: application.country,
            });
            if (zohoCustomerId) {
              await storage.updateClientAccount(clientAccount.id, { zohoCustomerId });
            }
          } catch (error) {
            logError("Failed to create Zoho customer", error);
          }
        }

        // Create user for client - generate unique username if needed
        let username = application.email.split("@")[0];
        let existingUsername = await storage.getUserByUsername(username);
        let counter = 1;
        while (existingUsername) {
          username = `${application.email.split("@")[0]}${counter}`;
          existingUsername = await storage.getUserByUsername(username);
          counter++;
        }
        
        // Hash the default password
        const hashedPassword = await bcrypt.hash("welcome123", SALT_ROUNDS);
        
        await storage.createUser({
          username,
          email: application.email,
          password: hashedPassword,
          userType: "client",
          clientAccountId: clientAccount.id,
          isActive: true,
        });

        // Update application
        await storage.updateClientApplication(id, {
          status: "approved",
          reviewedBy: req.session.userId,
          reviewNotes: notes,
        });

        // Log application approval
        await logAudit(req.session.userId, "approve_application", "client_application", id, 
          `Approved application for ${application.email}, created client account`, req.ip);
        
        // Send email with credentials
        const temporaryPassword = "welcome123";
        await sendAccountCredentials(
          application.email,
          application.name,
          username,
          temporaryPassword
        );
        
        res.json({ success: true, clientAccount });
      } else if (action === "reject") {
        await storage.updateClientApplication(id, {
          status: "rejected",
          reviewedBy: req.session.userId,
          reviewNotes: notes,
        });
        
        // Log application rejection
        await logAudit(req.session.userId, "reject_application", "client_application", id,
          `Rejected application for ${application.email}`, req.ip);
        
        // Send rejection email
        await sendApplicationRejected(application.email, application.name, notes);
        
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
    } catch (error) {
      console.error("Error reviewing application:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - All Clients
  app.get("/api/admin/clients", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const profile = req.query.profile as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await storage.getClientAccountsPaginated({ page, limit, search, profile, status });
      res.json(result);
    } catch (error) {
      logError("Error fetching clients", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Get Single Client
  app.get("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const client = await storage.getClientAccount(id);
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      // Get client's user accounts
      const users = await storage.getUsersByClientAccount(id);
      
      // Get client's shipment count
      const shipments = await storage.getShipmentsByClientAccount(id);
      
      // Get client's invoice count
      const invoices = await storage.getInvoicesByClientAccount(id);
      
      res.json({
        ...client,
        users: users.map(u => ({ id: u.id, username: u.username, email: u.email, isActive: u.isActive })),
        shipmentCount: shipments.length,
        invoiceCount: invoices.length,
      });
    } catch (error) {
      logError("Error getting client details", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Create Client
  app.post("/api/admin/clients", requireAdmin, async (req, res) => {
    try {
      const { name, email, phone, country, companyName, documents, profile } = req.body;
      
      if (!name || !email || !phone || !country) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if user with this email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }

      const client = await storage.createClientAccount({
        name,
        email,
        phone,
        country,
        companyName: companyName || null,
        documents: documents || null,
        profile: profile || "regular",
        isActive: true,
      });

      // Create Zoho Books customer (if configured)
      if (zohoService.isConfigured()) {
        try {
          const zohoCustomerId = await zohoService.createCustomer({
            name,
            email,
            phone,
            companyName: companyName || undefined,
            country,
          });
          if (zohoCustomerId) {
            await storage.updateClientAccount(client.id, { zohoCustomerId });
          }
        } catch (error) {
          logError("Failed to create Zoho customer", error);
        }
      }

      // Create user for the client with a hashed password
      let username = email.split("@")[0];
      let existingUsername = await storage.getUserByUsername(username);
      let counter = 1;
      while (existingUsername) {
        username = `${email.split("@")[0]}${counter}`;
        existingUsername = await storage.getUserByUsername(username);
        counter++;
      }
      
      const hashedPassword = await bcrypt.hash("welcome123", SALT_ROUNDS);
      await storage.createUser({
        username,
        email,
        password: hashedPassword,
        userType: "client",
        clientAccountId: client.id,
        isActive: true,
      });

      // Log client creation
      await logAudit(req.session.userId, "create_client", "client_account", client.id,
        `Created client account for ${name} (${email})`, req.ip);

      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Delete Client
  app.delete("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const client = await storage.getClientAccount(id);
      await storage.deleteClientAccount(id);
      
      // Log client deletion
      await logAudit(req.session.userId, "delete_client", "client_account", id,
        `Deleted client account ${client?.name || id}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Client Profile
  app.patch("/api/admin/clients/:id/profile", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { profile } = req.body;

      // Validate profile against actual pricing rules in database
      const pricingRules = await storage.getPricingRules();
      const validProfiles = pricingRules.map(r => r.profile);
      if (!validProfiles.includes(profile)) {
        return res.status(400).json({ error: "Invalid profile" });
      }

      const client = await storage.getClientAccount(id);
      const oldProfile = client?.profile;
      
      const updated = await storage.updateClientAccount(id, { profile });
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Log profile change
      await logAudit(req.session.userId, "update_client_profile", "client_account", id,
        `Changed profile from ${oldProfile} to ${profile} for ${client?.name}`, req.ip);

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Toggle Client Status
  app.patch("/api/admin/clients/:id/status", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const updated = await storage.updateClientAccount(id, { isActive });
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Full Update Client
  app.patch("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, phone, country, companyName, crNumber, taxNumber, 
              nationalAddressStreet, nationalAddressBuilding, nationalAddressDistrict,
              nationalAddressCity, nationalAddressPostalCode, profile, isActive } = req.body;

      const updates: Partial<ClientAccount> = {};
      if (name !== undefined) updates.name = name;
      if (phone !== undefined) updates.phone = phone;
      if (country !== undefined) updates.country = country;
      if (companyName !== undefined) updates.companyName = companyName;
      if (crNumber !== undefined) updates.crNumber = crNumber;
      if (taxNumber !== undefined) updates.taxNumber = taxNumber;
      if (nationalAddressStreet !== undefined) updates.nationalAddressStreet = nationalAddressStreet;
      if (nationalAddressBuilding !== undefined) updates.nationalAddressBuilding = nationalAddressBuilding;
      if (nationalAddressDistrict !== undefined) updates.nationalAddressDistrict = nationalAddressDistrict;
      if (nationalAddressCity !== undefined) updates.nationalAddressCity = nationalAddressCity;
      if (nationalAddressPostalCode !== undefined) updates.nationalAddressPostalCode = nationalAddressPostalCode;
      if (profile !== undefined) {
        const pricingRules = await storage.getPricingRules();
        const validProfiles = pricingRules.map(r => r.profile);
        if (validProfiles.includes(profile)) updates.profile = profile;
      }
      if (isActive !== undefined) updates.isActive = isActive;

      const updated = await storage.updateClientAccount(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }

      await logAudit(req.session.userId, "update_client", "client_account", id,
        `Updated client account ${updated.name}`, req.ip);

      res.json(updated);
    } catch (error) {
      logError("Error updating client", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - All Invoices
  app.get("/api/admin/invoices", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await storage.getInvoicesPaginated({ page, limit, search, status });
      res.json(result);
    } catch (error) {
      logError("Error fetching invoices", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Get Single Invoice
  app.get("/api/admin/invoices/:id", requireAdmin, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      // Get client account info
      const client = await storage.getClientAccount(invoice.clientAccountId);
      
      res.json({ ...invoice, client });
    } catch (error) {
      logError("Error fetching invoice", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Download Invoice PDF
  app.get("/api/admin/invoices/:id/pdf", requireAdmin, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const client = await storage.getClientAccount(invoice.clientAccountId);
      
      // Generate simple HTML invoice
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Invoice ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .logo { font-size: 24px; font-weight: bold; color: #fe5200; }
            .invoice-info { text-align: right; }
            .invoice-number { font-size: 20px; font-weight: bold; }
            .client-info { margin-bottom: 30px; }
            .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            .table th { background: #f5f5f5; }
            .total-row { font-weight: bold; font-size: 18px; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
            .status-pending { background: #fef3c7; color: #92400e; }
            .status-paid { background: #d1fae5; color: #065f46; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">ezhalha</div>
            <div class="invoice-info">
              <div class="invoice-number">${invoice.invoiceNumber}</div>
              <div>Date: ${new Date(invoice.createdAt).toLocaleDateString()}</div>
              <div>Due: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
              <div class="status ${invoice.status === 'pending' ? 'status-pending' : 'status-paid'}">
                ${invoice.status === 'pending' ? 'Pending' : 'Paid'}
              </div>
            </div>
          </div>
          
          <div class="client-info">
            <strong>Bill To:</strong><br>
            ${client?.name || 'N/A'}<br>
            ${client?.companyName ? client.companyName + '<br>' : ''}
            ${client?.email || ''}<br>
            ${client?.phone || ''}
          </div>
          
          <table class="table">
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Shipping Services</td>
                <td style="text-align: right;">$${Number(invoice.amount).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>Total</td>
                <td style="text-align: right;">$${Number(invoice.amount).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>ezhalha Logistics - Enterprise Shipping Solutions</p>
          </div>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoiceNumber}.html"`);
      res.send(html);
    } catch (error) {
      logError("Error generating invoice PDF", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - All Payments
  app.get("/api/admin/payments", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await storage.getPaymentsPaginated({ page, limit, search, status });
      res.json(result);
    } catch (error) {
      logError("Error fetching payments", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Pricing Rules
  app.get("/api/admin/pricing", requireAdmin, async (_req, res) => {
    const rules = await storage.getPricingRules();
    res.json(rules);
  });

  // Admin - Create Pricing Profile
  app.post("/api/admin/pricing", requireAdmin, async (req, res) => {
    try {
      const { profile, displayName, marginPercentage } = req.body;
      
      if (!profile || !displayName) {
        return res.status(400).json({ error: "Profile key and display name are required" });
      }

      // Validate profile key format (lowercase, underscores, no spaces)
      const profileKey = profile.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (!profileKey) {
        return res.status(400).json({ error: "Invalid profile key" });
      }

      // Check if profile already exists
      const existing = await storage.getPricingRuleByProfile(profileKey);
      if (existing) {
        return res.status(400).json({ error: "A profile with this key already exists" });
      }

      const margin = parseFloat(marginPercentage || "15");
      if (isNaN(margin) || margin < 0 || margin > 100) {
        return res.status(400).json({ error: "Invalid margin percentage" });
      }

      const newRule = await storage.createPricingRule({
        profile: profileKey,
        displayName: displayName.trim(),
        marginPercentage: margin.toFixed(2),
        isActive: true,
      });

      await logAudit(req.session.userId, "create_pricing_profile", "pricing_rule", newRule.id,
        `Created pricing profile: ${displayName} with ${margin}% margin`, req.ip);

      res.status(201).json(newRule);
    } catch (error) {
      logError("Error creating pricing profile", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Update Pricing Rule
  app.patch("/api/admin/pricing/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { marginPercentage, displayName, isActive } = req.body;
      
      const updates: { marginPercentage?: string; displayName?: string; isActive?: boolean } = {};

      if (marginPercentage !== undefined) {
        const margin = parseFloat(marginPercentage);
        if (isNaN(margin) || margin < 0 || margin > 100) {
          return res.status(400).json({ error: "Invalid margin percentage" });
        }
        updates.marginPercentage = margin.toFixed(2);
      }

      if (displayName !== undefined) {
        if (!displayName.trim()) {
          return res.status(400).json({ error: "Display name cannot be empty" });
        }
        updates.displayName = displayName.trim();
      }

      if (isActive !== undefined) {
        updates.isActive = isActive;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid updates provided" });
      }

      const updated = await storage.updatePricingRule(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Pricing rule not found" });
      }

      const changeDetails = [];
      if (updates.marginPercentage) changeDetails.push(`margin to ${updates.marginPercentage}%`);
      if (updates.displayName) changeDetails.push(`name to "${updates.displayName}"`);
      if (updates.isActive !== undefined) changeDetails.push(`active to ${updates.isActive}`);

      await logAudit(req.session.userId, "update_pricing", "pricing_rule", id,
        `Updated ${changeDetails.join(", ")}`, req.ip);

      res.json(updated);
    } catch (error) {
      logError("Error updating pricing rule", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Delete Pricing Profile
  app.delete("/api/admin/pricing/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if profile exists
      const rules = await storage.getPricingRules();
      const rule = rules.find(r => r.id === id);
      if (!rule) {
        return res.status(404).json({ error: "Pricing rule not found" });
      }

      // Don't allow deleting if there are clients using this profile
      const clients = await storage.getClientAccounts();
      const clientsUsingProfile = clients.filter(c => c.profile === rule.profile);
      if (clientsUsingProfile.length > 0) {
        return res.status(400).json({ 
          error: `Cannot delete profile. ${clientsUsingProfile.length} client(s) are using this profile.` 
        });
      }

      await storage.deletePricingRule(id);
      
      await logAudit(req.session.userId, "delete_pricing_profile", "pricing_rule", id,
        `Deleted pricing profile: ${rule.displayName}`, req.ip);

      res.json({ success: true });
    } catch (error) {
      logError("Error deleting pricing profile", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Audit Logs (paginated)
  app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const entityType = req.query.entityType as string | undefined;
      const action = req.query.action as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await storage.getAuditLogsPaginated({
        page,
        limit,
        search,
        entityType,
        action,
        startDate,
        endDate,
      });

      res.json(result);
    } catch (error) {
      logError("Error fetching audit logs", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Audit Log Stats
  app.get("/api/admin/audit-logs/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await storage.getAuditLogStats();
      res.json(stats);
    } catch (error) {
      logError("Error fetching audit log stats", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Integration Logs
  app.get("/api/admin/integration-logs", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const service = req.query.service as string | undefined;
      const success = req.query.success as string | undefined;

      const result = await storage.getIntegrationLogsPaginated({ page, limit, search, service, success });
      res.json(result);
    } catch (error) {
      logError("Error fetching integration logs", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Webhook Events
  app.get("/api/admin/webhook-events", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const search = req.query.search as string | undefined;
      const source = req.query.source as string | undefined;
      const processed = req.query.processed as string | undefined;

      const result = await storage.getWebhookEventsPaginated({ page, limit, search, source, processed });
      res.json(result);
    } catch (error) {
      logError("Error fetching webhook events", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // RBAC MANAGEMENT ROUTES
  // ============================================

  // Roles CRUD
  app.get("/api/admin/roles", requireAdmin, async (_req, res) => {
    try {
      const allRoles = await storage.getRoles();
      res.json(allRoles);
    } catch (error) {
      logError("Error fetching roles", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/roles/:id", requireAdmin, async (req, res) => {
    try {
      const role = await storage.getRole(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      // Get permissions assigned to this role
      const rolePermissions = await storage.getRolePermissions(role.id);
      const allPermissions = await storage.getPermissions();
      const assignedPermissions = allPermissions.filter(p => 
        rolePermissions.some(rp => rp.permissionId === p.id)
      );
      
      res.json({ ...role, permissions: assignedPermissions });
    } catch (error) {
      logError("Error fetching role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/roles", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Role name is required" });
      }

      const role = await storage.createRole({ name, description });
      await logAudit(req.session.userId, "create_role", "role", role.id,
        `Created role: ${name}`, req.ip);
      
      res.status(201).json(role);
    } catch (error) {
      logError("Error creating role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/roles/:id", requireAdmin, async (req, res) => {
    try {
      const { name, description, isActive } = req.body;
      const updates: { name?: string; description?: string; isActive?: boolean } = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.isActive = isActive;

      const role = await storage.updateRole(req.params.id, updates);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      await logAudit(req.session.userId, "update_role", "role", role.id,
        `Updated role: ${role.name}`, req.ip);
      
      res.json(role);
    } catch (error) {
      logError("Error updating role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/roles/:id", requireAdmin, async (req, res) => {
    try {
      const role = await storage.getRole(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      await storage.deleteRole(req.params.id);
      await logAudit(req.session.userId, "delete_role", "role", req.params.id,
        `Deleted role: ${role.name}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error deleting role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Permissions CRUD
  app.get("/api/admin/permissions", requireAdmin, async (_req, res) => {
    try {
      const allPermissions = await storage.getPermissions();
      res.json(allPermissions);
    } catch (error) {
      logError("Error fetching permissions", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/permissions", requireAdmin, async (req, res) => {
    try {
      const { name, description, resource, action } = req.body;
      if (!resource || !action) {
        return res.status(400).json({ error: "Resource and action are required" });
      }

      const permissionName = name || `${resource}:${action}`;
      const permission = await storage.createPermission({ name: permissionName, description, resource, action });
      await logAudit(req.session.userId, "create_permission", "permission", permission.id,
        `Created permission: ${permissionName}`, req.ip);
      
      res.status(201).json(permission);
    } catch (error) {
      logError("Error creating permission", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/permissions/:id", requireAdmin, async (req, res) => {
    try {
      const permission = await storage.getPermission(req.params.id);
      if (!permission) {
        return res.status(404).json({ error: "Permission not found" });
      }

      await storage.deletePermission(req.params.id);
      await logAudit(req.session.userId, "delete_permission", "permission", req.params.id,
        `Deleted permission: ${permission.name}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error deleting permission", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Role Permissions Management
  app.post("/api/admin/roles/:roleId/permissions/:permissionId", requireAdmin, async (req, res) => {
    try {
      const { roleId, permissionId } = req.params;
      
      const role = await storage.getRole(roleId);
      const permission = await storage.getPermission(permissionId);
      
      if (!role || !permission) {
        return res.status(404).json({ error: "Role or permission not found" });
      }

      const rolePermission = await storage.assignRolePermission({ roleId, permissionId });
      await logAudit(req.session.userId, "assign_permission", "role_permission", rolePermission.id,
        `Assigned permission ${permission.name} to role ${role.name}`, req.ip);
      
      res.status(201).json(rolePermission);
    } catch (error) {
      logError("Error assigning permission to role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/roles/:roleId/permissions/:permissionId", requireAdmin, async (req, res) => {
    try {
      const { roleId, permissionId } = req.params;
      await storage.removeRolePermission(roleId, permissionId);
      
      await logAudit(req.session.userId, "remove_permission", "role_permission", undefined,
        `Removed permission ${permissionId} from role ${roleId}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error removing permission from role", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User Roles Management
  app.get("/api/admin/users/:userId/roles", requireAdmin, async (req, res) => {
    try {
      const userRolesList = await storage.getUserRoles(req.params.userId);
      const allRoles = await storage.getRoles();
      const assignedRoles = allRoles.filter(r => 
        userRolesList.some(ur => ur.roleId === r.id)
      );
      
      res.json(assignedRoles);
    } catch (error) {
      logError("Error fetching user roles", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:userId/roles/:roleId", requireAdmin, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      
      const user = await storage.getUser(userId);
      const role = await storage.getRole(roleId);
      
      if (!user || !role) {
        return res.status(404).json({ error: "User or role not found" });
      }

      const userRole = await storage.assignUserRole({ userId, roleId });
      await logAudit(req.session.userId, "assign_role", "user_role", userRole.id,
        `Assigned role ${role.name} to user ${user.username}`, req.ip);
      
      res.status(201).json(userRole);
    } catch (error) {
      logError("Error assigning role to user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:userId/roles/:roleId", requireAdmin, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      await storage.removeUserRole(userId, roleId);
      
      await logAudit(req.session.userId, "remove_role", "user_role", undefined,
        `Removed role ${roleId} from user ${userId}`, req.ip);
      
      res.json({ success: true });
    } catch (error) {
      logError("Error removing role from user", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // CLIENT ROUTES
  // ============================================

  // Client - Get Account Info
  app.get("/api/client/account", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const account = await storage.getClientAccount(user.clientAccountId);
    if (!account) {
      return res.status(404).json({ error: "Client account not found" });
    }

    res.json(account);
  });

  // Client - Update Account Profile
  const clientProfileUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    companyName: z.string().optional(),
  });

  app.patch("/api/client/account", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = clientProfileUpdateSchema.parse(req.body);
      
      const updated = await storage.updateClientAccount(user.clientAccountId, data);
      if (!updated) {
        return res.status(404).json({ error: "Client account not found" });
      }

      await logAudit(req.session.userId, "update_profile", "client_account", user.clientAccountId,
        `Client updated their profile`, req.ip);

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Dashboard Stats
  app.get("/api/client/stats", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const shipments = await storage.getShipmentsByClientAccount(user.clientAccountId);
    const invoices = await storage.getInvoicesByClientAccount(user.clientAccountId);

    const stats: ClientDashboardStats = {
      totalShipments: shipments.length,
      shipmentsInTransit: shipments.filter((s) => s.status === "in_transit").length,
      shipmentsDelivered: shipments.filter((s) => s.status === "delivered").length,
      pendingInvoices: invoices.filter((i) => i.status === "pending").length,
      totalSpent: shipments.reduce((sum, s) => sum + Number(s.finalPrice), 0),
    };

    res.json(stats);
  });

  // Client - Recent Shipments
  app.get("/api/client/shipments/recent", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const shipments = await storage.getShipmentsByClientAccount(user.clientAccountId);
    res.json(shipments.slice(0, 5));
  });

  // Client - All Shipments
  app.get("/api/client/shipments", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const shipments = await storage.getShipmentsByClientAccount(user.clientAccountId);
    res.json(shipments);
  });

  // Client - Get Single Shipment Details
  app.get("/api/client/shipments/:id", requireClient, async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const shipment = await storage.getShipment(id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Verify shipment belongs to this client
      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get associated invoice if exists
      const invoices = await storage.getInvoicesByClientAccount(user.clientAccountId);
      const invoice = invoices.find(inv => inv.shipmentId === shipment.id);

      res.json({
        ...shipment,
        invoice: invoice ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          status: invoice.status,
          dueDate: invoice.dueDate,
        } : null,
      });
    } catch (error) {
      logError("Error fetching shipment details", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // NEW SHIPMENT FLOW: RATE DISCOVERY -> CHECKOUT -> CONFIRM
  // ============================================

  // Canonical Shipment Input Schema
  const shipmentInputSchema = z.object({
    shipper: z.object({
      name: z.string().min(1, "Shipper name is required"),
      phone: z.string().min(1, "Shipper phone is required"),
      countryCode: z.string().length(2, "Country code must be 2 characters"),
      city: z.string().min(1, "Shipper city is required"),
      postalCode: z.string().min(1, "Shipper postal code is required"),
      addressLine1: z.string().min(1, "Shipper address is required"),
      addressLine2: z.string().optional(),
      stateOrProvince: z.string().optional(),
    }),
    recipient: z.object({
      name: z.string().min(1, "Recipient name is required"),
      phone: z.string().min(1, "Recipient phone is required"),
      countryCode: z.string().length(2, "Country code must be 2 characters"),
      city: z.string().min(1, "Recipient city is required"),
      postalCode: z.string().min(1, "Recipient postal code is required"),
      addressLine1: z.string().min(1, "Recipient address is required"),
      addressLine2: z.string().optional(),
      stateOrProvince: z.string().optional(),
    }),
    package: z.object({
      weight: z.number().positive("Weight must be positive"),
      weightUnit: z.enum(["LB", "KG"]),
      length: z.number().positive("Length must be positive"),
      width: z.number().positive("Width must be positive"),
      height: z.number().positive("Height must be positive"),
      dimensionUnit: z.enum(["IN", "CM"]),
      packageType: z.string().default("YOUR_PACKAGING"),
    }),
    shipmentType: z.enum(["domestic", "international"]),
    serviceType: z.string().optional(),
    currency: z.string().default("USD"),
  });

  // STEP 1: Rate Discovery - Get rates from all carriers
  app.post("/api/client/shipments/rates", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = shipmentInputSchema.parse(req.body);

      // Get client account for pricing
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Get pricing rule for client profile
      const pricingRule = await storage.getPricingRuleByProfile(account.profile);
      const marginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;

      // Map to carrier adapter format
      const rateRequest = {
        shipper: {
          name: data.shipper.name,
          streetLine1: data.shipper.addressLine1,
          streetLine2: data.shipper.addressLine2,
          city: data.shipper.city,
          stateOrProvince: data.shipper.stateOrProvince,
          postalCode: data.shipper.postalCode,
          countryCode: data.shipper.countryCode,
          phone: data.shipper.phone,
        },
        recipient: {
          name: data.recipient.name,
          streetLine1: data.recipient.addressLine1,
          streetLine2: data.recipient.addressLine2,
          city: data.recipient.city,
          stateOrProvince: data.recipient.stateOrProvince,
          postalCode: data.recipient.postalCode,
          countryCode: data.recipient.countryCode,
          phone: data.recipient.phone,
        },
        packages: [{
          weight: data.package.weight,
          weightUnit: data.package.weightUnit,
          dimensions: {
            length: data.package.length,
            width: data.package.width,
            height: data.package.height,
            unit: data.package.dimensionUnit,
          },
          packageType: data.package.packageType,
        }],
        serviceType: data.serviceType,
      };

      // Get rates from FedEx adapter
      const carrierRates = await fedexAdapter.getRates(rateRequest);

      // Store quotes with pricing and return to client
      const quotes: Array<{
        quoteId: string;
        carrierName: string;
        serviceType: string;
        serviceName: string;
        finalPrice: number;
        currency: string;
        transitDays: number;
        estimatedDelivery?: Date;
      }> = [];

      // Quote expiration: 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      for (const rate of carrierRates) {
        const marginAmount = rate.baseRate * (marginPercentage / 100);
        const finalPrice = rate.baseRate + marginAmount;

        // Store quote in database
        const quote = await storage.createShipmentRateQuote({
          clientAccountId: user.clientAccountId,
          shipmentData: JSON.stringify(data),
          carrierCode: fedexAdapter.carrierCode,
          carrierName: fedexAdapter.name,
          serviceType: rate.serviceType,
          serviceName: rate.serviceName,
          baseRate: rate.baseRate.toFixed(2),
          marginPercentage: marginPercentage.toFixed(2),
          marginAmount: marginAmount.toFixed(2),
          finalPrice: finalPrice.toFixed(2),
          currency: rate.currency,
          transitDays: rate.transitDays,
          estimatedDelivery: rate.deliveryDate,
          expiresAt,
        });

        // Return only what client should see (no baseRate)
        quotes.push({
          quoteId: quote.id,
          carrierName: fedexAdapter.name,
          serviceType: rate.serviceType,
          serviceName: rate.serviceName,
          finalPrice: Number(finalPrice.toFixed(2)),
          currency: rate.currency,
          transitDays: rate.transitDays,
          estimatedDelivery: rate.deliveryDate,
        });
      }

      await logAudit(req.session.userId, "get_shipping_rates", "shipment", undefined,
        `Requested ${quotes.length} shipping rates`, req.ip);

      res.json({ quotes, expiresAt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get shipping rates", error);
      res.status(500).json({ error: "Failed to get shipping rates" });
    }
  });

  // STEP 2: Checkout - Create payment intent with selected rate
  app.post("/api/client/shipments/checkout", requireClient, async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const checkoutSchema = z.object({
        quoteId: z.string().uuid("Invalid quote ID"),
      });

      const { quoteId } = checkoutSchema.parse(req.body);

      // Verify quote exists and is valid
      const quote = await storage.getShipmentRateQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found or expired" });
      }

      // Verify quote belongs to this client
      if (quote.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Recalculate price server-side to prevent tampering
      const shipmentData = JSON.parse(quote.shipmentData);
      const account = await storage.getClientAccount(user.clientAccountId);
      const pricingRule = await storage.getPricingRuleByProfile(account?.profile || "regular");
      const marginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;
      const baseRate = Number(quote.baseRate);
      const recalculatedMargin = baseRate * (marginPercentage / 100);
      const recalculatedFinalPrice = baseRate + recalculatedMargin;

      // Verify price hasn't been tampered with
      if (Math.abs(recalculatedFinalPrice - Number(quote.finalPrice)) > 0.01) {
        return res.status(400).json({ error: "Price mismatch detected" });
      }

      // Create draft shipment with payment pending status
      const shipment = await storage.createShipment({
        clientAccountId: user.clientAccountId,
        senderName: shipmentData.shipper.name,
        senderAddress: shipmentData.shipper.addressLine1,
        senderCity: shipmentData.shipper.city,
        senderPostalCode: shipmentData.shipper.postalCode,
        senderCountry: shipmentData.shipper.countryCode,
        senderPhone: shipmentData.shipper.phone,
        recipientName: shipmentData.recipient.name,
        recipientAddress: shipmentData.recipient.addressLine1,
        recipientCity: shipmentData.recipient.city,
        recipientPostalCode: shipmentData.recipient.postalCode,
        recipientCountry: shipmentData.recipient.countryCode,
        recipientPhone: shipmentData.recipient.phone,
        weight: shipmentData.package.weight.toString(),
        weightUnit: shipmentData.package.weightUnit,
        length: shipmentData.package.length.toString(),
        width: shipmentData.package.width.toString(),
        height: shipmentData.package.height.toString(),
        dimensionUnit: shipmentData.package.dimensionUnit,
        packageType: shipmentData.package.packageType,
        shipmentType: shipmentData.shipmentType,
        serviceType: quote.serviceType,
        currency: quote.currency,
        status: "payment_pending",
        baseRate: quote.baseRate,
        marginAmount: quote.marginAmount,
        margin: quote.marginAmount,
        finalPrice: quote.finalPrice,
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        carrierServiceType: quote.serviceType,
        paymentStatus: "pending",
        estimatedDelivery: quote.estimatedDelivery,
      });

      // Create payment via Moyasar
      let paymentResult: { paymentId: string; transactionUrl?: string } | null = null;
      
      // Construct callback URL for payment completion
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const callbackUrl = `${protocol}://${host}/api/payments/moyasar/callback`;
      
      if (moyasarService.isConfigured()) {
        paymentResult = await moyasarService.createPayment({
          amount: Math.round(Number(quote.finalPrice) * 100), // Convert to smallest currency unit
          currency: quote.currency.toUpperCase(),
          description: `Shipment ${shipment.trackingNumber}`,
          callbackUrl: callbackUrl,
          metadata: {
            shipmentId: shipment.id,
            clientAccountId: user.clientAccountId,
          },
        });

        // Update shipment with payment ID
        await storage.updateShipment(shipment.id, {
          paymentIntentId: paymentResult.paymentId,
        });
      } else {
        // Demo mode - create mock payment
        paymentResult = {
          paymentId: `mpy_mock_${Date.now()}`,
          transactionUrl: undefined,
        };
        await storage.updateShipment(shipment.id, {
          paymentIntentId: paymentResult.paymentId,
        });
      }

      await logAudit(req.session.userId, "checkout_shipment", "shipment", shipment.id,
        `Created checkout for shipment ${shipment.trackingNumber}`, req.ip);

      const response = {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        paymentId: paymentResult?.paymentId,
        transactionUrl: paymentResult?.transactionUrl,
        amount: Number(quote.finalPrice),
        currency: quote.currency,
      };

      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 200);
      }

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create checkout", error);
      res.status(500).json({ error: "Failed to create checkout" });
    }
  });

  // STEP 3: Confirm - Create carrier shipment after payment success
  app.post("/api/client/shipments/confirm", requireClient, async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const confirmSchema = z.object({
        shipmentId: z.string().uuid("Invalid shipment ID"),
        paymentIntentId: z.string().optional(),
      });

      const { shipmentId, paymentIntentId } = confirmSchema.parse(req.body);

      // Get shipment
      const shipment = await storage.getShipment(shipmentId);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Verify shipment belongs to client
      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Verify shipment is in correct state
      if (shipment.status !== "payment_pending") {
        return res.status(400).json({ error: "Shipment cannot be confirmed in current state" });
      }

      // Use the stored payment ID from shipment if not provided
      const effectivePaymentId = paymentIntentId || shipment.paymentIntentId;

      // Verify payment if Moyasar is configured
      if (moyasarService.isConfigured() && effectivePaymentId) {
        const paymentStatus = await moyasarService.verifyPayment(effectivePaymentId);
        if (paymentStatus !== "paid") {
          return res.status(400).json({ error: "Payment not confirmed" });
        }
      } else if (effectivePaymentId && effectivePaymentId.startsWith("mpy_mock_")) {
        // Demo mode - accept mock payments
      } else if (!effectivePaymentId) {
        // No payment ID available - this shouldn't happen in normal flow
        logError("Confirm shipment: No payment ID available", { shipmentId });
      }

      // Create shipment with carrier
      const carrierRequest = {
        shipper: {
          name: shipment.senderName,
          streetLine1: shipment.senderAddress,
          city: shipment.senderCity,
          stateOrProvince: "",
          postalCode: shipment.senderPostalCode || "",
          countryCode: shipment.senderCountry,
          phone: shipment.senderPhone,
        },
        recipient: {
          name: shipment.recipientName,
          streetLine1: shipment.recipientAddress,
          city: shipment.recipientCity,
          stateOrProvince: "",
          postalCode: shipment.recipientPostalCode || "",
          countryCode: shipment.recipientCountry,
          phone: shipment.recipientPhone,
        },
        packages: [{
          weight: Number(shipment.weight),
          weightUnit: (shipment.weightUnit || "LB") as "LB" | "KG",
          dimensions: shipment.length && shipment.width && shipment.height ? {
            length: Number(shipment.length),
            width: Number(shipment.width),
            height: Number(shipment.height),
            unit: (shipment.dimensionUnit || "IN") as "IN" | "CM",
          } : undefined,
          packageType: shipment.packageType,
        }],
        serviceType: shipment.carrierServiceType || shipment.serviceType || "FEDEX_GROUND",
        labelFormat: "PDF" as const,
      };

      const carrierResponse = await fedexAdapter.createShipment(carrierRequest);

      // Update shipment with carrier response
      const updatedShipment = await storage.updateShipment(shipmentId, {
        status: "created",
        paymentStatus: "paid",
        carrierTrackingNumber: carrierResponse.carrierTrackingNumber || carrierResponse.trackingNumber,
        carrierShipmentId: carrierResponse.trackingNumber,
        labelUrl: carrierResponse.labelUrl,
        estimatedDelivery: carrierResponse.estimatedDelivery,
      });

      // Create invoice
      await storage.createInvoice({
        clientAccountId: user.clientAccountId,
        shipmentId: shipment.id,
        amount: shipment.finalPrice,
        status: "paid",
        dueDate: new Date(),
      });

      await logAudit(req.session.userId, "confirm_shipment", "shipment", shipmentId,
        `Confirmed shipment ${shipment.trackingNumber} with carrier tracking ${carrierResponse.carrierTrackingNumber}`, req.ip);

      const response = {
        shipment: updatedShipment,
        carrierTrackingNumber: carrierResponse.carrierTrackingNumber,
        labelUrl: carrierResponse.labelUrl,
        estimatedDelivery: carrierResponse.estimatedDelivery,
      };

      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, response, 200);
      }

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to confirm shipment", error);
      res.status(500).json({ error: "Failed to confirm shipment" });
    }
  });

  // Client - Create Shipment (LEGACY - direct creation without rate discovery)
  app.post("/api/client/shipments", requireClient, async (req, res) => {
    try {
      // Check idempotency
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }
      
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const data = createShipmentSchema.parse(req.body);

      // Get client account to determine pricing
      const account = await storage.getClientAccount(user.clientAccountId);
      if (!account) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Get pricing rule for client profile
      const pricingRule = await storage.getPricingRuleByProfile(account.profile);
      const marginPercentage = pricingRule ? Number(pricingRule.marginPercentage) : 20;

      // Calculate pricing (simulated base rate)
      const weight = parseFloat(data.weight);
      const baseRate = 25 + weight * 5; // Base rate calculation
      const margin = baseRate * (marginPercentage / 100);
      const finalPrice = baseRate + margin;

      const shipment = await storage.createShipment({
        ...data,
        clientAccountId: user.clientAccountId,
        status: "processing",
        baseRate: baseRate.toFixed(2),
        margin: margin.toFixed(2),
        finalPrice: finalPrice.toFixed(2),
        carrierName: "FedEx",
      });

      // Create invoice for shipment
      const invoice = await storage.createInvoice({
        clientAccountId: user.clientAccountId,
        shipmentId: shipment.id,
        amount: finalPrice.toFixed(2),
        status: "pending",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Sync invoice to Zoho Books (if configured)
      if (zohoService.isConfigured()) {
        try {
          const clientAccount = await storage.getClientAccount(user.clientAccountId);
          if (clientAccount) {
            const zohoResult = await zohoService.syncInvoice(invoice.id, {
              customerId: clientAccount.zohoCustomerId || undefined,
              customerName: clientAccount.name,
              customerEmail: clientAccount.email,
              invoiceNumber: invoice.invoiceNumber,
              date: new Date().toISOString().split('T')[0],
              dueDate: invoice.dueDate.toISOString().split('T')[0],
              lineItems: [{
                name: `Shipment ${shipment.trackingNumber}`,
                description: `${data.senderCity} to ${data.recipientCity}`,
                quantity: 1,
                rate: Number(finalPrice),
              }],
            });
            
            if (zohoResult.zohoInvoiceId) {
              await storage.updateInvoice(invoice.id, {
                zohoInvoiceId: zohoResult.zohoInvoiceId,
                zohoInvoiceUrl: zohoResult.invoiceUrl,
              });
            }
          }
        } catch (error) {
          logError("Failed to sync invoice to Zoho", error);
          // Don't fail the shipment creation if Zoho sync fails
        }
      }

      // Log shipment creation
      await logAudit(req.session.userId, "create_shipment", "shipment", shipment.id,
        `Created shipment ${shipment.trackingNumber} for $${finalPrice.toFixed(2)}`, req.ip);

      // Store idempotency record
      if (idempotencyKey) {
        await setIdempotencyRecord(idempotencyKey, shipment, 201);
      }

      res.status(201).json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Cancel Shipment
  app.post("/api/client/shipments/:id/cancel", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const { id } = req.params;
      const shipment = await storage.getShipment(id);
      
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Verify shipment belongs to client
      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Only allow cancellation of processing shipments
      if (shipment.status !== "processing") {
        return res.status(400).json({ error: "Can only cancel shipments that are still processing" });
      }

      const updated = await storage.updateShipment(id, { status: "cancelled" });
      
      // Log cancellation
      await logAudit(req.session.userId, "cancel_shipment", "shipment", id,
        `Client cancelled shipment ${shipment.trackingNumber}`, req.ip);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Client - Invoices
  app.get("/api/client/invoices", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const invoices = await storage.getInvoicesByClientAccount(user.clientAccountId);
    res.json(invoices);
  });

  // Client - Invoice PDF (downloadable HTML for print)
  app.get("/api/client/invoices/:id/pdf", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Verify invoice belongs to client
      if (invoice.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get shipment and client details
      const shipment = invoice.shipmentId ? await storage.getShipment(invoice.shipmentId) : null;
      const clientAccount = await storage.getClientAccount(invoice.clientAccountId);

      const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString("en-US", { 
          year: "numeric", 
          month: "long", 
          day: "numeric" 
        });
      };

      // Generate printable HTML invoice
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.id.slice(0, 8).toUpperCase()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #fe5200; }
    .logo { font-size: 28px; font-weight: bold; color: #fe5200; }
    .invoice-info { text-align: right; }
    .invoice-number { font-size: 24px; font-weight: bold; color: #1a1a1a; }
    .invoice-date { color: #666; margin-top: 4px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
    .status.pending { background: #fef3c7; color: #92400e; }
    .status.paid { background: #d1fae5; color: #065f46; }
    .status.overdue { background: #fee2e2; color: #991b1b; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { flex: 1; }
    .party h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.5px; }
    .party p { line-height: 1.6; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .table th { text-align: left; padding: 12px; background: #f8f8f8; border-bottom: 2px solid #e5e5e5; font-size: 12px; text-transform: uppercase; color: #666; }
    .table td { padding: 12px; border-bottom: 1px solid #e5e5e5; }
    .table .text-right { text-align: right; }
    .totals { margin-left: auto; width: 300px; }
    .totals .row { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals .row.total { font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a; padding-top: 12px; margin-top: 4px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e5e5; color: #666; font-size: 12px; text-align: center; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
    .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; background: #fe5200; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .print-btn:hover { background: #e54a00; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">ezhalha</div>
    <div class="invoice-info">
      <div class="invoice-number">Invoice #${invoice.id.slice(0, 8).toUpperCase()}</div>
      <div class="invoice-date">Issue Date: ${formatDate(invoice.createdAt)}</div>
      <div class="invoice-date">Due Date: ${formatDate(invoice.dueDate)}</div>
      <span class="status ${invoice.status}">${invoice.status}</span>
    </div>
  </div>
  
  <div class="parties">
    <div class="party">
      <h3>Bill To</h3>
      <p><strong>${clientAccount?.companyName || 'Client'}</strong></p>
      <p>${clientAccount?.name || ''}</p>
      <p>${clientAccount?.country || ''}</p>
    </div>
    <div class="party" style="text-align: right;">
      <h3>From</h3>
      <p><strong>ezhalha Logistics</strong></p>
      <p>Enterprise Shipping Solutions</p>
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Description</th>
        <th>Details</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>Shipping Service</strong><br>
          <span style="color: #666; font-size: 13px;">
            ${shipment ? `Tracking: ${shipment.trackingNumber}` : 'Shipping Services'}
          </span>
        </td>
        <td>
          ${shipment ? `
          <span style="font-size: 13px;">
            ${shipment.senderCity}, ${shipment.senderCountry} → ${shipment.recipientCity}, ${shipment.recipientCountry}<br>
            Weight: ${Number(shipment.weight).toFixed(1)} kg | Type: ${shipment.packageType}
          </span>
          ` : 'Logistics Services'}
        </td>
        <td class="text-right">$${Number(invoice.amount).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span>Subtotal</span>
      <span>$${Number(invoice.amount).toFixed(2)}</span>
    </div>
    <div class="row">
      <span>Tax (0%)</span>
      <span>$0.00</span>
    </div>
    <div class="row total">
      <span>Total Due</span>
      <span>$${Number(invoice.amount).toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for choosing ezhalha Logistics. Payment is due within 30 days of issue date.</p>
    <p>For questions, contact support@ezhalha.com</p>
  </div>

  <button class="print-btn no-print" onclick="window.print()">Print Invoice</button>
</body>
</html>
      `;

      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  });

  // Client - Payments
  app.get("/api/client/payments", requireClient, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.clientAccountId) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const payments = await storage.getPaymentsByClientAccount(user.clientAccountId);
    res.json(payments);
  });

  // Client - Create Payment Intent (Stripe checkout)
  const createPaymentSchema = z.object({
    invoiceId: z.string().min(1, "Invoice ID is required"),
  });

  app.post("/api/client/payments/create-intent", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const { invoiceId } = createPaymentSchema.parse(req.body);
      
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      if (invoice.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied to this invoice" });
      }
      
      if (invoice.status === "paid") {
        return res.status(400).json({ error: "Invoice already paid" });
      }

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return res.status(503).json({ 
          error: "Payment processing is not configured. Please contact support.",
          code: "STRIPE_NOT_CONFIGURED"
        });
      }

      // Check if there's already a pending payment for this invoice
      const existingPayments = await storage.getPaymentsByClientAccount(user.clientAccountId);
      const existingPendingPayment = existingPayments.find(
        p => p.invoiceId === invoice.id && p.status === "pending" && p.stripePaymentIntentId
      );
      
      if (existingPendingPayment && existingPendingPayment.stripePaymentIntentId) {
        // Return existing payment intent's client secret
        const stripe = new Stripe(stripeSecretKey);
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(existingPendingPayment.stripePaymentIntentId);
          if (existingIntent.status === "requires_payment_method" || existingIntent.status === "requires_confirmation") {
            return res.json({
              clientSecret: existingIntent.client_secret,
              paymentIntentId: existingIntent.id,
              amount: invoice.amount,
              invoiceNumber: invoice.invoiceNumber,
            });
          }
        } catch (error) {
          // If intent doesn't exist or is expired, create a new one
          logError("Failed to retrieve existing payment intent, creating new one", error);
        }
      }

      // Create Stripe payment intent
      const stripe = new Stripe(stripeSecretKey);
      const amountInCents = Math.round(Number(invoice.amount) * 100);
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientAccountId: user.clientAccountId,
        },
        description: `Invoice ${invoice.invoiceNumber}`,
      });

      // Create pending payment record
      await storage.createPayment({
        invoiceId: invoice.id,
        clientAccountId: user.clientAccountId,
        amount: invoice.amount,
        paymentMethod: "stripe",
        status: "pending",
        stripePaymentIntentId: paymentIntent.id,
      });

      await logAudit(req.session.userId, "create_payment_intent", "payment", paymentIntent.id,
        `Created payment intent for invoice ${invoice.invoiceNumber}`, req.ip);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: invoice.amount,
        invoiceNumber: invoice.invoiceNumber,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to create payment intent", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // Client - Track Shipment
  app.get("/api/client/shipments/:id/track", requireClient, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.clientAccountId) {
        return res.status(404).json({ error: "Client account not found" });
      }

      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      if (shipment.clientAccountId !== user.clientAccountId) {
        return res.status(403).json({ error: "Access denied to this shipment" });
      }

      // Get tracking from carrier
      const trackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
      const tracking = await fedexAdapter.trackShipment(trackingNumber);

      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrierTrackingNumber: shipment.carrierTrackingNumber,
        status: shipment.status,
        carrier: shipment.carrierName || "FedEx",
        estimatedDelivery: shipment.estimatedDelivery,
        actualDelivery: shipment.actualDelivery,
        tracking,
      });
    } catch (error) {
      logError("Failed to get shipment tracking", error);
      res.status(500).json({ error: "Failed to get tracking information" });
    }
  });

  // Admin - Get Shipping Rates
  app.post("/api/admin/shipping/rates", requireAdmin, async (req, res) => {
    try {
      const rateRequestSchema = z.object({
        senderCity: z.string(),
        senderCountry: z.string(),
        senderPostalCode: z.string().optional(),
        recipientCity: z.string(),
        recipientCountry: z.string(),
        recipientPostalCode: z.string().optional(),
        weight: z.number().positive(),
        packageType: z.string(),
      });

      const data = rateRequestSchema.parse(req.body);

      const rates = await fedexAdapter.getRates({
        shipper: {
          name: "Origin",
          streetLine1: "",
          city: data.senderCity,
          postalCode: data.senderPostalCode || "00000",
          countryCode: data.senderCountry,
          phone: "",
        },
        recipient: {
          name: "Destination",
          streetLine1: "",
          city: data.recipientCity,
          postalCode: data.recipientPostalCode || "00000",
          countryCode: data.recipientCountry,
          phone: "",
        },
        packages: [{
          weight: data.weight,
          weightUnit: "LB",
          packageType: data.packageType,
        }],
      });

      res.json({ rates, carrier: "FedEx", isConfigured: fedexAdapter.isConfigured() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get shipping rates", error);
      res.status(500).json({ error: "Failed to get shipping rates" });
    }
  });

  // ============================================
  // SHIPMENT CARRIER API ENDPOINTS
  // ============================================

  // Validate Address
  app.post("/api/shipments/validate-address", requireAuth, async (req, res) => {
    try {
      const addressSchema = z.object({
        streetLine1: z.string().min(1),
        streetLine2: z.string().optional(),
        city: z.string().optional(),
        stateOrProvince: z.string().optional(),
        postalCode: z.string().optional(),
        countryCode: z.string().min(2).max(2),
      });

      const address = addressSchema.parse(req.body);
      const result = await fedexAdapter.validateAddress({ address });
      
      await logAudit(req.session.userId!, "validate_address", "shipment", undefined, 
        `Address validation: ${address.streetLine1}, ${address.city || 'N/A'}`, req.ip);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to validate address", error);
      res.status(500).json({ error: "Failed to validate address" });
    }
  });

  // Validate Postal Code
  app.post("/api/shipments/validate-postal-code", requireAuth, async (req, res) => {
    try {
      const postalCodeSchema = z.object({
        postalCode: z.string().min(1),
        countryCode: z.string().min(2).max(2),
        stateOrProvince: z.string().optional(),
      });

      const data = postalCodeSchema.parse(req.body);
      const result = await fedexAdapter.validatePostalCode(data);
      
      await logAudit(req.session.userId!, "validate_postal_code", "shipment", undefined, 
        `Postal code validation: ${data.postalCode}, ${data.countryCode}`, req.ip);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to validate postal code", error);
      res.status(500).json({ error: "Failed to validate postal code" });
    }
  });

  // Check Service Availability
  app.post("/api/shipments/check-service", requireAuth, async (req, res) => {
    try {
      const serviceSchema = z.object({
        origin: z.object({
          postalCode: z.string().min(1),
          countryCode: z.string().min(2).max(2),
          stateOrProvince: z.string().optional(),
        }),
        destination: z.object({
          postalCode: z.string().min(1),
          countryCode: z.string().min(2).max(2),
          stateOrProvince: z.string().optional(),
        }),
        shipDate: z.string().optional(),
      });

      const data = serviceSchema.parse(req.body);
      const result = await fedexAdapter.checkServiceAvailability(data);
      
      await logAudit(req.session.userId!, "check_service_availability", "shipment", undefined, 
        `Service check: ${data.origin.postalCode} -> ${data.destination.postalCode}`, req.ip);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to check service availability", error);
      res.status(500).json({ error: "Failed to check service availability" });
    }
  });

  // Get Shipping Rates (public for authenticated users)
  app.post("/api/shipments/rates", requireAuth, async (req, res) => {
    try {
      const rateSchema = z.object({
        shipper: z.object({
          name: z.string(),
          streetLine1: z.string(),
          streetLine2: z.string().optional(),
          city: z.string(),
          stateOrProvince: z.string().optional(),
          postalCode: z.string(),
          countryCode: z.string().min(2).max(2),
          phone: z.string(),
        }),
        recipient: z.object({
          name: z.string(),
          streetLine1: z.string(),
          streetLine2: z.string().optional(),
          city: z.string(),
          stateOrProvince: z.string().optional(),
          postalCode: z.string(),
          countryCode: z.string().min(2).max(2),
          phone: z.string(),
        }),
        packages: z.array(z.object({
          weight: z.number().positive(),
          weightUnit: z.enum(["LB", "KG"]),
          dimensions: z.object({
            length: z.number().positive(),
            width: z.number().positive(),
            height: z.number().positive(),
            unit: z.enum(["IN", "CM"]),
          }).optional(),
          packageType: z.string(),
        })),
        serviceType: z.string().optional(),
      });

      const data = rateSchema.parse(req.body);
      const rates = await fedexAdapter.getRates(data);
      
      await logAudit(req.session.userId!, "get_rates", "shipment", undefined, 
        `Rate request: ${data.shipper.city} -> ${data.recipient.city}`, req.ip);
      
      res.json({ rates, carrier: "FedEx", isConfigured: fedexAdapter.isConfigured() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      logError("Failed to get rates", error);
      res.status(500).json({ error: "Failed to get rates" });
    }
  });

  // Track Shipment
  app.get("/api/shipments/:id/track", requireAuth, async (req, res) => {
    try {
      const shipment = await storage.getShipment(req.params.id);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const trackingNumber = shipment.carrierTrackingNumber || shipment.trackingNumber;
      const tracking = await fedexAdapter.trackShipment(trackingNumber);
      
      await logAudit(req.session.userId!, "track_shipment", "shipment", shipment.id, 
        `Tracked shipment: ${trackingNumber}`, req.ip);
      
      res.json({ ...tracking, shipment });
    } catch (error) {
      logError("Failed to track shipment", error);
      res.status(500).json({ error: "Failed to track shipment" });
    }
  });

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // ============================================
  // WEBHOOK HANDLERS
  // ============================================

  // Webhook signature validation helper with safe comparison
  function validateWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;
    const crypto = require("crypto");
    const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    
    // Safe comparison that handles length mismatches
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSignature, "utf8"));
    } catch {
      return false;
    }
  }

  // FedEx Webhook Handler
  app.post("/api/webhooks/fedex", async (req, res) => {
    try {
      // Use raw body for signature validation if available
      const rawBody = (req as any).rawBody;
      const payload = rawBody ? rawBody.toString() : JSON.stringify(req.body);
      const signature = req.headers["x-fedex-signature"] as string | undefined;
      const webhookSecret = process.env.FEDEX_WEBHOOK_SECRET;

      // Validate signature if secret is configured
      if (webhookSecret && !validateWebhookSignature(payload, signature, webhookSecret)) {
        await storage.createWebhookEvent({
          source: "fedex",
          eventType: "signature_validation_failed",
          payload,
          signature: signature || null,
          processed: false,
          retryCount: 0,
          errorMessage: "Invalid webhook signature",
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body;
      const eventType = event.eventType || "unknown";

      // Store webhook event
      const webhookEvent = await storage.createWebhookEvent({
        source: "fedex",
        eventType,
        payload,
        signature: signature || null,
        processed: false,
        retryCount: 0,
      });

      // Process shipment status updates
      if (eventType === "shipment.status_update" && event.trackingNumber) {
        const shipments = await storage.getShipments();
        // Find by our tracking number OR carrier tracking number
        const shipment = shipments.find(s => 
          s.trackingNumber === event.trackingNumber || 
          s.carrierTrackingNumber === event.trackingNumber
        );
        
        if (shipment && event.status) {
          const statusMap: Record<string, string> = {
            "IN_TRANSIT": "in_transit",
            "DELIVERED": "delivered",
            "PROCESSING": "processing",
            "PICKED_UP": "in_transit",
            "OUT_FOR_DELIVERY": "in_transit",
          };
          
          const newStatus = statusMap[event.status] || shipment.status;
          const updates: Record<string, any> = {};
          
          if (newStatus !== shipment.status) {
            updates.status = newStatus;
          }
          
          // Set actual delivery date if delivered
          if (newStatus === "delivered" && !shipment.actualDelivery) {
            updates.actualDelivery = event.deliveryDate ? new Date(event.deliveryDate) : new Date();
          }
          
          if (Object.keys(updates).length > 0) {
            await storage.updateShipment(shipment.id, updates);
            await logAudit(undefined, "webhook_status_update", "shipment", shipment.id,
              `FedEx webhook updated: ${JSON.stringify(updates)}`, req.ip);
          }
        }
        
        await storage.updateWebhookEvent(webhookEvent.id, { processed: true, processedAt: new Date() });
      }

      res.json({ received: true, eventId: webhookEvent.id });
    } catch (error) {
      console.error("FedEx webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Stripe-specific signature validation
  // Stripe uses format: t=timestamp,v1=signature,v0=signature
  function validateStripeSignature(payload: string, signatureHeader: string | undefined, secret: string): boolean {
    if (!signatureHeader) return false;
    
    try {
      const crypto = require("crypto");
      
      // Parse the signature header
      const elements = signatureHeader.split(",");
      const sigMap: Record<string, string> = {};
      
      for (const element of elements) {
        const [key, value] = element.split("=");
        sigMap[key] = value;
      }
      
      const timestamp = sigMap["t"];
      const v1Signature = sigMap["v1"];
      
      if (!timestamp || !v1Signature) return false;
      
      // Construct signed payload as per Stripe docs
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
      
      // Safe comparison
      if (v1Signature.length !== expectedSignature.length) return false;
      
      return crypto.timingSafeEqual(Buffer.from(v1Signature, "utf8"), Buffer.from(expectedSignature, "utf8"));
    } catch {
      return false;
    }
  }

  // Stripe Webhook Handler
  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      // Use raw body for signature validation if available
      const rawBody = (req as any).rawBody;
      const payload = rawBody ? rawBody.toString() : JSON.stringify(req.body);
      const signature = req.headers["stripe-signature"] as string | undefined;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      // Validate signature if secret is configured using Stripe's format
      if (webhookSecret && !validateStripeSignature(payload, signature, webhookSecret)) {
        await storage.createWebhookEvent({
          source: "stripe",
          eventType: "signature_validation_failed",
          payload,
          signature: signature || null,
          processed: false,
          retryCount: 0,
          errorMessage: "Invalid webhook signature",
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body;
      const eventType = event.type || "unknown";

      // Store webhook event
      const webhookEvent = await storage.createWebhookEvent({
        source: "stripe",
        eventType,
        payload,
        signature: signature || null,
        processed: false,
        retryCount: 0,
      });

      // Process payment events
      if (eventType === "payment_intent.succeeded" && event.data?.object) {
        const paymentIntent = event.data.object;
        const invoiceId = paymentIntent.metadata?.invoiceId;
        
        if (invoiceId) {
          // Update invoice status to paid
          await storage.updateInvoice(invoiceId, { status: "paid", paidAt: new Date() });
          
          // Find and update existing payment record (created when payment intent was created)
          const invoice = await storage.getInvoice(invoiceId);
          if (invoice) {
            const payments = await storage.getPaymentsByClientAccount(invoice.clientAccountId);
            const pendingPayment = payments.find(p => 
              p.stripePaymentIntentId === paymentIntent.id && p.status === "pending"
            );
            
            if (pendingPayment) {
              // Update existing payment record
              await storage.updatePayment(pendingPayment.id, { 
                status: "completed",
                transactionId: paymentIntent.id,
              });
            } else {
              // Create new payment record if not found (fallback)
              await storage.createPayment({
                clientAccountId: invoice.clientAccountId,
                invoiceId: invoice.id,
                amount: String(paymentIntent.amount / 100),
                paymentMethod: "stripe",
                transactionId: paymentIntent.id,
                status: "completed",
              });
            }
          }
          
          await logAudit(undefined, "webhook_payment", "payment", paymentIntent.id,
            `Stripe webhook processed payment for invoice ${invoiceId}`, req.ip);
        }
        
        await storage.updateWebhookEvent(webhookEvent.id, { processed: true, processedAt: new Date() });
      }

      res.json({ received: true, eventId: webhookEvent.id });
    } catch (error) {
      console.error("Stripe webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Moyasar Payment Callback Handler
  // This handles the redirect after user completes payment on Moyasar's page
  app.get("/api/payments/moyasar/callback", async (req, res) => {
    try {
      const { id: paymentId, status, message } = req.query as { id?: string; status?: string; message?: string };

      if (!paymentId) {
        return res.redirect("/client/shipments?error=missing_payment_id");
      }

      // Log the callback event
      await storage.createWebhookEvent({
        source: "moyasar",
        eventType: "payment_callback",
        payload: JSON.stringify({ paymentId, status, message }),
        processed: false,
        retryCount: 0,
      });

      // Find shipment by payment ID (indexed lookup)
      const shipment = await storage.getShipmentByPaymentId(paymentId);

      if (!shipment) {
        logError("Moyasar callback: Shipment not found for payment", { paymentId });
        return res.redirect("/client/shipments?error=shipment_not_found");
      }

      // Verify payment status with Moyasar
      const verifiedStatus = await moyasarService.verifyPayment(paymentId);

      if (verifiedStatus === "paid") {
        // Redirect to the create shipment page to complete the flow
        return res.redirect(`/client/create-shipment?shipmentId=${shipment.id}&paymentStatus=success`);
      } else if (verifiedStatus === "failed") {
        return res.redirect(`/client/create-shipment?shipmentId=${shipment.id}&paymentStatus=failed&message=${encodeURIComponent(message || "Payment failed")}`);
      } else {
        // Payment still pending or in another state
        return res.redirect(`/client/create-shipment?shipmentId=${shipment.id}&paymentStatus=pending`);
      }
    } catch (error) {
      logError("Moyasar callback error:", error);
      return res.redirect("/client/shipments?error=callback_error");
    }
  });

  // Moyasar Webhook Handler (for server-to-server notifications)
  app.post("/api/webhooks/moyasar", async (req, res) => {
    try {
      const rawBody = (req as any).rawBody;
      const payload = rawBody ? rawBody.toString() : JSON.stringify(req.body);
      const signature = req.headers["x-moyasar-signature"] as string | undefined;
      const event = req.body;

      // Validate webhook signature
      if (!moyasarService.validateWebhookSignature(payload, signature)) {
        await storage.createWebhookEvent({
          source: "moyasar",
          eventType: "signature_validation_failed",
          payload,
          signature: signature || null,
          processed: false,
          retryCount: 0,
          errorMessage: "Invalid webhook signature",
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Store webhook event
      const webhookEvent = await storage.createWebhookEvent({
        source: "moyasar",
        eventType: event.type || "payment_update",
        payload,
        signature: signature || null,
        processed: false,
        retryCount: 0,
      });

      // Process payment events
      const payment = event.data || event;
      const paymentId = payment.id;
      const paymentStatus = payment.status;

      if (paymentId) {
        // Find shipment by payment ID (indexed lookup)
        const shipment = await storage.getShipmentByPaymentId(paymentId);

        if (shipment && paymentStatus === "paid") {
          // Update shipment payment status
          await storage.updateShipment(shipment.id, {
            paymentStatus: "paid",
          });

          await logAudit(undefined, "webhook_payment", "payment", paymentId,
            `Moyasar webhook confirmed payment for shipment ${shipment.trackingNumber}`, req.ip);
        }

        await storage.updateWebhookEvent(webhookEvent.id, { processed: true, processedAt: new Date() });
      }

      res.json({ received: true, eventId: webhookEvent.id });
    } catch (error) {
      logError("Moyasar webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Generic webhook status endpoint
  app.get("/api/webhooks/status", requireAdmin, async (_req, res) => {
    try {
      const events = await storage.getWebhookEvents();
      const recentEvents = events.slice(0, 50);
      const stats = {
        total: events.length,
        processed: events.filter(e => e.processed).length,
        pending: events.filter(e => !e.processed).length,
        failed: events.filter(e => e.errorMessage).length,
      };
      res.json({ stats, recentEvents });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch webhook status" });
    }
  });

  return httpServer;
}
