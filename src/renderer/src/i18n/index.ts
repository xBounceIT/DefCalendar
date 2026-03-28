import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import it from "./locales/it.json";

const resources = {
  en: { translation: en },
  it: { translation: it },
};

export type AppLocale = "en" | "it";

export const SUPPORTED_LOCALES: AppLocale[] = ["en", "it"];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  it: "Italiano",
};

function detectSystemLocale(): AppLocale {
  try {
    const systemLang =
      globalThis.calendarApi != null ? undefined : (navigator.language ?? navigator.languages?.[0]);

    if (systemLang?.startsWith("it")) {
      return "it";
    }
  } catch {
    // Fallback to English on any detection failure
  }
  return "en";
}

export function initI18n(savedLocale?: string | null): void {
  const fallback = detectSystemLocale();
  const lng: AppLocale = savedLocale === "en" || savedLocale === "it" ? savedLocale : fallback;

  void i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

export function setAppLocale(locale: AppLocale): void {
  void i18n.changeLanguage(locale);
  void globalThis.calendarApi?.app.setLocale(locale).catch(() => undefined);
}

export function getAppLocale(): AppLocale {
  const lng = i18n.language;
  if (lng === "it") {
    return "it";
  }
  return "en";
}

export default i18n;

initI18n();
