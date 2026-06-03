import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createIntegrationLog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { AramexAdapter } from "../server/integrations/aramex";

function setAramexEnv() {
  process.env.ARAMEX_USERNAME = "test-user";
  process.env.ARAMEX_PASSWORD = "test-password";
  process.env.ARAMEX_ACCOUNT_NUMBER = "123456";
  process.env.ARAMEX_ACCOUNT_PIN = "1234";
  process.env.ARAMEX_ACCOUNT_ENTITY = "RUH";
  process.env.ARAMEX_ACCOUNT_COUNTRY_CODE = "SA";
  process.env.ARAMEX_BASE_URL = "https://ws.dev.aramex.net";
}

function clearAramexEnv() {
  delete process.env.ARAMEX_USERNAME;
  delete process.env.ARAMEX_PASSWORD;
  delete process.env.ARAMEX_ACCOUNT_NUMBER;
  delete process.env.ARAMEX_ACCOUNT_PIN;
  delete process.env.ARAMEX_ACCOUNT_ENTITY;
  delete process.env.ARAMEX_ACCOUNT_COUNTRY_CODE;
  delete process.env.ARAMEX_BASE_URL;
}

const baseRateRequest = {
  shipper: {
    name: "Saudi Shipper",
    streetLine1: "2929, Raihana Bint Zaid Street",
    streetLine2: "8118, AlArid",
    city: "Riyadh",
    postalCode: "13337",
    countryCode: "SA",
    phone: "5551112222",
  },
  recipient: {
    name: "UAE Receiver",
    streetLine1: "Business Bay",
    city: "Dubai",
    postalCode: "00000",
    countryCode: "AE",
    phone: "5553334444",
  },
  packages: [
    {
      weight: 2,
      weightUnit: "KG" as const,
      packageType: "YOUR_PACKAGING",
      dimensions: {
        length: 20,
        width: 15,
        height: 10,
        unit: "CM" as const,
      },
    },
  ],
  currency: "SAR",
};

describe("AramexAdapter", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            HasErrors: false,
            TotalAmount: {
              Value: 123.45,
              CurrencyCode: "SAR",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );
    setAramexEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAramexEnv();
  });

  it("requests Aramex rates using the JSON WCF endpoint and client info credentials", async () => {
    const adapter = new AramexAdapter();

    const rates = await adapter.getRates(baseRateRequest);

    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({
      serviceType: "PPX",
      serviceName: "Aramex Priority Parcel Express",
      baseRate: 123.45,
      currency: "SAR",
      chargeableWeightSource: "system",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/shippingapi.v2/ratecalculator/service_1_0.svc/json/CalculateRate");
    const payload = JSON.parse(String(options?.body));
    expect(payload.ClientInfo).toMatchObject({
      UserName: "test-user",
      AccountNumber: "123456",
      AccountEntity: "RUH",
      AccountCountryCode: "SA",
    });
    expect(payload.ShipmentDetails).toMatchObject({
      ProductGroup: "EXP",
      ProductType: "PPX",
      NumberOfPieces: 1,
    });
  });

  it("uses local mock rates when credentials are missing outside production", async () => {
    clearAramexEnv();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const adapter = new AramexAdapter();
      const rates = await adapter.getRates(baseRateRequest);

      expect(rates).toHaveLength(1);
      expect(rates[0].carrierCode).toBeUndefined();
      expect(rates[0].serviceName).toBe("Aramex Priority Parcel Express");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
