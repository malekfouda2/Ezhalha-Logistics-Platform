import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { shipmentRateQuotes } from "../shared/schema";
import { count, sql } from "drizzle-orm";

// Guest mode lets a visitor with no account walk the whole create-shipment flow and see a real
// price. The risk it introduces is not the browsing — it is that "no account" must never become
// a way to write to the system. These tests guard the three ways that goes wrong: an
// unauthenticated caller reaching a client endpoint, a guest quote leaving rows behind, and a
// visitor losing the shipment they built the moment they register.

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

const TEST_PASSWORD = "GuestMode123!";
const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);
const unique = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const address = (overrides: Record<string, unknown> = {}) => ({
  name: "Test Sender",
  phone: "+966500000000",
  email: "sender@example.com",
  addressLine1: "King Fahd Road",
  city: "Riyadh",
  stateOrProvince: "Riyadh",
  postalCode: "12345",
  countryCode: "SA",
  shortAddress: "RRRD2929",
  ...overrides,
});

const expressBody = (overrides: Record<string, unknown> = {}) => ({
  shipmentType: "outbound",
  isDdp: false,
  shipper: address(),
  recipient: address({
    name: "Test Recipient",
    city: "Dubai",
    stateOrProvince: "Dubai",
    countryCode: "AE",
    postalCode: "00000",
    shortAddress: undefined,
  }),
  packages: [{ weight: 2, length: 20, width: 20, height: 20 }],
  weightUnit: "KG",
  dimensionUnit: "CM",
  packageType: "PARCEL",
  currency: "SAR",
  ...overrides,
});

const localBody = () => ({
  shipper: address(),
  recipient: address({ name: "Local Recipient", city: "Jeddah", stateOrProvince: "Makkah" }),
  pieces: 1,
  weight: 3,
  weightUnit: "KG",
  currency: "SAR",
});

const applicationBody = (accountType: "individual" | "company", suffix: string) => ({
  accountType,
  name: accountType === "company" ? `Guest Co ${suffix}` : `Guest Person ${suffix}`,
  email: `guest_${suffix}@example.com`,
  phone: "+966500000000",
  ...(accountType === "company" ? { companyName: `Guest Co ${suffix}` } : {}),
  shippingContactName: "Guest Contact",
  shippingContactPhone: "+966500000000",
  shippingCountryCode: "SA",
  shippingStateOrProvince: "Riyadh",
  shippingCity: "Riyadh",
  shippingPostalCode: "12345",
  shippingAddressLine1: "King Fahd Road",
  shippingShortAddress: "RRRD2929",
});

const draftPayload = {
  kind: "express" as const,
  formData: { shipmentType: "outbound", packages: [{ weight: 2 }] },
  indicativeQuote: {
    carrierName: "DHL",
    serviceName: "Express Worldwide",
    totalSar: 210.5,
    currency: "SAR",
  },
};

// Counting every row in the table is not safe here: the suite runs test files in parallel and
// other flows legitimately create quotes at the same moment. Instead each request carries a
// unique marker in its addresses, and we assert no stored quote mentions it.
const countQuotesMentioning = async (marker: string) => {
  const [row] = await db
    .select({ total: count() })
    .from(shipmentRateQuotes)
    .where(sql`${shipmentRateQuotes.shipmentData} like ${"%" + marker + "%"}`);
  return Number(row?.total ?? 0);
};

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);
}, 60000);

afterAll(() => {
  server.close();
});

describe("guest rating is public but writes nothing", () => {
  it("does not require a session", async () => {
    // The whole point: no cookie, and the request is still served. A 401 here would mean guest
    // mode silently degrades to a blank rate screen.
    const expressRes = await request.post("/api/public/guest/express-rates").send({});
    expect(expressRes.status).toBe(400);

    const localRes = await request.post("/api/public/guest/local-rates").send({});
    expect(localRes.status).toBe(400);
  });

  it("refuses dangerous goods, which need an approved account", async () => {
    const res = await request
      .post("/api/public/guest/express-rates")
      .send(expressBody({ dangerousGoods: { regulation: "IATA", packages: [] } }));

    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/account/i);
  });

  it("refuses door-to-door freight, which is arranged by operations", async () => {
    const res = await request.post("/api/public/guest/express-rates").send(expressBody({ isDdp: true }));
    expect(res.status).toBe(400);
  });

  it("validates the shipment before spending a carrier call", async () => {
    const res = await request
      .post("/api/public/guest/express-rates")
      .send(expressBody({ shipper: address({ city: "", addressLine1: "" }) }));

    expect(res.status).toBe(400);
    expect(String(res.body.error || "")).toBeTruthy();
  });

  it("prices a local shipment and leaves no quote row behind", async () => {
    // `shipment_rate_quotes.clientAccountId` is NOT NULL, so a guest quote cannot be stored
    // even in principle — this pins the behaviour so a later refactor cannot start persisting
    // guest quotes against some placeholder account.
    const carrierCode = "SMSA";
    await storage.createLocalCarrierPricingTier({
      carrierCode,
      minWeightKg: "0",
      maxWeightKg: "30",
      baseRateSar: "25.00",
      markupType: "percent",
      markupValue: "20",
      clientProfile: "regular",
      enabled: true,
    });

    const marker = `guestmarker_${unique()}`;
    const body = localBody();
    body.recipient = { ...body.recipient, name: marker };

    const res = await request.post("/api/public/guest/local-rates").send(body);
    const stored = await countQuotesMentioning(marker);

    expect(res.status).toBe(200);
    expect(res.body.indicative).toBe(true);
    expect(Array.isArray(res.body.quotes)).toBe(true);
    expect(res.body.quotes.length).toBeGreaterThan(0);
    expect(stored).toBe(0);

    const quote = res.body.quotes.find((q: { carrierCode: string }) => q.carrierCode === carrierCode);
    expect(quote).toBeTruthy();
    // 25 base + 20% markup = 30, +15% VAT (domestic DCE) = 34.50.
    expect(Number(quote.finalPrice)).toBeCloseTo(34.5, 2);
    // Not a stored quote id — nothing was written, so it cannot be checked out directly.
    expect(String(quote.quoteId)).toMatch(/^guest-/);
  });
});

describe("a guest cannot reach anything that writes", () => {
  it("401s on every client mutation without a session", async () => {
    // Guest mode grants no cookie at all, which is what makes it safe: these routes need no new
    // guest-specific guard, and this test is what proves that assumption still holds.
    const mutations: Array<[string, string]> = [
      ["post", "/api/client/shipments/rates"],
      ["post", "/api/client/shipments/checkout"],
      ["post", "/api/client/shipments/pay"],
      ["post", "/api/client/shipments/confirm"],
      ["post", "/api/client/local/rates"],
      ["post", "/api/client/local/checkout"],
      ["post", "/api/client/ddp/rates"],
      ["post", "/api/client/quick-quote"],
      ["patch", "/api/client/account"],
      ["post", "/api/client/payments/create-charge"],
      ["get", "/api/client/pending-draft"],
      ["post", "/api/client/pending-draft/dismiss"],
    ];

    for (const [method, path] of mutations) {
      const res = await (request as any)[method](path).send({});
      expect(`${path} -> ${res.status}`).toBe(`${path} -> 401`);
    }
  });
});

describe("registering keeps the shipment", () => {
  it("auto-approves an individual, signs them in, and carries their draft", async () => {
    const suffix = unique();
    const body = applicationBody("individual", suffix);

    const res = await request.post("/api/applications").send({ ...body, shipmentDraft: draftPayload });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("approved");
    // Approval creates the user with an unusable random password, so without a session
    // established here the applicant would be approved and still locked out.
    expect(res.body.authenticated).toBe(true);

    const cookies = (res.headers["set-cookie"] || []) as string[];
    expect(cookies.length).toBeGreaterThan(0);

    const me = await withCookies(request.get("/api/auth/me"), cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(body.email);
    expect(me.body.user.userType).toBe("client");
    // A password-change redirect would bounce them to settings and lose the shipment.
    expect(me.body.user.mustChangePassword).toBe(false);

    const application = await storage.getApprovedApplicationWithDraft(body.email);
    expect(application).toBeTruthy();
    expect(JSON.parse(application!.shipmentDraft!)).toMatchObject({ kind: "express" });
  });

  it("holds a company's draft while the application waits for review", async () => {
    const suffix = unique();
    const body = applicationBody("company", suffix);

    // Company applications need documents; without them the endpoint refuses before storing.
    const res = await request.post("/api/applications").send({
      ...body,
      documents: [],
      shipmentDraft: draftPayload,
    });

    // Either it is rejected for missing documents, or it is accepted and left pending — what it
    // must never be is auto-approved.
    if (res.status === 201) {
      expect(res.body.status).toBe("pending");
      expect(res.body.authenticated).toBe(false);
      const applications = await storage.getClientApplications();
      const stored = applications.find((a) => a.email === body.email);
      expect(stored?.shipmentDraft).toBeTruthy();
      // Nothing is approved yet, so nothing is handed back yet.
      expect(await storage.getApprovedApplicationWithDraft(body.email)).toBeUndefined();
    } else {
      expect(res.status).toBe(400);
    }
  });

  it("hands the draft back once, then never again", async () => {
    const suffix = unique();
    const email = `resume_${suffix}@example.com`;

    // Stand in for an approved company: the account and user exist, and the application that
    // created them still carries the shipment the visitor built as a guest.
    const clientAccount = await storage.createClientAccount({
      accountType: "company",
      name: `Resume Co ${suffix}`,
      email,
      phone: "+966500000000",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });
    const user = await storage.createUser({
      username: `resume_${suffix}`,
      email,
      password: await bcrypt.hash(TEST_PASSWORD, 10),
      userType: "client",
      clientAccountId: clientAccount.id,
      isPrimaryContact: true,
      isActive: true,
      mustChangePassword: false,
    });
    const application = await storage.createClientApplication({
      ...applicationBody("company", suffix),
      email,
      country: "Saudi Arabia",
      status: "approved",
      shipmentDraft: JSON.stringify(draftPayload),
    });
    expect(application.id).toBeTruthy();

    const login = await request.post("/api/auth/login").send({ username: user.username, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const cookies = (login.headers["set-cookie"] || []) as string[];

    const first = await withCookies(request.get("/api/client/pending-draft"), cookies);
    expect(first.status).toBe(200);
    expect(first.body.draft).toMatchObject({ kind: "express" });
    expect(first.body.draft.indicativeQuote.totalSar).toBe(210.5);

    const dismiss = await withCookies(request.post("/api/client/pending-draft/dismiss"), cookies);
    expect(dismiss.status).toBe(200);

    // Offered exactly once — otherwise a refresh replays the same shipment forever.
    const second = await withCookies(request.get("/api/client/pending-draft"), cookies);
    expect(second.status).toBe(200);
    expect(second.body.draft).toBeNull();
  });

  it("survives an unparseable draft rather than offering a banner that leads nowhere", async () => {
    const suffix = unique();
    const email = `broken_${suffix}@example.com`;

    const clientAccount = await storage.createClientAccount({
      accountType: "company",
      name: `Broken Co ${suffix}`,
      email,
      phone: "+966500000000",
      country: "Saudi Arabia",
      profile: "regular",
      isActive: true,
    });
    const user = await storage.createUser({
      username: `broken_${suffix}`,
      email,
      password: await bcrypt.hash(TEST_PASSWORD, 10),
      userType: "client",
      clientAccountId: clientAccount.id,
      isPrimaryContact: true,
      isActive: true,
      mustChangePassword: false,
    });
    await storage.createClientApplication({
      ...applicationBody("company", suffix),
      email,
      country: "Saudi Arabia",
      status: "approved",
      shipmentDraft: "{not json",
    });

    const login = await request.post("/api/auth/login").send({ username: user.username, password: TEST_PASSWORD });
    const cookies = (login.headers["set-cookie"] || []) as string[];

    const res = await withCookies(request.get("/api/client/pending-draft"), cookies);
    expect(res.status).toBe(200);
    expect(res.body.draft).toBeNull();
  });
});
