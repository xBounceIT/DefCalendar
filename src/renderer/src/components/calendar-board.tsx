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
  isLoadingEvents: boolean;
  onDateClick: (clickInfo: DateClickArg) => void;
  onDateDoubleClick: (clickInfo: DateClickArg) => void;
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
const TOOLTIP_FALLBACK_HEIGHT_PX = 32;
const TOOLTIP_GAP_PX = 8;
const TOOLTIP_MAX_WIDTH_PX = 320;
const TOOLTIP_SHOW_DELAY_MS = 900;
const TOOLTIP_VIEWPORT_SIDE_MARGIN_PX = 12;

interface TooltipPosition {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

interface TooltipSize {
  height: number;
  width: number;
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getTooltipReservedWidth(viewportWidth: number): number {
  return Math.min(
    TOOLTIP_MAX_WIDTH_PX,
    Math.max(0, viewportWidth - TOOLTIP_VIEWPORT_SIDE_MARGIN_PX * 2),
  );
}

function measureTooltipSize(text: string): TooltipSize {
  const tooltip = document.createElement("div");
  tooltip.className = "calendar-event-tooltip";
  tooltip.textContent = text;
  tooltip.style.left = "0";
  tooltip.style.top = "0";
  tooltip.style.visibility = "hidden";
  document.body.append(tooltip);

  const rect = tooltip.getBoundingClientRect();
  tooltip.remove();

  return {
    height: rect.height > 0 ? rect.height : TOOLTIP_FALLBACK_HEIGHT_PX,
    width: rect.width > 0 ? rect.width : getTooltipReservedWidth(globalThis.innerWidth),
  };
}

function getTooltipPosition(eventRect: DOMRect, tooltipSize: TooltipSize): TooltipPosition {
  const viewportWidth = globalThis.innerWidth;
  const viewportHeight = globalThis.innerHeight;
  const horizontalMax = Math.max(
    TOOLTIP_GAP_PX,
    viewportWidth - tooltipSize.width - TOOLTIP_GAP_PX,
  );
  const verticalMax = Math.max(
    TOOLTIP_GAP_PX,
    viewportHeight - tooltipSize.height - TOOLTIP_GAP_PX,
  );
  const top = clamp(eventRect.top, TOOLTIP_GAP_PX, verticalMax);
  const left = clamp(eventRect.left, TOOLTIP_GAP_PX, horizontalMax);
  const rightPlacement = eventRect.right + TOOLTIP_GAP_PX;
  const leftPlacement = viewportWidth - eventRect.left + TOOLTIP_GAP_PX;

  if (rightPlacement + tooltipSize.width <= viewportWidth) {
    return {
      left: rightPlacement,
      top,
    };
  }

  if (eventRect.left - TOOLTIP_GAP_PX - tooltipSize.width >= 0) {
    return {
      right: leftPlacement,
      top,
    };
  }

  if (eventRect.bottom + TOOLTIP_GAP_PX + tooltipSize.height <= viewportHeight) {
    return {
      left,
      top: eventRect.bottom + TOOLTIP_GAP_PX,
    };
  }

  if (eventRect.top - TOOLTIP_GAP_PX - tooltipSize.height >= TOOLTIP_GAP_PX) {
    return {
      bottom: viewportHeight - eventRect.top + TOOLTIP_GAP_PX,
      left,
    };
  }

  return {
    left,
    top,
  };
}

function getTooltipStyle(position: TooltipPosition): React.CSSProperties {
  return {
    bottom: position.bottom === undefined ? undefined : `${position.bottom}px`,
    left: position.left === undefined ? undefined : `${position.left}px`,
    right: position.right === undefined ? undefined : `${position.right}px`,
    top: position.top === undefined ? undefined : `${position.top}px`,
  };
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

interface EventCopyButtonProps {
  calendarId: string;
  eventId: string;
  onCopy: (calendarId: string, eventId: string) => void;
}

function EventCopyButton({ calendarId, eventId, onCopy }: EventCopyButtonProps) {
  const { t } = useTranslation();
  const [recentlyCopied, setRecentlyCopied] = React.useState(false);
  const timeoutRef = React.useRef<null | ReturnType<typeof globalThis.setTimeout>>(null);

  React.useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        globalThis.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  function handleClick(event: React.MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onCopy(calendarId, eventId);

    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
    }
    setRecentlyCopied(true);
    timeoutRef.current = globalThis.setTimeout(() => {
      setRecentlyCopied(false);
      timeoutRef.current = null;
    }, 1500);
  }

  const ariaLabel = recentlyCopied ? t("calendarBoard.eventCopied") : t("calendarBoard.copyEvent");

  return (
    <>
      <button
        aria-label={ariaLabel}
        className={`calendar-event-content__copy-btn${
          recentlyCopied ? " calendar-event-content__copy-btn--copied" : ""
        }`}
        onClick={handleClick}
        onMouseDown={(event) => event.stopPropagation()}
        type="button"
      >
        {recentlyCopied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="visually-hidden" role="status">
        {recentlyCopied ? t("calendarBoard.eventCopied") : ""}
      </span>
    </>
  );
}

const DOUBLE_CLICK_THRESHOLD_MS = 400;

function CalendarSurface({
  activeView,
  calendarEvents,
  calendarRef,
  onDateClick,
  onDateDoubleClick,
  onDatesSet,
  onEventClick,
  onEventCopy,
  onEventDrop,
  onEventResize,
  selectedDate,
  selectedDayForTable,
  timeFormat,
}: Omit<CalendarBoardProps, "hasVisibleCalendars" | "isLoadingEvents">) {
  const { t, i18n } = useTranslation();
  const tooltipShowTimeoutRef = React.useRef<null | ReturnType<typeof globalThis.setTimeout>>(null);
  const [hoverTooltip, setHoverTooltip] = React.useState<null | {
    position: TooltipPosition;
    text: string;
  }>(null);
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

      clearTooltipShowTimeout();
      setHoverTooltip(null);
      tooltipShowTimeoutRef.current = globalThis.setTimeout(() => {
        const text = getEventTooltip(t, eventData);
        setHoverTooltip({
          position: getTooltipPosition(arg.el.getBoundingClientRect(), measureTooltipSize(text)),
          text,
        });
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

  const renderEventContent = React.useCallback(
    (info: EventContentArg) => {
      const { calendarId, eventData, eventId } = info.event
        .extendedProps as CalendarEventExtendedProps;
      const hasReminder = Boolean(eventData?.isReminderOn);
      const hasTime = info.timeText.length > 0;

      return (
        <div className="calendar-event-content">
          {hasTime ? <span className="fc-event-time">{info.timeText}</span> : null}
          <span className="fc-event-title">{info.event.title}</span>
          {calendarId && eventId ? (
            <EventCopyButton calendarId={calendarId} eventId={eventId} onCopy={onEventCopy} />
          ) : null}
          {hasReminder ? <BellIcon /> : null}
        </div>
      );
    },
    [onEventCopy],
  );

  const renderedTooltip = hoverTooltip
    ? createPortal(
        <div
          aria-live="polite"
          className="calendar-event-tooltip"
          role="tooltip"
          style={getTooltipStyle(hoverTooltip.position)}
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

  const lastClickRef = React.useRef<{ iso: string; time: number } | null>(null);
  const handleDateClick = React.useCallback(
    (arg: DateClickArg) => {
      const now = Date.now();
      const iso = arg.date.toISOString();
      const previous = lastClickRef.current;
      if (previous && previous.iso === iso && now - previous.time <= DOUBLE_CLICK_THRESHOLD_MS) {
        lastClickRef.current = null;
        onDateDoubleClick(arg);
        return;
      }

      lastClickRef.current = { iso, time: now };
      onDateClick(arg);
    },
    [onDateClick, onDateDoubleClick],
  );

  return (
    <>
      <FullCalendar
        allDayMaintainDuration
        allDayText={t("eventEditor.allDay")}
        dateClick={handleDateClick}
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
  const { t } = useTranslation();
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
      {props.isLoadingEvents && (
        <div className="calendar-board__loading" role="status">
          {t("common.loading")}
        </div>
      )}
      <CalendarSurface
        activeView={props.activeView}
        calendarEvents={props.calendarEvents}
        calendarRef={props.calendarRef}
        onDateClick={props.onDateClick}
        onDateDoubleClick={props.onDateDoubleClick}
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
