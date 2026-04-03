import type { UserSettings } from "@shared/schemas";
import i18n from "./i18n";

type TimeFormatSetting = UserSettings["timeFormat"];

interface CalendarEventTimeFormat {
  hour: "numeric";
  hour12?: boolean;
  meridiem: false | "short";
  minute: "2-digit";
}

function getLocale(): string {
  return i18n.language === "it" ? "it-IT" : "en-US";
}

function applyTimeFormat(
  options: Intl.DateTimeFormatOptions,
  timeFormat: TimeFormatSetting,
): Intl.DateTimeFormatOptions {
  const hasTimeUnits =
    options.hour !== undefined || options.minute !== undefined || options.second !== undefined;

  if (!hasTimeUnits || timeFormat === "system") {
    return options;
  }

  return {
    ...options,
    hour12: timeFormat === "12h",
  };
}

function detectSystemUses12HourClock(): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (typeof resolved.hour12 === "boolean") {
      return resolved.hour12;
    }
  } catch {
    return false;
  }

  return false;
}

function buildEventTimeFormat(timeFormat: TimeFormatSetting): CalendarEventTimeFormat {
  if (timeFormat === "12h") {
    return {
      hour: "numeric",
      hour12: true,
      meridiem: "short",
      minute: "2-digit",
    };
  }

  if (timeFormat === "24h") {
    return {
      hour: "numeric",
      hour12: false,
      meridiem: false,
      minute: "2-digit",
    };
  }

  const systemUses12HourClock = detectSystemUses12HourClock();
  if (systemUses12HourClock) {
    return {
      hour: "numeric",
      hour12: true,
      meridiem: "short",
      minute: "2-digit",
    };
  }

  return {
    hour: "numeric",
    hour12: false,
    meridiem: false,
    minute: "2-digit",
  };
}

function formatLocalizedDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  timeFormat: TimeFormatSetting,
): string {
  return new Intl.DateTimeFormat(getLocale(), applyTimeFormat(options, timeFormat)).format(date);
}

function formatHeaderDate(value: string, view?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return i18n.t("dateFormatting.fallbackCalendar");
  }

  const options: Intl.DateTimeFormatOptions =
    view === "dayGridMonth"
      ? { month: "long", year: "numeric" }
      : { day: "numeric", month: "long", year: "numeric" };

  return new Intl.DateTimeFormat(getLocale(), options).format(date);
}

function formatSyncTimestamp(value: null | string, timeFormat: TimeFormatSetting): string {
  if (!value) {
    return i18n.t("dateFormatting.noSyncYet");
  }

  return i18n.t("dateFormatting.lastSynced", {
    date: formatLocalizedDate(
      new Date(value),
      {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
      },
      timeFormat,
    ),
  });
}

export { buildEventTimeFormat, formatHeaderDate, formatLocalizedDate, formatSyncTimestamp };
