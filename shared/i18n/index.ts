import en from "./en.json";
import ar from "./ar.json";

/**
 * Translation catalogues, shared across surfaces.
 *
 * `mobile/README.md` has documented this directory as the shared contract since the native app
 * was scaffolded — it was simply never built. The marketing site is the first consumer; the
 * mobile app is the intended second, which is why this lives in `shared/` rather than inside
 * `marketing/`.
 *
 * Deliberately not an i18n library. Two locales, one page, no pluralisation rules and no runtime
 * locale negotiation — the catalogue is resolved at build time, once per prerendered page. A
 * library would add a dependency and a provider for something a lookup already does.
 */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Text direction per locale. Drives `dir` on <html>, which every layout decision follows from. */
export const DIRECTION: Record<Locale, "ltr" | "rtl"> = { en: "ltr", ar: "rtl" };

const CATALOGUES = { en, ar } as const;

/** The English catalogue is the shape of record; Arabic is asserted equal to it by test. */
export type Catalogue = typeof en;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getCatalogue(locale: Locale): Catalogue {
  return CATALOGUES[locale] as Catalogue;
}

/**
 * Resolve a dotted key against a catalogue.
 *
 * A missing key returns the key itself rather than an empty string. A blank space on a marketing
 * page is invisible in review and ships; a literal `hero.title` in the middle of the hero is not.
 */
export function translate(catalogue: Catalogue, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), catalogue);
  return typeof value === "string" ? value : key;
}

/** Bind a catalogue once and hand back a lookup. */
export function createTranslator(locale: Locale) {
  const catalogue = getCatalogue(locale);
  return (key: string) => translate(catalogue, key);
}

export type Translator = ReturnType<typeof createTranslator>;
