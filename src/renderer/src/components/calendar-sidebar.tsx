import type { AccountSummary, CalendarSummary, SyncStatus } from "@shared/schemas";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleUser, faPlus } from "@fortawesome/free-solid-svg-icons";
import { getCalendarAccent } from "@shared/calendar";
import MiniCalendar from "./mini-calendar";
import React from "react";
import { formatSyncTimestamp } from "../date-formatting";
import { useTranslation } from "react-i18next";

interface CalendarSidebarProps {
  onSettingsClick: () => void;
  accounts: AccountSummary[];
  activeAccountId: string | null;
  calendars: CalendarSummary[];
  canCreateEvent: boolean;
  isRefreshing: boolean;
  onAccountSwitch: (homeAccountId: string) => void;
  onAccountAdd: () => void;
  onCalendarToggle: (calendar: CalendarSummary) => void;
  onCreateEvent: () => void;
  onDateSelect: (date: Date) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  selectedDate: string;
  syncStatus: SyncStatus;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CalendarListHeader({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="calendar-list-header">
      <h2>{t("sidebar.accounts")}</h2>
      <button className="add-account-btn" onClick={onAdd} title={t("sidebar.addAccount")} type="button">
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
}

function CalendarRow({
  calendar,
  onCalendarToggle,
}: {
  calendar: CalendarSummary;
  onCalendarToggle: (calendar: CalendarSummary) => void;
}) {
  return (
    <label
      className="calendar-row"
      htmlFor={`calendar-toggle-${calendar.id}`}
      aria-label={calendar.name}
    >
      <input
        id={`calendar-toggle-${calendar.id}`}
        type="checkbox"
        checked={calendar.isVisible}
        onChange={() => onCalendarToggle(calendar)}
      />
      <div className="calendar-row-content">
        <span
          className="calendar-chip"
          style={{ backgroundColor: getCalendarAccent(calendar.color) }}
        />
        <span className="calendar-name">{calendar.name}</span>
      </div>
    </label>
  );
}

function CalendarListGroup({
  account,
  calendars,
  isActive,
  onCalendarToggle,
  isExpanded,
  onToggle,
  onSwitch,
}: {
  account: AccountSummary;
  calendars: CalendarSummary[];
  isActive: boolean;
  onCalendarToggle: (calendar: CalendarSummary) => void;
  isExpanded: boolean;
  onToggle: () => void;
  onSwitch: () => void;
}) {
  return (
    <div className="calendar-list-group">
      <div className="account-card">
        <button className="account-header" onClick={onToggle} type="button">
          <span
            className="account-color-dot"
            style={{ backgroundColor: account.color }}
          />
          <FontAwesomeIcon className="account-icon" icon={faCircleUser} />
          <ChevronIcon expanded={isExpanded} />
          <span className="account-email">{account.username}</span>
        </button>
        {!isActive && (
          <button className="account-switch-btn" onClick={onSwitch} type="button">
            Switch
          </button>
        )}
        <div className={`account-calendars-wrapper ${isExpanded ? "expanded" : ""}`}>
          <div className="account-calendars">
            {calendars.map((calendar) => (
              <CalendarRow
                calendar={calendar}
                key={calendar.id}
                onCalendarToggle={onCalendarToggle}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarList({
  accounts,
  activeAccountId,
  calendars,
  onAccountSwitch,
  onCalendarToggle,
}: {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  calendars: CalendarSummary[];
  onAccountSwitch: (homeAccountId: string) => void;
  onCalendarToggle: (calendar: CalendarSummary) => void;
}) {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => new Set());

  const groups = React.useMemo(() => {
    const grouped = new Map<string, CalendarSummary[]>();
    for (const calendar of calendars) {
      const email = calendar.ownerAddress ?? "Unknown";
      const existing = grouped.get(email);
      if (existing) {
        existing.push(calendar);
      } else {
        grouped.set(email, [calendar]);
      }
    }
    return grouped;
  }, [calendars]);

  const accountEmails = React.useMemo(
    () => new Set(accounts.map((a) => a.username)),
    [accounts],
  );

  const entries = React.useMemo(
    () => accounts.map((account) => [account.username, account] as const),
    [accounts],
  );

  const handleToggleGroup = React.useCallback((email: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  }, []);

  const handleSwitchAccount = React.useCallback(
    (homeAccountId: string) => {
      onAccountSwitch(homeAccountId);
    },
    [onAccountSwitch],
  );

  return (
    <div className="calendar-list-container">
      {entries.map(([email, account]) => (
        <CalendarListGroup
          account={account}
          calendars={groups.get(email) ?? []}
          isActive={account.homeAccountId === activeAccountId}
          isExpanded={expandedGroups.has(email)}
          key={account.homeAccountId}
          onCalendarToggle={onCalendarToggle}
          onSwitch={() => handleSwitchAccount(account.homeAccountId)}
          onToggle={() => handleToggleGroup(email)}
        />
      ))}
    </div>
  );
}

function SyncCard({
  isRefreshing,
  onRefresh,
  syncStatus,
}: {
  isRefreshing: boolean;
  onRefresh: () => void;
  syncStatus: SyncStatus;
}) {
  const { t } = useTranslation();
  const { lastSyncedAt, message: syncMessage } = syncStatus;
  let message = t("common.idle");
  if (syncMessage) {
    message = syncMessage;
  }

  const iconClassName = isRefreshing ? "refresh-icon--spinning" : "";

  const syncTimestamp = formatSyncTimestamp(lastSyncedAt);

  return (
    <div className={`sync-card sync-card--${syncStatus.state}`}>
      <div className="sync-card-content">
        <span className="sync-dot" />
        <SyncInfo message={message} syncTimestamp={syncTimestamp} />
      </div>
      <button
        className="refresh-btn"
        disabled={isRefreshing}
        onClick={onRefresh}
        type="button"
        title={t("sidebar.refresh")}
      >
        <span className={iconClassName}>
          <RefreshIcon />
        </span>
      </button>
    </div>
  );
}

function SyncInfo({ message, syncTimestamp }: { message: string; syncTimestamp: string }) {
  return (
    <div className="sync-info">
      <span className="sync-status-text">{message}</span>
      <span className="sync-timestamp">{syncTimestamp}</span>
    </div>
  );
}

function SettingsIcon() {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="settings-section">
      <button className="settings-btn" onClick={onClick} type="button">
        <SettingsIcon />
        {t("sidebar.settings")}
      </button>
    </div>
  );
}

function RefreshIcon() {
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
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SignOutIcon() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SidebarActions({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="sidebar-actions">
      <button className="sign-out-btn" onClick={onSignOut} type="button">
        <SignOutIcon />
        {t("sidebar.signOut")}
      </button>
    </div>
  );
}

function CalendarSidebar(props: CalendarSidebarProps) {
  const { t } = useTranslation();
  const selectedDate = new Date(props.selectedDate);

  return (
    <aside className="sidebar">
      <h1 className="sidebar-title">{t("sidebar.title")}</h1>

      <MiniCalendar selectedDate={selectedDate} onDateSelect={props.onDateSelect} />

      <div className="sidebar-section">
        <CalendarListHeader onAdd={props.onAccountAdd} />
        <CalendarList
          accounts={props.accounts}
          activeAccountId={props.activeAccountId}
          calendars={props.calendars}
          onAccountSwitch={props.onAccountSwitch}
          onCalendarToggle={props.onCalendarToggle}
        />
      </div>

      <div className="sync-section">
        <SyncCard
          isRefreshing={props.isRefreshing}
          onRefresh={props.onRefresh}
          syncStatus={props.syncStatus}
        />
        <SettingsButton onClick={props.onSettingsClick} />
        <hr className="sidebar-divider" />
        <SidebarActions onSignOut={props.onSignOut} />
      </div>
    </aside>
  );
}

export default CalendarSidebar;
