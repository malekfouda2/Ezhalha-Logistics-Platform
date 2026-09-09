import { afterEach, describe, expect, it } from "vitest";
import {
  buildIntegrationLogResponse,
  truncateLoggedPayload,
} from "../server/services/integration-log-payload";

const passthrough = (data: any) => data;

afterEach(() => {
  delete process.env.NODE_ENV;
});

describe("what gets stored on a failure", () => {
  it("keeps the carrier's error body in production", () => {
    process.env.NODE_ENV = "production";

    // This is the regression that mattered: production recorded `{}` for every failure, so a
    // DHL pickup was retried fourteen times against an error nobody could read.
    const dhlError = {
      detail: "5006: Pickup is not allowed for this shipment date.",
      title: "Bad Request",
      status: "400",
    };

    const stored = buildIntegrationLogResponse({
      responseBody: dhlError,
      success: false,
      mask: passthrough,
    });

    expect(stored).toEqual(dhlError);
    expect(JSON.stringify(stored)).toContain("5006");
  });

  it("keeps a FedEx errors array, which the old shape never matched", () => {
    process.env.NODE_ENV = "production";

    // FedEx returns `errors`, plural. The previous code looked for a singular `error` key,
    // so it fell through to "not logged" every single time.
    const fedexError = {
      errors: [{ code: "PICKUP.STREETLINE.MISSING", message: "StreetLine is missing." }],
    };

    const stored = buildIntegrationLogResponse({
      responseBody: fedexError,
      success: false,
      mask: passthrough,
    });

    expect(JSON.stringify(stored)).toContain("PICKUP.STREETLINE.MISSING");
  });

  it("masks credentials that appear in a failure body", () => {
    process.env.NODE_ENV = "production";

    const stored = buildIntegrationLogResponse({
      responseBody: { access_token: "super-secret", detail: "nope" },
      success: false,
      mask: (data) => ({ ...data, access_token: "***MASKED***" }),
    });

    expect(JSON.stringify(stored)).not.toContain("super-secret");
    expect(JSON.stringify(stored)).toContain("nope");
  });

  it("still records something when the carrier sent no body at all", () => {
    process.env.NODE_ENV = "production";
    const stored = buildIntegrationLogResponse({ responseBody: null, success: false, mask: passthrough });
    expect(stored).toEqual({ logged: false, reason: "carrier returned no body" });
  });

  it("keeps the body when masking itself throws", () => {
    process.env.NODE_ENV = "production";
    const stored = buildIntegrationLogResponse({
      responseBody: { detail: "5006" },
      success: false,
      mask: () => {
        throw new Error("mask blew up");
      },
    }) as { unmaskable?: string };

    // Never let a masking failure turn into a lost error message.
    expect(stored.unmaskable).toBeDefined();
  });
});

describe("what gets stored on success", () => {
  it("stays out of the log in production", () => {
    process.env.NODE_ENV = "production";
    const stored = buildIntegrationLogResponse({
      responseBody: { products: [{ productCode: "P" }] },
      success: true,
      mask: passthrough,
    });

    // Successes are the volume and tell us nothing, so they are still withheld.
    expect(stored).toEqual({ logged: false, reason: "production" });
  });

  it("is kept in full outside production", () => {
    process.env.NODE_ENV = "development";
    const body = { products: [{ productCode: "P" }] };
    expect(buildIntegrationLogResponse({ responseBody: body, success: true, mask: passthrough }))
      .toEqual(body);
  });
});

describe("size capping", () => {
  it("leaves a normal payload untouched", () => {
    const small = { detail: "5006: Pickup is not allowed for this shipment date." };
    expect(truncateLoggedPayload(small)).toEqual(small);
  });

  it("caps an enormous payload and says that it did", () => {
    const huge = { blob: "x".repeat(20000) };
    const capped = truncateLoggedPayload(huge) as { truncated?: boolean; originalLength?: number };

    expect(capped.truncated).toBe(true);
    expect(capped.originalLength).toBeGreaterThan(4000);
    // Flagged rather than silently trimmed, so a cut-off message is never mistaken for the
    // whole of what the carrier said.
    expect(JSON.stringify(capped).length).toBeLessThan(20000);
  });

  it("survives a payload that cannot be serialised", () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => truncateLoggedPayload(circular)).not.toThrow();
  });
});
