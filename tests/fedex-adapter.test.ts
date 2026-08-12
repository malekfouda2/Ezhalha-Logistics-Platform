import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createIntegrationLog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { FedExAdapter } from "../server/integrations/fedex";

describe("FedExAdapter", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "fedex-test-token",
              expires_in: 3600,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              output: {
                transactionShipments: [
                  {
                    masterTrackingNumber: "123456789012",
                    pieceResponses: [
                      {
                        packageDocuments: [
                          { encodedLabel: "base64-label" },
                        ],
                      },
                    ],
                  },
                ],
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

    process.env.FEDEX_CLIENT_ID = "test-client-id";
    process.env.FEDEX_CLIENT_SECRET = "test-client-secret";
    process.env.FEDEX_ACCOUNT_NUMBER = "123456789";
    process.env.FEDEX_BASE_URL = "https://apis-sandbox.fedex.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FEDEX_CLIENT_ID;
    delete process.env.FEDEX_CLIENT_SECRET;
    delete process.env.FEDEX_ACCOUNT_NUMBER;
    delete process.env.FEDEX_BASE_URL;
  });

  it("maps US full state names to carrier state codes when creating shipments", async () => {
    const adapter = new FedExAdapter();

    await adapter.createShipment({
      shipper: {
        name: "Origin Sender",
        streetLine1: "100 Export Way",
        city: "Houston",
        stateOrProvince: "Texas",
        postalCode: "77001",
        countryCode: "US",
        phone: "5551112222",
        email: "origin@example.com",
      },
      recipient: {
        name: "Saudi Recipient",
        streetLine1: "200 Riyadh Road",
        city: "Riyadh",
        postalCode: "11564",
        countryCode: "SA",
        phone: "5553334444",
        email: "recipient@example.com",
      },
      packages: [
        {
          weight: 2,
          weightUnit: "KG",
          dimensions: {
            length: 20,
            width: 15,
            height: 10,
            unit: "CM",
          },
          packageType: "YOUR_PACKAGING",
        },
      ],
      serviceType: "FEDEX_INTERNATIONAL_PRIORITY",
      currency: "SAR",
      items: [
        {
          description: "Wireless Keyboard",
          hsCode: "847160",
          countryOfOrigin: "US",
          quantity: 1,
          unitPrice: 200,
          currency: "SAR",
        },
      ],
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const shipRequestInit = fetchMock.mock.calls[1]?.[1];
    const payload = JSON.parse(String(shipRequestInit?.body));

    expect(payload.requestedShipment.shipper.address.stateOrProvinceCode).toBe("TX");
  });

  it("rate discovery calls FedEx with no serviceType (AUTO) and returns ALL service levels", async () => {
    let rateBody: any = null;
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/availability")) {
        // Force the availability lookup to fail so getRates falls back to the AUTO path only.
        return new Response("{}", { status: 500 });
      }
      if (u.includes("/rate/v1/rates/quotes")) {
        rateBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({
          output: {
            rateReplyDetails: [
              { serviceType: "FEDEX_INTERNATIONAL_PRIORITY", serviceName: "Intl Priority", ratedShipmentDetails: [{ totalNetCharge: 150, currency: "SAR" }] },
              { serviceType: "FEDEX_INTERNATIONAL_ECONOMY", serviceName: "Intl Economy", ratedShipmentDetails: [{ totalNetCharge: 100, currency: "SAR" }] },
              { serviceType: "INTERNATIONAL_FIRST", serviceName: "Intl First", ratedShipmentDetails: [{ totalNetCharge: 220, currency: "SAR" }] },
            ],
          },
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new FedExAdapter();
    const rates = await adapter.getRates({
      shipper: { name: "S", streetLine1: "1 A St", city: "Cairo", postalCode: "11511", countryCode: "EG", phone: "1" },
      recipient: { name: "R", streetLine1: "2 B St", city: "Riyadh", postalCode: "11564", countryCode: "SA", phone: "2" },
      packages: [{ weight: 2, weightUnit: "KG", packageType: "YOUR_PACKAGING", dimensions: { length: 20, width: 15, height: 10, unit: "CM" } }],
      currency: "SAR",
    });

    // All three service levels returned from the single AUTO call.
    expect(rates).toHaveLength(3);
    expect(rates.map((r) => r.serviceType).sort()).toEqual(["FEDEX_INTERNATIONAL_ECONOMY", "FEDEX_INTERNATIONAL_PRIORITY", "INTERNATIONAL_FIRST"]);
    // AUTO: the rate request carried no serviceType.
    expect(rateBody.requestedShipment.serviceType).toBeUndefined();
  });

  it("throws a carrier error when real tracking fails for a configured FedEx adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "fedex-test-token",
              expires_in: 3600,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              errors: [
                {
                  code: "FORBIDDEN.ERROR",
                  message: "We could not authorize your credentials.",
                },
              ],
            }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        ),
    );

    const adapter = new FedExAdapter();

    await expect(adapter.trackShipment("794811298978")).rejects.toThrow("TRACKING_FAILED");
  });

  it("sends the FedEx cancel request with the tracking number as a string", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "fedex-test-token",
              expires_in: 3600,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ output: {} }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }),
        ),
    );

    const adapter = new FedExAdapter();

    await expect(adapter.cancelShipment("794811298978", "US")).resolves.toBe(true);

    const fetchMock = vi.mocked(fetch);
    const cancelRequestInit = fetchMock.mock.calls[1]?.[1];
    const payload = JSON.parse(String(cancelRequestInit?.body));

    expect(payload).toMatchObject({
      accountNumber: { value: "123456789" },
      senderCountryCode: "US",
      deletionControl: "DELETE_ALL_PACKAGES",
      trackingNumber: "794811298978",
    });
  });

  it("throws a carrier error when real cancellation fails for a configured FedEx adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "fedex-test-token",
              expires_in: 3600,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              errors: [
                {
                  code: "INVALID.INPUT.EXCEPTION",
                  message: "Invalid field value in the input",
                },
              ],
            }),
            {
              status: 422,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        ),
    );

    const adapter = new FedExAdapter();

    await expect(adapter.cancelShipment("794811298978", "US")).rejects.toThrow("CANCEL_FAILED");
  });
  it("stops a pickup FedEx says it cannot serve, with FedEx's own reason", async () => {
    // POST /pickups answers an unserviceable request with a bare 500 "GENERAL FAILURE
    // {FAILURE_CAUSE}", so the availability call is the only source of a real reason.
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes("/oauth/token")
          ? new Response(JSON.stringify({ access_token: "fedex-test-token", expires_in: 3600 }), { status: 200 })
          : new Response(
              JSON.stringify({ output: { options: [{ available: false, reason: "PICKUP NOT AVAILABLE AT THIS LOCATION" }] } }),
              { status: 200 },
            ),
      ),
    ));

    const adapter = new FedExAdapter();

    await expect(adapter.requestPickup({
      shipper: {
        name: "Manar Alshammari", streetLine1: "196 Upper Dock Street", city: "Newport",
        postalCode: "NP20 1DA", countryCode: "GB", phone: "+447384968635",
      },
      packages: [{ weight: 20, weightUnit: "KG", packageType: "YOUR_PACKAGING" }],
      pickupDate: "2026-08-13", readyTime: "10:00", closeTime: "17:00", isInternational: true,
    })).rejects.toThrow("PICKUP NOT AVAILABLE AT THIS LOCATION");

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    // Booking must not be attempted once FedEx has said no.
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/pickup/v1/pickups"))).toBe(false);
  });

  it("books a pickup with a digits-only phone once FedEx confirms availability", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/oauth/token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: "fedex-test-token", expires_in: 3600 }), { status: 200 }));
      }
      if (u.includes("/availabilities")) {
        return Promise.resolve(new Response(JSON.stringify({ output: { options: [{ available: true }] } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ output: { pickupConfirmationCode: "1234567" } }), { status: 200 }));
    }));

    const adapter = new FedExAdapter();
    const result = await adapter.requestPickup({
      shipper: {
        name: "Manar Alshammari", streetLine1: "196 Upper Dock Street", city: "Newport",
        postalCode: "NP20 1DA", countryCode: "GB", phone: "+447384968635",
      },
      packages: [
        { weight: 20, weightUnit: "KG", packageType: "YOUR_PACKAGING" },
        { weight: 15, weightUnit: "KG", packageType: "YOUR_PACKAGING" },
      ],
      pickupDate: "2026-08-13", readyTime: "10:00", closeTime: "17:00", isInternational: true,
    });

    expect(result.confirmationNumber).toBe("1234567");
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const booking = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/pickup/v1/pickups"))!;
    const body = JSON.parse(String(booking[1].body));
    expect(body.originDetails.pickupLocation.contact.phoneNumber).toBe("447384968635");
    expect(body.originDetails.readyDateTimestamp).toBe("2026-08-13T10:00:00+01:00"); // London BST
    expect(body.packageCount).toBe(2);
    expect(body.totalWeight).toEqual({ units: "KG", value: 35 });
  });
});
