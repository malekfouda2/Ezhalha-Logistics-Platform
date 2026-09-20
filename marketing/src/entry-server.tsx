import { renderToString } from "react-dom/server";
import { App } from "./App";
import type { Locale } from "@shared/i18n";

/** Rendered once per locale by script/prerender.ts, at build time. */
export function render(locale: Locale): string {
  return renderToString(<App locale={locale} />);
}
