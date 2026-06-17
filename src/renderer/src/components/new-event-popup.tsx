import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NewEventNotificationItem } from "@shared/ipc";
import type {
  CalendarEvent,
  EventResponseAction,
  RespondToEventArgs,
  UserSettings,
} from "@shared/schemas";
import { formatEventTimeRange } from "../date-formatting";
import type { CalendarOverlapTarget } from "../event-overlap";
import OverlapWarning from "./overlap-warning";

type TimeFormatSetting = UserSettings["timeFormat"];

interface NewEventPopupProps {
  onFindAcceptConflicts: (target: CalendarOverlapTarget) => Promise<CalendarEvent[]>;
  timeFormat: TimeFormatSetting;
}

interface PendingOverlapPrompt {
  args: RespondToEventArgs;
  conflicts: CalendarEvent[];
  eventId: string;
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function toOverlapTarget(item: NewEventNotificationItem): CalendarOverlapTarget {
  return {
    calendarId: item.calendarId,
    end: item.end,
    eventId: item.eventId,
    isAllDay: item.isAllDay,
    start: item.start,
  };
}

function NewEventPopup({
  onFindAcceptConflicts,
  timeFormat,
}: NewEventPopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<NewEventNotificationItem[]>([]);
  const [checkingEventId, setCheckingEventId] = useState<null | string>(null);
  const [overlapErrorEventId, setOverlapErrorEventId] = useState<null | string>(null);
  const [overlapPrompt, setOverlapPrompt] = useState<PendingOverlapPrompt | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lookupSequenceRef = useRef(0);
  const hasItems = items.length > 0;

  useEffect(() => {
    let cancelled = false;

    void globalThis.calendarApi.newEventNotifications.get().then((initial) => {
      if (!cancelled) {
        setItems(initial);
      }
    });

    const unsubscribe = globalThis.calendarApi.newEventNotifications.onChanged((next) => {
      if (!cancelled) {
        setItems(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasItems) {
      return;
    }

    const focusDialog = () => {
      dialogRef.current?.focus({ preventScroll: true });
    };

    focusDialog();
    window.addEventListener("focus", focusDialog);

    return () => {
      window.removeEventListener("focus", focusDialog);
    };
  }, [hasItems]);

  const respondMutation = useMutation({
    mutationFn: (args: RespondToEventArgs) => globalThis.calendarApi.events.respond(args),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (!hasItems) {
    return null;
  }

  const pendingEventId = respondMutation.isPending ? respondMutation.variables?.eventId : undefined;

  const handleRespond = async (item: NewEventNotificationItem, action: EventResponseAction) => {
    const args = {
      action,
      calendarId: item.calendarId,
      comment: "",
      eventId: item.eventId,
      sendResponse: true,
    };

    if (action !== "accept") {
      lookupSequenceRef.current += 1;
      setOverlapErrorEventId(null);
      setOverlapPrompt(null);
      respondMutation.mutate(args);
      return;
    }

    const lookupSequence = lookupSequenceRef.current + 1;
    lookupSequenceRef.current = lookupSequence;
    setCheckingEventId(item.eventId);
    setOverlapErrorEventId(null);
    setOverlapPrompt(null);
    try {
      const conflicts = await onFindAcceptConflicts(toOverlapTarget(item));
      if (lookupSequenceRef.current !== lookupSequence) {
        return;
      }

      if (conflicts.length > 0) {
        setOverlapPrompt({
          args,
          conflicts,
          eventId: item.eventId,
        });
        return;
      }

      respondMutation.mutate(args);
    } catch {
      if (lookupSequenceRef.current === lookupSequence) {
        setOverlapErrorEventId(item.eventId);
      }
    } finally {
      if (lookupSequenceRef.current === lookupSequence) {
        setCheckingEventId(null);
      }
    }
  };

  const handleDismissAll = () => {
    void globalThis.calendarApi.newEventNotifications.dismissAll();
  };

  const handleDismissOne = (eventId: string) => {
    void globalThis.calendarApi.newEventNotifications.dismiss(eventId);
  };

  return (
    <div className="new-event-popup__scrim" role="presentation">
      <div
        aria-labelledby="new-event-popup-title"
        aria-modal="true"
        className="new-event-popup"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="new-event-popup__header">
          <div>
            <h3 className="new-event-popup__title" id="new-event-popup-title">
              {t("newEventPopup.title")}
            </h3>
            <p className="new-event-popup__subtitle">
              {t("newEventPopup.subtitle", { count: items.length })}
            </p>
          </div>
          <button
            aria-label={t("newEventPopup.closeAria")}
            className="new-event-popup__close"
            onClick={handleDismissAll}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>
        <ul className="new-event-popup__list">
          {items.map((item) => {
            const isPending = pendingEventId === item.eventId || checkingEventId !== null;
            const itemOverlapPrompt =
              overlapPrompt?.eventId === item.eventId ? overlapPrompt : null;
            const organizerLabel =
              item.organizerName ?? item.organizerEmail ?? t("newEventPopup.noOrganizer");

            return (
              <li className="new-event-popup__item" key={item.eventId}>
                <div className="new-event-popup__item-content">
                  <div className="new-event-popup__item-header">
                    <span className="new-event-popup__item-subject">{item.subject}</span>
                    <button
                      aria-label={t("newEventPopup.closeAria")}
                      className="new-event-popup__item-dismiss"
                      onClick={() => handleDismissOne(item.eventId)}
                      type="button"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  <span className="new-event-popup__item-time">
                    {formatEventTimeRange(item, timeFormat)}
                  </span>
                  <span className="new-event-popup__item-organizer">{organizerLabel}</span>
                  {item.location && (
                    <span className="new-event-popup__item-location">{item.location}</span>
                  )}
                </div>
                <div className="new-event-popup__item-actions">
                  <button
                    className="new-event-popup__action new-event-popup__action--accept"
                    disabled={isPending}
                    onClick={() => {
                      void handleRespond(item, "accept");
                    }}
                    type="button"
                  >
                    {t("newEventPopup.actions.accept")}
                  </button>
                  <button
                    className="new-event-popup__action new-event-popup__action--tentative"
                    disabled={isPending}
                    onClick={() => {
                      void handleRespond(item, "tentative");
                    }}
                    type="button"
                  >
                    {t("newEventPopup.actions.tentative")}
                  </button>
                  <button
                    className="new-event-popup__action new-event-popup__action--decline"
                    disabled={isPending}
                    onClick={() => {
                      void handleRespond(item, "decline");
                    }}
                    type="button"
                  >
                    {t("newEventPopup.actions.decline")}
                  </button>
                </div>
                {overlapErrorEventId === item.eventId && (
                  <div className="banner banner--error">{t("overlapWarning.lookupError")}</div>
                )}
                {itemOverlapPrompt && (
                  <OverlapWarning
                    busy={respondMutation.isPending}
                    conflicts={itemOverlapPrompt.conflicts}
                    onCancel={() => setOverlapPrompt(null)}
                    onConfirm={() => {
                      respondMutation.mutate(itemOverlapPrompt.args);
                      setOverlapPrompt(null);
                    }}
                    timeFormat={timeFormat}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default NewEventPopup;
