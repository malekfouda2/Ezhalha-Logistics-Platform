import { beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import supertest from "supertest";

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import type { InsertShipment } from "@shared/schema";

// The client profile answers "how much have we made from this client". Getting that wrong is
// worse than not showing it, so the roll-up is asserted against shipments with known figures —
// including a cancelled one, which must contribute nothing.
let app: express.Express;
let server: Server;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[];
let clientAccountId: string;

const SUFFIX = Date.now();

const shipment = (overrides: Partial<InsertShipment>): InsertShipment => ({
  clientAccountId,
  senderName: "Sender",
  senderAddress: "1 Road",
  senderCity: "Shenzhen",
  senderCountry: "CN",
  senderPhone: "8615700000001",
  recipientName: "Recipient",
  recipientAddress: "2 Road",
  recipientCity: "Riyadh",
  recipientCountry: "SA",
  recipientPhone: "966555000001",
  weight: "5.00",
  weightUnit: "KG",
  packageType: "YOUR_PACKAGING",
  shipmentType: "inbound",
  status: "created",
  baseRate: "100.00",
  marginAmount: "20.00",
  margin: "20.00",
  finalPrice: "138.00",
  accountingCurrency: "SAR",
  costAmountSar: "100.00",
  costTaxAmountSar: "0.00",
  sellSubtotalAmountSar: "120.00",
  sellTaxAmountSar: "18.00",
  clientTotalAmountSar: "138.00",
  systemCostTotalAmountSar: "100.00",
  taxPayableAmountSar: "18.00",
  revenueExcludingTaxAmountSar: "120.00",
  currency: "SAR",
  carrierCode: "FEDEX",
  carrierName: "FedEx",
  paymentStatus: "paid",
  paymentMethod: "PAY_NOW",
  ...overrides,
} as InsertShipment);

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

  const account = await storage.createClientAccount({
    name: `Analytics Fixture ${SUFFIX}`,
    email: `analytics-${SUFFIX}@example.com`,
    phone: "966555000000",
    country: "SA",
    city: "Riyadh",
    address: "1 Test Street",
  } as any);
  clientAccountId = account.id;

  // Two billable shipments, plus one cancelled and one unpaid.
  await storage.createShipment(shipment({}));
  await storage.createShipment(shipment({ carrierCode: "DHL", carrierName: "EXPRESS WORLDWIDE", recipientCountry: "EG" }));
  await storage.createShipment(shipment({ paymentStatus: "pending" }));
  await storage.createShipment(shipment({ status: "cancelled" }));
}, 30000);

describe("GET /api/admin/clients/:id/analytics", () => {
  it("excludes cancelled shipments from every money figure", async () => {
    const res = await request.get(`/api/admin/clients/${clientAccountId}/analytics`).set("Cookie", adminCookies);
    expect(res.status).toBe(200);

    const { totals } = res.body;
    expect(totals.shipments).toBe(4);
    expect(totals.activeShipments).toBe(3);
    expect(totals.cancelledShipments).toBe(1);

    // 3 billable × 138.00, never 4 — the cancelled one is reported separately, not billed.
    expect(totals.grossBilledSar).toBe(414);
    expect(totals.revenueExTaxSar).toBe(360);
    expect(totals.costSar).toBe(300);
    expect(totals.netProfitSar).toBe(60);
    expect(totals.cancelledValueSar).toBe(138);
  });

  it("splits billed money into collected and outstanding without losing any", async () => {
    const res = await request.get(`/api/admin/clients/${clientAccountId}/analytics`).set("Cookie", adminCookies);
    const { totals } = res.body;
    expect(totals.collectedSar).toBe(276); // the two paid
    expect(totals.outstandingSar).toBe(138); // the one pending
    expect(totals.collectedSar + totals.outstandingSar).toBe(totals.grossBilledSar);
  });

  it("reports margin and per-shipment averages over billable shipments only", async () => {
    const res = await request.get(`/api/admin/clients/${clientAccountId}/analytics`).set("Cookie", adminCookies);
    const { totals } = res.body;
    expect(totals.marginPct).toBeCloseTo(16.7, 1);
    expect(totals.avgShipmentValueSar).toBe(138);
    expect(totals.avgProfitPerShipmentSar).toBe(20);
  });

  it("breaks activity down by carrier, route and status", async () => {
    const res = await request.get(`/api/admin/clients/${clientAccountId}/analytics`).set("Cookie", adminCookies);
    const { breakdown } = res.body;

    const carriers = Object.fromEntries(breakdown.byCarrier.map((c: any) => [c.carrierCode, c.shipments]));
    expect(carriers.FEDEX).toBe(2);
    expect(carriers.DHL).toBe(1);

    expect(breakdown.byStatus.cancelled).toBe(1);
    expect(breakdown.byStatus.created).toBe(3);
    expect(breakdown.topDestinations.find((d: any) => d.key === "SA")?.count).toBe(2);
    expect(breakdown.topDestinations.find((d: any) => d.key === "EG")?.count).toBe(1);
  });

  it("dates the relationship from the shipments themselves", async () => {
    const res = await request.get(`/api/admin/clients/${clientAccountId}/analytics`).set("Cookie", adminCookies);
    expect(res.body.history.firstShipmentAt).toBeTruthy();
    expect(res.body.history.lastShipmentAt).toBeTruthy();
    expect(res.body.monthly.length).toBeGreaterThan(0);
  });

  it("404s for a client that does not exist", async () => {
    const res = await request
      .get("/api/admin/clients/00000000-0000-0000-0000-000000000000/analytics")
      .set("Cookie", adminCookies);
    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await request.get(`/api/admin/clients/${clientAccountId}/analytics`);
    expect(res.status).toBe(401);
  });
});
