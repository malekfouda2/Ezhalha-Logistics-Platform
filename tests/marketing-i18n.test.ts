import { describe, expect, it } from "vitest";
import en from "../shared/i18n/en.json";
import ar from "../shared/i18n/ar.json";
import { LOCALES, DIRECTION, createTranslator, getCatalogue } from "../shared/i18n";
import { COUNTRIES, COUNTRY_CODES } from "../marketing/src/data/countries";
import { QUICK_QUOTE_RATE_LOCATIONS } from "../server/routes";

/**
 * The marketing site is bilingual and prerendered, which makes two classes of mistake invisible
 * until a real visitor hits them: a key that exists in English and not in Arabic renders as a raw
 * `hero.title` on the Arabic page, and a country the picker offers but the server cannot rate
 * returns an empty price panel. Neither throws. Both are caught here.
 */

function flatten(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flatten(item, `${prefix}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("translation catalogues", () => {
  it("has the same keys in both languages", () => {
    const enKeys = flatten(en).sort();
    const arKeys = flatten(ar).sort();

    expect(arKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !arKeys.includes(k))).toEqual([]);
  });

  it("has the same number of items in every section array", () => {
    // A missing flow or stat would not fail a key comparison; the page would just be shorter in
    // one language than the other.
    for (const section of Object.keys(en.sections) as Array<keyof typeof en.sections>) {
      expect(`${section}: ${ar.sections[section].length}`).toBe(`${section}: ${en.sections[section].length}`);
    }
  });

  it("leaves no Arabic string in English", () => {
    const arabic = /[؀-ۿ]/;
    const leaked = flatten(en).filter((key) => arabic.test(createTranslator("en")(key)));
    expect(leaked).toEqual([]);
  });

  it("leaves no English sentence untranslated in Arabic", () => {
    // Brand names and units are legitimately Latin; a Latin *sentence* is not. Three or more
    // Latin words in a row means somebody copied the English value across.
    const t = createTranslator("ar");
    const sentence = /[A-Za-z]{3,}(\s+[A-Za-z]{3,}){2,}/;
    const leaked = flatten(ar)
      .filter((key) => !key.includes("["))
      .filter((key) => sentence.test(t(key)));
    expect(leaked).toEqual([]);
  });

  it("returns the key itself when a lookup misses", () => {
    // A blank space on a marketing page survives review; a literal "hero.nope" does not.
    expect(createTranslator("en")("hero.nope")).toBe("hero.nope");
  });

  it("maps every locale to a direction", () => {
    for (const locale of LOCALES) {
      expect(DIRECTION[locale]).toMatch(/^(ltr|rtl)$/);
      expect(getCatalogue(locale)).toBeTruthy();
    }
    expect(DIRECTION.ar).toBe("rtl");
  });
});

describe("marketing country list", () => {
  it("matches exactly what the server can live-rate", () => {
    // QUICK_QUOTE_RATE_LOCATIONS is what lets the server quote from a country alone, by
    // fabricating a representative postal code. Offering a country outside it renders a picker
    // option that always comes back empty.
    const server = Object.keys(QUICK_QUOTE_RATE_LOCATIONS).sort();
    const site = [...COUNTRY_CODES].sort();

    expect(site.filter((c) => !server.includes(c))).toEqual([]);
    expect(server.filter((c) => !site.includes(c))).toEqual([]);
  });

  it("names every country in both languages", () => {
    for (const country of COUNTRIES) {
      expect(`${country.code}.en`).toBe(country.en ? `${country.code}.en` : "missing");
      expect(country.en.length).toBeGreaterThan(1);
      expect(country.ar.length).toBeGreaterThan(1);
      // The Arabic name must actually be Arabic.
      expect(`${country.code}: ${/[؀-ۿ]/.test(country.ar)}`).toBe(`${country.code}: true`);
    }
  });

  it("includes Saudi Arabia, since every default lane starts there", () => {
    expect(COUNTRY_CODES).toContain("SA");
  });
});
