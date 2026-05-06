import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    findHsCodeMapping: vi.fn().mockResolvedValue(null),
    upsertHsCodeMapping: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../server/services/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import { lookupHsCode } from "../server/services/hsLookup";

const ORIGINAL_ENV = { ...process.env };

describe("lookupHsCode", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("falls back without calling FedEx when production FedEx config is partial", async () => {
    process.env.NODE_ENV = "production";
    process.env.FEDEX_CLIENT_ID = "client-id";
    process.env.FEDEX_CLIENT_SECRET = "client-secret";
    delete process.env.FEDEX_ACCOUNT_NUMBER;
    delete process.env.FEDEX_BASE_URL;

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await lookupHsCode({
      itemName: "Wireless Keyboard",
      category: "electronics",
      countryOfOrigin: "US",
      destinationCountry: "SA",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe("UNKNOWN");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("falls back without calling FedEx when production FedEx base URL is sandbox", async () => {
    process.env.NODE_ENV = "production";
    process.env.FEDEX_CLIENT_ID = "client-id";
    process.env.FEDEX_CLIENT_SECRET = "client-secret";
    process.env.FEDEX_ACCOUNT_NUMBER = "123456789";
    process.env.FEDEX_BASE_URL = "https://apis-sandbox.fedex.com";

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await lookupHsCode({
      itemName: "Wireless Keyboard",
      category: "electronics",
      countryOfOrigin: "US",
      destinationCountry: "SA",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe("UNKNOWN");
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
