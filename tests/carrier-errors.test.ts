import { describe, expect, it } from "vitest";
import {
  CarrierErrorCategory,
  CarrierRetryAdvice,
  carrierRetryLabel,
  explainCarrierError,
  parseCarrierErrorCode,
  parseCarrierStatusCode,
} from "../shared/carrier-errors";

// Every string below was taken verbatim from production — from shipments.pickup_error and
// shipments.carrier_error_message. The catalogue is only worth anything if it matches what
// the carriers actually send us, so the fixtures are real rather than invented.
const REAL_ERRORS = {
  dhlPickupDate:
    "CarrierError [DHL_API_ERROR]: DHL API error: 400 - 5006: Pickup is not allowed for this shipment date. Please update and re-try again.",
  fedexStreetLine: "FedEx API error: 400 - PICKUP.STREETLINE.MISSING: StreetLine is missing.",
  fedexForbidden:
    "FedEx API error: 403 - FORBIDDEN.ERROR: We could not authorize your credentials. Please check your permissions and try again.",
  fedexUnexpected:
    "FedEx API error: 500 - SYSTEM.UNEXPECTED.ERROR: GENERAL FAILURE {FAILURE_CAUSE}. Please update and try again.",
  dhlSoapFault:
    'Cancel failed: DHL API error: 405 - {"raw":"<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>\\n<env:Envelope xmlns:env=\\"http://schemas.xmlsoap.org/soap/envelope/\\">"}',
  platformBug: "Tracking failed: Cannot read properties of undefined (reading 'statusByLocale')",
  fedexPostalCode:
    "FedEx API error: 400 - POSTALCODE.INFO.INVALID: There is a missing or invalid postal code, or the postal code and country do not match. Please verify the information and try again.",
};

describe("parsing carrier error codes", () => {
  it("reads a FedEx symbolic code", () => {
    expect(parseCarrierErrorCode(REAL_ERRORS.fedexStreetLine)).toBe("PICKUP.STREETLINE.MISSING");
    expect(parseCarrierErrorCode(REAL_ERRORS.fedexForbidden)).toBe("FORBIDDEN.ERROR");
  });

  it("reads a DHL numeric code", () => {
    expect(parseCarrierErrorCode(REAL_ERRORS.dhlPickupDate)).toBe("5006");
  });

  it("returns null when there is no code to read", () => {
    expect(parseCarrierErrorCode("something went wrong")).toBeNull();
  });

  it("reads the HTTP status out of the message", () => {
    expect(parseCarrierStatusCode(REAL_ERRORS.fedexStreetLine)).toBe(400);
    expect(parseCarrierStatusCode(REAL_ERRORS.fedexForbidden)).toBe(403);
    expect(parseCarrierStatusCode("no status here")).toBeNull();
  });
});

describe("the error that started this", () => {
  it("explains DHL 5006 as a date problem, not a reason to retry", () => {
    const explanation = explainCarrierError({
      message: REAL_ERRORS.dhlPickupDate,
      carrierCode: "DHL",
    });

    expect(explanation.recognised).toBe(true);
    expect(explanation.code).toBe("DHL_5006");
    expect(explanation.category).toBe(CarrierErrorCategory.DATE);
    // The whole point: the carrier's own text says "please update and re-try", which is what
    // produced fourteen identical retries. Ours has to say what to change.
    expect(explanation.retry).toBe(CarrierRetryAdvice.AFTER_FIX);
    expect(explanation.action).toMatch(/working day at the ORIGIN/i);
    expect(explanation.action).toMatch(/holiday/i);
  });

  it("keeps the carrier's original message alongside the translation", () => {
    const explanation = explainCarrierError({ message: REAL_ERRORS.dhlPickupDate, carrierCode: "DHL" });
    expect(explanation.raw).toBe(REAL_ERRORS.dhlPickupDate);
  });
});

describe("explaining real production errors", () => {
  it("treats refused credentials as unfixable by the operator", () => {
    const explanation = explainCarrierError({ message: REAL_ERRORS.fedexForbidden, carrierCode: "FEDEX" });
    expect(explanation.category).toBe(CarrierErrorCategory.CREDENTIALS);
    expect(explanation.retry).toBe(CarrierRetryAdvice.NOT_RETRYABLE);
    // 1,498 of these in 60 days came from tracking, which uses a different FedEx key.
    expect(explanation.action).toMatch(/tracking is a separate project/i);
  });

  it("explains that a 'missing' street line is usually one that is too long", () => {
    // FedEx reports an over-length street line with the same code as an absent one. On
    // EZH503313541 the line was 67 characters, /ship accepted it, /pickup did not — and the
    // literal reading of the error sent us looking for an empty field that was full.
    const explanation = explainCarrierError({ message: REAL_ERRORS.fedexStreetLine, carrierCode: "FEDEX" });
    expect(explanation.category).toBe(CarrierErrorCategory.ADDRESS);
    expect(explanation.retry).toBe(CarrierRetryAdvice.AFTER_FIX);
    expect(explanation.cause).toMatch(/35 characters/);
    expect(explanation.action).toMatch(/shorten it/i);
  });

  it("explains a rejected postal code as possibly one that should not be there", () => {
    // EZH503313541 again: the sender is in Lebanon, which FedEx has no postal codes for. The
    // form demanded one, the client typed "00000", and FedEx refused it. The instinct is to
    // hunt for the right code; the answer is that there isn't one.
    const explanation = explainCarrierError({ message: REAL_ERRORS.fedexPostalCode, carrierCode: "FEDEX" });
    expect(explanation.category).toBe(CarrierErrorCategory.ADDRESS);
    expect(explanation.retry).toBe(CarrierRetryAdvice.AFTER_FIX);
    expect(explanation.action).toMatch(/does not use postal codes|clear the field/i);
  });

  it("treats a carrier 500 as worth retrying", () => {
    const explanation = explainCarrierError({ message: REAL_ERRORS.fedexUnexpected, carrierCode: "FEDEX" });
    expect(explanation.category).toBe(CarrierErrorCategory.CARRIER_FAULT);
    expect(explanation.retry).toBe(CarrierRetryAdvice.RETRY);
  });

  it("recognises a SOAP fault as an unsupported operation", () => {
    const explanation = explainCarrierError({ message: REAL_ERRORS.dhlSoapFault, carrierCode: "DHL" });
    expect(explanation.category).toBe(CarrierErrorCategory.CARRIER_FAULT);
    expect(explanation.action).toMatch(/no cancellation API/i);
  });

  it("owns up when the failure is our bug rather than the carrier's", () => {
    const explanation = explainCarrierError({ message: REAL_ERRORS.platformBug, carrierCode: "FEDEX" });
    expect(explanation.category).toBe(CarrierErrorCategory.PLATFORM_BUG);
    expect(explanation.retry).toBe(CarrierRetryAdvice.NOT_RETRYABLE);
    expect(explanation.title).toMatch(/ours, not the carrier/i);
  });
});

describe("errors the catalogue has never seen", () => {
  it("still stops the retry loop on a 4xx it cannot translate", () => {
    // The single most useful thing we can say about an unknown rejection: the carrier looked
    // at what we sent and said no, so sending it again unchanged is pointless.
    const explanation = explainCarrierError({
      message: "DHL API error: 400 - 9999: Some brand new problem.",
      carrierCode: "DHL",
    });

    expect(explanation.recognised).toBe(false);
    expect(explanation.retry).toBe(CarrierRetryAdvice.AFTER_FIX);
    expect(explanation.code).toBe("9999");
    expect(explanation.raw).toContain("Some brand new problem");
  });

  it("suggests retrying an untranslated 5xx", () => {
    const explanation = explainCarrierError({
      message: "DHL API error: 503 - 1234: Upstream exploded.",
      carrierCode: "DHL",
    });
    expect(explanation.retry).toBe(CarrierRetryAdvice.RETRY);
  });

  it("does not claim to recognise something it doesn't", () => {
    const explanation = explainCarrierError({ message: "totally novel failure", carrierCode: "DHL" });
    expect(explanation.recognised).toBe(false);
    expect(explanation.category).toBe(CarrierErrorCategory.UNKNOWN);
  });

  it("handles a failure recorded with no message at all", () => {
    const explanation = explainCarrierError({ message: "", carrierCode: "DHL" });
    expect(explanation.recognised).toBe(false);
    expect(explanation.title).toMatch(/without a reason/i);
  });
});

describe("carrier scoping", () => {
  it("does not apply a DHL-specific code to another carrier", () => {
    // "5006" is a DHL pickup-date code. The same digits in a FedEx message must not be
    // explained as a DHL collection-calendar problem.
    const explanation = explainCarrierError({
      message: "FedEx API error: 400 - 5006: Something else entirely.",
      carrierCode: "FEDEX",
    });
    expect(explanation.code).not.toBe("DHL_5006");
    expect(explanation.category).not.toBe(CarrierErrorCategory.DATE);
  });

  it("applies carrier-agnostic entries to any carrier", () => {
    for (const carrier of ["DHL", "FEDEX", "ARAMEX"]) {
      const explanation = explainCarrierError({
        message: "API error: 403 - FORBIDDEN.ERROR: We could not authorize your credentials.",
        carrierCode: carrier,
      });
      expect(explanation.category).toBe(CarrierErrorCategory.CREDENTIALS);
    }
  });
});

describe("retry labels", () => {
  it("reads as an instruction, not a status", () => {
    expect(carrierRetryLabel(CarrierRetryAdvice.RETRY)).toBe("Worth retrying");
    expect(carrierRetryLabel(CarrierRetryAdvice.AFTER_FIX)).toBe("Fix before retrying");
    expect(carrierRetryLabel(CarrierRetryAdvice.NOT_RETRYABLE)).toBe("Retrying will not help");
  });
});
