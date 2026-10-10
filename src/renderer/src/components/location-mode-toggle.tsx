import React from "react";
import { useTranslation } from "react-i18next";

interface LocationModeToggleProps {
  physical: boolean;
  disabled: boolean;
  onChange: (physical: boolean) => void;
}

function LocationModeToggle({ physical, disabled, onChange }: LocationModeToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="location-mode-toggle" role="group" aria-label={t("eventEditor.locationMode")}>
      <button
        type="button"
        aria-label={t("eventEditor.location")}
        title={t("eventEditor.location")}
        aria-pressed={!physical}
        disabled={disabled}
        onClick={() => physical && onChange(false)}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={t("eventEditor.map")}
        title={t("eventEditor.map")}
        aria-pressed={physical}
        disabled={disabled}
        onClick={() => !physical && onChange(true)}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
          <path d="M9 3v15M15 6v15" />
        </svg>
      </button>
    </div>
  );
}

export default LocationModeToggle;
