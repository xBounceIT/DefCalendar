// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildEventTimeFormat,
  formatHeaderDate,
  formatLocalizedDate,
  formatSyncTimestamp,
} from "../src/renderer/src/date-formatting";
import i18n from "../src/renderer/src/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

function withStubbedDateTimeFormat<T>(
  resolvedOptions: () => Partial<Intl.ResolvedDateTimeFormatOptions>,
  body: () => T,
): T {
  const original = Intl.DateTimeFormat;
  function Stub(this: unknown) {
    return { resolvedOptions, format: () => "noop" };
  }
  Object.defineProperty(Intl, "DateTimeFormat", {
    configurable: true,
    writable: true,
    value: Stub,
  });

  try {
    return body();
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

describe(formatHeaderDate, () => {
  it("formats with day + month + year for non-month views", () => {
    const result = formatHeaderDate(new Date(2026, 3, 15, 12).toISOString(), "timeGridDay");
    expect(result).toContain("April");
    expect(result).toContain("2026");
    expect(result).toMatch(/15/);
  });

  it("formats the calendar month in Italian", async () => {
    await i18n.changeLanguage("it");
    expect(formatHeaderDate(new Date(2026, 3, 15, 12).toISOString(), "dayGridMonth")).toBe(
      "aprile 2026",
    );
  });

  it("returns the i18n fallback string for an invalid date", () => {
    expect(formatHeaderDate("not-a-date", "dayGridMonth")).toBe("Calendar");
  });
});

describe(formatSyncTimestamp, () => {
  it("shows that no sync has completed when there is no timestamp", () => {
    expect(formatSyncTimestamp(null, "system")).toBe("No completed sync yet.");
  });

  it("shows the last sync date and time in the requested clock format", () => {
    const timestamp = new Date(2026, 3, 15, 13, 30).toISOString();
    expect(formatSyncTimestamp(timestamp, "24h")).toBe("Last synced Apr 15, 13:30");
  });
});

describe("formatLocalizedDate + applyTimeFormat", () => {
  it.each([
    ["24h", "13:30"],
    ["12h", "1:30 PM"],
  ] as const)("displays an afternoon time in the %s format", (format, expected) => {
    const date = new Date(2026, 3, 15, 13, 30);
    expect(formatLocalizedDate(date, { hour: "numeric", minute: "2-digit" }, format)).toBe(
      expected,
    );
  });

  it("displays just the requested date even when the 12-hour clock is selected", () => {
    const date = new Date(2026, 3, 15);
    const result = formatLocalizedDate(date, { day: "numeric", month: "long" }, "12h");
    expect(result).toBe("April 15");
  });
});

describe(buildEventTimeFormat, () => {
  it("returns hour12=true with meridiem='short' for 12h setting", () => {
    const format = buildEventTimeFormat("12h");
    expect(format.hour12).toBe(true);
    expect(format.meridiem).toBe("short");
  });

  it("returns hour12=false with meridiem=false for 24h setting", () => {
    const format = buildEventTimeFormat("24h");
    expect(format.hour12).toBe(false);
    expect(format.meridiem).toBe(false);
  });

  it("falls back to system clock detection for system setting (12h)", () => {
    const format = withStubbedDateTimeFormat(
      () => ({ hour12: true }),
      () => buildEventTimeFormat("system"),
    );
    expect(format.hour12).toBe(true);
    expect(format.meridiem).toBe("short");
  });

  it("returns 24h shape when system clock is not 12-hour", () => {
    const format = withStubbedDateTimeFormat(
      () => ({ hour12: false }),
      () => buildEventTimeFormat("system"),
    );
    expect(format.hour12).toBe(false);
    expect(format.meridiem).toBe(false);
  });

  it("returns 24h shape when resolvedOptions throws (catch branch)", () => {
    const format = withStubbedDateTimeFormat(
      () => {
        throw new Error("boom");
      },
      () => buildEventTimeFormat("system"),
    );
    expect(format.hour12).toBe(false);
  });
});
