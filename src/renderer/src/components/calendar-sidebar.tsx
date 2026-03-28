import type { CalendarSummary, SyncStatus } from "@shared/schemas";
import { getCalendarAccent } from "@shared/calendar";
import MiniCalendar from "./mini-calendar";
import React from "react";
import { formatSyncTimestamp } from "../date-formatting";
import { useTranslation } from "react-i18next";

interface CalendarSidebarProps {
  onSettingsClick: () => void;
  accountEmail: string;
  accountName: null | string;
  calendars: CalendarSummary[];
  canCreateEvent: boolean;
  isRefreshing: boolean;
  onCalendarToggle: (calendar: CalendarSummary) => void;
  onCreateEvent: () => void;
  onDateSelect: (date: Date) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  selectedDate: string;
  syncStatus: SyncStatus;
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function AddCalendarButton() {
  const { t } = useTranslation();

  return (
    <button className="add-calendar-btn" type="button">
      <PlusIcon />
      {t("sidebar.addCalendar")}
    </button>
  );
}

function CalendarListHeader({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <div className="calendar-list-header">
      <h2>{t("sidebar.myCalendars")}</h2>
      <span className="muted-label">{count}</span>
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
    <label className="calendar-row" htmlFor={`calendar-toggle-${calendar.id}`} aria-label={calendar.name}>
      <input
        id={`calendar-toggle-${calendar.id}`}
        type="checkbox"
        checked={calendar.isVisible}
        onChange={() => onCalendarToggle(calendar)}
      />
      <div className="calendar-row-content">
        <span className="calendar-chip" style={{ backgroundColor: getCalendarAccent(calendar.color) }} />
        <span className="calendar-name">{calendar.name}</span>
      </div>
    </label>
  );
}

function CalendarList({
  calendars,
  onCalendarToggle,
}: {
  calendars: CalendarSummary[];
  onCalendarToggle: (calendar: CalendarSummary) => void;
}) {
  return (
    <div className="calendar-list">
      {calendars.map((calendar) => (
        <CalendarRow calendar={calendar} key={calendar.id} onCalendarToggle={onCalendarToggle} />
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <CalendarListHeader count={props.calendars.length} />
        <AddCalendarButton />
        <CalendarList calendars={props.calendars} onCalendarToggle={props.onCalendarToggle} />
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
