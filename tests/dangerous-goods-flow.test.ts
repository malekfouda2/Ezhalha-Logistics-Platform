import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { DangerousGoodsStatus } from "../shared/dangerous-goods";
import type { InsertShipment } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[] = [];

const TEST_PASSWORD = "DangerousGoodsTest123!";

const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);

async function createClientWithUser(dangerousGoodsEnabled: boolean) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `DG Client ${unique}`,
    email: `dg_client_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "DG Test Co",
    isActive: true,
    dangerousGoodsEnabled,
    shippingContactName: "DG Contact",
    shippingContactPhone: "5551234567",
    shippingCountryCode: "SA",
    shippingStateOrProvince: "Riyadh",
    shippingCity: "Riyadh",
    shippingPostalCode: "13337",
    shippingAddressLine1: "2929, Raihana Bint Zaid Street",
    shippingShortAddress: "RRRD2929",
  } as any);

  const clientUser = await storage.createUser({
    username: `dg_client_${unique}`,
    email: `dg_client_user_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });

  const login = await request.post("/api/auth/login").send({
    username: clientUser.username,
    password: TEST_PASSWORD,
  });
  expect(login.status).toBe(200);

  return { clientAccount, clientUser, cookies: (login.headers["set-cookie"] || []) as string[] };
}

const declaration = {
  regulation: "IATA",
  contentKind: "LITHIUM_ION_PI965_SECTION_II",
  accessibility: "INACCESSIBLE",
  offeror: "Ezhalha Logistics",
  emergencyContact: { name: "Ops desk", phone: "+966500000000" },
  signatory: { name: "Signatory", place: "Jeddah" },
  packages: [{
    packageIndex: 0,
    commodities: [{
      unNumber: "UN3480",
      properShippingName: "Lithium ion batteries",
      hazardClass: "9",
      packingGroup: "NONE",
      packingInstruction: "965",
      quantity: { amount: 2, units: "KG", quantityType: "NET" },
    }],
  }],
};

const rateRequestBody = {
  shipmentType: "outbound",
  isDdp: false,
  shipper: {
    name: "Jeddah Sender",
    phone: "966555123456",
    countryCode: "SA",
    city: "Jeddah",
    postalCode: "23442",
    addressLine1: "King Abdulaziz Road",
    shortAddress: "RRRD2929",
  },
  recipient: {
    name: "Dubai Recipient",
    phone: "971555987654",
    countryCode: "AE",
    city: "Dubai",
    postalCode: "00000",
    addressLine1: "Sheikh Zayed Road",
  },
  packages: [{ weight: 2, length: 20, width: 15, height: 10 }],
  weightUnit: "KG",
  dimensionUnit: "CM",
  packageType: "YOUR_PACKAGING",
  currency: "SAR",
};

/** A paid express shipment carrying a declaration that has not been reviewed yet. */
async function createHeldDangerousGoodsShipment(clientAccountId: string, overrides: Partial<InsertShipment> = {}) {
  return storage.createShipment({
    clientAccountId,
    senderName: "Jeddah Sender",
    senderAddress: "King Abdulaziz Road",
    senderCity: "Jeddah",
    senderCountry: "SA",
    senderPhone: "966555123456",
    recipientName: "Dubai Recipient",
    recipientAddress: "Sheikh Zayed Road",
    recipientCity: "Dubai",
    recipientCountry: "AE",
    recipientPhone: "971555987654",
    weight: "2.00",
    weightUnit: "KG",
    packageType: "YOUR_PACKAGING",
    shipmentType: "outbound",
    status: "awaiting_review",
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "120.00",
    currency: "SAR",
    carrierCode: "DHL",
    carrierName: "DHL Express",
    paymentStatus: "paid",
    paymentMethod: "PAY_NOW",
    hasDangerousGoods: true,
    dangerousGoodsStatus: DangerousGoodsStatus.PENDING_REVIEW,
    dangerousGoodsRegulation: "IATA",
    dangerousGoodsData: JSON.stringify(declaration),
    ...overrides,
  } as InsertShipment);
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const adminLoginRes = await request.post("/api/auth/login").send({ username: "admin", password: "admin123" });
  expect(adminLoginRes.status).toBe(200);
  adminCookies = (adminLoginRes.headers["set-cookie"] || []) as string[];
}, 30000);

afterAll(() => {
  server.close();
});

describe("Dangerous goods access gating", () => {
  it("reports the feature as off for a client who has not been approved", async () => {
    const { cookies } = await createClientWithUser(false);
    const res = await withCookies(request.get("/api/client/dangerous-goods"), cookies);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it("reports the feature as on for an approved client", async () => {
    const { cookies } = await createClientWithUser(true);
    const res = await withCookies(request.get("/api/client/dangerous-goods"), cookies);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  it("refuses a dangerous goods quote from an unapproved client", async () => {
    // The gate runs before any carrier is contacted, so an unapproved client cannot even
    // discover what a dangerous goods shipment would cost.
    const { cookies } = await createClientWithUser(false);
    const res = await withCookies(
      request.post("/api/client/shipments/rates").send({ ...rateRequestBody, dangerousGoods: declaration }),
      cookies,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not approved for dangerous goods/i);
  });

  it("rejects a malformed declaration before it reaches a carrier", async () => {
    const { cookies } = await createClientWithUser(true);
    const res = await withCookies(
      request.post("/api/client/shipments/rates").send({
        ...rateRequestBody,
        dangerousGoods: {
          ...declaration,
          packages: [{
            packageIndex: 0,
            // "3480" is not a UN number; the printed form is "UN3480".
            commodities: [{ ...declaration.packages[0].commodities[0], unNumber: "3480" }],
          }],
        },
      }),
      cookies,
    );
    expect(res.status).toBe(400);
  });

  it("lets an approved client quote an ordinary shipment unchanged", async () => {
    // The gate must be invisible when nothing is declared.
    const { cookies } = await createClientWithUser(true);
    const res = await withCookies(
      request.post("/api/client/shipments/rates").send(rateRequestBody),
      cookies,
    );
    expect(res.status).not.toBe(403);
  });
});

describe("Dangerous goods review", () => {
  it("exposes the declaration to operations", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id);

    const res = await withCookies(
      request.get(`/api/operations/shipments/${shipment.id}/dangerous-goods`),
      adminCookies,
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(DangerousGoodsStatus.PENDING_REVIEW);
    expect(res.body.summary).toContain("UN3480");
    expect(res.body.declaration.packages[0].commodities[0].properShippingName)
      .toBe("Lithium ion batteries");
  });

  it("404s for a shipment carrying no dangerous goods", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id, {
      hasDangerousGoods: false,
      dangerousGoodsStatus: DangerousGoodsStatus.NOT_APPLICABLE,
      dangerousGoodsData: null,
    });

    const res = await withCookies(
      request.get(`/api/operations/shipments/${shipment.id}/dangerous-goods`),
      adminCookies,
    );
    expect(res.status).toBe(404);
  });

  it("refuses to approve a declaration that cannot be read", async () => {
    // The carrier payload is built from this JSON. Approving an unparseable declaration
    // would tender the goods undeclared, so it is blocked and the operator must reject.
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id, {
      dangerousGoodsData: "{corrupt",
    });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/approve`).send({}),
      adminCookies,
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/could not be read/i);

    const stored = await storage.getShipment(shipment.id);
    expect(stored?.dangerousGoodsStatus).toBe(DangerousGoodsStatus.PENDING_REVIEW);
    expect(stored?.carrierTrackingNumber).toBeFalsy();
  });

  it("rejects a declaration with a reason, cancels the shipment, and books nothing", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id);

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/reject`)
        .send({ reason: "Packing group does not match the packing instruction." }),
      adminCookies,
    );
    expect(res.status).toBe(200);

    const stored = await storage.getShipment(shipment.id);
    expect(stored?.dangerousGoodsStatus).toBe(DangerousGoodsStatus.REJECTED);
    expect(stored?.status).toBe("cancelled");
    expect(stored?.dangerousGoodsRejectionReason).toMatch(/packing group/i);
    // Nothing was ever tendered to the carrier — that is the whole point of the hold.
    expect(stored?.carrierTrackingNumber).toBeFalsy();
  });

  it("requires a reason to reject", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id);

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/reject`).send({ reason: "" }),
      adminCookies,
    );
    expect(res.status).toBe(400);
  });

  it("will not review the same declaration twice", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id, {
      dangerousGoodsStatus: DangerousGoodsStatus.REJECTED,
    });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/reject`)
        .send({ reason: "Second opinion" }),
      adminCookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been reviewed/i);
  });

  it("refuses a carrier retry while the declaration is unreviewed", async () => {
    // Every booking call site has to respect the hold, not just the payment path.
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id, {
      status: "carrier_error",
    });

    const res = await withCookies(
      request.post(`/api/admin/shipments/${shipment.id}/retry-carrier`).send({}),
      adminCookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/has not been reviewed/i);

    const stored = await storage.getShipment(shipment.id);
    expect(stored?.carrierTrackingNumber).toBeFalsy();
  });

  it("surfaces held shipments in the dangerous goods queue", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id);

    const res = await withCookies(
      request.get("/api/operations/shipments?queue=dangerous_goods&limit=200"),
      adminCookies,
    );
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(shipment.id);
  });

  it("drops a shipment out of the queue once it has been reviewed", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createHeldDangerousGoodsShipment(clientAccount.id, {
      dangerousGoodsStatus: DangerousGoodsStatus.APPROVED,
    });

    const res = await withCookies(
      request.get("/api/operations/shipments?queue=dangerous_goods&limit=200"),
      adminCookies,
    );
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain(shipment.id);
  });
});
