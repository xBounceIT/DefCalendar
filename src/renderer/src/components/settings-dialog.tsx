import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarSummary, UserSettings } from "@shared/schemas";
import type { AppLocale } from "../i18n";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  calendars: CalendarSummary[];
  onSave: (settings: Partial<UserSettings>) => void;
}

type SettingsSection = "appearance" | "calendarDefaults" | "notifications" | "language" | "sync";

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.appearance.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">{t("settings.sections.appearance.description")}</p>
      </div>
    </div>
  );
}

function CalendarDefaultsSection({ calendars }: { calendars: CalendarSummary[] }) {
  const { t } = useTranslation();

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.calendarDefaults.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">
          {t("settings.sections.calendarDefaults.description")}
        </p>
        {calendars.length > 0 && (
          <div className="field">
            <span>{t("settings.sections.calendarDefaults.defaultCalendar")}</span>
            <select>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function LanguageSection() {
  const { t, i18n } = useTranslation();
  const currentLocale = i18n.language as AppLocale;

  const supportedLocales: AppLocale[] = ["en", "it"];
  const localeLabels: Record<AppLocale, string> = {
    en: "English",
    it: "Italiano",
  };

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.language.title")}</h3>
      <div className="settings-fields">
        <div className="field">
          <span>{t("settings.sections.language.selectLanguage")}</span>
          <select
            value={currentLocale}
            onChange={(e) => {
              const newLocale = e.target.value as AppLocale;
              void i18n.changeLanguage(newLocale);
            }}
          >
            {supportedLocales.map((locale) => (
              <option key={locale} value={locale}>
                {localeLabels[locale]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.notifications.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">{t("settings.sections.notifications.description")}</p>
      </div>
    </div>
  );
}

function SyncSection() {
  const { t } = useTranslation();

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.sync.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">{t("settings.sections.sync.description")}</p>
      </div>
    </div>
  );
}

function SettingsDialog({ isOpen, onClose, calendars }: SettingsDialogProps): JSX.Element | null {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  if (!isOpen) {
    return null;
  }

  const sections: { id: SettingsSection; label: string }[] = [
    { id: "appearance", label: t("settings.sections.appearance.label") },
    { id: "calendarDefaults", label: t("settings.sections.calendarDefaults.label") },
    { id: "language", label: t("settings.sections.language.label") },
    { id: "notifications", label: t("settings.sections.notifications.label") },
    { id: "sync", label: t("settings.sections.sync.label") },
  ].toSorted((a, b) => a.label.localeCompare(b.label));

  function renderSectionContent() {
    switch (activeSection) {
      case "appearance": {
        return <AppearanceSection />;
      }
      case "calendarDefaults": {
        return <CalendarDefaultsSection calendars={calendars} />;
      }
      case "language": {
        return <LanguageSection />;
      }
      case "notifications": {
        return <NotificationsSection />;
      }
      case "sync": {
        return <SyncSection />;
      }
      default: {
        return <AppearanceSection />;
      }
    }
  }

  return (
    <div className="settings-scrim">
      <button
        aria-label={t("common.close")}
        className="settings-scrim__dismiss"
        onClick={onClose}
        type="button"
      />
      <div className="settings-dialog">
        <header className="settings-dialog__header">
          <h2>{t("sidebar.settings")}</h2>
          <button className="settings-dialog__close" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </header>
        <div className="settings-dialog__content">
          <nav className="settings-nav">
            {sections.map((section) => (
              <button
                key={section.id}
                className={`settings-nav__item ${
                  activeSection === section.id ? "settings-nav__item--active" : ""
                }`}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className="settings-panel">{renderSectionContent()}</div>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
