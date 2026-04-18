import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import bcrypt from "bcrypt";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let clientAgent: supertest.SuperAgentTest;
let testClientUsername: string;
const TEST_CLIENT_PASSWORD = "TestClient123!";

async function uploadTradeDocumentThroughApi(
  agent: supertest.SuperAgentTest,
  fileName: string,
  contentType: string = "application/pdf",
  fileBody: Buffer = Buffer.from("%PDF-1.4 test trade document"),
) {
  const uploadUrlRes = await agent
    .post("/api/uploads/request-url")
    .send({
      name: fileName,
      size: fileBody.length,
      contentType,
    });

  expect(uploadUrlRes.status).toBe(200);
  expect(uploadUrlRes.body).toHaveProperty("uploadURL");
  expect(uploadUrlRes.body).toHaveProperty("objectPath");

  const uploadUrl = new URL(uploadUrlRes.body.uploadURL);
  const uploadRes = await agent
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

function buildInternationalShipmentPayload(
  tradeDocuments: Array<Record<string, unknown>> = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    shipmentType: "outbound",
    isDdp: false,
    carrier: "FEDEX",
    shipper: {
      name: "Origin Sender",
      phone: "5551112222",
      email: "origin@example.com",
      countryCode: "US",
      city: "Houston",
      postalCode: "77001",
      addressLine1: "100 Export Way",
      stateOrProvince: "Texas",
    },
    recipient: {
      name: "Saudi Recipient",
      phone: "5553334444",
      email: "recipient@example.com",
      countryCode: "SA",
      city: "Riyadh",
      postalCode: "11564",
      addressLine1: "200 Riyadh Road",
    },
    packages: [
      { weight: 2, length: 20, width: 15, height: 10 },
    ],
    weightUnit: "KG",
    dimensionUnit: "CM",
    packageType: "YOUR_PACKAGING",
    currency: "SAR",
    items: [
      {
        itemName: "Wireless Keyboard",
        category: "electronics",
        countryOfOrigin: "US",
        hsCode: "847160",
        price: 200,
        quantity: 1,
      },
    ],
    tradeDocuments,
    ...overrides,
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);

  testClientUsername = `test_client_${Date.now()}`;
  const hashedPassword = await bcrypt.hash(TEST_CLIENT_PASSWORD, 10);
  const clientAccount = await storage.createClientAccount({
    name: "Test Client Account",
    email: `${testClientUsername}@test.com`,
    phone: "55500001111",
    country: "United States",
    profile: "regular",
    accountType: "company",
    companyName: "Test Corp",
    isActive: true,
    shippingContactName: "Test Contact",
    shippingContactPhone: "55500001111",
    shippingCountryCode: "US",
    shippingStateOrProvince: "Texas",
    shippingCity: "Houston",
    shippingPostalCode: "77001",
    shippingAddressLine1: "100 Test Blvd Suite 1",
  });
  await storage.createUser({
    username: testClientUsername,
    email: `${testClientUsername}@test.com`,
    password: hashedPassword,
    userType: "client",
    isPrimaryContact: true,
    mustChangePassword: false,
    isActive: true,
    clientAccountId: clientAccount.id,
  });

  clientAgent = supertest.agent(app);
  await clientAgent
    .post("/api/auth/login")
    .send({ username: testClientUsername, password: TEST_CLIENT_PASSWORD });
}, 30000);

afterAll(() => {
  server.close();
});

describe("Client - Account", () => {
  it("GET /api/client/account should return client account details", async () => {
    const res = await clientAgent.get("/api/client/account");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("email");
    expect(res.body).toHaveProperty("profile");
    expect(res.body).toHaveProperty("accountNumber");
  });

  it("PATCH /api/client/account should update shipping address", async () => {
    const res = await clientAgent
      .patch("/api/client/account")
      .send({
        shippingContactName: "Updated Contact",
        shippingContactPhone: "999999999",
      });
    expect(res.status).toBe(200);
    expect(res.body.shippingContactName).toBe("Updated Contact");
  });
});

describe("Client - Shipments", () => {
  it("GET /api/client/shipments should return client shipments", async () => {
    const res = await clientAgent.get("/api/client/shipments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/client/shipments/rates should reject invalid DDP destinations", async () => {
    const res = await clientAgent
      .post("/api/client/shipments/rates")
      .send({
        shipmentType: "inbound",
        isDdp: true,
        shipper: {
          name: "Origin Sender",
          phone: "5551112222",
          email: "origin@example.com",
          countryCode: "US",
          city: "Houston",
          postalCode: "77001",
          addressLine1: "100 Export Way",
          stateOrProvince: "Texas",
        },
        recipient: {
          name: "Import Recipient",
          phone: "5553334444",
          email: "recipient@example.com",
          countryCode: "EG",
          city: "Cairo",
          postalCode: "11511",
          addressLine1: "200 Import Road",
        },
        packages: [
          { weight: 2, length: 20, width: 15, height: 10 },
        ],
        weightUnit: "KG",
        dimensionUnit: "CM",
        packageType: "YOUR_PACKAGING",
        currency: "SAR",
        items: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DDP is only available for import shipments to Saudi Arabia or the UAE");
  });

  it("POST /api/client/shipments/rates should reject unsupported trade document content types", async () => {
    const res = await clientAgent
      .post("/api/client/shipments/rates")
      .send({
        shipmentType: "outbound",
        isDdp: false,
        shipper: {
          name: "Origin Sender",
          phone: "5551112222",
          email: "origin@example.com",
          countryCode: "US",
          city: "Houston",
          postalCode: "77001",
          addressLine1: "100 Export Way",
          stateOrProvince: "Texas",
        },
        recipient: {
          name: "Saudi Recipient",
          phone: "5553334444",
          email: "recipient@example.com",
          countryCode: "SA",
          city: "Riyadh",
          postalCode: "11564",
          addressLine1: "200 Riyadh Road",
          shortAddress: "RCTB4359",
        },
        packages: [
          { weight: 2, length: 20, width: 15, height: 10 },
        ],
        weightUnit: "KG",
        dimensionUnit: "CM",
        packageType: "YOUR_PACKAGING",
        currency: "SAR",
        items: [
          {
            itemName: "Wireless Keyboard",
            category: "electronics",
            countryOfOrigin: "US",
            price: 200,
            quantity: 1,
          },
        ],
        tradeDocuments: [
          {
            fileName: "invoice.exe",
            objectPath: "/uploads/invoice.exe",
            contentType: "application/octet-stream",
            size: 1024,
            documentType: "COMMERCIAL_INVOICE",
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported FedEx trade document content type");
  });

  it("POST /api/client/shipments/rates should return DHL quotes when DHL is selected", async () => {
    const res = await clientAgent
      .post("/api/client/shipments/rates")
      .send(buildInternationalShipmentPayload([], { carrier: "DHL" }));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.quotes)).toBe(true);
    expect(res.body.quotes.length).toBeGreaterThan(0);
    expect(res.body.quotes[0].carrierName).toBe("DHL");
  });

  it("POST /api/client/shipments/extract-invoice-items should extract invoice items from an uploaded text invoice", async () => {
    const invoiceBody = Buffer.from(
      [
        "Item Description\tQty\tUnit Price\tAmount\tOrigin",
        "Wireless Keyboard\t2\t150.00\t300.00\tUS",
        "Gaming Mouse\t1\t90.00\t90.00\tUS",
      ].join("\n"),
      "utf8",
    );

    const invoiceDocument = await uploadTradeDocumentThroughApi(
      clientAgent,
      "invoice.txt",
      "text/plain",
      invoiceBody,
    );

    const res = await clientAgent
      .post("/api/client/shipments/extract-invoice-items")
      .send({
        shipmentType: "outbound",
        shipperCountryCode: "US",
        fileName: invoiceDocument.fileName,
        objectPath: invoiceDocument.objectPath,
        contentType: invoiceDocument.contentType,
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].itemName).toBe("Wireless Keyboard");
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.items[0].price).toBe(150);
    expect(res.body.items[0].category).toBe("electronics");
    expect(res.body.items[0].countryOfOrigin).toBe("US");
  });

  it("POST /api/client/shipments/extract-invoice-items should reject invoices with no extractable items", async () => {
    const invoiceDocument = await uploadTradeDocumentThroughApi(
      clientAgent,
      "empty-invoice.txt",
      "text/plain",
      Buffer.from("Invoice Number 12345\nTotal 500.00", "utf8"),
    );

    const res = await clientAgent
      .post("/api/client/shipments/extract-invoice-items")
      .send({
        shipmentType: "outbound",
        shipperCountryCode: "US",
        fileName: invoiceDocument.fileName,
        objectPath: invoiceDocument.objectPath,
        contentType: invoiceDocument.contentType,
      });

    expect(res.status).toBe(422);
    expect(String(res.body.error).toLowerCase()).toContain("could not extract");
  });

  it("client shipment confirm flow should persist uploaded trade documents for international shipments", async () => {
    const tradeDocument = await uploadTradeDocumentThroughApi(
      clientAgent,
      "commercial-invoice.pdf",
    );

    const ratesRes = await clientAgent
      .post("/api/client/shipments/rates")
      .send(buildInternationalShipmentPayload([tradeDocument]));

    expect(ratesRes.status).toBe(200);
    expect(Array.isArray(ratesRes.body.quotes)).toBe(true);
    expect(ratesRes.body.quotes.length).toBeGreaterThan(0);

    const quoteId = ratesRes.body.quotes[0].quoteId;

    const checkoutRes = await clientAgent
      .post("/api/client/shipments/checkout")
      .send({ quoteId });

    expect(checkoutRes.status).toBe(200);
    expect(checkoutRes.body).toHaveProperty("shipmentId");

    const confirmRes = await clientAgent
      .post("/api/client/shipments/confirm")
      .send({
        shipmentId: checkoutRes.body.shipmentId,
        paymentIntentId: checkoutRes.body.paymentId,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body).toHaveProperty("carrierTrackingNumber");

    const confirmedShipment = await storage.getShipment(checkoutRes.body.shipmentId);
    expect(confirmedShipment?.tradeDocumentsData).toBeTruthy();

    const storedTradeDocuments = JSON.parse(confirmedShipment!.tradeDocumentsData!);
    expect(Array.isArray(storedTradeDocuments)).toBe(true);
    expect(storedTradeDocuments[0].fileName).toBe("commercial-invoice.pdf");
    expect(storedTradeDocuments[0].documentType).toBe("COMMERCIAL_INVOICE");
    expect(storedTradeDocuments[0].uploadedDocumentId).toBeTruthy();
    expect(storedTradeDocuments[0].uploadedAt).toBeTruthy();
  });

  it("client DHL shipment confirm flow should create a DHL shipment with the selected carrier", async () => {
    const ratesRes = await clientAgent
      .post("/api/client/shipments/rates")
      .send(buildInternationalShipmentPayload([], { carrier: "DHL" }));

    expect(ratesRes.status).toBe(200);
    expect(ratesRes.body.quotes.length).toBeGreaterThan(0);

    const checkoutRes = await clientAgent
      .post("/api/client/shipments/checkout")
      .send({ quoteId: ratesRes.body.quotes[0].quoteId });

    expect(checkoutRes.status).toBe(200);

    const confirmRes = await clientAgent
      .post("/api/client/shipments/confirm")
      .send({
        shipmentId: checkoutRes.body.shipmentId,
        paymentIntentId: checkoutRes.body.paymentId,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.carrierTrackingNumber).toContain("DHL");

    const shipment = await storage.getShipment(checkoutRes.body.shipmentId);
    expect(shipment?.carrierCode).toBe("DHL");
    expect(shipment?.carrierName).toBe("DHL");
    expect(shipment?.carrierTrackingNumber).toContain("DHL");
  });

  it("client pay-later flow should persist uploaded trade documents for international shipments", async () => {
    const clientUser = await storage.getUserByUsername(testClientUsername);
    expect(clientUser?.clientAccountId).toBeDefined();
    await storage.updateClientAccount(clientUser!.clientAccountId!, {
      creditEnabled: true,
    } as any);

    const tradeDocument = await uploadTradeDocumentThroughApi(
      clientAgent,
      "commercial-invoice-pay-later.pdf",
    );

    const ratesRes = await clientAgent
      .post("/api/client/shipments/rates")
      .send(buildInternationalShipmentPayload([tradeDocument]));

    expect(ratesRes.status).toBe(200);
    expect(ratesRes.body.quotes.length).toBeGreaterThan(0);

    const checkoutRes = await clientAgent
      .post("/api/client/shipments/checkout")
      .send({ quoteId: ratesRes.body.quotes[0].quoteId });

    expect(checkoutRes.status).toBe(200);

    const payLaterRes = await clientAgent
      .post(`/api/client/shipments/${checkoutRes.body.shipmentId}/pay-later`)
      .send({});

    expect(payLaterRes.status).toBe(200);
    expect(payLaterRes.body).toHaveProperty("creditInvoice");
    expect(payLaterRes.body.creditInvoice.status).toBe("UNPAID");
    expect(payLaterRes.body).toHaveProperty("carrierTrackingNumber");

    const shipment = await storage.getShipment(checkoutRes.body.shipmentId);
    expect(shipment?.tradeDocumentsData).toBeTruthy();
    expect(shipment?.paymentMethod).toBe("CREDIT");
    expect(shipment?.paymentStatus).toBe("unpaid");
    expect(shipment?.status).toBe("created");

    const storedTradeDocuments = JSON.parse(shipment!.tradeDocumentsData!);
    expect(storedTradeDocuments[0].fileName).toBe("commercial-invoice-pay-later.pdf");
    expect(storedTradeDocuments[0].uploadedDocumentId).toBeTruthy();
    expect(storedTradeDocuments[0].uploadedAt).toBeTruthy();

    const creditInvoice = await storage.getCreditInvoiceByShipmentId(checkoutRes.body.shipmentId);
    expect(creditInvoice).toBeDefined();
    expect(creditInvoice?.status).toBe("UNPAID");
  });

  it("client DHL pay-later flow should create a credit shipment with DHL", async () => {
    const clientUser = await storage.getUserByUsername(testClientUsername);
    expect(clientUser?.clientAccountId).toBeDefined();
    await storage.updateClientAccount(clientUser!.clientAccountId!, {
      creditEnabled: true,
    } as any);

    const ratesRes = await clientAgent
      .post("/api/client/shipments/rates")
      .send(buildInternationalShipmentPayload([], { carrier: "DHL" }));

    expect(ratesRes.status).toBe(200);
    expect(ratesRes.body.quotes.length).toBeGreaterThan(0);

    const checkoutRes = await clientAgent
      .post("/api/client/shipments/checkout")
      .send({ quoteId: ratesRes.body.quotes[0].quoteId });

    expect(checkoutRes.status).toBe(200);

    const payLaterRes = await clientAgent
      .post(`/api/client/shipments/${checkoutRes.body.shipmentId}/pay-later`)
      .send({});

    expect(payLaterRes.status).toBe(200);
    expect(payLaterRes.body.creditInvoice.status).toBe("UNPAID");
    expect(payLaterRes.body.carrierTrackingNumber).toContain("DHL");

    const shipment = await storage.getShipment(checkoutRes.body.shipmentId);
    expect(shipment?.carrierCode).toBe("DHL");
    expect(shipment?.paymentMethod).toBe("CREDIT");
    expect(shipment?.status).toBe("created");
  });
});

describe("Client - Invoices", () => {
  it("GET /api/client/invoices should return client invoices", async () => {
    const res = await clientAgent.get("/api/client/invoices");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Client - Payments", () => {
  it("GET /api/client/payments should return client payments", async () => {
    const res = await clientAgent.get("/api/client/payments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/client/extra-fees should return extra fee notices for the client", async () => {
    const clientUser = await storage.getUserByUsername(testClientUsername);
    expect(clientUser?.clientAccountId).toBeDefined();

    const shipment = await storage.createShipment({
      clientAccountId: clientUser!.clientAccountId!,
      senderName: "Warehouse Extra Fees",
      senderAddress: "100 Sender Road",
      senderCity: "Houston",
      senderCountry: "US",
      senderPhone: "5551000001",
      recipientName: "Extra Fees Recipient",
      recipientAddress: "200 Recipient Road",
      recipientCity: "Riyadh",
      recipientCountry: "SA",
      recipientPhone: "5551000002",
      weight: "5.00",
      weightUnit: "KG",
      packageType: "YOUR_PACKAGING",
      shipmentType: "inbound",
      isDdp: false,
      status: "created",
      baseRate: "100.00",
      marginAmount: "20.00",
      margin: "20.00",
      finalPrice: "120.00",
      accountingCurrency: "SAR",
      taxScenario: "IMPORT",
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
      extraFeesAmountSar: "12.00",
      extraFeesType: "EXTRA_COST",
      extraFeesCostAmountSar: "12.00",
      extraFeesAddedAt: new Date(),
    });

    const res = await clientAgent.get("/api/client/extra-fees");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const matchingNotice = res.body.find((entry: any) => entry.shipmentId === shipment.id);
    expect(matchingNotice).toBeDefined();
    expect(Number(matchingNotice.extraFeesAmountSar)).toBe(12);
    expect(matchingNotice.extraFeesType).toBe("EXTRA_COST");
  });
});

describe("Client - Dashboard", () => {
  it("GET /api/client/stats should return dashboard stats", async () => {
    const res = await clientAgent.get("/api/client/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalShipments");
    expect(res.body).toHaveProperty("shipmentsInTransit");
    expect(res.body).toHaveProperty("shipmentsDelivered");
    expect(res.body).toHaveProperty("pendingInvoices");
    expect(res.body).toHaveProperty("totalSpent");
    expect(typeof res.body.totalShipments).toBe("number");
  });
});

describe("Client - Users (Team Members)", () => {
  it("GET /api/client/users should return team members for primary contact", async () => {
    const res = await clientAgent.get("/api/client/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("username");
      expect(res.body[0]).toHaveProperty("email");
    }
  });
});

describe("Public - Application Submission", () => {
  it("POST /api/public/uploads/request-url should prefer the browser origin for local upload URLs", async () => {
    const res = await supertest(app)
      .post("/api/public/uploads/request-url")
      .set("Origin", "http://127.0.0.1:3001")
      .send({
        name: "origin-sensitive-doc.pdf",
        size: 1024,
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadURL).toContain("http://127.0.0.1:3001/api/uploads/direct/");
  });

  it("POST /api/public/uploads/request-url should allow anonymous upload URL requests", async () => {
    const res = await supertest(app)
      .post("/api/public/uploads/request-url")
      .send({
        name: "application-doc.pdf",
        size: 1024,
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("uploadURL");
    expect(res.body).toHaveProperty("objectPath");
    expect(res.body.metadata.name).toBe("application-doc.pdf");
  });

  it("POST /api/applications should accept valid application", async () => {
    const uniqueEmail = `test_${Date.now()}@example.com`;
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        accountType: "company",
        name: "Test Company Application",
        email: uniqueEmail,
        phone: "55512345678",
        companyName: "Test Corp Ltd",
        shippingContactName: "Test Contact",
        shippingContactPhone: "55512345678",
        shippingCountryCode: "US",
        shippingStateOrProvince: "Texas",
        shippingCity: "Houston",
        shippingPostalCode: "77001",
        shippingAddressLine1: "456 Business Blvd Suite 200",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Test Company Application");
    expect(res.body.status).toBe("pending");
  });

  it("POST /api/applications should reject invalid data", async () => {
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        name: "A",
        email: "not-an-email",
      });
    expect(res.status).toBe(400);
  });

  it("POST /api/applications should require short address for SA", async () => {
    const uniqueEmail = `test_sa_${Date.now()}@example.com`;
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        accountType: "individual",
        name: "Saudi Test",
        email: uniqueEmail,
        phone: "55512345678",
        shippingContactName: "SA Contact",
        shippingContactPhone: "55512345678",
        shippingCountryCode: "SA",
        shippingStateOrProvince: "Riyadh",
        shippingCity: "Riyadh",
        shippingPostalCode: "12345",
        shippingAddressLine1: "123 Saudi Street Block 5",
      });
    expect(res.status).toBe(400);
  });

  it("POST /api/applications should accept SA application with short address", async () => {
    const uniqueEmail = `test_sa_ok_${Date.now()}@example.com`;
    const res = await supertest(app)
      .post("/api/applications")
      .send({
        accountType: "individual",
        name: "Saudi Test OK",
        email: uniqueEmail,
        phone: "55512345678",
        shippingContactName: "SA Contact",
        shippingContactPhone: "55512345678",
        shippingCountryCode: "SA",
        shippingStateOrProvince: "Riyadh",
        shippingCity: "Riyadh",
        shippingPostalCode: "12345",
        shippingAddressLine1: "123 Saudi Street Block 5",
        shippingShortAddress: "RCTB4359",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });
});

describe("Cross-role Access Control", () => {
  it("client should not access admin stats", async () => {
    const res = await clientAgent.get("/api/admin/stats");
    expect(res.status).toBe(403);
  });

  it("client should not access admin clients", async () => {
    const res = await clientAgent.get("/api/admin/clients");
    expect(res.status).toBe(403);
  });

  it("client should not access admin applications", async () => {
    const res = await clientAgent.get("/api/admin/applications");
    expect(res.status).toBe(403);
  });

  it("client should not access admin audit logs", async () => {
    const res = await clientAgent.get("/api/admin/audit-logs");
    expect(res.status).toBe(403);
  });

  it("client should not access admin pricing", async () => {
    const res = await clientAgent.get("/api/admin/pricing");
    expect(res.status).toBe(403);
  });

  it("client should not create pricing rules", async () => {
    const res = await clientAgent
      .post("/api/admin/pricing")
      .send({
        profile: "hacker_profile",
        displayName: "Hacker",
        marginPercentage: "0.00",
      });
    expect(res.status).toBe(403);
  });
});
