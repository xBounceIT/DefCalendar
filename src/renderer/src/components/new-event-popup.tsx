import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CalendarApi, NewEventNotificationItem } from "@shared/ipc";
import type { EventResponseAction, RespondToEventArgs, UserSettings } from "@shared/schemas";
import { formatEventTimeRange } from "../date-formatting";

type TimeFormatSetting = UserSettings["timeFormat"];

interface NewEventPopupProps {
  timeFormat: TimeFormatSetting;
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

function NewEventPopup({ timeFormat }: NewEventPopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<NewEventNotificationItem[]>([]);
  const calendarApi = (globalThis as { calendarApi?: CalendarApi }).calendarApi;

  useEffect(() => {
    if (!calendarApi) {
      return;
    }

    let cancelled = false;

    void calendarApi.newEventNotifications.get().then((initial) => {
      if (!cancelled) {
        setItems(initial);
      }
    });

    const unsubscribe = calendarApi.newEventNotifications.onChanged((next) => {
      if (!cancelled) {
        setItems(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [calendarApi]);

  const respondMutation = useMutation({
    mutationFn: (args: RespondToEventArgs) => {
      if (!calendarApi) {
        throw new Error("calendarApi not available");
      }
      return calendarApi.events.respond(args);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (!calendarApi || items.length === 0) {
    return null;
  }

  const pendingEventId = respondMutation.isPending ? respondMutation.variables?.eventId : undefined;

  const handleRespond = (item: NewEventNotificationItem, action: EventResponseAction) => {
    respondMutation.mutate({
      action,
      calendarId: item.calendarId,
      comment: "",
      eventId: item.eventId,
      sendResponse: true,
    });
  };

  const handleDismissAll = () => {
    void calendarApi.newEventNotifications.dismissAll();
  };

  const handleDismissOne = (eventId: string) => {
    void calendarApi.newEventNotifications.dismiss(eventId);
  };

  return (
    <div className="new-event-popup__scrim" role="presentation">
      <div
        aria-labelledby="new-event-popup-title"
        aria-modal="true"
        className="new-event-popup"
        role="dialog"
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
            const isPending = pendingEventId === item.eventId;
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
                    onClick={() => handleRespond(item, "accept")}
                    type="button"
                  >
                    {t("newEventPopup.actions.accept")}
                  </button>
                  <button
                    className="new-event-popup__action new-event-popup__action--tentative"
                    disabled={isPending}
                    onClick={() => handleRespond(item, "tentative")}
                    type="button"
                  >
                    {t("newEventPopup.actions.tentative")}
                  </button>
                  <button
                    className="new-event-popup__action new-event-popup__action--decline"
                    disabled={isPending}
                    onClick={() => handleRespond(item, "decline")}
                    type="button"
                  >
                    {t("newEventPopup.actions.decline")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default NewEventPopup;
