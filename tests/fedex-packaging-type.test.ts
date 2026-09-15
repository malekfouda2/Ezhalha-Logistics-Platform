import { describe, expect, it, vi } from "vitest";
import { FedExAdapter } from "../server/integrations/fedex";
import { logWarn } from "../server/services/logger";

/**
 * Production EZH043868517: a 25-piece, 445 kg FedEx Regional Economy shipment, Sharjah to Riyadh,
 * paid for and then failed **eleven** booking attempts on:
 *
 *     400 - PACKAGINGTYPE.INVALID: Invalid packaging type
 *
 * Its `package_type` was `PARCEL` — our own word for a local-carrier parcel, hardcoded onto every
 * admin quotation regardless of type. FedEx publishes no such packaging type.
 *
 * Two things let it reach the carrier. The quotation flow stamped a local-carrier word onto an
 * express shipment, and `mapPackagingType` forwarded anything it did not recognise verbatim
 * instead of falling back. The second is the one that matters: it made every unknown value a
 * guaranteed booking failure, on a shipment the client had already paid for, retried until
 * somebody noticed.
 */

function mapPackaging(adapter: FedExAdapter, value?: string): string {
  // The mapper is private; it is the unit under test, and going through createShipment would need
  // a live FedEx account.
  return (adapter as unknown as { mapPackagingType(v?: string): string }).mapPackagingType(value);
}

describe("FedEx packaging types", () => {
  const adapter = new FedExAdapter();

  it("never forwards a packaging type FedEx does not publish", () => {
    // The exact value from the failed shipment.
    expect(mapPackaging(adapter, "PARCEL")).toBe("YOUR_PACKAGING");
  });

  it("falls back for anything else unrecognised, rather than guessing", () => {
    for (const unknown of ["CARTON", "pallet", "BOX", "SKID", "טרה"]) {
      expect(mapPackaging(adapter, unknown), unknown).toBe("YOUR_PACKAGING");
    }
  });

  it("treats absent packaging as the shipper's own", () => {
    expect(mapPackaging(adapter, undefined)).toBe("YOUR_PACKAGING");
    expect(mapPackaging(adapter, "")).toBe("YOUR_PACKAGING");
    expect(mapPackaging(adapter, "   ")).toBe("YOUR_PACKAGING");
  });

  it("still passes through every packaging type FedEx does publish", () => {
    // The fallback must not swallow real choices — a client who picked a FedEx envelope is
    // charged for one and must be shipped in one.
    const published = [
      "YOUR_PACKAGING",
      "FEDEX_ENVELOPE",
      "FEDEX_PAK",
      "FEDEX_BOX",
      "FEDEX_SMALL_BOX",
      "FEDEX_MEDIUM_BOX",
      "FEDEX_LARGE_BOX",
      "FEDEX_EXTRA_LARGE_BOX",
      "FEDEX_10KG_BOX",
      "FEDEX_25KG_BOX",
      "FEDEX_TUBE",
    ];
    for (const type of published) {
      expect(mapPackaging(adapter, type), type).toBe(type);
    }
  });

  it("keeps mapping the short aliases the wizard has always sent", () => {
    expect(mapPackaging(adapter, "ENVELOPE")).toBe("FEDEX_ENVELOPE");
    expect(mapPackaging(adapter, "PAK")).toBe("FEDEX_PAK");
    expect(mapPackaging(adapter, "BOX_SMALL")).toBe("FEDEX_SMALL_BOX");
    expect(mapPackaging(adapter, "BOX_MEDIUM")).toBe("FEDEX_MEDIUM_BOX");
    expect(mapPackaging(adapter, "BOX_LARGE")).toBe("FEDEX_LARGE_BOX");
    expect(mapPackaging(adapter, "TUBE")).toBe("FEDEX_TUBE");
  });

  it("warns when it drops a value, so the source can be found", () => {
    // Silently correcting it would hide the quotation flow stamping PARCEL on express shipments:
    // the booking would succeed and nobody would learn that a bad value is still being written.
    // The logger is already mocked globally in tests/setup.ts.
    vi.mocked(logWarn).mockClear();
    mapPackaging(adapter, "PARCEL");
    expect(logWarn).toHaveBeenCalled();
    expect(String(vi.mocked(logWarn).mock.calls[0][0])).toContain("PARCEL");
  });
});
