import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(data.username);

      if (!user || user.password !== data.password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "Account is deactivated" });
      }

      req.session.userId = user.id;
      
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
        
        await storage.createUser({
          username,
          email: application.email,
          password: "welcome123", // In production, generate and email a secure password
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

        res.json({ success: true, clientAccount });
      } else if (action === "reject") {
        await storage.updateClientApplication(id, {
          status: "rejected",
          reviewedBy: req.session.userId,
          reviewNotes: notes,
        });
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
      const { name, email, phone, country, companyName, documents } = req.body;
      
      if (!name || !email || !phone || !country) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const client = await storage.createClientAccount({
        name,
        email,
        phone,
        country,
        companyName: companyName || null,
        documents: documents || null,
        profile: "regular",
        isActive: true,
      });
      res.status(201).json(client);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin - Delete Client
  app.delete("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteClientAccount(id);
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

      const updated = await storage.updateClientAccount(id, { profile });
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }

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

      res.json(updated);
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

      res.status(201).json(shipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
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
