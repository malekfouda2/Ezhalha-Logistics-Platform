import { describe, expect, it } from "vitest";

import {
  countActiveShipmentFilters,
  DEFAULT_SHIPMENT_FILTERS,
  expandStatusFilter,
  matchesShipmentFilters,
  shipmentFiltersToQueryParams,
  SHIPMENT_FILTER_ALL,
  type FilterableShipment,
  type ShipmentFilters,
} from "@shared/shipment-filters";

const shipment = (overrides: Partial<FilterableShipment> = {}): FilterableShipment => ({
  trackingNumber: "EZH100000001",
  recipientName: "Aisha Rahman",
  recipientCity: "Riyadh",
  senderName: "Shenzhen Supplier",
  status: "created",
  carrierCode: "FEDEX",
  fulfillmentType: "carrier",
  paymentStatus: "paid",
  paymentMethod: "PAY_NOW",
  senderCountry: "CN",
  recipientCountry: "SA",
  createdAt: "2026-08-10T09:00:00.000Z",
  ...overrides,
});

const filters = (overrides: Partial<ShipmentFilters> = {}): ShipmentFilters => ({
  ...DEFAULT_SHIPMENT_FILTERS,
  ...overrides,
});

describe("matchesShipmentFilters", () => {
  it("matches everything when nothing is filtered", () => {
    expect(matchesShipmentFilters(shipment(), filters())).toBe(true);
    expect(countActiveShipmentFilters(filters())).toBe(0);
  });

  it("searches tracking number, recipient, city and sender", () => {
    for (const term of ["EZH1000", "aisha", "riyadh", "shenzhen"]) {
      expect(matchesShipmentFilters(shipment(), filters({ search: term }))).toBe(true);
    }
    expect(matchesShipmentFilters(shipment(), filters({ search: "nothing-like-this" }))).toBe(false);
  });

  it("ignores surrounding whitespace and case in the search term", () => {
    expect(matchesShipmentFilters(shipment(), filters({ search: "  AISHA  " }))).toBe(true);
  });

  it("expands a lifecycle group into its raw statuses", () => {
    expect(expandStatusFilter("in_transit")).toContain("out_for_delivery");
    expect(expandStatusFilter("cancelled")).toEqual(["cancelled"]);

    const outForDelivery = shipment({ status: "out_for_delivery" });
    expect(matchesShipmentFilters(outForDelivery, filters({ status: "in_transit" }))).toBe(true);
    expect(matchesShipmentFilters(outForDelivery, filters({ status: "delivered" }))).toBe(false);
  });

  it("filters by carrier, type, payment status and method", () => {
    expect(matchesShipmentFilters(shipment(), filters({ carrierCode: "DHL" }))).toBe(false);
    expect(matchesShipmentFilters(shipment(), filters({ carrierCode: "FEDEX" }))).toBe(true);
    expect(matchesShipmentFilters(shipment(), filters({ fulfillmentType: "local" }))).toBe(false);
    expect(matchesShipmentFilters(shipment(), filters({ paymentStatus: "pending" }))).toBe(false);
    expect(matchesShipmentFilters(shipment(), filters({ paymentMethod: "CREDIT" }))).toBe(false);
  });

  it("treats a missing fulfillmentType as an express carrier shipment", () => {
    // Rows predating the local/DDP split have no fulfillmentType, and the schema default is
    // "carrier" — so filtering for Express must still find them. The SQL mirrors this coalesce.
    const legacy = shipment({ fulfillmentType: null });
    expect(matchesShipmentFilters(legacy, filters({ fulfillmentType: "carrier" }))).toBe(true);
    expect(matchesShipmentFilters(legacy, filters({ fulfillmentType: "local" }))).toBe(false);
  });

  it("filters by origin and destination country", () => {
    expect(matchesShipmentFilters(shipment(), filters({ originCountry: "CN" }))).toBe(true);
    expect(matchesShipmentFilters(shipment(), filters({ originCountry: "GB" }))).toBe(false);
    expect(matchesShipmentFilters(shipment(), filters({ destinationCountry: "SA" }))).toBe(true);
    expect(matchesShipmentFilters(shipment(), filters({ destinationCountry: "CN" }))).toBe(false);
  });

  it("treats both date bounds as inclusive whole days", () => {
    const s = shipment({ createdAt: "2026-08-10T09:00:00.000Z" });
    // Same day on both ends must still match — an exclusive upper bound would silently hide
    // everything created on the end date the user picked.
    expect(matchesShipmentFilters(s, filters({ dateFrom: "2026-08-10", dateTo: "2026-08-10" }))).toBe(true);
    expect(matchesShipmentFilters(s, filters({ dateFrom: "2026-08-11" }))).toBe(false);
    expect(matchesShipmentFilters(s, filters({ dateTo: "2026-08-09" }))).toBe(false);
  });

  it("combines filters with AND", () => {
    const all = filters({ carrierCode: "FEDEX", originCountry: "CN", paymentStatus: "paid" });
    expect(matchesShipmentFilters(shipment(), all)).toBe(true);
    expect(matchesShipmentFilters(shipment({ paymentStatus: "pending" }), all)).toBe(false);
  });
});

describe("countActiveShipmentFilters", () => {
  it("ignores defaults and blank search, counts each narrowed field once", () => {
    expect(countActiveShipmentFilters(filters({ search: "   " }))).toBe(0);
    expect(countActiveShipmentFilters(filters({ status: SHIPMENT_FILTER_ALL }))).toBe(0);
    expect(
      countActiveShipmentFilters(
        filters({ search: "abc", carrierCode: "DHL", dateFrom: "2026-08-01", dateTo: "2026-08-31" }),
      ),
    ).toBe(4);
  });
});

describe("shipmentFiltersToQueryParams", () => {
  it("omits defaults so the URL only carries real narrowing", () => {
    expect(shipmentFiltersToQueryParams(filters())).toEqual({});
  });

  it("serialises every set filter", () => {
    expect(
      shipmentFiltersToQueryParams(
        filters({
          search: "  EZH1  ",
          status: "delivered",
          carrierCode: "DHL",
          fulfillmentType: "local",
          paymentStatus: "paid",
          paymentMethod: "CREDIT",
          originCountry: "CN",
          destinationCountry: "SA",
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
        }),
      ),
    ).toEqual({
      search: "EZH1",
      status: "delivered",
      carrierCode: "DHL",
      fulfillmentType: "local",
      paymentStatus: "paid",
      paymentMethod: "CREDIT",
      originCountry: "CN",
      destinationCountry: "SA",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
  });
});
