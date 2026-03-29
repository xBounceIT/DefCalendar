import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import type { UserSettings } from "@shared/schemas";

import en from "./i18n/locales/en.json";
import it from "./i18n/locales/it.json";

type TimeFormatSetting = UserSettings["timeFormat"];

function detectLocaleFromLanguageTag(languageTag: null | string | undefined): "en" | "it" {
  if (typeof languageTag === "string" && languageTag.toLowerCase().startsWith("it")) {
    return "it";
  }

  return "en";
}

function resolveLanguageSetting(
  language: null | string | undefined,
  systemLanguageTag: null | string | undefined,
): "en" | "it" {
  if (language === "en" || language === "it") {
    return language;
  }

  return detectLocaleFromLanguageTag(systemLanguageTag);
}

function applyTimeFormat(
  options: Intl.DateTimeFormatOptions,
  timeFormat: TimeFormatSetting,
): Intl.DateTimeFormatOptions {
  if (timeFormat === "system") {
    return options;
  }

  return {
    ...options,
    hour12: timeFormat === "12h",
  };
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: detectLocaleFromLanguageTag(navigator.language ?? navigator.languages?.[0]),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

interface ParsedParams {
  dedupeKey: string;
  subject: string;
  location: string;
  start: string;
  end: string;
}

function parseParams(): ParsedParams {
  const search = new URLSearchParams(globalThis.location.search);
  return {
    dedupeKey: search.get("dedupeKey") ?? "",
    subject: search.get("subject") ?? "",
    location: search.get("location") ?? "",
    start: search.get("start") ?? "",
    end: search.get("end") ?? "",
  };
}

function formatEventTime(start: string, end: string, timeFormat: TimeFormatSetting): string {
  if (!start) {
    return "";
  }
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    return start;
  }

  const endDate = end ? new Date(end) : null;
  const timeFmt = applyTimeFormat(
    {
      hour: "numeric",
      minute: "2-digit",
    },
    timeFormat,
  );

  const startStr = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...timeFmt,
  }).format(startDate);

  if (endDate && !Number.isNaN(endDate.getTime())) {
    const endStr = new Intl.DateTimeFormat(undefined, timeFmt).format(endDate);
    return `${startStr} \u2013 ${endStr}`;
  }

  return startStr;
}

function BellIcon() {
  return (
    <svg
      className="reminder-bell"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2a5.002 5.002 0 0 0-4.583 7.036C5.156 10.088 5 11.233 5 12v1.586A1 1 0 0 0 5.293 14.5L6 15.207V16a2 2 0 0 0 4 0v-.793l.707-.707A1 1 0 0 0 11 13.586V12c0-.767-.156-1.912-.417-2.964A5.002 5.002 0 0 0 10 2z" />
      <line x1="9" y1="18" x2="11" y2="18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`snooze-chevron${open ? " open" : ""}`}
      viewBox="0 0 10 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 1l4 4 4-4" />
    </svg>
  );
}

function ReminderPopup() {
  const { t } = useTranslation();
  const [params] = useState<ParsedParams>(parseParams);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [timeFormat, setTimeFormat] = useState<TimeFormatSetting>("system");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { calendarApi } = globalThis;

  const snoozeOptions = [
    { label: t("reminder.snooze5min"), minutes: 5 },
    { label: t("reminder.snooze15min"), minutes: 15 },
    { label: t("reminder.snooze1hour"), minutes: 60 },
    { label: t("reminder.snoozeTomorrow"), minutes: 24 * 60 },
  ];

  const handleDismiss = useCallback(() => {
    if (calendarApi) {
      void calendarApi.reminder.dismiss(params.dedupeKey);
    }
  }, [calendarApi, params.dedupeKey]);

  const handleDismissAll = useCallback(() => {
    if (calendarApi) {
      void calendarApi.reminder.dismissAll();
    }
  }, [calendarApi]);

  const handleSnooze = useCallback(
    (minutes: number) => {
      setDropdownOpen(false);
      if (calendarApi) {
        void calendarApi.reminder.snooze(params.dedupeKey, minutes);
      }
    },
    [calendarApi, params.dedupeKey],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (!calendarApi) {
      return;
    }

    let cancelled = false;

    async function applyPreferences(): Promise<void> {
      try {
        const settings = await calendarApi.settings.get();
        let systemLanguageTag: string | undefined = undefined;
        try {
          systemLanguageTag = await calendarApi.app.getLocale();
        } catch {
          systemLanguageTag = undefined;
        }

        if (cancelled) {
          return;
        }

        setTimeFormat(settings.timeFormat);
        void i18n.changeLanguage(resolveLanguageSetting(settings.language, systemLanguageTag));
      } catch {
        return;
      }
    }

    void applyPreferences();

    return () => {
      cancelled = true;
    };
  }, [calendarApi]);

  const timeStr = formatEventTime(params.start, params.end, timeFormat);
  const subject = params.subject || t("reminder.untitledEvent");

  return (
    <div className="reminder-popup">
      <div className="reminder-header">
        <div className="reminder-header-left">
          <BellIcon />
          <span className="reminder-title">{t("reminder.title")}</span>
        </div>
        <button className="dismiss-all-btn" onClick={handleDismissAll} type="button">
          {t("reminder.dismissAll")}
        </button>
      </div>

      <div className="reminder-body">
        <div className="reminder-subject">{subject}</div>
        <div className="reminder-meta">
          {timeStr && <div className="reminder-meta-item">{timeStr}</div>}
          {params.location && <div className="reminder-meta-item">{params.location}</div>}
        </div>
      </div>

      <div className="reminder-footer">
        <div className="snooze-container" ref={dropdownRef}>
          <button
            className="snooze-btn"
            onClick={() => setDropdownOpen((prev) => !prev)}
            type="button"
          >
            {t("reminder.snooze")}
            <ChevronIcon open={dropdownOpen} />
          </button>
          {dropdownOpen && (
            <div className="snooze-dropdown">
              {snoozeOptions.map((option) => (
                <button
                  key={option.minutes}
                  className="snooze-option"
                  onClick={() => handleSnooze(option.minutes)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="dismiss-btn" onClick={handleDismiss} type="button">
          {t("reminder.dismiss")}
        </button>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<ReminderPopup />);
}
