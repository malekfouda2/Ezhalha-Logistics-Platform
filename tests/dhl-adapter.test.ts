import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createIntegrationLog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { DhlAdapter } from "../server/integrations/dhl";

describe("DhlAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T20:41:49.272Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            products: [
              {
                productCode: "P",
                productName: "DHL Express Worldwide",
                totalPrice: [
                  {
                    price: 123.45,
                    priceCurrency: "SAR",
                    currencyType: "BILLC",
                  },
                ],
                deliveryCapabilities: {
                  estimatedDeliveryDateAndTime: "2026-04-28T12:00:00.000Z",
                  totalTransitDays: 2,
                },
              },
            ],
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
    process.env.DHL_API_KEY = "test-key";
    process.env.DHL_API_SECRET = "test-secret";
    process.env.DHL_ACCOUNT_NUMBER = "123456789";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.DHL_API_KEY;
    delete process.env.DHL_API_SECRET;
    delete process.env.DHL_ACCOUNT_NUMBER;
  });

  it("should request DHL rates for the next business day and include full compact addresses", async () => {
    const adapter = new DhlAdapter();

    const rates = await adapter.getRates({
      shipper: {
        name: "Egypt Shipper",
        streetLine1: "3 block 17 Mahdy Arafa Street",
        streetLine2: "District 5",
        streetLine3: "ABCD1234",
        city: "Nasr City",
        stateOrProvince: "Cairo",
        postalCode: "4450113",
        countryCode: "EG",
        phone: "5551112222",
      },
      recipient: {
        name: "Saudi Receiver",
        streetLine1: "3885 Al Bandariyyah Street",
        streetLine2: "8118, AlArid",
        streetLine3: "RRRD2929",
        city: "Riyadh",
        stateOrProvince: "Riyadh",
        postalCode: "13314",
        countryCode: "SA",
        phone: "5553334444",
      },
      packages: [
        {
          weight: 1,
          weightUnit: "KG",
          packageType: "YOUR_PACKAGING",
        },
      ],
      currency: "SAR",
    });

    expect(rates).toHaveLength(1);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.plannedShippingDateAndTime).toBe("2026-04-26T09:00:00.000Z");
    expect(payload.customerDetails.shipperDetails.addressLine2).toBe("District 5");
    expect(payload.customerDetails.shipperDetails.addressLine3).toBe("ABCD1234");
    expect(payload.customerDetails.receiverDetails.addressLine2).toBe("8118, AlArid");
    expect(payload.customerDetails.receiverDetails.addressLine3).toBe("RRRD2929");
    expect(payload.customerDetails.receiverDetails.countyName).toBe("Riyadh");
  });

  it("should sanitize customs data before creating an international DHL shipment", async () => {
    const adapter = new DhlAdapter();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          shipmentTrackingNumber: "1234567890",
          documents: [
            {
              typeCode: "waybillDoc",
              content: "label-data",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const response = await adapter.createShipment({
      shipper: {
        name: "Egypt Shipper",
        streetLine1: "Mahdy Arafa Street",
        city: "Nasr City",
        stateOrProvince: "Cairo",
        postalCode: "4450113",
        countryCode: "EG",
        phone: "+201226076000",
      },
      recipient: {
        name: "Saudi Receiver",
        streetLine1: "3885 Al Bandariyyah Street",
        streetLine3: "RYFD3885",
        city: "Riyadh",
        stateOrProvince: "Riyadh",
        postalCode: "13314",
        countryCode: "SA",
        phone: "+1 555 123 4567",
      },
      packages: [
        {
          weight: 1,
          weightUnit: "KG",
          dimensions: {
            length: 10,
            width: 10,
            height: 10,
            unit: "CM",
          },
          packageType: "YOUR_PACKAGING",
        },
      ],
      serviceType: "P",
      currency: "SAR",
      commodityDescription:
        "Bambu Lab H2S, 1 $2099.00, ZH075, 0.4mm Tungsten Carbide Nozzle, +16789206377, 2401 Windy Hill Road Southeast",
      declaredValue: 563870226443568000000,
      items: [
        {
          description: "Bambu Lab H2S",
          quantity: 2,
          unitPrice: 2099,
          countryOfOrigin: "EG",
          currency: "SAR",
        },
        {
          description: "+16789206377",
          quantity: 16789206377,
          unitPrice: 16789206377,
          countryOfOrigin: "EG",
          currency: "SAR",
        },
        {
          description: "2401 Windy Hill Road Southeast,Marietta,Georgia,30067,United",
          quantity: 240130067,
          unitPrice: 240130067,
          countryOfOrigin: "EG",
          currency: "SAR",
        },
      ],
    });

    expect(response.trackingNumber).toBeDefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.plannedShippingDateAndTime).toBe("2026-04-26T09:00:00 GMT+00:00");
    expect(payload.content.description).toBe("Bambu Lab H2S");
    expect(payload.content.declaredValue).toBe("4198");
    expect(payload.content.exportDeclaration.invoice.customerReferences[0].typeCode).toBe("CU");
    expect(payload.content.exportDeclaration.lineItems).toHaveLength(1);
    expect(payload.content.exportDeclaration.lineItems[0].description).toBe("Bambu Lab H2S");
  });
});
