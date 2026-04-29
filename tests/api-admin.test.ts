import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import bcrypt from "bcrypt";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { ACCOUNT_MANAGER_SYSTEM_ROLE_ID, InvoiceType } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[] = [];
let limitedAdminCookies: string[] = [];
const LIMITED_ADMIN_PASSWORD = "LimitedAdmin123!";

const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);
const asAdmin = {
  get: (path: string) => withCookies(request.get(path), adminCookies),
  post: (path: string) => withCookies(request.post(path), adminCookies),
  put: (path: string) => withCookies(request.put(path), adminCookies),
  patch: (path: string) => withCookies(request.patch(path), adminCookies),
  delete: (path: string) => withCookies(request.delete(path), adminCookies),
};
const asLimitedAdmin = {
  get: (path: string) => withCookies(request.get(path), limitedAdminCookies),
  post: (path: string) => withCookies(request.post(path), limitedAdminCookies),
};

async function loginAndGetCookies(username: string, password: string): Promise<string[]> {
  const res = await request.post("/api/auth/login").send({ username, password });
  return res.headers["set-cookie"] || [];
}

async function uploadTradeDocumentAsPublic(
  fileName: string,
  contentType: string = "application/pdf",
  fileBody: Buffer = Buffer.from("%PDF-1.4 admin retry trade document"),
) {
  const uploadUrlRes = await request
    .post("/api/public/uploads/request-url")
    .send({
      name: fileName,
      size: fileBody.length,
      contentType,
    });

  expect(uploadUrlRes.status).toBe(200);
  expect(uploadUrlRes.body).toHaveProperty("uploadURL");
  expect(uploadUrlRes.body).toHaveProperty("objectPath");

  const uploadUrl = new URL(uploadUrlRes.body.uploadURL);
  const uploadRes = await request
    .put(`${uploadUrl.pathname}${uploadUrl.search}`)
    .set("Content-Type", contentType)
    .send(fileBody);

  expect(uploadRes.status).toBe(200);

  return {
    fileName,
    objectPath: uploadUrlRes.body.objectPath as string,
    contentType,
    size: fileBody.length,
    documentType: "COMMERCIAL_INVOICE" as const,
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const adminLoginRes = await request
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
  adminCookies = adminLoginRes.headers["set-cookie"] || [];

  const limitedAdminUsername = `limited_admin_${Date.now()}`;
  const limitedAdminEmail = `${limitedAdminUsername}@test.com`;
  const limitedAdminRole = await storage.createRole({
    name: `limited_admin_role_${Date.now()}`,
    description: "Limited admin for RBAC tests",
    isActive: true,
  });
  const clientReadPermission = (await storage.getPermissions()).find(
    (permission) => permission.resource === "clients" && permission.action === "read",
  );

  if (!clientReadPermission) {
    throw new Error("Expected clients:read permission to exist");
  }

  await storage.assignRolePermission({
    roleId: limitedAdminRole.id,
    permissionId: clientReadPermission.id,
  });

  const hashedPassword = await bcrypt.hash(LIMITED_ADMIN_PASSWORD, 10);
  const limitedAdminUser = await storage.createUser({
    username: limitedAdminUsername,
    email: limitedAdminEmail,
    password: hashedPassword,
    userType: "admin",
    isActive: true,
  });

  await storage.assignUserRole({
    userId: limitedAdminUser.id,
    roleId: limitedAdminRole.id,
  });

  const limitedAdminLoginRes = await request
    .post("/api/auth/login")
    .send({ username: limitedAdminUsername, password: LIMITED_ADMIN_PASSWORD });
  limitedAdminCookies = limitedAdminLoginRes.headers["set-cookie"] || [];
}, 30000);

afterAll(() => {
  server.close();
});

describe("Admin - Dashboard", () => {
  it("GET /api/admin/stats should return stats", async () => {
    const res = await asAdmin.get("/api/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalClients");
    expect(res.body).toHaveProperty("activeClients");
    expect(res.body).toHaveProperty("pendingApplications");
    expect(res.body).toHaveProperty("totalShipments");
    expect(res.body).toHaveProperty("totalRevenue");
    expect(typeof res.body.totalClients).toBe("number");
    expect(typeof res.body.activeClients).toBe("number");
  });
});

describe("Admin - Financial Statements", () => {
  it("GET /api/admin/financial-statements should return accounting summaries and shipment detail", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Financial Client ${unique}`,
      email: `financial_client_${unique}@test.com`,
      phone: "5551234567",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Financial Test Co",
      isActive: true,
      shippingContactName: "Finance Contact",
      shippingContactPhone: "5551234567",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "100 Finance Street",
      shippingShortAddress: "RCTB4359",
    });

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550000001",
      recipientName: "Domestic Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550000002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      extraFeesAmountSar: "27.60",
      currency: "SAR",
      carrierCode: "FEDEX",
      carrierName: "FedEx",
      carrierTrackingNumber: `FDX-${unique}`,
      paymentStatus: "pending",
    });

    const now = new Date();
    const res = await asAdmin.get(
      `/api/admin/financial-statements?month=${now.getMonth() + 1}&year=${now.getFullYear()}&search=${encodeURIComponent(clientAccount.name)}&scenario=DCE`,
    );

    expect(res.status).toBe(200);
    expect(res.body.summary.totalShipments).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.clientTotalAmountSar).toBeGreaterThanOrEqual(138);
    expect(Array.isArray(res.body.monthlyStatements)).toBe(true);
    expect(Array.isArray(res.body.carrierTransactions)).toBe(true);
    expect(Array.isArray(res.body.shipments)).toBe(true);

    const matchedShipment = res.body.shipments.find((entry: any) => entry.id === shipment.id);
    expect(matchedShipment).toBeDefined();
    expect(matchedShipment.taxScenario).toBe("DCE");
    expect(matchedShipment.clientName).toBe(clientAccount.name);
    expect(Number(matchedShipment.clientTotalAmountSar)).toBe(138);
    expect(Number(matchedShipment.taxPayableAmountSar)).toBe(3);
    expect(Number(res.body.summary.netProfitAmountSar)).toBeGreaterThanOrEqual(20);
    expect(Number(matchedShipment.netProfitAmountSar)).toBe(20);
    expect(Number(matchedShipment.extraFeesAmountSar)).toBe(27.6);
    expect(matchedShipment.carrierTrackingId).toBe(`FDX-${unique}`);
    expect(matchedShipment.canMarkPaid).toBe(true);
    expect(matchedShipment.isClientPaid).toBe(false);
  });

  it("GET /api/admin/financial-statements should support searching multiple shipments in one query", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Multi Search Client ${unique}`,
      email: `multi_search_client_${unique}@test.com`,
      phone: "5551234665",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Multi Search Co",
      isActive: true,
      shippingContactName: "Multi Search Contact",
      shippingContactPhone: "5551234665",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "112 Finance Street",
      shippingShortAddress: "RCTB4365",
    });

    const shipmentA = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse A",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550020001",
      recipientName: "Recipient A",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550020002",
      weight: "3.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "80.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "115.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "80.00",
      costTaxAmountSar: "12.00",
      sellSubtotalAmountSar: "100.00",
      sellTaxAmountSar: "15.00",
      clientTotalAmountSar: "115.00",
      systemCostTotalAmountSar: "92.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "100.00",
      currency: "SAR",
      paymentStatus: "pending",
    });

    const shipmentB = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse B",
      senderAddress: "101 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550021001",
      recipientName: "Recipient B",
      recipientAddress: "201 Recipient Road",
      recipientCity: "Dammam",
      recipientCountry: "SA",
      recipientPhone: "5550021002",
      weight: "4.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "90.00",
      marginAmount: "30.00",
      margin: "30.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "90.00",
      costTaxAmountSar: "13.50",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "103.50",
      taxPayableAmountSar: "4.50",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "pending",
    });

    const res = await asAdmin.get(
      `/api/admin/financial-statements?search=${encodeURIComponent(`${shipmentA.trackingNumber}, ${shipmentB.trackingNumber}`)}`,
    );

    expect(res.status).toBe(200);
    const resultIds = res.body.shipments.map((entry: any) => entry.id);
    expect(resultIds).toContain(shipmentA.id);
    expect(resultIds).toContain(shipmentB.id);
  });

  it("GET /api/admin/financial-statements should zero cancelled shipments while keeping them visible", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Cancelled Financial Client ${unique}`,
      email: `cancelled_financial_client_${unique}@test.com`,
      phone: "5551234500",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Cancelled Financial Test Co",
      isActive: true,
      shippingContactName: "Cancelled Finance Contact",
      shippingContactPhone: "5551234500",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "101 Finance Street",
      shippingShortAddress: "RCTB4360",
    });

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550001001",
      recipientName: "Cancelled Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550001002",
      weight: "4.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "cancelled",
      baseRate: "120.00",
      marginAmount: "30.00",
      margin: "30.00",
      finalPrice: "172.50",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "120.00",
      costTaxAmountSar: "18.00",
      sellSubtotalAmountSar: "150.00",
      sellTaxAmountSar: "22.50",
      clientTotalAmountSar: "172.50",
      systemCostTotalAmountSar: "138.00",
      taxPayableAmountSar: "4.50",
      revenueExcludingTaxAmountSar: "150.00",
      currency: "SAR",
      paymentStatus: "unpaid",
    });

    const now = new Date();
    const res = await asAdmin.get(
      `/api/admin/financial-statements?month=${now.getMonth() + 1}&year=${now.getFullYear()}&search=${shipment.trackingNumber}`,
    );

    expect(res.status).toBe(200);
    const matchedShipment = res.body.shipments.find((entry: any) => entry.id === shipment.id);
    expect(matchedShipment).toBeDefined();
    expect(Number(matchedShipment.costAmountSar)).toBe(0);
    expect(Number(matchedShipment.costTaxAmountSar)).toBe(0);
    expect(Number(matchedShipment.clientTotalAmountSar)).toBe(0);
    expect(Number(matchedShipment.revenueExcludingTaxAmountSar)).toBe(0);
    expect(Number(matchedShipment.netProfitAmountSar)).toBe(0);
    expect(matchedShipment.isCancelledFinancially).toBe(true);
  });

  it("GET /api/admin/financial-statements should filter by date range, carrier name, and paid status", async () => {
    const unique = Date.now();
    const carrierName = `Filter Carrier ${unique}`;
    const clientAccount = await storage.createClientAccount({
      name: `Filtered Financial Client ${unique}`,
      email: `filtered_financial_client_${unique}@test.com`,
      phone: "5551234666",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Filtered Financial Co",
      isActive: true,
      shippingContactName: "Filtered Finance Contact",
      shippingContactPhone: "5551234666",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "111 Finance Street",
      shippingShortAddress: "RCTB4364",
    });

    const matchingShipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550010001",
      recipientName: "Filtered Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550010002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierPaymentStatus: "PAID",
      carrierName,
      carrierCode: `FILTER_${unique}`,
      createdAt: new Date("2026-04-06T10:00:00Z"),
    } as any);

    await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550011001",
      recipientName: "Filtered Recipient 2",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550011002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "pending",
      carrierPaymentStatus: "PAID",
      carrierName,
      carrierCode: `FILTER_${unique}`,
      createdAt: new Date("2026-04-07T10:00:00Z"),
    } as any);

    await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550012001",
      recipientName: "Filtered Recipient 3",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550012002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierPaymentStatus: "UNPAID",
      carrierName,
      carrierCode: `FILTER_${unique}`,
      createdAt: new Date("2026-04-08T10:00:00Z"),
    } as any);

    await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550013001",
      recipientName: "Filtered Recipient 4",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550013002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierPaymentStatus: "PAID",
      carrierName,
      carrierCode: `FILTER_${unique}`,
      createdAt: new Date("2026-03-28T10:00:00Z"),
    } as any);

    const res = await asAdmin.get(
      `/api/admin/financial-statements?startDate=2026-04-01&endDate=2026-04-30&carrierName=${encodeURIComponent(carrierName)}&clientPaymentStatus=paid&carrierPaymentStatus=paid`,
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.summary.totalShipments).toBe(1);
    expect(res.body.monthlyStatements).toHaveLength(1);
    expect(res.body.shipments).toHaveLength(1);
    expect(res.body.shipments[0].id).toBe(matchingShipment.id);
    expect(res.body.shipments[0].isClientPaid).toBe(true);
    expect(res.body.shipments[0].isCarrierPaid).toBe(true);
  });

  it("POST /api/admin/financial-statements/shipments/:id/mark-paid should mark unpaid shipments as client-paid and create a payment record", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Mark Paid Client ${unique}`,
      email: `mark_paid_client_${unique}@test.com`,
      phone: "5551234777",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Mark Paid Co",
      isActive: true,
      shippingContactName: "Mark Paid Contact",
      shippingContactPhone: "5551234777",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "102 Finance Street",
      shippingShortAddress: "RCTB4361",
    });

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550002001",
      recipientName: "Unpaid Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550002002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "payment_pending",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "pending",
    });

    const res = await asAdmin.post(`/api/admin/financial-statements/shipments/${shipment.id}/mark-paid`).send({});

    expect(res.status).toBe(200);
    expect(res.body.shipment).toBeDefined();
    expect(res.body.shipment.isClientPaid).toBe(true);

    const updatedShipment = await storage.getShipment(shipment.id);
    expect(updatedShipment?.paymentStatus).toBe("paid");

    const invoice = await storage.getInvoiceByShipmentId(shipment.id);
    expect(invoice).toBeDefined();
    expect(invoice?.status).toBe("paid");
    expect(invoice?.paidAt).not.toBeNull();

    const payments = await storage.getPaymentsByClientAccount(clientAccount.id);
    const completedPayment = payments.find((payment) => payment.invoiceId === invoice?.id && payment.status === "completed");
    expect(completedPayment).toBeDefined();
  });

  it("PATCH /api/admin/financial-statements/shipments/:id/extra-fees should save combined extra fees and reset them", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Extra Fees Client ${unique}`,
      email: `extra_fees_client_${unique}@test.com`,
      phone: "5551234888",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Extra Fees Co",
      isActive: true,
      shippingContactName: "Extra Fees Contact",
      shippingContactPhone: "5551234888",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "103 Finance Street",
      shippingShortAddress: "RCTB4362",
    });

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550003001",
      recipientName: "Fees Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550003002",
      weight: "4.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "200.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "182.00",
      currency: "SAR",
      paymentStatus: "paid",
    });

    const saveRes = await asAdmin
      .patch(`/api/admin/financial-statements/shipments/${shipment.id}/extra-fees`)
      .send({ extraWeightValue: "1.00", extraCostAmountSar: "25.00" });

    expect(saveRes.status).toBe(200);
    expect(Number(saveRes.body.extraFeesAmountSar)).toBe(75);
    expect(saveRes.body.extraFeesType).toBe("COMBINED");
    expect(Number(saveRes.body.extraFeesWeightValue)).toBe(1);
    expect(Number(saveRes.body.extraFeesCostAmountSar)).toBe(25);
    expect(Number(saveRes.body.costAmountSar)).toBe(125);
    expect(Number(saveRes.body.systemCostTotalAmountSar)).toBe(140);

    const savedShipment = await storage.getShipment(shipment.id);
    expect(savedShipment?.extraFeesAmountSar).toBe("75.00");
    expect(savedShipment?.extraFeesType).toBe("COMBINED");
    expect(savedShipment?.extraFeesWeightValue).toBe("1.00");
    expect(savedShipment?.extraFeesCostAmountSar).toBe("25.00");

    const savedInvoices = await storage.getInvoicesByShipmentId(shipment.id);
    const extraWeightInvoice = savedInvoices.find((invoice) => invoice.invoiceType === InvoiceType.EXTRA_WEIGHT);
    const extraCostInvoice = savedInvoices.find((invoice) => invoice.invoiceType === InvoiceType.EXTRA_COST);

    expect(extraWeightInvoice).toBeDefined();
    expect(extraWeightInvoice?.status).toBe("pending");
    expect(Number(extraWeightInvoice?.amount)).toBe(50);

    expect(extraCostInvoice).toBeUndefined();

    const resetRes = await asAdmin
      .patch(`/api/admin/financial-statements/shipments/${shipment.id}/extra-fees`)
      .send({ clear: true });

    expect(resetRes.status).toBe(200);
    expect(Number(resetRes.body.extraFeesAmountSar)).toBe(0);

    const resetShipment = await storage.getShipment(shipment.id);
    expect(resetShipment?.extraFeesAmountSar).toBeNull();
    expect(resetShipment?.extraFeesType).toBeNull();
    expect(resetShipment?.extraFeesWeightValue).toBeNull();
    expect(resetShipment?.extraFeesCostAmountSar).toBeNull();

    const resetInvoices = await storage.getInvoicesByShipmentId(shipment.id);
    expect(resetInvoices.find((invoice) => invoice.invoiceType === InvoiceType.EXTRA_WEIGHT)).toBeUndefined();
    expect(resetInvoices.find((invoice) => invoice.invoiceType === InvoiceType.EXTRA_COST)).toBeUndefined();
  });

  it("POST /api/admin/financial-statements/shipments/:id/mark-carrier-paid should mark the carrier settlement on a shipment", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Carrier Mark Client ${unique}`,
      email: `carrier_mark_client_${unique}@test.com`,
      phone: "5551234664",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Carrier Mark Co",
      isActive: true,
      shippingContactName: "Carrier Mark Contact",
      shippingContactPhone: "5551234664",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "113 Finance Street",
      shippingShortAddress: "RCTB4366",
    });

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse Carrier",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550022001",
      recipientName: "Carrier Paid Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550022002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierPaymentStatus: "UNPAID",
      carrierName: "FedEx",
      carrierCode: "FEDEX",
      carrierTrackingNumber: `FDX-CARRIER-${unique}`,
    });

    const res = await asAdmin.post(`/api/admin/financial-statements/shipments/${shipment.id}/mark-carrier-paid`).send({
      paymentReference: `BANK-${unique}`,
      paymentNote: "Month-end FedEx settlement",
    });

    expect(res.status).toBe(200);
    expect(res.body.isCarrierPaid).toBe(true);
    expect(Number(res.body.carrierPaymentAmountSar)).toBe(115);
    expect(res.body.carrierPaymentReference).toBe(`BANK-${unique}`);
    expect(res.body.carrierPaymentNote).toBe("Month-end FedEx settlement");

    const updatedShipment = await storage.getShipment(shipment.id);
    expect(updatedShipment?.carrierPaymentStatus).toBe("PAID");
    expect(updatedShipment?.carrierPaidAt).not.toBeNull();
    expect(updatedShipment?.carrierPaymentAmountSar).toBe("115.00");
    expect(updatedShipment?.carrierPaymentReference).toBe(`BANK-${unique}`);
    expect(updatedShipment?.carrierPaymentNote).toBe("Month-end FedEx settlement");

    const statementRes = await asAdmin.get(
      `/api/admin/financial-statements?search=${encodeURIComponent(shipment.trackingNumber)}`,
    );
    expect(statementRes.status).toBe(200);
    const matchingTransaction = statementRes.body.carrierTransactions.find(
      (entry: any) => entry.shipmentId === shipment.id,
    );
    expect(matchingTransaction).toBeDefined();
    expect(Number(matchingTransaction.carrierTaxAmountSar)).toBe(15);
    expect(Number(matchingTransaction.carrierPaymentAmountSar)).toBe(115);
    expect(matchingTransaction.carrierPaymentReference).toBe(`BANK-${unique}`);
  });

  it("POST /api/admin/financial-statements/shipments/:id/cancel-carrier-payment should clear a stored carrier settlement so the shipment can be paid again", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Carrier Cancel Client ${unique}`,
      email: `carrier_cancel_client_${unique}@test.com`,
      phone: "5551234663",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Carrier Cancel Co",
      isActive: true,
      shippingContactName: "Carrier Cancel Contact",
      shippingContactPhone: "5551234663",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "114 Finance Street",
      shippingShortAddress: "RCTB4367",
    });

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse Carrier",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550023001",
      recipientName: "Carrier Cancel Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550023002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierPaymentStatus: "PAID",
      carrierPaidAt: new Date(),
      carrierPaymentAmountSar: "115.00",
      carrierPaymentReference: `BANK-CANCEL-${unique}`,
      carrierPaymentNote: "Initial settlement",
      carrierName: "FedEx",
      carrierCode: "FEDEX",
      carrierTrackingNumber: `FDX-CANCEL-${unique}`,
    } as any);

    const res = await asAdmin.post(`/api/admin/financial-statements/shipments/${shipment.id}/cancel-carrier-payment`).send({});

    expect(res.status).toBe(200);
    expect(res.body.isCarrierPaid).toBe(false);
    expect(res.body.canMarkCarrierPaid).toBe(true);
    expect(res.body.carrierPaymentReference).toBeNull();
    expect(Number(res.body.carrierPaymentAmountSar)).toBe(0);

    const updatedShipment = await storage.getShipment(shipment.id);
    expect(updatedShipment?.carrierPaymentStatus).toBe("UNPAID");
    expect(updatedShipment?.carrierPaidAt).toBeNull();
    expect(updatedShipment?.carrierPaymentAmountSar).toBeNull();
    expect(updatedShipment?.carrierPaymentReference).toBeNull();
    expect(updatedShipment?.carrierPaymentNote).toBeNull();
  });

  it("carrier payout batch routes should batch eligible shipments and mark the carrier settlement as paid", async () => {
    const unique = Date.now();
    const carrierCode = `TEST_CARRIER_${unique}`;
    const carrierName = `Test Carrier ${unique}`;
    const clientAccount = await storage.createClientAccount({
      name: `Carrier Batch Client ${unique}`,
      email: `carrier_batch_client_${unique}@test.com`,
      phone: "5551234999",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Carrier Batch Co",
      isActive: true,
      shippingContactName: "Carrier Batch Contact",
      shippingContactPhone: "5551234999",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "104 Finance Street",
      shippingShortAddress: "RCTB4363",
    });

    const now = new Date();
    const shipmentA = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550004001",
      recipientName: "Carrier Batch Recipient A",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550004002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "138.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "100.00",
      costTaxAmountSar: "15.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "18.00",
      clientTotalAmountSar: "138.00",
      systemCostTotalAmountSar: "115.00",
      taxPayableAmountSar: "3.00",
      revenueExcludingTaxAmountSar: "120.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierCode,
      carrierName,
      carrierTrackingNumber: `FDX-BATCH-A-${unique}`,
      createdAt: now,
    } as any);

    const shipmentB = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Warehouse KSA",
      senderAddress: "100 Sender Road",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5550005001",
      recipientName: "Carrier Batch Recipient B",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5550005002",
      weight: "6.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "domestic",
      isDdp: false,
      status: "created",
      baseRate: "150.00",
      marginAmount: "30.00",
      margin: "30.00",
      finalPrice: "207.00",
      accountingCurrency: "SAR",
      taxScenario: "DCE",
      costAmountSar: "150.00",
      costTaxAmountSar: "22.50",
      sellSubtotalAmountSar: "180.00",
      sellTaxAmountSar: "27.00",
      clientTotalAmountSar: "207.00",
      systemCostTotalAmountSar: "172.50",
      taxPayableAmountSar: "4.50",
      revenueExcludingTaxAmountSar: "180.00",
      currency: "SAR",
      paymentStatus: "paid",
      carrierCode,
      carrierName,
      carrierTrackingNumber: `FDX-BATCH-B-${unique}`,
      createdAt: now,
    } as any);

    const createRes = await asAdmin.post("/api/admin/carrier-payout-batches").send({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      carrierKey: carrierCode,
      notes: "Month-end settlement",
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("OPEN");
    expect(createRes.body.shipmentCount).toBe(2);

    const batchedShipmentA = await storage.getShipment(shipmentA.id);
    const batchedShipmentB = await storage.getShipment(shipmentB.id);
    expect(batchedShipmentA?.carrierPaymentStatus).toBe("BATCHED");
    expect(batchedShipmentB?.carrierPaymentStatus).toBe("BATCHED");
    expect(batchedShipmentA?.carrierPayoutBatchId).toBe(createRes.body.id);
    expect(batchedShipmentB?.carrierPayoutBatchId).toBe(createRes.body.id);

    const listRes = await asAdmin.get(
      `/api/admin/carrier-payout-batches?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.batches.some((batch: any) => batch.id === createRes.body.id)).toBe(true);

    const markPaidRes = await asAdmin.post(`/api/admin/carrier-payout-batches/${createRes.body.id}/mark-paid`).send({
      paymentReference: `BANK-${unique}`,
    });

    expect(markPaidRes.status).toBe(200);
    expect(markPaidRes.body.status).toBe("PAID");

    const paidShipmentA = await storage.getShipment(shipmentA.id);
    const paidShipmentB = await storage.getShipment(shipmentB.id);
    expect(paidShipmentA?.carrierPaymentStatus).toBe("PAID");
    expect(paidShipmentB?.carrierPaymentStatus).toBe("PAID");
    expect(paidShipmentA?.carrierPaidAt).not.toBeNull();
    expect(paidShipmentB?.carrierPaidAt).not.toBeNull();
  });
});

describe("Admin - RBAC Enforcement", () => {
  it("limited admins should access only routes granted by their roles", async () => {
    const allowedRes = await asLimitedAdmin.get("/api/admin/clients");
    expect(allowedRes.status).toBe(200);

    const deniedRes = await asLimitedAdmin.get("/api/admin/pricing");
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.error).toBe("Permission denied");
  });

  it("admin access endpoint should return the effective permission names for the current admin", async () => {
    const adminRes = await asAdmin.get("/api/admin/me/access");
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body.permissions)).toBe(true);
    expect(adminRes.body.permissions).toContain("dashboard:read");

    const limitedRes = await asLimitedAdmin.get("/api/admin/me/access");
    expect(limitedRes.status).toBe(200);
    expect(limitedRes.body.permissions).toEqual(["clients:read"]);
  });
});

describe("Admin - Admin User Management", () => {
  it("GET /api/admin/users should return admin users without exposing passwords", async () => {
    const res = await asAdmin.get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const bootstrapAdmin = res.body.find((user: any) => user.username === "admin");
    expect(bootstrapAdmin).toBeDefined();
    expect(bootstrapAdmin.password).toBeUndefined();
    expect(Array.isArray(bootstrapAdmin.roles)).toBe(true);
  });

  it("POST /api/admin/users should create an admin user and assign roles", async () => {
    const role = await storage.createRole({
      name: `ops_admin_role_${Date.now()}`,
      description: "Operations admin role",
      isActive: true,
    });

    const payload = {
      username: `ops_admin_${Date.now()}`,
      email: `ops_admin_${Date.now()}@test.com`,
      password: "OpsAdmin123!",
      roleIds: [role.id],
      isActive: true,
    };

    const res = await asAdmin.post("/api/admin/users").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.username).toBe(payload.username);
    expect(res.body.email).toBe(payload.email.toLowerCase());
    expect(res.body.userType).toBe("admin");
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.roles.map((assignedRole: any) => assignedRole.id)).toContain(role.id);
    expect(res.body.password).toBeUndefined();

    const createdUser = await storage.getUserByUsername(payload.username);
    expect(createdUser).toBeDefined();
    expect(createdUser?.password).not.toBe(payload.password);

    const createdUserRoles = await storage.getUserRoles(createdUser!.id);
    expect(createdUserRoles.some((userRole) => userRole.roleId === role.id)).toBe(true);
  });

  it("POST /api/admin/users should create an account manager via the built-in role", async () => {
    const unique = Date.now();
    const assignedClient = await storage.createClientAccount({
      name: `Built In AM Client ${unique}`,
      email: `built_in_am_client_${unique}@test.com`,
      phone: "5555551111",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Built In AM Co",
      isActive: true,
      shippingContactName: "Client Contact",
      shippingContactPhone: "5555551111",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "25 Access Street",
      shippingShortAddress: "RCTB4400",
    });

    const payload = {
      username: `built_in_manager_${unique}`,
      email: `built_in_manager_${unique}@test.com`,
      password: "BuiltInRole123!",
      roleIds: [ACCOUNT_MANAGER_SYSTEM_ROLE_ID],
      accountManagerClientIds: [assignedClient.id],
      isActive: true,
    };

    const res = await asAdmin.post("/api/admin/users").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.isAccountManager).toBe(true);
    expect(res.body.roles.map((role: any) => role.id)).toContain(ACCOUNT_MANAGER_SYSTEM_ROLE_ID);
    expect(res.body.assignedClients.map((client: any) => client.id)).toEqual([assignedClient.id]);

    const createdUser = await storage.getUserByUsername(payload.username);
    expect(createdUser?.isAccountManager).toBe(true);

    const assignments = await storage.getAccountManagerAssignments({ accountManagerUserId: createdUser!.id });
    expect(assignments.map((assignment) => assignment.clientAccountId)).toEqual([assignedClient.id]);
  });

  it("POST and DELETE /api/admin/users/:userId/roles/:roleId should assign and remove the built-in account manager role", async () => {
    const unique = Date.now();
    const hashedPassword = await bcrypt.hash("ScopedAdmin123!", 10);
    const adminUser = await storage.createUser({
      username: `rbac_scope_admin_${unique}`,
      email: `rbac_scope_admin_${unique}@test.com`,
      password: hashedPassword,
      userType: "admin",
      isPrimaryContact: false,
      mustChangePassword: false,
      isActive: true,
    });

    const assignedClient = await storage.createClientAccount({
      name: `Role Toggle Client ${unique}`,
      email: `role_toggle_client_${unique}@test.com`,
      phone: "5555552222",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Role Toggle Co",
      isActive: true,
      shippingContactName: "Client Contact",
      shippingContactPhone: "5555552222",
      shippingCountryCode: "SA",
      shippingStateOrProvince: "Riyadh",
      shippingCity: "Riyadh",
      shippingPostalCode: "12345",
      shippingAddressLine1: "30 Scope Street",
      shippingShortAddress: "RCTB4401",
    });

    const assignRes = await asAdmin.post(`/api/admin/users/${adminUser.id}/roles/${ACCOUNT_MANAGER_SYSTEM_ROLE_ID}`);
    expect(assignRes.status).toBe(201);

    let updatedUser = await storage.getUser(adminUser.id);
    expect(updatedUser?.isAccountManager).toBe(true);

    const assignClientsRes = await asAdmin
      .put(`/api/admin/account-managers/${adminUser.id}/clients`)
      .send({ clientAccountIds: [assignedClient.id] });
    expect(assignClientsRes.status).toBe(200);

    const removeRes = await asAdmin.delete(`/api/admin/users/${adminUser.id}/roles/${ACCOUNT_MANAGER_SYSTEM_ROLE_ID}`);
    expect(removeRes.status).toBe(200);

    updatedUser = await storage.getUser(adminUser.id);
    expect(updatedUser?.isAccountManager).toBe(false);

    const assignments = await storage.getAccountManagerAssignments({ accountManagerUserId: adminUser.id });
    expect(assignments).toHaveLength(0);
  });

  it("POST /api/admin/users/:userId/roles/:roleId should reject non-admin targets", async () => {
    const clientUser = await storage.getUserByUsername("client");
    expect(clientUser).toBeDefined();

    const role = await storage.createRole({
      name: `non_admin_target_role_${Date.now()}`,
      description: "Role assignment target guard",
      isActive: true,
    });

    const res = await asAdmin.post(`/api/admin/users/${clientUser!.id}/roles/${role.id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Admin user not found");
  });
});

describe("Admin - Client Management", () => {
  it("GET /api/admin/clients should return paginated clients list", async () => {
    const res = await asAdmin.get("/api/admin/clients");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("clients");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("totalPages");
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it("GET /api/admin/clients should support pagination parameters", async () => {
    const res = await asAdmin.get("/api/admin/clients?page=1&limit=2");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.clients.length).toBeLessThanOrEqual(2);
  });

  it("GET /api/admin/clients should support search filter", async () => {
    const res = await asAdmin.get("/api/admin/clients?search=test");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it("GET /api/admin/clients should support profile filter", async () => {
    const res = await asAdmin.get("/api/admin/clients?profile=regular");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it("GET /api/admin/clients/:id should return a specific client", async () => {
    const listRes = await asAdmin.get("/api/admin/clients");
    if (listRes.body.clients.length > 0) {
      const clientId = listRes.body.clients[0].id;
      const res = await asAdmin.get(`/api/admin/clients/${clientId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(clientId);
      expect(res.body.name).toBeDefined();
      expect(res.body.email).toBeDefined();
    }
  });

  it("GET /api/admin/clients/:id should return 404 for non-existent client", async () => {
    const res = await asAdmin.get("/api/admin/clients/nonexistent-id-999");
    expect(res.status).toBe(404);
  });

  it("POST /api/admin/clients should create a primary-contact client user for new accounts", async () => {
    const unique = Date.now();
    const email = `created_client_${unique}@test.com`;

    const res = await asAdmin.post("/api/admin/clients").send({
      name: "Created Client",
      email,
      phone: "5554443322",
      country: "United States",
      profile: "regular",
    });

    expect(res.status).toBe(201);

    const createdUser = await storage.getUserByEmail(email);
    expect(createdUser).toBeDefined();
    expect(createdUser?.userType).toBe("client");
    expect(createdUser?.isPrimaryContact).toBe(true);
    expect(createdUser?.mustChangePassword).toBe(true);
  });

  it("POST /api/admin/clients should allow assigning an account manager", async () => {
    const unique = Date.now();
    const managerRes = await asAdmin.post("/api/admin/users").send({
      username: `client_assign_manager_${unique}`,
      email: `client_assign_manager_${unique}@test.com`,
      password: "ClientAssign123!",
      roleIds: [ACCOUNT_MANAGER_SYSTEM_ROLE_ID],
      accountManagerClientIds: [],
      isActive: true,
    });

    expect(managerRes.status).toBe(201);

    const clientRes = await asAdmin.post("/api/admin/clients").send({
      name: `Assigned Client ${unique}`,
      email: `assigned_client_${unique}@test.com`,
      phone: "5554441111",
      country: "Saudi Arabia",
      profile: "regular",
      assignedAccountManagerUserId: managerRes.body.id,
    });

    expect(clientRes.status).toBe(201);
    expect(clientRes.body.assignedAccountManager?.id).toBe(managerRes.body.id);

    const assignments = await storage.getAccountManagerAssignments({
      accountManagerUserId: managerRes.body.id,
      clientAccountId: clientRes.body.id,
    });
    expect(assignments).toHaveLength(1);
  });

  it("GET /api/admin/clients should support filtering by assigned account manager", async () => {
    const unique = Date.now();
    const managerRes = await asAdmin.post("/api/admin/users").send({
      username: `client_filter_manager_${unique}`,
      email: `client_filter_manager_${unique}@test.com`,
      password: "ClientFilter123!",
      roleIds: [ACCOUNT_MANAGER_SYSTEM_ROLE_ID],
      accountManagerClientIds: [],
      isActive: true,
    });

    expect(managerRes.status).toBe(201);

    const assignedClient = await storage.createClientAccount({
      name: `Manager Filter Client ${unique}`,
      email: `manager_filter_client_${unique}@test.com`,
      phone: "5554442222",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });

    const unassignedClient = await storage.createClientAccount({
      name: `Unassigned Filter Client ${unique}`,
      email: `unassigned_filter_client_${unique}@test.com`,
      phone: "5554443333",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });

    await storage.setPrimaryAccountManagerForClient(assignedClient.id, managerRes.body.id, "admin");

    const assignedRes = await asAdmin.get(`/api/admin/clients?accountManagerUserId=${managerRes.body.id}`);
    expect(assignedRes.status).toBe(200);
    expect(assignedRes.body.clients.map((client: any) => client.id)).toContain(assignedClient.id);
    expect(assignedRes.body.clients.map((client: any) => client.id)).not.toContain(unassignedClient.id);

    const unassignedRes = await asAdmin.get("/api/admin/clients?accountManagerUserId=unassigned");
    expect(unassignedRes.status).toBe(200);
    expect(unassignedRes.body.clients.map((client: any) => client.id)).toContain(unassignedClient.id);
    expect(unassignedRes.body.clients.map((client: any) => client.id)).not.toContain(assignedClient.id);
  });

  it("PATCH /api/admin/clients/:id should update the assigned account manager", async () => {
    const unique = Date.now();
    const firstManagerRes = await asAdmin.post("/api/admin/users").send({
      username: `client_reassign_manager_a_${unique}`,
      email: `client_reassign_manager_a_${unique}@test.com`,
      password: "ClientReassign123!",
      roleIds: [ACCOUNT_MANAGER_SYSTEM_ROLE_ID],
      accountManagerClientIds: [],
      isActive: true,
    });
    const secondManagerRes = await asAdmin.post("/api/admin/users").send({
      username: `client_reassign_manager_b_${unique}`,
      email: `client_reassign_manager_b_${unique}@test.com`,
      password: "ClientReassign123!",
      roleIds: [ACCOUNT_MANAGER_SYSTEM_ROLE_ID],
      accountManagerClientIds: [],
      isActive: true,
    });

    expect(firstManagerRes.status).toBe(201);
    expect(secondManagerRes.status).toBe(201);

    const client = await storage.createClientAccount({
      name: `Reassign Client ${unique}`,
      email: `reassign_client_${unique}@test.com`,
      phone: "5554444444",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });

    await storage.setPrimaryAccountManagerForClient(client.id, firstManagerRes.body.id, "admin");

    const updateRes = await asAdmin.patch(`/api/admin/clients/${client.id}`).send({
      name: client.name,
      email: client.email,
      phone: client.phone,
      country: client.country,
      companyName: client.companyName,
      profile: client.profile,
      isActive: client.isActive,
      assignedAccountManagerUserId: secondManagerRes.body.id,
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.assignedAccountManager?.id).toBe(secondManagerRes.body.id);

    const firstAssignments = await storage.getAccountManagerAssignments({
      accountManagerUserId: firstManagerRes.body.id,
      clientAccountId: client.id,
    });
    const secondAssignments = await storage.getAccountManagerAssignments({
      accountManagerUserId: secondManagerRes.body.id,
      clientAccountId: client.id,
    });
    expect(firstAssignments).toHaveLength(0);
    expect(secondAssignments).toHaveLength(1);
  });

});

describe("Admin - Applications", () => {
  it("GET /api/admin/applications should return paginated applications", async () => {
    const res = await asAdmin.get("/api/admin/applications");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("applications");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.applications)).toBe(true);
  });

  it("GET /api/admin/applications should support status filter", async () => {
    const res = await asAdmin.get("/api/admin/applications?status=pending");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.applications)).toBe(true);
  });
});

describe("Admin - Shipments", () => {
  it("GET /api/admin/shipments should return paginated shipments", async () => {
    const res = await asAdmin.get("/api/admin/shipments");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("shipments");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.shipments)).toBe(true);
  });

  it("POST /api/admin/shipments/:id/retry-carrier should preserve and upload trade documents", async () => {
    const unique = Date.now();
    const clientAccount = await storage.createClientAccount({
      name: `Retry Carrier Client ${unique}`,
      email: `retry_carrier_client_${unique}@test.com`,
      phone: "5553100001",
      country: "United States",
      profile: "regular",
      accountType: "company",
      companyName: "Retry Carrier Co",
      isActive: true,
      shippingContactName: "Retry Contact",
      shippingContactPhone: "5553100001",
      shippingCountryCode: "US",
      shippingStateOrProvince: "Texas",
      shippingCity: "Houston",
      shippingPostalCode: "77001",
      shippingAddressLine1: "100 Retry Way",
    });

    const tradeDocument = await uploadTradeDocumentAsPublic("retry-commercial-invoice.pdf");

    const shipment = await storage.createShipment({
      clientAccountId: clientAccount.id,
      senderName: "Retry Sender",
      senderAddress: "100 Retry Way",
      senderCity: "Houston",
      senderStateOrProvince: "Texas",
      senderPostalCode: "77001",
      senderCountry: "US",
      senderPhone: "5553100002",
      recipientName: "Retry Recipient",
      recipientAddress: "200 Import Road",
      recipientCity: "Riyadh",
      recipientPostalCode: "11564",
      recipientCountry: "SA",
      recipientPhone: "5553100003",
      weight: "2.00",
      weightUnit: "KG",
      length: "20.00",
      width: "15.00",
      height: "10.00",
      dimensionUnit: "CM",
      packageType: "YOUR_PACKAGING",
      packagesData: JSON.stringify([{ weight: 2, length: 20, width: 15, height: 10 }]),
      itemsData: JSON.stringify([{
        itemName: "Wireless Keyboard",
        price: 200,
        quantity: 1,
        hsCode: "847160",
        countryOfOrigin: "US",
      }]),
      tradeDocumentsData: JSON.stringify([tradeDocument]),
      shipmentType: "outbound",
      isDdp: false,
      status: "carrier_error",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "120.00",
      accountingCurrency: "SAR",
      taxScenario: "EXPORT",
      costAmountSar: "100.00",
      costTaxAmountSar: "0.00",
      sellSubtotalAmountSar: "120.00",
      sellTaxAmountSar: "2.61",
      clientTotalAmountSar: "120.00",
      systemCostTotalAmountSar: "100.00",
      taxPayableAmountSar: "2.61",
      revenueExcludingTaxAmountSar: "117.39",
      currency: "SAR",
      paymentStatus: "paid",
      carrierCode: "FEDEX",
      carrierName: "FedEx",
      carrierStatus: "error",
      carrierErrorCode: "UPLOAD_FAILED",
      carrierErrorMessage: "Simulated carrier error",
    });

    const res = await asAdmin.post(`/api/admin/shipments/${shipment.id}/retry-carrier`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("carrierTrackingNumber");

    const retriedShipment = await storage.getShipment(shipment.id);
    expect(retriedShipment?.status).toBe("created");
    expect(retriedShipment?.carrierStatus).toBe("created");
    expect(retriedShipment?.carrierTrackingNumber).toBeTruthy();
    expect(retriedShipment?.tradeDocumentsData).toBeTruthy();

    const storedTradeDocuments = JSON.parse(retriedShipment!.tradeDocumentsData!);
    expect(storedTradeDocuments[0].fileName).toBe("retry-commercial-invoice.pdf");
    expect(storedTradeDocuments[0].uploadedDocumentId).toBeTruthy();
    expect(storedTradeDocuments[0].uploadedAt).toBeTruthy();
  });
});

describe("Admin - Invoices", () => {
  it("GET /api/admin/invoices should return paginated invoices", async () => {
    const res = await asAdmin.get("/api/admin/invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("invoices");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });
});

describe("Admin - Payments", () => {
  it("GET /api/admin/payments should return paginated payments", async () => {
    const res = await asAdmin.get("/api/admin/payments");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("payments");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.payments)).toBe(true);
  });
});

describe("Admin - Pricing Rules", () => {
  it("GET /api/admin/pricing should return pricing rules", async () => {
    const res = await asAdmin.get("/api/admin/pricing");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/admin/pricing should create a pricing rule", async () => {
    const uniqueName = `test_profile_${Date.now()}`;
    const res = await asAdmin
      .post("/api/admin/pricing")
      .send({
        profile: uniqueName,
        displayName: "Test Profile",
        marginPercentage: "15.00",
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.profile).toBe(uniqueName);
    expect(res.body.displayName).toBe("Test Profile");
  });

  it("POST /api/admin/pricing should reject duplicate profile", async () => {
    const uniqueName = `dup_test_${Date.now()}`;
    await asAdmin
      .post("/api/admin/pricing")
      .send({
        profile: uniqueName,
        displayName: "Dup Test",
        marginPercentage: "10.00",
        isActive: true,
      });

    const res = await asAdmin
      .post("/api/admin/pricing")
      .send({
        profile: uniqueName,
        displayName: "Dup Test 2",
        marginPercentage: "12.00",
        isActive: true,
      });
    expect(res.status).toBe(400);
  });
});

describe("Admin - RBAC Roles", () => {
  it("GET /api/admin/roles should return roles", async () => {
    const res = await asAdmin.get("/api/admin/roles");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((role: any) => role.id)).toContain(ACCOUNT_MANAGER_SYSTEM_ROLE_ID);
  });

  it("POST /api/admin/roles should create a new role", async () => {
    const uniqueName = `TestRole_${Date.now()}`;
    const res = await asAdmin
      .post("/api/admin/roles")
      .send({
        name: uniqueName,
        description: "A test role",
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(uniqueName);
  });
});

describe("Admin - RBAC Permissions", () => {
  it("GET /api/admin/permissions should return permissions", async () => {
    const res = await asAdmin.get("/api/admin/permissions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("Admin - Audit Logs", () => {
  it("GET /api/admin/audit-logs should return paginated audit logs", async () => {
    const res = await asAdmin.get("/api/admin/audit-logs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});

describe("Admin - Integration Logs", () => {
  it("GET /api/admin/integration-logs should return paginated logs", async () => {
    const res = await asAdmin.get("/api/admin/integration-logs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});

describe("Admin - Webhook Events", () => {
  it("GET /api/admin/webhook-events should return paginated events", async () => {
    const res = await asAdmin.get("/api/admin/webhook-events");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.events)).toBe(true);
  });
});

describe("Admin - Account Managers", () => {
  let accountManagerCookies: string[] = [];
  let accountManagerId: string;
  let assignedClientId: string;
  let unassignedClientId: string;
  let assignedShipmentId: string;
  let unassignedShipmentId: string;
  let assignedInvoiceId: string;
  let unassignedInvoiceId: string;
  let assignedCreditInvoiceId: string;

  const ACCOUNT_MANAGER_PASSWORD = "AccountManager123!";

  const asAccountManager = {
    get: (path: string) => withCookies(request.get(path), accountManagerCookies),
    post: (path: string) => withCookies(request.post(path), accountManagerCookies),
    patch: (path: string) => withCookies(request.patch(path), accountManagerCookies),
  };

  beforeAll(async () => {
    const unique = Date.now();

    const assignedClient = await storage.createClientAccount({
      name: "Assigned Client",
      email: `assigned_client_${unique}@test.com`,
      phone: "5550001111",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });
    assignedClientId = assignedClient.id;

    const unassignedClient = await storage.createClientAccount({
      name: "Unassigned Client",
      email: `unassigned_client_${unique}@test.com`,
      phone: "5550002222",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });
    unassignedClientId = unassignedClient.id;

    const assignedShipment = await storage.createShipment({
      clientAccountId: assignedClientId,
      senderName: "Assigned Sender",
      senderAddress: "123 Assigned Street",
      senderCity: "Riyadh",
      senderCountry: "SA",
      senderPhone: "5551000001",
      recipientName: "Assigned Recipient",
      recipientAddress: "456 Assigned Avenue",
      recipientCity: "Jeddah",
      recipientCountry: "SA",
      recipientPhone: "5551000002",
      weight: "2.50",
      packageType: "parcel",
      status: "processing",
      baseRate: "100.00",
      margin: "20.00",
      finalPrice: "120.00",
    });
    assignedShipmentId = assignedShipment.id;

    const unassignedShipment = await storage.createShipment({
      clientAccountId: unassignedClientId,
      senderName: "Unassigned Sender",
      senderAddress: "111 Unassigned Street",
      senderCity: "Dammam",
      senderCountry: "SA",
      senderPhone: "5552000001",
      recipientName: "Unassigned Recipient",
      recipientAddress: "222 Unassigned Avenue",
      recipientCity: "Medina",
      recipientCountry: "SA",
      recipientPhone: "5552000002",
      weight: "3.00",
      packageType: "parcel",
      status: "processing",
      baseRate: "80.00",
      margin: "16.00",
      finalPrice: "96.00",
    });
    unassignedShipmentId = unassignedShipment.id;

    const assignedInvoice = await storage.createInvoice({
      clientAccountId: assignedClientId,
      shipmentId: assignedShipmentId,
      amount: "120.00",
      status: "pending",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    assignedInvoiceId = assignedInvoice.id;

    const unassignedInvoice = await storage.createInvoice({
      clientAccountId: unassignedClientId,
      shipmentId: unassignedShipmentId,
      amount: "96.00",
      status: "pending",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    unassignedInvoiceId = unassignedInvoice.id;

    await storage.createPayment({
      invoiceId: assignedInvoiceId,
      clientAccountId: assignedClientId,
      amount: "120.00",
      paymentMethod: "card",
      status: "completed",
      transactionId: `assigned_tx_${unique}`,
    });

    await storage.createPayment({
      invoiceId: unassignedInvoiceId,
      clientAccountId: unassignedClientId,
      amount: "96.00",
      paymentMethod: "card",
      status: "completed",
      transactionId: `unassigned_tx_${unique}`,
    });

    const assignedCreditInvoice = await storage.createCreditInvoice({
      clientAccountId: assignedClientId,
      shipmentId: assignedShipmentId,
      amount: "120.00",
      currency: "SAR",
      status: "UNPAID",
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    assignedCreditInvoiceId = assignedCreditInvoice.id;

    await storage.createCreditInvoice({
      clientAccountId: unassignedClientId,
      shipmentId: unassignedShipmentId,
      amount: "96.00",
      currency: "SAR",
      status: "UNPAID",
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const createRes = await asAdmin.post("/api/admin/account-managers").send({
      username: `account_manager_${unique}`,
      email: `account_manager_${unique}@test.com`,
      password: ACCOUNT_MANAGER_PASSWORD,
      clientAccountIds: [assignedClientId],
      isActive: true,
    });

    expect(createRes.status).toBe(201);
    accountManagerId = createRes.body.id;
    accountManagerCookies = await loginAndGetCookies(createRes.body.username, ACCOUNT_MANAGER_PASSWORD);
  });

  it("should create account managers with scoped client assignments and fixed access", async () => {
    const res = await asAccountManager.get("/api/admin/me/access");

    expect(res.status).toBe(200);
    expect(res.body.isAccountManager).toBe(true);
    expect(res.body.managedClientIds).toEqual([assignedClientId]);
    expect(res.body.permissions).toEqual(expect.arrayContaining([
      "clients:read",
      "clients:update",
      "clients:activate",
      "shipments:read",
      "shipments:update",
      "invoices:read",
      "invoices:download",
      "payments:read",
      "credit-invoices:read",
    ]));
  });

  it("should scope list endpoints to only assigned clients", async () => {
    const [clientsRes, shipmentsRes, invoicesRes, paymentsRes, creditInvoicesRes] = await Promise.all([
      asAccountManager.get("/api/admin/clients"),
      asAccountManager.get("/api/admin/shipments"),
      asAccountManager.get("/api/admin/invoices"),
      asAccountManager.get("/api/admin/payments"),
      asAccountManager.get("/api/admin/credit-invoices"),
    ]);

    expect(clientsRes.status).toBe(200);
    expect(clientsRes.body.clients.map((client: any) => client.id)).toContain(assignedClientId);
    expect(clientsRes.body.clients.map((client: any) => client.id)).not.toContain(unassignedClientId);

    expect(shipmentsRes.status).toBe(200);
    expect(shipmentsRes.body.shipments.map((shipment: any) => shipment.id)).toContain(assignedShipmentId);
    expect(shipmentsRes.body.shipments.map((shipment: any) => shipment.id)).not.toContain(unassignedShipmentId);

    expect(invoicesRes.status).toBe(200);
    expect(invoicesRes.body.invoices.map((invoice: any) => invoice.id)).toContain(assignedInvoiceId);
    expect(invoicesRes.body.invoices.map((invoice: any) => invoice.id)).not.toContain(unassignedInvoiceId);

    expect(paymentsRes.status).toBe(200);
    expect(paymentsRes.body.payments.every((payment: any) => payment.clientAccountId === assignedClientId)).toBe(true);

    expect(creditInvoicesRes.status).toBe(200);
    expect(creditInvoicesRes.body.invoices.map((invoice: any) => invoice.id)).toContain(assignedCreditInvoiceId);
    expect(creditInvoicesRes.body.invoices.every((invoice: any) => invoice.clientAccountId === assignedClientId)).toBe(true);
  });

  it("should require admin approval for account manager client profile changes", async () => {
    const profileChangeRes = await asAccountManager
      .patch(`/api/admin/clients/${assignedClientId}/profile`)
      .send({ profile: "vip" });

    expect(profileChangeRes.status).toBe(202);
    expect(profileChangeRes.body.requiresApproval).toBe(true);

    const beforeApproval = await storage.getClientAccount(assignedClientId);
    expect(beforeApproval?.profile).toBe("regular");

    const pendingRequestsRes = await asAdmin.get("/api/admin/account-managers/change-requests?status=pending");
    expect(pendingRequestsRes.status).toBe(200);

    const pendingRequest = pendingRequestsRes.body.find((request: any) =>
      request.clientAccountId === assignedClientId && request.accountManagerUserId === accountManagerId,
    );
    expect(pendingRequest).toBeDefined();

    const approveRes = await asAdmin
      .post(`/api/admin/account-managers/change-requests/${pendingRequest.id}/approve`)
      .send({ adminNotes: "Approved in test" });

    expect(approveRes.status).toBe(200);

    const afterApproval = await storage.getClientAccount(assignedClientId);
    expect(afterApproval?.profile).toBe("vip");
  });

  it("should allow direct deactivation and shipment updates only for assigned clients", async () => {
    const deactivateAssignedRes = await asAccountManager
      .patch(`/api/admin/clients/${assignedClientId}/status`)
      .send({ isActive: false });
    expect(deactivateAssignedRes.status).toBe(200);
    expect(deactivateAssignedRes.body.isActive).toBe(false);

    const reactivateAssignedRes = await asAccountManager
      .patch(`/api/admin/clients/${assignedClientId}/status`)
      .send({ isActive: true });
    expect(reactivateAssignedRes.status).toBe(403);

    const deactivateUnassignedRes = await asAccountManager
      .patch(`/api/admin/clients/${unassignedClientId}/status`)
      .send({ isActive: false });
    expect(deactivateUnassignedRes.status).toBe(403);

    const updateAssignedShipmentRes = await asAccountManager
      .patch(`/api/admin/shipments/${assignedShipmentId}/status`)
      .send({ status: "in_transit" });
    expect(updateAssignedShipmentRes.status).toBe(200);
    expect(updateAssignedShipmentRes.body.status).toBe("in_transit");

    const updateUnassignedShipmentRes = await asAccountManager
      .patch(`/api/admin/shipments/${unassignedShipmentId}/status`)
      .send({ status: "in_transit" });
    expect(updateUnassignedShipmentRes.status).toBe(403);
  });
});
