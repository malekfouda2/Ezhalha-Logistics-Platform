// store/useLanguageStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nManager } from "react-native";
import * as Localization from "expo-localization";
import RNRestart from "react-native-restart";

import i18n, { LANGUAGE_STORAGE_KEY } from "@/i18n";

export type AppLanguage = "en" | "ar";

export const isRTL = (lang: AppLanguage) => lang === "ar";

interface LanguageState {
  language: AppLanguage;
  isReady: boolean;

  init: () => Promise<void>;
  changeLanguage: (lang: AppLanguage) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: "en",
      isReady: false,

      init: async () => {
        const storedLanguage = get().language;

        let initialLanguage: AppLanguage = storedLanguage;

        // If there is no persisted language, use device language
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);

        if (!stored) {
          const deviceLanguage =
            Localization.getLocales()[0]?.languageCode;

          initialLanguage =
            deviceLanguage === "ar" ? "ar" : "en";
        }

        const rtl = isRTL(initialLanguage);

        // Set i18n language
        await i18n.changeLanguage(initialLanguage);

        // Set RN direction
        if (I18nManager.isRTL !== rtl) {
          I18nManager.allowRTL(rtl);
          I18nManager.forceRTL(rtl);
        }

        set({
          language: initialLanguage,
          isReady: true,
        });
      },

      changeLanguage: async (lang: AppLanguage) => {
        const rtl = isRTL(lang);
        const directionChanged = I18nManager.isRTL !== rtl;

        // Change i18n first
        await i18n.changeLanguage(lang);

        // Update Zustand
        set({
          language: lang,
        });

        // Change native direction
        if (directionChanged) {
          I18nManager.allowRTL(rtl);
          I18nManager.forceRTL(rtl);

          RNRestart.restart();
          
        }
      },
    }),
    {
      name: LANGUAGE_STORAGE_KEY,

      storage: createJSONStorage(() => AsyncStorage),

      partialize: (state) => ({
        language: state.language,
      }),
    }
  )
);