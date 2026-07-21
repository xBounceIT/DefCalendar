import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import type { ReminderDialogItem, ReminderDialogState } from "@shared/ipc";

import { applyDocumentTheme } from "./apply-document-theme";
import { MeetingIcon } from "./components/meeting-icon";
import { formatEventTimeRange } from "./date-formatting";
import en from "./i18n/locales/en.json";
import it from "./i18n/locales/it.json";

const EMPTY_STATE: ReminderDialogState = {
  items: [],
  locale: "en",
  timeFormat: "system",
  theme: "system",
};

interface ReminderStartStatus {
  isNow: boolean;
  text: string;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

function formatReminderStartStatus(
  item: ReminderDialogItem,
  nowMs: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): null | ReminderStartStatus {
  const startMs = new Date(item.start).getTime();
  if (Number.isNaN(startMs)) {
    return null;
  }

  const deltaMs = startMs - nowMs;
  const absoluteSeconds = Math.abs(deltaMs) / 1000;
  if (absoluteSeconds <= 60) {
    return {
      isNow: true,
      text: t("reminder.startsNow"),
    };
  }

  if (deltaMs > 0) {
    const minutes = Math.ceil(deltaMs / 60_000);
    if (minutes < 60) {
      return {
        isNow: false,
        text: t("reminder.startsInMinutes", { count: minutes }),
      };
    }

    return {
      isNow: false,
      text: t("reminder.startsInHours", { count: Math.ceil(minutes / 60) }),
    };
  }

  const minutes = Math.floor(Math.abs(deltaMs) / 60_000);
  if (minutes < 60) {
    return {
      isNow: false,
      text: t("reminder.startedMinutesAgo", { count: minutes }),
    };
  }

  return {
    isNow: false,
    text: t("reminder.startedHoursAgo", { count: Math.floor(minutes / 60) }),
  };
}

function ReminderPopup() {
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());
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
    return applyDocumentTheme(state.theme ?? "system");
  }, [state.theme]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, []);

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

  const handleJoinMeeting = (item: ReminderDialogItem) => {
    const joinUrl = item.onlineMeeting?.joinUrl;
    if (!calendarApi || !joinUrl) {
      return;
    }

    setSelectedKey(item.dedupeKey);
    void calendarApi.events.openWebLink(joinUrl);
  };

  const handleOpenEvent = (item: ReminderDialogItem) => {
    if (!calendarApi) {
      return;
    }

    setSelectedKey(item.dedupeKey);
    void calendarApi.events.openInApp({
      calendarId: item.calendarId,
      eventId: item.eventId,
    });
  };

  const handleMinimize = () => {
    if (calendarApi) {
      void calendarApi.reminder.minimizeWindow();
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
          <div className="reminder-header-right">
            <button
              className="reminder-minimize"
              onClick={handleMinimize}
              type="button"
              aria-label={t("reminder.minimize")}
            >
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6h8" />
              </svg>
            </button>
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
        </div>

        <div className="reminder-list" role="list">
          {state.items.map((item) => {
            const isSelected = selectedReminder?.dedupeKey === item.dedupeKey;
            const startStatus = formatReminderStartStatus(item, nowMs, t);

            return (
              <div
                key={item.dedupeKey}
                className={`reminder-item${isSelected ? " reminder-item--selected" : ""}`}
                role="listitem"
              >
                <button
                  aria-pressed={isSelected}
                  className="reminder-item-select"
                  onClick={() => setSelectedKey(item.dedupeKey)}
                  onDoubleClick={() => handleOpenEvent(item)}
                  type="button"
                >
                  <div className="reminder-item-content">
                    <span className="reminder-item-subject">
                      {item.subject || t("reminder.untitledEvent")}
                    </span>
                    {startStatus && (
                      <span
                        className={`reminder-item-start-status${
                          startStatus.isNow ? " reminder-item-start-status--now" : ""
                        }`}
                      >
                        {startStatus.text}
                      </span>
                    )}
                    <span className="reminder-item-time">
                      {formatEventTimeRange(item, state.timeFormat)}
                    </span>
                    {item.location && (
                      <span className="reminder-item-location">{item.location}</span>
                    )}
                  </div>
                </button>
                {item.onlineMeeting?.joinUrl && (
                  <button
                    className="reminder-item-join"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleJoinMeeting(item);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                    }}
                    type="button"
                  >
                    <MeetingIcon url={item.onlineMeeting.joinUrl} />
                    <span>{t("eventEditor.joinMeeting")}</span>
                  </button>
                )}
              </div>
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
            <button className="btn-snooze" onClick={handleSnooze} type="button">
              {t("reminder.snooze")}
            </button>
          </div>
          <div className="reminder-footer-right">
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

export default ReminderPopup;
