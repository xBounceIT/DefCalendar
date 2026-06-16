import type { CalendarEvent, UserSettings } from "@shared/schemas";
import React from "react";
import { useTranslation } from "react-i18next";

import { formatEventTimeRange } from "../date-formatting";

interface OverlapWarningProps {
  busy: boolean;
  conflicts: CalendarEvent[];
  onCancel: () => void;
  onConfirm: () => void;
  timeFormat: UserSettings["timeFormat"];
}

function OverlapWarning({
  busy,
  conflicts,
  onCancel,
  onConfirm,
  timeFormat,
}: OverlapWarningProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div aria-label={t("overlapWarning.title")} className="overlap-warning" role="alertdialog">
      <h4 className="overlap-warning__title">{t("overlapWarning.title")}</h4>
      <p className="overlap-warning__description">{t("overlapWarning.description")}</p>
      <ul className="overlap-warning__list">
        {conflicts.map((conflict) => {
          const timeRange = formatEventTimeRange(conflict, timeFormat);

          return (
            <li className="overlap-warning__item" key={`${conflict.calendarId}:${conflict.id}`}>
              <span className="overlap-warning__subject">
                <span className="visually-hidden">{t("overlapWarning.subjectLabel")} </span>
                {conflict.subject}
              </span>
              <span className="overlap-warning__time">
                <span className="visually-hidden">{t("overlapWarning.timeLabel")} </span>
                {timeRange}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="overlap-warning__actions">
        <button
          className="overlap-warning__button"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {t("overlapWarning.cancel")}
        </button>
        <button
          className="overlap-warning__button overlap-warning__button--primary"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {t("overlapWarning.acceptAnyway")}
        </button>
      </div>
    </div>
  );
}

export default OverlapWarning;
