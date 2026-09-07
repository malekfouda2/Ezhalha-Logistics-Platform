import { describe, expect, it } from "vitest";
import { normaliseOperation } from "../server/services/integration-health";

// The health page exists to show one row per problem. Operations carry per-shipment tracking
// numbers, so without this normalisation the same DHL fault appeared as 200 separate rows and
// the page reproduced the noise it was built to remove.
describe("collapsing shipment identifiers out of operations", () => {
  it("strips a bare numeric waybill from a path", () => {
    expect(normaliseOperation("GET /shipments/2575108620/tracking"))
      .toBe("GET /shipments/{id}/tracking");
  });

  it("strips a prefixed tracking number", () => {
    expect(normaliseOperation("GET /track/shipments?trackingNumber=DHL1785606772624"))
      .toBe("GET /track/shipments?trackingNumber={id}");
  });

  it("strips our own tracking numbers", () => {
    expect(normaliseOperation("POST /pickups/EZH327836721"))
      .toBe("POST /pickups/{id}");
  });

  it("collapses two shipments onto the same operation", () => {
    const a = normaliseOperation("GET /shipments/2575108620/tracking?trackingView=all-checkpoints");
    const b = normaliseOperation("GET /shipments/6354983154/tracking?trackingView=all-checkpoints");
    expect(a).toBe(b);
  });

  it("leaves API version segments alone", () => {
    // "v1" and "service_1_0" are part of the route, not an identifier. Replacing them would
    // merge genuinely different endpoints into one row.
    expect(normaliseOperation("POST /track/v1/trackingnumbers"))
      .toBe("POST /track/v1/trackingnumbers");
    expect(normaliseOperation("POST /rate/v1/rates/quotes"))
      .toBe("POST /rate/v1/rates/quotes");
  });

  it("leaves an operation with no identifier untouched", () => {
    expect(normaliseOperation("POST /pickups")).toBe("POST /pickups");
    expect(normaliseOperation("create_invoice")).toBe("create_invoice");
  });

  it("keeps short numbers that are not identifiers", () => {
    // A four-digit token with fewer than four digits after the letters, or a short segment,
    // should survive — only things long enough to be an identifier get collapsed.
    expect(normaliseOperation("GET /v2/status")).toBe("GET /v2/status");
  });

  it("handles several identifiers in one operation", () => {
    expect(normaliseOperation("GET /shipments/2575108620/pieces/9876543210"))
      .toBe("GET /shipments/{id}/pieces/{id}");
  });
});
