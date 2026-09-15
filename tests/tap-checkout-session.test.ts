import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { formatTapAmount, tapService } from "../server/integrations/tap";
import { buildTapCheckoutSession } from "../server/services/tap-checkout";

/**
 * Tap's native Checkout SDK creates the charge on the device, from the public key. The only thing
 * standing between that and a customer paying an amount of their own choosing is `hashString` —
 * an HMAC the secret key produces here and Tap verifies on its side.
 *
 * So these tests are about two things: the signature is byte-exact (Tap compares it literally and
 * a mismatch surfaces as an unhelpful failure inside the payment sheet), and the session we hand
 * the app carries no secret.
 */

const PUBLIC_KEY = "pk_test_checkout_sdk";
const SECRET_KEY = "sk_test_do_not_leak";

const originalEnv = {
  publicKey: process.env.TAP_PUBLIC_KEY,
  secretKey: process.env.TAP_SECRET_KEY,
  merchantId: process.env.TAP_MERCHANT_ID,
  savedCards: process.env.TAP_ENABLE_SAVED_CARDS,
};

beforeEach(() => {
  process.env.TAP_PUBLIC_KEY = PUBLIC_KEY;
  process.env.TAP_SECRET_KEY = SECRET_KEY;
  process.env.TAP_MERCHANT_ID = "merchant_1";
  process.env.TAP_ENABLE_SAVED_CARDS = "true";
});

afterEach(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("TAP_PUBLIC_KEY", originalEnv.publicKey);
  restore("TAP_SECRET_KEY", originalEnv.secretKey);
  restore("TAP_MERCHANT_ID", originalEnv.merchantId);
  restore("TAP_ENABLE_SAVED_CARDS", originalEnv.savedCards);
});

const customer = {
  firstName: "Turki",
  lastName: "AlMutairi",
  email: "turki@example.com",
  phone: { countryCode: "966", number: "512345678" },
};

const session = (overrides: Partial<Parameters<typeof buildTapCheckoutSession>[0]> = {}) =>
  buildTapCheckoutSession({
    amount: 1457.7,
    currency: "SAR",
    description: "Shipment EZH043868517",
    customer,
    reference: { transaction: "EZH043868517", order: "3f6c1d9e-0000-4000-8000-000000000001" },
    metadata: { kind: "shipment", shipmentId: "3f6c1d9e-0000-4000-8000-000000000001" },
    postUrl: "https://app.ezhalha.co/api/webhooks/tap",
    redirectUrl: "https://app.ezhalha.co/api/payments/tap/redirect",
    ...overrides,
  });

describe("checkout hash string", () => {
  it("signs the exact string Tap expects", () => {
    // Recomputed independently here. If the concatenation in tap.ts is ever reordered or a
    // separator changes, this fails rather than the payment sheet failing in a customer's hands.
    const expected = crypto
      .createHmac("sha256", SECRET_KEY)
      .update(
        `x_publickey${PUBLIC_KEY}` +
          `x_amount1457.70` +
          `x_currencySAR` +
          `x_transactionEZH043868517` +
          `x_posthttps://app.ezhalha.co/api/webhooks/tap`,
      )
      .digest("hex");

    expect(
      tapService.buildCheckoutHashString({
        amount: 1457.7,
        currency: "SAR",
        transactionReference: "EZH043868517",
        postUrl: "https://app.ezhalha.co/api/webhooks/tap",
      }),
    ).toBe(expected);
  });

  it("formats the amount with the decimals the currency uses", () => {
    // Tap signs the presented amount, and KWD/BHD carry three. Signing "10.00" for a KWD charge
    // presented as "10.000" is a mismatch.
    expect(formatTapAmount(10, "SAR")).toBe("10.00");
    expect(formatTapAmount(10, "KWD")).toBe("10.000");

    const kwd = tapService.buildCheckoutHashString({
      amount: 10,
      currency: "KWD",
      transactionReference: "T1",
      postUrl: "https://example.com/hook",
    });
    const sar = tapService.buildCheckoutHashString({
      amount: 10,
      currency: "SAR",
      transactionReference: "T1",
      postUrl: "https://example.com/hook",
    });
    expect(kwd).not.toBe(sar);
  });

  it("changes when any signed field changes", () => {
    const base = session().configurations.hashString;
    expect(session({ amount: 1457.71 }).configurations.hashString).not.toBe(base);
    expect(session({ currency: "USD" }).configurations.hashString).not.toBe(base);
    expect(
      session({ reference: { transaction: "EZH000000001", order: "x" } }).configurations.hashString,
    ).not.toBe(base);
    expect(session({ postUrl: "https://evil.example/hook" }).configurations.hashString).not.toBe(base);
  });

  it("returns null rather than an unsigned session when Tap is not configured", () => {
    delete process.env.TAP_SECRET_KEY;
    expect(
      tapService.buildCheckoutHashString({
        amount: 1,
        currency: "SAR",
        transactionReference: "T1",
        postUrl: "https://example.com/hook",
      }),
    ).toBeNull();
    expect(session().configured).toBe(false);
  });
});

describe("checkout session payload", () => {
  it("never includes the secret key", () => {
    // The whole payload crosses the network to a mobile client.
    expect(JSON.stringify(session())).not.toContain(SECRET_KEY);
  });

  it("carries the public key and merchant id for the SDK gateway", () => {
    const { configurations, configured } = session();
    expect(configured).toBe(true);
    expect(configurations.gateway).toEqual({ publicKey: PUBLIC_KEY, merchantId: "merchant_1" });
  });

  it("carries the identity the webhook reconciles on", () => {
    const charge = (session().configurations.transaction as any).charge;
    expect(charge.metadata.shipmentId).toBe("3f6c1d9e-0000-4000-8000-000000000001");
    // Repeated in reference because Tap always echoes reference back, metadata pass-through is
    // the SDK's business, and the webhook needs at least one of them to survive.
    expect(charge.reference.transaction).toBe("EZH043868517");
    expect(charge.reference.order).toBe("3f6c1d9e-0000-4000-8000-000000000001");
  });

  it("sets an idempotency reference so a double tap settles once", () => {
    const charge = (session().configurations.transaction as any).charge;
    expect(charge.reference.idempotent).toBe(charge.reference.order);
  });

  it("points the charge at our own webhook and redirect", () => {
    const charge = (session().configurations.transaction as any).charge;
    expect(charge.post).toEqual({ url: "https://app.ezhalha.co/api/webhooks/tap" });
    expect(charge.redirect).toEqual({ url: "https://app.ezhalha.co/api/payments/tap/redirect" });
  });

  it("states the order amount with the currency's decimals", () => {
    const order = session().configurations.order as any;
    expect(order.amount).toBe("1457.70");
    expect(order.currency).toBe("SAR");
    expect(order.items).toEqual([
      { name: "Shipment EZH043868517", amount: "1457.70", currency: "SAR", quantity: 1 },
    ]);
  });

  it("drops a phone Tap would reject instead of failing the whole session", () => {
    const withBadPhone = session({
      customer: { ...customer, phone: { countryCode: "00966", number: "abc" } },
    });
    expect((withBadPhone.configurations.customer as any).phone).toBeUndefined();
    expect((session().configurations.customer as any).phone).toEqual({
      countryCode: "966",
      number: "512345678",
    });
  });

  it("only offers to save a card when saved cards are enabled", () => {
    expect(((session({ saveCard: true }).configurations.transaction as any).charge).saveCard).toBe(true);

    process.env.TAP_ENABLE_SAVED_CARDS = "false";
    expect(((session({ saveCard: true }).configurations.transaction as any).charge).saveCard).toBe(false);
    expect((session().configurations.cardOptions as any).saveCardOption).toBe("none");
  });

  it("falls back to English for a language the SDK does not support", () => {
    expect(session({ language: "ar" }).configurations.language).toBe("ar");
    expect(session({ language: "fr" }).configurations.language).toBe("en");
    expect(session().configurations.language).toBe("en");
  });
});
