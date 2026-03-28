import React, { useMemo } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import type { Locale } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface MiniCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function PrevMonthIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function TodayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function NextMonthIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function MiniCalendarNavButton({
  ariaLabel,
  Icon,
  onClick,
}: {
  ariaLabel: string;
  Icon: () => React.JSX.Element;
  onClick: () => void;
}) {
  return (
    <button aria-label={ariaLabel} onClick={onClick} type="button">
      <Icon />
    </button>
  );
}

function MiniCalendarNav({
  onNextMonth,
  onPrevMonth,
  onToday,
}: {
  onNextMonth: () => void;
  onPrevMonth: () => void;
  onToday: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mini-calendar-nav">
      <MiniCalendarNavButton
        Icon={PrevMonthIcon}
        ariaLabel={t("miniCalendar.previousMonth")}
        onClick={onPrevMonth}
      />
      <MiniCalendarNavButton
        Icon={TodayIcon}
        ariaLabel={t("miniCalendar.today")}
        onClick={onToday}
      />
      <MiniCalendarNavButton
        Icon={NextMonthIcon}
        ariaLabel={t("miniCalendar.nextMonth")}
        onClick={onNextMonth}
      />
    </div>
  );
}

function MiniCalendarHeader({
  currentMonth,
  locale,
  onNextMonth,
  onPrevMonth,
  onToday,
}: {
  currentMonth: Date;
  locale: Locale;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  onToday: () => void;
}) {
  return (
    <div className="mini-calendar-header">
      <h3>{format(currentMonth, "MMMM yyyy", { locale })}</h3>
      <MiniCalendarNav onNextMonth={onNextMonth} onPrevMonth={onPrevMonth} onToday={onToday} />
    </div>
  );
}

function MiniCalendar({ selectedDate, onDateSelect }: MiniCalendarProps) {
  const { t, i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = React.useState(startOfMonth(selectedDate));
  const dateLocale = i18n.language === "it" ? it : undefined;

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    onDateSelect(today);
  };

  return (
    <div className="mini-calendar">
      <MiniCalendarHeader
        currentMonth={currentMonth}
        locale={dateLocale}
        onNextMonth={handleNextMonth}
        onPrevMonth={handlePrevMonth}
        onToday={handleToday}
      />
      <div className="mini-calendar-grid">
        {WEEKDAY_KEYS.map((weekday) => (
          <div key={weekday} className="mini-calendar-day-header">
            {t(`miniCalendar.weekdays.${weekday}`)}
          </div>
        ))}
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);
          const isSelected = isSameDay(day, selectedDate);
          const dayClasses = ["mini-calendar-day"];
          if (!isCurrentMonth) {
            dayClasses.push("other-month");
          }
          if (isTodayDate) {
            dayClasses.push("today");
          }
          if (isSelected) {
            dayClasses.push("selected");
          }

          return (
            <button
              key={day.toISOString()}
              className={dayClasses.join(" ")}
              onClick={() => onDateSelect(day)}
              type="button"
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MiniCalendar;
