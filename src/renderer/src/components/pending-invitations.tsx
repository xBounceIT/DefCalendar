import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarEvent, NewEventNotificationItem, UserSettings } from "@shared/schemas";
import type { CalendarOverlapTarget } from "../event-overlap";
import NewEventPopup from "./new-event-popup";

interface PendingInvitationsProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onFindAcceptConflicts: (target: CalendarOverlapTarget) => Promise<CalendarEvent[]>;
  timeFormat: UserSettings["timeFormat"];
}

function PendingInvitations({
  isOpen,
  onOpenChange: setIsOpen,
  onFindAcceptConflicts,
  timeFormat,
}: PendingInvitationsProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<NewEventNotificationItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    let cancelled = false;
    let receivedUpdate = false;
    const unsubscribe = globalThis.calendarApi.newEventNotifications.onChanged((next) => {
      receivedUpdate = true;
      if (!cancelled) {
        setItems(next);
        setFailed(false);
        if (next.length === 0) {
          setIsOpen(false);
        }
      }
    });
    void globalThis.calendarApi.newEventNotifications
      .get()
      .then((initial) => {
        if (!cancelled && !receivedUpdate) {
          setItems(initial);
          if (initial.length === 0) {
            setIsOpen(false);
          }
        }
      })
      .catch(() => {
        if (!cancelled && !receivedUpdate) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadAttempt, setIsOpen]);

  return (
    <>
      <button
        aria-label={`${t("newEventPopup.pendingButton")} ${items.length}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="settings-btn pending-invitations"
        disabled={items.length === 0}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span>{t("newEventPopup.pendingButton")}</span>
        <span className={items.length > 0 ? "pending-invitations__badge" : ""}>{items.length}</span>
      </button>
      {failed && (
        <div role="alert">
          <p>{t("newEventPopup.loadError")}</p>
          <button
            className="settings-btn"
            onClick={() => setLoadAttempt((current) => current + 1)}
            type="button"
          >
            {t("newEventPopup.retry")}
          </button>
        </div>
      )}
      {isOpen && (
        <NewEventPopup
          onClose={() => setIsOpen(false)}
          onOpenEvent={async (reference) => {
            await globalThis.calendarApi.events.openInApp(reference);
            setIsOpen(false);
          }}
          onFindAcceptConflicts={onFindAcceptConflicts}
          showAll
          timeFormat={timeFormat}
        />
      )}
    </>
  );
}

export default PendingInvitations;
