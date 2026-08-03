import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smsaAdapter, naqelAdapter, imileAdapter } from "../server/integrations/local-carriers";
import { CarrierError, type CreateShipmentRequest } from "../server/integrations/fedex";

const shipmentRequest: CreateShipmentRequest = {
  shipper: { name: "Warehouse", streetLine1: "Depot 1", city: "Riyadh", postalCode: "", countryCode: "SA", phone: "+966500000000" },
  recipient: { name: "Buyer", streetLine1: "Dest St", city: "Jeddah", postalCode: "", countryCode: "SA", phone: "+966555000111" },
  packages: [{ weight: 2, weightUnit: "KG", packageType: "PARCEL" }],
  serviceType: "LOCAL",
  currency: "SAR",
};

const CONFIG_KEYS = ["SMSA_API_KEY", "SMSA_ACCOUNT_NUMBER", "NAQEL_CLIENT_ID", "NAQEL_PASSWORD", "NAQEL_ACCOUNT_NUMBER", "IMILE_CUSTOMER_ID", "IMILE_SIGN"];

afterEach(() => {
  vi.unstubAllGlobals();
  CONFIG_KEYS.forEach((k) => delete process.env[k]);
});

describe("Local carrier adapters — capability + gating", () => {
  it("advertise local KSA capability", () => {
    for (const a of [smsaAdapter, naqelAdapter]) {
      expect(a.capabilities?.type).toBe("local");
      expect(a.capabilities?.domesticCountries).toContain("SA");
    }
  });

  it("are unconfigured without credentials → no live rates, booking throws, tracking pending", async () => {
    for (const a of [smsaAdapter, naqelAdapter]) {
      expect(a.isConfigured()).toBe(false);
      expect(await a.getRates({ shipper: shipmentRequest.shipper, recipient: shipmentRequest.recipient, packages: shipmentRequest.packages })).toEqual([]);
      await expect(a.createShipment(shipmentRequest)).rejects.toBeInstanceOf(CarrierError);
      expect((await a.trackShipment("X123")).status).toBe("pending");
    }
  });
});

describe("SMSA adapter — live calls when configured", () => {
  beforeEach(() => {
    process.env.SMSA_API_KEY = "test-key";
    process.env.SMSA_ACCOUNT_NUMBER = "ACC1";
  });

  it("flips to configured and books via the REST API (AWB + label)", async () => {
    expect(smsaAdapter.isConfigured()).toBe(true);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/shipment") && !String(url).includes("/label")) {
        return new Response(JSON.stringify({ sawb: "SM-999", awbData: "JVBERi0=" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await smsaAdapter.createShipment(shipmentRequest);
    expect(res.trackingNumber).toBe("SM-999");
    expect(res.carrierTrackingNumber).toBe("SM-999");
    expect(res.labelData).toBe("JVBERi0=");
    // apikey header was sent
    const [, init] = fetchMock.mock.calls[0];
    expect((init as any).headers.apikey).toBe("test-key");
  });

  it("surfaces a carrier error when the API rejects booking", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "bad account" }), { status: 400 })));
    await expect(smsaAdapter.createShipment(shipmentRequest)).rejects.toThrow(/bad account/);
  });
});

describe("iMile adapter — live calls when configured", () => {
  beforeEach(() => {
    process.env.IMILE_CUSTOMER_ID = "C2102175701";
    process.env.IMILE_SIGN = "test-secret";
  });

  it("advertises 'both' capability (local KSA/AE + international/express)", () => {
    expect(imileAdapter.capabilities?.type).toBe("both");
    expect(imileAdapter.capabilities?.domesticCountries).toEqual(expect.arrayContaining(["SA", "AE"]));
  });

  it("grants a token then books (envelope carries sign + accessToken; SA→KSA)", async () => {
    expect(imileAdapter.isConfigured()).toBe(true);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/auth/accessToken/grant")) {
        return new Response(JSON.stringify({ code: "200", data: { accessToken: "tok-1", expiresIn: 7200 } }), { status: 200 });
      }
      if (String(url).includes("/client/order/v2/createOrder")) {
        return new Response(JSON.stringify({ code: "200", data: { expressNo: "IM-777", imileAwb: "JVBERi0=" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: "200", data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await imileAdapter.createShipment(shipmentRequest);
    expect(res.trackingNumber).toBe("IM-777");
    expect(res.labelData).toBe("JVBERi0=");

    const createCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/createOrder"))!;
    const body = JSON.parse((createCall[1] as any).body);
    expect(body.sign).toBe("test-secret");
    expect(body.accessToken).toBe("tok-1");
    expect(body.param.orderType).toBe("100");
    expect(body.param.senderInfo.country).toBe("KSA");
    expect(body.param.consigneeInfo.country).toBe("KSA");
  });

  it("returns a live rate from calShippingFee (data.totalAmount)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/auth/accessToken/grant")) {
        return new Response(JSON.stringify({ code: "200", data: { accessToken: "tok-r", expiresIn: 7200 } }), { status: 200 });
      }
      if (String(url).includes("/client/order/calShippingFee")) {
        return new Response(JSON.stringify({ code: "200", data: { weight: "3", currency: "SAR", totalAmount: "17.5" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: "200", data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rates = await imileAdapter.getRates(shipmentRequest);
    expect(rates).toHaveLength(1);
    expect(rates[0].baseRate).toBe(17.5);
    expect(rates[0].currency).toBe("SAR");
    expect(rates[0].chargeableWeightSource).toBe("carrier");
    const feeCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/calShippingFee"))!;
    expect(JSON.parse((feeCall[1] as any).body).param.consigneeInfo.country).toBe("KSA");
  });

  it("falls back to the rate card (no live rate) when the estimate is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/auth/accessToken/grant")) {
        return new Response(JSON.stringify({ code: "200", data: { accessToken: "tok-r2", expiresIn: 7200 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: "400", message: "Product Service no open" }), { status: 200 });
    }));
    expect(await imileAdapter.getRates(shipmentRequest)).toEqual([]);
  });

  it("surfaces a non-200 app code as a CarrierError", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/auth/accessToken/grant")) {
        return new Response(JSON.stringify({ code: "200", data: { accessToken: "tok-2", expiresIn: 7200 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: "30001", message: "Duplicate order number" }), { status: 200 });
    }));
    await expect(imileAdapter.createShipment(shipmentRequest)).rejects.toThrow(/Duplicate order number/);
  });

  it("parses the locus history newest-last on track", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/auth/accessToken/grant")) {
        return new Response(JSON.stringify({ code: "200", data: { accessToken: "tok-3", expiresIn: 7200 } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        code: "200",
        data: {
          latestStatus: "Delivered",
          locus: [
            { latestStatus: "Delivered", latestStatusTime: "2025-08-26 16:16:34", latestSite: "Dubai Center", locusDetailed: "Delivered." },
            { latestStatus: "OFD", latestStatusTime: "2025-08-26 16:15:55", locusDetailed: "Out for delivery." },
          ],
        },
      }), { status: 200 });
    }));
    const res = await imileAdapter.trackShipment("IM-777");
    expect(res.status).toBe("delivered");
    expect(res.events).toHaveLength(2);
    expect(res.events[res.events.length - 1].status).toBe("Delivered");
  });
});

describe("Naqel adapter — live calls when configured", () => {
  beforeEach(() => {
    process.env.NAQEL_CLIENT_ID = "cid";
    process.env.NAQEL_PASSWORD = "pw";
    process.env.NAQEL_ACCOUNT_NUMBER = "N1";
  });

  it("flips to configured and books via the REST API (waybill)", async () => {
    expect(naqelAdapter.isConfigured()).toBe(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ WaybillNo: "NQ-555", LabelURL: "https://x/y.pdf" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await naqelAdapter.createShipment(shipmentRequest);
    expect(res.trackingNumber).toBe("NQ-555");
    expect(res.labelUrl).toBe("https://x/y.pdf");
    // ClientInfo carried the credentials
    const [, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse((init as any).body);
    expect(sent.ClientInfo.ClientID).toBe("cid");
  });
});
