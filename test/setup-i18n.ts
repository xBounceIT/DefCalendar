import { initReactI18next } from "react-i18next";
import { createInstance } from "i18next";

import en from "../src/renderer/src/i18n/locales/en.json";

export function createTestI18n() {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return instance;
}
