import i18n from "./i18n";

function getLocale(): string {
  return i18n.language === "it" ? "it-IT" : "en-US";
}

function formatHeaderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return i18n.t("dateFormatting.fallbackCalendar");
  }

  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatSyncTimestamp(value: null | string): string {
  if (!value) {
    return i18n.t("dateFormatting.noSyncYet");
  }

  return i18n.t("dateFormatting.lastSynced", {
    date: new Intl.DateTimeFormat(getLocale(), {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
    }).format(new Date(value)),
  });
}

export { formatHeaderDate, formatSyncTimestamp };
