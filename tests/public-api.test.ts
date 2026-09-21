import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { count, sql } from "drizzle-orm";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { shipmentRateQuotes } from "../shared/schema";
import { recordCarrierTrackingEvents } from "../server/services/carrier-tracking-events";

/**
 * The public API behind the marketing site at ezhalha.co.
 *
 * Both endpoints are reachable by anyone on the internet with no session, so the risk is not that
 * they break — it is that they say too much. Quick Quote knows our carrier cost and our margin;
 * a shipment row knows both parties' names, addresses and phone numbers, what is in the box, what
 * it is worth, and whether it is regulated. These tests exist to keep all of that on our side of
 * the line, and they are written as allow-list assertions so a column added later fails loudly
 * rather than leaking quietly.
 */

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let clientAccountId = "";

const unique = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Counting every quote row is unsafe — the suite runs files in parallel and other flows create
 * quotes legitimately. Plant a marker instead and assert nothing stored mentions it.
 */
const countQuotesMentioning = async (marker: string) => {
  const [row] = await db
    .select({ total: count() })
    .from(shipmentRateQuotes)
    .where(sql`${shipmentRateQuotes.shipmentData} like ${"%" + marker + "%"}`);
  return Number(row?.total ?? 0);
};

/** A shipment carrying every kind of thing the public must never see. */
async function seedShipment(overrides: Record<string, any> = {}) {
  return storage.createShipment({
    clientAccountId,
    senderName: "Faisal Al-Otaibi",
    senderCompany: "Secret Supplier Co",
    senderAddress: "8812 King Abdulaziz Road",
    senderCity: "Riyadh",
    senderPostalCode: "12211",
    senderCountry: "SA",
    senderPhone: "500111222",
    senderEmail: "faisal@example.com",
    recipientName: "Noura Al-Harbi",
    recipientCompany: "Buyer LLC",
    recipientAddress: "40 Sheikh Zayed Road",
    recipientCity: "Dubai",
    recipientPostalCode: "00000",
    recipientCountry: "AE",
    recipientPhone: "501333444",
    recipientEmail: "noura@example.com",
    weight: "5.00",
    weightUnit: "KG",
    packageType: "YOUR_PACKAGING",
    shipmentType: "outbound",
    numberOfPackages: 3,
    isDdp: false,
    status: "in_transit",
    carrierStatus: "In transit",
    carrierCode: "FEDEX",
    carrierName: "FedEx",
    carrierTrackingNumber: `7945${Math.floor(Math.random() * 100000000)}`,
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "123.00",
    clientTotalAmountSar: "123.00",
    accountingCurrency: "SAR",
    taxScenario: "EXPORT",
    currency: "SAR",
    itemsData: JSON.stringify([{ itemName: "Confidential Widget", price: 740, quantity: 2 }]),
    paymentStatus: "paid",
    ...overrides,
  });
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const suffix = unique();
  const account = await storage.createClientAccount({
    name: `Public API Client ${suffix}`,
    email: `public_api_${suffix}@test.com`,
    phone: "5559876543",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    isActive: true,
  });
  clientAccountId = account.id;
}, 60000);

afterAll(() => {
  server.close();
});

describe("POST /api/public/quote", () => {
  it("is reachable with no session at all", async () => {
    // A 401 here would mean the marketing site silently shows a blank price panel. 400 proves the
    // route was reached and the body was validated.
    const res = await request.post("/api/public/quote").send({});
    expect(res.status).toBe(400);
  });

  it("prices a domestic lane and writes no quote row", async () => {
    const marker = `publicquote_${unique()}`;
    const before = await countQuotesMentioning(marker);

    const res = await request.post("/api/public/quote").send({
      origin: { countryCode: "SA", city: marker },
      destination: { countryCode: "SA" },
      weightKg: 3,
    });

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("SAR");
    expect(res.body.indicative).toBe(true);
    // Read-only, exactly like /api/client/quick-quote.
    expect(await countQuotesMentioning(marker)).toBe(before);
  });

  it("never returns our cost or our margin", async () => {
    // The authenticated route exposes baseRate and markup on local[] and ddp[], plus an internal
    // ddp laneId. On a public page those are a competitor's homework.
    const res = await request.post("/api/public/quote").send({
      origin: { countryCode: "SA" },
      destination: { countryCode: "SA" },
      weightKg: 3,
    });

    expect(res.status).toBe(200);
    const every = [...res.body.local, ...res.body.ddp, ...res.body.express];
    for (const rate of every) {
      expect(rate).not.toHaveProperty("baseRate");
      expect(rate).not.toHaveProperty("markup");
      expect(rate).not.toHaveProperty("laneId");
    }
    // And nothing anywhere in the serialised body, in case a nested shape appears later.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("baseRate");
    expect(body).not.toContain("markup");
    expect(body).not.toContain("laneId");
  });

  it("still returns a usable price after redaction", async () => {
    const res = await request.post("/api/public/quote").send({
      origin: { countryCode: "SA" },
      destination: { countryCode: "SA" },
      weightKg: 3,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chargeable.chargeableAirKg");
    expect(res.body).toHaveProperty("available");
    for (const rate of res.body.local) {
      expect(typeof rate.clientTotal).toBe("number");
      expect(rate).toHaveProperty("carrierName");
    }
  });

  it("returns a shortlist, not a rate table", async () => {
    // A sandbox lane can come back with hundreds of service levels. The page has room for a
    // price, not a spreadsheet, and the payload should not carry what nobody reads.
    const res = await request.post("/api/public/quote").send({
      origin: { countryCode: "SA" },
      destination: { countryCode: "SA" },
      weightKg: 5,
    });

    expect(res.status).toBe(200);
    expect(res.body.express.length).toBeLessThanOrEqual(5);
    expect(res.body.local.length).toBeLessThanOrEqual(5);
  });

  it("keeps the cheapest rate first, so the badge lands on the right row", async () => {
    const res = await request.post("/api/public/quote").send({
      origin: { countryCode: "SA" },
      destination: { countryCode: "SA" },
      weightKg: 5,
    });

    expect(res.status).toBe(200);
    for (const group of [res.body.local, res.body.express]) {
      const totals = group.map((r: { clientTotal: number }) => r.clientTotal);
      expect(totals).toEqual([...totals].sort((a: number, b: number) => a - b));
    }
  });

  it("rejects a missing weight", async () => {
    const res = await request.post("/api/public/quote").send({
      origin: { countryCode: "SA" },
      destination: { countryCode: "AE" },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/public/track/:trackingNumber", () => {
  it("accepts only ezhalha numbers", async () => {
    // A carrier waybill is well-formed but not ours. carrier_tracking_number has no unique index
    // and carries historical duplicates, so resolving one is ambiguous by design.
    for (const bad of ["877206502140", "hello", "EZH12345", "EZH1234567890"]) {
      const res = await request.get(`/api/public/track/${bad}`);
      expect(`${bad} -> ${res.status}`).toBe(`${bad} -> 400`);
      expect(res.body.code).toBe("invalid_tracking_number");
    }
  });

  it("returns 404 for a well-formed number that does not exist", async () => {
    const res = await request.get("/api/public/track/EZH999999999");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("returns movement for a real shipment", async () => {
    const shipment = await seedShipment();
    await recordCarrierTrackingEvents({
      shipmentId: shipment.id,
      carrierCode: "FEDEX",
      events: [
        { status: "in_transit", description: "Departed FedEx hub", location: "Dubai, AE", timestamp: new Date() },
      ] as any,
    });

    const res = await request.get(`/api/public/track/${shipment.trackingNumber}`);

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe(shipment.trackingNumber);
    expect(res.body.status).toBe("in_transit");
    expect(res.body.carrier).toBe("FedEx");
    expect(res.body.pieces).toBe(3);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
    // City and country are the one pair a tracking page conventionally shows.
    expect(res.body.origin).toEqual({ city: "Riyadh", country: "SA" });
    expect(res.body.destination).toEqual({ city: "Dubai", country: "AE" });
  });

  it("leaks no personal or commercial detail", async () => {
    const shipment = await seedShipment();
    const res = await request.get(`/api/public/track/${shipment.trackingNumber}`);
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    const mustNotAppear = [
      "Faisal", "Al-Otaibi", "Noura", "Al-Harbi",       // names
      "Secret Supplier", "Buyer LLC",                     // companies
      "King Abdulaziz", "Sheikh Zayed",                   // street addresses
      "500111222", "501333444",                           // phones
      "faisal@example.com", "noura@example.com",          // emails
      "Confidential Widget",                              // item data
      "123.00", "100.00", "20.00",                        // prices, cost, margin
      shipment.carrierTrackingNumber!,                    // the carrier's own waybill
    ];
    for (const secret of mustNotAppear) {
      expect(`${secret} in body -> ${body.includes(secret)}`).toBe(`${secret} in body -> false`);
    }

    // Allow-list check from the other direction: only these keys, ever.
    expect(Object.keys(res.body).sort()).toEqual([
      "actualDelivery", "carrier", "destination", "estimatedDelivery",
      "events", "origin", "pieces", "status", "trackingNumber",
    ]);
  });

  it("does not confirm that an unpaid shipment exists", async () => {
    // payment_pending is not in the public status map. Returning 404 rather than "exists but you
    // cannot see it" means enumeration learns nothing from the difference.
    const shipment = await seedShipment({ status: "payment_pending", paymentStatus: "pending" });
    const res = await request.get(`/api/public/track/${shipment.trackingNumber}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("never exposes a raw internal status", async () => {
    // carrier_error means our booking failed. The shipment is paid and operations will retry it;
    // the public sees "processing".
    const shipment = await seedShipment({ status: "carrier_error" });
    const res = await request.get(`/api/public/track/${shipment.trackingNumber}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processing");
  });

  it("shows a milestone for a shipment with no carrier scans", async () => {
    // Local and door-to-door shipments are never polled, so they have no event rows. An empty
    // timeline would read as "we lost it".
    const shipment = await seedShipment({ carrierStatus: "Booked with carrier" });
    const res = await request.get(`/api/public/track/${shipment.trackingNumber}`);
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
  });
});
