import { describe, expect, it, vi } from "vitest";

import AppDatabase from "../src/main/db/database";

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
    bodyContentType: "html",
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
