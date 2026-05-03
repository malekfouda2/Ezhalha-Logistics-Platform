import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createIntegrationLog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { validateFedExEnvOnStartup } from "../server/integrations/fedex";

const ORIGINAL_ENV = { ...process.env };

describe("validateFedExEnvOnStartup", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not throw in production when FedEx is fully disabled", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FEDEX_CLIENT_ID;
    delete process.env.FEDEX_API_KEY;
    delete process.env.FEDEX_CLIENT_SECRET;
    delete process.env.FEDEX_SECRET_KEY;
    delete process.env.FEDEX_ACCOUNT_NUMBER;
    delete process.env.FEDEX_BASE_URL;

    expect(() => validateFedExEnvOnStartup()).not.toThrow();
  });

  it("throws in production when FedEx config is partial", () => {
    process.env.NODE_ENV = "production";
    process.env.FEDEX_CLIENT_ID = "client-id";
    process.env.FEDEX_CLIENT_SECRET = "client-secret";
    delete process.env.FEDEX_ACCOUNT_NUMBER;
    delete process.env.FEDEX_BASE_URL;

    expect(() => validateFedExEnvOnStartup()).toThrow(
      "FATAL: Missing required FedEx env vars in production: FEDEX_ACCOUNT_NUMBER, FEDEX_BASE_URL",
    );
  });

  it("accepts alias env keys when FedEx is fully configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FEDEX_CLIENT_ID;
    delete process.env.FEDEX_CLIENT_SECRET;
    process.env.FEDEX_API_KEY = "client-id";
    process.env.FEDEX_SECRET_KEY = "client-secret";
    process.env.FEDEX_ACCOUNT_NUMBER = "123456789";
    process.env.FEDEX_BASE_URL = "https://apis.fedex.com";

    expect(() => validateFedExEnvOnStartup()).not.toThrow();
  });
});
