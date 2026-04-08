import type {
  CalendarEvent,
  CalendarSummary,
  ContactSuggestion,
  EventListArgs,
  ReminderType,
  SearchContactsArgs,
  StoredAccount,
  SyncStatus,
  UserSettings,
} from "@shared/schemas";
import {
  calendarEventSchema,
  calendarSummarySchema,
  contactSuggestionSchema,
  createDefaultSettings,
  REMINDER_TYPE,
  storedAccountSchema,
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

interface ReminderCandidate {
  dedupeKey: string;
  dismissedAt: null | string;
  event: CalendarEvent;
  snoozedUntil: null | string;
  reminderType: ReminderType;
}

interface ReminderStateSnapshot {
  dismissedAt: null | string;
  snoozedUntil: null | string;
}

class AppDatabase {
  private readonly db: Database.Database;
  private cachedDismissStatement: Database.Statement | null = null;

  constructor() {
    const databasePath = join(app.getPath("userData"), "project-calendar.sqlite");
    fs.mkdirSync(dirname(databasePath), { recursive: true });

    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  listCalendars(homeAccountId?: string): CalendarSummary[] {
    if (homeAccountId) {
      return this.db
        .prepare(`
        SELECT
          id,
          home_account_id,
          name,
          color,
          user_color,
          can_edit,
          can_share,
          is_default_calendar,
          owner_name,
          owner_address,
          payload_json
        FROM calendars
        WHERE home_account_id = ?
        ORDER BY is_default_calendar DESC, name COLLATE NOCASE ASC
      `)
        .all(homeAccountId)
        .map((row) => readCalendarSummary(row));
    }

    return this.db
      .prepare(`
      SELECT
        id,
        home_account_id,
        name,
        color,
        user_color,
        can_edit,
        can_share,
        is_default_calendar,
        owner_name,
        owner_address,
        payload_json
      FROM calendars
      ORDER BY is_default_calendar DESC, name COLLATE NOCASE ASC
    `)
      .all()
      .map((row) => readCalendarSummary(row));
  }

  listCalendarIds(homeAccountId?: string): string[] {
    if (homeAccountId) {
      return this.db
        .prepare("SELECT id FROM calendars WHERE home_account_id = ?")
        .all(homeAccountId)
        .map((row) => readStringProperty(row, "id"));
    }
    return this.db
      .prepare("SELECT id FROM calendars")
      .all()
      .map((row) => readStringProperty(row, "id"));
  }

  getCalendarHomeAccountId(calendarId: string): null | string {
    const row = this.db
      .prepare("SELECT home_account_id FROM calendars WHERE id = ?")
      .get(calendarId);

    if (!row) {
      return null;
    }

    return readStringProperty(row, "home_account_id");
  }

  replaceContactsForAccount(contacts: ContactSuggestion[], homeAccountId: string): void {
    const insert = this.db.prepare(`
      INSERT INTO contacts (
        home_account_id,
        email,
        normalized_email,
        name,
        normalized_name,
        search_text,
        updated_at
      ) VALUES (
        @home_account_id,
        @email,
        @normalized_email,
        @name,
        @normalized_name,
        @search_text,
        @updated_at
      )
    `);

    const deduped = new Map<string, ContactSuggestion>();
    for (const contact of contacts) {
      const normalizedEmail = normalizeContactEmail(contact.email);
      if (!normalizedEmail) {
        continue;
      }

      const name = normalizeContactName(contact.name);
      const existing = deduped.get(normalizedEmail);
      if (existing && existing.name) {
        continue;
      }

      deduped.set(normalizedEmail, {
        email: normalizedEmail,
        name: name ?? existing?.name ?? null,
      });
    }

    const transaction = this.db.transaction((items: ContactSuggestion[]) => {
      this.db.prepare("DELETE FROM contacts WHERE home_account_id = ?").run(homeAccountId);

      const updatedAt = new Date().toISOString();
      for (const contact of items) {
        const normalizedEmail = normalizeContactEmail(contact.email);
        if (!normalizedEmail) {
          continue;
        }

        const normalizedName = normalizeContactSearchValue(contact.name);
        insert.run({
          email: normalizedEmail,
          home_account_id: homeAccountId,
          name: normalizeContactName(contact.name),
          normalized_email: normalizedEmail,
          normalized_name: normalizedName,
          search_text: [normalizedName, normalizedEmail].filter(Boolean).join(" "),
          updated_at: updatedAt,
        });
      }
    });

    transaction([...deduped.values()]);
  }

  searchContacts(args: SearchContactsArgs): ContactSuggestion[] {
    const normalizedQuery = normalizeContactSearchValue(args.query);
    if (!normalizedQuery) {
      return [];
    }

    const rows = this.db
      .prepare(
        String.raw`
          SELECT email, name
          FROM contacts
          WHERE home_account_id = @home_account_id
            AND search_text LIKE @contains ESCAPE '\'
          ORDER BY
            CASE
              WHEN normalized_email = @exact THEN 0
              WHEN normalized_name = @exact THEN 1
              WHEN normalized_email LIKE @prefix ESCAPE '\' THEN 2
              WHEN normalized_name LIKE @prefix ESCAPE '\' THEN 3
              ELSE 4
            END,
            CASE WHEN name IS NULL THEN 1 ELSE 0 END,
            name COLLATE NOCASE ASC,
            email COLLATE NOCASE ASC
          LIMIT @limit
        `,
      )
      .all({
        contains: `%${escapeLikePattern(normalizedQuery)}%`,
        exact: normalizedQuery,
        home_account_id: args.homeAccountId,
        limit: args.limit,
        prefix: `${escapeLikePattern(normalizedQuery)}%`,
      });

    return rows.map((row) =>
      contactSuggestionSchema.parse({
        email: readStringProperty(row, "email"),
        name: readNullableStringProperty(row, "name"),
      }),
    );
  }

  setCalendarColor(calendarId: string, color: string): CalendarSummary | null {
    this.db.prepare("UPDATE calendars SET user_color = ? WHERE id = ?").run(color, calendarId);

    const row = this.db
      .prepare(
        `
        SELECT
          id,
          home_account_id,
          name,
          color,
          user_color,
          can_edit,
          can_share,
          is_default_calendar,
          owner_name,
          owner_address,
          payload_json
        FROM calendars
        WHERE id = ?
      `,
      )
      .get(calendarId);

    if (!row) {
      return null;
    }

    return readCalendarSummary(row);
  }

  upsertCalendars(calendars: CalendarSummary[], homeAccountId: string): void {
    const upsert = this.db.prepare(`
      INSERT INTO calendars (
        id,
        home_account_id,
        name,
        color,
        user_color,
        can_edit,
        can_share,
        is_default_calendar,
        owner_name,
        owner_address,
        payload_json,
        updated_at
      ) VALUES (
        @id,
        @home_account_id,
        @name,
        @color,
        NULL,
        @can_edit,
        @can_share,
        @is_default_calendar,
        @owner_name,
        @owner_address,
        @payload_json,
        @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        home_account_id = excluded.home_account_id,
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
        .prepare("SELECT id FROM calendars WHERE home_account_id = ?")
        .all(homeAccountId)
        .map((row) => readStringProperty(row, "id")),
    );
    const incomingIds = new Set(calendars.map((calendar) => calendar.id));

    const transaction = this.db.transaction((items: CalendarSummary[]) => {
      for (const calendar of items) {
        const persistedCalendar = {
          ...calendar,
          homeAccountId,
        };

        upsert.run({
          can_edit: toSqliteBoolean(persistedCalendar.canEdit),
          can_share: toSqliteBoolean(persistedCalendar.canShare),
          color: persistedCalendar.color,
          home_account_id: homeAccountId,
          id: persistedCalendar.id,
          is_default_calendar: toSqliteBoolean(persistedCalendar.isDefaultCalendar),
          name: persistedCalendar.name,
          owner_address: persistedCalendar.ownerAddress,
          owner_name: persistedCalendar.ownerName,
          payload_json: JSON.stringify(persistedCalendar),
          updated_at: new Date().toISOString(),
        });
      }

      for (const calendarId of existingIds) {
        if (!incomingIds.has(calendarId)) {
          this.db
            .prepare(String.raw`DELETE FROM reminder_state WHERE dedupe_key LIKE ? ESCAPE '\'`)
            .run(`${escapeLikePattern(calendarId)}:%`);
          this.db
            .prepare(String.raw`DELETE FROM notification_state WHERE dedupe_key LIKE ? ESCAPE '\'`)
            .run(`${escapeLikePattern(calendarId)}:%`);
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

  listReminderCandidates(
    visibleCalendarIds: string[],
    windowStart: string,
    windowEnd: string,
  ): ReminderCandidate[] {
    if (visibleCalendarIds.length === 0) {
      return [];
    }

    const placeholders = visibleCalendarIds.map(() => "?").join(", ");
    const statement = this.db.prepare(`
      SELECT
        events.calendar_id || ':' || events.id || ':' || events.start_sort AS base_key,
        events.payload_json,
        reminder_state_pre.dismissed_at AS dismissed_at_pre,
        reminder_state_pre.snoozed_until AS snoozed_until_pre,
        reminder_state_start.dismissed_at AS dismissed_at_start,
        reminder_state_start.snoozed_until AS snoozed_until_start
      FROM events
      LEFT JOIN reminder_state AS reminder_state_pre
        ON reminder_state_pre.dedupe_key = events.calendar_id || ':' || events.id || ':' || events.start_sort || ':pre'
      LEFT JOIN reminder_state AS reminder_state_start
        ON reminder_state_start.dedupe_key = events.calendar_id || ':' || events.id || ':' || events.start_sort || ':start'
      WHERE events.is_reminder_on = 1
        AND events.reminder_minutes_before_start IS NOT NULL
        AND events.start_sort >= ?
        AND events.start_sort <= ?
        AND events.calendar_id IN (${placeholders})
      ORDER BY events.start_sort ASC, events.subject COLLATE NOCASE ASC
    `);

    const candidates: ReminderCandidate[] = [];

    for (const row of statement.all(windowStart, windowEnd, ...visibleCalendarIds)) {
      const event = calendarEventSchema.parse(JSON.parse(readStringProperty(row, "payload_json")));
      const baseKey = readStringProperty(row, "base_key");
      const reminderMinutes = event.reminderMinutesBeforeStart;

      if (reminderMinutes === null) {
        continue;
      }

      if (reminderMinutes > 0) {
        candidates.push({
          dedupeKey: `${baseKey}:${REMINDER_TYPE.PRE}`,
          dismissedAt: readNullableStringProperty(row, "dismissed_at_pre"),
          event,
          reminderType: REMINDER_TYPE.PRE,
          snoozedUntil: readNullableStringProperty(row, "snoozed_until_pre"),
        });
        continue;
      }

      candidates.push({
        dedupeKey: `${baseKey}:${REMINDER_TYPE.START}`,
        dismissedAt: readNullableStringProperty(row, "dismissed_at_start"),
        event,
        reminderType: REMINDER_TYPE.START,
        snoozedUntil: readNullableStringProperty(row, "snoozed_until_start"),
      });
    }

    return candidates;
  }

  listReminderEventsByStartRange(
    visibleCalendarIds: string[],
    windowStart: string,
    windowEnd: string,
  ): CalendarEvent[] {
    if (visibleCalendarIds.length === 0) {
      return [];
    }

    const placeholders = visibleCalendarIds.map(() => "?").join(", ");
    const statement = this.db.prepare(`
      SELECT payload_json
      FROM events
      WHERE events.start_sort >= ?
        AND events.start_sort <= ?
        AND events.calendar_id IN (${placeholders})
      ORDER BY events.start_sort ASC, events.subject COLLATE NOCASE ASC
    `);

    return statement
      .all(windowStart, windowEnd, ...visibleCalendarIds)
      .map((row) => calendarEventSchema.parse(JSON.parse(readStringProperty(row, "payload_json"))));
  }

  getReminderState(dedupeKey: string): null | ReminderStateSnapshot {
    const row = this.db
      .prepare("SELECT dismissed_at, snoozed_until FROM reminder_state WHERE dedupe_key = ?")
      .get(dedupeKey);

    if (!row) {
      return null;
    }

    return {
      dismissedAt: readNullableStringProperty(row, "dismissed_at"),
      snoozedUntil: readNullableStringProperty(row, "snoozed_until"),
    };
  }

  getReminderStates(keys: string[]): Map<string, ReminderStateSnapshot> {
    if (keys.length === 0) {
      return new Map();
    }

    const placeholders = keys.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT dedupe_key, dismissed_at, snoozed_until FROM reminder_state WHERE dedupe_key IN (${placeholders})`,
      )
      .all(...keys);

    const result = new Map<string, ReminderStateSnapshot>();
    for (const row of rows) {
      result.set(readStringProperty(row, "dedupe_key"), {
        dismissedAt: readNullableStringProperty(row, "dismissed_at"),
        snoozedUntil: readNullableStringProperty(row, "snoozed_until"),
      });
    }
    return result;
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
        `
          SELECT
            MAX(last_synced_at) AS lastSyncedAt,
            MAX(error_message) AS errorMessage,
            COALESCE(SUM(CASE WHEN last_synced_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS calendarsSynced,
            (SELECT COUNT(*) FROM events) AS eventsSynced
          FROM sync_state
        `,
      )
      .get();

    const lastSyncedAt = readNullableStringProperty(row, "lastSyncedAt");
    const errorMessage = readNullableStringProperty(row, "errorMessage");
    const calendarsSynced = readNumberProperty(row, "calendarsSynced");
    const eventsSynced = readNumberProperty(row, "eventsSynced");

    if (errorMessage) {
      return {
        lastSyncedAt,
        message: errorMessage,
        messageKey: errorMessage === "Exchange 365 sync failed." ? "sync.syncFailed" : null,
        counts: null,
        state: "error",
      };
    }

    if (lastSyncedAt && calendarsSynced > 0) {
      let calendarSuffix = "s";
      if (calendarsSynced === 1) {
        calendarSuffix = "";
      }
      let eventSuffix = "s";
      if (eventsSynced === 1) {
        eventSuffix = "";
      }

      return {
        lastSyncedAt,
        message: `Synced ${calendarsSynced} calendar${calendarSuffix}, ${eventsSynced} event${eventSuffix}.`,
        messageKey: "sync.synced",
        counts: {
          calendars: calendarsSynced,
          events: eventsSynced,
        },
        state: "idle",
      };
    }

    let message = "Sign in to sync Exchange 365.";
    let messageKey = "sync.signInToSync";
    if (lastSyncedAt) {
      message = "Calendar cache is up to date.";
      messageKey = "sync.cacheUpToDate";
    }

    return {
      lastSyncedAt,
      message,
      messageKey,
      counts: null,
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

  dismissReminder(key: string): void {
    this.dismissReminders([key]);
  }

  dismissReminders(keys: string[]): void {
    if (keys.length === 0) {
      return;
    }

    if (!this.cachedDismissStatement) {
      this.cachedDismissStatement = this.db.prepare(`
        INSERT INTO reminder_state (dedupe_key, snoozed_until, dismissed_at)
        VALUES (?, NULL, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          snoozed_until = excluded.snoozed_until,
          dismissed_at = excluded.dismissed_at
      `);
    }

    const dismiss = this.cachedDismissStatement;
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      for (const key of keys) {
        dismiss.run(key, now);
      }
    });
    transaction();
  }

  snoozeReminder(key: string, untilIso: string): void {
    this.db
      .prepare(
        `
          INSERT INTO reminder_state (dedupe_key, snoozed_until, dismissed_at)
          VALUES (?, ?, NULL)
          ON CONFLICT(dedupe_key) DO UPDATE SET
            snoozed_until = excluded.snoozed_until,
            dismissed_at = excluded.dismissed_at
        `,
      )
      .run(key, untilIso);
  }

  pruneNotificationState(beforeIso: string): void {
    this.db.prepare("DELETE FROM notification_state WHERE fired_at < ?").run(beforeIso);
  }

  pruneReminderState(beforeIso: string): void {
    this.db
      .prepare("DELETE FROM reminder_state WHERE dismissed_at IS NOT NULL AND dismissed_at < ?")
      .run(beforeIso);
  }

  clearUserData(homeAccountId?: string): void {
    if (homeAccountId) {
      const deleteUserData = this.db.transaction((accountId: string) => {
        const calendarIds = this.db
          .prepare("SELECT id FROM calendars WHERE home_account_id = ?")
          .all(accountId)
          .map((row) => readStringProperty(row, "id"));

        for (const calendarId of calendarIds) {
          this.db
            .prepare(String.raw`DELETE FROM reminder_state WHERE dedupe_key LIKE ? ESCAPE '\'`)
            .run(`${escapeLikePattern(calendarId)}:%`);
          this.db
            .prepare(String.raw`DELETE FROM notification_state WHERE dedupe_key LIKE ? ESCAPE '\'`)
            .run(`${escapeLikePattern(calendarId)}:%`);
        }
        this.db
          .prepare(
            "DELETE FROM sync_state WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
          )
          .run(accountId);
        this.db
          .prepare(
            "DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
          )
          .run(accountId);
        this.db.prepare("DELETE FROM contacts WHERE home_account_id = ?").run(accountId);
        this.db.prepare("DELETE FROM calendars WHERE home_account_id = ?").run(accountId);
        this.db.prepare("DELETE FROM accounts WHERE home_account_id = ?").run(accountId);
      });

      deleteUserData(homeAccountId);
      return;
    }
    this.db.exec(`
      DELETE FROM reminder_state;
      DELETE FROM notification_state;
      DELETE FROM sync_state;
      DELETE FROM events;
      DELETE FROM contacts;
      DELETE FROM calendars;
      DELETE FROM settings;
      DELETE FROM accounts;
    `);
  }

  saveAccounts(accounts: StoredAccount[]): void {
    const upsert = this.db.prepare(`
      INSERT INTO accounts (
        home_account_id,
        username,
        name,
        tenant_id,
        color,
        last_signed_in_at,
        payload_json
      ) VALUES (
        @home_account_id,
        @username,
        @name,
        @tenant_id,
        @color,
        @last_signed_in_at,
        @payload_json
      )
      ON CONFLICT(home_account_id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        tenant_id = excluded.tenant_id,
        color = excluded.color,
        last_signed_in_at = excluded.last_signed_in_at,
        payload_json = excluded.payload_json
    `);

    const transaction = this.db.transaction((items: StoredAccount[]) => {
      for (const account of items) {
        upsert.run({
          color: account.color,
          home_account_id: account.homeAccountId,
          last_signed_in_at: account.lastSignedInAt,
          name: account.name,
          payload_json: JSON.stringify(account),
          tenant_id: account.tenantId,
          username: account.username,
        });
      }
    });

    transaction(accounts);
  }

  getAccounts(): StoredAccount[] {
    const statement = this.db.prepare(`
      SELECT payload_json
      FROM accounts
      ORDER BY last_signed_in_at DESC
    `);

    return statement
      .all()
      .map((row) => storedAccountSchema.parse(JSON.parse(readStringProperty(row, "payload_json"))));
  }

  removeAccount(homeAccountId: string): void {
    this.db.prepare("DELETE FROM contacts WHERE home_account_id = ?").run(homeAccountId);
    this.db.prepare("DELETE FROM accounts WHERE home_account_id = ?").run(homeAccountId);
  }

  private migrate(): void {
    const hadReminderStateTable = this.hasTable("reminder_state");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        home_account_id TEXT NOT NULL,
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

      CREATE TABLE IF NOT EXISTS contacts (
        home_account_id TEXT NOT NULL,
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL,
        name TEXT,
        normalized_name TEXT NOT NULL,
        search_text TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (home_account_id, normalized_email)
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_search
        ON contacts (home_account_id, normalized_name, normalized_email);

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

      CREATE TABLE IF NOT EXISTS reminder_state (
        dedupe_key TEXT PRIMARY KEY,
        snoozed_until TEXT,
        dismissed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        home_account_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        name TEXT,
        tenant_id TEXT,
        color TEXT NOT NULL,
        last_signed_in_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    this.migrateCalendarsTable();
    this.migrateCalendarsUserColor();
    this.migrateReminderStateTable(hadReminderStateTable);
    this.migrateReminderStateKeyFormat();
  }

  private migrateCalendarsTable(): void {
    const tableInfo = this.db.prepare("PRAGMA table_info(calendars)").all();
    const hasHomeAccountId = tableInfo.some(
      (col: unknown) =>
        typeof col === "object" &&
        col !== null &&
        "name" in col &&
        (col as Record<string, unknown>).name === "home_account_id",
    );
    if (!hasHomeAccountId) {
      this.db.exec("ALTER TABLE calendars ADD COLUMN home_account_id TEXT NOT NULL DEFAULT ''");
    }
  }

  private migrateCalendarsUserColor(): void {
    const tableInfo = this.db.prepare("PRAGMA table_info(calendars)").all();
    const hasUserColor = tableInfo.some(
      (col: unknown) =>
        typeof col === "object" &&
        col !== null &&
        "name" in col &&
        (col as Record<string, unknown>).name === "user_color",
    );
    if (!hasUserColor) {
      this.db.exec("ALTER TABLE calendars ADD COLUMN user_color TEXT");
    }
  }

  private migrateReminderStateTable(hadReminderStateTable: boolean): void {
    if (hadReminderStateTable) {
      return;
    }

    this.db.exec(`
      INSERT OR IGNORE INTO reminder_state (dedupe_key, dismissed_at)
      SELECT dedupe_key || ':pre', fired_at
      FROM notification_state;

      INSERT OR IGNORE INTO reminder_state (dedupe_key, dismissed_at)
      SELECT
        events.calendar_id || ':' || events.id || ':' || events.start_sort || ':pre',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM events
      WHERE events.is_reminder_on = 1
        AND events.reminder_minutes_before_start IS NOT NULL
        AND julianday(events.start_sort) - (events.reminder_minutes_before_start / 1440.0) <
          julianday('now', '-5 minutes')
    `);
  }

  private migrateReminderStateKeyFormat(): void {
    this.db.exec(`
      INSERT OR IGNORE INTO reminder_state (dedupe_key, snoozed_until, dismissed_at)
      SELECT dedupe_key || ':pre', snoozed_until, dismissed_at
      FROM reminder_state
      WHERE dedupe_key NOT LIKE '%:pre' AND dedupe_key NOT LIKE '%:start';

      DELETE FROM reminder_state
      WHERE dedupe_key NOT LIKE '%:pre' AND dedupe_key NOT LIKE '%:start';
    `);
  }

  private hasTable(name: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
    );
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

function readNumberProperty(row: unknown, key: string): number {
  const value = readProperty(row, key);
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }

  throw new Error(`Expected "${key}" to be a number.`);
}

function readCalendarSummary(row: unknown): CalendarSummary {
  const stored = JSON.parse(readStringProperty(row, "payload_json")) as Record<string, unknown>;

  return calendarSummarySchema.parse({
    ...stored,
    canEdit: Boolean(readNumberProperty(row, "can_edit")),
    canShare: Boolean(readNumberProperty(row, "can_share")),
    color: readNullableStringProperty(row, "color"),
    homeAccountId: readStringProperty(row, "home_account_id"),
    id: readStringProperty(row, "id"),
    isDefaultCalendar: Boolean(readNumberProperty(row, "is_default_calendar")),
    name: readStringProperty(row, "name"),
    ownerAddress: readNullableStringProperty(row, "owner_address"),
    ownerName: readNullableStringProperty(row, "owner_name"),
    userColor: readNullableStringProperty(row, "user_color"),
  });
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", String.raw`\\`)
    .replaceAll("%", String.raw`\%`)
    .replaceAll("_", String.raw`\_`);
}

function normalizeContactEmail(value: null | string | undefined): null | string {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeContactName(value: null | string | undefined): null | string {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeContactSearchValue(value: null | string | undefined): string {
  return (
    value
      ?.toLowerCase()
      .replace(/["'<>(),;:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function toSqliteBoolean(value: boolean): 0 | 1 {
  if (value) {
    return 1;
  }

  return 0;
}

export default AppDatabase;
