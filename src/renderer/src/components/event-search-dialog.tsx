import type {
  CalendarEvent,
  CalendarSummary,
  EventSearchSort,
  UserSettings,
} from "@shared/schemas";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DEFAULT_EVENT_SEARCH_SORT, eventSearchSortSchema } from "@shared/schema-values";

import { formatLocalizedDate } from "../date-formatting";
import SearchIcon from "./search-icon";

interface EventSearchDialogProps {
  calendarMap: Map<string, CalendarSummary>;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (event: CalendarEvent) => void;
  timeFormat: UserSettings["timeFormat"];
  visibleCalendarIds: string[];
}

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 30;
const RESULTS_LISTBOX_ID = "event-search-dialog-results";
const SORT_CYCLE = eventSearchSortSchema.options;

function getResultId(index: number): string {
  return `event-search-result-${index}`;
}

function SortIcon() {
  return (
    <svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 4v13m0 0l-3-3m3 3l3-3M17 20V7m0 0l-3 3m3-3l3 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
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

function formatEventStart(
  event: CalendarEvent,
  timeFormat: UserSettings["timeFormat"],
  allDayLabel: string,
): string {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const dateLabel = formatLocalizedDate(
    start,
    { day: "numeric", month: "short", weekday: "short", year: "numeric" },
    timeFormat,
  );

  if (event.isAllDay) {
    return `${dateLabel} · ${allDayLabel}`;
  }

  const timeLabel = formatLocalizedDate(start, { hour: "numeric", minute: "2-digit" }, timeFormat);

  return `${dateLabel} · ${timeLabel}`;
}

function getCalendarColor(calendar: CalendarSummary | undefined): null | string {
  if (!calendar) {
    return null;
  }

  return calendar.userColor ?? calendar.color ?? null;
}

function EventSearchDialog({
  calendarMap,
  isOpen,
  onClose,
  onSelect,
  timeFormat,
  visibleCalendarIds,
}: EventSearchDialogProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sort, setSort] = useState<EventSearchSort>(DEFAULT_EVENT_SEARCH_SORT);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const sortedCalendarIds = useMemo(
    () => [...visibleCalendarIds].toSorted((a, b) => a.localeCompare(b)),
    [visibleCalendarIds],
  );

  const trimmedQuery = inputValue.trim();
  const isQueryEligible = trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!isOpen) {
      setInputValue("");
      setDebouncedQuery("");
      setActiveIndex(0);
      setSort(DEFAULT_EVENT_SEARCH_SORT);
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (previouslyFocused && globalThis.document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      return;
    }

    const activeElement = globalThis.document.activeElement;
    if (activeElement instanceof HTMLElement) {
      previouslyFocusedRef.current = activeElement;
    }

    const focusTimeout = globalThis.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => {
      globalThis.clearTimeout(focusTimeout);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isQueryEligible) {
      setDebouncedQuery("");
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, DEBOUNCE_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [isQueryEligible, trimmedQuery]);

  const searchQuery = useQuery({
    enabled: isOpen && debouncedQuery.length >= MIN_QUERY_LENGTH,
    queryFn: () =>
      globalThis.calendarApi.events.search({
        calendarIds: sortedCalendarIds,
        limit: RESULT_LIMIT,
        query: debouncedQuery,
        sort,
      }),
    queryKey: ["events", "search", debouncedQuery, sortedCalendarIds, sort],
    staleTime: 30_000,
  });

  const results = searchQuery.data ?? [];
  const hasVisibleCalendars = visibleCalendarIds.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [searchQuery.data]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const activeEl = globalThis.document.getElementById(getResultId(activeIndex));
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  if (!isOpen) {
    return null;
  }

  function handleKeyDown(keyEvent: React.KeyboardEvent<HTMLInputElement>): void {
    if (keyEvent.key === "Escape") {
      keyEvent.preventDefault();
      onClose();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (keyEvent.key === "ArrowDown") {
      keyEvent.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }

    if (keyEvent.key === "ArrowUp") {
      keyEvent.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }

    if (keyEvent.key === "Enter") {
      keyEvent.preventDefault();
      const selected = results[activeIndex];
      if (selected) {
        onSelect(selected);
      }
    }
  }

  let body: React.ReactNode = null;
  if (!hasVisibleCalendars) {
    body = <div className="event-search-dialog__empty">{t("eventSearch.noVisibleCalendars")}</div>;
  } else if (!isQueryEligible) {
    body = <div className="event-search-dialog__empty">{t("eventSearch.hint")}</div>;
  } else if (searchQuery.isLoading || (searchQuery.isFetching && results.length === 0)) {
    body = <div className="event-search-dialog__empty">{t("eventSearch.loading")}</div>;
  } else if (results.length === 0) {
    body = <div className="event-search-dialog__empty">{t("eventSearch.noResults")}</div>;
  } else {
    body = (
      <ul className="event-search-dialog__results" id={RESULTS_LISTBOX_ID} role="listbox">
        {results.map((event, index) => {
          const calendar = calendarMap.get(event.calendarId);
          const color = getCalendarColor(calendar);
          const subject = event.subject || t("reminder.untitledEvent");
          const dateLabel = formatEventStart(event, timeFormat, t("eventEditor.allDay"));
          const calendarName = calendar?.name ?? t("dateFormatting.fallbackCalendar");
          const isPrivate = event.sensitivity === "private";
          const trimmedLocation = event.location?.trim() ?? "";
          const showLocation = !isPrivate && trimmedLocation.length > 0;
          const isActive = index === activeIndex;

          let className = "event-search-result";
          if (isActive) {
            className += " event-search-result--active";
          }

          return (
            <li
              aria-selected={isActive}
              className={className}
              id={getResultId(index)}
              key={`${event.calendarId}:${event.id}`}
              onClick={() => onSelect(event)}
              /*
               * Keyboard activation normally flows through the combobox input via
               * aria-activedescendant; this handler is a defensive fallback that
               * also satisfies jsx-a11y/click-events-have-key-events.
               */
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                  keyEvent.preventDefault();
                  onSelect(event);
                }
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              tabIndex={-1}
            >
              <span
                aria-hidden="true"
                className="event-search-result__color"
                style={color ? { backgroundColor: color } : undefined}
              />
              <span className="event-search-result__body">
                <span className="event-search-result__title">{subject}</span>
                <span className="event-search-result__meta">
                  <span>{dateLabel}</span>
                  <span className="event-search-result__separator" aria-hidden="true">
                    ·
                  </span>
                  <span>{calendarName}</span>
                  {showLocation ? (
                    <>
                      <span className="event-search-result__separator" aria-hidden="true">
                        ·
                      </span>
                      <span className="event-search-result__location">{trimmedLocation}</span>
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  const activeResultId = results[activeIndex] ? getResultId(activeIndex) : undefined;
  const isPopupOpen = hasVisibleCalendars && isQueryEligible;

  return (
    <div className="dialog-scrim" role="presentation">
      <button
        aria-label={t("common.close")}
        className="dialog-scrim__dismiss"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className="dialog-card event-search-dialog"
        role="dialog"
        aria-labelledby="event-search-dialog-title"
      >
        <header className="event-search-dialog__header">
          <h3 id="event-search-dialog-title">{t("eventSearch.title")}</h3>
          <button
            aria-label={t("common.close")}
            className="event-search-dialog__close"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="event-search-dialog__input-row">
          <span aria-hidden="true" className="event-search-dialog__input-icon">
            <SearchIcon />
          </span>
          <input
            aria-activedescendant={activeResultId}
            aria-autocomplete="list"
            aria-controls={isPopupOpen ? RESULTS_LISTBOX_ID : undefined}
            aria-expanded={isPopupOpen}
            aria-label={t("eventSearch.title")}
            className="event-search-dialog__input"
            disabled={!hasVisibleCalendars}
            onChange={(changeEvent) => setInputValue(changeEvent.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("eventSearch.placeholder")}
            ref={inputRef}
            role="combobox"
            type="search"
            value={inputValue}
          />
          <button
            aria-label={t("eventSearch.sortButton")}
            className="event-search-dialog__sort"
            disabled={!hasVisibleCalendars}
            onClick={() => {
              setSort(
                (current) => SORT_CYCLE[(SORT_CYCLE.indexOf(current) + 1) % SORT_CYCLE.length],
              );
              inputRef.current?.focus();
            }}
            title={t("eventSearch.sortButton")}
            type="button"
          >
            <SortIcon />
            <span>{t(`eventSearch.sort.${sort}`)}</span>
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

export default EventSearchDialog;
