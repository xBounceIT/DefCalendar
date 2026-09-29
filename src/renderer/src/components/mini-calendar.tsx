import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS, it } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { toLocalDateKey } from "@shared/calendar";

interface MiniCalendarProps {
  eventDayKeys?: ReadonlySet<string>;
  onVisibleMonthChange?: (month: Date) => void;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  embedded?: boolean;
  focusOnOpen?: boolean;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function MiniCalendar({
  eventDayKeys,
  onDateSelect,
  onVisibleMonthChange,
  selectedDate,
  embedded = false,
  focusOnOpen = false,
}: MiniCalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("it") ? it : enUS;
  const [focusedDate, setFocusedDate] = useState(() => selectedDate ?? new Date());
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(focusedDate));
  const [mode, setMode] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(() =>
    Math.max(1, Math.min(9988, focusedDate.getFullYear() - 5)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(focusOnOpen);
  const year = currentMonth.getFullYear();
  const selectedDayKey = selectedDate ? toLocalDateKey(selectedDate) : null;
  const previousLabel =
    mode === "days"
      ? t("miniCalendar.previousMonth")
      : mode === "months"
        ? t("datePicker.previousYear")
        : t("datePicker.previousYears");
  const nextLabel =
    mode === "days"
      ? t("miniCalendar.nextMonth")
      : mode === "months"
        ? t("datePicker.nextYear")
        : t("datePicker.nextYears");

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    const nextMonth = startOfMonth(selectedDate);
    setCurrentMonth((previous) => (isSameMonth(previous, nextMonth) ? previous : nextMonth));
    setFocusedDate((previous) => (isSameDay(previous, selectedDate) ? previous : selectedDate));
  }, [selectedDayKey]);

  useEffect(() => {
    onVisibleMonthChange?.(currentMonth);
  }, [currentMonth, onVisibleMonthChange]);

  useEffect(() => {
    if (focusPending.current) {
      const selector =
        mode === "days"
          ? `[data-date="${toLocalDateKey(focusedDate)}"]`
          : '.mini-calendar-choices button[aria-pressed="true"]';
      const target =
        rootRef.current?.querySelector<HTMLButtonElement>(selector) ??
        rootRef.current?.querySelector<HTMLButtonElement>(".mini-calendar-choices button");
      target?.focus();
      focusPending.current = false;
    }
  }, [focusedDate, mode]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(currentMonth, { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
      }),
    [currentMonth],
  );

  function changeMonth(next: Date) {
    if (next.getFullYear() < 1 || next.getFullYear() > 9999) {
      return;
    }
    const nextMonth = startOfMonth(next);
    setCurrentMonth((previous) => (isSameMonth(previous, nextMonth) ? previous : nextMonth));
    setFocusedDate(next);
  }

  function changeMode(next: typeof mode) {
    focusPending.current = true;
    setMode(next);
  }

  function navigate(direction: number) {
    if (mode === "years") {
      setYearStart((start) => Math.max(1, Math.min(9988, start + direction * 12)));
    } else {
      changeMonth(
        mode === "months" ? addYears(currentMonth, direction) : addMonths(currentMonth, direction),
      );
    }
  }

  function selectDate(day: Date) {
    changeMonth(day);
    setMode("days");
    onDateSelect(day);
  }

  function handleDayKey(event: React.KeyboardEvent<HTMLButtonElement>, day: Date) {
    let next = day;
    switch (event.key) {
      case "ArrowLeft": {
        next = addDays(day, -1);
        break;
      }
      case "ArrowRight": {
        next = addDays(day, 1);
        break;
      }
      case "ArrowUp": {
        next = addDays(day, -7);
        break;
      }
      case "ArrowDown": {
        next = addDays(day, 7);
        break;
      }
      case "Home": {
        next = startOfWeek(day, { weekStartsOn: 1 });
        break;
      }
      case "End": {
        next = endOfWeek(day, { weekStartsOn: 1 });
        break;
      }
      case "PageUp": {
        next = event.shiftKey ? addYears(day, -1) : addMonths(day, -1);
        break;
      }
      case "PageDown": {
        next = event.shiftKey ? addYears(day, 1) : addMonths(day, 1);
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
    focusPending.current = true;
    changeMonth(next);
  }

  return (
    <div className={`mini-calendar${embedded ? " mini-calendar--embedded" : ""}`} ref={rootRef}>
      <div className="mini-calendar-header">
        <h3>
          <button
            type="button"
            aria-label={t("datePicker.chooseMonth")}
            aria-expanded={mode === "months"}
            onClick={() => changeMode(mode === "months" ? "days" : "months")}
          >
            {format(currentMonth, "MMMM", { locale })}
          </button>{" "}
          <button
            type="button"
            aria-label={t("datePicker.chooseYear")}
            aria-expanded={mode === "years"}
            onClick={() => {
              setYearStart(Math.max(1, Math.min(9988, year - 5)));
              changeMode(mode === "years" ? "days" : "years");
            }}
          >
            {year}
          </button>
        </h3>
        <div className="mini-calendar-nav">
          <button
            aria-label={previousLabel}
            disabled={
              mode === "years"
                ? yearStart === 1
                : year === 1 && (mode === "months" || currentMonth.getMonth() === 0)
            }
            onClick={() => navigate(-1)}
            type="button"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="m6 14 6-6 6 6" />
            </svg>
          </button>
          <button
            aria-label={t("miniCalendar.today")}
            onClick={() => selectDate(new Date())}
            type="button"
          >
            <CalendarIcon />
          </button>
          <button
            aria-label={nextLabel}
            disabled={
              mode === "years"
                ? yearStart === 9988
                : year === 9999 && (mode === "months" || currentMonth.getMonth() === 11)
            }
            onClick={() => navigate(1)}
            type="button"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="m6 10 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {format(currentMonth, "MMMM yyyy", { locale })}
      </span>
      {mode === "days" && (
        <div className="mini-calendar-grid">
          {WEEKDAY_KEYS.map((weekday) => (
            <div key={weekday} className="mini-calendar-day-header">
              {t(`miniCalendar.weekdays.${weekday}`)}
            </div>
          ))}
          {days.map((day) => {
            const selected = selectedDate !== null && isSameDay(day, selectedDate);
            const classes = [
              "mini-calendar-day",
              eventDayKeys?.has(toLocalDateKey(day)) && "has-events",
              !isSameMonth(day, currentMonth) && "other-month",
              isToday(day) && "today",
              selected && "selected",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={toLocalDateKey(day)}
                data-date={toLocalDateKey(day)}
                aria-label={format(day, "PPPP", { locale })}
                aria-pressed={selected}
                aria-current={isToday(day) ? "date" : undefined}
                className={classes}
                disabled={day.getFullYear() < 1 || day.getFullYear() > 9999}
                tabIndex={isSameDay(day, focusedDate) ? 0 : -1}
                onFocus={() => setFocusedDate(day)}
                onKeyDown={(event) => handleDayKey(event, day)}
                onClick={() => selectDate(day)}
                type="button"
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      )}
      {mode === "months" && (
        <div className="mini-calendar-choices">
          {Array.from({ length: 12 }, (_, month) => {
            const date = new Date(currentMonth);
            date.setMonth(month);
            return (
              <button
                key={month}
                type="button"
                aria-pressed={month === currentMonth.getMonth()}
                onClick={() => {
                  changeMonth(date);
                  changeMode("days");
                }}
              >
                {format(date, "MMM", { locale })}
              </button>
            );
          })}
        </div>
      )}
      {mode === "years" && (
        <div className="mini-calendar-choices">
          {Array.from({ length: 12 }, (_, index) => yearStart + index).map((nextYear) => (
            <button
              key={nextYear}
              type="button"
              aria-pressed={year === nextYear}
              onClick={() => {
                const next = new Date(currentMonth);
                next.setFullYear(nextYear);
                changeMonth(next);
                changeMode("months");
              }}
            >
              {nextYear}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MiniCalendar;
