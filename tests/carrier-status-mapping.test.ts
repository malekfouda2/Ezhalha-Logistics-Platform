import { describe, expect, it } from "vitest";

import { mapCarrierTrackingStatusToShipmentStatus } from "../server/services/express-tracking-refresh";
import type { TrackingResponse } from "../server/integrations/fedex";

function tracking(status: string, latestEventDescription?: string): TrackingResponse {
  return {
    trackingNumber: "TEST",
    status,
    events: latestEventDescription
      ? [{ timestamp: new Date("2026-08-15T10:00:00Z"), status: "XX", description: latestEventDescription }]
      : [],
  };
}

describe("mapCarrierTrackingStatusToShipmentStatus", () => {
  it("maps DHL movement milestones", () => {
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Shipment picked up"))).toBe("picked_up");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Processed at RIYADH-SAUDI ARABIA"))).toBe("in_transit");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Shipment has departed from a DHL facility"))).toBe("in_transit");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Customs status updated"))).toBe("customs_clearance");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Delivered"))).toBe("delivered");
  });

  it("maps holds and returns instead of leaving them looking in-transit", () => {
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Shipment is on hold"))).toBe("on_hold");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Returned to shipper"))).toBe("returned");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Shipment returned to sender"))).toBe("returned");
  });

  // A return travels through the network, so its events mention transit and facilities. The
  // return check has to win, or the shipment reads as if it were still on its way to the customer.
  it("prefers the return milestone over transit wording in the same string", () => {
    expect(
      mapCarrierTrackingStatusToShipmentStatus(tracking("In transit", "Returned to shipper — departed facility")),
    ).toBe("returned");
  });

  it("keeps pre-pickup carrier wording at created, and returns null when unrecognised", () => {
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Shipment information received"))).toBe("created");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Label created"))).toBe("created");
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking(""))).toBeNull();
    expect(mapCarrierTrackingStatusToShipmentStatus(tracking("Wibble"))).toBeNull();
  });
});
