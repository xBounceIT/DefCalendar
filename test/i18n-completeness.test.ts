import { describe, expect, it } from "vitest";
import { eventSearchSortSchema } from "../src/shared/schema-values";
import { authSessionIssueSchema } from "../src/shared/schemas";
import { loadTranslationFiles } from "./i18n-utils";

describe("i18n translation completeness", () => {
  const { en, it: italian } = loadTranslationFiles();
  const keys = Object.keys(en);

  it("provides the same messages in both locales", () => {
    expect(Object.keys(italian).toSorted()).toStrictEqual(keys.toSorted());
  });

  it("provides a label for every event search sort mode", () => {
    for (const sortMode of eventSearchSortSchema.options) {
      expect(en).toHaveProperty(["eventSearch.sort." + sortMode]);
    }
  });

  it("provides a message for every session validation reason", () => {
    for (const reason of authSessionIssueSchema.shape.reason.options) {
      expect(en).toHaveProperty(["auth.sessionIssues." + reason]);
    }
  });

  it("provides both singular and plural messages for count labels", () => {
    const singular = keys.filter((key) => key.endsWith("_one")).map((key) => key.slice(0, -4));
    const plural = keys.filter((key) => key.endsWith("_other")).map((key) => key.slice(0, -6));

    expect(plural.toSorted()).toStrictEqual(singular.toSorted());
  });

  it("provides non-empty messages in both locales", () => {
    const empty = Object.entries({ en, it: italian }).flatMap(([locale, messages]) =>
      Object.entries(messages)
        .filter(([, message]) => message.trim() === "")
        .map(([key]) => locale + ": " + key),
    );

    expect(empty).toStrictEqual([]);
  });
});
