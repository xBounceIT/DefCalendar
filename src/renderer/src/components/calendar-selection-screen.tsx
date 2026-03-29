import type { CalendarSummary } from "@shared/schemas";
import { getCalendarAccent } from "@shared/calendar";
import React from "react";
import { useTranslation } from "react-i18next";

interface CalendarSelectionScreenProps {
  accountEmail: null | string;
  calendars: CalendarSummary[];
  errorMessage: null | string;
  isPending: boolean;
  onContinue: (selectedCalendarIds: string[]) => void;
}

function CalendarSelectionRow({
  calendar,
  checked,
  onToggle,
}: {
  calendar: CalendarSummary;
  checked: boolean;
  onToggle: (calendarId: string) => void;
}) {
  return (
    <label
      aria-label={calendar.name}
      className="calendar-selection-row"
      htmlFor={`calendar-selection-${calendar.id}`}
    >
      <input
        checked={checked}
        id={`calendar-selection-${calendar.id}`}
        onChange={() => onToggle(calendar.id)}
        type="checkbox"
      />
      <span className="calendar-selection-row-copy">
        <span className="calendar-selection-row-title">
          <span
            className="calendar-selection-chip"
            style={{ backgroundColor: getCalendarAccent(calendar.color) }}
          />
          <span>{calendar.name}</span>
        </span>
        <small>{calendar.ownerAddress ?? calendar.ownerName ?? "-"}</small>
      </span>
    </label>
  );
}

function CalendarSelectionScreen(props: CalendarSelectionScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const [selectedCalendarIds, setSelectedCalendarIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSelectedCalendarIds(
      props.calendars.filter((calendar) => calendar.isVisible).map((calendar) => calendar.id),
    );
  }, [props.calendars]);

  const selectedIds = React.useMemo(() => new Set(selectedCalendarIds), [selectedCalendarIds]);
  const canContinue =
    !props.isPending && (props.calendars.length === 0 || selectedCalendarIds.length > 0);

  function handleToggle(calendarId: string): void {
    setSelectedCalendarIds((previous) => {
      if (previous.includes(calendarId)) {
        return previous.filter((id) => id !== calendarId);
      }

      return [...previous, calendarId];
    });
  }

  let warningBanner: React.JSX.Element | null = null;
  if (props.calendars.length === 0) {
    warningBanner = <p className="banner banner--warning">{t("calendarSelection.empty")}</p>;
  } else if (selectedCalendarIds.length === 0) {
    warningBanner = (
      <p className="banner banner--warning">{t("calendarSelection.selectAtLeastOne")}</p>
    );
  }

  let errorBanner: React.JSX.Element | null = null;
  if (props.errorMessage) {
    errorBanner = <p className="banner banner--error">{props.errorMessage}</p>;
  }

  return (
    <div className="calendar-selection-shell">
      <div className="calendar-selection-card">
        <header className="calendar-selection-header">
          <h1 className="calendar-selection-title">{t("calendarSelection.title")}</h1>
          <p className="calendar-selection-subtitle">{t("calendarSelection.subtitle")}</p>
          {props.accountEmail && (
            <p className="calendar-selection-account">
              {t("calendarSelection.account", { email: props.accountEmail })}
            </p>
          )}
        </header>
        <div className="calendar-selection-content">
          <div className="calendar-selection-list">
            {props.calendars.map((calendar) => (
              <CalendarSelectionRow
                calendar={calendar}
                checked={selectedIds.has(calendar.id)}
                key={calendar.id}
                onToggle={handleToggle}
              />
            ))}
          </div>
          <p className="calendar-selection-count">
            {t("calendarSelection.selectedCount", {
              count: selectedCalendarIds.length,
              total: props.calendars.length,
            })}
          </p>
          {warningBanner}
          {errorBanner}
          <button
            className="calendar-selection-continue"
            disabled={!canContinue}
            onClick={() => {
              if (canContinue) {
                props.onContinue(selectedCalendarIds);
              }
            }}
            type="button"
          >
            {props.isPending
              ? t("calendarSelection.continuePending")
              : t("calendarSelection.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CalendarSelectionScreen;
