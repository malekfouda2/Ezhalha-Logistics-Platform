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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
  app.get("/api/admin/shipments", requireAdmin, async (_req, res) => {
    const shipments = await storage.getShipments();
    res.json(shipments);
  });

  // Admin - Update Shipment Status (cancelled is handled by dedicated cancel endpoint)
  const statusUpdateSchema = z.object({
    status: z.enum(["processing", "in_transit", "delivered"]),
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
  app.get("/api/admin/applications", requireAdmin, async (_req, res) => {
    const applications = await storage.getClientApplications();
    res.json(applications);
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
  app.get("/api/admin/clients", requireAdmin, async (_req, res) => {
    const clients = await storage.getClientAccounts();
    res.json(clients);
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

      if (!["regular", "mid_level", "vip"].includes(profile)) {
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
      if (profile !== undefined && ["regular", "mid_level", "vip"].includes(profile)) updates.profile = profile;
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
  app.get("/api/admin/invoices", requireAdmin, async (_req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
  });

  // Admin - All Payments
  app.get("/api/admin/payments", requireAdmin, async (_req, res) => {
    const payments = await storage.getPayments();
    res.json(payments);
  });

  // Admin - Pricing Rules
  app.get("/api/admin/pricing", requireAdmin, async (_req, res) => {
    const rules = await storage.getPricingRules();
    res.json(rules);
  });

  // Admin - Update Pricing Rule
  app.patch("/api/admin/pricing/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { marginPercentage } = req.body;

      const margin = parseFloat(marginPercentage);
      if (isNaN(margin) || margin < 0 || margin > 100) {
        return res.status(400).json({ error: "Invalid margin percentage" });
      }

      const updated = await storage.updatePricingRule(id, {
        marginPercentage: margin.toFixed(2),
      });
      if (!updated) {
        return res.status(404).json({ error: "Pricing rule not found" });
      }

      // Log pricing change
      await logAudit(req.session.userId, "update_pricing", "pricing_rule", id,
        `Updated margin to ${margin}%`, req.ip);

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Audit Logs
  app.get("/api/admin/audit-logs", requireAdmin, async (_req, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Integration Logs
  app.get("/api/admin/integration-logs", requireAdmin, async (_req, res) => {
    try {
      const logs = await storage.getIntegrationLogs();
      res.json(logs);
    } catch (error) {
      logError("Error fetching integration logs", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Webhook Events
  app.get("/api/admin/webhook-events", requireAdmin, async (_req, res) => {
    try {
      const events = await storage.getWebhookEvents();
      res.json(events);
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

  // Client - Create Shipment
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
