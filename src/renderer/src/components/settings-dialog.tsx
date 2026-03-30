import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faCircleInfo,
  faGlobe,
  faPalette,
} from "@fortawesome/free-solid-svg-icons";
import { faBell, faCalendar } from "@fortawesome/free-regular-svg-icons";
import type { CalendarSummary, UpdateChannel, UserSettings } from "@shared/schemas";
import { useUpdater } from "../hooks/use-updater";
import { useVersion } from "../hooks/use-version";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  calendars: CalendarSummary[];
  onSave: (settings: Partial<UserSettings>) => void;
}

type SettingsSection =
  | "appearance"
  | "calendarDefaults"
  | "language"
  | "notifications"
  | "sync"
  | "about";

type LanguageSetting = UserSettings["language"];
type LocalReminderRuleSetting = UserSettings["localReminderRules"][number];
type LocalReminderWhenSetting = LocalReminderRuleSetting["when"];
type SyncIntervalSetting = UserSettings["syncIntervalMinutes"];
type TimeFormatSetting = UserSettings["timeFormat"];

const MAX_LOCAL_REMINDER_MINUTES = 20_160;
const MAX_LOCAL_REMINDER_RULES = 10;
const DEFAULT_LOCAL_REMINDER_RULE: LocalReminderRuleSetting = {
  minutes: 15,
  when: "before",
};

function clampLocalReminderMinutes(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_LOCAL_REMINDER_RULE.minutes;
  }

  return Math.max(0, Math.min(MAX_LOCAL_REMINDER_MINUTES, value));
}

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

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function AppearanceSection({ onSave, settings }: Pick<SettingsDialogProps, "onSave" | "settings">) {
  const { t } = useTranslation();

  const timeFormatOptions: TimeFormatSetting[] = ["system", "12h", "24h"];
  const timeFormatLabels: Record<TimeFormatSetting, string> = {
    system: t("settings.sections.appearance.timeFormatOptions.system"),
    "12h": t("settings.sections.appearance.timeFormatOptions.12h"),
    "24h": t("settings.sections.appearance.timeFormatOptions.24h"),
  };

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.appearance.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">{t("settings.sections.appearance.description")}</p>
        <div className="field">
          <span>{t("settings.sections.appearance.timeFormat")}</span>
          <select
            value={settings.timeFormat}
            onChange={(e) => {
              onSave({ timeFormat: e.target.value as TimeFormatSetting });
            }}
          >
            {timeFormatOptions.map((timeFormat) => (
              <option key={timeFormat} value={timeFormat}>
                {timeFormatLabels[timeFormat]}
              </option>
            ))}
          </select>
        </div>
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

function LanguageSection({ onSave, settings }: Pick<SettingsDialogProps, "onSave" | "settings">) {
  const { t } = useTranslation();

  const languageOptions: LanguageSetting[] = ["system", "en", "it"];
  const languageLabels: Record<LanguageSetting, string> = {
    system: t("settings.sections.language.options.system"),
    en: t("settings.sections.language.options.en"),
    it: t("settings.sections.language.options.it"),
  };

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.language.title")}</h3>
      <div className="settings-fields">
        <div className="field">
          <span>{t("settings.sections.language.selectLanguage")}</span>
          <select
            value={settings.language}
            onChange={(e) => {
              onSave({ language: e.target.value as LanguageSetting });
            }}
          >
            {languageOptions.map((language) => (
              <option key={language} value={language}>
                {languageLabels[language]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const TIME_OPTIONS = [
  { minutes: 5, label: "reminder.snooze5min" },
  { minutes: 10, label: "reminder.snooze10min" },
  { minutes: 15, label: "reminder.snooze15min" },
  { minutes: 30, label: "reminder.snooze30min" },
  { minutes: 60, label: "reminder.snooze1hour" },
  { minutes: 120, label: "reminder.snooze2hours" },
  { minutes: 360, label: "settings.sections.notifications.time6hours" },
  { minutes: 720, label: "settings.sections.notifications.time12hours" },
  { minutes: 1440, label: "settings.sections.notifications.time1day" },
];

function NotificationsSection({
  onSave,
  settings,
}: Pick<SettingsDialogProps, "onSave" | "settings">) {
  const { t } = useTranslation();
  const whenOptions: LocalReminderWhenSetting[] = ["before", "after"];
  const whenLabels: Record<LocalReminderWhenSetting, string> = {
    before: t("settings.sections.notifications.whenOptions.before"),
    after: t("settings.sections.notifications.whenOptions.after"),
  };
  const localReminderOverrideEnabled = settings.localReminderOverrideEnabled ?? false;
  const localReminderRules =
    settings.localReminderRules?.length > 0
      ? settings.localReminderRules
      : [{ ...DEFAULT_LOCAL_REMINDER_RULE }];

  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState<string>("");
  const dropdownRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (openDropdown === null) {
        return;
      }

      const dropdown = dropdownRefs.current.get(openDropdown);
      if (dropdown && !dropdown.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    },
    [openDropdown],
  );

  useEffect(() => {
    if (openDropdown !== null) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside, openDropdown]);

  const updateRule = (index: number, patch: Partial<LocalReminderRuleSetting>) => {
    const nextRules = localReminderRules.map((rule, ruleIndex) => {
      if (ruleIndex !== index) {
        return rule;
      }

      return {
        ...rule,
        ...patch,
      };
    });

    onSave({ localReminderRules: nextRules });
  };

  const getTimeLabel = (minutes: number): string => {
    if (minutes < 60) {
      return t("reminder.minutes", { count: minutes });
    }

    if (minutes < 1440) {
      return t("reminder.hours", { count: Math.floor(minutes / 60) });
    }

    return t("settings.sections.notifications.time1day");
  };

  const canAddRule = localReminderRules.length < MAX_LOCAL_REMINDER_RULES;

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.notifications.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">{t("settings.sections.notifications.description")}</p>
        <label className="toggle-field settings-notifications__toggle">
          <input
            checked={localReminderOverrideEnabled}
            onChange={(e) => {
              onSave({ localReminderOverrideEnabled: e.target.checked });
            }}
            type="checkbox"
          />
          <span className="toggle-slider" />
          <span>{t("settings.sections.notifications.overrideSynced")}</span>
        </label>
        {localReminderOverrideEnabled && (
          <div className="settings-notifications__rules">
            <div className="settings-notifications__header">
              <span>{t("settings.sections.notifications.ruleTime")}</span>
              <span>{t("settings.sections.notifications.ruleWhen")}</span>
            </div>
            {localReminderRules.map((rule, index) => (
              <div className="settings-notifications__rule" key={`local-reminder-rule-${index}`}>
                <div
                  className="settings-notifications__time-dropdown-container"
                  ref={(el) => {
                    if (el) {
                      dropdownRefs.current.set(index, el);
                    } else {
                      dropdownRefs.current.delete(index);
                    }
                  }}
                >
                  <button
                    className={`settings-notifications__time-trigger ${openDropdown === index ? "settings-notifications__time-trigger--open" : ""}`}
                    onClick={() => {
                      setOpenDropdown(openDropdown === index ? null : index);
                    }}
                    type="button"
                  >
                    <span>{getTimeLabel(rule.minutes)}</span>
                    <ChevronDownIcon
                      className={`settings-notifications__time-chevron ${openDropdown === index ? "expanded" : ""}`}
                    />
                  </button>
                  {openDropdown === index && (
                    <div className="settings-notifications__time-dropdown">
                      {TIME_OPTIONS.map((option) => (
                        <button
                          className={`settings-notifications__time-dropdown-item ${rule.minutes === option.minutes ? "settings-notifications__time-dropdown-item--selected" : ""}`}
                          key={option.minutes}
                          onClick={() => {
                            updateRule(index, { minutes: option.minutes });
                            setOpenDropdown(null);
                          }}
                          type="button"
                        >
                          {t(option.label)}
                        </button>
                      ))}
                      <div className="settings-notifications__time-dropdown-divider" />
                      <div className="settings-notifications__time-custom">
                        <input
                          className="settings-notifications__time-custom-input"
                          max={MAX_LOCAL_REMINDER_MINUTES}
                          min={1}
                          onChange={(e) => {
                            setCustomInput(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const minutes = Number.parseInt(customInput, 10);
                              if (!Number.isNaN(minutes) && minutes > 0) {
                                updateRule(index, {
                                  minutes: clampLocalReminderMinutes(minutes),
                                });
                                setOpenDropdown(null);
                                setCustomInput("");
                              }
                            }
                          }}
                          placeholder={t("settings.sections.notifications.customPlaceholder")}
                          type="number"
                          value={customInput}
                        />
                        <button
                          className="settings-notifications__time-custom-confirm"
                          onClick={() => {
                            const minutes = Number.parseInt(customInput, 10);
                            if (!Number.isNaN(minutes) && minutes > 0) {
                              updateRule(index, {
                                minutes: clampLocalReminderMinutes(minutes),
                              });
                              setOpenDropdown(null);
                              setCustomInput("");
                            }
                          }}
                          type="button"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <select
                  className="settings-notifications__when"
                  onChange={(e) => {
                    updateRule(index, { when: e.target.value as LocalReminderWhenSetting });
                  }}
                  value={rule.when}
                >
                  {whenOptions.map((when) => (
                    <option key={when} value={when}>
                      {whenLabels[when]}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={t("settings.sections.notifications.removeRule")}
                  className="settings-notifications__remove"
                  disabled={localReminderRules.length <= 1}
                  onClick={() => {
                    if (localReminderRules.length <= 1) {
                      return;
                    }

                    onSave({
                      localReminderRules: localReminderRules.filter(
                        (_rule, ruleIndex) => ruleIndex !== index,
                      ),
                    });
                  }}
                  type="button"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <button
              className="settings-notifications__add"
              disabled={!canAddRule}
              onClick={() => {
                if (!canAddRule) {
                  return;
                }

                onSave({
                  localReminderRules: [...localReminderRules, { ...DEFAULT_LOCAL_REMINDER_RULE }],
                });
              }}
              type="button"
            >
              {t("settings.sections.notifications.addRule")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncSection({ onSave, settings }: Pick<SettingsDialogProps, "onSave" | "settings">) {
  const { t } = useTranslation();
  const syncIntervalOptions: SyncIntervalSetting[] = [5, 10, 15, 30, 60];

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.sync.title")}</h3>
      <div className="settings-fields">
        <p className="settings-placeholder">{t("settings.sections.sync.description")}</p>
        <div className="field">
          <span>{t("settings.sections.sync.interval")}</span>
          <select
            value={settings.syncIntervalMinutes}
            onChange={(e) => {
              onSave({
                syncIntervalMinutes: Number.parseInt(e.target.value, 10) as SyncIntervalSetting,
              });
            }}
          >
            {syncIntervalOptions.map((syncIntervalMinutes) => (
              <option key={syncIntervalMinutes} value={syncIntervalMinutes}>
                {t("settings.sections.sync.intervalOption", { value: syncIntervalMinutes })}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

interface AboutSectionProps {
  onSave: (settings: Partial<UserSettings>) => void;
  settings: UserSettings;
}

function AboutSection({ onSave, settings }: AboutSectionProps) {
  const { t } = useTranslation();
  const { isLoading: isVersionLoading, version } = useVersion();
  const {
    check,
    download,
    install,
    isChecking,
    isDownloading,
    status,
    statusError,
    statusLoading,
  } = useUpdater();

  const updateChannelOptions: UpdateChannel[] = ["stable", "prerelease"];
  const updateChannelLabels: Record<UpdateChannel, string> = {
    stable: t("settings.updates.channel.stable"),
    prerelease: t("settings.updates.channel.prerelease"),
  };

  const updateStatusLabel = useMemo(() => {
    if (!status) {
      return t("settings.updates.status.idle");
    }

    switch (status.state) {
      case "checking": {
        return t("settings.updates.status.checking");
      }
      case "available": {
        return t("settings.updates.status.available", {
          version: status.latestVersion ?? t("settings.updates.unknownVersion"),
        });
      }
      case "not_available": {
        return t("settings.updates.status.notAvailable");
      }
      case "downloading": {
        return t("settings.updates.status.downloading", {
          percent: Math.round(status.downloadPercent ?? 0),
        });
      }
      case "downloaded": {
        return t("settings.updates.status.downloaded", {
          version: status.latestVersion ?? t("settings.updates.unknownVersion"),
        });
      }
      case "error": {
        return t("settings.updates.status.error");
      }
      case "unsupported": {
        return t("settings.updates.status.unsupported");
      }
      case "idle":
      default: {
        return t("settings.updates.status.idle");
      }
    }
  }, [status, t]);

  const isBusy = isChecking || isDownloading;
  const canCheck = !isBusy && status?.state !== "unsupported";
  const canDownload = !isBusy && status?.state === "available";
  const canInstall = status?.state === "downloaded";

  let lastChecked = t("settings.updates.notCheckedYet");
  if (status?.checkedAt) {
    const value = new Date(status.checkedAt).toLocaleString();
    lastChecked = t("settings.updates.lastChecked", { value });
  }

  const effectiveVersion = version ?? status?.currentVersion ?? null;

  return (
    <div className="settings-section">
      <h3>{t("settings.sections.about.title")}</h3>
      <div className="settings-fields">
        <div className="settings-updates">
          <h4>{t("settings.updates.title")}</h4>
          <div className="settings-updates__meta">
            <span>{t("settings.updates.currentVersion")}</span>
            <strong>
              {isVersionLoading && !effectiveVersion
                ? t("settings.updates.loading")
                : (effectiveVersion ?? t("settings.updates.unknownVersion"))}
            </strong>
          </div>
          <div className="settings-updates__channel">
            <span>{t("settings.updates.channel.label")}</span>
            <select
              value={settings.updateChannel}
              onChange={(e) => {
                onSave({ updateChannel: e.target.value as UpdateChannel });
              }}
            >
              {updateChannelOptions.map((channel) => (
                <option key={channel} value={channel}>
                  {updateChannelLabels[channel]}
                </option>
              ))}
            </select>
          </div>
          <div
            className={`settings-updates__status settings-updates__status--${status?.state ?? "idle"}`}
          >
            {updateStatusLabel}
          </div>
          {status?.state === "downloading" && (
            <progress
              className="settings-updates__progress"
              max={100}
              value={Math.round(status.downloadPercent ?? 0)}
            />
          )}
          {status?.releaseNotes && (
            <details className="settings-updates__notes">
              <summary>{t("settings.updates.releaseNotes")}</summary>
              <pre>{status.releaseNotes}</pre>
            </details>
          )}
          {(status?.error || statusError instanceof Error) && (
            <p className="settings-updates__error">{status?.error ?? statusError?.message ?? ""}</p>
          )}
          <p className="settings-updates__timestamp">
            {statusLoading ? t("settings.updates.loading") : lastChecked}
          </p>
          <div className="settings-updates__actions">
            <button
              className="settings-updates__action"
              disabled={!canCheck}
              onClick={check}
              type="button"
            >
              {isChecking
                ? t("settings.updates.actions.checking")
                : t("settings.updates.actions.check")}
            </button>
            <button
              className="settings-updates__action"
              disabled={!canDownload}
              onClick={download}
              type="button"
            >
              {isDownloading
                ? t("settings.updates.actions.downloading")
                : t("settings.updates.actions.download")}
            </button>
            <button
              className="settings-updates__action settings-updates__action--primary"
              disabled={!canInstall}
              onClick={() => {
                install();
              }}
              type="button"
            >
              {t("settings.updates.actions.install")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({
  isOpen,
  onClose,
  calendars,
  settings,
  onSave,
}: SettingsDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  if (!isOpen) {
    return null;
  }

  const sections: { id: SettingsSection; label: string; icon: typeof faPalette }[] = [
    { id: "appearance", label: t("settings.sections.appearance.label"), icon: faPalette },
    {
      id: "calendarDefaults",
      label: t("settings.sections.calendarDefaults.label"),
      icon: faCalendar,
    },
    { id: "language", label: t("settings.sections.language.label"), icon: faGlobe },
    { id: "notifications", label: t("settings.sections.notifications.label"), icon: faBell },
    { id: "sync", label: t("settings.sections.sync.label"), icon: faArrowsRotate },
    { id: "about", label: t("settings.sections.about.label"), icon: faCircleInfo },
  ];

  function renderSectionContent() {
    switch (activeSection) {
      case "appearance": {
        return <AppearanceSection onSave={onSave} settings={settings} />;
      }
      case "calendarDefaults": {
        return <CalendarDefaultsSection calendars={calendars} />;
      }
      case "language": {
        return <LanguageSection onSave={onSave} settings={settings} />;
      }
      case "notifications": {
        return <NotificationsSection onSave={onSave} settings={settings} />;
      }
      case "sync": {
        return <SyncSection onSave={onSave} settings={settings} />;
      }
      case "about": {
        return <AboutSection onSave={onSave} settings={settings} />;
      }
      default: {
        return <AppearanceSection onSave={onSave} settings={settings} />;
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
                <FontAwesomeIcon className="settings-nav__icon" icon={section.icon} />
                <span>{section.label}</span>
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
