import en from "../src/renderer/src/i18n/locales/en.json";
import it from "../src/renderer/src/i18n/locales/it.json";

function flattenTranslations(
  messages: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(messages)) {
    const path = prefix + key;
    if (typeof value === "string") {
      result[path] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenTranslations(value as Record<string, unknown>, path + "."));
    }
  }

  return result;
}

export function loadTranslationFiles() {
  return { en: flattenTranslations(en), it: flattenTranslations(it) };
}
