import type {
  DayCellArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventHoveringArg,
  EventInput,
  EventMountArg,
} from "@fullcalendar/core";
import itLocale from "@fullcalendar/core/locales/it";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import React from "react";
import { createPortal } from "react-dom";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useTranslation } from "react-i18next";
import type { CalendarEvent, CalendarView, UserSettings } from "@shared/schemas";

import { buildEventTimeFormat } from "../date-formatting";
import interactionPlugin from "../interaction-plugin";

interface CalendarBoardProps {
  activeView: CalendarView;
  calendarEvents: EventInput[];
  calendarRef: React.RefObject<FullCalendar | null>;
  hasVisibleCalendars: boolean;
  onDateClick: (clickInfo: DateClickArg) => void;
  onDatesSet: (dates: DatesSetArg) => void;
  onEventClick: (clickInfo: EventClickArg) => void;
  onEventCopy: (calendarId: string, eventId: string) => void;
  onEventDrop: (changeInfo: EventDropArg) => void;
  onEventResize: (changeInfo: EventResizeDoneArg) => void;
  selectedDate: string;
  selectedDayForTable: null | string;
  timeFormat: UserSettings["timeFormat"];
}

const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const TOOLTIP_SHOW_DELAY_MS = 500;

interface CalendarEventExtendedProps {
  calendarColor?: string | null;
  calendarId?: string;
  eventData?: Pick<CalendarEvent, "isOrganizer" | "isReminderOn" | "responseStatus">;
  eventId?: string;
}

function normalizeResponseValue(response: null | string | undefined): null | string {
  const normalized = response?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "accepted" || normalized === "declined" || normalized === "tentative") {
    return normalized;
  }

  if (normalized === "tentativelyaccepted") {
    return "tentative";
  }

  if (normalized === "none" || normalized === "notresponded" || normalized === "organizer") {
    return "none";
  }

  return normalized;
}

function getResponseStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  response: null | string | undefined,
): string {
  const normalizedResponse = normalizeResponseValue(response);
  if (normalizedResponse === "accepted") {
    return t("eventEditor.responseAccepted");
  }

  if (normalizedResponse === "declined") {
    return t("eventEditor.responseDeclined");
  }

  if (normalizedResponse === "tentative") {
    return t("eventEditor.responseTentative");
  }

  return t("eventEditor.responseUnknown");
}

function getEventTooltip(
  t: ReturnType<typeof useTranslation>["t"],
  eventData: CalendarEventExtendedProps["eventData"],
): string {
  if (eventData?.isOrganizer) {
    return t("calendarBoard.ownerTooltip");
  }

  return t("eventEditor.yourResponse", {
    response: getResponseStatusLabel(t, eventData?.responseStatus?.response),
  });
}

const CALENDAR_COLOR_CLASS_NAMES: Record<string, string> = {
  blue: "calendar-event--color-blue",
  green: "calendar-event--color-green",
  lightBlue: "calendar-event--color-blue",
  orange: "calendar-event--color-orange",
  purple: "calendar-event--color-purple",
  red: "calendar-event--color-red",
  teal: "calendar-event--color-teal",
  yellow: "calendar-event--color-yellow",
};

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="calendar-event-content__icon"
      fill="none"
      focusable="false"
      height="12"
      viewBox="0 0 16 16"
      width="12"
    >
      <path
        d="M8 2.5a3 3 0 0 0-3 3v1.1c0 .7-.2 1.4-.6 2L3.7 9.8a1 1 0 0 0 .8 1.7h7a1 1 0 0 0 .8-1.7l-.7-1.2a3.8 3.8 0 0 1-.6-2V5.5a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M6.5 12.5a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width="12"
    >
      <rect height="14" rx="2" ry="2" width="14" x="8" y="8" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="12"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function removeTitleAttributes(rootElement: HTMLElement): void {
  rootElement.removeAttribute("title");
  const titledElements = rootElement.querySelectorAll<HTMLElement>("[title]");
  for (const element of titledElements) {
    element.removeAttribute("title");
  }
}

function resolveCalendarColorClassName(color: string | null | undefined): null | string {
  if (!color) {
    return null;
  }

  return CALENDAR_COLOR_CLASS_NAMES[color.trim()] ?? null;
}

function handleEventClassNames(info: EventContentArg): string[] {
  const { calendarColor } = info.event.extendedProps as CalendarEventExtendedProps;
  const className = resolveCalendarColorClassName(calendarColor);
  if (!className) {
    return [];
  }

  return [className];
}

function isSameLocalDay(left: Date, rightIso: null | string): boolean {
  if (!rightIso) {
    return false;
  }

  const right = new Date(rightIso);
  if (Number.isNaN(right.getTime())) {
    return false;
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function EmptyState() {
  const { t, i18n } = useTranslation();

  return (
    <div className="empty-state">
      <h3>{t("calendarBoard.noCalendars")}</h3>
      <p>{t("calendarBoard.noCalendarsHint")}</p>
    </div>
  );
}

function CalendarSurface({
  activeView,
  calendarEvents,
  calendarRef,
  onDateClick,
  onDatesSet,
  onEventClick,
  onEventCopy,
  onEventDrop,
  onEventResize,
  selectedDate,
  selectedDayForTable,
  timeFormat,
}: Omit<CalendarBoardProps, "hasVisibleCalendars">) {
  const { t, i18n } = useTranslation();
  const tooltipShowTimeoutRef = React.useRef<null | ReturnType<typeof globalThis.setTimeout>>(null);
  const recentlyCopiedTimeoutRef = React.useRef<null | ReturnType<typeof globalThis.setTimeout>>(
    null,
  );
  const [hoverTooltip, setHoverTooltip] = React.useState<null | {
    text: string;
    x: number;
    y: number;
  }>(null);
  const [recentlyCopiedEventId, setRecentlyCopiedEventId] = React.useState<null | string>(null);
  const locale = React.useMemo(() => (i18n.language === "it" ? "it" : "en"), [i18n.language]);
  const eventTimeFormat = React.useMemo(() => buildEventTimeFormat(timeFormat), [timeFormat]);
  const handleEventDidMount = React.useCallback((arg: EventMountArg) => {
    removeTitleAttributes(arg.el);
  }, []);
  const clearTooltipShowTimeout = React.useCallback(() => {
    if (tooltipShowTimeoutRef.current === null) {
      return;
    }

    globalThis.clearTimeout(tooltipShowTimeoutRef.current);
    tooltipShowTimeoutRef.current = null;
  }, []);
  const handleEventMouseEnter = React.useCallback(
    (arg: EventHoveringArg) => {
      const { eventData } = arg.event.extendedProps as CalendarEventExtendedProps;
      const nextTooltip = {
        text: getEventTooltip(t, eventData),
        x: arg.jsEvent.clientX + 12,
        y: arg.jsEvent.clientY + 12,
      };

      clearTooltipShowTimeout();
      tooltipShowTimeoutRef.current = globalThis.setTimeout(() => {
        setHoverTooltip(nextTooltip);
        tooltipShowTimeoutRef.current = null;
      }, TOOLTIP_SHOW_DELAY_MS);
    },
    [clearTooltipShowTimeout, t],
  );
  const handleEventMouseLeave = React.useCallback(() => {
    clearTooltipShowTimeout();
    setHoverTooltip(null);
  }, [clearTooltipShowTimeout]);

  React.useEffect(
    () => () => {
      clearTooltipShowTimeout();
    },
    [clearTooltipShowTimeout],
  );

  React.useEffect(
    () => () => {
      if (recentlyCopiedTimeoutRef.current !== null) {
        globalThis.clearTimeout(recentlyCopiedTimeoutRef.current);
      }
    },
    [],
  );

  const handleCopyClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, calendarId: string, eventId: string) => {
      event.stopPropagation();
      onEventCopy(calendarId, eventId);

      if (recentlyCopiedTimeoutRef.current !== null) {
        globalThis.clearTimeout(recentlyCopiedTimeoutRef.current);
      }
      setRecentlyCopiedEventId(`${calendarId}:${eventId}`);
      recentlyCopiedTimeoutRef.current = globalThis.setTimeout(() => {
        setRecentlyCopiedEventId(null);
        recentlyCopiedTimeoutRef.current = null;
      }, 1500);
    },
    [onEventCopy],
  );

  const renderEventContent = React.useCallback(
    (info: EventContentArg) => {
      const { calendarId, eventData, eventId } = info.event
        .extendedProps as CalendarEventExtendedProps;
      const hasReminder = Boolean(eventData?.isReminderOn);
      const hasTime = info.timeText.length > 0;
      const isRecentlyCopied = info.event.id === recentlyCopiedEventId;
      const canCopy = Boolean(calendarId && eventId);

      return (
        <div className="calendar-event-content">
          {hasTime ? <span className="fc-event-time">{info.timeText}</span> : null}
          <span className="fc-event-title">{info.event.title}</span>
          {canCopy ? (
            <button
              aria-label={t("calendarBoard.copyEvent")}
              className={`calendar-event-content__copy-btn${
                isRecentlyCopied ? " calendar-event-content__copy-btn--copied" : ""
              }`}
              onClick={(event) => {
                handleCopyClick(event, calendarId as string, eventId as string);
              }}
              type="button"
            >
              {isRecentlyCopied ? <CheckIcon /> : <CopyIcon />}
            </button>
          ) : null}
          {hasReminder ? <BellIcon /> : null}
        </div>
      );
    },
    [handleCopyClick, recentlyCopiedEventId, t],
  );

  const renderedTooltip = hoverTooltip
    ? createPortal(
        <div
          aria-live="polite"
          className="calendar-event-tooltip"
          role="tooltip"
          style={{ left: `${hoverTooltip.x}px`, top: `${hoverTooltip.y}px` }}
        >
          {hoverTooltip.text}
        </div>,
        document.body,
      )
    : null;

  const handleDayCellClassNames = React.useCallback(
    (arg: DayCellArg) => {
      if (!isSameLocalDay(arg.date, selectedDayForTable)) {
        return [];
      }

      return ["fc-daygrid-day-selected"];
    },
    [selectedDayForTable],
  );

  return (
    <>
      <FullCalendar
        allDayMaintainDuration
        allDayText={t("eventEditor.allDay")}
        dateClick={onDateClick}
        datesSet={onDatesSet}
        dayCellClassNames={handleDayCellClassNames}
        dayMaxEvents={3}
        dayMaxEventRows={3}
        eventMaxStack={3}
        slotEventOverlap={false}
        editable
        eventClick={onEventClick}
        eventClassNames={handleEventClassNames}
        eventContent={renderEventContent}
        eventDidMount={handleEventDidMount}
        eventDisplay="block"
        eventDrop={onEventDrop}
        eventMouseEnter={handleEventMouseEnter}
        eventMouseLeave={handleEventMouseLeave}
        eventResize={onEventResize}
        eventTimeFormat={eventTimeFormat}
        events={calendarEvents}
        firstDay={1}
        headerToolbar={false}
        height="100%"
        locale={locale}
        locales={[itLocale]}
        initialDate={selectedDate}
        initialView={activeView}
        moreLinkText={(count) => t("calendarBoard.moreEvents", { count })}
        nowIndicator
        plugins={CALENDAR_PLUGINS}
        ref={calendarRef}
        slotMaxTime="24:00:00"
        slotLabelFormat={eventTimeFormat}
        slotMinTime="00:00:00"
        weekNumbers
        weekNumberFormat={{ week: "numeric" }}
        weekends
      />
      {renderedTooltip}
    </>
  );
}

function CalendarBoard(props: CalendarBoardProps) {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!props.hasVisibleCalendars) {
      return;
    }

    function updateCalendarSize(): void {
      props.calendarRef.current?.getApi().updateSize();
    }

    let cancelScheduledUpdate = () => undefined;
    if (typeof globalThis.requestAnimationFrame === "function") {
      const frameId = globalThis.requestAnimationFrame(() => {
        updateCalendarSize();
      });
      cancelScheduledUpdate = () => {
        globalThis.cancelAnimationFrame(frameId);
      };
    } else {
      const timeoutId = globalThis.setTimeout(() => {
        updateCalendarSize();
      }, 0);
      cancelScheduledUpdate = () => {
        globalThis.clearTimeout(timeoutId);
      };
    }

    let resizeObserver: ResizeObserver | null = null;
    if (surfaceRef.current && typeof globalThis.ResizeObserver === "function") {
      resizeObserver = new globalThis.ResizeObserver(() => {
        updateCalendarSize();
      });
      resizeObserver.observe(surfaceRef.current);
    }

    return () => {
      cancelScheduledUpdate();
      resizeObserver?.disconnect();
    };
  }, [props.activeView, props.calendarRef, props.hasVisibleCalendars]);

  let content: React.JSX.Element = (
    <div className="calendar-board__surface" ref={surfaceRef}>
      <CalendarSurface
        activeView={props.activeView}
        calendarEvents={props.calendarEvents}
        calendarRef={props.calendarRef}
        onDateClick={props.onDateClick}
        onDatesSet={props.onDatesSet}
        onEventClick={props.onEventClick}
        onEventCopy={props.onEventCopy}
        onEventDrop={props.onEventDrop}
        onEventResize={props.onEventResize}
        selectedDate={props.selectedDate}
        selectedDayForTable={props.selectedDayForTable}
        timeFormat={props.timeFormat}
      />
    </div>
  );

  if (!props.hasVisibleCalendars) {
    content = (
      <div className="calendar-board__empty">
        <EmptyState />
      </div>
    );
  }

  return <section className="calendar-board">{content}</section>;
}

export default CalendarBoard;
