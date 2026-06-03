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
});
