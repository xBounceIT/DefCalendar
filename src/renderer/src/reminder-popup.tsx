import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import type { ReminderDialogItem, ReminderDialogState } from "@shared/ipc";
import type { UserSettings } from "@shared/schemas";

import en from "./i18n/locales/en.json";
import it from "./i18n/locales/it.json";

type TimeFormatSetting = UserSettings["timeFormat"];

const EMPTY_STATE: ReminderDialogState = {
  items: [],
  locale: "en",
  timeFormat: "system",
};

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

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

function formatEventTime(
  item: ReminderDialogItem,
  locale: ReminderDialogState["locale"],
  timeFormat: TimeFormatSetting,
): string {
  const startDate = new Date(item.start);
  if (Number.isNaN(startDate.getTime())) {
    return item.start;
  }

  if (item.isAllDay) {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      weekday: "short",
    }).format(startDate);
  }

  const endDate = new Date(item.end);
  const timeOptions = applyTimeFormat(
    {
      hour: "numeric",
      minute: "2-digit",
    },
    timeFormat,
  );
  const startText = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    weekday: "short",
    ...timeOptions,
  }).format(startDate);

  if (Number.isNaN(endDate.getTime())) {
    return startText;
  }

  const endText = new Intl.DateTimeFormat(locale, timeOptions).format(endDate);
  return `${startText} - ${endText}`;
}

function ReminderPopup() {
  const { t } = useTranslation();
  const [snoozeMinutes, setSnoozeMinutes] = useState(5);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [state, setState] = useState<ReminderDialogState>(EMPTY_STATE);
  const { calendarApi } = globalThis;

  const selectedReminder =
    state.items.find((item) => item.dedupeKey === selectedKey) ?? state.items[0] ?? null;

  useEffect(() => {
    void i18n.changeLanguage(state.locale);
  }, [state.locale]);

  useEffect(() => {
    if (!calendarApi) {
      return;
    }

    let cancelled = false;
    const unsubscribe = calendarApi.reminder.onState((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });

    async function loadState(): Promise<void> {
      try {
        const nextState = await calendarApi.reminder.getState();
        if (!cancelled) {
          setState(nextState);
        }
      } catch {
        return;
      }
    }

    void loadState();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [calendarApi]);

  useEffect(() => {
    if (state.items.some((item) => item.dedupeKey === selectedKey)) {
      return;
    }

    setSelectedKey(state.items[0]?.dedupeKey ?? null);
  }, [selectedKey, state.items]);

  const handleSnooze = () => {
    if (calendarApi && selectedReminder) {
      void calendarApi.reminder.snooze(selectedReminder.dedupeKey, snoozeMinutes);
    }
  };

  const handleDismiss = () => {
    if (calendarApi && selectedReminder) {
      void calendarApi.reminder.dismiss(selectedReminder.dedupeKey);
    }
  };

  const handleDismissAll = () => {
    if (calendarApi) {
      void calendarApi.reminder.dismissAll();
    }
  };

  return (
    <div className="reminder-shell">
      <div className="reminder-popup">
        <div className="reminder-header">
          <div className="reminder-header-left">
            <span className="reminder-title">{t("reminder.title")}</span>
            <span className="reminder-count">{state.items.length}</span>
          </div>
          <button
            className="reminder-close"
            onClick={() => window.close()}
            type="button"
            aria-label="Close"
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        <div className="reminder-list" role="listbox">
          {state.items.map((item) => {
            const isSelected = selectedReminder?.dedupeKey === item.dedupeKey;

            return (
              <button
                key={item.dedupeKey}
                className={`reminder-item${isSelected ? " reminder-item--selected" : ""}`}
                onClick={() => setSelectedKey(item.dedupeKey)}
                type="button"
              >
                <div className="reminder-item-content">
                  <span className="reminder-item-subject">
                    {item.subject || t("reminder.untitledEvent")}
                  </span>
                  <span className="reminder-item-time">
                    {formatEventTime(item, state.locale, state.timeFormat)}
                  </span>
                  {item.location && <span className="reminder-item-location">{item.location}</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="reminder-footer">
          <div className="reminder-footer-left">
            <select
              className="snooze-select"
              value={snoozeMinutes}
              onChange={(e) => setSnoozeMinutes(Number(e.target.value))}
            >
              <option value={5}>{t("reminder.snooze5min")}</option>
              <option value={10}>{t("reminder.snooze10min")}</option>
              <option value={15}>{t("reminder.snooze15min")}</option>
              <option value={30}>{t("reminder.snooze30min")}</option>
              <option value={60}>{t("reminder.snooze1hour")}</option>
              <option value={1440}>{t("reminder.snoozeTomorrow")}</option>
            </select>
          </div>
          <div className="reminder-footer-right">
            <button className="btn-snooze" onClick={handleSnooze} type="button">
              {t("reminder.snooze")}
            </button>
            <button className="btn-dismiss" onClick={handleDismiss} type="button">
              {t("reminder.dismiss")}
            </button>
            <button className="btn-dismiss-all" onClick={handleDismissAll} type="button">
              {t("reminder.dismissAll")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<ReminderPopup />);
}
