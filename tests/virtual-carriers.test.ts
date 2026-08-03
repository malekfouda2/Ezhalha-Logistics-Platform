import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fizzpaAdapter, shipoxAdapter } from "../server/integrations/local-carriers";
import { carrierService, getCarrierAdapter } from "../server/integrations/carriers";
import { CarrierError, type CreateShipmentRequest } from "../server/integrations/fedex";
import { buildGenericCarrierShipmentRequestFromShipment } from "../server/services/generic-carrier-shipment";

const shipmentRequest: CreateShipmentRequest = {
  shipper: { name: "Warehouse", streetLine1: "Depot 1", city: "Riyadh", postalCode: "", countryCode: "SA", phone: "+966500000000" },
  recipient: { name: "Buyer", streetLine1: "Dest St", city: "Jeddah", postalCode: "", countryCode: "SA", phone: "+966555000111" },
  packages: [{ weight: 2, weightUnit: "KG", packageType: "PARCEL" }],
  serviceType: "LOCAL",
  currency: "SAR",
  note: "Assign to X Express",
};

const CONFIG_KEYS = [
  "FIZZPA_API_KEY", "FIZZPA_REFERER", "FIZZPA_CITY_MAP",
  "SHIPOX_USERNAME", "SHIPOX_PASSWORD",
];

afterEach(() => {
  vi.unstubAllGlobals();
  CONFIG_KEYS.forEach((k) => delete process.env[k]);
});

describe("Aggregator providers — capability + registry", () => {
  it("Fizzpa and Shipox are local, providerOnly", () => {
    for (const a of [fizzpaAdapter, shipoxAdapter]) {
      expect(a.capabilities?.type).toBe("local");
      expect(a.capabilities?.domesticCountries).toContain("SA");
      expect(a.capabilities?.providerOnly).toBe(true);
    }
  });

  it("are resolvable by code for booking", () => {
    expect(getCarrierAdapter("FIZZPA").carrierCode).toBe("FIZZPA");
    expect(getCarrierAdapter("SHIPOX").carrierCode).toBe("SHIPOX");
  });

  it("are hidden from the client-facing local carrier list", () => {
    const codes = carrierService.getLocalCarriers("SA").map((a) => a.carrierCode);
    expect(codes).not.toContain("FIZZPA");
    expect(codes).not.toContain("SHIPOX");
    // Real local carriers stay visible.
    expect(codes).toContain("SMSA");
  });

  it("expose no live rate API (rate card fallback)", async () => {
    const req = { shipper: shipmentRequest.shipper, recipient: shipmentRequest.recipient, packages: shipmentRequest.packages };
    expect(await fizzpaAdapter.getRates(req)).toEqual([]);
    expect(await shipoxAdapter.getRates(req)).toEqual([]);
  });
});

describe("Fizzpa adapter — booking with assignment note", () => {
  beforeEach(() => {
    process.env.FIZZPA_API_KEY = "fz-key";
    process.env.FIZZPA_REFERER = "https://app.ezhalha.co";
    process.env.FIZZPA_CITY_MAP = JSON.stringify({ riyadh: 1, jeddah: 2 });
  });

  it("books via POST /orders with the courier note and resolved CityId", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/orders/label/")) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return new Response(JSON.stringify({ OrderId: "FZ-100" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fizzpaAdapter.createShipment(shipmentRequest);
    expect(res.trackingNumber).toBe("FZ-100");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/orders");
    const sent = JSON.parse((init as any).body);
    expect(sent.OrderNote).toBe("Assign to X Express");
    expect(sent.RecipientCityId).toBe(2);
    expect((init as any).headers.Authorization).toBe("fz-key");
    expect((init as any).headers.Referer).toBe("https://app.ezhalha.co");
  });

  it("fails clearly when the recipient city has no CityId mapping", async () => {
    process.env.FIZZPA_CITY_MAP = JSON.stringify({ riyadh: 1 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(fizzpaAdapter.createShipment(shipmentRequest)).rejects.toThrow(/CityId/);
  });

  it("is unconfigured without an API key", () => {
    delete process.env.FIZZPA_API_KEY;
    expect(fizzpaAdapter.isConfigured()).toBe(false);
  });
});

describe("Shipox adapter — booking with assignment note", () => {
  beforeEach(() => {
    process.env.SHIPOX_USERNAME = "user@ez.co";
    process.env.SHIPOX_PASSWORD = "pw";
  });

  it("authenticates then books via POST order with note", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/authenticate")) {
        return new Response(JSON.stringify({ id_token: "jwt-123" }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { order_number: "SX-777" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await shipoxAdapter.createShipment(shipmentRequest);
    expect(res.trackingNumber).toBe("SX-777");

    const orderCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/customer/order"))!;
    const sent = JSON.parse((orderCall[1] as any).body);
    expect(sent.note).toBe("Assign to X Express");
    expect((orderCall[1] as any).headers.Authorization).toBe("Bearer jwt-123");
  });

  it("is unconfigured without username/password", () => {
    delete process.env.SHIPOX_USERNAME;
    expect(shipoxAdapter.isConfigured()).toBe(false);
  });
});

describe("Generic carrier request — virtual carrier note injection", () => {
  it("forwards carrierAssignmentNote onto the carrier request note", async () => {
    const shipment: any = {
      senderName: "WH", senderAddress: "A", senderCity: "Riyadh", senderCountry: "SA", senderPhone: "+966500000000",
      recipientName: "B", recipientAddress: "C", recipientCity: "Jeddah", recipientCountry: "SA", recipientPhone: "+966555000111",
      weight: "2", weightUnit: "KG", packageType: "PARCEL", currency: "SAR",
      trackingNumber: "EZ-1", createdAt: new Date(),
      carrierAssignmentNote: "Assign to X Express",
    };
    const { carrierRequest } = await buildGenericCarrierShipmentRequestFromShipment(shipment);
    expect(carrierRequest.note).toBe("Assign to X Express");
  });

  it("leaves note undefined for ordinary carriers", async () => {
    const shipment: any = {
      senderName: "WH", senderAddress: "A", senderCity: "Riyadh", senderCountry: "SA", senderPhone: "+966500000000",
      recipientName: "B", recipientAddress: "C", recipientCity: "Jeddah", recipientCountry: "SA", recipientPhone: "+966555000111",
      weight: "2", weightUnit: "KG", packageType: "PARCEL", currency: "SAR",
      trackingNumber: "EZ-1", createdAt: new Date(),
      carrierAssignmentNote: null,
    };
    const { carrierRequest } = await buildGenericCarrierShipmentRequestFromShipment(shipment);
    expect(carrierRequest.note).toBeUndefined();
  });
});
