import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationAccount } from "../shared/schema";
import {
  INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY,
  IntegrationAccountCountryBasis,
} from "../shared/schema";
import { storage } from "../server/storage";
import { encryptIntegrationPayload } from "../server/services/integration-apps";
import {
  getEligibleIntegrationAccountsForShipment,
  getIntegrationEnv,
  selectCheapestCarrierAccountPortfolio,
  withIntegrationAccount,
} from "../server/services/integration-runtime";

function account(overrides: Partial<IntegrationAccount>): IntegrationAccount {
  return {
    id: "integration-account-test",
    appKey: "fedex",
    appName: "FedEx",
    category: "shipping",
    accountName: "FedEx Sandbox",
    environment: "sandbox",
    countryCode: null,
    region: null,
    priority: 100,
    isActive: true,
    isDefault: false,
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

beforeEach(() => {
  process.env.INTEGRATION_ACCOUNT_TEST_MODE = "true";
  vi.spyOn(storage, "getPlatformSetting").mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.INTEGRATION_ACCOUNT_TEST_MODE;
  delete process.env.FEDEX_SECRET_KEY;
  vi.restoreAllMocks();
});

describe("integration runtime routing", () => {
  it("returns exact-country accounts plus globals while excluding unrelated countries", async () => {
    vi.spyOn(storage, "getIntegrationAccounts").mockResolvedValue([
      account({ id: "fedex-global", accountName: "Global", countryCode: null, isDefault: true }),
      account({ id: "fedex-sa", accountName: "Saudi", countryCode: "SA", priority: 40 }),
      account({ id: "fedex-ae", accountName: "UAE", countryCode: "AE", priority: 1 }),
      account({ id: "fedex-inactive", accountName: "Inactive", countryCode: "SA", isActive: false }),
    ]);

    const accounts = await getEligibleIntegrationAccountsForShipment("fedex", {
      shipperCountryCode: "sa",
      environment: "sandbox",
    });

    expect(accounts.map((item) => item.id)).toEqual(["fedex-sa", "fedex-global"]);
  });

  it("does not inherit global secrets inside a managed account scope", async () => {
    process.env.FEDEX_SECRET_KEY = "global-secret-that-must-not-leak";
    const managedAccount = account({
      id: "fedex-managed",
      credentialsEncrypted: encryptIntegrationPayload({
        FEDEX_API_KEY: "managed-key",
      }),
    });

    await withIntegrationAccount(managedAccount, async () => {
      expect(getIntegrationEnv("FEDEX_API_KEY")).toBe("managed-key");
      expect(getIntegrationEnv("FEDEX_SECRET_KEY")).toBeUndefined();
    });

    expect(getIntegrationEnv("FEDEX_SECRET_KEY")).toBe("global-secret-that-must-not-leak");
  });

  it("can route regional accounts by the client base account country", async () => {
    vi.mocked(storage.getPlatformSetting).mockResolvedValue({
      key: INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY,
      value: IntegrationAccountCountryBasis.CLIENT_BASE_ACCOUNT_COUNTRY,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.spyOn(storage, "getIntegrationAccounts").mockResolvedValue([
      account({ id: "fedex-global", accountName: "Global", countryCode: null, isDefault: true }),
      account({ id: "fedex-sa", accountName: "Saudi", countryCode: "SA", priority: 40 }),
      account({ id: "fedex-ae", accountName: "UAE", countryCode: "AE", priority: 1 }),
    ]);

    const accounts = await getEligibleIntegrationAccountsForShipment("fedex", {
      shipperCountryCode: "SA",
      clientBaseCountryCode: "United Arab Emirates",
      environment: "sandbox",
    });

    expect(accounts.map((item) => item.id)).toEqual(["fedex-ae", "fedex-global"]);
  });

  it("keeps only the full service portfolio from the cheapest carrier account", () => {
    const winner = selectCheapestCarrierAccountPortfolio([
      {
        integrationAccountId: "fedex-sa-primary",
        carrierRates: [
          { baseRate: 110, serviceType: "ECONOMY" },
          { baseRate: 180, serviceType: "PRIORITY" },
        ],
      },
      {
        integrationAccountId: "fedex-sa-discounted",
        carrierRates: [
          { baseRate: 90, serviceType: "ECONOMY" },
          { baseRate: 145, serviceType: "PRIORITY" },
        ],
      },
      {
        integrationAccountId: "fedex-global",
        carrierRates: [
          { baseRate: 125, serviceType: "ECONOMY" },
        ],
      },
      {
        integrationAccountId: "fedex-empty",
        carrierRates: [],
      },
    ]);

    expect(winner?.integrationAccountId).toBe("fedex-sa-discounted");
    expect(winner?.carrierRates).toEqual([
      { baseRate: 90, serviceType: "ECONOMY" },
      { baseRate: 145, serviceType: "PRIORITY" },
    ]);
  });
});
