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
          hsCode: "847759",
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
    // DHL now requires a numeric declaredValue (no quotes).
    expect(payload.content.declaredValue).toBe(4198);
    expect(typeof payload.content.declaredValue).toBe("number");
    expect(payload.content.exportDeclaration.invoice.customerReferences[0].typeCode).toBe("CU");
    expect(payload.content.exportDeclaration.lineItems).toHaveLength(1);
    expect(payload.content.exportDeclaration.lineItems[0].description).toBe("Bambu Lab H2S");
    expect(payload.content.exportDeclaration.lineItems[0].commodityCodes).toEqual([
      { value: "847759", typeCode: "outbound" },
      { value: "847759", typeCode: "inbound" },
    ]);
    expect(payload.content.exportDeclaration.lineItems[0].weight.grossValue).toBeGreaterThan(
      payload.content.exportDeclaration.lineItems[0].weight.netValue,
    );
    expect(payload.content.exportDeclaration.invoice.totalGrossWeight).toBeGreaterThan(
      payload.content.exportDeclaration.invoice.totalNetWeight,
    );
  });

  it("books a pickup via POST /pickups and returns the dispatch confirmation number", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes("/address-validate")
          ? new Response(
              JSON.stringify({ address: [{ countryCode: "DE", postalCode: "36456", cityName: "BARCHFELD", serviceArea: { code: "ERF" } }] }),
              { status: 200 },
            )
          : new Response(JSON.stringify({ dispatchConfirmationNumbers: ["PRG260729153064"] }), { status: 201 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new DhlAdapter();
    const result = await adapter.requestPickup({
      shipper: {
        name: "BERICAP Aluminium GmbH", streetLine1: "Im Vorwerk 7", city: "Barchfeld",
        postalCode: "36456", countryCode: "DE", phone: "+49369617770", email: "ops@example.com",
      },
      packages: [
        { weight: 9, weightUnit: "KG", packageType: "YOUR_PACKAGING", dimensions: { length: 50, width: 40, height: 40, unit: "CM" } },
        { weight: 9, weightUnit: "KG", packageType: "YOUR_PACKAGING", dimensions: { length: 50, width: 40, height: 40, unit: "CM" } },
      ],
      pickupDate: "2026-07-29", readyTime: "12:00", closeTime: "17:00",
      isInternational: true, serviceType: "P", currency: "EUR",
    });

    expect(result.confirmationNumber).toBe("PRG260729153064");
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/pickups"))!;
    expect(String(call[0])).toMatch(/\/pickups$/);
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.plannedPickupDateAndTime).toBe("2026-07-29T12:00:00 GMT+02:00"); // Berlin DST offset
    expect(body.closeTime).toBe("17:00");
    expect(body.accounts[0].number).toBe("123456789");
    expect(body.customerDetails.shipperDetails.postalAddress.cityName).toBe("BARCHFELD");
    expect(body.shipmentDetails[0].packages).toHaveLength(2);
  });

  it("replaces an unknown pickup city/postal with DHL's canonical location before booking", async () => {
    // Real failure: sender "Sariçam / 01000 / TR" books a waybill but has no DHL gazetteer entry,
    // so POST /pickups answers 400 "420504: The origin location is invalid".
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/address-validate")) {
        // Only the ASCII city-only lookup resolves; the city+postal pairs are unknown.
        if (u.includes("postalCode")) {
          return Promise.resolve(new Response(JSON.stringify({ detail: "3009: Address validation failed." }), { status: 404 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ address: [{ countryCode: "TR", postalCode: "01250", cityName: "SARICAM ADANA", serviceArea: { code: "ADA" } }] }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ dispatchConfirmationNumbers: ["ADA260811001122"] }), { status: 201 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new DhlAdapter();
    const result = await adapter.requestPickup({
      shipper: {
        name: "TEMIZ IS TENEKE AMBALAJ", streetLine1: "ACIDIR OSB MAH ATATURK BLV NO:61",
        streetLine2: "SARICAM ADANA", city: "Sariçam", stateOrProvince: "ADANA",
        postalCode: "01000", countryCode: "TR", phone: "+905331551791",
      },
      packages: [{ weight: 8, weightUnit: "KG", packageType: "YOUR_PACKAGING" }],
      pickupDate: "2026-08-12", readyTime: "15:30", closeTime: "17:00",
      isInternational: true, serviceType: "P", currency: "SAR",
    });

    expect(result.confirmationNumber).toBe("ADA260811001122");
    // Diacritics folded on the fallback lookup, so DHL can match its ASCII gazetteer.
    expect(calls.some((u) => u.includes("Saricam") && !u.includes("postalCode"))).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).includes("/pickups"))![1].body);
    const address = body.customerDetails.shipperDetails.postalAddress;
    expect(address.cityName).toBe("SARICAM ADANA");
    expect(address.postalCode).toBe("01250");
    expect(address.addressLine1).toBe("ACIDIR OSB MAH ATATURK BLV NO:61");
    expect(address.countyName).toBe("ADANA");
  });

  it("books the pickup as-is when DHL knows no matching location", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes("/address-validate")
          ? new Response(JSON.stringify({ detail: "3007: The origin location is invalid." }), { status: 400 })
          : new Response(JSON.stringify({ dispatchConfirmationNumbers: ["PRG260811009900"] }), { status: 201 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new DhlAdapter();
    const result = await adapter.requestPickup({
      shipper: {
        name: "Nowhere Ltd", streetLine1: "1 Main St", city: "Atlantis",
        postalCode: "00000", countryCode: "TR", phone: "+905331551791",
      },
      packages: [{ weight: 1, weightUnit: "KG", packageType: "YOUR_PACKAGING" }],
      pickupDate: "2026-08-12", readyTime: "10:00", closeTime: "17:00",
      serviceType: "P", currency: "SAR",
    });

    expect(result.confirmationNumber).toBe("PRG260811009900");
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).includes("/pickups"))![1].body);
    expect(body.customerDetails.shipperDetails.postalAddress.cityName).toBe("Atlantis");
    expect(body.customerDetails.shipperDetails.postalAddress.postalCode).toBe("00000");
  });
  it("requests all-checkpoints and derives status from real milestones, not API pings", async () => {
    // "all-check-points" (hyphenated) is silently accepted by DHL and answered with only the
    // RR/PY data-exchange pings, which made moving shipments look frozen. The valid value is
    // "all-checkpoints".
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const events = String(url).includes("trackingView=all-checkpoints")
        ? [
            { date: "2026-08-13", time: "09:20:00", typeCode: "PU", description: "Shipment picked up", serviceArea: [{ description: "ADANA-TURKEY" }] },
            { date: "2026-08-13", time: "13:06:46", typeCode: "RR", description: "Response Received" },
            { date: "2026-08-14", time: "02:11:00", typeCode: "DF", description: "Shipment has departed from a DHL facility", serviceArea: [{ description: "ADANA-TURKEY" }] },
          ]
        : [{ date: "2026-08-13", time: "13:06:46", typeCode: "RR", description: "Response Received" }];
      return Promise.resolve(new Response(JSON.stringify({
        shipments: [{ shipmentTrackingNumber: "2470181162", status: "Success", events }],
      }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new DhlAdapter();
    const tracking = await adapter.trackShipment("2470181162");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("trackingView=all-checkpoints");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("all-check-points");
    // Latest meaningful milestone wins; "Success" is the API envelope and must never be the status.
    expect(tracking.status).toBe("Shipment has departed from a DHL facility");
    expect(tracking.events).toHaveLength(3);
  });

  it("asks DHL for per-event GMT offsets and the checkpoint remarks", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      calls.push(String(url));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            shipments: [{
              shipmentTrackingNumber: "1234567890",
              status: "Success",
              events: [{
                date: "2026-08-15", time: "13:06:00", GMTOffset: "+09:00",
                typeCode: "PU", description: "Shipment picked up",
                serviceArea: [{ code: "BNE", description: "Brisbane-AU" }],
                remarks: [{ value: "On its way." }],
              }],
            }],
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DhlAdapter().trackShipment("1234567890");

    // Without requestGMTOffsetPerEvent DHL sends a bare local time with no zone, and the scan
    // cannot be placed on a real timeline.
    expect(calls[0]).toContain("requestGMTOffsetPerEvent=true");
    expect(calls[0]).toContain("trackingView=all-checkpoints-with-remarks");
    expect(calls).toHaveLength(1);
    expect(result.events[0].description).toBe("Shipment picked up");
    expect(result.events[0].utcOffset).toBe("+09:00");
    expect(result.events[0].remarks).toBe("On its way.");
  });

  it("falls through to the proven trackingView when a variant answers 200 with no checkpoints", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      calls.push(String(url));
      // This is the failure mode the candidate list exists for: HTTP 200, zero scans.
      const body = String(url).includes("all-checkpoints-with-remarks")
        ? { shipments: [{ shipmentTrackingNumber: "1234567890", status: "Success", events: [] }] }
        : {
            shipments: [{
              shipmentTrackingNumber: "1234567890",
              status: "Success",
              events: [{ date: "2026-08-15", time: "13:06:00", GMTOffset: "+03:00", typeCode: "PU", description: "Shipment picked up" }],
            }],
          };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DhlAdapter().trackShipment("1234567890");

    expect(result.events).toHaveLength(1);
    expect(calls[1]).toContain("trackingView=all-checkpoints&");
  });

  it("stops after two calls when a waybill genuinely has no scans yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ shipments: [{ shipmentTrackingNumber: "1234567890", status: "Success", events: [] }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DhlAdapter().trackShipment("1234567890");

    // A pre-transit shipment is polled every 10 minutes; walking every candidate on empty would
    // multiply our DHL call volume for every shipment that has not moved yet.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.events).toHaveLength(0);
  });
});
