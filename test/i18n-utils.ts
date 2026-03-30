import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

interface TranslationFiles {
  en: Record<string, string>;
  it: Record<string, string>;
}

interface ExtractedKey {
  file: string;
  key: string;
  line: number;
}

interface HardcodedString {
  file: string;
  line: number;
  text: string;
  context: string;
}

const WHITELIST = new Set([
  // Common technical terms
  "OK",
  "vs",
  "x",
  "y",
  "z",
  "id",
  "api",
  "url",
  "href",
  "src",
  "css",
  "html",
  "js",
  "ts",
  "jsx",
  "tsx",
  "json",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "ico",
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  // Product/brand names (international)
  "Exchange",
  "Microsoft",
  "365",
  "Outlook",
  "DefCalendar",
  "Windows",
  "macOS",
  "Linux",
  // Technical identifiers
  "get",
  "set",
  "post",
  "put",
  "delete",
  "patch",
  "Promise",
  "void",
  // Common abbreviations
  "min",
  "max",
  "avg",
  "num",
  "ctx",
  "ref",
  "prop",
  "val",
  "key",
  // CSS/Layout
  "px",
  "em",
  "rem",
  "vh",
  "vw",
  // HTTP/Status codes
  "http",
  "https",
  "404",
  "500",
  "200",
  // File extensions
  "cjs",
  "mjs",
  "d.ts",
  // TypeScript type annotations that get captured by JSX text extraction
  "): Promise",
]);

function isWhitelisted(text: string): boolean {
  const trimmed = text.trim();
  if (WHITELIST.has(trimmed)) {
    return true;
  }
  if (/^\d+$/.test(trimmed)) {
    return true;
  }
  if (/^[a-z-]+[0-9]*$/.test(trimmed)) {
    return true;
  }
  if (/^[A-Z_]+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "string") {
      result[newKey] = value;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    }
  }

  return result;
}

function loadTranslationFiles(): TranslationFiles {
  const basePath = resolve(__dirname, "../src/renderer/src/i18n/locales");

  const enRaw = JSON.parse(readFileSync(join(basePath, "en.json"), "utf8"));
  const itRaw = JSON.parse(readFileSync(join(basePath, "it.json"), "utf8"));

  return {
    en: flattenObject(enRaw),
    it: flattenObject(itRaw),
  };
}

function getAllTsxFiles(dir: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllTsxFiles(fullPath));
    } else if (item.endsWith(".tsx") || item.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractKeysFromFile(filePath: string): ExtractedKey[] {
  // Skip main process files -- they use src/main/i18n.ts with inline translations,
  // Not the JSON locale files. Matching t() in those files produces false positives.
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (normalizedPath.includes("/src/main/")) {
    return [];
  }

  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const keys: ExtractedKey[] = [];

  // Match t("key") or t('key') with optional arguments after the key.
  // Negative lookbehind ensures we don't match get("key"), set("key"), default("key"), etc.
  const tPattern = /(?<![a-zA-Z])t\(\s*['"]([^'"\s]+)['"](?:\s*[,)])/g;
  // Match i18n.t("key") pattern with optional arguments
  const i18nTPattern = /i18n\.t\(\s*['"]([^'"\s]+)['"](?:\s*[,)])/g;

  lines.forEach((line, index) => {
    let match: RegExpExecArray | null = null;

    // Extract t() calls
    while ((match = tPattern.exec(line)) !== null) {
      const [, key] = match;
      // Filter out obvious non-translation keys (too long, no dots for namespaced keys)
      // Valid keys should either have dots (namespaced) or be short simple keys
      if (key.length < 100 && (key.includes(".") || /^[a-z][a-zA-Z0-9]*$/.test(key))) {
        keys.push({
          file: filePath,
          key,
          line: index + 1,
        });
      }
    }

    // Extract i18n.t() calls
    while ((match = i18nTPattern.exec(line)) !== null) {
      const [, key] = match;
      if (key.length < 100 && (key.includes(".") || /^[a-z][a-zA-Z0-9]*$/.test(key))) {
        keys.push({
          file: filePath,
          key,
          line: index + 1,
        });
      }
    }
  });

  return keys;
}

function extractHardcodedStrings(filePath: string): HardcodedString[] {
  // Skip main process files -- they don't use JSX and use inline translations
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (normalizedPath.includes("/src/main/")) {
    return [];
  }

  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const strings: HardcodedString[] = [];

  const jsxTextPattern = />([^<]{2,})</g;
  const ariaLabelPattern = /aria-label=['"]([^'"]+)['"]/g;
  const titlePattern = /title=['"]([^'"]+)['"]/g;
  const placeholderPattern = /placeholder=['"]([^'"]+)['"]/g;
  const altPattern = /alt=['"]([^'"]+)['"]/g;

  lines.forEach((line, index) => {
    const lineMatches: { text: string; type: string }[] = [];

    let match: RegExpExecArray | null = null;
    while ((match = jsxTextPattern.exec(line)) !== null) {
      const text = match[1].trim();
      // Skip JSX expressions -- these are already translated values like {t("key")} or {variable}
      if (/^\{.*\}$/.test(text)) {
        continue;
      }
      lineMatches.push({ text, type: "JSX text" });
    }

    while ((match = ariaLabelPattern.exec(line)) !== null) {
      lineMatches.push({ text: match[1], type: "aria-label" });
    }

    while ((match = titlePattern.exec(line)) !== null) {
      lineMatches.push({ text: match[1], type: "title" });
    }

    while ((match = placeholderPattern.exec(line)) !== null) {
      lineMatches.push({ text: match[1], type: "placeholder" });
    }

    while ((match = altPattern.exec(line)) !== null) {
      lineMatches.push({ text: match[1], type: "alt" });
    }

    for (const { text, type } of lineMatches) {
      if (!isWhitelisted(text)) {
        strings.push({
          file: filePath,
          line: index + 1,
          text,
          context: type,
        });
      }
    }
  });

  return strings;
}

function getAllTranslationKeys(translations: Record<string, string>): string[] {
  return Object.keys(translations);
}

function getUsedKeys(extracted: ExtractedKey[]): Set<string> {
  const keys = new Set<string>();
  for (const { key } of extracted) {
    keys.add(key);
  }
  return keys;
}

export {
  type ExtractedKey,
  type HardcodedString,
  type TranslationFiles,
  WHITELIST,
  flattenObject,
  getAllTranslationKeys,
  getAllTsxFiles,
  getUsedKeys,
  isWhitelisted,
  loadTranslationFiles,
  extractKeysFromFile,
  extractHardcodedStrings,
};
