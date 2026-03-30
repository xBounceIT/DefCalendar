import type { CalendarEvent, UserSettings } from "@shared/schemas";
import React from "react";
import { formatLocalizedDate } from "../date-formatting";
import { useTranslation } from "react-i18next";

type SortColumn = "start" | "end" | "title" | "category";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

interface DayEventsTableProps {
  events: CalendarEvent[];
  onClear: () => void;
  onEventClick: (event: CalendarEvent) => void;
  selectedDay: null | string;
  timeFormat: UserSettings["timeFormat"];
}

function CloseIcon() {
  return (
    <svg
      fill="none"
      height="16"
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
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

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
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

function DayEventsTable({
  events,
  onClear,
  onEventClick,
  selectedDay,
  timeFormat,
}: DayEventsTableProps) {
  const { t } = useTranslation();
  const [sort, setSort] = React.useState<SortState>({
    column: "start",
    direction: "asc",
  });

  const filteredEvents = React.useMemo(() => {
    if (!selectedDay) {
      return [];
    }

    const targetDate = new Date(selectedDay);
    if (Number.isNaN(targetDate.getTime())) {
      return [];
    }

    return events.filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      if (event.isAllDay) {
        const eventStartDay = new Date(
          eventStart.getFullYear(),
          eventStart.getMonth(),
          eventStart.getDate(),
        );
        const eventEndDay = new Date(
          eventEnd.getFullYear(),
          eventEnd.getMonth(),
          eventEnd.getDate(),
        );

        const targetDayStart = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
        );

        return eventStartDay <= targetDayStart && eventEndDay > targetDayStart;
      }

      return isSameDay(eventStart, targetDate) || isSameDay(eventEnd, targetDate);
    });
  }, [events, selectedDay]);

  const sortedEvents = React.useMemo(
    () => sortEvents(filteredEvents, sort, timeFormat),
    [filteredEvents, sort, timeFormat],
  );

  const handleSort = (column: SortColumn) => {
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
    onClear();
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
        <table className="day-events-table__table">
          <thead>
            <tr>
              <th className="day-events-table__th" onClick={() => handleSort("title")}>
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.title")}</span>
                  {sort.column === "title" && <SortArrow direction={sort.direction} />}
                </div>
              </th>
              <th className="day-events-table__th" onClick={() => handleSort("start")}>
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.start")}</span>
                  {sort.column === "start" && <SortArrow direction={sort.direction} />}
                </div>
              </th>
              <th className="day-events-table__th" onClick={() => handleSort("end")}>
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.end")}</span>
                  {sort.column === "end" && <SortArrow direction={sort.direction} />}
                </div>
              </th>
              <th className="day-events-table__th" onClick={() => handleSort("category")}>
                <div className="day-events-table__th-content">
                  <span>{t("dayEventsTable.category")}</span>
                  {sort.column === "category" && <SortArrow direction={sort.direction} />}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event) => (
              <tr
                className="day-events-table__row"
                key={`${event.calendarId}:${event.id}`}
                onClick={() => handleRowClick(event)}
              >
                <td className="day-events-table__td">{event.subject || "(Untitled)"}</td>
                <td className="day-events-table__td">
                  {event.isAllDay ? t("eventEditor.allDay") : formatEventTime(event.start, timeFormat)}
                </td>
                <td className="day-events-table__td">
                  {event.isAllDay ? t("eventEditor.allDay") : formatEventTime(event.end, timeFormat)}
                </td>
                <td className="day-events-table__td">
                  {event.categories.length > 0 ? (
                    <span className="day-events-table__category">{event.categories[0]}</span>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default DayEventsTable;