import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSalesChannelAdapter, getSignatureHeader } from "../server/services/sales-channels";
import { needsRefresh, zidAuthHeaders, type ZidCredentials } from "../server/services/zid-oauth";

const zid = getSalesChannelAdapter("zid")!;

const credentials: ZidCredentials = {
  authorization: "AUTH-TOKEN",
  access_token: "MANAGER-TOKEN",
  refresh_token: "REFRESH-TOKEN",
  expires_at: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
};

const ctx = { clientAccountId: "client-1", salesChannelId: "channel-1" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zid auth headers", () => {
  it("puts each token in its own header", () => {
    // The single most common Zid integration bug: `authorization` is the bearer and
    // `access_token` is the manager token. Swapping them fails with an unhelpful 401.
    const headers = zidAuthHeaders(credentials);
    expect(headers.Authorization).toBe("Bearer AUTH-TOKEN");
    expect(headers["X-Manager-Token"]).toBe("MANAGER-TOKEN");
  });
});

describe("token refresh timing", () => {
  it("does not refresh a token with most of its year left", () => {
    expect(needsRefresh(credentials)).toBe(false);
  });

  it("refreshes once inside the lead window", () => {
    // Zid tokens last a year and so do refresh tokens. Missing the window disconnects every
    // store at once, roughly a year after launch.
    const nearExpiry = { ...credentials, expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() };
    expect(needsRefresh(nearExpiry)).toBe(true);
  });

  it("refreshes when the expiry is missing or unreadable", () => {
    expect(needsRefresh({ ...credentials, expires_at: undefined })).toBe(true);
    expect(needsRefresh({ ...credentials, expires_at: "not a date" })).toBe(true);
  });
});

describe("webhook authentication", () => {
  it("reads the Basic auth header, since Zid does not sign payloads", () => {
    expect(getSignatureHeader("zid", { authorization: "Basic abc" })).toBe("Basic abc");
  });

  it("accepts the credential Zid was given", () => {
    const secret = "zid_user:zid_password";
    const header = `Basic ${Buffer.from(secret).toString("base64")}`;
    expect(zid.verifySignature("{}", header, secret)).toBe(true);
  });

  it("rejects a wrong or missing credential", () => {
    const secret = "zid_user:zid_password";
    const wrong = `Basic ${Buffer.from("zid_user:nope").toString("base64")}`;
    expect(zid.verifySignature("{}", wrong, secret)).toBe(false);
    expect(zid.verifySignature("{}", undefined, secret)).toBe(false);
    expect(zid.verifySignature("{}", `Basic ${Buffer.from(secret).toString("base64")}`, "")).toBe(false);
  });
});

describe("normalising a Zid order", () => {
  const payload = {
    id: 90210,
    code: "ORD-1024",
    order_status: { code: "new" },
    payment_status: "paid",
    currency_code: "SAR",
    order_total: "349.00",
    customer: { name: "Sara Al Otaibi", mobile: "0551234567", email: "sara@example.com" },
    shipping: {
      address: {
        street: "King Fahd Road",
        district: "Al Olaya",
        city: "الرياض",
        postal_code: "12211",
        country_code: "SA",
      },
    },
    products: [
      { name: "Abaya", quantity: 2, price: 149.5, sku: "AB-1", weight: 0.4 },
      { name: "Scarf", quantity: 1, price: 50, sku: "SC-9", weight: 0.1 },
    ],
  };

  it("maps identity, customer and totals", () => {
    const order = zid.normalizeOrder(payload, ctx);
    expect(order.externalOrderId).toBe("90210");
    expect(order.externalOrderNumber).toBe("ORD-1024");
    expect(order.status).toBe("new");
    expect(order.currency).toBe("SAR");
    expect(order.orderTotal).toBe("349.00");
    expect(JSON.parse(order.customer as string).name).toBe("Sara Al Otaibi");
  });

  it("normalises the Saudi phone and Arabic city, like the WooCommerce path", () => {
    const order = zid.normalizeOrder(payload, ctx);
    expect(JSON.parse(order.customer as string).phone).toBe("+966551234567");
    // Arabic city names have to canonicalise or local carriers reject the destination.
    expect(JSON.parse(order.shipTo as string).city).toBe("Riyadh");
  });

  it("totals weight and pieces across line items", () => {
    const order = zid.normalizeOrder(payload, ctx);
    expect(order.packageWeightKg).toBe("0.900");
    expect(order.packagePieces).toBe(3);
  });

  it("finds the address wherever Zid put it", () => {
    // The payload shape varies with payload_type, so the adapter tries several keys rather
    // than assuming one and silently importing an empty address.
    const flat = { ...payload, shipping: undefined, shipping_address: payload.shipping.address };
    expect(JSON.parse(zid.normalizeOrder(flat, ctx).shipTo as string).city).toBe("Riyadh");
  });

  it("maps cancelled and delivered orders out of the new queue", () => {
    expect(zid.normalizeOrder({ ...payload, order_status: { code: "canceled" } }, ctx).status).toBe("cancelled");
    expect(zid.normalizeOrder({ ...payload, order_status: { code: "delivered" } }, ctx).status).toBe("delivered");
    expect(zid.normalizeOrder({ ...payload, order_status: { code: "indelivery" } }, ctx).status).toBe("shipped");
  });

  it("refuses a payload with no order id", () => {
    expect(() => zid.normalizeOrder({ code: "ORD-1" }, ctx)).toThrow(/missing an id/i);
  });
});

describe("pulling orders", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ orders: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  it("calls Zid's API with both tokens and asks for full payloads", async () => {
    await zid.fetchOrders!({ storeUrl: "", credentials: credentials as any, since: new Date("2026-08-01T00:00:00Z") });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("https://api.zid.sa/v1/managers/store/orders");
    // `simple` omits the products, and without products there is no weight or piece count.
    expect(String(url)).toContain("payload_type=default");
    expect(String(url)).toContain("date_attribute=updated_at");
    expect((init as any).headers.Authorization).toBe("Bearer AUTH-TOKEN");
    expect((init as any).headers["X-Manager-Token"]).toBe("MANAGER-TOKEN");
  });

  it("refuses to pull when the store was never connected", async () => {
    await expect(
      zid.fetchOrders!({ storeUrl: "", credentials: {} as any, since: null }),
    ).rejects.toThrow(/not connected/i);
  });

  it("needs no store URL, unlike WooCommerce", () => {
    // Zid identifies the store from the token, so requiring a URL would mean inventing one.
    expect(zid.requiresStoreUrl).toBe(false);
    expect(getSalesChannelAdapter("woocommerce")!.requiresStoreUrl).toBe(true);
  });
});
