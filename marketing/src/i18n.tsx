import { createContext, useContext, type ReactNode } from "react";
import { createTranslator, DIRECTION, getCatalogue, type Locale, type Translator } from "@shared/i18n";

/**
 * Locale is fixed per page, not toggled at runtime.
 *
 * Each language is prerendered to its own URL — `/` and `/ar/` — so a crawler sees real Arabic
 * HTML at a real Arabic address, and `hreflang` has something to point at. Switching language is
 * a navigation, not a state change. That also means `dir` and `lang` are correct in the very
 * first byte the browser receives rather than being applied after hydration.
 */

type LocaleContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Translator;
  /** Section content: arrays of objects rather than flat strings. */
  content: ReturnType<typeof getCatalogue>["sections"];
  /** The same page in the other language. */
  alternate: { locale: Locale; href: string; label: string };
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function localeHref(locale: Locale): string {
  return locale === "en" ? "/" : `/${locale}/`;
}

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const catalogue = getCatalogue(locale);
  const other: Locale = locale === "en" ? "ar" : "en";

  const value: LocaleContextValue = {
    locale,
    dir: DIRECTION[locale],
    t: createTranslator(locale),
    content: catalogue.sections,
    alternate: {
      locale: other,
      href: localeHref(other),
      // Always written in the language being offered, never translated into the current one.
      label: other === "ar" ? "العربية" : "English",
    },
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside <LocaleProvider>");
  return value;
}
