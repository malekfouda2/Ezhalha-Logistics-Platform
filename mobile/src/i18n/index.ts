// i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "./locales/en.json";
import ar from "./locales/ar.json";

export const LANGUAGE_STORAGE_KEY = "language-storage";

export type AppLanguage = "en" | "ar";

export const isRTL = (lang: AppLanguage) => lang === "ar";

export const getInitialLanguage = async (): Promise<AppLanguage> => {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "ar") {
      return stored;
    }
  } catch {
    // ignore storage errors, fall back to device locale
  }

  const deviceLang = Localization.getLocales()[0]?.languageCode;
  return deviceLang === "ar" ? "ar" : "en";
};

i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",

  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;