import { describe, expect, it, onTestFinished, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AppDatabase from "../src/main/db/database";
import NewEventNotificationService from "../src/main/notifications/new-event-notification-service";

function createSqliteDatabase(sqlite: DatabaseSync): AppDatabase {
  let transactionId = 0;
  sqlite.exec("PRAGMA foreign_keys = ON");
  const db = Object.create(AppDatabase.prototype) as AppDatabase;
  Object.assign(db, {
    db: {
      exec: (sql: string) => sqlite.exec(sql),
      prepare: (sql: string) => sqlite.prepare(sql),
      transaction:
        <T extends unknown[], R>(callback: (...args: T) => R) =>
        (...args: T): R => {
          const savepoint = `test_transaction_${transactionId++}`;
          sqlite.exec(`SAVEPOINT ${savepoint}`);
          try {
            const result = callback(...args);
            sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
            return result;
          } catch (error) {
            sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
            throw error;
          }
        },
    },
  });
  (db as unknown as { migrate: () => void }).migrate();
  return db;
}

function createDatabaseFixture() {
  const sqlite = new DatabaseSync(":memory:");
  onTestFinished(() => sqlite.close());
  return { db: createSqliteDatabase(sqlite), sqlite };
}

function seedReminderCalendar(
  sqlite: DatabaseSync,
  id = "calendar-1",
  account = "account-1",
): void {
  sqlite
    .prepare(`
    INSERT INTO calendars (id, home_account_id, name, can_edit, can_share, is_default_calendar,
      payload_json, updated_at) VALUES (?, ?, 'Calendar', 1, 0, 1, '{"isVisible":true}', '2026-09-30')
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
  it("rolls back an explicit deletion if the pending queue cannot be persisted", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = createSqliteDatabase(sqlite);
      seedReminderCalendar(sqlite);
      const event = createStoredReminderEvent({ isOrganizer: false });
      db.upsertEvent(event);
      const notifications = new NewEventNotificationService(
        () => Date.parse("2026-03-30T09:00:00.000Z"),
        db,
      );
      notifications.recordCandidates([event]);
      const saved = notifications.getItems();
      vi.spyOn(db, "savePendingInvites").mockImplementationOnce(() => {
        throw new Error("disk full");
      });
      expect(() =>
        notifications.dismiss(saved[0], () => db.deleteEvent(event.calendarId, event.id)),
      ).toThrow("disk full");
      expect(db.getEvent(event.calendarId, event.id)).not.toBeNull();
      expect(db.listPendingInvites()).toEqual(saved);
      expect(notifications.getItems()).toEqual(saved);
    } finally {
      sqlite.close();
    }
  });
  it("commits cache and pending notices together and publishes nothing after a failed transaction", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = createSqliteDatabase(sqlite);
      seedReminderCalendar(sqlite);
      const previous = createStoredReminderEvent({
        isOrganizer: false,
        responseStatus: { response: "accepted", time: null },
      });
      const updated = { ...previous, subject: "Updated subject" };
      db.upsertEvent(previous);
      const service = new NewEventNotificationService(
        () => Date.parse("2026-03-30T09:00:00.000Z"),
        db,
      );
      const listener = vi.fn();
      service.onChange(listener);
      const save = vi.spyOn(db, "savePendingInvites").mockImplementationOnce(() => {
        throw new Error("disk full");
      });
      expect(() =>
        service.reconcile([updated], [previous], true, () => db.upsertEvent(updated)),
      ).toThrow("disk full");
      expect(db.getEvent(previous.calendarId, previous.id)?.subject).toBe(previous.subject);
      expect(service.getItems()).toEqual([]);
      expect(db.listPendingInvites()).toEqual([]);
      expect(listener).not.toHaveBeenCalled();
      save.mockRestore();
      service.reconcile([updated], [previous], true, () => db.upsertEvent(updated));
      expect(db.getEvent(previous.calendarId, previous.id)?.subject).toBe("Updated subject");
      expect(db.listPendingInvites()).toEqual(service.getItems());
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      sqlite.close();
    }
  });
  it("persists closed invitations independently of reminders and removes only a signed-out account", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = createSqliteDatabase(sqlite);
      seedReminderCalendar(sqlite);
      seedReminderCalendar(sqlite, "calendar-2", "account-2");
      const now = () => Date.parse("2026-03-30T09:00:00.000Z");
      const service = new NewEventNotificationService(now, db);
      service.recordCandidates([
        createStoredReminderEvent({ isOrganizer: false }),
        createStoredReminderEvent({ calendarId: "calendar-2", isOrganizer: false }),
      ]);
      service.hideAll();
      const listener = vi.fn();
      service.onChange(listener);
      service.reload();
      expect(listener).not.toHaveBeenCalled();
      const restarted = new NewEventNotificationService(now, db);
      expect(restarted.getItems()).toEqual(service.getItems());
      expect(restarted.getItems()).toHaveLength(2);
      db.clearUserData("account-1");
      restarted.reload();
      expect(restarted.getItems()).toEqual([
        expect.objectContaining({ calendarId: "calendar-2", popupDismissed: true }),
      ]);
      db.clearUserData();
      expect(db.listPendingInvites()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
  it.each(["upsert", "range"])(
    "repairs invalid cached event payloads during %s refresh",
    (mode) => {
      expect.hasAssertions();
      const sqlite = new DatabaseSync(":memory:");
      try {
        const db = createSqliteDatabase(sqlite);
        seedReminderCalendar(sqlite);
        const remote = createStoredReminderEvent();
        for (const payload of [
          "{broken",
          JSON.stringify({ ...remote, subject: 42 }),
          JSON.stringify({
            ...remote,
            isPhysicalLocation: true,
            locationCoordinates: { latitude: 100, longitude: 0 },
          }),
        ]) {
          db.upsertEvent(remote);
          sqlite
            .prepare("UPDATE events SET payload_json = ? WHERE id = ? AND calendar_id = ?")
            .run(payload, remote.id, remote.calendarId);
          const refresh = () => {
            if (mode === "upsert") {
              db.upsertEvent(remote);
            } else {
              db.replaceEventsForCalendarRange({
                calendarId: remote.calendarId,
                rangeStart: "2026-03-01T00:00:00Z",
                rangeEnd: "2026-04-01T00:00:00Z",
                events: [remote],
              });
            }
          };
          expect(refresh).not.toThrow();
          expect(db.getEvent(remote.calendarId, remote.id)).toMatchObject(remote);
          expect(db.getEvent(remote.calendarId, remote.id)?.isPhysicalLocation).toBeUndefined();
        }
      } finally {
        sqlite.close();
      }
      expect(sqlite.isOpen).toBe(false);
    },
  );

  it("retains physical place preferences and coordinates across refreshes but clears them when the remote place changes", () => {
    expect.hasAssertions();
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = createSqliteDatabase(sqlite);
      seedReminderCalendar(sqlite);
      const remote = createStoredReminderEvent();
      const coordinates = { latitude: 41.8902, longitude: 12.4922 };
      db.upsertEvent({ ...remote, isPhysicalLocation: true, locationCoordinates: coordinates });
      db.upsertEvent({ ...remote, subject: "Updated remotely" });
      expect(db.getEvent(remote.calendarId, remote.id)).toMatchObject({
        isPhysicalLocation: true,
        locationCoordinates: coordinates,
      });
      db.replaceEventsForCalendarRange({
        calendarId: remote.calendarId,
        rangeStart: "2026-03-01T00:00:00Z",
        rangeEnd: "2026-04-01T00:00:00Z",
        events: [remote],
      });
      expect(db.getEvent(remote.calendarId, remote.id)).toMatchObject({
        isPhysicalLocation: true,
        locationCoordinates: coordinates,
      });
      db.upsertEvent({ ...remote, isPhysicalLocation: false, locationCoordinates: null });
      db.upsertEvent(remote);
      expect(db.getEvent(remote.calendarId, remote.id)).toMatchObject({
        isPhysicalLocation: false,
        locationCoordinates: null,
      });
      db.upsertEvent({ ...remote, location: "Microsoft Teams Meeting" });
      expect(db.getEvent(remote.calendarId, remote.id)?.isPhysicalLocation).toBeUndefined();
      expect(db.getEvent(remote.calendarId, remote.id)?.locationCoordinates).toBeUndefined();
    } finally {
      sqlite.close();
    }
    expect(sqlite.isOpen).toBe(false);
  });

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

  it("clears only the signed-out account, including calendars with literal wildcard characters", () => {
    const { db, sqlite } = createDatabaseFixture();
    const signedOut = "account O'Neil";
    const retained = "account-2";
    seedReminderCalendar(sqlite, "calendar-%_1", signedOut);
    seedReminderCalendar(sqlite, "calendar-other_1", retained);
    const removedEvent = createStoredReminderEvent({ calendarId: "calendar-%_1" });
    const keptEvent = createStoredReminderEvent({ calendarId: "calendar-other_1" });
    const removedReminder = "calendar-%_1:event-1:2026-03-30T10:00:00.000Z:pre";
    const keptReminder = "calendar-other_1:event-1:2026-03-30T10:00:00.000Z:pre";
    db.upsertEvent(removedEvent);
    db.upsertEvent(keptEvent);
    db.dismissReminder(removedReminder);
    db.dismissReminder(keptReminder);
    db.markNotificationFired("calendar-%_1:event-1:invite");
    db.markNotificationFired("calendar-other_1:event-1:invite");
    db.replaceContactsForAccount([{ email: "first@example.com", name: null }], signedOut);
    db.replaceContactsForAccount([{ email: "second@example.com", name: null }], retained);
    db.saveAccounts(
      [signedOut, retained].map((homeAccountId) => ({
        homeAccountId,
        username: "user@example.com",
        name: null,
        tenantId: null,
        color: "#5b7cfa",
        lastSignedInAt: keptEvent.start,
      })),
    );
    db.markDeepBackfillCompleted("calendar-%_1", removedEvent.start);
    db.markDeepBackfillCompleted("calendar-other_1", keptEvent.start);
    for (const event of [removedEvent, keptEvent]) {
      db.recordCalendarSyncRange({
        calendarId: event.calendarId,
        rangeStart: event.start,
        rangeEnd: event.end,
        syncedAt: event.start,
      });
    }
    db.saveSettings({ ...db.getSettings(), language: "it" });

    db.clearUserData(signedOut);

    expect(db.getAccounts().map(({ homeAccountId }) => homeAccountId)).toStrictEqual([retained]);
    expect(db.listCalendarIds()).toStrictEqual(["calendar-other_1"]);
    expect(db.getEvent(removedEvent.calendarId, removedEvent.id)).toBeNull();
    expect(db.getEvent(keptEvent.calendarId, keptEvent.id)?.id).toBe(keptEvent.id);
    expect(db.getReminderState(removedReminder)).toBeNull();
    expect(db.getReminderState(keptReminder)?.dismissedAt).toBeTruthy();
    expect(db.hasNotificationFired("calendar-%_1:event-1:invite")).toBe(false);
    expect(db.hasNotificationFired("calendar-other_1:event-1:invite")).toBe(true);
    expect(db.getContactByEmail(signedOut, "first@example.com")).toBeNull();
    expect(db.getContactByEmail(retained, "second@example.com")?.email).toBe("second@example.com");
    expect(db.getDeepBackfillCompletedAt("calendar-%_1")).toBeNull();
    expect(db.getDeepBackfillCompletedAt("calendar-other_1")).toBe(keptEvent.start);
    expect(
      db.isCalendarSyncRangeCovered(removedEvent.calendarId, removedEvent.start, removedEvent.end),
    ).toBe(false);
    expect(
      db.isCalendarSyncRangeCovered(keptEvent.calendarId, keptEvent.start, keptEvent.end),
    ).toBe(true);
    expect(db.getSettings().language).toBe("it");
  });

  it("reads calendar ownership for stored payloads that have no account ID", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite, "legacy-calendar", "legacy-owner");

    expect(db.listCalendars()).toMatchObject([
      { id: "legacy-calendar", homeAccountId: "legacy-owner" },
    ]);
  });

  it("joins adjacent sync coverage and reports only the missing interval when there is a gap", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    const rangeStart = "2026-11-01T00:00:00.000Z";
    const firstEnd = "2026-11-10T00:00:00.000Z";
    const secondStart = "2026-11-20T00:00:00.000Z";
    const rangeEnd = "2026-11-30T00:00:00.000Z";
    const syncedAt = "2026-07-02T12:00:00.000Z";
    const calendarId = "calendar-1";
    db.recordCalendarSyncRange({ calendarId, rangeStart, rangeEnd: firstEnd, syncedAt });
    db.recordCalendarSyncRange({ calendarId, rangeStart: secondStart, rangeEnd, syncedAt });

    expect(db.listUncoveredCalendarSyncRanges(calendarId, rangeStart, rangeEnd)).toStrictEqual([
      { rangeStart: firstEnd, rangeEnd: secondStart },
    ]);
    expect(db.isCalendarSyncRangeCovered(calendarId, rangeStart, rangeEnd)).toBe(false);

    db.recordCalendarSyncRange({
      calendarId,
      rangeStart: firstEnd,
      rangeEnd: secondStart,
      syncedAt,
    });
    expect(db.isCalendarSyncRangeCovered(calendarId, rangeStart, rangeEnd)).toBe(true);
  });

  it.each([false, true])(
    "applies the freshness cutoff after an overlapping fetch, preserve coverage=%s",
    (preserveOverlappingCoverage) => {
      const { db, sqlite } = createDatabaseFixture();
      seedReminderCalendar(sqlite);
      const calendarId = "calendar-1";
      const firstDay = "2026-11-01T00:00:00.000Z";
      const fetchStart = "2026-11-05T00:00:00.000Z";
      const fetchEnd = "2026-11-30T00:00:00.000Z";
      const lastDay = "2026-12-15T00:00:00.000Z";
      const previousSync = "2026-07-01T12:00:00.000Z";
      const latestSync = "2026-07-02T12:00:00.000Z";
      db.recordCalendarSyncRange({
        calendarId,
        rangeStart: firstDay,
        rangeEnd: lastDay,
        syncedAt: previousSync,
      });
      db.recordCalendarSyncRange({
        calendarId,
        preserveOverlappingCoverage,
        rangeStart: fetchStart,
        rangeEnd: fetchEnd,
        syncedAt: latestSync,
      });

      const unfetched = [
        { rangeStart: firstDay, rangeEnd: fetchStart },
        { rangeStart: fetchEnd, rangeEnd: lastDay },
      ];
      expect(db.listUncoveredCalendarSyncRanges(calendarId, firstDay, lastDay)).toStrictEqual(
        preserveOverlappingCoverage ? [] : unfetched,
      );
      expect(
        db.listUncoveredCalendarSyncRanges(calendarId, firstDay, lastDay, latestSync),
      ).toStrictEqual(unfetched);
    },
  );

  it("returns before-start and start reminders with independent snooze and dismissal state", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    const timed = createStoredReminderEvent();
    const atStart = createStoredReminderEvent({ id: "event-2", reminderMinutesBeforeStart: 0 });
    db.upsertEvent(timed);
    db.upsertEvent(atStart);
    const timedKey = "calendar-1:event-1:2026-03-30T10:00:00.000Z";
    const atStartKey = "calendar-1:event-2:2026-03-30T10:00:00.000Z:start";
    const snoozedUntil = "2026-03-30T09:50:00.000Z";
    db.snoozeReminder(timedKey + ":pre", snoozedUntil);
    db.dismissReminder(timedKey + ":start");

    const candidates = db.listReminderCandidates(["calendar-1"], timed.start, timed.end);
    expect(candidates).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dedupeKey: timedKey + ":pre",
          dismissedAt: null,
          reminderType: "pre",
          snoozedUntil,
        }),
        expect.objectContaining({
          dedupeKey: timedKey + ":start",
          dismissedAt: expect.any(String),
          reminderType: "start",
          snoozedUntil: null,
        }),
        expect.objectContaining({
          dedupeKey: atStartKey,
          reminderType: "start",
        }),
      ]),
    );
    expect(candidates).toHaveLength(3);
  });

  it("excludes cancelled and declined events from both reminder queries", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    const eligible = createStoredReminderEvent({ reminderMinutesBeforeStart: 0 });
    db.upsertEvent(eligible);
    db.upsertEvent(createStoredReminderEvent({ id: "cancelled", cancelled: true }));
    db.upsertEvent(
      createStoredReminderEvent({
        id: "declined",
        isOrganizer: false,
        responseStatus: { response: "declined", time: null },
      }),
    );

    expect(
      db
        .listReminderCandidates(["calendar-1"], eligible.start, eligible.end)
        .map(({ event }) => event.id),
    ).toStrictEqual([eligible.id]);
    expect(
      db
        .listReminderEventsByStartRange(["calendar-1"], eligible.start, eligible.end)
        .map(({ id }) => id),
    ).toStrictEqual([eligible.id]);
  });

  it("prunes expired dismissed and snoozed-only reminders while keeping current state", () => {
    const { db, sqlite } = createDatabaseFixture();
    const seed = sqlite.prepare("INSERT INTO reminder_state VALUES (?, ?, ?)");
    seed.run("expired:pre", null, "2026-02-28T00:00:00.000Z");
    seed.run("expired:start", "2026-02-28T00:00:00.000Z", null);
    seed.run("current:pre", null, "2026-03-01T00:00:00.000Z");
    seed.run("current:start", "2026-03-02T00:00:00.000Z", null);

    db.pruneReminderState("2026-03-01T00:00:00.000Z");

    expect(db.getReminderState("expired:pre")).toBeNull();
    expect(db.getReminderState("expired:start")).toBeNull();
    expect(db.getReminderState("current:pre")?.dismissedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(db.getReminderState("current:start")?.snoozedUntil).toBe("2026-03-02T00:00:00.000Z");
  });

  it("keeps old invite delivery markers only while their invitations still need a response", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    const seed = sqlite.prepare("INSERT INTO notification_state VALUES (?, ?)");
    const firedAt = "2026-02-28T00:00:00.000Z";
    db.upsertEvent(
      createStoredReminderEvent({
        id: "pending",
        isOrganizer: false,
        responseStatus: { response: " notResponded ", time: null },
      }),
    );
    db.upsertEvent(
      createStoredReminderEvent({ id: "cancelled", isOrganizer: false, cancelled: true }),
    );
    db.upsertEvent(
      createStoredReminderEvent({
        id: "past",
        isOrganizer: false,
        start: "2026-03-30T09:30:00.000Z",
      }),
    );
    db.upsertEvent(createStoredReminderEvent({ id: "organizer" }));
    db.upsertEvent(
      createStoredReminderEvent({
        id: "accepted",
        isOrganizer: false,
        responseStatus: { response: "accepted", time: null },
      }),
    );
    for (const id of ["pending", "cancelled", "past", "organizer", "accepted", "missing"]) {
      seed.run("calendar-1:" + id + ":invite", firedAt);
    }
    seed.run("calendar-1:pending:pre", firedAt);
    seed.run("calendar-1:recent:invite", "2026-03-02T00:00:00.000Z");

    db.pruneNotificationState("2026-03-01T00:00:00.000Z", "2026-03-30T09:30:00.000Z");

    expect(db.hasNotificationFired("calendar-1:pending:invite")).toBe(true);
    expect(db.hasNotificationFired("calendar-1:recent:invite")).toBe(true);
    for (const id of ["cancelled", "past", "organizer", "accepted", "missing"]) {
      expect(db.hasNotificationFired("calendar-1:" + id + ":invite")).toBe(false);
    }
    expect(db.hasNotificationFired("calendar-1:pending:pre")).toBe(false);
  });

  it("ranks event matches within the requested calendars and treats wildcards literally", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    seedReminderCalendar(sqlite, "another-calendar");
    const event = createStoredReminderEvent();
    db.upsertEvent({
      ...event,
      id: "prefix",
      subject: "Plan%_ning",
      start: "2026-03-30T08:00:00.000Z",
    });
    db.upsertEvent({
      ...event,
      id: "substring",
      subject: "Weekly Plan%_ning",
      start: "2026-03-30T09:00:00.000Z",
    });
    db.upsertEvent({ ...event, id: "preview", bodyPreview: "Agenda: plan%_ning" });
    db.upsertEvent({
      ...event,
      id: "location",
      location: "Plan%_ning",
      start: "2026-03-30T10:05:00.000Z",
    });
    db.upsertEvent({
      ...event,
      id: "category",
      categories: ["Plan%_ning"],
      start: "2026-03-30T10:10:00.000Z",
    });
    db.upsertEvent({
      ...event,
      id: "attendee",
      start: "2026-03-30T10:15:00.000Z",
      attendees: [
        { email: "person@example.com", name: "Plan%_ning", type: "required", response: null },
      ],
    });
    db.upsertEvent({ ...event, id: "similar-percent", subject: "PlanX_ning" });
    db.upsertEvent({ ...event, id: "similar-underscore", subject: "Plan%Xning" });
    db.upsertEvent({
      ...event,
      id: "outside",
      subject: "Plan%_ning",
      calendarId: "another-calendar",
    });

    const results = db
      .searchEvents({
        calendarIds: ["calendar-1"],
        query: "Plan%_ning",
        limit: 10,
        sort: "relevance",
      })
      .map(({ id }) => id);
    expect(results).toStrictEqual([
      "prefix",
      "substring",
      "attendee",
      "category",
      "location",
      "preview",
    ]);
  });

  it("returns no results for a punctuation-only event search", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    db.upsertEvent(createStoredReminderEvent());

    expect(db.searchEvents({ limit: 30, query: '",;:()', sort: "recent" })).toStrictEqual([]);
  });

  it("searches across calendars when no filter is supplied and honors the sort and limit", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    seedReminderCalendar(sqlite, "another-calendar");
    db.upsertEvent(createStoredReminderEvent({ id: "newer" }));
    db.upsertEvent(
      createStoredReminderEvent({
        id: "older",
        calendarId: "another-calendar",
        start: "2026-03-29T10:00:00.000Z",
      }),
    );

    expect(
      db.searchEvents({ limit: 5, query: "Planning", sort: "oldest" }).map(({ id }) => id),
    ).toStrictEqual(["older", "newer"]);
    expect(
      db.searchEvents({ limit: 1, query: "Planning", sort: "recent" }).map(({ id }) => id),
    ).toStrictEqual(["newer"]);
  });

  it("finds contacts using normalized attendee input and only searches the selected account", () => {
    const { db } = createDatabaseFixture();
    const match = { contactId: "contact-1", email: "john@example.com", name: "Doe, John" };
    db.replaceContactsForAccount(
      [match, { email: "jane@example.com", name: "Doe, Jane" }],
      "account-1",
    );
    db.replaceContactsForAccount([{ ...match, email: "josh@example.com" }], "account-2");

    expect(
      db.searchContacts({ homeAccountId: "account-1", limit: 5, query: '"Doe, John" <JO' }),
    ).toStrictEqual([match]);
  });

  it("migrates past-due reminders once without suppressing a reminder that is still upcoming", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    const now = Date.now();
    const past = new Date(now - 60 * 60_000).toISOString();
    const future = new Date(now + 60 * 60_000).toISOString();
    for (const [id, start] of [
      ["past", past],
      ["future", future],
    ]) {
      db.upsertEvent({ ...createStoredReminderEvent({ id, start }), end: start });
    }
    db.markNotificationFired("calendar-1:legacy-reminder");
    sqlite.exec("DROP TABLE reminder_state");

    const migrated = createSqliteDatabase(sqlite);

    expect(migrated.getReminderState("calendar-1:legacy-reminder:pre")?.dismissedAt).toBeTruthy();
    expect(migrated.getReminderState("calendar-1:past:" + past + ":pre")?.dismissedAt).toBeTruthy();
    expect(migrated.getReminderState("calendar-1:future:" + future + ":pre")).toBeNull();

    migrated.upsertEvent({
      ...createStoredReminderEvent({ id: "newly-synced", start: past }),
      end: past,
    });
    expect(
      createSqliteDatabase(sqlite).getReminderState("calendar-1:newly-synced:" + past + ":pre"),
    ).toBeNull();
  });

  it("can record completed deep backfill after migrating an older sync cache", () => {
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    const syncedAt = "2026-03-30T10:00:00.000Z";
    db.saveSyncState({
      calendarId: "calendar-1",
      errorMessage: null,
      lastSyncedAt: syncedAt,
      rangeStart: "2026-03-01T00:00:00.000Z",
      rangeEnd: "2026-04-01T00:00:00.000Z",
    });
    sqlite.exec("ALTER TABLE sync_state DROP COLUMN deep_backfill_completed_at");

    const migrated = createSqliteDatabase(sqlite);

    expect(migrated.getLatestSyncStatus().lastSyncedAt).toBe(syncedAt);
    expect(migrated.getDeepBackfillCompletedAt("calendar-1")).toBeNull();
    migrated.markDeepBackfillCompleted("calendar-1", syncedAt);
    expect(migrated.getDeepBackfillCompletedAt("calendar-1")).toBe(syncedAt);
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
    const { db, sqlite } = createDatabaseFixture();
    seedReminderCalendar(sqlite);
    db.upsertEvent(createStoredReminderEvent());
    sqlite
      .prepare("UPDATE events SET payload_json = ? WHERE id = ?")
      .run(JSON.stringify(corruptedEvent), corruptedEvent.id);

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
