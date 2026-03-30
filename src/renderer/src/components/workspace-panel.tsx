import { CALENDAR_VIEW_ORDER } from "@shared/calendar";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { CalendarView, UserSettings } from "@shared/schemas";

import CalendarBoard from "./calendar-board";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import type FullCalendar from "@fullcalendar/react";
import React from "react";
import { formatHeaderDate } from "../date-formatting";
import { useTranslation } from "react-i18next";

interface WorkspacePanelProps {
  activeView: CalendarView;
  bannerMessage: null | string;
  calendarEvents: EventInput[];
  calendarRef: React.RefObject<FullCalendar | null>;
  canCreateEvent: boolean;
  hasVisibleCalendars: boolean;
  onCreateEvent: () => void;
  onDateClick: (clickInfo: DateClickArg) => void;
  onDatesSet: (dates: DatesSetArg) => void;
  onEventClick: (clickInfo: EventClickArg) => void;
  onEventDrop: (changeInfo: EventDropArg) => void;
  onEventResize: (changeInfo: EventResizeDoneArg) => void;
  onNext: () => void;
  onPrev: () => void;
  onSelection: (selection: DateSelectArg) => void;
  onToday: () => void;
  onViewSelect: (view: CalendarView) => void;
  selectedDate: string;
  timeFormat: UserSettings["timeFormat"];
}

function ChevronLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NavigationGroup({
  onNext,
  onPrev,
  onToday,
}: Pick<WorkspacePanelProps, "onNext" | "onPrev" | "onToday">) {
  const { t } = useTranslation();

  return (
    <div className="date-nav-group">
      <button
        className="icon-button"
        onClick={onPrev}
        type="button"
        aria-label={t("workspace.previous")}
      >
        <ChevronLeftIcon />
      </button>
      <button className="today-button" onClick={onToday} type="button">
        {t("workspace.today")}
      </button>
      <button
        className="icon-button"
        onClick={onNext}
        type="button"
        aria-label={t("workspace.next")}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

function DateDisplay({ selectedDate }: { selectedDate: string }) {
  const formattedDate = formatHeaderDate(selectedDate);

  return <h2 className="date-display">{formattedDate}</h2>;
}

function ViewButton({
  activeView,
  onViewSelect,
  view,
}: {
  activeView: CalendarView;
  onViewSelect: (view: CalendarView) => void;
  view: CalendarView;
}) {
  const { t } = useTranslation();
  const isActive = view === activeView;
  const labelMap: Record<CalendarView, string> = {
    dayGridMonth: t("calendarViews.month"),
    timeGridWeek: t("calendarViews.week"),
    timeGridDay: t("calendarViews.day"),
  };
  let buttonClassName = "view-button";
  if (isActive) {
    buttonClassName = "view-button view-button--active";
  }

  return (
    <button className={buttonClassName} onClick={() => onViewSelect(view)} type="button">
      {labelMap[view]}
    </button>
  );
}

function ViewSelector({
  activeView,
  onViewSelect,
}: Pick<WorkspacePanelProps, "activeView" | "onViewSelect">) {
  return (
    <div className="view-selector">
      {CALENDAR_VIEW_ORDER.map((view) => (
        <ViewButton activeView={activeView} key={view} onViewSelect={onViewSelect} view={view} />
      ))}
    </div>
  );
}

function NewEventButton({
  canCreateEvent,
  onCreateEvent,
}: {
  canCreateEvent: boolean;
  onCreateEvent: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      className="new-event-btn"
      disabled={!canCreateEvent}
      onClick={onCreateEvent}
      type="button"
    >
      <PlusIcon />
      {t("workspace.new")}
    </button>
  );
}

function WorkspaceHeader(
  props: Pick<
    WorkspacePanelProps,
    | "activeView"
    | "canCreateEvent"
    | "onCreateEvent"
    | "onNext"
    | "onPrev"
    | "onToday"
    | "onViewSelect"
    | "selectedDate"
  >,
) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <NavigationGroup onNext={props.onNext} onPrev={props.onPrev} onToday={props.onToday} />
        <DateDisplay selectedDate={props.selectedDate} />
      </div>
      <div className="workspace-header-right">
        <ViewSelector activeView={props.activeView} onViewSelect={props.onViewSelect} />
        <NewEventButton canCreateEvent={props.canCreateEvent} onCreateEvent={props.onCreateEvent} />
      </div>
    </header>
  );
}

function Banner({ message }: { message: null | string }) {
  if (!message) {
    return null;
  }

  return <div className="banner banner--error">{message}</div>;
}

function WorkspacePanel(props: WorkspacePanelProps) {
  return (
    <main className="workspace">
      <WorkspaceHeader
        activeView={props.activeView}
        canCreateEvent={props.canCreateEvent}
        onCreateEvent={props.onCreateEvent}
        onNext={props.onNext}
        onPrev={props.onPrev}
        onToday={props.onToday}
        onViewSelect={props.onViewSelect}
        selectedDate={props.selectedDate}
      />
      <Banner message={props.bannerMessage} />
      <CalendarBoard
        activeView={props.activeView}
        calendarEvents={props.calendarEvents}
        calendarRef={props.calendarRef}
        hasVisibleCalendars={props.hasVisibleCalendars}
        onDateClick={props.onDateClick}
        onDatesSet={props.onDatesSet}
        onEventClick={props.onEventClick}
        onEventDrop={props.onEventDrop}
        onEventResize={props.onEventResize}
        onSelection={props.onSelection}
        selectedDate={props.selectedDate}
        timeFormat={props.timeFormat}
      />
    </main>
  );
}

export default WorkspacePanel;
