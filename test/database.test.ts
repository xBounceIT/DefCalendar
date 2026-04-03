import { describe, expect, it, vi } from "vitest";

import AppDatabase from "../src/main/db/database";

function createStoredReminderEvent(overrides?: {
  calendarId?: string;
  id?: string;
  reminderMinutesBeforeStart?: number;
  start?: string;
}) {
  return {
    allowNewTimeProposals: null,
    attendees: [],
    attachments: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: overrides?.calendarId ?? "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: "2026-03-30T10:30:00.000Z",
    etag: null,
    hasAttachments: false,
    id: overrides?.id ?? "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: true,
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
    responseStatus: null,
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

  it("returns only the effective synced reminder candidate for each event", () => {
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

    expect(db.listReminderCandidates(["calendar-1"], "2026-03-30T12:00:00.000Z")).toEqual([
      expect.objectContaining({
        dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:pre",
        dismissedAt: null,
        reminderType: "pre",
        snoozedUntil: "2026-03-30T09:50:00.000Z",
      }),
      expect.objectContaining({
        dedupeKey: "calendar-1:event-2:2026-03-30T11:00:00.000Z:start",
        dismissedAt: null,
        reminderType: "start",
        snoozedUntil: "2026-03-30T11:05:00.000Z",
      }),
    ]);

    expect(all).toHaveBeenCalledWith("2026-03-30T12:00:00.000Z", "calendar-1");
  });

  it("searches contacts with normalized attendee input", () => {
    const all = vi.fn().mockReturnValue([
      { email: "john@example.com", name: "Doe, John" },
      { email: "jane@example.com", name: null },
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
      { email: "john@example.com", name: "Doe, John" },
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

      if (sql === "PRAGMA table_info(calendars)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "home_account_id" }]),
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

      if (sql === "PRAGMA table_info(calendars)") {
        return {
          all: vi.fn().mockReturnValue([{ name: "home_account_id" }, { name: "user_color" }]),
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
});
