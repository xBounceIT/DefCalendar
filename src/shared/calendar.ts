import type { CalendarEvent, CalendarView } from "./schemas";

const CALENDAR_VIEW_ORDER: CalendarView[] = ["dayGridMonth", "timeGridWeek", "timeGridDay"];

const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  dayGridMonth: "Month",
  timeGridWeek: "Week",
  timeGridDay: "Day",
};

function isEventEditable(event: Pick<CalendarEvent, "unsupportedReason">): boolean {
  return !event.unsupportedReason;
}

function toDateTimeInputValue(value: string, allDay: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  if (allDay) {
    return `${year}-${month}-${day}`;
  }

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeInputValue(value: string, allDay: boolean): string {
  if (allDay) {
    return new Date(`${value}T00:00:00`).toISOString();
  }

  return new Date(value).toISOString();
}

function addMinutesToIso(value: string, minutes: number): string {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function getCalendarAccent(color: string | null | undefined): string {
  if (color && color.trim().length > 0) {
    return color;
  }

  return "#2368ff";
}

export {
  addMinutesToIso,
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEW_ORDER,
  fromDateTimeInputValue,
  getCalendarAccent,
  isEventEditable,
  toDateTimeInputValue,
};
