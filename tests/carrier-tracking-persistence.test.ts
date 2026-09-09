import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { storage } from "../server/storage";
import {
  getCarrierTrackingEvents,
  recordCarrierTrackingEvents,
} from "../server/services/carrier-tracking-events";
import { applyCarrierTrackingToShipment } from "../server/services/express-tracking-refresh";
import type { TrackingResponse } from "../server/integrations/fedex";
import type { Shipment } from "../shared/schema";

let clientAccountId: string;

beforeAll(async () => {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientAccount = await storage.createClientAccount({
    name: `Tracking Persistence Co ${unique}`,
    email: `tracking_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    companyName: "Tracking Persistence Co",
    isActive: true,
  });
  clientAccountId = clientAccount.id;

  await storage.createUser({
    username: `tracking_client_${unique}`,
    email: `tracking_client_${unique}@test.com`,
    password: await bcrypt.hash("TrackingTest123!", 10),
    userType: "client",
    clientAccountId: clientAccount.id,
    isPrimaryContact: true,
    isActive: true,
    mustChangePassword: false,
  });
}, 30000);

async function createShipment(): Promise<Shipment> {
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
    margin: "20.00",
    marginAmount: "20.00",
    finalPrice: "120.00",
    currency: "SAR",
    carrierCode: "DHL",
    carrierName: "DHL",
    carrierTrackingNumber: `DHL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    paymentStatus: "paid",
    paymentMethod: "PAY_NOW",
  });
}

describe("carrier tracking event persistence", () => {
  it("stores the carrier's own wording and clock, and re-polling does not duplicate scans", async () => {
    const shipment = await createShipment();

    const events = [
      {
        timestamp: new Date("2026-08-15T04:06:00.000Z"),
        status: "PU",
        description: "Shipment picked up",
        location: "Brisbane-AU",
        localTime: "2026-08-15T13:06:00+09:00",
        utcOffset: "+09:00",
        raw: { typeCode: "PU" },
      },
      {
        timestamp: new Date("2026-08-16T09:00:00.000Z"),
        status: "AF",
        description: "Arrived at DHL facility- DUBAI-AE",
        location: "DUBAI-AE",
        localTime: "2026-08-16T13:00:00+04:00",
        utcOffset: "+04:00",
      },
    ];

    expect(await recordCarrierTrackingEvents({ shipmentId: shipment.id, carrierCode: "DHL", events })).toBe(2);

    const stored = await getCarrierTrackingEvents(shipment.id);
    expect(stored).toHaveLength(2);
    // Newest first.
    expect(stored[0].description).toBe("Arrived at DHL facility- DUBAI-AE");
    expect(stored[1].description).toBe("Shipment picked up");
    // The carrier's wall clock survives the round trip, offset and all.
    expect(stored[1].carrierLocalTime).toBe("2026-08-15T13:06:00+09:00");
    expect(stored[1].carrierUtcOffset).toBe("+09:00");
    expect(stored[1].eventCode).toBe("PU");

    // The scheduler re-sends the whole history every 10 minutes.
    await recordCarrierTrackingEvents({ shipmentId: shipment.id, carrierCode: "DHL", events });
    expect(await getCarrierTrackingEvents(shipment.id)).toHaveLength(2);
  });

  it("enriches a scan the carrier fills in later, rather than ignoring the update", async () => {
    const shipment = await createShipment();
    const base = {
      timestamp: new Date("2026-08-17T12:00:00.000Z"),
      status: "OK",
      description: "Delivered",
      location: "RIYADH-SA",
      localTime: "2026-08-17T15:00:00+03:00",
      utcOffset: "+03:00",
    };

    await recordCarrierTrackingEvents({ shipmentId: shipment.id, carrierCode: "DHL", events: [base] });
    // DHL attaches remarks and signedBy to an already-published delivery scan.
    await recordCarrierTrackingEvents({
      shipmentId: shipment.id,
      carrierCode: "DHL",
      events: [{ ...base, remarks: "Delivered to the consignee.", signedBy: "M FOUDA" }],
    });

    const stored = await getCarrierTrackingEvents(shipment.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].remarks).toBe("Delivered to the consignee.");
    expect(stored[0].signedBy).toBe("M FOUDA");
  });

  it("records scans even on a poll where nothing about the shipment changed", async () => {
    const shipment = await createShipment();
    const tracking: TrackingResponse = {
      trackingNumber: shipment.carrierTrackingNumber!,
      status: "In transit",
      events: [
        {
          timestamp: new Date("2026-08-18T06:00:00.000Z"),
          status: "PL",
          description: "Processed at DHL location",
          location: "JEDDAH-SA",
          localTime: "2026-08-18T09:00:00+03:00",
          utcOffset: "+03:00",
        },
      ],
    };

    // First apply moves the shipment, so carrierStatus changes.
    const moved = await applyCarrierTrackingToShipment(shipment, tracking, "test");
    expect(moved.carrierStatus).toBe("In transit");

    // Second apply is the "nothing changed" path, which returns early before touching the
    // shipment row. A new scan arriving on such a poll must still be recorded.
    const withNewScan: TrackingResponse = {
      ...tracking,
      events: [
        {
          timestamp: new Date("2026-08-18T18:00:00.000Z"),
          status: "DF",
          description: "Departed from DHL facility",
          location: "JEDDAH-SA",
          localTime: "2026-08-18T21:00:00+03:00",
          utcOffset: "+03:00",
        },
        ...tracking.events,
      ],
    };
    await applyCarrierTrackingToShipment(moved, withNewScan, "test");

    const stored = await getCarrierTrackingEvents(shipment.id);
    expect(stored.map((row) => row.description)).toEqual([
      "Departed from DHL facility",
      "Processed at DHL location",
    ]);
  });

  it("drops scans that carry no carrier text instead of storing a blank row", async () => {
    const shipment = await createShipment();
    const written = await recordCarrierTrackingEvents({
      shipmentId: shipment.id,
      carrierCode: "FEDEX",
      events: [
        { timestamp: new Date("2026-08-19T10:00:00.000Z"), status: "PU", description: "   " },
        { timestamp: new Date("2026-08-19T11:00:00.000Z"), status: "AR", description: "At local FedEx facility" },
      ],
    });

    expect(written).toBe(1);
    const stored = await getCarrierTrackingEvents(shipment.id);
    expect(stored.map((row) => row.description)).toEqual(["At local FedEx facility"]);
  });
});
