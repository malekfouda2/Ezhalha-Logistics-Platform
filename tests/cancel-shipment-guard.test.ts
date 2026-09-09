import { describe, expect, it } from "vitest";

import { COLLECTED_OR_MOVING_CARRIER_STATUSES, isCarrierStatusStillBooked } from "@shared/domain";
import { describeCancellationConsequences } from "@shared/cancellation";

// The cancel confirmation dialog tells the user whether cancelling refunds the client
// automatically or opens a refund request for approval. It decides with this helper, and so does
// the server. If the two ever disagree, the dialog promises a refund that does not happen — so
// the helper is shared, and pinned here.
describe("isCarrierStatusStillBooked", () => {
  it("treats a booked-but-uncollected shipment as still booked (automatic refund)", () => {
    for (const status of ["created", "Label created", "processing", "pending", "", null, undefined]) {
      expect(isCarrierStatusStillBooked(status)).toBe(true);
    }
  });

  it("treats a collected or moving shipment as no longer booked (approval needed)", () => {
    for (const status of ["picked_up", "in_transit", "out_for_delivery", "delivered"]) {
      expect(isCarrierStatusStillBooked(status)).toBe(false);
    }
  });

  it("normalises the carrier's own casing and spacing", () => {
    // Real values seen in production: "Picked up", "On the way", "Delivered".
    expect(isCarrierStatusStillBooked("Picked up")).toBe(false);
    expect(isCarrierStatusStillBooked("PICKED-UP")).toBe(false);
    expect(isCarrierStatusStillBooked("  In Transit  ")).toBe(false);
    expect(isCarrierStatusStillBooked("Out For Delivery")).toBe(false);
  });

  it("exposes the status set so server and clients cannot drift", () => {
    expect([...COLLECTED_OR_MOVING_CARRIER_STATUSES].sort()).toEqual([
      "delivered",
      "in_transit",
      "out_for_delivery",
      "picked_up",
    ]);
  });
});

// The dialog renders these sentences verbatim. They are a promise about money, so they are
// asserted here rather than left to a click-through.
describe("describeCancellationConsequences", () => {
  it("promises an automatic refund only while the shipment is still booked", () => {
    const booked = describeCancellationConsequences({ carrierStatus: "Label created" });
    expect(booked.refundsAutomatically).toBe(true);
    expect(booked.effects.join(" ")).toContain("refunded automatically");
    expect(booked.effects.join(" ")).not.toContain("approval rather than");
  });

  it("warns that a collected shipment needs refund approval instead", () => {
    const collected = describeCancellationConsequences({ carrierStatus: "Picked up" });
    expect(collected.refundsAutomatically).toBe(false);
    expect(collected.effects.join(" ")).toContain("opens a refund request for approval");
    expect(collected.effects.join(" ")).not.toContain("refunded automatically");
    // The operator must know the parcel can still arrive.
    expect(collected.effects.join(" ")).toContain("may still be delivered");
  });

  it("mentions the pickup only when one is actually booked", () => {
    const withPickup = describeCancellationConsequences({ carrierStatus: "created", hasPickupBooked: true });
    expect(withPickup.effects.join(" ")).toContain("courier pickup is released");

    const withoutPickup = describeCancellationConsequences({ carrierStatus: "created", hasPickupBooked: false });
    expect(withoutPickup.effects.join(" ")).not.toContain("courier pickup");
  });

  it("names the carrier when known and stays generic when not", () => {
    expect(describeCancellationConsequences({ carrierName: "FedEx" }).effects[0]).toContain("with FedEx");
    expect(describeCancellationConsequences({ carrierName: "   " }).effects[0]).toContain("with the carrier");
    expect(describeCancellationConsequences({}).effects[0]).toContain("with the carrier");
  });
});
