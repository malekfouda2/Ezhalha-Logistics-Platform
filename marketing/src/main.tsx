import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { isLocale, DEFAULT_LOCALE } from "@shared/i18n";

/**
 * Hydration entry.
 *
 * The locale is read from the <html lang> the prerender already wrote, so there is no flash and
 * no second source of truth. Hydrating (not rendering) keeps the server-rendered markup that the
 * crawler saw and that the browser has already painted.
 */
const declared = document.documentElement.getAttribute("lang");
const locale = isLocale(declared) ? declared : DEFAULT_LOCALE;

const root = document.getElementById("root");
if (root) hydrateRoot(root, <App locale={locale} />);
