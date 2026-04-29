import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";

import { formatTapAmount, TapService } from "../server/integrations/tap";

describe("TapService", () => {
  const originalSecret = process.env.TAP_SECRET_KEY;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TAP_SECRET_KEY;
    } else {
      process.env.TAP_SECRET_KEY = originalSecret;
    }
  });

  it("formats amounts using the currency precision expected by Tap", () => {
    expect(formatTapAmount(15, "SAR")).toBe("15.00");
    expect(formatTapAmount(15, "KWD")).toBe("15.000");
  });

  it("validates Tap webhook hashstring signatures for charges", () => {
    process.env.TAP_SECRET_KEY = "sk_test_tap_signature_secret";
    const service = new TapService();

    const event = {
      id: "chg_test_signature",
      object: "charge",
      amount: 120,
      currency: "SAR",
      status: "CAPTURED",
      reference: {
        gateway: "gw_123",
        payment: "payment_456",
      },
      transaction: {
        created: "1710000000000",
      },
    };

    const rawHashString =
      "x_idchg_test_signature" +
      "x_amount120.00" +
      "x_currencySAR" +
      "x_gateway_referencegw_123" +
      "x_payment_referencepayment_456" +
      "x_statusCAPTURED" +
      "x_created1710000000000";

    const hash = crypto
      .createHmac("sha256", process.env.TAP_SECRET_KEY!)
      .update(rawHashString)
      .digest("hex");

    expect(service.validateWebhookSignature(event, hash)).toBe(true);
    expect(service.validateWebhookSignature(event, `${hash}tampered`)).toBe(false);
  });

  it("returns a full mock charge payload when Tap is not configured", async () => {
    delete process.env.TAP_SECRET_KEY;
    const service = new TapService();

    const result = await service.createCharge({
      amount: 42,
      currency: "SAR",
      description: "Test charge",
      redirectUrl: "http://localhost/redirect",
      postUrl: "http://localhost/post",
      customer: {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
      },
      metadata: {
        kind: "invoice",
      },
    });

    expect(result.chargeId).toContain("tap_mock_");
    expect(result.status).toBe("CAPTURED");
    expect(result.charge.id).toBe(result.chargeId);
    expect(result.charge.metadata?.kind).toBe("invoice");
  });
});
