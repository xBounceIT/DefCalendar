import type { CalendarEvent, UserSettings } from "@shared/schemas";
import React from "react";
import { formatLocalizedDate } from "../date-formatting";
import { MeetingIcon } from "./meeting-icon";
import { useTranslation } from "react-i18next";

type SortColumn = "start" | "end" | "title" | "category";
type SortDirection = "asc" | "desc";
type EventResponseState = "accepted" | "declined" | "owner" | "pending" | "tentative";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

interface DayEventsTableProps {
  events: CalendarEvent[];
  onClear: () => void;
  onEventClick: (event: CalendarEvent) => void;
  onJoinMeeting?: (event: CalendarEvent) => void;
  selectedDay: null | string;
  timeFormat: UserSettings["timeFormat"];
}

function CloseIcon() {
  return (
    <svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg
      className="day-events-table__sort-arrow"
      fill="none"
      height="12"
      viewBox="0 0 24 24"
      width="12"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={direction === "asc" ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function getStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getEndOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function formatEventTime(isoString: string, timeFormat: UserSettings["timeFormat"]): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return formatLocalizedDate(
    date,
    {
      hour: "numeric",
      minute: "2-digit",
    },
    timeFormat,
  );
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

function getEventResponseState(event: CalendarEvent): EventResponseState {
  if (event.isOrganizer) {
    return "owner";
  }

  const normalizedResponse = normalizeResponseValue(event.responseStatus?.response);
  if (
    normalizedResponse === "accepted" ||
    normalizedResponse === "declined" ||
    normalizedResponse === "tentative"
  ) {
    return normalizedResponse;
  }

  return "pending";
}

function getEventResponseLabel(
  t: ReturnType<typeof useTranslation>["t"],
  responseState: EventResponseState,
): string {
  if (responseState === "accepted") {
    return t("dayEventsTable.responseAccepted");
  }

  if (responseState === "declined") {
    return t("dayEventsTable.responseDeclined");
  }

  if (responseState === "tentative") {
    return t("dayEventsTable.responseTentative");
  }

  if (responseState === "owner") {
    return t("dayEventsTable.responseOwner");
  }

  return t("dayEventsTable.responsePending");
}

function sortEvents(
  events: CalendarEvent[],
  sort: SortState,
  timeFormat: UserSettings["timeFormat"],
): CalendarEvent[] {
  const sorted = [...events];

  const getSortValue = (event: CalendarEvent): string => {
    switch (sort.column) {
      case "title": {
        return event.subject.toLowerCase();
      }
      case "start": {
        return event.start;
      }
      case "end": {
        return event.end;
      }
      case "category": {
        return (event.categories[0] ?? "").toLowerCase();
      }
      default: {
        return "";
      }
    }
  };

  sorted.sort((a, b) => {
    const aValue = getSortValue(a);
    const bValue = getSortValue(b);

    let comparison = aValue.localeCompare(bValue);
    if (sort.direction === "desc") {
      comparison *= -1;
    }

    return comparison;
  });

  return sorted;
}

function useResizableColumns() {
  const [widths, setWidths] = React.useState<Record<string, number>>({
    title: 24,
    start: 13,
    end: 13,
    category: 12,
    action: 22,
    meeting: 16,
  });

  const minWidths: Record<string, number> = {
    title: 8,
    start: 8,
    end: 8,
    category: 8,
    action: 16,
    meeting: 12,
  };

  const [resizing, setResizing] = React.useState<{
    column: string;
    startX: number;
    startWidth: number;
    nextColumn: string | null;
    nextStartWidth: number;
  } | null>(null);

  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const suppressSortClickRef = React.useRef(false);
  const suppressSortResetTimeoutRef = React.useRef<null | number>(null);

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent, column: string, nextColumn: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      if (suppressSortResetTimeoutRef.current !== null) {
        globalThis.clearTimeout(suppressSortResetTimeoutRef.current);
        suppressSortResetTimeoutRef.current = null;
      }
      suppressSortClickRef.current = true;
      const startWidth = widths[column] ?? 15;
      const nextStartWidth = nextColumn ? (widths[nextColumn] ?? 15) : 0;
      setResizing({ column, startX: e.clientX, startWidth, nextColumn, nextStartWidth });
    },
    [widths],
  );

  React.useEffect(() => {
    if (!resizing) {
      return;
    }

    const table = tableRef.current;
    if (!table) {
      return;
    }

    const tableWidth = table.getBoundingClientRect().width;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const deltaPercent = (delta / tableWidth) * 100;

      if (resizing.nextColumn) {
        const totalWidth = resizing.startWidth + resizing.nextStartWidth;
        const minCurrent = minWidths[resizing.column] ?? 8;
        const minNext = minWidths[resizing.nextColumn] ?? 8;

        let newWidth = resizing.startWidth + deltaPercent;
        let newNextWidth = resizing.nextStartWidth - deltaPercent;

        if (newWidth < minCurrent) {
          newWidth = minCurrent;
          newNextWidth = totalWidth - minCurrent;
        }

        if (newNextWidth < minNext) {
          newNextWidth = minNext;
          newWidth = totalWidth - minNext;
        }

        setWidths((prev) => ({
          ...prev,
          [resizing.column]: newWidth,
          [resizing.nextColumn!]: newNextWidth,
        }));
      } else {
        const minCurrent = minWidths[resizing.column] ?? 8;
        const newWidth = Math.max(minCurrent, resizing.startWidth + deltaPercent);
        setWidths((prev) => ({ ...prev, [resizing.column]: newWidth }));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
      if (suppressSortResetTimeoutRef.current !== null) {
        globalThis.clearTimeout(suppressSortResetTimeoutRef.current);
      }
      suppressSortResetTimeoutRef.current = globalThis.setTimeout(() => {
        suppressSortClickRef.current = false;
        suppressSortResetTimeoutRef.current = null;
      }, 0);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing]);

  React.useEffect(
    () => () => {
      if (suppressSortResetTimeoutRef.current !== null) {
        globalThis.clearTimeout(suppressSortResetTimeoutRef.current);
      }
    },
    [],
  );

  const consumeSortSuppression = React.useCallback(() => {
    if (!suppressSortClickRef.current) {
      return false;
    }

    suppressSortClickRef.current = false;
    if (suppressSortResetTimeoutRef.current !== null) {
      globalThis.clearTimeout(suppressSortResetTimeoutRef.current);
      suppressSortResetTimeoutRef.current = null;
    }
    return true;
  }, []);

  return {
    consumeSortSuppression,
    widths,
    handleMouseDown,
    tableRef,
    isResizing: resizing !== null,
  };
}

function DayEventsTable({
  events,
  onClear,
  onEventClick,
  onJoinMeeting,
  selectedDay,
  timeFormat,
}: DayEventsTableProps) {
  const { t } = useTranslation();
  const [sort, setSort] = React.useState<SortState>({
    column: "start",
    direction: "asc",
  });
  const { widths, handleMouseDown, tableRef, isResizing, consumeSortSuppression } =
    useResizableColumns();

  const filteredEvents = React.useMemo(() => {
    if (!selectedDay) {
      return [];
    }

    const targetDate = new Date(selectedDay);
    if (Number.isNaN(targetDate.getTime())) {
      return [];
    }

    const targetDayStart = getStartOfDay(targetDate);
    const targetDayEnd = getEndOfDay(targetDate);

    return events.filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
        return false;
      }

      if (event.isAllDay) {
        const eventStartDay = getStartOfDay(eventStart);
        const eventEndDay = getStartOfDay(eventEnd);

        return eventStartDay <= targetDayStart && eventEndDay > targetDayStart;
      }

      return eventStart < targetDayEnd && eventEnd > targetDayStart;
    });
  }, [events, selectedDay]);

  const sortedEvents = React.useMemo(
    () => sortEvents(filteredEvents, sort, timeFormat),
    [filteredEvents, sort, timeFormat],
  );

  const handleSort = (column: SortColumn) => {
    if (consumeSortSuppression()) {
      return;
    }

    setSort((current) => {
      if (current.column === column) {
        return {
          column,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return { column, direction: "asc" };
    });
  };

  const handleRowClick = (event: CalendarEvent) => {
    onEventClick(event);
  };

  if (!selectedDay) {
    return null;
  }

  const formattedDate = formatLocalizedDate(
    new Date(selectedDay),
    { day: "numeric", month: "long", weekday: "long", year: "numeric" },
    timeFormat,
  );

  return (
    <div className="day-events-table">
      <div className="day-events-table__header">
        <div className="day-events-table__header-info">
          <span className="day-events-table__date">{formattedDate}</span>
          <span className="day-events-table__count">
            {t("dayEventsTable.eventsCount", { count: filteredEvents.length })}
          </span>
        </div>
        <button
          aria-label={t("common.close")}
          className="day-events-table__close"
          onClick={onClear}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>
      {sortedEvents.length === 0 ? (
        <div className="day-events-table__empty">{t("dayEventsTable.noEvents")}</div>
      ) : (
        <table
          className={`day-events-table__table${isResizing ? " day-events-table--resizing" : ""}`}
          ref={tableRef}
        >
          <thead>
            <tr>
              <th
                className="day-events-table__th"
                style={{ width: `${widths.title}%` }}
                onClick={() => handleSort("title")}
              >
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.title")}</span>
                  {sort.column === "title" && <SortArrow direction={sort.direction} />}
                </div>
                <div
                  className="day-events-table__resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, "title", "start")}
                  role="separator"
                />
              </th>
              <th
                className="day-events-table__th"
                style={{ width: `${widths.start}%` }}
                onClick={() => handleSort("start")}
              >
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.start")}</span>
                  {sort.column === "start" && <SortArrow direction={sort.direction} />}
                </div>
                <div
                  className="day-events-table__resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, "start", "end")}
                  role="separator"
                />
              </th>
              <th
                className="day-events-table__th"
                style={{ width: `${widths.end}%` }}
                onClick={() => handleSort("end")}
              >
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.end")}</span>
                  {sort.column === "end" && <SortArrow direction={sort.direction} />}
                </div>
                <div
                  className="day-events-table__resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, "end", "category")}
                  role="separator"
                />
              </th>
              <th
                className="day-events-table__th"
                style={{ width: `${widths.category}%` }}
                onClick={() => handleSort("category")}
              >
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.category")}</span>
                  {sort.column === "category" && <SortArrow direction={sort.direction} />}
                </div>
                <div
                  className="day-events-table__resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, "category", "action")}
                  role="separator"
                />
              </th>
              <th
                className="day-events-table__th day-events-table__th--action"
                style={{ width: `${widths.action}%` }}
              >
                <span>{t("dayEventsTable.action")}</span>
                <div
                  className="day-events-table__resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, "action", "meeting")}
                  role="separator"
                />
              </th>
              <th
                className="day-events-table__th day-events-table__th--meeting"
                style={{ width: `${widths.meeting}%` }}
              >
                <span>{t("dayEventsTable.meeting")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event) => {
              const responseState = getEventResponseState(event);

              return (
                <tr
                  className="day-events-table__row"
                  key={`${event.calendarId}:${event.id}`}
                  onClick={() => handleRowClick(event)}
                >
                  <td className="day-events-table__td">
                    {event.subject || t("reminder.untitledEvent")}
                  </td>
                  <td className="day-events-table__td">
                    {event.isAllDay
                      ? t("eventEditor.allDay")
                      : formatEventTime(event.start, timeFormat)}
                  </td>
                  <td className="day-events-table__td">
                    {event.isAllDay
                      ? t("eventEditor.allDay")
                      : formatEventTime(event.end, timeFormat)}
                  </td>
                  <td className="day-events-table__td">
                    {event.categories.length > 0 ? (
                      <span className="day-events-table__category">{event.categories[0]}</span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="day-events-table__td day-events-table__td--action">
                    <span
                      className={`day-events-table__response day-events-table__response--${responseState}`}
                    >
                      {getEventResponseLabel(t, responseState)}
                    </span>
                  </td>
                  <td className="day-events-table__td day-events-table__td--meeting">
                    {event.onlineMeeting?.joinUrl && (
                      <button
                        className="day-events-table__join-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onJoinMeeting?.(event);
                        }}
                        type="button"
                      >
                        <MeetingIcon url={event.onlineMeeting.joinUrl} />
                        <span>{t("eventEditor.joinMeeting")}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default DayEventsTable;
