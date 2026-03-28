import { describe, expect, it } from "vitest";
import {
  extractKeysFromFile,
  getAllTsxFiles,
  getUsedKeys,
  loadTranslationFiles,
} from "./i18n-utils";
import { resolve } from "node:path";

describe("i18n translation completeness", () => {
  const translations = loadTranslationFiles();
  const srcDir = resolve(__dirname, "../src");
  const allFiles = getAllTsxFiles(srcDir);

  const allExtractedKeys: ReturnType<typeof extractKeysFromFile> = [];
  for (const file of allFiles) {
    allExtractedKeys.push(...extractKeysFromFile(file));
  }

  const usedKeys = getUsedKeys(allExtractedKeys);
  const enKeys = Object.keys(translations.en);
  const itKeys = Object.keys(translations.it);

  it("should have identical keys in both translation files", () => {
    const enSet = new Set(enKeys);
    const itSet = new Set(itKeys);

    const onlyInEn = enKeys.filter((k) => !itSet.has(k));
    const onlyInIt = itKeys.filter((k) => !enSet.has(k));

    if (onlyInEn.length > 0) {
      console.warn("Keys only in en.json (missing in it.json):", onlyInEn);
    }

    if (onlyInIt.length > 0) {
      console.warn("Keys only in it.json (missing in en.json):", onlyInIt);
    }

    expect(onlyInEn).toHaveLength(0);
    expect(onlyInIt).toHaveLength(0);
  });

  it("should not have orphaned keys (defined but not used)", () => {
    // Keys used via dynamic patterns (template literals like `miniCalendar.weekdays.${day}`,
    // Lookup tables like VIEW_KEYS["dayGridMonth"] -> "calendarViews.month") that static
    // Regex analysis cannot detect.
    const DYNAMIC_KEY_PREFIXES = [
      "miniCalendar.weekdays.", // Used via t(`miniCalendar.weekdays.${key}`)
      "calendarViews.", // Used via a VIEW_KEYS record lookup
      "tray.", // Used by main process i18n (separate translation system)
      "sync.", // Used by main process + via translateSyncMessage() lookup
    ];

    // Keys that are defined for completeness or future use but not yet actively referenced
    const KNOWN_UNUSED_KEYS = new Set([
      "common.calendar",
      "common.cancel",
      "common.delete",
      "common.saving",
      "common.sync",
      "app.signInToSync",
      "app.unexpectedError",
      "sidebar.language",
      "eventEditor.newEventEyebrow",
      "eventEditor.newEventTitle",
      "eventEditor.editEventEyebrow",
      "eventEditor.editEventTitle",
      "eventEditor.subject",
      "eventEditor.start",
      "eventEditor.startDay",
      "eventEditor.end",
      "eventEditor.endDay",
      "eventEditor.allDay",
      "eventEditor.location",
      "eventEditor.desktopReminder",
      "eventEditor.reminderMinutes",
      "eventEditor.notes",
      "eventEditor.calendar",
      "eventEditor.createEvent",
      "eventEditor.saveChanges",
      "eventEditor.openInOutlook",
      "eventEditor.organizerSelf",
      "eventEditor.organizerOther",
      "eventEditor.attendeeCount_one",
      "eventEditor.attendeeCount_other",
    ]);

    const orphaned: string[] = [];

    for (const key of enKeys) {
      if (usedKeys.has(key)) {
        continue;
      }

      // Check if this is a pluralization variant of a used base key
      // E.g. "sync.synced_one" / "sync.synced_other" are used via t("sync.synced", {count})
      const pluralBase = key.replace(/_(one|other|zero|few|many)$/, "");
      if (pluralBase !== key && usedKeys.has(pluralBase)) {
        continue;
      }

      // Check if the key belongs to a namespace used via dynamic/template patterns
      const isDynamic = DYNAMIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
      if (isDynamic) {
        continue;
      }

      // Skip keys that are intentionally kept but not yet actively used
      if (KNOWN_UNUSED_KEYS.has(key)) {
        continue;
      }

      orphaned.push(key);
    }

    if (orphaned.length > 0) {
      console.warn("\nOrphaned keys (defined but not used):");
      orphaned.forEach((key) => console.warn(`  - ${key}`));
    }

    expect(orphaned).toHaveLength(0);
  });

  it("should have proper pluralization key pairs", () => {
    const pluralizationIssues: string[] = [];

    for (const key of enKeys) {
      if (key.endsWith("_one")) {
        const baseKey = key.slice(0, -4);
        const otherKey = `${baseKey}_other`;
        if (!enKeys.includes(otherKey)) {
          pluralizationIssues.push(`${key} missing pair: ${otherKey}`);
        }
      } else if (key.endsWith("_other")) {
        const baseKey = key.slice(0, -6);
        const oneKey = `${baseKey}_one`;
        if (!enKeys.includes(oneKey)) {
          pluralizationIssues.push(`${key} missing pair: ${oneKey}`);
        }
      }
    }

    if (pluralizationIssues.length > 0) {
      console.warn("\nPluralization key issues:");
      pluralizationIssues.forEach((issue) => console.warn(`  - ${issue}`));
    }

    expect(pluralizationIssues).toHaveLength(0);
  });

  it("should have non-empty translations for all keys", () => {
    const emptyTranslations: { lang: string; key: string }[] = [];

    for (const [key, value] of Object.entries(translations.en)) {
      if (!value || value.trim() === "") {
        emptyTranslations.push({ lang: "en", key });
      }
    }

    for (const [key, value] of Object.entries(translations.it)) {
      if (!value || value.trim() === "") {
        emptyTranslations.push({ lang: "it", key });
      }
    }

    if (emptyTranslations.length > 0) {
      console.error("\nEmpty translations found:");
      emptyTranslations.forEach(({ lang, key }) => {
        console.error(`  - ${lang}.json: ${key}`);
      });
    }

    expect(emptyTranslations).toHaveLength(0);
  });
});
