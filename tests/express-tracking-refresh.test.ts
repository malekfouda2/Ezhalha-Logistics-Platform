import { beforeEach, describe, expect, it, vi } from "vitest";

const updateShipment = vi.fn(async (_id: string, updates: Record<string, unknown>) => ({ id: "s1", ...updates }));
const recordShipmentCarrierPoll = vi.fn(async () => undefined);

vi.mock("../server/storage", () => ({
  storage: {
    updateShipment: (...args: any[]) => updateShipment(...(args as [string, Record<string, unknown>])),
    recordShipmentCarrierPoll: (...args: any[]) => recordShipmentCarrierPoll(...(args as [])),
  },
}));

const recordShipmentStatusChange = vi.fn(async () => undefined);
vi.mock("../server/services/operations", () => ({
  recordShipmentStatusChange: () => recordShipmentStatusChange(),
  createAttentionFlag: vi.fn(async () => null),
  detectOperationAttentionFlags: vi.fn(async () => 0),
  getOperationShipmentKind: () => "EXPRESS",
}));

import { applyCarrierTrackingToShipment } from "../server/services/express-tracking-refresh";
import type { TrackingResponse } from "../server/integrations/fedex";

const baseShipment = {
  id: "s1",
  trackingNumber: "EZH1",
  status: "in_transit",
  carrierStatus: "Processed at RIYADH-SAUDI ARABIA",
  carrierStatusRepeatCount: 7,
  estimatedDelivery: null,
  actualDelivery: null,
} as any;

function tracking(status: string): TrackingResponse {
  return { trackingNumber: "AWB", status, events: [] };
}

describe("applyCarrierTrackingToShipment", () => {
  beforeEach(() => {
    updateShipment.mockClear();
    recordShipmentCarrierPoll.mockClear();
    recordShipmentStatusChange.mockClear();
  });

  // The refresh runs every 10 minutes. Writing through updateShipment on an unchanged poll
  // stamps updatedAt, which made every express shipment look freshly updated forever and
  // silently disabled the 36h "no recent update" attention flag.
  it("does not touch updatedAt when the carrier reports nothing new", async () => {
    const result = await applyCarrierTrackingToShipment(
      baseShipment,
      tracking("Processed at RIYADH-SAUDI ARABIA"),
      "carrier_refresh",
    );

    expect(updateShipment).not.toHaveBeenCalled();
    expect(recordShipmentCarrierPoll).toHaveBeenCalledWith("s1", 8);
    expect(result.carrierStatusRepeatCount).toBe(8);
    expect(recordShipmentStatusChange).not.toHaveBeenCalled();
  });

  it("writes through and records the change when the carrier status moves", async () => {
    await applyCarrierTrackingToShipment(baseShipment, tracking("Delivered"), "carrier_refresh");

    expect(recordShipmentCarrierPoll).not.toHaveBeenCalled();
    expect(updateShipment).toHaveBeenCalledTimes(1);
    const [, updates] = updateShipment.mock.calls[0];
    expect(updates.status).toBe("delivered");
    expect(updates.carrierStatus).toBe("Delivered");
    // A changed carrier status resets the repeat counter that drives the duplicate-status flag.
    expect(updates.carrierStatusRepeatCount).toBe(0);
    expect(recordShipmentStatusChange).toHaveBeenCalledTimes(1);
  });

  it("keeps a delivered shipment from regressing when the carrier string is unmapped", async () => {
    await applyCarrierTrackingToShipment(
      { ...baseShipment, status: "delivered" },
      tracking("Some unmapped carrier phrasing"),
      "carrier_refresh",
    );

    const [, updates] = updateShipment.mock.calls[0];
    expect(updates.status).toBeUndefined();
    expect(updates.carrierStatus).toBe("Some unmapped carrier phrasing");
  });
});
