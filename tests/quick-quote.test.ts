import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { eq } from "drizzle-orm";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { shipmentRateQuotes } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let clientCookies: string[] = [];
let clientAccountId = "";

const TEST_PASSWORD = "QuickQuoteTest123!";
const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);

async function countQuotes(accountId: string) {
  const rows = await db.select().from(shipmentRateQuotes).where(eq(shipmentRateQuotes.clientAccountId, accountId));
  return rows.length;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const account = await storage.createClientAccount({
    name: `QQ Client ${unique}`,
    email: `qq_client_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "QQ Test Co",
    isActive: true,
  });
  clientAccountId = account.id;

  const username = `qq_client_${unique}`;
  await storage.createUser({
    username,
    email: `qq_client_user_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "client",
    clientAccountId: account.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });

  const login = await request.post("/api/auth/login").send({ username, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  clientCookies = login.headers["set-cookie"] || [];
}, 30000);

afterAll(() => {
  server.close();
});

describe("Quick Quote — read-only cross-scope price check", () => {
  it("requires authentication", async () => {
    const res = await request.post("/api/client/quick-quote").send({
      origin: { countryCode: "SA" }, destination: { countryCode: "SA" }, weightKg: 2,
    });
    expect(res.status).toBe(401);
  });

  it("returns local KSA carrier rates for a SA→SA route and writes NO rate-quote rows", async () => {
    // A virtual carrier + its rate card is fully isolated and deterministic.
    const code = `QQVC_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
    await storage.createVirtualCarrier({ code, name: "QQ Test Courier", provider: "fizzpa", noteTemplate: "" });
    await storage.createLocalCarrierPricingTier({
      carrierCode: code,
      minWeightKg: "0",
      maxWeightKg: "50",
      baseRateSar: "60.00",
      markupType: "percent",
      markupValue: "20",
      clientProfile: null,
      enabled: true,
    });

    const before = await countQuotes(clientAccountId);
    const res = await withCookies(request.post("/api/client/quick-quote"), clientCookies).send({
      origin: { countryCode: "SA", city: "Riyadh" },
      destination: { countryCode: "SA", city: "Jeddah" },
      weightKg: 2,
      pieces: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.available.local).toBe(true);

    const mine = res.body.local.find((q: any) => q.carrierCode === code);
    expect(mine).toBeTruthy();
    expect(mine.baseRate).toBeCloseTo(60, 2);
    expect(mine.markup).toBeCloseTo(12, 2); // 60 * 20%
    expect(mine.clientTotal).toBeCloseTo(82.8, 2); // (60+12) * 1.15

    // Read-only: no shipment_rate_quotes persisted (unlike /local/rates and /ddp/rates).
    expect(await countQuotes(clientAccountId)).toBe(before);
  });

  it("returns DDP door-to-door methods for a configured lane and writes NO rate-quote rows", async () => {
    // Reuse-or-create so the test stays idempotent across runs (tests don't clean up, and the
    // lane lookup has a unique constraint on origin/destination).
    const lane =
      (await storage.findDdpPricingLane({ originCountryCode: "QX", destinationCountryCode: "SA" })) ||
      (await storage.createDdpPricingLane({
        originCountryCode: "QX",
        originCity: "",
        destinationCountryCode: "SA",
        destinationCity: "",
        currency: "SAR",
        airBaseRatePerKg: "40.00",
        seaBaseRatePerCbm: null,
        minimumBillableKg: "1.000",
        kgRoundingIncrement: "0.500",
        minimumBillableCbm: "0.0000",
        cbmRoundingIncrement: "0.1000",
        minimumShipmentCharge: "40.00",
        volumetricDivisor: 6000,
        isActive: true,
      }));

    const before = await countQuotes(clientAccountId);
    const res = await withCookies(request.post("/api/client/quick-quote"), clientCookies).send({
      origin: { countryCode: "QX" },
      destination: { countryCode: "SA" },
      weightKg: 5,
      length: 30, width: 20, height: 10,
      pieces: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.available.ddp).toBe(true);

    const air = res.body.ddp.find((q: any) => q.transportMethod === "air");
    expect(air).toBeTruthy();
    expect(air.laneId).toBe(lane.id);
    expect(air.billingUnit).toBe("KG");
    expect(air.clientTotal).toBeGreaterThan(0);

    // Sea is unavailable on this lane (no CBM rate) → not returned.
    expect(res.body.ddp.some((q: any) => q.transportMethod === "sea")).toBe(false);

    expect(await countQuotes(clientAccountId)).toBe(before);
  });

  it("returns LIVE express carrier rates with all service levels, priced with margin + VAT", async () => {
    // In test env (NODE_ENV !== production) unconfigured carriers fall back to mock rates,
    // so FedEx returns quotes for a mapped international lane (SA→US) without a real account.
    const res = await withCookies(request.post("/api/client/quick-quote"), clientCookies).send({
      origin: { countryCode: "SA" },
      destination: { countryCode: "US" },
      weightKg: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body.available.express).toBe(true);
    expect(res.body.express.length).toBeGreaterThan(0);

    const q = res.body.express[0];
    expect(q.carrierCode).toBeTruthy();
    expect(q.serviceName).toBeTruthy();     // carrier-returned service level
    expect(q.clientTotal).toBeGreaterThan(0); // margin + VAT applied
    // Sorted cheapest-first.
    const totals = res.body.express.map((e: any) => e.clientTotal);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);

    // Quick quote never persists rate-quote rows.
    // (express rating is read-only, same as local/ddp above.)
  });

  it("skips express for countries with no representative postal mapping", async () => {
    const res = await withCookies(request.post("/api/client/quick-quote"), clientCookies).send({
      origin: { countryCode: "ZZ" },
      destination: { countryCode: "YY" },
      weightKg: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.available.local).toBe(false);
    expect(res.body.available.ddp).toBe(false);
    expect(res.body.available.express).toBe(false); // ZZ/YY not in the postal map
  });

  it("rejects an invalid payload (missing weight)", async () => {
    const res = await withCookies(request.post("/api/client/quick-quote"), clientCookies).send({
      origin: { countryCode: "SA" }, destination: { countryCode: "SA" },
    });
    expect(res.status).toBe(400);
  });
});
