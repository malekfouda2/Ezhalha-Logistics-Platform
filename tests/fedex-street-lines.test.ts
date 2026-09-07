import { describe, expect, it } from "vitest";
import { buildFedexStreetLines } from "../server/integrations/fedex";

const MAX = 35;

// FedEx caps a street line at 35 characters and ignores anything past the third line. Its
// /ship endpoint tolerates an over-length line; /pickup rejects it as
// PICKUP.STREETLINE.MISSING — a message that reads as "you sent nothing" when the truth is
// "you sent too much". EZH503313541 lost its collection to exactly that.
describe("the line that broke production", () => {
  const REAL = "Address: Main Road, El Metn, Mkalles, Lebanon Phone: +961 1 690 096";

  it("was 67 characters, nearly twice the limit", () => {
    expect(REAL.length).toBe(67);
  });

  it("strips the label prefix and the embedded phone number", () => {
    const lines = buildFedexStreetLines(REAL);
    expect(lines.join(" ")).not.toMatch(/^Address:/);
    // The phone has its own field on the request; repeating it in the street helps nobody
    // and is what pushed this line over the limit.
    expect(lines.join(" ")).not.toContain("690 096");
    expect(lines.join(" ")).not.toMatch(/Phone/i);
  });

  it("brings every line within the limit", () => {
    for (const line of buildFedexStreetLines(REAL)) {
      expect(line.length).toBeLessThanOrEqual(MAX);
    }
  });

  it("keeps the actual street", () => {
    expect(buildFedexStreetLines(REAL).join(" ")).toContain("Main Road");
  });
});

describe("wrapping", () => {
  it("leaves a short line untouched", () => {
    expect(buildFedexStreetLines("Main Road, El Metn")).toEqual(["Main Road, El Metn"]);
  });

  it("wraps on word boundaries rather than mid-word", () => {
    const long = "Building 12 King Abdulaziz Road Al Olaya District Riyadh";
    const lines = buildFedexStreetLines(long);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(MAX);
    }
    // No word may be cut in half.
    for (const word of long.split(" ")) {
      expect(lines.join(" ")).toContain(word);
    }
  });

  it("never returns more than three lines", () => {
    const veryLong = Array.from({ length: 40 }, (_, i) => `Segment${i}`).join(" ");
    expect(buildFedexStreetLines(veryLong).length).toBeLessThanOrEqual(3);
  });

  it("hard-cuts a single token longer than the limit", () => {
    // Nothing better can be done with it, but it must still fit.
    const [line] = buildFedexStreetLines("A".repeat(80));
    expect(line.length).toBeLessThanOrEqual(MAX);
  });

  it("combines two address lines", () => {
    expect(buildFedexStreetLines("Main Road", "Floor 3")).toEqual(["Main Road", "Floor 3"]);
  });

  it("drops blank lines instead of sending empty strings", () => {
    expect(buildFedexStreetLines("Main Road", "", undefined, null)).toEqual(["Main Road"]);
  });
});

describe("never sending nothing", () => {
  it("returns a placeholder rather than an empty array", () => {
    // FedEx requires at least one street line. An empty array is a guaranteed rejection; a
    // placeholder at least fails address validation with a message a human can read.
    expect(buildFedexStreetLines()).toEqual(["N/A"]);
    expect(buildFedexStreetLines("", "   ")).toEqual(["N/A"]);
  });

  it("does not reduce a whole address to nothing by over-stripping", () => {
    // Guard against the phone-stripping regex eating a legitimate street.
    const lines = buildFedexStreetLines("Phone Street 12");
    expect(lines.join(" ")).toContain("Phone Street");
  });
});

describe("normal addresses are unaffected", () => {
  it("passes through a typical Saudi address", () => {
    expect(buildFedexStreetLines("Al Muruj, Badr", "Riyadh 14718"))
      .toEqual(["Al Muruj, Badr", "Riyadh 14718"]);
  });

  it("collapses runs of whitespace and trailing punctuation", () => {
    expect(buildFedexStreetLines("Main   Road,  ")).toEqual(["Main Road"]);
  });
});
