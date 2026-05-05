// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEventTimeFormat,
  formatHeaderDate,
  formatLocalizedDate,
  formatSyncTimestamp,
} from "../src/renderer/src/date-formatting";

const { i18nMock } = vi.hoisted(() => ({
  i18nMock: {
    language: "en",
    t: vi.fn((key: string, params?: Record<string, unknown>) => {
      if (params && "date" in params) {
        return `${key}|${String(params.date)}`;
      }
      return key;
    }),
  },
}));

vi.mock(import("../src/renderer/src/i18n"), () => ({
  default: i18nMock,
}));

beforeEach(() => {
  i18nMock.language = "en";
  i18nMock.t.mockClear();
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

describe("formatHeaderDate", () => {
  it("formats with month + year for the dayGridMonth view (en locale)", () => {
    expect(formatHeaderDate("2026-04-15T00:00:00.000Z", "dayGridMonth")).toBe("April 2026");
  });

  it("formats with day + month + year for non-month views", () => {
    const result = formatHeaderDate("2026-04-15T12:00:00.000Z", "timeGridDay");
    expect(result).toContain("April");
    expect(result).toContain("2026");
    expect(result).toMatch(/15/);
  });

  it("formats with Italian locale when i18n.language is 'it'", () => {
    i18nMock.language = "it";
    expect(formatHeaderDate("2026-04-15T00:00:00.000Z", "dayGridMonth")).toBe("aprile 2026");
  });

  it("returns the i18n fallback string for an invalid date", () => {
    expect(formatHeaderDate("not-a-date", "dayGridMonth")).toBe("dateFormatting.fallbackCalendar");
    expect(i18nMock.t).toHaveBeenCalledWith("dateFormatting.fallbackCalendar");
  });
});

describe("formatSyncTimestamp", () => {
  it("returns the noSyncYet string for a null value", () => {
    expect(formatSyncTimestamp(null, "system")).toBe("dateFormatting.noSyncYet");
  });

  it("delegates to lastSynced i18n key with formatted date when value is present", () => {
    const result = formatSyncTimestamp("2026-04-15T13:30:00.000Z", "24h");

    expect(result).toMatch(/^dateFormatting\.lastSynced\|/);
    expect(i18nMock.t).toHaveBeenCalledWith(
      "dateFormatting.lastSynced",
      expect.objectContaining({ date: expect.any(String) }),
    );
  });
});

describe("formatLocalizedDate + applyTimeFormat", () => {
  it("uses 24-hour clock when timeFormat is 24h", () => {
    const date = new Date(Date.UTC(2026, 3, 15, 13, 30));
    const result = formatLocalizedDate(date, { hour: "numeric", minute: "2-digit" }, "24h");
    expect(result).not.toMatch(/AM|PM|am|pm/);
  });

  it("uses 12-hour clock when timeFormat is 12h", () => {
    const date = new Date(Date.UTC(2026, 3, 15, 13, 30));
    const result = formatLocalizedDate(date, { hour: "numeric", minute: "2-digit" }, "12h");
    expect(result).toMatch(/AM|PM/i);
  });

  it("does not append hour12 to date-only options when no time units present", () => {
    const date = new Date(Date.UTC(2026, 3, 15));
    const result = formatLocalizedDate(date, { day: "numeric", month: "long" }, "12h");
    expect(result).toMatch(/April/);
    expect(result).not.toMatch(/AM|PM/i);
  });
});

describe("buildEventTimeFormat", () => {
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
    const format = buildEventTimeFormat("system");
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
