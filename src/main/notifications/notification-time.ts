import { getMainLocale } from "@main/i18n";
import type { NewEventNotificationItem, UserSettings } from "@shared/schemas";

function formatNotificationTime(
  item: Pick<NewEventNotificationItem, "end" | "isAllDay" | "start">,
  timeFormat: UserSettings["timeFormat"],
  language = getMainLocale(),
): string {
  const start = new Date(item.start);
  if (Number.isNaN(start.getTime())) {
    return item.start;
  }

  const locale = language === "it" ? "it-IT" : "en-US";
  if (item.isAllDay) {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      weekday: "short",
    }).format(start);
  }

  const startText = formatDateTime(start, locale, timeFormat, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    weekday: "short",
  });
  const end = new Date(item.end);
  if (Number.isNaN(end.getTime())) {
    return startText;
  }

  const endText = formatDateTime(end, locale, timeFormat, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startText} - ${endText}`;
}

function formatDateTime(
  date: Date,
  locale: string,
  timeFormat: UserSettings["timeFormat"],
  options: Intl.DateTimeFormatOptions,
): string {
  if (timeFormat === "system") {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    ...options,
    hour12: timeFormat === "12h",
  }).format(date);
}

export { formatNotificationTime };
