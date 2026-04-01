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

function roundUpToNext15Minutes(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const remainder = minutes % 15;
  const minutesToAdd = remainder === 0 ? 0 : 15 - remainder;
  result.setMinutes(minutes + minutesToAdd, 0, 0);
  return result;
}

const CALENDAR_COLORS: readonly { name: string; hex: string }[] = [
  { name: "blue", hex: "#3b82f6" },
  { name: "green", hex: "#22c55e" },
  { name: "orange", hex: "#f59e0b" },
  { name: "purple", hex: "#a855f7" },
  { name: "red", hex: "#ef4444" },
  { name: "teal", hex: "#14b8a6" },
  { name: "yellow", hex: "#eab308" },
];

const OUTLOOK_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  none: "",
  preset0: "#c73d3d",
  preset1: "#d97706",
  preset2: "#8b5a3c",
  preset3: "#ca8a04",
  preset4: "#2f9e44",
  preset5: "#0f766e",
  preset6: "#5f7c24",
  preset7: "#2563eb",
  preset8: "#7e22ce",
  preset9: "#be185d",
  preset10: "#3b82f6",
  preset11: "#1d4ed8",
  preset12: "#6b7280",
  preset13: "#374151",
  preset14: "#111827",
  preset15: "#991b1b",
  preset16: "#c2410c",
  preset17: "#78350f",
  preset18: "#854d0e",
  preset19: "#166534",
  preset20: "#0f766e",
  preset21: "#3f6212",
  preset22: "#1e3a8a",
  preset23: "#581c87",
  preset24: "#701a75",
};

function getCalendarAccent(
  color: string | null | undefined,
  userColor: string | null | undefined,
): string {
  if (userColor && userColor.trim().length > 0) {
    const match = CALENDAR_COLORS.find((c) => c.name === userColor);
    return match?.hex ?? userColor;
  }
  if (color && color.trim().length > 0) {
    return color;
  }
  return "#2368ff";
}

function getCalendarColorName(color: string | null | undefined): string | null {
  if (!color) {
    return null;
  }
  const match = CALENDAR_COLORS.find((c) => c.name === color || c.hex === color);
  return match?.name ?? null;
}

function getOutlookCategoryColor(color: string | null | undefined): null | string {
  const normalized = color?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  return OUTLOOK_CATEGORY_COLORS[normalized] || null;
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
  CALENDAR_COLORS,
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEW_ORDER,
  fromDateTimeInputValue,
  getCalendarAccent,
  getCalendarColorName,
  getOutlookCategoryColor,
  isEventEditable,
  roundUpToNext15Minutes,
  toLocalDateKey,
  toDateTimeInputValue,
};
