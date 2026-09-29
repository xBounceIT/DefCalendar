import { initReactI18next } from "react-i18next";
import { createInstance } from "i18next";

import en from "../src/renderer/src/i18n/locales/en.json";
import it from "../src/renderer/src/i18n/locales/it.json";

export function createTestI18n(language = "en") {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, it: { translation: it } },
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return instance;
}
