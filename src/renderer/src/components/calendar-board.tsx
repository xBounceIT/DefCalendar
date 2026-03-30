import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import itLocale from "@fullcalendar/core/locales/it";
import type { CalendarView, UserSettings } from "@shared/schemas";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import React from "react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { buildEventTimeFormat } from "../date-formatting";
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
  timeFormat: UserSettings["timeFormat"];
}

const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];

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
  onDatesSet,
  onEventClick,
  onEventDrop,
  onEventResize,
  onSelection,
  selectedDate,
  timeFormat,
}: Omit<CalendarBoardProps, "hasVisibleCalendars">) {
  const { t, i18n } = useTranslation();
  const locale = React.useMemo(() => (i18n.language === "it" ? "it" : "en"), [i18n.language]);
  const eventTimeFormat = React.useMemo(() => buildEventTimeFormat(timeFormat), [timeFormat]);

  return (
    <FullCalendar
      allDayMaintainDuration
      allDayText={t("eventEditor.allDay")}
      datesSet={onDatesSet}
      dayMaxEvents={3}
      dayMaxEventRows={3}
      eventMaxStack={3}
      slotEventOverlap={false}
      editable
      eventClick={onEventClick}
      eventDidMount={handleEventDidMount}
      eventDisplay="block"
      eventDrop={onEventDrop}
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
      selectable
      select={onSelection}
      selectMirror
      slotMaxTime="24:00:00"
      slotLabelFormat={eventTimeFormat}
      slotMinTime="00:00:00"
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
