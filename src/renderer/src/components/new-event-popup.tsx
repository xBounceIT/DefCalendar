import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import buildEventReferenceKey from "@shared/event-reference";
import type { NewEventNotificationItem } from "@shared/ipc";
import type {
  CalendarEvent,
  EventResponseAction,
  EventReferenceArgs,
  RespondToEventArgs,
  UserSettings,
} from "@shared/schemas";
import { formatEventTimeRange } from "../date-formatting";
import type { CalendarOverlapTarget } from "../event-overlap";
import OverlapWarning from "./overlap-warning";

type TimeFormatSetting = UserSettings["timeFormat"];

interface NewEventPopupProps {
  onFindAcceptConflicts: (target: CalendarOverlapTarget) => Promise<CalendarEvent[]>;
  onClose?: () => void;
  onOpenEvent?: (reference: EventReferenceArgs) => Promise<void>;
  showAll?: boolean;
  timeFormat: TimeFormatSetting;
}

interface PendingOverlapPrompt {
  args: RespondToEventArgs;
  conflicts: CalendarEvent[];
  eventKey: string;
  itemVersion: string;
}

function getItemVersion(item: NewEventNotificationItem): string {
  return (
    item.revision ??
    JSON.stringify([item.start, item.end, item.isAllDay, item.kind, item.subject, item.location])
  );
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
  onClose,
  onOpenEvent,
  showAll = false,
}: NewEventPopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const statusLabels = {
    invitation: t("newEventPopup.status.invitation"),
    updated: t("newEventPopup.status.updated"),
    cancelled: t("newEventPopup.status.cancelled"),
  };
  const queryClient = useQueryClient();
  const [items, setItems] = useState<NewEventNotificationItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dismissFailed, setDismissFailed] = useState(false);
  const [checkingEventKey, setCheckingEventKey] = useState<null | string>(null);
  const [overlapErrorEventKey, setOverlapErrorEventKey] = useState<null | string>(null);
  const [actionErrorEventKey, setActionErrorEventKey] = useState<null | string>(null);
  const [overlapPrompt, setOverlapPrompt] = useState<PendingOverlapPrompt | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pendingLookupRef = useRef<{ eventKey: string; itemVersion: string } | null>(null);
  const hasItems = items.length > 0;

  useEffect(() => {
    setLoadFailed(false);
    let cancelled = false;
    let receivedUpdate = false;
    const updateItems = (next: NewEventNotificationItem[]) => {
      next = showAll ? next : next.filter((item) => !item.popupDismissed);
      const eventKeys = new Set(next.map(buildEventReferenceKey));
      const itemVersions = new Map(
        next.map((item) => [buildEventReferenceKey(item), getItemVersion(item)]),
      );
      if (
        pendingLookupRef.current &&
        itemVersions.get(pendingLookupRef.current.eventKey) !== pendingLookupRef.current.itemVersion
      ) {
        pendingLookupRef.current = null;
        setCheckingEventKey(null);
      }
      setOverlapPrompt((current) =>
        current && itemVersions.get(current.eventKey) === current.itemVersion ? current : null,
      );
      setOverlapErrorEventKey((current) => (current && eventKeys.has(current) ? current : null));
      setActionErrorEventKey((current) => (current && eventKeys.has(current) ? current : null));
      setItems(next);
      setLoadFailed(false);
    };

    const unsubscribe = globalThis.calendarApi.newEventNotifications.onChanged((next) => {
      if (!cancelled) {
        receivedUpdate = true;
        updateItems(next);
      }
    });

    void globalThis.calendarApi.newEventNotifications
      .get()
      .then((initial) => {
        if (!cancelled && !receivedUpdate) {
          updateItems(initial);
        }
      })
      .catch(() => {
        if (!cancelled && !receivedUpdate) {
          setLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
      pendingLookupRef.current = null;
      unsubscribe();
    };
  }, [showAll, loadAttempt]);

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

  const handleRespond = async (item: NewEventNotificationItem, action: EventResponseAction) => {
    const eventKey = buildEventReferenceKey(item);
    const args = {
      action,
      calendarId: item.calendarId,
      comment: "",
      eventId: item.eventId,
      sendResponse: true,
      ...(item.revision ? { notificationRevision: item.revision } : {}),
    };

    if (action !== "accept") {
      pendingLookupRef.current = null;
      setCheckingEventKey(null);
      setOverlapErrorEventKey(null);
      setOverlapPrompt(null);
      respondMutation.mutate(args);
      return;
    }

    const lookup = { eventKey, itemVersion: getItemVersion(item) };
    pendingLookupRef.current = lookup;
    setCheckingEventKey(eventKey);
    setOverlapErrorEventKey(null);
    setOverlapPrompt(null);
    try {
      const conflicts = await onFindAcceptConflicts(toOverlapTarget(item));
      if (pendingLookupRef.current !== lookup) {
        return;
      }

      if (conflicts.length > 0) {
        setOverlapPrompt({
          args,
          conflicts,
          eventKey,
          itemVersion: lookup.itemVersion,
        });
        return;
      }

      respondMutation.mutate(args);
    } catch {
      if (pendingLookupRef.current === lookup) {
        setOverlapErrorEventKey(eventKey);
      }
    } finally {
      if (pendingLookupRef.current === lookup) {
        pendingLookupRef.current = null;
        setCheckingEventKey(null);
      }
    }
  };

  const handleDismissAll = () => {
    setDismissFailed(false);
    pendingLookupRef.current = null;
    setCheckingEventKey(null);
    setOverlapPrompt(null);
    setOverlapErrorEventKey(null);
    void globalThis.calendarApi.newEventNotifications
      .dismissAll()
      .then(() => onClose?.())
      .catch(() => setDismissFailed(true));
  };

  const handleDismissOne = (item: NewEventNotificationItem) => {
    const eventKey = buildEventReferenceKey(item);
    if (pendingLookupRef.current?.eventKey === eventKey) {
      pendingLookupRef.current = null;
      setCheckingEventKey(null);
    }
    setOverlapPrompt((current) => (current?.eventKey === eventKey ? null : current));
    setOverlapErrorEventKey((current) => (current === eventKey ? null : current));
    void globalThis.calendarApi.newEventNotifications
      .dismiss({
        calendarId: item.calendarId,
        eventId: item.eventId,
      })
      .catch(() => setActionErrorEventKey(eventKey));
  };

  if (!hasItems) {
    if (!loadFailed) {
      return null;
    }
    return (
      <div className="new-event-popup__scrim" role="presentation">
        <div
          className="new-event-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-event-popup-title"
        >
          <header className="new-event-popup__header">
            <h3 id="new-event-popup-title">{t("newEventPopup.title")}</h3>
            <button
              className="new-event-popup__close"
              aria-label={t("newEventPopup.closeAria")}
              onClick={handleDismissAll}
              type="button"
            >
              <CloseIcon />
            </button>
          </header>
          <div className="new-event-popup__item">
            <p role="alert">
              {t(dismissFailed ? "newEventPopup.actionError" : "newEventPopup.loadError")}
            </p>
            <button
              className="new-event-popup__action"
              onClick={() => setLoadAttempt((current) => current + 1)}
              type="button"
            >
              {t("newEventPopup.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <p className="new-event-popup__subtitle">{t("newEventPopup.keepPending")}</p>
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
        {dismissFailed && (
          <p className="banner banner--error" role="alert">
            {t("newEventPopup.actionError")}
          </p>
        )}
        <ul className="new-event-popup__list">
          {items.map((item) => {
            const eventKey = buildEventReferenceKey(item);
            const isPending = respondMutation.isPending || checkingEventKey !== null;
            const itemOverlapPrompt = overlapPrompt?.eventKey === eventKey ? overlapPrompt : null;
            const organizerLabel =
              item.organizerName ?? item.organizerEmail ?? t("newEventPopup.noOrganizer");

            return (
              <li className="new-event-popup__item" key={eventKey}>
                <div className="new-event-popup__item-content">
                  <div className="new-event-popup__item-header">
                    <span className="new-event-popup__item-subject">{item.subject}</span>
                    {!showAll && (
                      <button
                        aria-label={t("newEventPopup.closeAria")}
                        className="new-event-popup__item-dismiss"
                        onClick={() => handleDismissOne(item)}
                        type="button"
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                  <span className="new-event-popup__item-time">
                    {formatEventTimeRange(item, timeFormat)}
                  </span>
                  <span className="new-event-popup__item-status">
                    {statusLabels[item.kind ?? "invitation"]}
                  </span>
                  <span className="new-event-popup__item-organizer">{organizerLabel}</span>
                  {item.location && (
                    <span className="new-event-popup__item-location">{item.location}</span>
                  )}
                </div>
                <div className="new-event-popup__item-actions">
                  {onOpenEvent && item.kind !== "cancelled" && (
                    <button
                      className="new-event-popup__action"
                      disabled={isPending}
                      onClick={() =>
                        void onOpenEvent({
                          calendarId: item.calendarId,
                          eventId: item.eventId,
                        }).catch(() => setActionErrorEventKey(eventKey))
                      }
                      type="button"
                    >
                      {t("newEventPopup.actions.openEvent")}
                    </button>
                  )}
                  {item.kind !== "cancelled" && (
                    <>
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
                    </>
                  )}
                  {(item.kind === "updated" || item.kind === "cancelled") && (
                    <button
                      className="new-event-popup__action"
                      disabled={isPending}
                      onClick={() => {
                        setActionErrorEventKey(null);
                        void globalThis.calendarApi.newEventNotifications
                          .acknowledge({
                            calendarId: item.calendarId,
                            eventId: item.eventId,
                            ...(item.revision ? { revision: item.revision } : {}),
                          })
                          .catch(() => setActionErrorEventKey(eventKey));
                      }}
                      type="button"
                    >
                      {t("newEventPopup.actions.acknowledge")}
                    </button>
                  )}
                </div>
                {(actionErrorEventKey === eventKey ||
                  (respondMutation.isError &&
                    buildEventReferenceKey(respondMutation.variables) === eventKey)) && (
                  <div className="banner banner--error" role="alert">
                    {t("newEventPopup.actionError")}
                  </div>
                )}
                {overlapErrorEventKey === eventKey && (
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
