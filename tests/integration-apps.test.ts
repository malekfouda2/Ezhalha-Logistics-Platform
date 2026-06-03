import { describe, it, expect, vi, afterEach } from "vitest";
import {
  encryptIntegrationPayload,
  getIntegrationDefinition,
  runIntegrationAccountTest,
  sanitizeIntegrationValues,
} from "../server/services/integration-apps";
import type { IntegrationAccount } from "../shared/schema";

function account(overrides: Partial<IntegrationAccount>): IntegrationAccount {
  return {
    id: "integration-account-test",
    appKey: "fedex",
    appName: "FedEx",
    category: "shipping",
    accountName: "FedEx Sandbox",
    environment: "sandbox",
    countryCode: "SA",
    region: null,
    priority: 100,
    isActive: true,
    isDefault: true,
    credentialsEncrypted: encryptIntegrationPayload({}),
    settings: null,
    capabilities: JSON.stringify(["Rates"]),
    lastTestedAt: null,
    lastTestSuccess: null,
    lastTestMessage: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("integration app account validation", () => {
  it("rejects unsupported integration fields before they can reach runtime environment values", () => {
    const definition = getIntegrationDefinition("fedex")!;

    expect(() => sanitizeIntegrationValues(definition, {
      NODE_OPTIONS: "--require ./malicious.js",
    })).toThrow("Unsupported integration field");
  });

  it("rejects provider base URLs outside the approved host allowlist", () => {
    const definition = getIntegrationDefinition("tap")!;

    expect(() => sanitizeIntegrationValues(definition, {
      TAP_BASE_URL: "https://example.com/v2",
    })).toThrow("approved HTTPS provider host");
  });

  it("fails before network validation when required credentials are missing", async () => {
    const result = await runIntegrationAccountTest(account({
      appKey: "dhl",
      appName: "DHL Express",
      credentialsEncrypted: encryptIntegrationPayload({
        DHL_API_KEY: "key",
      }),
    }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("Missing required credentials");
    expect(result.message).toContain("API Secret");
  });

  it("validates FedEx credentials through OAuth token endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "token" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runIntegrationAccountTest(account({
      credentialsEncrypted: encryptIntegrationPayload({
        FEDEX_API_KEY: "client-id",
        FEDEX_SECRET_KEY: "client-secret",
        FEDEX_ACCOUNT_NUMBER: "123456789",
        FEDEX_BASE_URL: "https://apis-sandbox.fedex.com",
      }),
    }));

    expect(result.success).toBe(true);
    expect(result.message).toContain("FedEx OAuth validation succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://apis-sandbox.fedex.com/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("treats DHL non-auth client errors as reachable because full validation requires shipment data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Bad request" }), { status: 400 }),
      ),
    );

    const result = await runIntegrationAccountTest(account({
      appKey: "dhl",
      appName: "DHL Express",
      credentialsEncrypted: encryptIntegrationPayload({
        DHL_API_KEY: "key",
        DHL_API_SECRET: "secret",
        DHL_ACCOUNT_NUMBER: "123456789",
        DHL_BASE_URL: "https://express.api.dhl.com/mydhlapi/test",
      }),
    }));

    expect(result.success).toBe(true);
    expect(result.message).toContain("DHL endpoint responded");
  });
});
