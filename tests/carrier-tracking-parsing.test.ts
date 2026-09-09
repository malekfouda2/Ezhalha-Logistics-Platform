import { describe, expect, it } from "vitest";

import {
  extractUtcOffset,
  formatFedexScanLocation,
  parseFedexScanEvent,
} from "../server/integrations/fedex";
import { extractTrackingResponse } from "../server/integrations/dhl";
import {
  extractAramexTrackingEvents,
  parseAramexUpdateDateTime,
} from "../server/integrations/aramex";
import { buildCarrierEventKey } from "../server/services/carrier-tracking-events";

// Payload shapes below are taken from the carriers' own published schemas:
//   FedEx  — Track API v1, `ScanEvent` (date example "2018-02-02T12:01:00-07:00")
//   DHL    — MyDHL API 3.3.1, GET /shipments/{awb}/tracking, `shipments[].events[]`
//   Aramex — Shipments Tracking API, TrackShipments (WCF JSON)

describe("FedEx scan events", () => {
  it("keeps FedEx's own wording and its local wall clock, offset included", () => {
    const event = parseFedexScanEvent({
      date: "2018-02-02T12:01:00-07:00",
      eventType: "PU",
      eventDescription: "Picked up",
      derivedStatus: "Picked Up",
      scanLocation: { city: "SEATTLE", stateOrProvinceCode: "WA", countryCode: "US" },
    });

    expect(event.description).toBe("Picked up");
    expect(event.status).toBe("PU");
    // The instant is 19:01 UTC; the carrier's clock said 12:01. Both must survive.
    expect(event.timestamp.toISOString()).toBe("2018-02-02T19:01:00.000Z");
    expect(event.localTime).toBe("2018-02-02T12:01:00-07:00");
    expect(event.utcOffset).toBe("-07:00");
  });

  it("carries the exception text that explains why a shipment stopped", () => {
    const event = parseFedexScanEvent({
      date: "2026-08-15T09:00:00+03:00",
      eventType: "DE",
      eventDescription: "Delivery exception",
      exceptionCode: "A25",
      exceptionDescription: "Package available for clearance",
      scanLocation: { city: "RIYADH", countryCode: "SA", countryName: "Saudi Arabia" },
    });

    expect(event.exceptionCode).toBe("A25");
    expect(event.exceptionDescription).toBe("Package available for clearance");
  });

  it("does not print 'undefined' for scans outside the US state system", () => {
    // FedEx omits stateOrProvinceCode everywhere it has no meaning, which used to render as
    // "DUBAI, undefined" on every international scan.
    expect(formatFedexScanLocation({ city: "DUBAI", countryCode: "AE", countryName: "United Arab Emirates" }))
      .toBe("DUBAI, United Arab Emirates");
    expect(formatFedexScanLocation({ city: "SEATTLE", stateOrProvinceCode: "WA", countryCode: "US" }))
      .toBe("SEATTLE, WA");
    expect(formatFedexScanLocation(undefined)).toBeUndefined();
    expect(formatFedexScanLocation({})).toBeUndefined();
  });

  it("falls back to derivedStatus only when the scan carries no text of its own", () => {
    const event = parseFedexScanEvent({ date: "2026-08-15T09:00:00Z", eventType: "OD", derivedStatus: "On FedEx vehicle for delivery" });
    expect(event.description).toBe("On FedEx vehicle for delivery");
    expect(event.utcOffset).toBe("+00:00");
  });
});

describe("DHL scan events", () => {
  const dhlPayload = (events: unknown[]) => ({
    shipments: [
      {
        shipmentTrackingNumber: "1234567890",
        // Documented value of this field is the API-call result, NOT a milestone.
        status: "Success",
        events,
      },
    ],
  });

  it("reconstructs the event instant from date + time + GMTOffset", () => {
    const parsed = extractTrackingResponse("1234567890", dhlPayload([
      { date: "2020-06-10", time: "13:06:00", GMTOffset: "+09:00", typeCode: "PU", description: "Shipment picked up", serviceArea: [{ code: "BNE", description: "Brisbane-AU" }] },
    ]));

    const [event] = parsed.events;
    expect(event.description).toBe("Shipment picked up");
    expect(event.status).toBe("PU");
    expect(event.location).toBe("Brisbane-AU");
    expect(event.localTime).toBe("2020-06-10T13:06:00+09:00");
    expect(event.utcOffset).toBe("+09:00");
    expect(event.timestamp.toISOString()).toBe("2020-06-10T04:06:00.000Z");
  });

  it("never reports the envelope's 'Success' as the shipment status", () => {
    const parsed = extractTrackingResponse("1234567890", dhlPayload([
      { date: "2026-08-15", time: "08:12:00", GMTOffset: "+03:00", typeCode: "OK", description: "Delivered - Signed for by", signedBy: "M FOUDA" },
    ]));

    expect(parsed.status).toBe("Delivered - Signed for by");
    expect(parsed.events[0].signedBy).toBe("M FOUDA");
  });

  it("keeps DHL's remarks, which only arrive under all-checkpoints-with-remarks", () => {
    const parsed = extractTrackingResponse("1234567890", dhlPayload([
      {
        date: "2026-08-15",
        time: "21:28:58",
        GMTOffset: "+10:00",
        typeCode: "DF",
        description: "Shipment has departed from a DHL facility- SYDNEY-AU",
        remarks: [{ value: "The shipment is on its way to the destination.", details: "Please continue to monitor the progress online." }],
      },
    ]));

    expect(parsed.events[0].remarks).toBe(
      "The shipment is on its way to the destination. Please continue to monitor the progress online.",
    );
  });

  it("keeps a bare local time usable when no GMT offset comes back", () => {
    const parsed = extractTrackingResponse("1234567890", dhlPayload([
      { date: "2020-06-10", time: "13:06:00", typeCode: "PU", description: "Shipment picked up" },
    ]));

    expect(parsed.events[0].localTime).toBe("2020-06-10T13:06:00");
    // No offset was reported, so none may be invented.
    expect(parsed.events[0].utcOffset).toBeUndefined();
  });

  it("orders scans newest first, because callers read events[0] as the latest", () => {
    const parsed = extractTrackingResponse("1234567890", dhlPayload([
      { date: "2026-08-10", time: "09:00:00", GMTOffset: "+03:00", typeCode: "PU", description: "Shipment picked up" },
      { date: "2026-08-14", time: "17:30:00", GMTOffset: "+03:00", typeCode: "OK", description: "Delivered" },
    ]));

    expect(parsed.events.map((event) => event.description)).toEqual(["Delivered", "Shipment picked up"]);
  });
});

describe("Aramex scan events", () => {
  const wcfShape = {
    TrackingResults: [
      {
        Key: "1234567890",
        Value: [
          {
            WaybillNumber: "1234567890",
            UpdateCode: "SH014",
            UpdateDescription: "Record created for the shipment",
            UpdateDateTime: "/Date(1591790760000+0300)/",
            UpdateLocation: "Riyadh",
            UpdateCountryCode: "SA",
            Comments: "Shipment booked by shipper",
            ProblemCode: "",
          },
        ],
      },
    ],
  };

  it("reads the KeyValuePair shape that WCF returns for a dictionary", () => {
    const events = extractAramexTrackingEvents(wcfShape, "1234567890");
    expect(events).toHaveLength(1);
    // The old parser mapped the {Key, Value} WRAPPER, producing a placeholder scan.
    expect(events[0].description).toBe("Record created for the shipment");
    expect(events[0].status).toBe("SH014");
    expect(events[0].location).toBe("Riyadh, SA");
    expect(events[0].remarks).toBe("Shipment booked by shipper");
  });

  it("reads the plain dictionary shape too", () => {
    const events = extractAramexTrackingEvents(
      { TrackingResults: { "1234567890": [{ UpdateCode: "SH005", UpdateDescription: "Out for delivery", UpdateDateTime: "2015-07-13T13:08:00" }] } },
      "1234567890",
    );
    expect(events[0].description).toBe("Out for delivery");
    expect(events[0].localTime).toBe("2015-07-13T13:08:00");
  });

  it("parses the Microsoft date format instead of stamping every scan with 'now'", () => {
    const parsed = parseAramexUpdateDateTime("/Date(1591790760000+0300)/");
    expect(parsed?.timestamp.toISOString()).toBe("2020-06-10T12:06:00.000Z");
    expect(parsed?.utcOffset).toBe("+03:00");
    // 12:06 UTC is 15:06 in +03:00 — the clock Aramex's own site shows.
    expect(parsed?.localTime).toBe("2020-06-10T15:06:00+03:00");
  });

  it("rejects unparseable dates rather than substituting the poll time", () => {
    expect(parseAramexUpdateDateTime("not a date")).toBeNull();
    expect(parseAramexUpdateDateTime(undefined)).toBeNull();
    const events = extractAramexTrackingEvents(
      { TrackingResults: { "1": [{ UpdateCode: "X", UpdateDescription: "Something", UpdateDateTime: "not a date" }] } },
      "1",
    );
    expect(events).toHaveLength(0);
  });

  it("drops scans with no carrier text instead of inventing wording", () => {
    const events = extractAramexTrackingEvents(
      { TrackingResults: { "1": [{ UpdateCode: "X", UpdateDateTime: "2015-07-13T13:08:00" }] } },
      "1",
    );
    expect(events).toHaveLength(0);
  });
});

describe("event identity", () => {
  it("gives the same scan the same key across polls, and distinguishes same-second scans", () => {
    const base = {
      timestamp: new Date("2026-08-15T09:00:00.000Z"),
      status: "AF",
      description: "Arrived at facility",
      location: "DUBAI, AE",
    };
    // FedEx has been seen re-sending a scan with different sub-second precision.
    const jittered = { ...base, timestamp: new Date("2026-08-15T09:00:00.412Z") };
    expect(buildCarrierEventKey(jittered)).toBe(buildCarrierEventKey(base));

    // DHL emits several scans sharing a timestamp and typeCode for different legs.
    const sibling = { ...base, description: "Departed facility" };
    expect(buildCarrierEventKey(sibling)).not.toBe(buildCarrierEventKey(base));
  });
});

describe("offset extraction", () => {
  it("reads the offset a carrier reported, and reports none when there is none", () => {
    expect(extractUtcOffset("2018-02-02T12:01:00-07:00")).toBe("-07:00");
    expect(extractUtcOffset("2026-08-15T09:00:00+0300")).toBe("+03:00");
    expect(extractUtcOffset("2026-08-15T09:00:00Z")).toBe("+00:00");
    expect(extractUtcOffset("2020-06-10T13:06:00")).toBeUndefined();
    expect(extractUtcOffset(undefined)).toBeUndefined();
  });
});
