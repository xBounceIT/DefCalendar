import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { UserSettings } from "@shared/schemas";

import en from "./locales/en.json";
import it from "./locales/it.json";

const resources = {
  en: { translation: en },
  it: { translation: it },
};

export type AppLocale = "en" | "it";
export type LanguageSetting = UserSettings["language"];

export const SUPPORTED_LOCALES: AppLocale[] = ["en", "it"];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  it: "Italiano",
};

function detectLocaleFromLanguageTag(languageTag: null | string | undefined): AppLocale {
  if (typeof languageTag === "string" && languageTag.toLowerCase().startsWith("it")) {
    return "it";
  }

  return "en";
}

function detectNavigatorLanguageTag(): null | string {
  try {
    return navigator.language ?? navigator.languages?.[0] ?? null;
  } catch {
    return null;
  }
}

function detectSystemLocale(): AppLocale {
  return detectLocaleFromLanguageTag(detectNavigatorLanguageTag());
}

export function resolveLocaleSetting(
  language: null | string | undefined,
  systemLanguageTag?: null | string,
): AppLocale {
  if (language === "en" || language === "it") {
    return language;
  }

  return detectLocaleFromLanguageTag(systemLanguageTag ?? detectNavigatorLanguageTag());
}

export async function resolveLocaleSettingAsync(
  language: null | string | undefined,
): Promise<AppLocale> {
  if (language === "en" || language === "it") {
    return language;
  }

  try {
    const systemLanguageTag = await globalThis.calendarApi?.app.getLocale();
    return resolveLocaleSetting(language, systemLanguageTag);
  } catch {
    return resolveLocaleSetting(language);
  }
}

export function initI18n(savedLocale?: string | null): void {
  const lng = resolveLocaleSetting(savedLocale, detectSystemLocale());

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
