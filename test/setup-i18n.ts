import { initReactI18next } from "react-i18next";
import i18n from "i18next";

import en from "../src/renderer/src/i18n/locales/en.json";

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});
