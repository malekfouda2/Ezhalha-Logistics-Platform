import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { ensureOperationProfile, OPERATION_ROLE_NAMES } from "../server/services/operations";
import type { InsertShipment, User } from "../shared/schema";

/**
 * Two guards around booking a courier collection, both from the same production incident.
 *
 * EZH861906362 was a DHL shipment out of Turkey whose pickup was booked for Sunday 2026-09-13.
 * DHL refused it — `5006: Pickup is not allowed for this shipment date` — because Sunday is not a
 * working day at a Turkish origin; the date had been chosen with Saudi weekend rules. The waybill
 * is booked by a *separate* call that had already succeeded, so the parcel travelled to Leipzig
 * posting tracking updates the whole time, with no courier ever dispatched.
 *
 * So: an operator must not be able to pick a day the origin does not work, and must not be able to
 * book a collection for goods that have already left the shipper.
 */

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let opsCookies: string[] = [];

const TEST_PASSWORD = "PickupGuards123!";
const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);
const unique = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function createShipment(overrides: Partial<InsertShipment> = {}) {
  const account = await storage.createClientAccount({
    name: `Pickup Guard ${unique()}`,
    email: `pickupguard_${unique()}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    isActive: true,
  } as any);

  return storage.createShipment({
    clientAccountId: account.id,
    senderName: "Turkish Sender",
    senderAddress: "Fatih Cd 1",
    senderCity: "Arnavutköy",
    senderPostalCode: "34275",
    senderCountry: "TR",
    senderPhone: "+905551112233",
    recipientName: "Saudi Recipient",
    recipientAddress: "2929 Raihana Bint Zaid Street",
    recipientCity: "Riyadh",
    recipientCountry: "SA",
    recipientPhone: "966555123456",
    weight: "5.00",
    weightUnit: "KG",
    packageType: "YOUR_PACKAGING",
    shipmentType: "inbound",
    fulfillmentType: "carrier",
    status: "created",
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "120.00",
    currency: "SAR",
    carrierCode: "DHL",
    carrierName: "EXPRESS WORLDWIDE",
    serviceType: "P",
    carrierTrackingNumber: "2519378223",
    paymentStatus: "paid",
    pickupRequested: true,
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

  const role = (await storage.getRoles()).find((r) => r.name === OPERATION_ROLE_NAMES.manager);
  if (!role) throw new Error("Missing operations manager role");
  const suffix = unique();
  const opsUser: User = await storage.createUser({
    username: `pickup_ops_${suffix}`,
    email: `pickup_ops_${suffix}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "operations",
    isActive: true,
    mustChangePassword: false,
  });
  await storage.assignUserRole({ userId: opsUser.id, roleId: role.id });
  await ensureOperationProfile(opsUser.id, "manager");

  const login = await request.post("/api/auth/login").send({ username: opsUser.username, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  opsCookies = (login.headers["set-cookie"] || []) as string[];
});

afterAll(async () => {
  server?.close();
});

describe("scheduling a pickup", () => {
  it("refuses a date the origin does not work, and says which origin", async () => {
    const shipment = await createShipment();

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/pickup`).send({ date: "2026-09-13" }),
      opsCookies,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not a working day at the origin");
    expect(res.body.error).toContain("TR");
    // Nothing was written — the stored preference must not move on a rejected request.
    const after = await storage.getShipment(shipment.id);
    expect(after?.pickupDate).toBeNull();
  });

  it("accepts the next working day at that origin", async () => {
    const shipment = await createShipment();

    // 2026-09-14 is the Monday. The booking call itself will fail in tests (no DHL credentials),
    // which is fine: what matters is that the date passed the guard and was stored.
    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/pickup`).send({ date: "2026-09-14" }),
      opsCookies,
    );

    expect(res.status).toBe(200);
    expect((await storage.getShipment(shipment.id))?.pickupDate).toBe("2026-09-14");
  });

  it("accepts a Sunday when the origin is Saudi Arabia", async () => {
    // The rule is the origin's calendar, not a ban on Sundays.
    const shipment = await createShipment({
      senderCountry: "SA",
      senderCity: "Jeddah",
      senderPostalCode: "23442",
    });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/pickup`).send({ date: "2026-09-13" }),
      opsCookies,
    );

    expect(res.status).toBe(200);
  });

  it("refuses a collection for goods that have already left the shipper", async () => {
    // The exact state EZH861906362 was in: moving, tracking updating, pickup never booked.
    const shipment = await createShipment({ status: "in_transit", carrierStatus: "Processed at LEIPZIG-GERMANY" });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/pickup`).send({ date: "2026-09-14" }),
      opsCookies,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("left the shipper");
  });
});
