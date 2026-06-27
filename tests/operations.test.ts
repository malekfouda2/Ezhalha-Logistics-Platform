import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../server/routes";
import { calculateDdpPrice } from "../server/services/ddp-pricing";
import { storage } from "../server/storage";
import {
  createAttentionFlag,
  ensureOperationAssignmentForShipment,
  ensureOperationProfile,
  OPERATION_ROLE_NAMES,
  reassignOperationShipment,
  setOperationShipmentAssignments,
} from "../server/services/operations";
import { InvoiceType, type InsertShipment, User } from "../shared/schema";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: supertest.SuperTest<supertest.Test>;
let adminCookies: string[] = [];

const TEST_PASSWORD = "OperationsTest123!";

const withCookies = (test: supertest.Test, cookies: string[]) => test.set("Cookie", cookies);

async function loginAndGetCookies(username: string, password = TEST_PASSWORD): Promise<string[]> {
  const res = await request.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return res.headers["set-cookie"] || [];
}

async function createOperationsUser(level: keyof typeof OPERATION_ROLE_NAMES): Promise<User> {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const role = (await storage.getRoles()).find((candidate) => candidate.name === OPERATION_ROLE_NAMES[level]);
  if (!role) {
    throw new Error(`Missing operations role: ${OPERATION_ROLE_NAMES[level]}`);
  }

  const user = await storage.createUser({
    username: `ops_${level}_${unique}`,
    email: `ops_${level}_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "operations",
    isActive: true,
    mustChangePassword: false,
  });

  await storage.assignUserRole({ userId: user.id, roleId: role.id });
  await ensureOperationProfile(user.id, level);
  return user;
}

async function createClientWithUser() {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `Operations Client ${unique}`,
    email: `operations_client_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "Operations Test Co",
    isActive: true,
    shippingContactName: "Operations Contact",
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
    username: `operations_client_${unique}`,
    email: `operations_client_user_${unique}@test.com`,
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });

  return { clientAccount, clientUser };
}

async function createPaidExpressShipment(clientAccountId: string, overrides: Partial<InsertShipment> = {}) {
  return storage.createShipment({
    clientAccountId,
    senderName: "Origin Sender",
    senderAddress: "100 Export Way",
    senderCity: "Houston",
    senderCountry: "US",
    senderPhone: "15551234567",
    recipientName: "Saudi Recipient",
    recipientAddress: "2929, Raihana Bint Zaid Street",
    recipientCity: "Riyadh",
    recipientCountry: "SA",
    recipientPhone: "966555123456",
    weight: "2.00",
    weightUnit: "KG",
    packageType: "YOUR_PACKAGING",
    shipmentType: "outbound",
    fulfillmentType: "carrier",
    status: "created",
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "120.00",
    accountingCurrency: "SAR",
    costAmountSar: "100.00",
    sellSubtotalAmountSar: "120.00",
    clientTotalAmountSar: "120.00",
    systemCostTotalAmountSar: "100.00",
    revenueExcludingTaxAmountSar: "20.00",
    currency: "SAR",
    carrierCode: "FEDEX",
    carrierName: "FedEx",
    carrierTrackingNumber: `FDX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    paymentStatus: "paid",
    paymentMethod: "PAY_NOW",
    ...overrides,
  });
}

async function createPaidDdpShipment(clientAccountId: string) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lane = await storage.createDdpPricingLane({
    originCountryCode: "AE",
    destinationCountryCode: "SA",
    airBaseRatePerKg: "40.00",
    seaBaseRatePerCbm: "0.00",
    minimumBillableKg: "0.00",
    kgRoundingIncrement: "0.50",
    minimumBillableCbm: "0.00",
    cbmRoundingIncrement: "0.00",
    minimumShipmentCharge: "0.00",
    volumetricDivisor: "6000",
    currency: "SAR",
    isActive: true,
  });

  const pricingRule = await storage.getPricingRuleByProfile("regular");
  const basePricing = calculateDdpPrice({
    lane,
    transportMethod: "air",
    packages: [{ weight: 2 }],
    markupPercentage: 0,
  });
  const markupPercentage = pricingRule
    ? await storage.getDdpMarginForQuantity(pricingRule.id, basePricing.billingUnit, basePricing.billableQuantity)
    : 0;
  const pricing = calculateDdpPrice({
    lane,
    transportMethod: "air",
    packages: [{ weight: 2 }],
    markupPercentage,
  });

  const shipment = await storage.createShipment({
    clientAccountId,
    senderName: "DDP Supplier",
    senderAddress: "Pickup coordination required",
    senderCity: "Dubai",
    senderCountry: "AE",
    senderPhone: "971500000001",
    recipientName: "DDP Recipient",
    recipientAddress: "2929, Raihana Bint Zaid Street",
    recipientCity: "Riyadh",
    recipientCountry: "SA",
    recipientPhone: "966555123456",
    weight: "2.00",
    weightUnit: "KG",
    dimensionalWeight: pricing.dimensionalWeightKg.toFixed(3),
    chargeableWeight: pricing.billableQuantity.toFixed(3),
    chargeableWeightUnit: pricing.billingUnit,
    chargeableWeightDetails: JSON.stringify(pricing),
    packageType: "DDP_MANUAL",
    numberOfPackages: 1,
    packagesData: JSON.stringify([{ weight: 2 }]),
    shipmentType: "inbound",
    fulfillmentType: "ddp_manual",
    ddpPricingLaneId: lane.id,
    ddpTransportMethod: "air",
    ddpSupplierName: "DDP Supplier",
    ddpSupplierPhone: "971500000001",
    ddpTotalCbm: pricing.totalCbm.toFixed(4),
    ddpBillableQuantity: pricing.billableQuantity.toFixed(4),
    ddpBillingUnit: pricing.billingUnit,
    ddpRatePerUnitSar: pricing.ratePerUnitSar.toFixed(2),
    status: "awaiting_payment",
    baseRate: pricing.baseRateSar.toFixed(2),
    marginAmount: pricing.markupAmountSar.toFixed(2),
    margin: pricing.markupAmountSar.toFixed(2),
    finalPrice: pricing.totalAmountSar.toFixed(2),
    clientTotalAmountSar: pricing.totalAmountSar.toFixed(2),
    currency: "SAR",
    carrierCode: "DDP",
    carrierName: "DDP",
    paymentStatus: "paid",
  });

  return { lane, shipment, pricing, pricingRule };
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

describe("Operations Hub", () => {
  it("keeps delivered shipments visible in the delivered queue while excluding them from active queues", async () => {
    const beforeSummaryRes = await withCookies(request.get("/api/operations/summary"), adminCookies);
    expect(beforeSummaryRes.status).toBe(200);
    const beforeDeliveredCount = Number(beforeSummaryRes.body.deliveredCount || 0);

    const { clientAccount } = await createClientWithUser();
    const deliveredExpress = await createPaidExpressShipment(clientAccount.id, {
      status: "delivered",
      carrierStatus: "delivered",
    });
    const { shipment: deliveredDdp } = await createPaidDdpShipment(clientAccount.id);
    await storage.updateShipment(deliveredDdp.id, {
      status: "delivered",
      carrierStatus: "delivered",
    });

    const deliveredQueueRes = await withCookies(request.get("/api/operations/shipments?queue=delivered&limit=500"), adminCookies);
    expect(deliveredQueueRes.status).toBe(200);
    expect(deliveredQueueRes.body.some((shipment: { id: string }) => shipment.id === deliveredExpress.id)).toBe(true);
    expect(deliveredQueueRes.body.some((shipment: { id: string }) => shipment.id === deliveredDdp.id)).toBe(true);

    const ddpQueueRes = await withCookies(request.get("/api/operations/shipments?queue=ddp&limit=500"), adminCookies);
    expect(ddpQueueRes.status).toBe(200);
    expect(ddpQueueRes.body.some((shipment: { id: string }) => shipment.id === deliveredDdp.id)).toBe(false);

    const expressQueueRes = await withCookies(request.get("/api/operations/shipments?queue=express&limit=500"), adminCookies);
    expect(expressQueueRes.status).toBe(200);
    expect(expressQueueRes.body.some((shipment: { id: string }) => shipment.id === deliveredExpress.id)).toBe(false);

    const summaryRes = await withCookies(request.get("/api/operations/summary"), adminCookies);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.deliveredCount).toBeGreaterThanOrEqual(beforeDeliveredCount + 2);
  });

  it("assigns paid shipments, scopes agent visibility, and hides financials from operations users", async () => {
    const agentA = await createOperationsUser("agent");
    const agentB = await createOperationsUser("agent");
    const { clientAccount } = await createClientWithUser();

    const firstShipment = await createPaidExpressShipment(clientAccount.id);
    const secondShipment = await createPaidExpressShipment(clientAccount.id);
    const firstAssignment = await ensureOperationAssignmentForShipment({ shipment: firstShipment });
    const secondAssignment = await ensureOperationAssignmentForShipment({ shipment: secondShipment });

    expect(firstAssignment?.assignedToUserId).toBeTruthy();
    expect(secondAssignment?.assignedToUserId).toBeTruthy();

    await setOperationShipmentAssignments({
      shipmentId: secondShipment.id,
      assignedToUserIds: [agentA.id, agentB.id],
      reason: "Regression test shared team",
    });
    await reassignOperationShipment({
      shipmentId: firstShipment.id,
      assignedToUserId: agentB.id,
      reason: "Regression test hidden shipment",
    });

    const agentCookies = await loginAndGetCookies(agentA.username);

    const accessRes = await withCookies(request.get("/api/operations/me/access"), agentCookies);
    expect(accessRes.status).toBe(200);
    expect(accessRes.body.scope).toBe("agent");
    expect(accessRes.body.canViewFinancialBreakdown).toBe(false);

    const queueRes = await withCookies(request.get("/api/operations/shipments?queue=express"), agentCookies);
    expect(queueRes.status).toBe(200);
    const visibleIds = queueRes.body.map((shipment: any) => shipment.id);
    expect(visibleIds).toContain(secondShipment.id);
    expect(visibleIds).not.toContain(firstShipment.id);

    const forbiddenDetailRes = await withCookies(request.get(`/api/operations/shipments/${firstShipment.id}`), agentCookies);
    expect(forbiddenDetailRes.status).toBe(404);

    const agentDetailRes = await withCookies(request.get(`/api/operations/shipments/${secondShipment.id}`), agentCookies);
    expect(agentDetailRes.status).toBe(200);
    expect(agentDetailRes.body.financialBreakdown).toBeUndefined();
    expect(agentDetailRes.body.operationTasks.length).toBeGreaterThan(0);
    expect(agentDetailRes.body.assignedTeam.map((member: any) => member.userId)).toEqual([agentA.id, agentB.id]);

    const adminDetailRes = await withCookies(request.get(`/api/operations/shipments/${secondShipment.id}`), adminCookies);
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.financialBreakdown).toBeDefined();

    const secondAgentCookies = await loginAndGetCookies(agentB.username);
    const secondAgentQueueRes = await withCookies(request.get("/api/operations/shipments?queue=express"), secondAgentCookies);
    expect(secondAgentQueueRes.status).toBe(200);
    const secondAgentVisibleIds = secondAgentQueueRes.body.map((entry: any) => entry.id);
    expect(secondAgentVisibleIds).toContain(firstShipment.id);
    expect(secondAgentVisibleIds).toContain(secondShipment.id);
  });

  it("creates notes, mentions, client milestones, task completions, and special handling records", async () => {
    const agentA = await createOperationsUser("agent");
    const agentB = await createOperationsUser("agent");
    const agentC = await createOperationsUser("agent");
    const { clientAccount, clientUser } = await createClientWithUser();
    const shipment = await createPaidExpressShipment(clientAccount.id);

    await ensureOperationAssignmentForShipment({ shipment });
    await setOperationShipmentAssignments({
      shipmentId: shipment.id,
      assignedToUserIds: [agentA.id, agentB.id],
      reason: "Regression test team",
    });

    const agentCookies = await loginAndGetCookies(agentA.username);
    const mentionedAgentCookies = await loginAndGetCookies(agentB.username);
    const unassignedAgentCookies = await loginAndGetCookies(agentC.username);
    const clientCookies = await loginAndGetCookies(clientUser.username);

    const detailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), agentCookies);
    expect(detailRes.status).toBe(200);
    const firstTask = detailRes.body.operationTasks[0];

    const taskRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${firstTask.id}/complete`),
      agentCookies,
    );
    expect(taskRes.status).toBe(200);
    expect(taskRes.body.task.status).toBe("COMPLETED");

    const noteRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/notes`).send({
        body: `Please review this shipment @${agentB.username}`,
        visibility: "INTERNAL",
        mentionUserIds: [agentB.id],
      }),
      agentCookies,
    );
    expect(noteRes.status).toBe(201);

    const invalidMentionRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/notes`).send({
        body: `Looping in @${agentC.username}`,
        visibility: "INTERNAL",
        mentionUserIds: [agentC.id],
      }),
      agentCookies,
    );
    expect(invalidMentionRes.status).toBe(400);

    const mentionedNotificationsRes = await withCookies(request.get("/api/notifications"), mentionedAgentCookies);
    expect(mentionedNotificationsRes.status).toBe(200);
    expect(
      mentionedNotificationsRes.body.some(
        (notification: any) => notification.type === "mention" && notification.entityId === shipment.id,
      ),
    ).toBe(true);

    const unassignedNotificationsRes = await withCookies(request.get("/api/notifications"), unassignedAgentCookies);
    expect(unassignedNotificationsRes.status).toBe(200);
    expect(
      unassignedNotificationsRes.body.some(
        (notification: any) => notification.type === "mention" && notification.entityId === shipment.id,
      ),
    ).toBe(false);

    const statusRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "in_transit",
        notifyClient: true,
      }),
      agentCookies,
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.shipment.status).toBe("in_transit");

    const clientNotificationsRes = await withCookies(request.get("/api/notifications"), clientCookies);
    expect(clientNotificationsRes.status).toBe(200);
    expect(
      clientNotificationsRes.body.some(
        (notification: any) => notification.type === "shipment_milestone" && notification.entityId === shipment.id,
      ),
    ).toBe(true);

    const forbiddenSpecialRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/special-handling`).send({
        priority: "high",
        reason: "Agent should not be allowed to create special handling",
      }),
      agentCookies,
    );
    expect(forbiddenSpecialRes.status).toBe(403);

    const specialRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/special-handling`).send({
        priority: "high",
        reason: "Sensitive delivery window",
        assignedToUserId: agentA.id,
      }),
      adminCookies,
    );
    expect(specialRes.status).toBe(200);
    expect(specialRes.body.specialHandling.priority).toBe("high");

    const specialQueueRes = await withCookies(request.get("/api/operations/shipments?queue=special"), adminCookies);
    expect(specialQueueRes.status).toBe(200);
    expect(specialQueueRes.body.map((entry: any) => entry.id)).toContain(shipment.id);
  });

  it("adds DDP extra weight and custom charges from operations using the lane formula", async () => {
    const { clientAccount } = await createClientWithUser();
    const { lane, shipment, pricing, pricingRule } = await createPaidDdpShipment(clientAccount.id);

    const extraWeightRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/charges/extra-weight`).send({
        additionalQuantity: 1.5,
      }),
      adminCookies,
    );

    expect(extraWeightRes.status).toBe(201);
    expect(extraWeightRes.body.billingUnit).toBe("KG");
    expect(Number(extraWeightRes.body.totalQuantity)).toBeCloseTo(1.5, 4);

    const updatedBasePricing = calculateDdpPrice({
      lane,
      transportMethod: "air",
      packages: [{ weight: 3.5 }],
      markupPercentage: 0,
    });
    const updatedMarkupPercentage = pricingRule
      ? await storage.getDdpMarginForQuantity(pricingRule.id, updatedBasePricing.billingUnit, updatedBasePricing.billableQuantity)
      : 0;
    const updatedPricing = calculateDdpPrice({
      lane,
      transportMethod: "air",
      packages: [{ weight: 3.5 }],
      markupPercentage: updatedMarkupPercentage,
    });
    const expectedExtraAmount = Number((updatedPricing.totalAmountSar - pricing.totalAmountSar).toFixed(2));

    const refreshedShipment = await storage.getShipment(shipment.id);
    expect(Number(refreshedShipment?.extraFeesWeightValue || 0)).toBeCloseTo(1.5, 4);
    expect(Number(refreshedShipment?.extraFeesAmountSar || 0)).toBeCloseTo(expectedExtraAmount, 2);

    const invoicesAfterWeight = await storage.getInvoicesByShipmentId(shipment.id);
    expect(Number(invoicesAfterWeight.find((invoice) => invoice.invoiceType === InvoiceType.EXTRA_WEIGHT)?.amount || 0)).toBeCloseTo(expectedExtraAmount, 2);

    const reduceWeightRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/charges/extra-weight`).send({
        targetMeasuredQuantity: 3.0,
      }),
      adminCookies,
    );

    expect(reduceWeightRes.status).toBe(201);
    expect(Number(reduceWeightRes.body.targetMeasuredQuantity)).toBeCloseTo(3.0, 4);

    const reducedBasePricing = calculateDdpPrice({
      lane,
      transportMethod: "air",
      packages: [{ weight: 3.0 }],
      markupPercentage: 0,
    });
    const reducedMarkupPercentage = pricingRule
      ? await storage.getDdpMarginForQuantity(pricingRule.id, reducedBasePricing.billingUnit, reducedBasePricing.billableQuantity)
      : 0;
    const reducedPricing = calculateDdpPrice({
      lane,
      transportMethod: "air",
      packages: [{ weight: 3.0 }],
      markupPercentage: reducedMarkupPercentage,
    });
    const reducedExpectedExtraAmount = Number((reducedPricing.totalAmountSar - pricing.totalAmountSar).toFixed(2));

    const reducedShipment = await storage.getShipment(shipment.id);
    expect(Number(reducedShipment?.extraFeesWeightValue || 0)).toBeCloseTo(1.0, 4);
    expect(Number(reducedShipment?.extraFeesAmountSar || 0)).toBeCloseTo(reducedExpectedExtraAmount, 2);

    const customChargeRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/charges/custom`).send({
        description: "Warehouse handling",
        amount: 42,
      }),
      adminCookies,
    );

    expect(customChargeRes.status).toBe(201);

    const invoicesAfterCustom = await storage.getInvoicesByShipmentId(shipment.id);
    expect(Number(invoicesAfterCustom.find((invoice) => invoice.invoiceType === InvoiceType.DDP_ADJUSTMENT)?.amount || 0)).toBe(42);
  });

  it("requires sequential DDP warehouse checkpoints with structured task fields", async () => {
    const { clientAccount } = await createClientWithUser();
    const { shipment } = await createPaidDdpShipment(clientAccount.id);
    await storage.updateShipment(shipment.id, { status: "processing" });

    const detailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(detailRes.status).toBe(200);

    const planningTasks = [
      "ddp_review_order",
      "ddp_contact_supplier",
      "ddp_schedule_pickup",
    ].map((taskKey) => {
      const task = detailRes.body.operationTasks.find((row: any) => row.taskKey === taskKey);
      expect(task).toBeTruthy();
      return task;
    });
    const receiptTask = detailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_received_warehouse");
    const qcTask = detailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_quality_check");
    const photosTask = detailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_photos_uploaded");
    const manualTrackingTask = detailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_manual_tracking_number");

    expect(receiptTask).toBeTruthy();
    expect(qcTask).toBeTruthy();
    expect(photosTask).toBeTruthy();
    expect(manualTrackingTask).toBeTruthy();

    for (const task of planningTasks) {
      const response = await withCookies(
        request.post(`/api/operations/shipments/${shipment.id}/tasks/${task.id}/complete`).send({}),
        adminCookies,
      );
      expect(response.status).toBe(200);
    }

    const blockedQcRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${qcTask.id}/complete`).send({
        metadata: {
          packagingStatus: "sealed_good",
          quantityStatus: "matched",
          damageStatus: "clear",
          documentsStatus: "complete",
        },
      }),
      adminCookies,
    );
    expect(blockedQcRes.status).toBe(400);

    const receiptRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${receiptTask.id}/complete`).send({
        metadata: {
          receiptDate: "2026-06-11",
          receivedPieces: 4,
          receiptNotes: "Received in good order.",
        },
      }),
      adminCookies,
    );
    expect(receiptRes.status).toBe(200);

    const qcRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${qcTask.id}/complete`).send({
        metadata: {
          packagingStatus: "sealed_good",
          quantityStatus: "matched",
          damageStatus: "clear",
          documentsStatus: "complete",
          qcNotes: "No issues found.",
        },
      }),
      adminCookies,
    );
    expect(qcRes.status).toBe(200);

    const blockedAdvanceRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "awaiting_payment",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedAdvanceRes.status).toBe(400);

    const blockedManualTrackingRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${manualTrackingTask.id}/complete`).send({
        metadata: {
          carrierTrackingNumber: "DDP-AE-SA-0001",
        },
      }),
      adminCookies,
    );
    expect(blockedManualTrackingRes.status).toBe(400);

    const photosRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${photosTask.id}/complete`).send({
        metadata: {
          photos: [{ name: "warehouse-1.jpg", path: "uploads/warehouse-1.jpg" }],
          photoNotes: "Condition logged.",
        },
      }),
      adminCookies,
    );
    expect(photosRes.status).toBe(200);

    const blockedAdvanceWithoutTrackingRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "awaiting_payment",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedAdvanceWithoutTrackingRes.status).toBe(400);

    const manualTrackingRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${manualTrackingTask.id}/complete`).send({
        metadata: {
          carrierTrackingNumber: "DDP-AE-SA-0001",
        },
      }),
      adminCookies,
    );
    expect(manualTrackingRes.status).toBe(200);

    const trackedShipment = await storage.getShipment(shipment.id);
    expect(trackedShipment?.carrierTrackingNumber).toBe("DDP-AE-SA-0001");

    const advanceRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "awaiting_payment",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(advanceRes.status).toBe(200);

    const deliveryDetailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(deliveryDetailRes.status).toBe(200);

    const deliveryTask = deliveryDetailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_delivery_confirmation");
    expect(deliveryTask).toBeTruthy();

    const blockedDeliveryRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${deliveryTask.id}/complete`).send({
        metadata: {
          podNotes: "Left with consignee",
        },
      }),
      adminCookies,
    );
    expect(blockedDeliveryRes.status).toBe(400);

    const deliveryRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${deliveryTask.id}/complete`).send({
        metadata: {
          photos: [{ name: "pod-1.jpg", path: "uploads/pod-1.jpg" }],
          podNotes: "Signed POD captured.",
        },
      }),
      adminCookies,
    );
    expect(deliveryRes.status).toBe(200);
  });

  it("escalates problematic DDP QC results into Needs Attention with attached statuses", async () => {
    const { clientAccount } = await createClientWithUser();
    const { shipment } = await createPaidDdpShipment(clientAccount.id);
    await storage.updateShipment(shipment.id, { status: "processing" });

    const detailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(detailRes.status).toBe(200);

    const planningTasks = [
      "ddp_review_order",
      "ddp_contact_supplier",
      "ddp_schedule_pickup",
    ].map((taskKey) => {
      const task = detailRes.body.operationTasks.find((row: any) => row.taskKey === taskKey);
      expect(task).toBeTruthy();
      return task;
    });
    const receiptTask = detailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_received_warehouse");
    const qcTask = detailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_quality_check");

    expect(receiptTask).toBeTruthy();
    expect(qcTask).toBeTruthy();

    for (const task of planningTasks) {
      const response = await withCookies(
        request.post(`/api/operations/shipments/${shipment.id}/tasks/${task.id}/complete`).send({}),
        adminCookies,
      );
      expect(response.status).toBe(200);
    }

    const receiptRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${receiptTask.id}/complete`).send({
        metadata: {
          receiptDate: "2026-06-14",
          receivedPieces: 6,
          receiptNotes: "Boxes received with visible variance.",
        },
      }),
      adminCookies,
    );
    expect(receiptRes.status).toBe(200);

    const qcRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${qcTask.id}/complete`).send({
        metadata: {
          packagingStatus: "damaged",
          quantityStatus: "mismatch",
          damageStatus: "major",
          documentsStatus: "correction_needed",
          qcNotes: "Outer cartons are damaged and paperwork needs correction.",
        },
      }),
      adminCookies,
    );
    expect(qcRes.status).toBe(200);

    const afterQcRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(afterQcRes.status).toBe(200);

    const qcFlag = afterQcRes.body.attentionFlags.find((flag: any) => flag.issueType === "qc_exception");
    expect(qcFlag).toBeTruthy();
    expect(qcFlag.severity).toBe("high");
    expect(qcFlag.details).toContain("Packaging: Damaged");
    expect(qcFlag.details).toContain("Quantity: Mismatch found");
    expect(qcFlag.details).toContain("Damage: Major damage");
    expect(qcFlag.details).toContain("Documents: Needs correction");
    expect(qcFlag.details).toContain("Packaging damaged");
    expect(qcFlag.details).toContain("Quantity mismatch found");
    expect(qcFlag.details).toContain("Major damage reported");
    expect(qcFlag.details).toContain("Documents need correction");

    const qcMetadata = JSON.parse(qcFlag.metadata);
    expect(qcMetadata.source).toBe("ddp_quality_check");
    expect(qcMetadata.qcStatuses.packagingStatus).toBe("damaged");
    expect(qcMetadata.qcStatuses.quantityStatus).toBe("mismatch");
    expect(qcMetadata.qcStatuses.damageStatus).toBe("major");
    expect(qcMetadata.qcStatuses.documentsStatus).toBe("correction_needed");
    expect(qcMetadata.qcStatuses.qcNotes).toContain("paperwork needs correction");

    const attentionQueueRes = await withCookies(
      request.get("/api/operations/shipments?queue=attention&limit=200"),
      adminCookies,
    );
    expect(attentionQueueRes.status).toBe(200);
    expect(attentionQueueRes.body.map((row: any) => row.id)).toContain(shipment.id);
  });

  it("caps DDP stage progression to completed prerequisites and blocks stage skipping across the flow", async () => {
    const { clientAccount } = await createClientWithUser();
    const { shipment } = await createPaidDdpShipment(clientAccount.id);

    const initialDetailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(initialDetailRes.status).toBe(200);
    expect(initialDetailRes.body.status).toBe("awaiting_payment");
    expect(initialDetailRes.body.ddpCurrentStage).toBe(1);

    const planningTasks = [
      "ddp_review_order",
      "ddp_contact_supplier",
      "ddp_schedule_pickup",
    ].map((taskKey) => {
      const task = initialDetailRes.body.operationTasks.find((row: any) => row.taskKey === taskKey);
      expect(task).toBeTruthy();
      return task;
    });

    for (const task of planningTasks) {
      const response = await withCookies(
        request.post(`/api/operations/shipments/${shipment.id}/tasks/${task.id}/complete`).send({}),
        adminCookies,
      );
      expect(response.status).toBe(200);
    }

    const afterPlanningRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(afterPlanningRes.status).toBe(200);
    expect(afterPlanningRes.body.ddpCurrentStage).toBe(2);

    const blockedShippingSkipRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "in_transit",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedShippingSkipRes.status).toBe(400);

    const warehouseTasks = {
      receipt: afterPlanningRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_received_warehouse"),
      qc: afterPlanningRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_quality_check"),
      photos: afterPlanningRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_photos_uploaded"),
      manualTracking: afterPlanningRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_manual_tracking_number"),
    };

    expect(warehouseTasks.receipt).toBeTruthy();
    expect(warehouseTasks.qc).toBeTruthy();
    expect(warehouseTasks.photos).toBeTruthy();
    expect(warehouseTasks.manualTracking).toBeTruthy();

    expect(
      (
        await withCookies(
          request.post(`/api/operations/shipments/${shipment.id}/tasks/${warehouseTasks.receipt.id}/complete`).send({
            metadata: {
              receiptDate: "2026-06-11",
              receivedPieces: 3,
              receiptNotes: "Stage gating test receipt.",
            },
          }),
          adminCookies,
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await withCookies(
          request.post(`/api/operations/shipments/${shipment.id}/tasks/${warehouseTasks.qc.id}/complete`).send({
            metadata: {
              packagingStatus: "sealed_good",
              quantityStatus: "matched",
              damageStatus: "clear",
              documentsStatus: "complete",
              qcNotes: "QC passed.",
            },
          }),
          adminCookies,
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await withCookies(
          request.post(`/api/operations/shipments/${shipment.id}/tasks/${warehouseTasks.photos.id}/complete`).send({
            metadata: {
              photos: [{ name: "stage-gating.jpg", path: "uploads/stage-gating.jpg" }],
              photoNotes: "Photos uploaded.",
            },
          }),
          adminCookies,
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await withCookies(
          request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
            status: "awaiting_payment",
            notifyClient: true,
          }),
          adminCookies,
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await withCookies(
          request.post(`/api/operations/shipments/${shipment.id}/tasks/${warehouseTasks.manualTracking.id}/complete`).send({
            metadata: {
              carrierTrackingNumber: "DDP-STAGE-GATING-001",
            },
          }),
          adminCookies,
        )
      ).status,
    ).toBe(200);

    const trackedShipment = await storage.getShipment(shipment.id);
    expect(trackedShipment?.carrierTrackingNumber).toBe("DDP-STAGE-GATING-001");

    const afterWarehouseRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(afterWarehouseRes.status).toBe(200);
    expect(afterWarehouseRes.body.ddpCurrentStage).toBe(3);

    await storage.updateShipment(shipment.id, { paymentStatus: "unpaid" });

    const blockedShippingRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "in_transit",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedShippingRes.status).toBe(400);
    expect(blockedShippingRes.body.error).toContain("Confirm the shipment payment");

    const blockedDeliverySkipRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "out_for_delivery",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedDeliverySkipRes.status).toBe(400);

    await storage.updateShipment(shipment.id, { paymentStatus: "paid" });

    const shippingRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "in_transit",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(shippingRes.status).toBe(200);
    expect(shippingRes.body.detail.ddpCurrentStage).toBe(4);

    const blockedDeliveryBeforeShippingTasksRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "out_for_delivery",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedDeliveryBeforeShippingTasksRes.status).toBe(400);
    expect(blockedDeliveryBeforeShippingTasksRes.body.error).toContain("Shipping & Tracking checklist");

    const shippingDetailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(shippingDetailRes.status).toBe(200);

    const shippingTasks = [
      "ddp_origin_warehouse_received",
      "ddp_origin_customs_cleared",
      "ddp_departed_origin",
      "ddp_in_transit",
      "ddp_arrived_destination",
      "ddp_destination_customs_cleared",
      "ddp_last_mile_delivery",
    ].map((taskKey) => {
      const task = shippingDetailRes.body.operationTasks.find((row: any) => row.taskKey === taskKey);
      expect(task).toBeTruthy();
      return task;
    });

    for (const task of shippingTasks) {
      const response = await withCookies(
        request.post(`/api/operations/shipments/${shipment.id}/tasks/${task.id}/complete`).send({}),
        adminCookies,
      );
      expect(response.status).toBe(200);
    }

    const deliveryRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "out_for_delivery",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(deliveryRes.status).toBe(200);
    expect(deliveryRes.body.detail.ddpCurrentStage).toBe(5);

    const blockedDeliveredWithoutPodRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "delivered",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(blockedDeliveredWithoutPodRes.status).toBe(400);
    expect(blockedDeliveredWithoutPodRes.body.error).toContain("Upload POD");

    const deliveryDetailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(deliveryDetailRes.status).toBe(200);
    const deliveryTask = deliveryDetailRes.body.operationTasks.find((task: any) => task.taskKey === "ddp_delivery_confirmation");
    expect(deliveryTask).toBeTruthy();

    const podRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/tasks/${deliveryTask.id}/complete`).send({
        metadata: {
          photos: [{ name: "pod-stage-gating.jpg", path: "uploads/pod-stage-gating.jpg" }],
          podNotes: "Delivered to consignee.",
        },
      }),
      adminCookies,
    );
    expect(podRes.status).toBe(200);

    const deliveredRes = await withCookies(
      request.patch(`/api/operations/shipments/${shipment.id}/status`).send({
        status: "delivered",
        notifyClient: true,
      }),
      adminCookies,
    );
    expect(deliveredRes.status).toBe(200);
  });

  it("applies admin, operations manager, and agent permissions across the operations hub endpoints", async () => {
    const manager = await createOperationsUser("manager");
    const agentA = await createOperationsUser("agent");
    const agentB = await createOperationsUser("agent");
    const { clientAccount, clientUser } = await createClientWithUser();
    const shipment = await createPaidExpressShipment(clientAccount.id);

    await ensureOperationAssignmentForShipment({ shipment });
    await setOperationShipmentAssignments({
      shipmentId: shipment.id,
      assignedToUserIds: [agentA.id],
      reason: "Manager permissions regression",
    });
    await createAttentionFlag({
      shipmentId: shipment.id,
      issueType: "stage_delay",
      severity: "medium",
      details: "Shipment has not moved for the expected stage window.",
    });

    const managerCookies = await loginAndGetCookies(manager.username);
    const agentCookies = await loginAndGetCookies(agentA.username);
    const clientCookies = await loginAndGetCookies(clientUser.username);

    const adminAccessRes = await withCookies(request.get("/api/operations/me/access"), adminCookies);
    expect(adminAccessRes.status).toBe(200);
    expect(adminAccessRes.body.scope).toBe("admin");
    expect(adminAccessRes.body.canViewFinancialBreakdown).toBe(true);

    const managerAccessRes = await withCookies(request.get("/api/operations/me/access"), managerCookies);
    expect(managerAccessRes.status).toBe(200);
    expect(managerAccessRes.body.scope).toBe("manager");
    expect(managerAccessRes.body.canViewFinancialBreakdown).toBe(false);
    expect(managerAccessRes.body.permissions).toContain("operations:assign");
    expect(managerAccessRes.body.permissions).toContain("operations:special-handling");

    const agentAccessRes = await withCookies(request.get("/api/operations/me/access"), agentCookies);
    expect(agentAccessRes.status).toBe(200);
    expect(agentAccessRes.body.scope).toBe("agent");
    expect(agentAccessRes.body.permissions).not.toContain("operations:assign");
    expect(agentAccessRes.body.permissions).not.toContain("operations:special-handling");

    const usersRes = await withCookies(request.get("/api/operations/users"), managerCookies);
    expect(usersRes.status).toBe(200);
    expect(usersRes.body.some((user: any) => user.id === manager.id)).toBe(true);
    expect(usersRes.body.some((user: any) => user.id === agentA.id)).toBe(true);

    const managerQueueRes = await withCookies(request.get("/api/operations/shipments?queue=express"), managerCookies);
    expect(managerQueueRes.status).toBe(200);
    expect(managerQueueRes.body.map((entry: any) => entry.id)).toContain(shipment.id);

    const agentQueueRes = await withCookies(request.get("/api/operations/shipments?queue=express"), agentCookies);
    expect(agentQueueRes.status).toBe(200);
    expect(agentQueueRes.body.map((entry: any) => entry.id)).toContain(shipment.id);

    const managerDetailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), managerCookies);
    expect(managerDetailRes.status).toBe(200);
    expect(managerDetailRes.body.financialBreakdown).toBeUndefined();

    const adminDetailRes = await withCookies(request.get(`/api/operations/shipments/${shipment.id}`), adminCookies);
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.financialBreakdown).toBeDefined();

    const agentMessageRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/client-message`).send({
        message: "Your shipment is being monitored by our operations team.",
        template: "update",
        channel: "whatsapp",
      }),
      agentCookies,
    );
    expect(agentMessageRes.status).toBe(201);

    const clientNotificationsAfterMessageRes = await withCookies(request.get("/api/notifications"), clientCookies);
    expect(clientNotificationsAfterMessageRes.status).toBe(200);
    expect(
      clientNotificationsAfterMessageRes.body.some(
        (notification: any) =>
          notification.type === "operations_whatsapp_message" && notification.entityId === shipment.id,
      ),
    ).toBe(true);

    const smsMessageRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/client-message`).send({
        message: "SMS fallback should stay friendly until the channel is configured.",
        template: "update",
        channel: "sms",
      }),
      agentCookies,
    );
    expect(smsMessageRes.status).toBe(201);
    expect(smsMessageRes.body.channel).toBe("sms");
    expect(smsMessageRes.body.deliveryStatus).toBe("not_configured");

    const emailMessageRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/client-message`).send({
        message: "Email channel test from operations.",
        template: "update",
        channel: "email",
      }),
      agentCookies,
    );
    expect(emailMessageRes.status).toBe(201);
    expect(emailMessageRes.body.channel).toBe("email");
    expect(["sent", "not_configured"]).toContain(emailMessageRes.body.deliveryStatus);

    const clientNotificationsAfterChannelsRes = await withCookies(request.get("/api/notifications"), clientCookies);
    expect(clientNotificationsAfterChannelsRes.status).toBe(200);
    expect(
      clientNotificationsAfterChannelsRes.body.some(
        (notification: any) =>
          notification.type === "operations_sms_message" && notification.entityId === shipment.id,
      ),
    ).toBe(true);
    expect(
      clientNotificationsAfterChannelsRes.body.some(
        (notification: any) =>
          notification.type === "operations_email_message" && notification.entityId === shipment.id,
      ),
    ).toBe(true);

    const forbiddenAssignRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/reassign`).send({
        assignedToUserIds: [agentA.id, agentB.id],
        reason: "Agent should not be able to reassign",
      }),
      agentCookies,
    );
    expect(forbiddenAssignRes.status).toBe(403);

    const forbiddenAttentionResolveRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/attention/resolve`).send({
        resolutionNote: "Agent should not be able to resolve attention",
      }),
      agentCookies,
    );
    expect(forbiddenAttentionResolveRes.status).toBe(403);

    const managerReassignRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/reassign`).send({
        assignedToUserIds: [agentA.id, agentB.id],
        reason: "Manager team assignment update",
      }),
      managerCookies,
    );
    expect(managerReassignRes.status).toBe(200);
    expect(managerReassignRes.body.detail.assignedTeam.map((member: any) => member.userId)).toEqual([agentA.id, agentB.id]);

    const managerSpecialRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/special-handling`).send({
        priority: "urgent",
        reason: "Escalated client deadline",
        assignedToUserId: manager.id,
        notes: "Keep this shipment under close watch.",
      }),
      managerCookies,
    );
    expect(managerSpecialRes.status).toBe(200);
    expect(managerSpecialRes.body.specialHandling.priority).toBe("urgent");

    const managerAttentionResolveRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/attention/resolve`).send({
        resolutionNote: "Manager reviewed and cleared the operational delay.",
      }),
      managerCookies,
    );
    expect(managerAttentionResolveRes.status).toBe(200);
    expect(managerAttentionResolveRes.body.resolvedFlags.length).toBeGreaterThan(0);

    const managerResolveSpecialRes = await withCookies(
      request.post(`/api/operations/shipments/${shipment.id}/special-handling/resolve`).send({
        resolutionNote: "Priority handling no longer required.",
      }),
      managerCookies,
    );
    expect(managerResolveSpecialRes.status).toBe(200);
    expect(managerResolveSpecialRes.body.specialHandling.status).toBe("RESOLVED");
  });

  it("keeps terminal shipments out of operations queues and summary counts", async () => {
    const { clientAccount } = await createClientWithUser();

    const activeExpress = await createPaidExpressShipment(clientAccount.id, {
      status: "processing",
      trackingNumber: `EZH_ACTIVE_EXPRESS_${Date.now()}`,
    });
    const deliveredExpress = await createPaidExpressShipment(clientAccount.id, {
      status: "delivered",
      trackingNumber: `EZH_DELIVERED_EXPRESS_${Date.now()}`,
    });
    const { shipment: activeDdp } = await createPaidDdpShipment(clientAccount.id);
    const { shipment: cancelledDdp } = await createPaidDdpShipment(clientAccount.id);
    await storage.updateShipment(cancelledDdp.id, {
      status: "cancelled",
      updatedAt: new Date(),
    });

    const summaryRes = await withCookies(request.get("/api/operations/summary"), adminCookies);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.expressCount).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.ddpCount).toBeGreaterThanOrEqual(1);

    const expressQueueRes = await withCookies(request.get("/api/operations/shipments?queue=express&limit=200"), adminCookies);
    expect(expressQueueRes.status).toBe(200);
    const expressIds = expressQueueRes.body.map((entry: any) => entry.id);
    expect(expressIds).toContain(activeExpress.id);
    expect(expressIds).not.toContain(deliveredExpress.id);

    const ddpQueueRes = await withCookies(request.get("/api/operations/shipments?queue=ddp&limit=200"), adminCookies);
    expect(ddpQueueRes.status).toBe(200);
    const ddpIds = ddpQueueRes.body.map((entry: any) => entry.id);
    expect(ddpIds).toContain(activeDdp.id);
    expect(ddpIds).not.toContain(cancelledDdp.id);
  });

  it("blocks client users from operations endpoints", async () => {
    const { clientUser } = await createClientWithUser();
    const clientCookies = await loginAndGetCookies(clientUser.username);

    const res = await withCookies(request.get("/api/operations/summary"), clientCookies);
    expect(res.status).toBe(403);
  });
});
