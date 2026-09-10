import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import {
  ensureOperationProfile,
  getOperationShipmentDetail,
  getOperationShipmentKind,
  OPERATION_ROLE_NAMES,
} from "../server/services/operations";
import { dangerousGoodsMissingFields, buildCarrierHandoverText } from "../server/services/dangerous-goods-manual";
import { flagExpiredDangerousGoodsQuotes } from "../server/services/dangerous-goods-quote-expiry";
import { LocalStorageService } from "../server/integrations/storage/localStorage";
import { shouldRefreshShipment } from "../server/services/express-tracking-refresh";
import { DangerousGoodsShipmentStatus, DG_MANUAL_FULFILLMENT_TYPE } from "../shared/dangerous-goods";
import { OperationShipmentKind } from "../shared/domain";
import type { Shipment } from "../shared/schema";

// A dangerous goods shipment is arranged with the carrier by email, so it arrives with no
// price at all. Everything below guards one of the four ways that quietly goes wrong:
// an unpriced shipment that operations cannot see, a declaration tendered incomplete, a
// client re-pricing a figure a person negotiated, and a paid shipment booked a second time.

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;

const TEST_PASSWORD = "DangerousGoodsManual123!";
const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);

let opsCookies: string[] = [];
let opsUser: Awaited<ReturnType<typeof storage.createUser>>;

const declaration = {
  regulation: "IATA",
  contentKind: "FULLY_REGULATED",
  accessibility: "INACCESSIBLE",
  offeror: "ACME Chemicals",
  emergencyContact: { name: "Ops desk", phone: "+966500000000" },
  signatory: { name: "Malek Fouda", title: "Compliance", place: "Jeddah" },
  packages: [{
    packageIndex: 0,
    commodities: [{
      unNumber: "UN1993",
      properShippingName: "Flammable liquid, n.o.s.",
      technicalName: "Acetone, Propan-2-ol",
      hazardClass: "3",
      packingGroup: "II",
      packingInstruction: "353",
      quantity: { amount: 5, units: "L", quantityType: "NET" },
    }],
  }],
};

const submitBody = {
  shipmentType: "outbound",
  shipper: {
    name: "ACME Chemicals",
    phone: "966555123456",
    countryCode: "SA",
    city: "Jeddah",
    postalCode: "23442",
    addressLine1: "King Abdulaziz Road",
  },
  recipient: {
    name: "Gulf Distribution",
    phone: "971555987654",
    countryCode: "AE",
    city: "Dubai",
    addressLine1: "Sheikh Zayed Road",
  },
  packages: [{ weight: 12, length: 40, width: 30, height: 25 }],
  weightUnit: "KG",
  dimensionUnit: "CM",
  packageType: "YOUR_PACKAGING",
  currency: "SAR",
  dangerousGoods: declaration,
  items: [{
    itemName: "Industrial cleaning solvent",
    category: "Chemicals",
    countryOfOrigin: "SA",
    hsCode: "340290",
    price: 4200,
    quantity: 1,
  }],
};

async function createClientWithUser(dangerousGoodsEnabled = true) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `DG Manual ${unique}`,
    email: `dgm_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    isActive: true,
    dangerousGoodsEnabled,
  } as any);

  const clientUser = await storage.createUser({
    username: `dgm_client_${unique}`,
    email: `dgm_client_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });

  const login = await request.post("/api/auth/login").send({ username: clientUser.username, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  return { clientAccount, clientUser, cookies: (login.headers["set-cookie"] || []) as string[] };
}

async function submitDangerousGoodsShipment(overrides: Record<string, unknown> = {}) {
  const { clientAccount, cookies } = await createClientWithUser(true);
  const res = await withCookies(
    request.post("/api/client/shipments/dangerous-goods").send({ ...submitBody, ...overrides }),
    cookies,
  );
  expect(res.status).toBe(201);
  const shipment = await storage.getShipment(res.body.shipmentId);
  return { clientAccount, cookies, shipment: shipment!, body: res.body };
}

/**
 * A dangerous goods shipment written straight to the database.
 *
 * Used where the point is a state the wizard cannot produce — an incomplete declaration that
 * an operator has to finish before any carrier will look at it.
 */
async function createRawDangerousGoodsShipment(clientAccountId: string, overrides: Record<string, unknown> = {}) {
  return storage.createShipment({
    clientAccountId,
    senderName: "ACME Chemicals",
    senderAddress: "King Abdulaziz Road",
    senderCity: "Jeddah",
    senderPostalCode: "23442",
    senderCountry: "SA",
    senderPhone: "966555123456",
    recipientName: "Gulf Distribution",
    recipientAddress: "Sheikh Zayed Road",
    recipientCity: "Dubai",
    recipientCountry: "AE",
    recipientPhone: "971555987654",
    weight: "12.00",
    weightUnit: "KG",
    dimensionUnit: "CM",
    packageType: "YOUR_PACKAGING",
    numberOfPackages: 1,
    packagesData: JSON.stringify([{ weight: 12, length: 40, width: 30, height: 25 }]),
    itemsData: JSON.stringify([{ itemName: "Solvent", category: "Chemicals", countryOfOrigin: "SA", price: 4200, quantity: 1 }]),
    shipmentType: "outbound",
    fulfillmentType: DG_MANUAL_FULFILLMENT_TYPE,
    status: DangerousGoodsShipmentStatus.REVIEW,
    carrierStatus: DangerousGoodsShipmentStatus.REVIEW,
    baseRate: "0.00",
    marginAmount: "0.00",
    margin: "0.00",
    finalPrice: "0.00",
    currency: "SAR",
    paymentStatus: "unpaid",
    hasDangerousGoods: true,
    dangerousGoodsStatus: "pending_review",
    dangerousGoodsRegulation: "IATA",
    dangerousGoodsData: JSON.stringify(declaration),
    dgPreferredPickupDate: "2026-09-08",
    ...overrides,
  } as any);
}

/** Carry a submitted shipment through review and handover to the awaiting-carrier state. */
async function handOverToCarrier(shipmentId: string) {
  const res = await withCookies(
    request.post(`/api/operations/shipments/${shipmentId}/dangerous-goods/handover`).send({ carrierCode: "DHL" }),
    opsCookies,
  );
  expect(res.status).toBe(200);
  return res;
}

/** Take a quoted shipment all the way through payment, exactly as the browser does. */
async function payForShipment(shipmentId: string, cookies: string[]) {
  const pay = await withCookies(
    request.post("/api/client/shipments/pay").send({ shipmentId }),
    cookies,
  );
  expect(pay.status).toBe(200);

  const confirm = await withCookies(
    request.post("/api/client/shipments/confirm").send({
      shipmentId,
      paymentIntentId: pay.body.paymentId,
    }),
    cookies,
  );
  expect(confirm.status).toBe(200);

  return (await storage.getShipment(shipmentId))!;
}

async function quoteShipment(shipmentId: string, overrides: Record<string, unknown> = {}) {
  return withCookies(
    request.post(`/api/operations/shipments/${shipmentId}/dangerous-goods/quote`).send({
      carrierCode: "DHL",
      carrierName: "DHL Express",
      carrierCostSar: 1200,
      ...overrides,
    }),
    opsCookies,
  );
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);

  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const role = (await storage.getRoles()).find((candidate) => candidate.name === OPERATION_ROLE_NAMES.manager);
  if (!role) throw new Error("Missing operations manager role");
  opsUser = await storage.createUser({
    username: `dgm_ops_${unique}`,
    email: `dgm_ops_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "operations",
    isActive: true,
    mustChangePassword: false,
  });
  await storage.assignUserRole({ userId: opsUser.id, roleId: role.id });
  await ensureOperationProfile(opsUser.id, "manager");
  const opsLogin = await request.post("/api/auth/login").send({ username: opsUser.username, password: TEST_PASSWORD });
  expect(opsLogin.status).toBe(200);
  opsCookies = (opsLogin.headers["set-cookie"] || []) as string[];
}, 60000);

afterAll(() => {
  server.close();
});

describe("submitting a dangerous goods shipment", () => {
  it("stores it unpriced, in review, and not tendered to any carrier", async () => {
    const { shipment } = await submitDangerousGoodsShipment();

    expect(shipment.fulfillmentType).toBe(DG_MANUAL_FULFILLMENT_TYPE);
    expect(shipment.status).toBe(DangerousGoodsShipmentStatus.REVIEW);
    // Zero rather than null: the price columns are NOT NULL, so "not yet priced" has to be
    // carried by the status.
    expect(Number(shipment.finalPrice)).toBe(0);
    expect(Number(shipment.baseRate)).toBe(0);
    expect(shipment.carrierTrackingNumber).toBeNull();
    expect(shipment.hasDangerousGoods).toBe(true);
    // No collection date at submission: only the carrier knows when they can collect, and
    // they have not been asked yet.
    expect(shipment.dgPreferredPickupDate).toBeNull();
  });

  it("creates it as unpaid, not pending — otherwise operations never sees it", async () => {
    // OPERATION_ACTIVE_PAYMENT_STATUSES is {paid, unpaid}. "pending" is the value every other
    // unpaid shipment carries, and using it here builds the whole feature into a queue nobody
    // can open.
    const { shipment } = await submitDangerousGoodsShipment();
    expect(shipment.paymentStatus).toBe("unpaid");
  });

  it("actually appears in the operations dangerous goods queue", async () => {
    const { shipment } = await submitDangerousGoodsShipment();

    const res = await withCookies(
      request.get("/api/operations/shipments?queue=dangerous_goods&limit=200"),
      opsCookies,
    );
    expect(res.status).toBe(200);
    const found = (res.body as Array<{ id: string; shipmentKind: string }>).find((row) => row.id === shipment.id);
    expect(found).toBeDefined();
    expect(found!.shipmentKind).toBe(OperationShipmentKind.DANGEROUS_GOODS);
  });

  it("refuses a client who has not been approved for dangerous goods", async () => {
    const { cookies } = await createClientWithUser(false);
    const res = await withCookies(request.post("/api/client/shipments/dangerous-goods").send(submitBody), cookies);
    expect(res.status).toBe(403);
  });

  it("does not demand a postal code for a country that has none", async () => {
    // The recipient above is in the UAE, which uses no postal codes. Insisting on one is how
    // "00000" reached FedEx on a Lebanese address and the collection failed for three days.
    const { shipment } = await submitDangerousGoodsShipment();
    expect(shipment.recipientPostalCode).toBeNull();
  });
});

describe("the outstanding-details gate", () => {
  it("accepts a bare content kind with nothing else filled in", async () => {
    // This is the normal case now, not an edge one. A client picks what they are shipping and
    // uploads a safety data sheet; they are never shown an IATA form. Everything a declaration
    // needs beyond that is operations' job, so submission must not demand it.
    const { clientAccount, cookies } = await createClientWithUser(true);
    const res = await withCookies(
      request.post("/api/client/shipments/dangerous-goods").send({
        ...submitBody,
        dangerousGoods: {
          regulation: "IATA",
          contentKind: "FULLY_REGULATED",
          packages: [{ packageIndex: 0, commodities: [{}] }],
        },
      }),
      cookies,
    );
    expect(res.status).toBe(201);
    void clientAccount;

    // Accepted, but every gap is named and the carrier handover is blocked.
    const shipment = (await storage.getShipment(res.body.shipmentId))!;
    const handover = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/handover`).send({ carrierCode: "DHL" }),
      opsCookies,
    );
    expect(handover.status).toBe(400);
    const fields = (handover.body.missingFields as Array<{ field: string }>).map((entry) => entry.field);
    expect(fields).toContain("declaration.accessibility");
    expect(fields).toContain("declaration.offeror");
    expect(fields).toContain("declaration.emergencyContact");
    expect(fields).toContain("declaration.signatory");
    expect(fields.some((field) => field.endsWith(".unNumber"))).toBe(true);
    expect(fields.some((field) => field.endsWith(".quantity"))).toBe(true);
  });

  it("catches an n.o.s. entry with no technical name at the handover, not at submission", async () => {
    // A generic "not otherwise specified" shipping name is a category, not a substance. The
    // client is no longer asked to notice that — the operator is, before the carrier sees it.
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id, {
      dangerousGoodsData: JSON.stringify({
        ...declaration,
        packages: [{
          packageIndex: 0,
          commodities: [{ ...declaration.packages[0].commodities[0], technicalName: undefined }],
        }],
      }),
    });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/handover`).send({ carrierCode: "DHL" }),
      opsCookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.missingFields.some((entry: any) => entry.field.endsWith("technicalName"))).toBe(true);
  });

  it("refuses the handover while anything is still missing", async () => {
    // Built directly rather than through the wizard, because the gate exists precisely for
    // shipments the wizard did not validate — legacy rows, imports, and anything an operator
    // has since edited. A consignee with no phone is refused by every carrier for DG.
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id, { recipientPhone: "" });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/handover`).send({ carrierCode: "DHL" }),
      opsCookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.missingFields.some((entry: any) => entry.field === "recipient.phone")).toBe(true);
    expect((await storage.getShipment(shipment.id))!.status).toBe(DangerousGoodsShipmentStatus.REVIEW);
  });

  it("lets operations fill the gap and then hand over", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id, { recipientPhone: "" });

    const patch = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/dangerous-goods`).send({
        recipient: { phone: "971555987654" },
      }),
      opsCookies,
    );
    expect(patch.status).toBe(200);
    expect(patch.body.missingFields).toHaveLength(0);

    await handOverToCarrier(shipment.id);
    const updated = await storage.getShipment(shipment.id);
    expect(updated!.status).toBe(DangerousGoodsShipmentStatus.AWAITING_CARRIER);
    expect(updated!.dgHandoverAt).toBeTruthy();
  });

  it("locks the declaration once it has been sent to the carrier", async () => {
    // What we emailed and what we hold must not drift apart.
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);

    const res = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/dangerous-goods`).send({ declaration }),
      opsCookies,
    );
    expect(res.status).toBe(400);
  });

  it("derives the total weight from the packages rather than trusting two figures", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    const res = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/dangerous-goods`).send({
        packages: [{ weight: 7, length: 40, width: 30, height: 25 }, { weight: 3, length: 20, width: 20, height: 20 }],
      }),
      opsCookies,
    );
    expect(res.status).toBe(200);
    const updated = await storage.getShipment(shipment.id);
    expect(Number(updated!.weight)).toBe(10);
    expect(updated!.numberOfPackages).toBe(2);
  });
});

describe("entering the carrier's quotation", () => {
  it("refuses a quote before the declaration has been sent to the carrier", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    const res = await quoteShipment(shipment.id);
    expect(res.status).toBe(400);
  });

  it("prices the carrier cost through the client's profile without booking anything", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);

    const res = await quoteShipment(shipment.id, { carrierCostSar: 1200 });
    expect(res.status).toBe(200);

    const quoted = await storage.getShipment(shipment.id);
    expect(quoted!.status).toBe("payment_pending");
    expect(quoted!.isQuote).toBe(true);
    // No air waybill yet. Ezhalha does not commit a consignment it has not been paid for, so
    // a quote that lapses leaves nothing to unwind with the carrier.
    expect(quoted!.carrierTrackingNumber).toBeNull();
    expect(Number(quoted!.dgCarrierCostSar)).toBe(1200);
    expect(Number(quoted!.baseRate)).toBe(1200);
    // A margin was applied, so the client pays more than the carrier charged us.
    expect(Number(quoted!.finalPrice)).toBeGreaterThan(1200);
    expect(quoted!.dgQuoteExpiresAt).toBeTruthy();
  });

  it("keeps the shipment visible to operations while the client decides", async () => {
    // The air waybill exists from the moment it is quoted, so someone has to unwind it by
    // hand if the client never pays. A shipment nobody can see is a shipment nobody unwinds.
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const quoted = await storage.getShipment(shipment.id);
    expect(quoted!.paymentStatus).toBe("unpaid");

    const res = await withCookies(request.get("/api/operations/shipments?queue=dangerous_goods&limit=200"), opsCookies);
    expect((res.body as Array<{ id: string }>).some((row) => row.id === shipment.id)).toBe(true);
  });

  it("honours an operator's override of the final total", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);

    const res = await quoteShipment(shipment.id, { carrierCostSar: 1200, finalTotalOverrideSar: 1500 });
    expect(res.status).toBe(200);
    const quoted = await storage.getShipment(shipment.id);
    expect(Number(quoted!.finalPrice)).toBeCloseTo(1500, 1);
  });

  it("refuses a validity date in the past", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    const res = await quoteShipment(shipment.id, { validUntil: new Date(Date.now() - 86400000).toISOString() });
    expect(res.status).toBe(400);
  });
});

describe("what the client can and cannot do with the quotation", () => {
  it("refuses to re-price a dangerous goods quotation", async () => {
    // The price came out of an email thread against an air waybill that already exists. A
    // rate-card re-price would replace it with a figure no carrier ever offered.
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const res = await withCookies(
      request.patch(`/api/client/quotations/${shipment.id}`).send({
        packages: [{ weight: 20, length: 40, width: 30, height: 25 }],
      }),
      cookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be edited/i);
  });

  it("refuses payment until the declaration is re-confirmed", async () => {
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const res = await withCookies(
      request.post("/api/client/shipments/pay").send({ shipmentId: shipment.id, tapTokenId: "tok_test" }),
      cookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirm the dangerous goods declaration/i);
  });

  it("refuses payment once the quote has expired", async () => {
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const confirm = await withCookies(
      request.post(`/api/client/quotations/${shipment.id}/confirm-declaration`).send({ declarationConfirmed: true }),
      cookies,
    );
    expect(confirm.status).toBe(200);

    await storage.updateShipment(shipment.id, { dgQuoteExpiresAt: new Date(Date.now() - 86400000) });

    const res = await withCookies(
      request.post("/api/client/shipments/pay").send({ shipmentId: shipment.id, tapTokenId: "tok_test" }),
      cookies,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("lets the client decline, and flags the booking an operator has to unwind", async () => {
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const res = await withCookies(
      request.post(`/api/client/quotations/${shipment.id}/decline`).send({ reason: "Too expensive" }),
      cookies,
    );
    expect(res.status).toBe(200);

    const declined = await storage.getShipment(shipment.id);
    expect(declined!.status).toBe("cancelled");
    expect(declined!.dgDeclinedAt).toBeTruthy();
    expect(declined!.dgDeclineReason).toBe("Too expensive");

    const flags = await storage.getShipmentAttentionFlags?.(shipment.id);
    if (flags) {
      expect(flags.some((flag: any) => flag.issueType === "dangerous_goods_booking_to_unwind")).toBe(true);
    }
  });
});

/** Quote, confirm the declaration and pay, leaving the shipment waiting to be booked. */
async function payQuotedShipment(shipmentId: string, cookies: string[], quoteOverrides: Record<string, unknown> = {}) {
  await handOverToCarrier(shipmentId);
  await quoteShipment(shipmentId, quoteOverrides);
  await withCookies(
    request.post(`/api/client/quotations/${shipmentId}/confirm-declaration`).send({ declarationConfirmed: true }),
    cookies,
  );
  return payForShipment(shipmentId, cookies);
}

describe("paying for it", () => {
  it("does not tender the shipment to the carrier, and does not pretend it is booked", async () => {
    // Payment is what authorises the booking, not what performs it. A dangerous goods
    // consignment is accepted by a person in an email thread; if the normal express path ran
    // here it would issue a waybill through the API for goods the carrier never agreed to
    // carry. So payment parks the shipment for an operator and stops.
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    const paid = await payQuotedShipment(shipment.id, cookies);

    expect(paid!.paymentStatus).toBe("paid");
    expect(paid!.status).toBe(DangerousGoodsShipmentStatus.AWAITING_BOOKING);
    expect(paid!.carrierTrackingNumber).toBeNull();
    // Nothing to collect yet either — every carrier's pickup endpoint wants a waybill.
    expect(paid!.pickupRequested).toBeFalsy();
  });

  it("raises an attention flag so the paid shipment is not left sitting in a queue", async () => {
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await payQuotedShipment(shipment.id, cookies);

    const detail = await getOperationShipmentDetail(shipment.id, opsUser);
    expect(detail!.attentionFlags.some((flag) => flag.issueType === "dangerous_goods_awaiting_booking")).toBe(true);
  });

  it("refuses to record a waybill for a shipment nobody has paid for", async () => {
    // This gate is the whole point of the split: a waybill entered before payment is a
    // booking Ezhalha owns, has not been paid for, and must cancel by hand if the client
    // walks away.
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/booking`)
        .send({ carrierTrackingNumber: "2575108620" }),
      opsCookies,
    );
    expect(res.status).toBe(400);
    expect((await storage.getShipment(shipment.id))!.carrierTrackingNumber).toBeNull();
  });

  it("settles on credit without touching a carrier API", async () => {
    // Pay-later books carriers on its own path, not through finalizePaidShipmentAfterPayment.
    // Without an explicit branch it fell through to the express booking call and tried to
    // create a DHL shipment for goods DHL had only agreed to carry by email — which failed,
    // left the shipment in carrier_error, and issued the client a credit invoice anyway.
    const { shipment, cookies, clientAccount } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);
    await withCookies(
      request.post(`/api/client/quotations/${shipment.id}/confirm-declaration`).send({ declarationConfirmed: true }),
      cookies,
    );
    // `creditLimitSar` is the field the gate reads; a bare `creditLimit` is silently ignored.
    await storage.updateClientAccount(clientAccount.id, { creditEnabled: true, creditLimitSar: "100000" });

    const res = await withCookies(
      request.post(`/api/client/shipments/${shipment.id}/pay-later`).send({}),
      cookies,
    );
    expect(res.status).toBe(200);

    const settled = await storage.getShipment(shipment.id);
    expect(settled!.paymentStatus).toBe("paid");
    expect(settled!.status).toBe(DangerousGoodsShipmentStatus.AWAITING_BOOKING);
    expect(settled!.carrierTrackingNumber).toBeNull();
    expect(settled!.carrierErrorCode).toBeFalsy();
  });

  it("offers credit alongside the card on the quotation the client is sent", async () => {
    // The quotation page decides what to show from three values: `canPay` and the consent pair
    // on the quotation itself, and `creditEnabled` on the account. A dangerous goods quote is
    // the one flow where the client is sent to that page by an operator rather than arriving
    // from checkout, so this pins the payload it lands on — a card-only page means a client
    // with credit terms has to pay up front for the one shipment type they cannot self-serve.
    const { shipment, cookies, clientAccount } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);
    await storage.updateClientAccount(clientAccount.id, { creditEnabled: true, creditLimitSar: "100000" });

    await withCookies(
      request.post(`/api/client/quotations/${shipment.id}/confirm-declaration`).send({ declarationConfirmed: true }),
      cookies,
    );

    const quotation = await withCookies(request.get(`/api/client/quotations/${shipment.id}`), cookies);
    expect(quotation.status).toBe(200);
    expect(quotation.body.canPay).toBe(true);
    expect(quotation.body.requiresConsent).toBe(true);
    expect(quotation.body.consentAccepted).toBe(true);
    expect(quotation.body.creditEnabled).toBe(true);
    expect(quotation.body.creditAvailableSar).toBeGreaterThanOrEqual(quotation.body.pricing.clientTotalSar);

    const paid = await withCookies(request.post(`/api/client/shipments/${shipment.id}/pay-later`).send({}), cookies);
    expect(paid.status).toBe(200);
  });

  it("reports credit as unavailable rather than hiding it", async () => {
    // Two different "no": no credit terms at all, and terms whose remaining balance will not
    // cover this quote. The page can only tell the client which one it is if the quotation
    // says so — otherwise both render as a card-only page.
    const { shipment, cookies, clientAccount } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);

    const noTerms = await withCookies(request.get(`/api/client/quotations/${shipment.id}`), cookies);
    expect(noTerms.body.creditEnabled).toBe(false);
    expect(noTerms.body.creditAvailableSar).toBe(0);

    await storage.updateClientAccount(clientAccount.id, { creditEnabled: true, creditLimitSar: "10" });
    const shortBalance = await withCookies(request.get(`/api/client/quotations/${shipment.id}`), cookies);
    expect(shortBalance.body.creditEnabled).toBe(true);
    expect(shortBalance.body.creditAvailableSar).toBeLessThan(shortBalance.body.pricing.clientTotalSar);
  });

  it("goes live on the waybill and collection date the operator records after payment", async () => {
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await payQuotedShipment(shipment.id, cookies, { collectionDate: "2026-09-14" });

    const res = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/booking`)
        .send({ carrierTrackingNumber: "2575108620", carrierCode: "DHL" }),
      opsCookies,
    );
    expect(res.status).toBe(200);

    const booked = await storage.getShipment(shipment.id);
    expect(booked!.status).toBe("created");
    expect(booked!.carrierTrackingNumber).toBe("2575108620");
    // The pickup is booked now, and for the date the carrier gave — not one the client
    // guessed at weeks earlier.
    expect(booked!.pickupRequested).toBe(true);
    expect(booked!.dgPreferredPickupDate).toBe("2026-09-14");
    expect(booked!.pickupDate).toBeTruthy();

    const detail = await getOperationShipmentDetail(shipment.id, opsUser);
    expect(detail!.attentionFlags.some((flag) => flag.issueType === "dangerous_goods_awaiting_booking")).toBe(false);
  });
});

describe("an expired quotation", () => {
  it("is flagged for an operator and never auto-cancelled", async () => {
    // The booking to unwind lives in the carrier's system, not ours. Closing the shipment here
    // would tidy our records while leaving a live dangerous goods booking open in theirs.
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);
    await storage.updateShipment(shipment.id, { dgQuoteExpiresAt: new Date(Date.now() - 86400000) });

    const flagged = await flagExpiredDangerousGoodsQuotes();
    expect(flagged).toBeGreaterThan(0);

    const after = await storage.getShipment(shipment.id);
    expect(after!.status).toBe("payment_pending");
    expect(after!.dgQuoteExpiryFlaggedAt).toBeTruthy();
  });

  it("is flagged once, not once an hour forever", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);
    await storage.updateShipment(shipment.id, { dgQuoteExpiresAt: new Date(Date.now() - 86400000) });

    await flagExpiredDangerousGoodsQuotes();
    const stamped = await storage.getShipment(shipment.id);
    expect(stamped!.dgQuoteExpiryFlaggedAt).toBeTruthy();

    // A second sweep must not pick it up again.
    await flagExpiredDangerousGoodsQuotes();
    const after = await storage.getShipment(shipment.id);
    expect(after!.dgQuoteExpiryFlaggedAt!.getTime()).toBe(stamped!.dgQuoteExpiryFlaggedAt!.getTime());
  });
});

describe("a replayed Tap webhook", () => {
  it("does not drag a booked consignment back into the booking queue", async () => {
    // Tap re-delivers successful charges, sometimes days later, and payment finalization runs
    // again on every replay. Once an operator has recorded the air waybill the shipment is
    // physically moving; re-running the paid branch would set it back to dg_booking and ask a
    // second operator to book it again — two Shipper's Declarations for one consignment.
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await handOverToCarrier(shipment.id);
    await quoteShipment(shipment.id);
    await withCookies(
      request.post(`/api/client/quotations/${shipment.id}/confirm-declaration`).send({ declarationConfirmed: true }),
      cookies,
    );

    const pay = await withCookies(request.post("/api/client/shipments/pay").send({ shipmentId: shipment.id }), cookies);
    expect(pay.status).toBe(200);
    const chargeId = pay.body.paymentId;

    const paid = await storage.getShipment(shipment.id);
    expect(paid!.status).toBe(DangerousGoodsShipmentStatus.AWAITING_BOOKING);

    const booking = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/booking`)
        .send({ carrierTrackingNumber: "2575100001", carrierCode: "DHL" }),
      opsCookies,
    );
    expect(booking.status).toBe(200);

    // The same charge, delivered again.
    const replay = await request.post("/api/webhooks/tap").send({
      id: chargeId,
      object: "charge",
      status: "CAPTURED",
      amount: Number(paid!.finalPrice),
      currency: "SAR",
      transaction: { created: String(Date.now()) },
      metadata: { kind: "shipment", shipmentId: shipment.id, clientAccountId: shipment.clientAccountId },
    });
    expect(replay.status).toBe(200);

    const afterReplay = await storage.getShipment(shipment.id);
    expect(afterReplay!.status).toBe("created");
    expect(afterReplay!.carrierTrackingNumber).toBe("2575100001");

    // And no second "book this now" sitting on an operator's list for a shipment in transit.
    const detail = await getOperationShipmentDetail(shipment.id, opsUser);
    expect(detail!.attentionFlags.filter((flag) => flag.issueType === "dangerous_goods_awaiting_booking")).toHaveLength(0);
  });

  it("refuses to overwrite a waybill that is already recorded", async () => {
    // Two operators working the same shipment, or one double-submitting. Silently replacing
    // the waybill would leave a live booking with the carrier that nothing in our records
    // points at.
    const { shipment, cookies } = await submitDangerousGoodsShipment();
    await payQuotedShipment(shipment.id, cookies);

    const first = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/booking`)
        .send({ carrierTrackingNumber: "2575100002" }),
      opsCookies,
    );
    expect(first.status).toBe(200);

    const conflicting = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/booking`)
        .send({ carrierTrackingNumber: "9999999999" }),
      opsCookies,
    );
    expect(conflicting.status).toBe(409);
    expect((await storage.getShipment(shipment.id))!.carrierTrackingNumber).toBe("2575100002");

    // Re-submitting the same waybill is the retry it almost always is, not a conflict.
    const retry = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/dangerous-goods/booking`)
        .send({ carrierTrackingNumber: "2575100002" }),
      opsCookies,
    );
    expect(retry.status).toBe(200);
  });
});

describe("the safety data sheet", () => {
  it("can be downloaded by operations, under the name the client gave it", async () => {
    // An operator signs the Shipper's Declaration on Ezhalha's behalf, so they have to read
    // the sheet rather than trust the fields extracted from it. Before this the sheet was
    // listed by filename in the ops hub and could not be opened at all.
    const storageService = new LocalStorageService();
    const reserved = await storageService.reserveFile("acme-flammable.pdf");
    await storageService.writeFile(reserved.fileName, Buffer.from("%PDF-1.4 dangerous goods sheet"));

    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id, {
      dangerousGoodsDocumentsData: JSON.stringify([{
        fileName: "acme-flammable.pdf",
        objectPath: reserved.objectPath,
        contentType: "application/pdf",
        documentType: "SAFETY_DATA_SHEET",
      }]),
    });

    const res = await withCookies(
      request.get(`/api/operations/shipments/${shipment.id}/dangerous-goods/documents/0`),
      opsCookies,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    // The stored object is a UUID; without this header an operator saving the sheet for a
    // carrier ends up with a file nobody can identify.
    expect(res.headers["content-disposition"]).toContain('filename="acme-flammable.pdf"');
    expect(res.body.toString()).toContain("dangerous goods sheet");

    await storageService.cleanupFile(reserved.fileName);
  });

  it("answers 404 for an index that is not there", async () => {
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id);

    const res = await withCookies(
      request.get(`/api/operations/shipments/${shipment.id}/dangerous-goods/documents/4`),
      opsCookies,
    );
    expect(res.status).toBe(404);
  });

  it("says so plainly when the row exists but the bytes are gone", async () => {
    // A storage backend change or a file removed underneath us. The operator needs to know to
    // ask the client for the sheet again, not to see a 500.
    const { clientAccount } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id, {
      dangerousGoodsDocumentsData: JSON.stringify([{
        fileName: "vanished.pdf",
        objectPath: "/uploads/00000000-0000-0000-0000-000000000000.pdf",
        contentType: "application/pdf",
        documentType: "SAFETY_DATA_SHEET",
      }]),
    });

    const res = await withCookies(
      request.get(`/api/operations/shipments/${shipment.id}/dangerous-goods/documents/0`),
      opsCookies,
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("upload it again");
  });

  it("is not reachable by the client portal", async () => {
    const { clientAccount, cookies } = await createClientWithUser(true);
    const shipment = await createRawDangerousGoodsShipment(clientAccount.id);

    const res = await withCookies(
      request.get(`/api/operations/shipments/${shipment.id}/dangerous-goods/documents/0`),
      cookies,
    );
    expect(res.status).toBe(403);
  });
});

describe("classification", () => {
  it("is its own operations kind, not Express", async () => {
    // Once quoted, a DG shipment carries a carrierCode and an AWB. Without an explicit branch
    // the Express fallback would reclassify it mid-flow and move it out of the queue the
    // operator is working it in.
    const shipment = {
      fulfillmentType: DG_MANUAL_FULFILLMENT_TYPE,
      carrierCode: "DHL",
      carrierTrackingNumber: "2575108620",
    } as Shipment;
    expect(getOperationShipmentKind(shipment)).toBe(OperationShipmentKind.DANGEROUS_GOODS);
  });
});

describe("tracking after it ships", () => {
  it("keeps polling the carrier for a live dangerous goods shipment", async () => {
    // The refresh gate used to admit EXPRESS and nothing else. Adding a fourth kind without
    // touching it would freeze a paid DG shipment at "booked" forever, with the carrier
    // scanning it the whole time.
    const live = {
      fulfillmentType: DG_MANUAL_FULFILLMENT_TYPE,
      carrierCode: "DHL",
      carrierTrackingNumber: "2575108620",
      paymentStatus: "paid",
      status: "created",
    } as Shipment;
    expect(shouldRefreshShipment(live)).toBe(true);
  });

  it("does not poll one that has not been quoted yet", async () => {
    const unquoted = {
      fulfillmentType: DG_MANUAL_FULFILLMENT_TYPE,
      carrierCode: null,
      carrierTrackingNumber: null,
      paymentStatus: "unpaid",
      status: DangerousGoodsShipmentStatus.REVIEW,
    } as unknown as Shipment;
    expect(shouldRefreshShipment(unquoted)).toBe(false);
  });
});

describe("the handover text", () => {
  it("names the technical substance, not just the n.o.s. category", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    const text = buildCarrierHandoverText(shipment, declaration as any, []);
    expect(text).toContain("UN1993");
    expect(text).toContain("Acetone, Propan-2-ol");
    expect(text).toContain("Gulf Distribution");
    expect(text).toContain("the earliest");
  });

  it("reports nothing missing for a complete declaration", async () => {
    const { shipment } = await submitDangerousGoodsShipment();
    expect(dangerousGoodsMissingFields(shipment, declaration as any)).toHaveLength(0);
  });
});
