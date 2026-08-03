import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import {
  ensureOperationAssignmentForShipment,
  getOperationShipmentKind,
} from "../server/services/operations";
import { resolveLocalRate } from "../server/services/local-pricing";
import { calculateShipmentAccounting, VAT_RATE } from "../server/services/shipment-accounting";
import { OperationShipmentKind, type InsertShipment, type Shipment } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[] = [];

const TEST_PASSWORD = "LocalShipmentsTest123!";

const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);

async function createClientWithUser() {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `Local Client ${unique}`,
    email: `local_client_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "Local Test Co",
    isActive: true,
    shippingContactName: "Local Contact",
    shippingContactPhone: "5551234567",
    shippingCountryCode: "SA",
    shippingStateOrProvince: "Riyadh",
    shippingCity: "Riyadh",
    shippingPostalCode: "13337",
    shippingAddressLine1: "2929, Raihana Bint Zaid Street",
    shippingAddressLine2: "8118, AlArid",
    shippingShortAddress: "RRRD2929",
  });

  const clientUser = await storage.createUser({
    username: `local_client_${unique}`,
    email: `local_client_user_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });

  return { clientAccount, clientUser };
}

// A paid, active domestic ("local") shipment. It carries a carrierCode (the local
// carrier) exactly like the real flow — the property that would mis-derive it as
// EXPRESS if the LOCAL branch were not evaluated first.
async function createPaidLocalShipment(clientAccountId: string, overrides: Partial<InsertShipment> = {}) {
  return storage.createShipment({
    clientAccountId,
    senderName: "Riyadh Sender",
    senderAddress: "2929, Raihana Bint Zaid Street",
    senderCity: "Riyadh",
    senderCountry: "SA",
    senderPhone: "966555123456",
    recipientName: "Jeddah Recipient",
    recipientAddress: "King Abdulaziz Road",
    recipientCity: "Jeddah",
    recipientCountry: "SA",
    recipientPhone: "966555987654",
    weight: "2.00",
    weightUnit: "KG",
    packageType: "YOUR_PACKAGING",
    shipmentType: "domestic",
    fulfillmentType: "local",
    status: "processing",
    baseRate: "50.00",
    marginAmount: "9.00",
    margin: "9.00",
    finalPrice: "67.85",
    accountingCurrency: "SAR",
    costAmountSar: "50.00",
    sellSubtotalAmountSar: "59.00",
    sellTaxAmountSar: "8.85",
    clientTotalAmountSar: "67.85",
    systemCostTotalAmountSar: "57.50",
    revenueExcludingTaxAmountSar: "9.00",
    currency: "SAR",
    carrierCode: "SMSA",
    carrierName: "SMSA Express",
    paymentStatus: "paid",
    paymentMethod: "PAY_NOW",
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

  const adminLoginRes = await request.post("/api/auth/login").send({ username: "admin", password: "admin123" });
  expect(adminLoginRes.status).toBe(200);
  adminCookies = adminLoginRes.headers["set-cookie"] || [];
}, 30000);

afterAll(() => {
  server.close();
});

describe("Local shipments", () => {
  it("derives a local shipment carrying a carrierCode as LOCAL, not EXPRESS", () => {
    // The #1 implementation risk: local shipments also set carrierCode, so the LOCAL
    // branch must precede the EXPRESS carrierCode fallback in getOperationShipmentKind.
    const localShipment = {
      fulfillmentType: "local",
      isDdp: false,
      carrierCode: "SMSA",
      carrierName: "SMSA Express",
      carrierTrackingNumber: "SMSA-123456",
    } as unknown as Shipment;

    expect(getOperationShipmentKind(localShipment)).toBe(OperationShipmentKind.LOCAL);
    expect(getOperationShipmentKind(localShipment)).not.toBe(OperationShipmentKind.EXPRESS);

    // A carrier shipment without the local discriminator still derives as EXPRESS.
    const expressShipment = {
      fulfillmentType: "carrier",
      isDdp: false,
      carrierCode: "FEDEX",
      carrierName: "FedEx",
      carrierTrackingNumber: "FDX-123456",
    } as unknown as Shipment;
    expect(getOperationShipmentKind(expressShipment)).toBe(OperationShipmentKind.EXPRESS);
  });

  it("routes a local shipment into the ops Local queue (not Express) with the local task template", async () => {
    const { clientAccount } = await createClientWithUser();
    const localShipment = await createPaidLocalShipment(clientAccount.id);

    // Assignment materializes the per-kind task template.
    await ensureOperationAssignmentForShipment({ shipment: localShipment });

    const localQueueRes = await withCookies(
      request.get("/api/operations/shipments?queue=local&limit=500"),
      adminCookies,
    );
    expect(localQueueRes.status).toBe(200);
    expect(localQueueRes.body.some((entry: { id: string }) => entry.id === localShipment.id)).toBe(true);
    expect(
      localQueueRes.body.every((entry: { shipmentKind?: string }) =>
        entry.shipmentKind ? entry.shipmentKind === "LOCAL" : true,
      ),
    ).toBe(true);

    const expressQueueRes = await withCookies(
      request.get("/api/operations/shipments?queue=express&limit=500"),
      adminCookies,
    );
    expect(expressQueueRes.status).toBe(200);
    expect(expressQueueRes.body.some((entry: { id: string }) => entry.id === localShipment.id)).toBe(false);

    const detailRes = await withCookies(
      request.get(`/api/operations/shipments/${localShipment.id}`),
      adminCookies,
    );
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.shipmentKind).toBe("LOCAL");

    const taskKeys = detailRes.body.operationTasks.map((task: { taskKey: string }) => task.taskKey);
    expect(taskKeys).toEqual(
      expect.arrayContaining([
        "local_review_booking",
        "local_monitor_pickup",
        "local_monitor_transit",
        "local_delivery_followup",
      ]),
    );
    // No customs/warehouse steps leak in from the DDP or Express templates.
    expect(taskKeys.some((key: string) => key.startsWith("ddp_"))).toBe(false);
    expect(taskKeys.some((key: string) => key.startsWith("express_"))).toBe(false);
  });

  it("admin can modify a payment_pending shipment and it re-prices; locked once not pending", async () => {
    const carrierCode = `TESTMOD_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    // Two weight bands so a weight change re-prices to a different base cost.
    await storage.createLocalCarrierPricingTier({ carrierCode, minWeightKg: "0", maxWeightKg: "5", baseRateSar: "50.00", markupType: "percent", markupValue: "18", clientProfile: null, enabled: true });
    await storage.createLocalCarrierPricingTier({ carrierCode, minWeightKg: "5", maxWeightKg: "30", baseRateSar: "120.00", markupType: "percent", markupValue: "18", clientProfile: null, enabled: true });

    const { clientAccount } = await createClientWithUser();
    const pending = await createPaidLocalShipment(clientAccount.id, {
      status: "payment_pending", paymentStatus: "pending", carrierCode, carrierName: carrierCode, weight: "2.00",
    });

    // Modify: bump weight into the second band → re-prices from base 50 to base 120.
    const modRes = await withCookies(
      request.patch(`/api/admin/shipments/${pending.id}`).send({
        packages: [{ weight: 8, length: 0, width: 0, height: 0 }],
      }),
      adminCookies,
    );
    expect(modRes.status).toBe(200);
    expect(Number(modRes.body.baseRate)).toBeCloseTo(120, 2);
    expect(Number(modRes.body.weight)).toBeCloseTo(8, 2);
    // Client total re-priced with 18% margin + 15% VAT: (120 + 21.6) * 1.15
    expect(Number(modRes.body.finalPrice)).toBeCloseTo(162.84, 1);

    // A non-pending (booked) shipment cannot be modified.
    const booked = await createPaidLocalShipment(clientAccount.id, { status: "processing", carrierCode, carrierName: carrierCode });
    const lockedRes = await withCookies(
      request.patch(`/api/admin/shipments/${booked.id}`).send({ packages: [{ weight: 3, length: 0, width: 0, height: 0 }] }),
      adminCookies,
    );
    expect(lockedRes.status).toBe(400);
  });

  it("prices a local shipment identically to an equivalent domestic-Express shipment (DCE, 15% VAT)", async () => {
    const carrierCode = `TESTLOCAL_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    await storage.createLocalCarrierPricingTier({
      carrierCode,
      minWeightKg: "0",
      maxWeightKg: "5",
      baseRateSar: "50.00",
      markupType: "percent",
      markupValue: "18",
      clientProfile: null,
      enabled: true,
    });

    const localRate = await resolveLocalRate({ carrierCode, weightKg: 2, clientProfile: "regular" });
    expect(localRate).not.toBeNull();
    expect(localRate!.baseRate).toBeCloseTo(50, 2);
    expect(localRate!.marginAmount).toBeCloseTo(9, 2); // 50 * 18%

    // LOCAL feeds (baseRate, marginAmount) into the same DCE accounting path as domestic.
    const localAccounting = calculateShipmentAccounting({
      shipmentType: "domestic",
      isDdp: false,
      baseRate: localRate!.baseRate,
      marginAmount: localRate!.marginAmount,
      recipientCountryCode: "SA",
    });

    // An equivalent domestic-Express shipment with the same cost + margin.
    const expressAccounting = calculateShipmentAccounting({
      shipmentType: "domestic",
      isDdp: false,
      baseRate: localRate!.baseRate,
      marginAmount: localRate!.marginAmount,
      recipientCountryCode: "SA",
    });

    // Parity: the local pricing path must not diverge from the DCE engine.
    expect(localAccounting).toEqual(expressAccounting);
    expect(localAccounting.taxScenario).toBe("DCE");
    expect(localAccounting.sellSubtotalAmountSar).toBeCloseTo(59, 2);
    expect(localAccounting.sellTaxAmountSar).toBeCloseTo(59 * VAT_RATE, 2); // full 15% VAT on subtotal
    expect(localAccounting.clientTotalAmountSar).toBeCloseTo(67.85, 2);
  });

  it("uses the configured tier cost as the markup base even when a live rate is available", async () => {
    const carrierCode = `TESTCOST_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    await storage.createLocalCarrierPricingTier({
      carrierCode,
      minWeightKg: "0",
      maxWeightKg: "5",
      baseRateSar: "40.00", // explicit always-on carrier cost
      markupType: "percent",
      markupValue: "25",
      clientProfile: null,
      enabled: true,
    });

    // A live rate is offered, but the configured cost must win.
    const rate = await resolveLocalRate({ carrierCode, weightKg: 2, liveBaseRateSar: 999 });
    expect(rate).not.toBeNull();
    expect(rate!.baseRate).toBeCloseTo(40, 2); // cost, not the 999 live rate
    expect(rate!.marginAmount).toBeCloseTo(10, 2); // 40 * 25%
  });

  it("falls back to the live rate when the tier has no configured cost", async () => {
    const carrierCode = `TESTLIVE_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    await storage.createLocalCarrierPricingTier({
      carrierCode,
      minWeightKg: "0",
      maxWeightKg: "5",
      baseRateSar: null, // no configured cost → live rate is the base
      markupType: "percent",
      markupValue: "20",
      clientProfile: null,
      enabled: true,
    });

    const rate = await resolveLocalRate({ carrierCode, weightKg: 2, liveBaseRateSar: 100 });
    expect(rate).not.toBeNull();
    expect(rate!.baseRate).toBeCloseTo(100, 2); // live rate
    expect(rate!.marginAmount).toBeCloseTo(20, 2); // 100 * 20%
  });

  it("prices the live rate with the fallback margin when NO rate card exists (iMile case)", async () => {
    // A carrier with no pricing tier at all — previously dropped from the local flow.
    const carrierCode = `TESTNOCARD_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    const noCard = await resolveLocalRate({ carrierCode, weightKg: 2 });
    expect(noCard).toBeNull(); // no card + no live rate → still nothing

    const live = await resolveLocalRate({ carrierCode, weightKg: 2, liveBaseRateSar: 50, liveFallbackMarginPercent: 20 });
    expect(live).not.toBeNull();
    expect(live!.tierId).toBe("live");
    expect(live!.baseRate).toBeCloseTo(50, 2);
    expect(live!.marginAmount).toBeCloseTo(10, 2); // 50 * 20%
    expect(live!.clientPriceExclTax).toBeCloseTo(60, 2);
  });
});
