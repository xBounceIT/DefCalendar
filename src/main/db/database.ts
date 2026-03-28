import type {
  CalendarEvent,
  CalendarSummary,
  EventListArgs,
  SyncStatus,
  UserSettings,
} from "@shared/schemas";
import {
  calendarEventSchema,
  calendarSummarySchema,
  createDefaultSettings,
  userSettingsSchema,
} from "@shared/schema-values";
import { dirname, join } from "pathe";
import Database from "better-sqlite3";
import { app } from "electron";
import fs from "fs-extra";

const SETTINGS_KEY = "user-settings";

interface ReplaceEventsForCalendarRangeArgs {
  calendarId: string;
  events: CalendarEvent[];
  rangeEnd: string;
  rangeStart: string;
}

interface SaveSyncStateArgs {
  calendarId: string;
  errorMessage: string | null;
  lastSyncedAt: string;
  rangeEnd: string;
  rangeStart: string;
}

class AppDatabase {
  private readonly db: Database.Database;

  constructor() {
    const databasePath = join(app.getPath("userData"), "project-calendar.sqlite");
    fs.mkdirSync(dirname(databasePath), { recursive: true });

    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  listCalendars(): CalendarSummary[] {
    const statement = this.db.prepare(`
      SELECT payload_json
      FROM calendars
      ORDER BY is_default_calendar DESC, name COLLATE NOCASE ASC
    `);

    return statement
      .all()
      .map((row) =>
        calendarSummarySchema.parse(JSON.parse(readStringProperty(row, "payload_json"))),
      );
  }

  listCalendarIds(): string[] {
    return this.db
      .prepare("SELECT id FROM calendars")
      .all()
      .map((row) => readStringProperty(row, "id"));
  }

  upsertCalendars(calendars: CalendarSummary[]): void {
    const upsert = this.db.prepare(`
      INSERT INTO calendars (
        id,
        name,
        color,
        can_edit,
        can_share,
        is_default_calendar,
        owner_name,
        owner_address,
        payload_json,
        updated_at
      ) VALUES (
        @id,
        @name,
        @color,
        @can_edit,
        @can_share,
        @is_default_calendar,
        @owner_name,
        @owner_address,
        @payload_json,
        @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        can_edit = excluded.can_edit,
        can_share = excluded.can_share,
        is_default_calendar = excluded.is_default_calendar,
        owner_name = excluded.owner_name,
        owner_address = excluded.owner_address,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);

    const existingIds = new Set(
      this.db
        .prepare("SELECT id FROM calendars")
        .all()
        .map((row) => readStringProperty(row, "id")),
    );
    const incomingIds = new Set(calendars.map((calendar) => calendar.id));

    const transaction = this.db.transaction((items: CalendarSummary[]) => {
      for (const calendar of items) {
        upsert.run({
          can_edit: toSqliteBoolean(calendar.canEdit),
          can_share: toSqliteBoolean(calendar.canShare),
          color: calendar.color,
          id: calendar.id,
          is_default_calendar: toSqliteBoolean(calendar.isDefaultCalendar),
          name: calendar.name,
          owner_address: calendar.ownerAddress,
          owner_name: calendar.ownerName,
          payload_json: JSON.stringify(calendar),
          updated_at: new Date().toISOString(),
        });
      }

      for (const calendarId of existingIds) {
        if (!incomingIds.has(calendarId)) {
          this.db.prepare("DELETE FROM calendars WHERE id = ?").run(calendarId);
          this.db.prepare("DELETE FROM events WHERE calendar_id = ?").run(calendarId);
          this.db.prepare("DELETE FROM sync_state WHERE calendar_id = ?").run(calendarId);
        }
      }
    });

    transaction(calendars);
  }

  replaceEventsForCalendarRange(args: ReplaceEventsForCalendarRangeArgs): void {
    const { calendarId, events, rangeEnd, rangeStart } = args;
    const insert = this.db.prepare(`
      INSERT INTO events (
        id,
        calendar_id,
        subject,
        start_sort,
        end_sort,
        is_all_day,
        is_reminder_on,
        reminder_minutes_before_start,
        unsupported_reason,
        web_link,
        payload_json,
        updated_at
      ) VALUES (
        @id,
        @calendar_id,
        @subject,
        @start_sort,
        @end_sort,
        @is_all_day,
        @is_reminder_on,
        @reminder_minutes_before_start,
        @unsupported_reason,
        @web_link,
        @payload_json,
        @updated_at
      )
      ON CONFLICT(id, calendar_id) DO UPDATE SET
        subject = excluded.subject,
        start_sort = excluded.start_sort,
        end_sort = excluded.end_sort,
        is_all_day = excluded.is_all_day,
        is_reminder_on = excluded.is_reminder_on,
        reminder_minutes_before_start = excluded.reminder_minutes_before_start,
        unsupported_reason = excluded.unsupported_reason,
        web_link = excluded.web_link,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);

    const transaction = this.db.transaction((items: CalendarEvent[]) => {
      this.db
        .prepare("DELETE FROM events WHERE calendar_id = ? AND start_sort < ? AND end_sort > ?")
        .run(calendarId, rangeEnd, rangeStart);

      for (const event of items) {
        insert.run({
          calendar_id: event.calendarId,
          end_sort: event.end,
          id: event.id,
          is_all_day: toSqliteBoolean(event.isAllDay),
          is_reminder_on: toSqliteBoolean(event.isReminderOn),
          payload_json: JSON.stringify(event),
          reminder_minutes_before_start: event.reminderMinutesBeforeStart,
          start_sort: event.start,
          subject: event.subject,
          unsupported_reason: event.unsupportedReason,
          updated_at: new Date().toISOString(),
          web_link: event.webLink,
        });
      }
    });

    transaction(events);
  }

  upsertEvent(event: CalendarEvent): void {
    this.db
      .prepare(
        `
          INSERT INTO events (
            id,
            calendar_id,
            subject,
            start_sort,
            end_sort,
            is_all_day,
            is_reminder_on,
            reminder_minutes_before_start,
            unsupported_reason,
            web_link,
            payload_json,
            updated_at
          ) VALUES (
            @id,
            @calendar_id,
            @subject,
            @start_sort,
            @end_sort,
            @is_all_day,
            @is_reminder_on,
            @reminder_minutes_before_start,
            @unsupported_reason,
            @web_link,
            @payload_json,
            @updated_at
          )
          ON CONFLICT(id, calendar_id) DO UPDATE SET
            subject = excluded.subject,
            start_sort = excluded.start_sort,
            end_sort = excluded.end_sort,
            is_all_day = excluded.is_all_day,
            is_reminder_on = excluded.is_reminder_on,
            reminder_minutes_before_start = excluded.reminder_minutes_before_start,
            unsupported_reason = excluded.unsupported_reason,
            web_link = excluded.web_link,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        calendar_id: event.calendarId,
        end_sort: event.end,
        id: event.id,
        is_all_day: toSqliteBoolean(event.isAllDay),
        is_reminder_on: toSqliteBoolean(event.isReminderOn),
        payload_json: JSON.stringify(event),
        reminder_minutes_before_start: event.reminderMinutesBeforeStart,
        start_sort: event.start,
        subject: event.subject,
        unsupported_reason: event.unsupportedReason,
        updated_at: new Date().toISOString(),
        web_link: event.webLink,
      });
  }

  deleteEvent(calendarId: string, eventId: string): void {
    this.db.prepare("DELETE FROM events WHERE calendar_id = ? AND id = ?").run(calendarId, eventId);
  }

  getEvent(calendarId: string, eventId: string): CalendarEvent | null {
    const row = this.db
      .prepare("SELECT payload_json FROM events WHERE calendar_id = ? AND id = ?")
      .get(calendarId, eventId);

    if (!row) {
      return null;
    }

    return calendarEventSchema.parse(JSON.parse(readStringProperty(row, "payload_json")));
  }

  listEvents(args: EventListArgs): CalendarEvent[] {
    const filters: string[] = ["start_sort < @end", "end_sort > @start"];
    const parameters: Record<string, string> = {
      end: args.end,
      start: args.start,
    };

    if (args.calendarIds?.length) {
      const placeholders = args.calendarIds.map((_calendarId, index) => `@calendar_${index}`);
      filters.push(`calendar_id IN (${placeholders.join(", ")})`);
      args.calendarIds.forEach((calendarId, index) => {
        parameters[`calendar_${index}`] = calendarId;
      });
    }

    const statement = this.db.prepare(`
      SELECT payload_json
      FROM events
      WHERE ${filters.join(" AND ")}
      ORDER BY start_sort ASC, subject COLLATE NOCASE ASC
    `);

    return statement
      .all(parameters)
      .map((row) => calendarEventSchema.parse(JSON.parse(readStringProperty(row, "payload_json"))));
  }

  listReminderCandidates(windowStart: string, windowEnd: string): CalendarEvent[] {
    const statement = this.db.prepare(`
      SELECT payload_json
      FROM events
      WHERE is_reminder_on = 1
        AND reminder_minutes_before_start IS NOT NULL
        AND start_sort >= ?
        AND start_sort <= ?
      ORDER BY start_sort ASC
    `);

    return statement
      .all(windowStart, windowEnd)
      .map((row) => calendarEventSchema.parse(JSON.parse(readStringProperty(row, "payload_json"))));
  }

  getSettings(): UserSettings {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key = ?").get(SETTINGS_KEY);

    if (!row) {
      const defaults = createDefaultSettings();
      this.saveSettings(defaults);
      return defaults;
    }

    return userSettingsSchema.parse(JSON.parse(readStringProperty(row, "value_json")));
  }

  saveSettings(settings: UserSettings): void {
    this.db
      .prepare(
        `
          INSERT INTO settings (key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(SETTINGS_KEY, JSON.stringify(settings), new Date().toISOString());
  }

  saveSyncState(args: SaveSyncStateArgs): void {
    const { calendarId, errorMessage, lastSyncedAt, rangeEnd, rangeStart } = args;

    this.db
      .prepare(
        `
          INSERT INTO sync_state (calendar_id, last_synced_at, range_start, range_end, error_message)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(calendar_id) DO UPDATE SET
            last_synced_at = excluded.last_synced_at,
            range_start = excluded.range_start,
            range_end = excluded.range_end,
            error_message = excluded.error_message
        `,
      )
      .run(calendarId, lastSyncedAt, rangeStart, rangeEnd, errorMessage);
  }

  getLatestSyncStatus(): SyncStatus {
    const row = this.db
      .prepare(
        "SELECT MAX(last_synced_at) AS lastSyncedAt, MAX(error_message) AS errorMessage FROM sync_state",
      )
      .get();

    const lastSyncedAt = readNullableStringProperty(row, "lastSyncedAt");
    const errorMessage = readNullableStringProperty(row, "errorMessage");

    if (errorMessage) {
      return {
        lastSyncedAt,
        message: errorMessage,
        state: "error",
      };
    }

    let message = "Sign in to sync Exchange 365.";
    if (lastSyncedAt) {
      message = "Calendar cache is up to date.";
    }

    return {
      lastSyncedAt,
      message,
      state: "idle",
    };
  }

  hasNotificationFired(key: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM notification_state WHERE dedupe_key = ?").get(key);
    return Boolean(row);
  }

  markNotificationFired(key: string): void {
    this.db
      .prepare(
        `
          INSERT INTO notification_state (dedupe_key, fired_at)
          VALUES (?, ?)
          ON CONFLICT(dedupe_key) DO NOTHING
        `,
      )
      .run(key, new Date().toISOString());
  }

  pruneNotificationState(beforeIso: string): void {
    this.db.prepare("DELETE FROM notification_state WHERE fired_at < ?").run(beforeIso);
  }

  clearUserData(): void {
    this.db.exec(`
      DELETE FROM notification_state;
      DELETE FROM sync_state;
      DELETE FROM events;
      DELETE FROM calendars;
      DELETE FROM settings;
    `);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        can_edit INTEGER NOT NULL,
        can_share INTEGER NOT NULL,
        is_default_calendar INTEGER NOT NULL,
        owner_name TEXT,
        owner_address TEXT,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        start_sort TEXT NOT NULL,
        end_sort TEXT NOT NULL,
        is_all_day INTEGER NOT NULL,
        is_reminder_on INTEGER NOT NULL,
        reminder_minutes_before_start INTEGER,
        unsupported_reason TEXT,
        web_link TEXT,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, calendar_id),
        FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_range ON events (calendar_id, start_sort, end_sort);

      CREATE TABLE IF NOT EXISTS sync_state (
        calendar_id TEXT PRIMARY KEY,
        last_synced_at TEXT,
        range_start TEXT,
        range_end TEXT,
        error_message TEXT,
        FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notification_state (
        dedupe_key TEXT PRIMARY KEY,
        fired_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}

function hasProperty(row: unknown, key: string): row is Record<string, unknown> {
  return typeof row === "object" && row !== null && key in row;
}

function readNullableStringProperty(row: unknown, key: string): null | string {
  const value = readProperty(row, key);
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Expected "${key}" to be a string or null.`);
}

function readProperty(row: unknown, key: string): unknown {
  if (hasProperty(row, key)) {
    return row[key];
  }

  throw new Error(`Expected row to contain "${key}".`);
}

function readStringProperty(row: unknown, key: string): string {
  const value = readProperty(row, key);
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Expected "${key}" to be a string.`);
}

function toSqliteBoolean(value: boolean): 0 | 1 {
  if (value) {
    return 1;
  }

  return 0;
}

export default AppDatabase;
