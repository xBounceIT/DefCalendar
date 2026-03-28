import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { CalendarView } from "@shared/schemas";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import React from "react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "../interaction-plugin";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useTranslation } from "react-i18next";

interface CalendarBoardProps {
  activeView: CalendarView;
  calendarEvents: EventInput[];
  calendarRef: React.RefObject<FullCalendar | null>;
  hasVisibleCalendars: boolean;
  onDatesSet: (dates: DatesSetArg) => void;
  onEventClick: (clickInfo: EventClickArg) => void;
  onEventDrop: (changeInfo: EventDropArg) => void;
  onEventResize: (changeInfo: EventResizeDoneArg) => void;
  onSelection: (selection: DateSelectArg) => void;
  selectedDate: string;
}

const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const EVENT_TIME_FORMAT = { hour: "numeric", meridiem: false, minute: "2-digit" } as const;

interface EventMountInfo {
  event: {
    extendedProps: {
      calendarColor?: string | null;
    };
  };
  el: HTMLElement;
}

function handleEventDidMount(info: EventMountInfo): void {
  const { calendarColor } = info.event.extendedProps;
  if (calendarColor) {
    info.el.setAttribute("data-calendar-color", calendarColor);
  }
}

function EmptyState() {
  const { t } = useTranslation();

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
  onDatesSet,
  onEventClick,
  onEventDrop,
  onEventResize,
  onSelection,
  selectedDate,
}: Omit<CalendarBoardProps, "hasVisibleCalendars">) {
  const { t } = useTranslation();

  return (
    <FullCalendar
      allDayMaintainDuration
      datesSet={onDatesSet}
      dayMaxEvents={3}
      dayMaxEventRows={3}
      editable
      eventClick={onEventClick}
      eventDidMount={handleEventDidMount}
      eventDisplay="block"
      eventDrop={onEventDrop}
      eventResize={onEventResize}
      eventTimeFormat={EVENT_TIME_FORMAT}
      events={calendarEvents}
      firstDay={1}
      headerToolbar={false}
      height="100%"
      initialDate={selectedDate}
      initialView={activeView}
      moreLinkText={(count) => t("calendarBoard.moreEvents", { count })}
      nowIndicator
      plugins={CALENDAR_PLUGINS}
      ref={calendarRef}
      selectable
      select={onSelection}
      selectMirror
      slotMaxTime="23:00:00"
      slotMinTime="07:00:00"
      weekNumbers
      weekNumberFormat={{ week: "numeric" }}
      weekends
    />
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
        onDatesSet={props.onDatesSet}
        onEventClick={props.onEventClick}
        onEventDrop={props.onEventDrop}
        onEventResize={props.onEventResize}
        onSelection={props.onSelection}
        selectedDate={props.selectedDate}
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
