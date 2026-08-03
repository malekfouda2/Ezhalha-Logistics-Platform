import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { normalizeKsaCity, normalizeKsaPhone, getSalesChannelAdapter, assertSafeStoreUrl } from "../server/services/sales-channels";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

const WEBHOOK_SECRET = "test_woo_webhook_secret_123";

// Capture the raw body exactly like server/index.ts so HMAC bytes match.
function buildApp() {
  const instance = express();
  instance.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  instance.use(express.urlencoded({ extended: false }));
  return instance;
}

function wooSignature(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(Buffer.from(body)).digest("base64");
}

async function createClientAccount() {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `Channel Client ${unique}`,
    email: `channel_client_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "Channel Test Co",
    isActive: true,
    salesFeaturesEnabled: true,
  });
  return clientAccount;
}

const wooOrderPayload = {
  id: 727,
  number: "727",
  status: "processing",
  currency: "SAR",
  total: "59.00",
  billing: { first_name: "Sara", last_name: "Ahmed", phone: "0551234567", email: "sara@example.com" },
  shipping: {
    first_name: "Sara",
    last_name: "Ahmed",
    address_1: "King Fahd Road",
    address_2: "Apt 4",
    city: "riyadh",
    state: "Riyadh",
    postcode: "12345",
    country: "SA",
    phone: "0551234567",
  },
  line_items: [{ name: "Widget", quantity: 2, price: "25.00", sku: "W-1", weight: "0.5" }],
};

beforeAll(async () => {
  app = buildApp();
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);
}, 30000);

afterAll(() => {
  server.close();
});

describe("Sales channels — pull/poll (no store webhook)", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("blocks store URLs that resolve to private/loopback hosts (SSRF guard)", async () => {
    await expect(assertSafeStoreUrl("http://localhost:3002")).rejects.toThrow();
    await expect(assertSafeStoreUrl("https://127.0.0.1")).rejects.toThrow();
    await expect(assertSafeStoreUrl("https://10.0.0.5")).rejects.toThrow();
    await expect(assertSafeStoreUrl("https://192.168.1.10")).rejects.toThrow();
    // Public host normalizes to https and passes (IP literal → no DNS lookup).
    const url = await assertSafeStoreUrl("93.184.216.34");
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("93.184.216.34");
  });

  it("pulls WooCommerce orders over the REST API with Basic auth and paginates", async () => {
    const adapter = getSalesChannelAdapter("woocommerce")!;
    expect(adapter.fetchOrders).toBeDefined();

    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: "processing" }));
    const page2 = [{ id: 101, status: "completed" }];
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: any, init: any) => {
      const urlStr = String(input);
      calls.push(urlStr);
      // Assert Basic auth header carries the consumer key/secret.
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("ck_x:cs_y").toString("base64")}`);
      const page = new URL(urlStr).searchParams.get("page");
      const body = page === "1" ? page1 : page2;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", "x-wp-totalpages": "2" },
      }) as any;
    }) as any;

    const orders = await adapter.fetchOrders!({
      storeUrl: "93.184.216.34",
      credentials: { consumer_key: "ck_x", consumer_secret: "cs_y" },
      since: new Date("2026-07-01T00:00:00Z"),
    });

    expect(orders).toHaveLength(101);
    expect(calls[0]).toContain("/wp-json/wc/v3/orders");
    expect(calls[0]).toContain("modified_after=2026-07-01T00%3A00%3A00.000Z");
    expect(calls).toHaveLength(2);
  });

  it("throws a clear error when consumer key/secret are missing", async () => {
    const adapter = getSalesChannelAdapter("woocommerce")!;
    await expect(
      adapter.fetchOrders!({ storeUrl: "store.example.com", credentials: {}, since: null }),
    ).rejects.toThrow(/consumer_key/);
  });
});

describe("Sales channels — normalization", () => {
  it("canonicalizes KSA cities and E.164 phone numbers", () => {
    expect(normalizeKsaCity("riyadh")).toBe("Riyadh");
    expect(normalizeKsaCity("JEDDAH")).toBe("Jeddah");
    expect(normalizeKsaCity("Unknown Town")).toBe("Unknown Town");

    expect(normalizeKsaPhone("0551234567")).toBe("+966551234567");
    expect(normalizeKsaPhone("+966 55 123 4567")).toBe("+966551234567");
    expect(normalizeKsaPhone("966551234567")).toBe("+966551234567");
    expect(normalizeKsaPhone("551234567")).toBe("+966551234567");
  });
});

describe("Sales channels — WooCommerce ingest", () => {
  it("ingests a signed order once, is idempotent on re-delivery, and rejects bad signatures", async () => {
    const clientAccount = await createClientAccount();
    const channel = await storage.createSalesChannel({
      clientAccountId: clientAccount.id,
      platform: "woocommerce",
      name: "My Woo Store",
      storeUrl: "https://store.example.com",
      status: "connected",
      webhookSecret: WEBHOOK_SECRET,
    });

    const body = JSON.stringify(wooOrderPayload);
    const signature = wooSignature(body, WEBHOOK_SECRET);
    const url = `/api/webhooks/sales-channel/woocommerce?channel=${channel.id}`;

    // First delivery → ingested.
    const first = await request
      .post(url)
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", signature)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    // Second delivery (same order) → still 200, but no duplicate row.
    const second = await request
      .post(url)
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", signature)
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.orderId).toBe(first.body.orderId);

    const orders = await storage.listOrders(clientAccount.id, { salesChannelId: channel.id });
    const matching = orders.filter((o) => o.externalOrderId === "727");
    expect(matching.length).toBe(1);

    const order = matching[0];
    const shipTo = JSON.parse(order.shipTo || "{}");
    const customer = JSON.parse(order.customer || "{}");
    expect(shipTo.city).toBe("Riyadh"); // canonicalized
    expect(customer.phone).toBe("+966551234567"); // normalized
    expect(order.packagePieces).toBe(2);
    expect(Number(order.packageWeightKg)).toBeCloseTo(1.0, 3); // 0.5 * 2

    // Bad signature → 401, no ingest.
    const bad = await request
      .post(url)
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", "deadbeef")
      .send(body);
    expect(bad.status).toBe(401);

    // Unknown channel → 404.
    const missing = await request
      .post(`/api/webhooks/sales-channel/woocommerce?channel=does-not-exist`)
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", signature)
      .send(body);
    expect(missing.status).toBe(404);
  });

  it("fulfills an ingested order into a linked LOCAL shipment (payment pending)", async () => {
    const clientAccount = await storage.createClientAccount({
      name: `Fulfill Client ${Date.now()}`,
      email: `fulfill_${Date.now()}@test.com`,
      phone: "5551234567",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      companyName: "Fulfill Co",
      isActive: true,
      salesFeaturesEnabled: true,
      shippingContactName: "Warehouse",
      shippingContactPhone: "0551110000",
      shippingCity: "Riyadh",
      shippingAddressLine1: "Pickup Depot 1",
      shippingShortAddress: "RRRD1000",
    });
    const clientUser = await storage.createUser({
      username: `fulfill_user_${Date.now()}`,
      email: `fulfill_user_${Date.now()}@test.com`,
      password: await bcrypt.hash("FulfillTest123!", 10),
      userType: "client",
      clientAccountId: clientAccount.id,
      isPrimaryContact: true,
      isActive: true,
      mustChangePassword: false,
    });
    const loginRes = await request.post("/api/auth/login").send({ username: clientUser.username, password: "FulfillTest123!" });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers["set-cookie"] || [];

    // Rate card so resolveLocalRate can price the carrier.
    await storage.createLocalCarrierPricingTier({
      carrierCode: "SMSA",
      minWeightKg: "0",
      maxWeightKg: "10",
      baseRateSar: "30.00",
      markupType: "percent",
      markupValue: "20",
      clientProfile: null,
      enabled: true,
    });

    const order = await storage.upsertOrder({
      clientAccountId: clientAccount.id,
      salesChannelId: "chan-fulfill",
      externalOrderId: `EXT-${Date.now()}`,
      externalOrderNumber: "1001",
      status: "new",
      customer: JSON.stringify({ name: "Buyer", phone: "+966555000111", email: "b@x.com" }),
      shipTo: JSON.stringify({ address: "Dest St", city: "Jeddah", country: "SA", postal: "22222" }),
      items: JSON.stringify([{ name: "Item", quantity: 1 }]),
      packageWeightKg: "2.000",
      packagePieces: 1,
      currency: "SAR",
      orderTotal: "36.00",
      syncedAt: new Date(),
    });

    const ratesRes = await request.get(`/api/client/orders/${order.id}/rates`).set("Cookie", cookies);
    expect(ratesRes.status).toBe(200);
    expect(ratesRes.body.rates.some((r: any) => r.carrierCode === "SMSA")).toBe(true);

    const fulfillRes = await request
      .post(`/api/client/orders/${order.id}/fulfill`)
      .set("Cookie", cookies)
      .send({ carrierCode: "SMSA" });
    expect(fulfillRes.status).toBe(201);
    expect(fulfillRes.body.carrierCode).toBe("SMSA");
    expect(fulfillRes.body.trackingNumber).toBeTruthy();

    const shipment = await storage.getShipment(fulfillRes.body.shipmentId);
    expect(shipment?.fulfillmentType).toBe("local");
    expect(shipment?.status).toBe("payment_pending");
    expect(shipment?.recipientCity).toBe("Jeddah");
    expect(shipment?.orderId).toBe(order.id);

    const refreshedOrder = await storage.getOrder(order.id);
    expect(refreshedOrder?.shipmentId).toBe(fulfillRes.body.shipmentId);
    expect(refreshedOrder?.status).toBe("assigned");
    expect(refreshedOrder?.assignedCarrierCode).toBe("SMSA");

    // Idempotency guard: a second fulfill is refused.
    const secondFulfill = await request
      .post(`/api/client/orders/${order.id}/fulfill`)
      .set("Cookie", cookies)
      .send({ carrierCode: "SMSA" });
    expect(secondFulfill.status).toBe(409);
  });
});
