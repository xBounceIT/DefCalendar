import { describe, expect, it } from "vitest";
import { extractHardcodedStrings, getAllTsxFiles } from "./i18n-utils";
import { resolve } from "node:path";

describe("i18n hardcoded string detection", () => {
  const srcDir = resolve(__dirname, "../src");
  const allFiles = getAllTsxFiles(srcDir);

  it("should not have user-facing hardcoded strings", () => {
    const hardcodedStrings: ReturnType<typeof extractHardcodedStrings> = [];

    for (const file of allFiles) {
      if (file.includes(".test.") || file.includes("test/")) {
        continue;
      }
      hardcodedStrings.push(...extractHardcodedStrings(file));
    }

    const filteredStrings = hardcodedStrings.filter((str) => {
      if (str.text.length < 2) {
        return false;
      }
      if (/^\s*$/.test(str.text)) {
        return false;
      }
      if (/^\d+\.?\d*$/.test(str.text)) {
        return false;
      }
      if (/^[A-Za-z0-9_\-.]+$/.test(str.text) && str.text.length < 10) {
        return false;
      }
      return true;
    });

    if (filteredStrings.length > 0) {
      console.error("\nHardcoded strings found:");
      console.error("========================\n");

      const byFile = new Map<string, typeof filteredStrings>();
      for (const str of filteredStrings) {
        const existing = byFile.get(str.file) || [];
        existing.push(str);
        byFile.set(str.file, existing);
      }

      for (const [file, strings] of byFile) {
        console.error(`\n${file}:`);
        for (const str of strings) {
          console.error(`  Line ${str.line} (${str.context}): "${str.text}"`);
        }
      }
      console.error("\n========================\n");
    }

    expect(filteredStrings).toHaveLength(0);
  });
});
