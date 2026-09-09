import { describe, expect, it } from "vitest";

import { carrierBrandName, CARRIER_BRAND_NAMES } from "@shared/carriers";

// The carrier column should read as the brand the business ships with. carrier_name holds
// whatever the carrier wrote at booking time, which in production includes service levels.
describe("carrierBrandName", () => {
  it("prefers the carrier code over a service-level name", () => {
    // Exactly the values production holds today.
    expect(carrierBrandName("DHL", "EXPRESS WORLDWIDE")).toBe("DHL");
    expect(carrierBrandName("FEDEX", "FedEx International Priority®")).toBe("FedEx");
    expect(carrierBrandName("FEDEX", "FedEx International Economy®")).toBe("FedEx");
    expect(carrierBrandName("DDP", "Door To Door Freight")).toBe("Door to Door");
  });

  it("leaves an already-clean name alone", () => {
    expect(carrierBrandName("FEDEX", "FedEx")).toBe("FedEx");
    expect(carrierBrandName("IMILE", "iMile")).toBe("iMile");
    expect(carrierBrandName("WEPIK", "Wepik")).toBe("Wepik");
  });

  it("is case- and whitespace-insensitive about the code", () => {
    expect(carrierBrandName(" fedex ", "EXPRESS WORLDWIDE")).toBe("FedEx");
  });

  it("strips a service level when the code is unknown", () => {
    // A carrier in the database but not yet in the brand map still must not show a service level.
    expect(carrierBrandName("NEWCO", "FedEx International Connect Plus")).toBe("FedEx");
    expect(carrierBrandName(null, "DHL Express Worldwide")).toBe("DHL");
    expect(carrierBrandName("", "Some Courier®")).toBe("Some Courier");
  });

  it("falls back to the raw code, then to empty, rather than rendering undefined", () => {
    expect(carrierBrandName("UNKNOWNCO", null)).toBe("UNKNOWNCO");
    expect(carrierBrandName(null, null)).toBe("");
    expect(carrierBrandName(undefined, undefined)).toBe("");
  });

  it("covers every carrier the platform books with", () => {
    for (const code of ["FEDEX", "DHL", "ARAMEX", "SMSA", "NAQEL", "JT", "REDBOX", "ZAJIL", "IMILE", "FIZZPA", "SHIPOX", "DDP"]) {
      expect(CARRIER_BRAND_NAMES[code]).toBeTruthy();
    }
  });
});
