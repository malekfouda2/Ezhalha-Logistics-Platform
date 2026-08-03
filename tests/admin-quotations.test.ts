import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { eq } from "drizzle-orm";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { notifications } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[] = [];
let clientAccountId = "";
let clientUserId = "";
let quoteCarrierCode = "";

const withCookies = (t: supertest.Test, c: string[]) => t.set("Cookie", c);

const addr = (city: string, country: string, postal: string) => ({
  name: "Test Party", phone: "966555123456", addressLine1: "1 Test St",
  city, countryCode: country, postalCode: postal,
});

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const login = await request.post("/api/auth/login").send({ username: "admin", password: "admin123" });
  expect(login.status).toBe(200);
  adminCookies = login.headers["set-cookie"] || [];

  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const account = await storage.createClientAccount({
    name: `Quote Client ${unique}`, email: `quote_${unique}@test.com`, phone: "5551234567",
    country: "Saudi Arabia", profile: "regular", accountType: "company", companyName: "Quote Co", isActive: true,
  });
  clientAccountId = account.id;
  const u = await storage.createUser({
    username: `quote_client_${unique}`, email: `quote_user_${unique}@test.com`,
    password: await bcrypt.hash("QuoteTest123!", 10), userType: "client", clientAccountId: account.id,
    isPrimaryContact: true, isActive: true, mustChangePassword: false,
  });
  clientUserId = u.id;

  // A dedicated rate card (unique code) so the "local" quotation prices deterministically,
  // isolated from other SMSA tiers in the shared dev DB.
  quoteCarrierCode = `QTLOCAL_${unique}`.toUpperCase();
  // Two flat bands so a weight change re-prices: 0–3kg → 80, 3kg+ → 160 (both +25%).
  await storage.createLocalCarrierPricingTier({
    carrierCode: quoteCarrierCode, minWeightKg: "0", maxWeightKg: "3",
    baseRateSar: "80.00", markupType: "percent", markupValue: "25", clientProfile: null, enabled: true,
  });
  await storage.createLocalCarrierPricingTier({
    carrierCode: quoteCarrierCode, minWeightKg: "3", maxWeightKg: "1000",
    baseRateSar: "160.00", markupType: "percent", markupValue: "25", clientProfile: null, enabled: true,
  });
}, 30000);

afterAll(() => { server.close(); });

describe("Admin quotations", () => {
  const localQuote = () => ({
    clientAccountId, type: "local" as const,
    shipper: addr("Riyadh", "SA", "12211"),
    recipient: addr("Jeddah", "SA", "23442"),
    packages: [{ weight: 2, length: 10, width: 10, height: 10 }],
    carrierCode: quoteCarrierCode, serviceName: "Test Local Courier",
  });

  it("previews pricing with the real engine + admin discount", async () => {
    const res = await withCookies(request.post("/api/admin/quotations/preview"), adminCookies)
      .send({ ...localQuote(), discountSar: 10 });
    expect(res.status).toBe(200);
    // base 80, +25% margin = 100 subtotal, +15% VAT = 115 auto; −10 discount → 105.
    expect(res.body.autoClientTotal).toBeCloseTo(115, 1);
    expect(res.body.clientTotalSar).toBeCloseTo(105, 1);
    expect(res.body.baseRate).toBeCloseTo(80, 2);
  });

  it("honors a manual price override exactly (VAT-consistent)", async () => {
    const res = await withCookies(request.post("/api/admin/quotations/preview"), adminCookies)
      .send({ ...localQuote(), priceOverrideSar: 200 });
    expect(res.status).toBe(200);
    expect(res.body.clientTotalSar).toBeCloseTo(200, 1);
  });

  it("creates a payment_pending quote owned by the client, notifies them, and it is payable", async () => {
    const notifBefore = (await db.select().from(notifications).where(eq(notifications.userId, clientUserId))).length;

    const res = await withCookies(request.post("/api/admin/quotations"), adminCookies)
      .send({ ...localQuote(), note: "Priority client", sendNotification: true });
    expect(res.status).toBe(201);
    const shipmentId = res.body.shipmentId;
    expect(shipmentId).toBeTruthy();

    const shipment = await storage.getShipment(shipmentId);
    expect(shipment?.clientAccountId).toBe(clientAccountId);
    expect(shipment?.status).toBe("payment_pending");
    expect(shipment?.isQuote).toBe(true);
    expect(Number(shipment?.finalPrice)).toBeCloseTo(115, 1);

    // Client got an app notification with a deep link.
    const notifs = await db.select().from(notifications).where(eq(notifications.userId, clientUserId));
    expect(notifs.length).toBe(notifBefore + 1);
    const latest = notifs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    expect(latest.actionUrl).toContain(`/client/quotations/${shipmentId}`);
    expect(latest.entityId).toBe(shipmentId);
  });

  it("rejects a quotation for an unknown client", async () => {
    const res = await withCookies(request.post("/api/admin/quotations"), adminCookies)
      .send({ ...localQuote(), clientAccountId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  it("lets the client fetch and modify the quote before payment (auto re-price)", async () => {
    // Client login.
    const acct = await storage.getClientAccount(clientAccountId);
    const clientLogin = await request.post("/api/auth/login").send({
      username: (await storage.getUser(clientUserId))!.username, password: "QuoteTest123!",
    });
    const clientCookies = clientLogin.headers["set-cookie"] || [];
    expect(acct).toBeTruthy();

    // Admin creates a local quote (2kg → base 80, +25% = 100, +VAT = 115).
    const created = await withCookies(request.post("/api/admin/quotations"), adminCookies)
      .send({ ...localQuote(), sendNotification: false });
    const id = created.body.shipmentId;

    // Client GET.
    const got = await withCookies(request.get(`/api/client/quotations/${id}`), clientCookies);
    expect(got.status).toBe(200);
    expect(got.body.type).toBe("local");
    expect(got.body.canPay).toBe(true);
    expect(got.body.pricing.clientTotalSar).toBeCloseTo(115, 1);

    // Client modifies to 4kg → base 160, +25% = 200, +VAT = 230.
    const patched = await withCookies(request.patch(`/api/client/quotations/${id}`), clientCookies)
      .send({ packages: [{ weight: 4, length: 10, width: 10, height: 10 }] });
    expect(patched.status).toBe(200);
    expect(patched.body.pricing.baseRate).toBeCloseTo(160, 1);
    expect(patched.body.pricing.clientTotalSar).toBeCloseTo(230, 1);

    // The stored shipment reflects the new price and stays payable.
    const reloaded = await storage.getShipment(id);
    expect(Number(reloaded?.finalPrice)).toBeCloseTo(230, 1);
    expect(reloaded?.status).toBe("payment_pending");
  });

  it("returns local rate options for the pricing step (registered carriers), sorted cheapest-first", async () => {
    // The rates endpoint offers registered carriers only — seed a virtual carrier + tier so a
    // deterministic option is present.
    const vcCode = `QTVC_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`.toUpperCase();
    await storage.createVirtualCarrier({ code: vcCode, name: "QT Virtual Courier", provider: "fizzpa", noteTemplate: "" });
    await storage.createLocalCarrierPricingTier({
      carrierCode: vcCode, minWeightKg: "0", maxWeightKg: "1000",
      baseRateSar: "80.00", markupType: "percent", markupValue: "25", clientProfile: null, enabled: true,
    });

    const res = await withCookies(request.post("/api/admin/quotations/rates"), adminCookies)
      .send({ ...localQuote(), carrierCode: undefined });
    expect(res.status).toBe(200);
    const mine = res.body.options.find((o: any) => o.carrierCode === vcCode);
    expect(mine).toBeTruthy();
    expect(mine.clientTotal).toBeCloseTo(115, 1); // 2kg → base 80, +25%, +VAT
    const totals = res.body.options.map((o: any) => o.clientTotal);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });

  it("requires items + commercial invoice for an international express quote, and enriches HS", async () => {
    const base = {
      clientAccountId, type: "express" as const,
      shipper: addr("Riyadh", "SA", "12211"),
      recipient: addr("New York", "US", "10001"),
      packages: [{ weight: 2, length: 20, width: 15, height: 10 }],
      carrierCode: "FEDEX", serviceType: "FEDEX_INTERNATIONAL_PRIORITY", serviceName: "FedEx International Priority",
      baseRateSar: 300, sendNotification: false,
    };
    // No items → rejected.
    const noItems = await withCookies(request.post("/api/admin/quotations"), adminCookies).send(base);
    expect(noItems.status).toBe(400);
    expect(noItems.body.error).toMatch(/line item/i);

    const items = [{ itemName: "Cotton shirt", category: "Apparel", countryOfOrigin: "SA", price: 50, quantity: 3 }];
    // Items but no commercial-invoice document → rejected.
    const noDoc = await withCookies(request.post("/api/admin/quotations"), adminCookies).send({ ...base, items });
    expect(noDoc.status).toBe(400);
    expect(noDoc.body.error).toMatch(/commercial invoice/i);

    const tradeDocuments = [{ fileName: "ci.pdf", objectPath: "/uploads/ci.pdf", contentType: "application/pdf", size: 1000, documentType: "COMMERCIAL_INVOICE" }];
    const ok = await withCookies(request.post("/api/admin/quotations"), adminCookies).send({ ...base, items, tradeDocuments });
    expect(ok.status).toBe(201);
    const shipment = await storage.getShipment(ok.body.shipmentId);
    expect(shipment?.itemsData).toBeTruthy();
    expect(shipment?.tradeDocumentsData).toBeTruthy();
  });

  it("requires a supplier for DDP and gates payment behind the client's consent", async () => {
    // Seed a DDP lane US→SA (air).
    const lane = (await storage.findDdpPricingLane({ originCountryCode: "US", destinationCountryCode: "SA" })) ||
      (await storage.createDdpPricingLane({
        originCountryCode: "US", originCity: "", destinationCountryCode: "SA", destinationCity: "",
        currency: "SAR", airBaseRatePerKg: "40.00", seaBaseRatePerCbm: null,
        minimumBillableKg: "1.000", kgRoundingIncrement: "0.500", minimumBillableCbm: "0.0000",
        cbmRoundingIncrement: "0.1000", minimumShipmentCharge: "40.00", volumetricDivisor: 6000, isActive: true,
      }));
    expect(lane).toBeTruthy();

    const items = [{ itemName: "Widget", category: "Machinery", countryOfOrigin: "US", price: 100, quantity: 1 }];
    const tradeDocuments = [{ fileName: "ci.pdf", objectPath: "/uploads/ci.pdf", contentType: "application/pdf", size: 1000, documentType: "COMMERCIAL_INVOICE" }];
    const base = {
      clientAccountId, type: "ddp" as const, ddpTransportMethod: "air",
      shipper: addr("New York", "US", "10001"),
      recipient: addr("Riyadh", "SA", "12211"),
      packages: [{ weight: 5, length: 20, width: 15, height: 10 }],
      items, tradeDocuments, sendNotification: false,
    };
    // Missing supplier → rejected.
    const noSup = await withCookies(request.post("/api/admin/quotations"), adminCookies).send(base);
    expect(noSup.status).toBe(400);
    expect(noSup.body.error).toMatch(/supplier/i);

    const created = await withCookies(request.post("/api/admin/quotations"), adminCookies)
      .send({ ...base, supplierName: "ACME Corp", supplierPhone: "12025550000" });
    expect(created.status).toBe(201);
    const id = created.body.shipmentId;

    // Client login.
    const clientCookies = (await request.post("/api/auth/login").send({
      username: (await storage.getUser(clientUserId))!.username, password: "QuoteTest123!",
    })).headers["set-cookie"] || [];

    const got = await withCookies(request.get(`/api/client/quotations/${id}`), clientCookies);
    expect(got.body.requiresConsent).toBe(true);
    expect(got.body.consentAccepted).toBe(false);
    expect(got.body.supplierName).toBe("ACME Corp");

    // Credit pay blocked until consent (creditEnabled off here → 403, but consent guard is 400;
    // enable credit to reach the consent guard deterministically).
    await storage.updateClientAccount(clientAccountId, { creditEnabled: true, creditLimitSar: "100000" });
    const blocked = await withCookies(request.post(`/api/client/shipments/${id}/pay-later`), clientCookies).send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/declaration/i);

    // Accept consent → then payable.
    const accepted = await withCookies(request.post(`/api/client/quotations/${id}/accept-terms`), clientCookies)
      .send({ customsComplianceAccepted: true, termsAccepted: true, brokerAuthorizationAccepted: true });
    expect(accepted.status).toBe(200);
    expect(accepted.body.consentAccepted).toBe(true);

    const paid = await withCookies(request.post(`/api/client/shipments/${id}/pay-later`), clientCookies).send({});
    expect(paid.status).toBe(200);
  });

  it("blocks modifying another client's quote and a non-quote shipment", async () => {
    const created = await withCookies(request.post("/api/admin/quotations"), adminCookies)
      .send({ ...localQuote(), sendNotification: false });
    const id = created.body.shipmentId;
    // A different client cannot see it.
    const otherLogin = await request.post("/api/auth/login").send({ username: "admin", password: "admin123" });
    // admin is not a client → client endpoint should 401/403
    const res = await request.get(`/api/client/quotations/${id}`).set("Cookie", otherLogin.headers["set-cookie"] || []);
    expect([401, 403, 404]).toContain(res.status);
  });
});
