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

function toLocalDateKey(value: Date): string {
  const year = `${value.getFullYear()}`;
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildEventDayKeys(events: CalendarEvent[]): Set<string> {
  const dayKeys = new Set<string>();

  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }

    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endTime = Math.max(start.getTime(), end.getTime() - 1);
    const endDay = new Date(endTime);
    let cursor = startDay;
    const lastDay = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate());

    while (cursor.getTime() <= lastDay.getTime()) {
      dayKeys.add(toLocalDateKey(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
  }

  return dayKeys;
}

export {
  addMinutesToIso,
  buildEventDayKeys,
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEW_ORDER,
  fromDateTimeInputValue,
  getCalendarAccent,
  isEventEditable,
  toLocalDateKey,
  toDateTimeInputValue,
};
