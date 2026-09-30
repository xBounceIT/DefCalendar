import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AppDatabase from "../src/main/db/database";

function createSqliteDatabase(sqlite: DatabaseSync): AppDatabase {
  sqlite.exec("PRAGMA foreign_keys = ON");
  const db = Object.create(AppDatabase.prototype) as AppDatabase;
  Object.assign(db, {
    db: {
      exec: (sql: string) => sqlite.exec(sql),
      prepare: (sql: string) => sqlite.prepare(sql),
      transaction:
        <T extends unknown[], R>(callback: (...args: T) => R) =>
        (...args: T): R => {
          sqlite.exec("BEGIN");
          try {
            const result = callback(...args);
            sqlite.exec("COMMIT");
            return result;
          } catch (error) {
            sqlite.exec("ROLLBACK");
            throw error;
          }
        },
    },
  });
  (db as unknown as { migrate: () => void }).migrate();
  return db;
}

function seedReminderCalendar(
  sqlite: DatabaseSync,
  id = "calendar-1",
  account = "account-1",
): void {
  sqlite
    .prepare(`
    INSERT INTO calendars (id, home_account_id, name, can_edit, can_share, is_default_calendar,
      payload_json, updated_at) VALUES (?, ?, 'Calendar', 1, 0, 1, '{}', '2026-09-30')
  `)
    .run(id, account);
}

function createStoredReminderEvent(overrides?: {
  calendarId?: string;
  cancelled?: boolean;
  id?: string;
  isOrganizer?: boolean;
  reminderMinutesBeforeStart?: number;
  responseStatus?: null | { response: null | string; time: null | string };
  start?: string;
}) {
  return {
    allowNewTimeProposals: null,
    attendees: [],
    attachments: [],
    body: null,
    bodyContentType: "html" as const,
    bodyPreview: null,
    calendarId: overrides?.calendarId ?? "calendar-1",
    cancelled: overrides?.cancelled ?? false,
    categories: [],
    changeKey: null,
    end: "2026-03-30T10:30:00.000Z",
    etag: null,
    hasAttachments: false,
    id: overrides?.id ?? "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: overrides?.isOrganizer ?? true,
    isReminderOn: true,
    lastModifiedDateTime: null,
    location: "Room 3",
    locations: [],
    occurrenceId: null,
    onlineMeeting: null,
    organizer: null,
    recurrence: null,
    reminderMinutesBeforeStart: overrides?.reminderMinutesBeforeStart ?? 15,
    responseRequested: null,
    responseStatus: overrides?.responseStatus ?? null,
    seriesMasterId: null,
    start: overrides?.start ?? "2026-03-30T10:00:00.000Z",
    subject: "Planning",
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
  };
}

describe("database", () => {
  it("preserves local dismissals and snoozes, repairs corrupted keys, and migrates legacy keys once", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = createSqliteDatabase(sqlite);
      const base = "calendar-1:event-1:2026-09-30T10:00:00.000Z";
      const insert = sqlite.prepare("INSERT INTO reminder_state VALUES (?, ?, ?)");
      insert.run(`${base}:before:15`, null, "dismissed");
      insert.run(`${base}:after:10`, "snoozed", null);
      insert.run(`${base}:before:30:pre`, null, "recovered-dismissal");
      insert.run(`${base}:after:20:pre`, "recovered-snooze", null);
      insert.run(`${base}:before:45:pre`, null, "old-dismissal");
      insert.run(`${base}:before:45`, "new-snooze", null);
      insert.run(base, null, "legacy-dismissal");
      insert.run(`${base}:start`, null, "start-dismissal");
      for (let index = 0; index < 2; index += 1) {
        (db as unknown as { migrate: () => void }).migrate();
      }
      expect(db.getReminderState(`${base}:before:15`)).toEqual({
        dismissedAt: "dismissed",
        snoozedUntil: null,
      });
      expect(db.getReminderState(`${base}:after:10`)).toEqual({
        dismissedAt: null,
        snoozedUntil: "snoozed",
      });
      expect(db.getReminderState(`${base}:before:30`)).toEqual({
        dismissedAt: "recovered-dismissal",
        snoozedUntil: null,
      });
      expect(db.getReminderState(`${base}:after:20`)).toEqual({
        dismissedAt: null,
        snoozedUntil: "recovered-snooze",
      });
      expect(db.getReminderState(`${base}:pre`)).toEqual({
        dismissedAt: "legacy-dismissal",
        snoozedUntil: null,
      });
      expect(db.getReminderState(`${base}:start`)).toEqual({
        dismissedAt: "start-dismissal",
        snoozedUntil: null,
      });
      expect(db.getReminderState(`${base}:before:45`)).toEqual({
        dismissedAt: null,
        snoozedUntil: "new-snooze",
      });
      expect(sqlite.prepare("SELECT * FROM reminder_state").all()).toHaveLength(7);
    } finally {
      sqlite.close();
    }
  });

  it("persists deduplicated remote dismissals across database reopen and retains them during event refresh", () => {
    const directory = mkdtempSync(join(tmpdir(), "defcalendar-reminder-"));
    const path = join(directory, "calendar.sqlite");
    let sqlite = new DatabaseSync(path);
    try {
      let db = createSqliteDatabase(sqlite);
      seedReminderCalendar(sqlite);
      const event = createStoredReminderEvent();
      db.upsertEvent(event);
      const item = { calendarId: event.calendarId, eventId: event.id, start: event.start };
      const pre = `${item.calendarId}:${item.eventId}:${item.start}:pre`;
      const start = `${item.calendarId}:${item.eventId}:${item.start}:start`;
      db.dismissReminders([pre, start], [item, item]);
      db.replaceEventsForCalendarRange({
        calendarId: event.calendarId,
        events: [event],
        rangeStart: "2026-03-01T00:00:00Z",
        rangeEnd: "2026-04-01T00:00:00Z",
      });
      sqlite.close();
      sqlite = new DatabaseSync(path);
      db = createSqliteDatabase(sqlite);
      expect(db.listPendingReminderDismissals()).toEqual([item]);
      expect(db.getReminderState(pre)?.dismissedAt).toBeTruthy();
      expect(db.getReminderState(start)?.dismissedAt).toBeTruthy();
      db.completeReminderDismissal(item);
      expect(db.listPendingReminderDismissals()).toEqual([]);
      expect(db.getReminderState(pre)?.dismissedAt).toBeTruthy();
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("atomically queues dismissals and removes only the signed-out account's pending operations", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = createSqliteDatabase(sqlite);
      seedReminderCalendar(sqlite);
      seedReminderCalendar(sqlite, "calendar-2", "account-2");
      const item = { calendarId: "calendar-1", eventId: "event-1", start: "2026-09-30T10:00:00Z" };
      expect(() =>
        db.dismissReminders(["invalid-key"], [{ ...item, calendarId: "missing" }]),
      ).toThrow();
      expect(db.getReminderState("invalid-key")).toBeNull();
      const other = { ...item, calendarId: "calendar-2" };
      db.dismissReminders(["key-1", "key-2"], [item, other]);
      db.clearUserData("account-1");
      expect(db.listPendingReminderDismissals()).toEqual([other]);
      db.clearUserData();
      expect(db.listPendingReminderDismissals()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates saved contacts and browses the entire account rubrica with photo ids", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE contacts (
          home_account_id TEXT NOT NULL, email TEXT NOT NULL, normalized_email TEXT NOT NULL,
          name TEXT, normalized_name TEXT NOT NULL, search_text TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (home_account_id, normalized_email)
        )
      `);
      const db = Object.create(AppDatabase.prototype) as AppDatabase;
      Object.assign(db, {
        db: {
          exec: (sql: string) => sqlite.exec(sql),
          prepare: (sql: string) => sqlite.prepare(sql),
          transaction: (callback: (...args: unknown[]) => unknown) => callback,
        },
      });
      (db as unknown as { migrate: () => void }).migrate();
      const contacts = Array.from({ length: 30 }, (_, index) => ({
        contactId: `contact-${index}`,
        email: `person${index}@example.com`,
        name: `Person ${String(index).padStart(2, "0")}`,
      }));
      db.replaceContactsForAccount(contacts.toReversed(), "account-1");
      db.replaceContactsForAccount([{ email: "other@example.com", name: "Other" }], "account-2");
      expect(db.getContactByEmail("account-1", " PERSON29@EXAMPLE.COM ")).toEqual(contacts[29]);
      expect(db.getContactByEmail("account-2", contacts[29].email)).toBeNull();
      expect(db.getContactByEmail("account-1", "person29@example.co")).toBeNull();
      expect(db.searchContacts({ homeAccountId: "account-1", query: "", limit: null })).toEqual(
        contacts,
      );
      expect(
        db.searchContacts({ homeAccountId: "account-1", query: "person 29", limit: null }),
      ).toEqual([contacts[29]]);
      expect(db.searchContacts({ homeAccountId: "account-2", query: "", limit: null })).toEqual([
        { email: "other@example.com", name: "Other" },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("clears only the signed-out account data with parameterized statements", () => {
    const targetAccountId = "account-1'; DELETE FROM settings; --";
    const exec = vi.fn();
    const runs = new Map<string, ReturnType<typeof vi.fn>>();
    const alls = new Map<string, ReturnType<typeof vi.fn>>();
    const prepare = vi.fn((sql: string) => {
      const run = vi.fn();
      const all = vi.fn();
      if (sql === "SELECT id FROM calendars WHERE home_account_id = ?") {
        all.mockReturnValue([{ id: "calendar-%_1" }]);
      }
      runs.set(sql, run);
      alls.set(sql, all);
      return { all, run };
    });
    const transaction = vi.fn((execute: (accountId: string) => void) => execute);

    const db = Object.create(AppDatabase.prototype) as AppDatabase;

    (
      db as unknown as {
        db: {
          exec: typeof exec;
          prepare: typeof prepare;
          transaction: typeof transaction;
        };
      }
    ).db = {
      exec,
      prepare,
      transaction,
    };

    db.clearUserData(targetAccountId);

    expect(exec).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledOnce();

    const preparedSql = prepare.mock.calls.map(([sql]) => sql);
    expect(preparedSql).toStrictEqual([
      "SELECT id FROM calendars WHERE home_account_id = ?",
      String.raw`DELETE FROM reminder_state WHERE dedupe_key LIKE ? ESCAPE '\'`,
      String.raw`DELETE FROM notification_state WHERE dedupe_key LIKE ? ESCAPE '\'`,
      "DELETE FROM sync_state WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM calendar_sync_ranges WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM contacts WHERE home_account_id = ?",
      "DELETE FROM calendars WHERE home_account_id = ?",
      "DELETE FROM accounts WHERE home_account_id = ?",
    ]);
    expect(preparedSql.filter((sql) => sql.includes(targetAccountId))).toHaveLength(0);
    expect(alls.get("SELECT id FROM calendars WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
    expect(
      runs.get(String.raw`DELETE FROM reminder_state WHERE dedupe_key LIKE ? ESCAPE '\'`),
    ).toHaveBeenCalledWith(String.raw`calendar-\%\_1:%`);
    expect(
      runs.get(String.raw`DELETE FROM notification_state WHERE dedupe_key LIKE ? ESCAPE '\'`),
    ).toHaveBeenCalledWith(String.raw`calendar-\%\_1:%`);
    expect(
      runs.get(
        "DELETE FROM sync_state WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      ),
    ).toHaveBeenCalledWith(targetAccountId);
    expect(
      runs.get(
        "DELETE FROM calendar_sync_ranges WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      ),
    ).toHaveBeenCalledWith(targetAccountId);
    expect(
      runs.get(
        "DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      ),
    ).toHaveBeenCalledWith(targetAccountId);
    expect(runs.get("DELETE FROM contacts WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
    expect(runs.get("DELETE FROM calendars WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
    expect(runs.get("DELETE FROM accounts WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
  });

  it("reads calendar ownership from database columns for legacy payloads", () => {
    const prepare = vi.fn((sql: string) => {
      if (!sql.includes("FROM calendars")) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }

      return {
        all: vi.fn().mockReturnValue([
          {
            can_edit: 1,
            can_share: 0,
            color: "#5b7cfa",
            home_account_id: "account-1",
            id: "calendar-1",
            is_default_calendar: 1,
            name: "Primary",
            owner_address: "user@example.com",
            owner_name: "Test User",
            user_color: null,
            payload_json: JSON.stringify({
              canEdit: true,
              canShare: false,
              color: "#5b7cfa",
              id: "calendar-1",
              isDefaultCalendar: true,
              isVisible: true,
              name: "Primary",
              ownerAddress: "user@example.com",
              ownerName: "Test User",
            }),
          },
        ]),
      };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(db.listCalendars()).toStrictEqual([
      {
        canEdit: true,
        canShare: false,
        color: "#5b7cfa",
        homeAccountId: "account-1",
        id: "calendar-1",
        isDefaultCalendar: true,
        isVisible: true,
        name: "Primary",
        ownerAddress: "user@example.com",
        ownerName: "Test User",
        userColor: null,
      },
    ]);
  });

  it("detects calendar sync range coverage across adjacent rows", () => {
    expect.hasAssertions();
    const all = vi.fn().mockReturnValue([
      {
        range_end: "2026-11-10T00:00:00.000Z",
        range_start: "2026-11-01T00:00:00.000Z",
      },
      {
        range_end: "2026-11-30T23:00:00.000Z",
        range_start: "2026-11-10T00:00:00.000Z",
      },
    ]);
    const prepare = vi.fn(() => ({ all }));
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.isCalendarSyncRangeCovered(
        "calendar-1",
        "2026-11-01T00:00:00.000Z",
        "2026-11-30T23:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("rejects calendar sync range coverage when there is a gap", () => {
    expect.hasAssertions();
    const all = vi.fn().mockReturnValue([
      {
        range_end: "2026-11-10T00:00:00.000Z",
        range_start: "2026-11-01T00:00:00.000Z",
      },
      {
        range_end: "2026-11-30T23:00:00.000Z",
        range_start: "2026-11-11T00:00:00.000Z",
      },
    ]);
    const prepare = vi.fn(() => ({ all }));
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.isCalendarSyncRangeCovered(
        "calendar-1",
        "2026-11-01T00:00:00.000Z",
        "2026-11-30T23:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("returns missing calendar sync ranges between covered rows", () => {
    expect.hasAssertions();
    const all = vi.fn().mockReturnValue([
      {
        range_end: "2026-11-10T00:00:00.000Z",
        range_start: "2026-11-01T00:00:00.000Z",
      },
      {
        range_end: "2026-11-30T23:00:00.000Z",
        range_start: "2026-11-20T00:00:00.000Z",
      },
    ]);
    const prepare = vi.fn(() => ({ all }));
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.listUncoveredCalendarSyncRanges(
        "calendar-1",
        "2026-11-01T00:00:00.000Z",
        "2026-11-30T23:00:00.000Z",
      ),
    ).toStrictEqual([
      {
        rangeEnd: "2026-11-20T00:00:00.000Z",
        rangeStart: "2026-11-10T00:00:00.000Z",
      },
    ]);
  });

  it("ignores stale calendar sync range rows when a freshness cutoff is provided", () => {
    expect.hasAssertions();
    const all = vi.fn().mockReturnValue([]);
    const prepare = vi.fn(() => ({ all }));
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    const result = db.listUncoveredCalendarSyncRanges(
      "calendar-1",
      "2026-11-01T00:00:00.000Z",
      "2026-11-30T23:00:00.000Z",
      "2026-07-01T12:00:00.000Z",
    );

    expect(prepare.mock.calls[0]?.[0]).toContain("last_synced_at >= ?");
    expect(all).toHaveBeenCalledWith(
      "calendar-1",
      "2026-11-01T00:00:00.000Z",
      "2026-11-30T23:00:00.000Z",
      "2026-07-01T12:00:00.000Z",
    );
    expect(result).toStrictEqual([
      {
        rangeEnd: "2026-11-30T23:00:00.000Z",
        rangeStart: "2026-11-01T00:00:00.000Z",
      },
    ]);
  });

  it("replaces overlapping calendar sync range coverage before recording fetched range", () => {
    expect.hasAssertions();
    const deleteRun = vi.fn();
    const insertRun = vi.fn();
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("DELETE FROM calendar_sync_ranges")) {
        return { run: deleteRun };
      }

      if (sql.includes("INSERT INTO calendar_sync_ranges")) {
        return { run: insertRun };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const transaction = vi.fn((execute: () => void) => execute);
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare; transaction: typeof transaction } }).db = {
      prepare,
      transaction,
    };

    db.recordCalendarSyncRange({
      calendarId: "calendar-1",
      rangeEnd: "2026-11-30T23:00:00.000Z",
      rangeStart: "2026-11-05T00:00:00.000Z",
      syncedAt: "2026-07-02T12:00:00.000Z",
    });

    expect(deleteRun).toHaveBeenCalledWith(
      "calendar-1",
      "2026-11-05T00:00:00.000Z",
      "2026-11-30T23:00:00.000Z",
    );
    expect(insertRun).toHaveBeenCalledWith(
      "calendar-1",
      "2026-11-05T00:00:00.000Z",
      "2026-11-30T23:00:00.000Z",
      "2026-07-02T12:00:00.000Z",
    );
  });

  it("preserves unfetched coverage portions when requested", () => {
    expect.hasAssertions();
    const all = vi.fn().mockReturnValue([
      {
        last_synced_at: "2026-07-01T12:00:00.000Z",
        range_end: "2026-11-10T00:00:00.000Z",
        range_start: "2026-11-01T00:00:00.000Z",
      },
      {
        last_synced_at: "2026-06-30T12:00:00.000Z",
        range_end: "2026-12-15T00:00:00.000Z",
        range_start: "2026-11-25T00:00:00.000Z",
      },
    ]);
    const deleteRun = vi.fn();
    const insertRun = vi.fn();
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT range_start, range_end")) {
        return { all };
      }

      if (sql.includes("DELETE FROM calendar_sync_ranges")) {
        return { run: deleteRun };
      }

      if (sql.includes("INSERT INTO calendar_sync_ranges")) {
        return { run: insertRun };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const transaction = vi.fn((execute: () => void) => execute);
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare; transaction: typeof transaction } }).db = {
      prepare,
      transaction,
    };

    db.recordCalendarSyncRange({
      calendarId: "calendar-1",
      preserveOverlappingCoverage: true,
      rangeEnd: "2026-11-30T23:00:00.000Z",
      rangeStart: "2026-11-05T00:00:00.000Z",
      syncedAt: "2026-07-02T12:00:00.000Z",
    });

    expect(deleteRun).toHaveBeenCalledWith(
      "calendar-1",
      "2026-11-05T00:00:00.000Z",
      "2026-11-30T23:00:00.000Z",
    );
    expect(insertRun.mock.calls).toStrictEqual([
      [
        "calendar-1",
        "2026-11-01T00:00:00.000Z",
        "2026-11-05T00:00:00.000Z",
        "2026-07-01T12:00:00.000Z",
      ],
      [
        "calendar-1",
        "2026-11-30T23:00:00.000Z",
        "2026-12-15T00:00:00.000Z",
        "2026-06-30T12:00:00.000Z",
      ],
      [
        "calendar-1",
        "2026-11-05T00:00:00.000Z",
        "2026-11-30T23:00:00.000Z",
        "2026-07-02T12:00:00.000Z",
      ],
    ]);
  });

  it("returns pre and start candidates for events with reminderMinutesBeforeStart > 0", () => {
    const all = vi.fn().mockReturnValue([
      {
        base_key: "calendar-1:event-1:2026-03-30T10:00:00.000Z",
        dismissed_at_pre: null,
        dismissed_at_start: "2026-03-30T10:00:00.000Z",
        payload_json: JSON.stringify(createStoredReminderEvent()),
        snoozed_until_pre: "2026-03-30T09:50:00.000Z",
        snoozed_until_start: null,
      },
      {
        base_key: "calendar-1:event-2:2026-03-30T11:00:00.000Z",
        dismissed_at_pre: "2026-03-30T11:00:00.000Z",
        dismissed_at_start: null,
        payload_json: JSON.stringify(
          createStoredReminderEvent({
            id: "event-2",
            reminderMinutesBeforeStart: 0,
            start: "2026-03-30T11:00:00.000Z",
          }),
        ),
        snoozed_until_pre: null,
        snoozed_until_start: "2026-03-30T11:05:00.000Z",
      },
    ]);
    const prepare = vi.fn(() => ({ all }));

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.listReminderCandidates(
        ["calendar-1"],
        "2026-03-28T12:00:00.000Z",
        "2026-03-30T12:00:00.000Z",
      ),
    ).toStrictEqual([
      expect.objectContaining({
        dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:pre",
        dismissedAt: null,
        reminderType: "pre",
        snoozedUntil: "2026-03-30T09:50:00.000Z",
      }),
      expect.objectContaining({
        dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:start",
        dismissedAt: "2026-03-30T10:00:00.000Z",
        reminderType: "start",
        snoozedUntil: null,
      }),
      expect.objectContaining({
        dedupeKey: "calendar-1:event-2:2026-03-30T11:00:00.000Z:start",
        dismissedAt: null,
        reminderType: "start",
        snoozedUntil: "2026-03-30T11:05:00.000Z",
      }),
    ]);

    expect(all).toHaveBeenCalledWith(
      "2026-03-28T12:00:00.000Z",
      "2026-03-30T12:00:00.000Z",
      "calendar-1",
    );
  });

  it("excludes cancelled events from reminder candidates", () => {
    const all = vi.fn().mockReturnValue([
      {
        base_key: "calendar-1:event-1:2026-03-30T10:00:00.000Z",
        dismissed_at_pre: null,
        dismissed_at_start: null,
        payload_json: JSON.stringify(createStoredReminderEvent({ cancelled: true })),
        snoozed_until_pre: null,
        snoozed_until_start: null,
      },
    ]);
    const prepare = vi.fn(() => ({ all }));

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.listReminderCandidates(
        ["calendar-1"],
        "2026-03-28T12:00:00.000Z",
        "2026-03-30T12:00:00.000Z",
      ),
    ).toStrictEqual([]);
  });

  it("excludes declined events from reminder candidates", () => {
    const all = vi.fn().mockReturnValue([
      {
        base_key: "calendar-1:event-1:2026-03-30T10:00:00.000Z",
        dismissed_at_pre: null,
        dismissed_at_start: null,
        payload_json: JSON.stringify(
          createStoredReminderEvent({
            isOrganizer: false,
            responseStatus: { response: "declined", time: "2026-03-29T09:00:00.000Z" },
          }),
        ),
        snoozed_until_pre: null,
        snoozed_until_start: null,
      },
    ]);
    const prepare = vi.fn(() => ({ all }));

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.listReminderCandidates(
        ["calendar-1"],
        "2026-03-28T12:00:00.000Z",
        "2026-03-30T12:00:00.000Z",
      ),
    ).toStrictEqual([]);
  });

  it("excludes cancelled events from listReminderEventsByStartRange", () => {
    const all = vi.fn().mockReturnValue([
      {
        payload_json: JSON.stringify(createStoredReminderEvent({ id: "event-1" })),
      },
      {
        payload_json: JSON.stringify(createStoredReminderEvent({ cancelled: true, id: "event-2" })),
      },
    ]);
    const prepare = vi.fn(() => ({ all }));

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    const results = db.listReminderEventsByStartRange(
      ["calendar-1"],
      "2026-03-28T12:00:00.000Z",
      "2026-03-30T12:00:00.000Z",
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("event-1");
  });

  it("excludes declined events from listReminderEventsByStartRange", () => {
    const all = vi.fn().mockReturnValue([
      {
        payload_json: JSON.stringify(createStoredReminderEvent({ id: "event-1" })),
      },
      {
        payload_json: JSON.stringify(
          createStoredReminderEvent({
            id: "event-2",
            isOrganizer: false,
            responseStatus: { response: "declined", time: "2026-03-29T09:00:00.000Z" },
          }),
        ),
      },
    ]);
    const prepare = vi.fn(() => ({ all }));

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    const results = db.listReminderEventsByStartRange(
      ["calendar-1"],
      "2026-03-28T12:00:00.000Z",
      "2026-03-30T12:00:00.000Z",
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("event-1");
  });

  it("prunes dismissed rows and stale snoozed-only rows past retention", () => {
    const run = vi.fn();
    let capturedSql = "";
    const prepare = vi.fn((sql: string) => {
      capturedSql = sql;
      return { run };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    db.pruneReminderState("2026-03-01T00:00:00.000Z");

    const normalizedSql = capturedSql.replace(/\s+/g, " ").trim();
    expect(normalizedSql).toContain("DELETE FROM reminder_state");
    expect(normalizedSql).toContain("dismissed_at IS NOT NULL AND dismissed_at < ?");
    expect(normalizedSql).toContain(
      "dismissed_at IS NULL AND snoozed_until IS NOT NULL AND snoozed_until < ?",
    );
    expect(run).toHaveBeenCalledWith("2026-03-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z");
  });

  it("preserves only invite delivery markers that still belong to pending future events", () => {
    expect.hasAssertions();
    const run = vi.fn();
    let capturedSql = "";
    const prepare = vi.fn((sql: string) => {
      capturedSql = sql;
      return { run };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    db.pruneNotificationState("2026-03-01T00:00:00.000Z", "2026-03-30T09:30:00.000Z");

    const normalizedSql = capturedSql.replace(/\s+/g, " ").trim();
    expect(normalizedSql).toContain("dedupe_key NOT LIKE '%:invite'");
    expect(normalizedSql).toContain("OR NOT EXISTS ( SELECT 1 FROM events");
    expect(normalizedSql).toContain(
      "notification_state.dedupe_key = events.calendar_id || ':' || events.id || ':invite'",
    );
    expect(
      [
        "json_extract(events.payload_json, '$.cancelled')",
        "json_extract(events.payload_json, '$.isOrganizer')",
        "COALESCE(json_extract(",
        "IN ('', 'none', 'notresponded', 'organizer')",
        "julianday(events.start_sort) > julianday(?)",
      ].every((fragment) => normalizedSql.includes(fragment)),
    ).toBe(true);
    expect(run).toHaveBeenCalledWith("2026-03-01T00:00:00.000Z", "2026-03-30T09:30:00.000Z");
  });

  it("searches events across scoped fields with parameterized SQL", () => {
    const matchedEvent = createStoredReminderEvent({
      calendarId: "calendar-1",
      id: "event-1",
    });
    const all = vi
      .fn()
      .mockReturnValue([{ payload_json: JSON.stringify(matchedEvent), sort_rank: 0 }]);
    let capturedSql = "";
    const prepare = vi.fn((sql: string) => {
      capturedSql = sql;
      return { all };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    const results = db.searchEvents({
      calendarIds: ["calendar-1", "calendar-2"],
      limit: 30,
      query: "Plan%_ning",
      sort: "relevance",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("event-1");

    expect(capturedSql).toContain("LOWER(subject) LIKE @contains");
    expect(capturedSql).toContain("json_extract(payload_json, '$.bodyPreview')");
    expect(capturedSql).toContain("json_extract(payload_json, '$.location')");
    expect(capturedSql).toContain("json_extract(payload_json, '$.categories')");
    expect(capturedSql).toContain("json_each(IFNULL(json_extract(payload_json, '$.attendees')");
    expect(capturedSql).toContain("calendar_id IN (@calendar_0, @calendar_1)");
    expect(capturedSql).toContain("ORDER BY sort_rank, start_sort DESC");
    expect(capturedSql).toContain("LIMIT @limit");

    expect(all).toHaveBeenCalledWith({
      calendar_0: "calendar-1",
      calendar_1: "calendar-2",
      contains: String.raw`%plan\%\_ning%`,
      limit: 30,
      prefix: String.raw`plan\%\_ning%`,
    });
  });

  it("returns no results when search query normalizes to empty", () => {
    const prepare = vi.fn();
    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    const results = db.searchEvents({
      calendarIds: ["calendar-1"],
      limit: 30,
      query: '",;:()',
      sort: "recent",
    });

    expect(results).toStrictEqual([]);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("searches events without a calendar filter when omitted", () => {
    const all = vi.fn().mockReturnValue([]);
    let capturedSql = "";
    const prepare = vi.fn((sql: string) => {
      capturedSql = sql;
      return { all };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    db.searchEvents({ limit: 10, query: "weekly", sort: "recent" });

    expect(capturedSql).not.toContain("calendar_id IN");
    expect(capturedSql).toContain("ORDER BY start_sort DESC");
    expect(all).toHaveBeenCalledWith({
      contains: "%weekly%",
      limit: 10,
      prefix: "weekly%",
    });
  });

  it("orders search results oldest-first when requested", () => {
    const all = vi.fn().mockReturnValue([]);
    let capturedSql = "";
    const prepare = vi.fn((sql: string) => {
      capturedSql = sql;
      return { all };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    db.searchEvents({ limit: 10, query: "weekly", sort: "oldest" });

    expect(capturedSql).toContain("ORDER BY start_sort ASC");
  });

  it("searches contacts with normalized attendee input", () => {
    const all = vi.fn().mockReturnValue([
      { contact_id: "contact-1", email: "john@example.com", name: "Doe, John" },
      { contact_id: null, email: "jane@example.com", name: null },
    ]);
    const prepare = vi.fn((sql: string) => {
      if (!sql.includes("FROM contacts")) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }

      return { all };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(
      db.searchContacts({
        homeAccountId: "account-1",
        limit: 5,
        query: '"Doe, Jo" <jo',
      }),
    ).toStrictEqual([
      { contactId: "contact-1", email: "john@example.com", name: "Doe, John" },
      { email: "jane@example.com", name: null },
    ]);
    expect(all).toHaveBeenCalledWith({
      contains: "%doe jo jo%",
      exact: "doe jo jo",
      home_account_id: "account-1",
      limit: 5,
      prefix: "doe jo jo%",
    });
  });

  it("backfills past-due reminders when reminder_state is created during migration", () => {
    const exec = vi.fn();
    const prepare = vi.fn((sql: string) => {
      if (sql === "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") {
        return {
          get: vi.fn().mockReturnValue(undefined),
        };
      }

      if (sql === "PRAGMA table_info(contacts)") {
        return { all: vi.fn().mockReturnValue([{ name: "contact_id" }]) };
      }

      if (sql === "PRAGMA table_info(calendars)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "home_account_id" }]),
        };
      }

      if (sql === "PRAGMA table_info(sync_state)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "deep_backfill_completed_at" }]),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { exec: typeof exec; prepare: typeof prepare } }).db = {
      exec,
      prepare,
    };

    (db as unknown as { migrate: () => void }).migrate();

    expect(exec).toHaveBeenCalledTimes(4);
    expect(exec.mock.calls[1]?.[0]).toContain("ALTER TABLE calendars ADD COLUMN user_color");
    expect(exec.mock.calls[2]?.[0]).toContain("FROM notification_state");
    expect(exec.mock.calls[2]?.[0]).toContain("FROM events");
    expect(exec.mock.calls[2]?.[0]).toContain("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    expect(exec.mock.calls[2]?.[0]).toContain("julianday('now', '-5 minutes')");
    expect(exec.mock.calls[3]?.[0]).toContain(":pre");
  });

  it("skips reminder backfill after reminder_state already exists", () => {
    const exec = vi.fn();
    const prepare = vi.fn((sql: string) => {
      if (sql === "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") {
        return {
          get: vi.fn().mockReturnValue({ 1: 1 }),
        };
      }

      if (sql === "PRAGMA table_info(contacts)") {
        return { all: vi.fn().mockReturnValue([{ name: "contact_id" }]) };
      }

      if (sql === "PRAGMA table_info(calendars)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "home_account_id" }, { name: "user_color" }]),
        };
      }

      if (sql === "PRAGMA table_info(sync_state)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "deep_backfill_completed_at" }]),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { exec: typeof exec; prepare: typeof prepare } }).db = {
      exec,
      prepare,
    };

    (db as unknown as { migrate: () => void }).migrate();

    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("adds the deep_backfill_completed_at column when migrating an older sync_state table", () => {
    const exec = vi.fn();
    const prepare = vi.fn((sql: string) => {
      if (sql === "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") {
        return {
          get: vi.fn().mockReturnValue({ 1: 1 }),
        };
      }

      if (sql === "PRAGMA table_info(contacts)") {
        return { all: vi.fn().mockReturnValue([{ name: "contact_id" }]) };
      }

      if (sql === "PRAGMA table_info(calendars)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "home_account_id" }, { name: "user_color" }]),
        };
      }

      if (sql === "PRAGMA table_info(sync_state)") {
        return {
          all: vi
            .fn()
            .mockReturnValue([
              { name: "calendar_id" },
              { name: "last_synced_at" },
              { name: "range_start" },
              { name: "range_end" },
              { name: "error_message" },
            ]),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { exec: typeof exec; prepare: typeof prepare } }).db = {
      exec,
      prepare,
    };

    (db as unknown as { migrate: () => void }).migrate();

    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls[2]?.[0]).toContain(
      "ALTER TABLE sync_state ADD COLUMN deep_backfill_completed_at TEXT",
    );
  });

  it("sanitizes legacy events with recurrence month=0 / numberOfOccurrences=0 on read", () => {
    const corruptedEvent = {
      ...createStoredReminderEvent(),
      recurrence: {
        pattern: {
          dayOfMonth: 10,
          daysOfWeek: [],
          firstDayOfWeek: "monday",
          index: null,
          interval: 1,
          month: 0,
          type: "absoluteMonthly",
        },
        range: {
          endDate: null,
          numberOfOccurrences: 0,
          recurrenceTimeZone: null,
          startDate: "2026-03-10",
          type: "noEnd",
        },
      },
    };
    const all = vi.fn().mockReturnValue([{ payload_json: JSON.stringify(corruptedEvent) }]);
    const prepare = vi.fn(() => ({ all }));

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    const events = db.listEvents({
      end: "2026-03-30T23:59:59.000Z",
      start: "2026-03-01T00:00:00.000Z",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.recurrence?.pattern.month).toBeNull();
    expect(events[0]?.recurrence?.pattern.dayOfMonth).toBe(10);
    expect(events[0]?.recurrence?.range.numberOfOccurrences).toBeNull();
  });
});
