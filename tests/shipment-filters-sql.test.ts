import { beforeAll, describe, expect, it } from "vitest";

import { storage } from "../server/storage";
import {
  DEFAULT_SHIPMENT_FILTERS,
  matchesShipmentFilters,
  type ShipmentFilters,
} from "@shared/shipment-filters";
import type { InsertShipment } from "@shared/schema";

// The client portal filters in memory and the admin portal filters in SQL. Both are supposed to
// mean the same thing. This suite runs the same filter through both and asserts they select the
// same shipments — the only way that stays true as either side changes.
const PREFIX = `FLT${Date.now()}`;
let clientAccountId: string;
// storage.createShipment always generates its own tracking number, so the fixtures are keyed by
// the id it hands back rather than by anything we pass in.
const created: Record<string, string> = {};

const base = (overrides: Partial<InsertShipment>): InsertShipment => ({
  clientAccountId,
  senderName: "Shenzhen Supplier",
  senderAddress: "1 Supplier Road",
  senderCity: "Shenzhen",
  senderCountry: "CN",
  senderPhone: "8615700000001",
  recipientName: "Aisha Rahman",
  recipientAddress: "2 Recipient Road",
  recipientCity: "Riyadh",
  recipientCountry: "SA",
  recipientPhone: "966555000001",
  weight: "2.00",
  weightUnit: "KG",
  packageType: "YOUR_PACKAGING",
  shipmentType: "inbound",
  status: "created",
  baseRate: "50.00",
  marginAmount: "10.00",
  margin: "10.00",
  finalPrice: "69.00",
  accountingCurrency: "SAR",
  costAmountSar: "50.00",
  sellSubtotalAmountSar: "60.00",
  sellTaxAmountSar: "9.00",
  clientTotalAmountSar: "69.00",
  systemCostTotalAmountSar: "50.00",
  revenueExcludingTaxAmountSar: "10.00",
  currency: "SAR",
  ...overrides,
} as InsertShipment);

beforeAll(async () => {
  const account = await storage.createClientAccount({
    name: `Filter Fixture ${PREFIX}`,
    email: `filters-${PREFIX}@example.com`.toLowerCase(),
    phone: "966555000000",
    country: "SA",
    city: "Riyadh",
    address: "1 Test Street",
  } as any);
  clientAccountId = account.id;

  const rows: Partial<InsertShipment>[] = [
    { trackingNumber: `${PREFIX}A`, carrierCode: "FEDEX", fulfillmentType: "carrier", paymentStatus: "paid", paymentMethod: "PAY_NOW", status: "created", senderCountry: "CN", recipientCountry: "SA" },
    { trackingNumber: `${PREFIX}B`, carrierCode: "DHL", fulfillmentType: "carrier", paymentStatus: "pending", paymentMethod: "PAY_NOW", status: "in_transit", senderCountry: "GB", recipientCountry: "SA" },
    { trackingNumber: `${PREFIX}C`, carrierCode: "IMILE", fulfillmentType: "local", paymentStatus: "paid", paymentMethod: "CREDIT", status: "delivered", senderCountry: "SA", recipientCountry: "SA" },
    { trackingNumber: `${PREFIX}D`, carrierCode: "DDP", fulfillmentType: "ddp_manual", paymentStatus: "unpaid", paymentMethod: "CREDIT", status: "out_for_delivery", senderCountry: "CN", recipientCountry: "EG" },
    // No fulfillmentType at all: the legacy shape that must still count as Express.
    { trackingNumber: `${PREFIX}E`, carrierCode: "FEDEX", paymentStatus: "paid", paymentMethod: "PAY_NOW", status: "cancelled", senderCountry: "TR", recipientCountry: "SA" },
  ];
  for (const row of rows) {
    const key = String(row.trackingNumber).slice(-1);
    const saved = await storage.createShipment(base(row));
    created[key] = saved.trackingNumber;
  }
});

async function bothAgree(overrides: Partial<ShipmentFilters>) {
  const filters: ShipmentFilters = { ...DEFAULT_SHIPMENT_FILTERS, ...overrides };

  const sqlResult = await storage.getShipmentsPaginated({
    page: 1,
    limit: 100,
    clientAccountIds: [clientAccountId],
    search: filters.search || undefined,
    status: filters.status,
    carrierCode: filters.carrierCode,
    fulfillmentType: filters.fulfillmentType,
    paymentStatus: filters.paymentStatus,
    paymentMethod: filters.paymentMethod,
    originCountry: filters.originCountry,
    destinationCountry: filters.destinationCountry,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const all = await storage.getShipmentsByClientAccount(clientAccountId);
  const inMemory = all.filter((s) => matchesShipmentFilters(s as any, filters));

  const sqlIds = sqlResult.shipments.map((s) => s.trackingNumber).sort();
  const memIds = inMemory.map((s) => s.trackingNumber).sort();
  return { sqlIds, memIds };
}

describe("SQL filters match the in-memory predicate", () => {
  const cases: [string, Partial<ShipmentFilters>][] = [
    ["no filters", {}],
    ["carrier", { carrierCode: "FEDEX" }],
    ["type express (includes the legacy null row)", { fulfillmentType: "carrier" }],
    ["type local", { fulfillmentType: "local" }],
    ["type door to door", { fulfillmentType: "ddp_manual" }],
    ["payment status paid", { paymentStatus: "paid" }],
    ["payment method credit", { paymentMethod: "CREDIT" }],
    ["origin country", { originCountry: "CN" }],
    ["destination country", { destinationCountry: "EG" }],
    ["a single raw status", { status: "delivered" }],
    ["a lifecycle group", { status: "in_transit" }],
    ["search term", { search: "Aisha" }],
    ["combined", { carrierCode: "FEDEX", paymentStatus: "paid", originCountry: "CN" }],
    ["combination matching nothing", { carrierCode: "DHL", originCountry: "CN" }],
  ];

  for (const [name, overrides] of cases) {
    it(name, async () => {
      const { sqlIds, memIds } = await bothAgree(overrides);
      expect(sqlIds).toEqual(memIds);
    });
  }

  it("expands a lifecycle group in SQL, not just in memory", async () => {
    // out_for_delivery is only reachable through the "in_transit" group.
    const { sqlIds } = await bothAgree({ status: "in_transit" });
    expect(sqlIds).toContain(created.B);
    expect(sqlIds).toContain(created.D);
    expect(sqlIds).not.toContain(created.C);
  });

  it("counts Express shipments that predate the fulfillmentType column", async () => {
    const { sqlIds } = await bothAgree({ fulfillmentType: "carrier" });
    expect(sqlIds).toContain(created.E);
  });

  it("returns facets limited to the values actually present", async () => {
    const facets = await storage.getShipmentFilterFacets({ clientAccountIds: [clientAccountId] });
    expect(facets.carrierCodes.sort()).toEqual(["DDP", "DHL", "FEDEX", "IMILE"]);
    expect(facets.originCountries.sort()).toEqual(["CN", "GB", "SA", "TR"]);
    expect(facets.destinationCountries.sort()).toEqual(["EG", "SA"]);
  });
});
