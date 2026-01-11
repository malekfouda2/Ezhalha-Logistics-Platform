import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";

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

// Audit logging helper
async function logAudit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
  ipAddress?: string
) {
  try {
    await storage.createAuditLog({
      userId: userId || null,
      action,
      entityType,
      entityId: entityId || null,
      details: details || null,
      ipAddress: ipAddress || null,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  // ============================================
  // PUBLIC ROUTES - CLIENT APPLICATIONS
  // ============================================
  app.post("/api/applications", async (req, res) => {
    try {
      const data = applicationFormSchema.parse(req.body);
      const application = await storage.createClientApplication({
        ...data,
        documents: data.documents || null,
        status: "pending",
      });
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
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

  // Admin - All Invoices
  app.get("/api/admin/invoices", requireAdmin, async (_req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
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

  // Client - Create Shipment
  app.post("/api/client/shipments", requireClient, async (req, res) => {
    try {
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
      await storage.createInvoice({
        clientAccountId: user.clientAccountId,
        shipmentId: shipment.id,
        amount: finalPrice.toFixed(2),
        status: "pending",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Log shipment creation
      await logAudit(req.session.userId, "create_shipment", "shipment", shipment.id,
        `Created shipment ${shipment.trackingNumber} for $${finalPrice.toFixed(2)}`, req.ip);

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

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  return httpServer;
}
