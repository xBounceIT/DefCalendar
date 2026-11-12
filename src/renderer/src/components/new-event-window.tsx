import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { CalendarEvent } from "@shared/schemas";
import { applyDocumentTheme } from "../apply-document-theme";
import NewEventPopup from "./new-event-popup";
import {
  findOverlappingBusyEvents,
  getCalendarOverlapLookupRange,
  hasValidOverlapRange,
  type CalendarOverlapTarget,
} from "../event-overlap";
import i18n, { resolveLocaleSettingAsync } from "../i18n";

function NewEventWindow(): React.JSX.Element {
  const { t } = useTranslation();
  const [dismissFailed, setDismissFailed] = useState(false);
  const {
    data: settings,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: () => globalThis.calendarApi.settings.get(),
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    const refresh = () => void refetch();
    const unsubscribe = globalThis.calendarApi.newEventNotifications.onChanged(refresh);
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [refetch]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    let cancelled = false;
    void resolveLocaleSettingAsync(settings.language).then((locale) => {
      if (!cancelled) {
        void i18n.changeLanguage(locale);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings?.language]);

  useEffect(() => applyDocumentTheme(settings?.theme ?? "system"), [settings?.theme]);

  if (!settings) {
    return (
      <div className="new-event-popup__scrim" role="presentation">
        <div
          aria-labelledby="new-event-window-title"
          aria-modal="true"
          className="new-event-popup"
          role="dialog"
        >
          <header className="new-event-popup__header">
            <h3 className="new-event-popup__title" id="new-event-window-title">
              {t("newEventPopup.title")}
            </h3>
            <button
              className="new-event-popup__action"
              onClick={() => {
                setDismissFailed(false);
                void globalThis.calendarApi.newEventNotifications
                  .dismissAll()
                  .catch(() => setDismissFailed(true));
              }}
              type="button"
            >
              {t("common.close")}
            </button>
          </header>
          <div className="new-event-popup__item">
            <p role={isError || dismissFailed ? "alert" : "status"}>
              {dismissFailed
                ? t("newEventPopup.actionError")
                : isError
                  ? t("newEventPopup.loadError")
                  : t("common.loading")}
            </p>
            {isError && (
              <button
                className="new-event-popup__action"
                onClick={() => void refetch()}
                type="button"
              >
                {t("newEventPopup.retry")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const findAcceptConflicts = async (target: CalendarOverlapTarget): Promise<CalendarEvent[]> => {
    const range = getCalendarOverlapLookupRange(target);
    if (!hasValidOverlapRange(target) || !hasValidOverlapRange(range)) {
      return [];
    }
    const { visibleCalendarIds } = await globalThis.calendarApi.settings.get();
    if (visibleCalendarIds.length === 0) {
      return [];
    }
    const candidates = await globalThis.calendarApi.events.list({
      calendarIds: visibleCalendarIds,
      end: range.end,
      start: range.start,
    });
    return findOverlappingBusyEvents(target, candidates);
  };

  return (
    <NewEventPopup onFindAcceptConflicts={findAcceptConflicts} timeFormat={settings.timeFormat} />
  );
}

export default NewEventWindow;
