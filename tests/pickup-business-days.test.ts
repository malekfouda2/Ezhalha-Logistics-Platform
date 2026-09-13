import { describe, expect, it } from "vitest";
import {
  isBusinessDayInCountry,
  nextBusinessDayAfterInCountry,
  nextBusinessDayOnOrAfter,
  weekendDaysForCountry,
} from "../shared/country-timezones";

/**
 * A pickup is refused when the collection date is not a working day at the ORIGIN, and the origin
 * is usually not where this system runs. The weekend was previously hardcoded to Saudi rules
 * (Friday/Saturday) for every shipment, so Sunday was always treated as a working day.
 *
 * Production, 2026-09-13, a Sunday: EZH861906362 out of Turkey and EZH908166701 out of China both
 * had their pickups refused. What made it hard to see is that booking the waybill and booking the
 * courier are two separate carrier calls — the waybill succeeded, so both parcels were moving and
 * posting tracking updates while no courier had ever been dispatched.
 */
describe("weekend rules by origin", () => {
  it("treats Friday and Saturday as the weekend in the Gulf", () => {
    expect(weekendDaysForCountry("SA")).toEqual([5, 6]);
    expect(weekendDaysForCountry("KW")).toEqual([5, 6]);
    expect(weekendDaysForCountry("EG")).toEqual([5, 6]);
  });

  it("treats Saturday and Sunday as the weekend everywhere else", () => {
    for (const country of ["TR", "CN", "DE", "GB", "US", "IN"]) {
      expect(weekendDaysForCountry(country), country).toEqual([0, 6]);
    }
  });

  it("puts the UAE on a Saturday/Sunday weekend", () => {
    // The UAE moved off the Friday/Saturday week in 2022. Getting this wrong sends Dubai
    // collections to a Sunday that the origin does not work.
    expect(weekendDaysForCountry("AE")).toEqual([0, 6]);
  });

  it("falls back to Saturday/Sunday for an unknown country", () => {
    expect(weekendDaysForCountry(undefined)).toEqual([0, 6]);
    expect(weekendDaysForCountry("")).toEqual([0, 6]);
  });
});

describe("the production failure", () => {
  const SUNDAY = "2026-09-13";
  const MONDAY = "2026-09-14";
  const FRIDAY = "2026-09-11";

  it("refuses the Sunday that DHL refused, for both origins", () => {
    expect(isBusinessDayInCountry(SUNDAY, "TR")).toBe(false);
    expect(isBusinessDayInCountry(SUNDAY, "CN")).toBe(false);
  });

  it("still allows that Sunday out of Saudi Arabia", () => {
    // Sunday is an ordinary working day in KSA. The bug was applying that to every origin, not
    // the KSA rule itself.
    expect(isBusinessDayInCountry(SUNDAY, "SA")).toBe(true);
  });

  it("moves a Sunday collection to the Monday for a Turkish origin", () => {
    expect(nextBusinessDayOnOrAfter(SUNDAY, "TR")).toBe(MONDAY);
  });

  it("leaves a date alone when it is already a working day", () => {
    expect(nextBusinessDayOnOrAfter(MONDAY, "TR")).toBe(MONDAY);
    expect(nextBusinessDayOnOrAfter(FRIDAY, "TR")).toBe(FRIDAY);
  });

  it("skips the Friday for a Gulf origin but not for a European one", () => {
    // The same date resolves differently by origin, which is the whole point. Out of KSA a Friday
    // rolls to the Sunday — not the Monday — because the Gulf works Sunday to Thursday.
    expect(isBusinessDayInCountry(FRIDAY, "SA")).toBe(false);
    expect(nextBusinessDayOnOrAfter(FRIDAY, "SA")).toBe(SUNDAY);
    expect(isBusinessDayInCountry(FRIDAY, "DE")).toBe(true);
    expect(nextBusinessDayOnOrAfter(FRIDAY, "DE")).toBe(FRIDAY);
  });

  it("rolls a Thursday in the Gulf to the Sunday, not the Friday", () => {
    // 2026-09-10 is a Thursday; the Gulf weekend is Friday/Saturday, so the next working day is
    // Sunday the 13th.
    expect(nextBusinessDayAfterInCountry("2026-09-10", "SA")).toBe("2026-09-13");
    // The same Thursday out of Germany rolls to the Friday.
    expect(nextBusinessDayAfterInCountry("2026-09-10", "DE")).toBe("2026-09-11");
  });

  it("crosses a month boundary", () => {
    // 2026-10-31 is a Saturday; the next working day out of Turkey is Monday 2 November.
    expect(nextBusinessDayAfterInCountry("2026-10-30", "TR")).toBe("2026-11-02");
  });
});
