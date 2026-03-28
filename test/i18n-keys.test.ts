import { describe, expect, it } from "vitest";
import {
  extractKeysFromFile,
  getAllTsxFiles,
  getUsedKeys,
  loadTranslationFiles,
} from "./i18n-utils";
import { resolve } from "node:path";

describe("i18n key existence", () => {
  const translations = loadTranslationFiles();
  const srcDir = resolve(__dirname, "../src");
  const allFiles = getAllTsxFiles(srcDir);

  const allExtractedKeys: ReturnType<typeof extractKeysFromFile> = [];
  for (const file of allFiles) {
    allExtractedKeys.push(...extractKeysFromFile(file));
  }

  const usedKeys = getUsedKeys(allExtractedKeys);
  const enKeys = new Set(Object.keys(translations.en));
  const itKeys = new Set(Object.keys(translations.it));

  it("should have all used keys defined in English translations", () => {
    const missingInEn: string[] = [];

    for (const key of usedKeys) {
      // Direct key match
      if (enKeys.has(key)) {
        continue;
      }
      // Pluralization base key: t("sync.synced", {count}) resolves to sync.synced_one / sync.synced_other
      if (enKeys.has(`${key}_one`) || enKeys.has(`${key}_other`)) {
        continue;
      }
      missingInEn.push(key);
    }

    if (missingInEn.length > 0) {
      console.error("Missing keys in en.json:");
      for (const key of missingInEn) {
        const usages = allExtractedKeys
          .filter((k) => k.key === key)
          .map((k) => `  - ${k.file}:${k.line}`);
        console.error(`  ${key}:`);
        usages.forEach((u) => console.error(u));
      }
    }

    expect(missingInEn).toHaveLength(0);
  });

  it("should have all used keys defined in Italian translations", () => {
    const missingInIt: string[] = [];

    for (const key of usedKeys) {
      // Direct key match
      if (itKeys.has(key)) {
        continue;
      }
      // Pluralization base key: t("sync.synced", {count}) resolves to sync.synced_one / sync.synced_other
      if (itKeys.has(`${key}_one`) || itKeys.has(`${key}_other`)) {
        continue;
      }
      missingInIt.push(key);
    }

    if (missingInIt.length > 0) {
      console.error("Missing keys in it.json:");
      for (const key of missingInIt) {
        const usages = allExtractedKeys
          .filter((k) => k.key === key)
          .map((k) => `  - ${k.file}:${k.line}`);
        console.error(`  ${key}:`);
        usages.forEach((u) => console.error(u));
      }
    }

    expect(missingInIt).toHaveLength(0);
  });

  it("should not define the same key more than once in a single expression block", () => {
    // Translation keys are naturally reused across files and components -- that's their purpose.
    // This test only checks if a key appears an unexpectedly high number of times
    // in a single file, which might indicate a copy-paste error or accidental duplication.
    const fileCounts = new Map<string, number>();

    for (const { key, file } of allExtractedKeys) {
      const fileKey = `${file}::${key}`;
      fileCounts.set(fileKey, (fileCounts.get(fileKey) ?? 0) + 1);
    }

    const suspiciousDuplicates = [...fileCounts.entries()]
      .filter(([, count]) => count > 3)
      .map(([fileKey]) => fileKey);

    expect(suspiciousDuplicates).toHaveLength(0);
  });
});
