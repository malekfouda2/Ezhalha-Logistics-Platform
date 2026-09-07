import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storage } from "../server/storage";
import type { InsertShipment } from "../shared/schema";

// Five production shipments were booked twice between 31 July and 28 August — EZH093042934,
// EZH343080675, EZH756078067, EZH910728831 and EZH503313541 — each ending up with two carrier
// waybills. Every one had the same fingerprint: the Tap webhook and the client's browser
// redirect finalising payment within the same second, both reading carrierTrackingNumber as
// null, and both passing the "already booked?" guard. It happened on FedEx and DHL alike, so
// it was never a carrier quirk; it was a read-then-check with nothing making it atomic.

let clientAccountId: string;
const created: string[] = [];

async function makeUnbookedShipment(): Promise<string> {
  const shipment = await storage.createShipment({
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
    status: "payment_pending",
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "120.00",
    currency: "SAR",
    carrierCode: "FEDEX",
    carrierName: "FedEx",
    paymentStatus: "pending",
  } as InsertShipment);
  created.push(shipment.id);
  return shipment.id;
}

beforeAll(async () => {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const account = await storage.createClientAccount({
    name: `Claim Test ${unique}`,
    email: `claim_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    isActive: true,
  } as any);
  clientAccountId = account.id;
}, 30000);

afterAll(async () => {
  for (const id of created) {
    await storage.updateShipment(id, { status: "cancelled" });
  }
});

describe("claiming a carrier booking", () => {
  it("gives the claim to exactly one of two simultaneous callers", async () => {
    const shipmentId = await makeUnbookedShipment();

    // The actual race: both fire at once, neither has written anything yet.
    const [a, b] = await Promise.all([
      storage.claimCarrierBooking(shipmentId),
      storage.claimCarrierBooking(shipmentId),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("gives it to exactly one of ten simultaneous callers", async () => {
    const shipmentId = await makeUnbookedShipment();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => storage.claimCarrierBooking(shipmentId)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses a shipment that already has a waybill, however long ago it was booked", async () => {
    // This is the case the 17 August fix covered — a Tap webhook replayed days later. The
    // claim has to keep honouring it, not just the same-second race.
    const shipmentId = await makeUnbookedShipment();
    await storage.updateShipment(shipmentId, {
      carrierTrackingNumber: "794813219660",
      carrierBookingClaimedAt: null,
      status: "in_transit",
    });

    expect(await storage.claimCarrierBooking(shipmentId)).toBe(false);
  });

  it("does not release a claim once the shipment is booked", async () => {
    const shipmentId = await makeUnbookedShipment();
    await storage.claimCarrierBooking(shipmentId);
    await storage.updateShipment(shipmentId, { carrierTrackingNumber: "794813219661" });

    // A late failure handler from a losing request must not reopen a booked shipment.
    await storage.releaseCarrierBookingClaim(shipmentId);

    expect(await storage.claimCarrierBooking(shipmentId)).toBe(false);
  });
});

describe("recovering from a failed booking", () => {
  it("lets a retry through after the claim is released", async () => {
    const shipmentId = await makeUnbookedShipment();

    expect(await storage.claimCarrierBooking(shipmentId)).toBe(true);
    expect(await storage.claimCarrierBooking(shipmentId)).toBe(false);

    await storage.releaseCarrierBookingClaim(shipmentId);

    expect(await storage.claimCarrierBooking(shipmentId)).toBe(true);
  });

  it("lets a retry through once a stuck claim goes stale", async () => {
    // A process that dies mid-booking leaves its claim behind. Without the stale window the
    // shipment could never be booked again — a worse failure than the one being fixed.
    const shipmentId = await makeUnbookedShipment();
    await storage.claimCarrierBooking(shipmentId);
    expect(await storage.claimCarrierBooking(shipmentId)).toBe(false);

    await storage.updateShipment(shipmentId, {
      carrierBookingClaimedAt: new Date(Date.now() - 6 * 60 * 1000),
    });

    expect(await storage.claimCarrierBooking(shipmentId)).toBe(true);
  });

  it("holds the claim while a booking is still plausibly in flight", async () => {
    const shipmentId = await makeUnbookedShipment();
    await storage.claimCarrierBooking(shipmentId);

    // Four minutes in, the winner may still be waiting on the carrier. Letting a second
    // request through here is precisely how the duplicate waybills were issued.
    await storage.updateShipment(shipmentId, {
      carrierBookingClaimedAt: new Date(Date.now() - 4 * 60 * 1000),
    });

    expect(await storage.claimCarrierBooking(shipmentId)).toBe(false);
  });
});
