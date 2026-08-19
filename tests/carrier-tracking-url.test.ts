import { describe, expect, it } from "vitest";

import { getCarrierTrackingUrl } from "../client/src/components/carrier-tracking-link";

// Admin surfaces now link every carrier tracking number. The URL differs per carrier and the
// number must be encoded, so the builder is pinned here — a wrong link sends an operator to a
// carrier's "not found" page during a refund dispute.
describe("getCarrierTrackingUrl", () => {
  it("builds a FedEx tracking URL", () => {
    expect(getCarrierTrackingUrl("875824953144", "FEDEX")).toBe(
      "https://www.fedex.com/fedextrack/?trknbr=875824953144",
    );
  });

  it("builds a DHL tracking URL", () => {
    expect(getCarrierTrackingUrl("2470181162", "DHL")).toContain("tracking-id=2470181162");
  });

  it("builds an Aramex tracking URL", () => {
    expect(getCarrierTrackingUrl("1234567890", "ARAMEX")).toBe(
      "https://www.aramex.com/track/results?ShipmentNumber=1234567890",
    );
  });

  it("recognises the carrier from a service-level name when the code is missing", () => {
    // Production stores "EXPRESS WORLDWIDE" as the carrier name on DHL shipments.
    expect(getCarrierTrackingUrl("2470181162", null, "EXPRESS WORLDWIDE")).toBeNull();
    expect(getCarrierTrackingUrl("2470181162", null, "DHL Express Worldwide")).toContain("dhl.com");
    expect(getCarrierTrackingUrl("875824953144", null, "FedEx International Priority")).toContain("fedex.com");
  });

  it("returns null for carriers with no public tracking page, so the number renders as plain text", () => {
    // iMile, Wepik and the DDP pseudo-carrier have no URL here. Rendering an unlinked number is
    // correct; inventing a URL would send operators somewhere broken.
    for (const code of ["IMILE", "WEPIK", "DDP", "SMSA", "NAQEL"]) {
      expect(getCarrierTrackingUrl("ABC123", code)).toBeNull();
    }
  });

  it("returns null for a blank tracking number", () => {
    expect(getCarrierTrackingUrl("", "FEDEX")).toBeNull();
    expect(getCarrierTrackingUrl("   ", "FEDEX")).toBeNull();
  });

  it("encodes tracking numbers so a stray character cannot break the URL", () => {
    expect(getCarrierTrackingUrl("A B&C", "FEDEX")).toBe(
      "https://www.fedex.com/fedextrack/?trknbr=A%20B%26C",
    );
  });
});
