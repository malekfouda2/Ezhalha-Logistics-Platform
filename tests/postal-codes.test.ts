import { describe, expect, it } from "vitest";
import {
  POSTAL_CODE_EXEMPT_COUNTRIES,
  carrierPostalCode,
  isPlaceholderPostalCode,
  isPostalCodeRequired,
} from "../shared/postal-codes";
import { POSTAL_CODE_EXEMPT_COUNTRIES as SERVER_LIST } from "../server/validation/shippingAddress";

// The chain that broke EZH503313541: Lebanon was missing from the exempt list, so the wizard
// demanded a postal code, the client typed "00000", and FedEx rejected it — because FedEx
// accepts NO postal code for Lebanon. Verified directly against the live API: omitting the
// field returns 3 pickup options, while "00000", a real Beirut code and an 8-digit code all
// return POSTALCODE.INFO.INVALID.
describe("Lebanon", () => {
  it("is exempt from postal codes", () => {
    expect(isPostalCodeRequired("LB")).toBe(false);
    expect(POSTAL_CODE_EXEMPT_COUNTRIES.has("LB")).toBe(true);
  });

  it("sends no postal code to the carrier, whatever is stored", () => {
    expect(carrierPostalCode("LB", "00000")).toBe("");
    expect(carrierPostalCode("LB", "1107")).toBe("");
    expect(carrierPostalCode("LB", "11072190")).toBe("");
  });
});

describe("one list, not two", () => {
  it("the server validator uses the shared list", () => {
    // These were separate copies that drifted by 19 countries, which is how Lebanon came to
    // be missing from both without anyone noticing.
    expect(SERVER_LIST).toBe(POSTAL_CODE_EXEMPT_COUNTRIES);
  });

  it("keeps every country both copies previously had", () => {
    const serverOnly = ["BO", "TF", "TK"];
    const clientOnly = ["AG", "AW", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "GA", "GW", "KN", "LY", "NA", "TD"];
    for (const code of [...serverOnly, ...clientOnly]) {
      expect(POSTAL_CODE_EXEMPT_COUNTRIES.has(code)).toBe(true);
    }
  });
});

describe("placeholder postal codes", () => {
  it("recognises the zeros people type when a form insists", () => {
    expect(isPlaceholderPostalCode("00000")).toBe(true);
    expect(isPlaceholderPostalCode("0")).toBe(true);
    expect(isPlaceholderPostalCode("000-000")).toBe(true);
    expect(isPlaceholderPostalCode("00 000")).toBe(true);
  });

  it("does not mistake a real postal code for a placeholder", () => {
    // Plenty of genuine postal codes begin with zero.
    expect(isPlaceholderPostalCode("01234")).toBe(false);
    expect(isPlaceholderPostalCode("00100")).toBe(false);
    expect(isPlaceholderPostalCode("SW1A 1AA")).toBe(false);
    expect(isPlaceholderPostalCode("")).toBe(false);
  });

  it("strips a placeholder even in a country that does use postal codes", () => {
    // "00000" is not a Saudi postal code either, and sending it is worse than sending nothing.
    expect(carrierPostalCode("SA", "00000")).toBe("");
  });
});

describe("countries that do use postal codes", () => {
  it("passes a real code straight through", () => {
    expect(carrierPostalCode("SA", "13314")).toBe("13314");
    expect(carrierPostalCode("GB", "NP20 1DA")).toBe("NP20 1DA");
    expect(carrierPostalCode("US", "77001")).toBe("77001");
  });

  it("still requires one", () => {
    expect(isPostalCodeRequired("SA")).toBe(true);
    expect(isPostalCodeRequired("GB")).toBe(true);
  });

  it("is case-insensitive about the country", () => {
    expect(carrierPostalCode("lb", "00000")).toBe("");
    expect(isPostalCodeRequired("sa")).toBe(true);
  });

  it("handles a missing country or code without throwing", () => {
    expect(carrierPostalCode(undefined, "13314")).toBe("");
    expect(carrierPostalCode("SA", undefined)).toBe("");
    expect(isPostalCodeRequired(undefined)).toBe(false);
  });
});
