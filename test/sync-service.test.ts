import { describe, expect, it, vi } from "vitest";
import { SyncService } from "../src/main/sync/sync-service";
import type { CalendarSummary, UserSettings } from "../src/shared/schemas";

interface SyncFixture {
  db: {
    getLatestSyncStatus: ReturnType<typeof vi.fn>;
    listCalendarIds: ReturnType<typeof vi.fn>;
    replaceContactsForAccount: ReturnType<typeof vi.fn>;
    replaceEventsForCalendarRange: ReturnType<typeof vi.fn>;
    saveSyncState: ReturnType<typeof vi.fn>;
    upsertCalendars: ReturnType<typeof vi.fn>;
  };
  graph: {
    listCalendarView: ReturnType<typeof vi.fn>;
    listCalendars: ReturnType<typeof vi.fn>;
    listContacts: ReturnType<typeof vi.fn>;
  };
  reminders: {
    checkNow: ReturnType<typeof vi.fn>;
  };
  service: SyncService;
  settings: {
    getSettings: ReturnType<typeof vi.fn>;
    syncVisibleCalendars: ReturnType<typeof vi.fn>;
  };
}

function createCalendar(id: string, homeAccountId = "account-1"): CalendarSummary {
  return {
    canEdit: true,
    canShare: false,
    color: "#5b7cfa",
    homeAccountId,
    id,
    isDefaultCalendar: false,
    isVisible: true,
    name: id,
    ownerAddress: "user@example.com",
    ownerName: "User",
  };
}

function createFixture(args?: {
  accountIds?: string[];
  calendars?: CalendarSummary[];
  knownCalendarIds?: string[];
  syncIntervalMinutes?: UserSettings["syncIntervalMinutes"];
  visibleCalendarIds?: string[];
}): SyncFixture {
  const calendars = args?.calendars ?? [createCalendar("calendar-a")];
  const visibleCalendarIds = args?.visibleCalendarIds ?? calendars.map((calendar) => calendar.id);
  const syncIntervalMinutes = args?.syncIntervalMinutes ?? 15;

  const db = {
    getLatestSyncStatus: vi.fn().mockReturnValue({
      lastSyncedAt: null,
      message: "Sign in to sync Exchange 365.",
      messageKey: "sync.signInToSync",
      counts: null,
      state: "idle",
    }),
    listCalendarIds: vi.fn().mockReturnValue(args?.knownCalendarIds ?? []),
    replaceContactsForAccount: vi.fn(),
    replaceEventsForCalendarRange: vi.fn(),
    saveSyncState: vi.fn(),
    upsertCalendars: vi.fn(),
  };

  const graph = {
    listCalendarView: vi.fn().mockResolvedValue([]),
    listCalendars: vi.fn().mockResolvedValue(calendars),
    listContacts: vi.fn().mockResolvedValue([]),
  };

  const reminders = {
    checkNow: vi.fn().mockResolvedValue(undefined),
  };

  const settings = {
    getSettings: vi.fn().mockReturnValue({
      syncIntervalMinutes,
      visibleCalendarIds,
    }),
    syncVisibleCalendars: vi.fn().mockReturnValue({
      syncIntervalMinutes,
      visibleCalendarIds,
    }),
  };

  const auth = {
    getAccountIds: vi.fn().mockReturnValue(args?.accountIds ?? ["account-1"]),
    getActiveAccountId: vi.fn().mockReturnValue("account-1"),
    hasSession: vi.fn().mockReturnValue(true),
  };

  const service = new SyncService({
    auth: auth as never,
    config: {
      syncIntervalMinutes: 15,
      syncLookAheadDays: 30,
      syncLookBehindDays: 30,
    } as never,
    db: db as never,
    graph: graph as never,
    reminders: reminders as never,
    settings: settings as never,
  });

  return {
    db,
    graph,
    reminders,
    service,
    settings,
  };
}

function createDeferred<T>() {
  const deferred: {
    reject: (reason?: unknown) => void;
    resolve: (value: T | PromiseLike<T>) => void;
  } = {
    reject: () => undefined,
    resolve: () => undefined,
  };
  const promise = new Promise<T>((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return {
    promise,
    reject: deferred.reject,
    resolve: deferred.resolve,
  };
}

describe("sync service", () => {
  it("discovers calendars on sign-in without syncing events", async () => {
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a"), createCalendar("calendar-b")],
    });

    const status = await fixture.service.syncAll("sign-in");

    expect(status).toStrictEqual({
      lastSyncedAt: null,
      message: "Choose calendars to sync.",
      messageKey: "sync.chooseCalendars",
      counts: null,
      state: "idle",
    });
    expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();
    expect(fixture.db.upsertCalendars).toHaveBeenCalledWith(
      [createCalendar("calendar-a"), createCalendar("calendar-b")],
      "account-1",
    );
    expect(fixture.graph.listContacts).toHaveBeenCalledOnce();
    expect(fixture.db.replaceContactsForAccount).toHaveBeenCalledWith([], "account-1");
    expect(fixture.settings.syncVisibleCalendars).toHaveBeenCalledWith({
      calendarIds: ["calendar-a", "calendar-b"],
      knownCalendarIds: [],
    });
    expect(fixture.graph.listCalendarView).toHaveBeenCalledTimes(0);
    expect(fixture.reminders.checkNow).toHaveBeenCalledTimes(0);
  });

  it("syncs all signed-in accounts during manual refresh", async () => {
    const fixture = createFixture({
      accountIds: ["account-1", "account-2"],
      calendars: [],
      visibleCalendarIds: ["calendar-a", "calendar-b"],
    });

    fixture.graph.listCalendars = vi
      .fn()
      .mockImplementation(async (homeAccountId: string) =>
        homeAccountId === "account-1"
          ? [createCalendar("calendar-a", "account-1")]
          : [createCalendar("calendar-b", "account-2")],
      );

    const status = await fixture.service.syncAll("manual");

    expect(status.counts).toStrictEqual({ calendars: 2, events: 0 });
    expect(fixture.graph.listCalendars).toHaveBeenCalledTimes(2);
    expect(fixture.graph.listContacts).toHaveBeenCalledTimes(2);
    expect(fixture.graph.listCalendars.mock.calls.map(([accountId]) => accountId)).toStrictEqual([
      "account-1",
      "account-2",
    ]);
    expect(fixture.graph.listCalendarView.mock.calls).toStrictEqual([
      ["calendar-a", expect.any(String), expect.any(String), "account-1"],
      ["calendar-b", expect.any(String), expect.any(String), "account-2"],
    ]);
  });

  it("syncs only selected calendars", async () => {
    const fixture = createFixture({
      calendars: [
        createCalendar("calendar-a"),
        createCalendar("calendar-b"),
        createCalendar("calendar-c"),
      ],
      visibleCalendarIds: ["calendar-a", "calendar-c"],
    });

    const status = await fixture.service.syncAll("manual");

    expect(status.message).toBe("Synced 2 calendars, 0 events.");
    expect(status.messageKey).toBe("sync.synced");
    expect(status.counts).toStrictEqual({ calendars: 2, events: 0 });
    expect(fixture.graph.listCalendarView).toHaveBeenCalledTimes(2);
    expect(fixture.graph.listCalendarView.mock.calls.map((call) => call[0])).toStrictEqual([
      "calendar-a",
      "calendar-c",
    ]);
    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledTimes(2);
    expect(fixture.db.saveSyncState).toHaveBeenCalledTimes(2);
    expect(fixture.reminders.checkNow).toHaveBeenCalledOnce();
  });

  it("returns an idle status when no calendars are selected", async () => {
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a")],
      visibleCalendarIds: [],
    });

    const status = await fixture.service.syncAll("manual");

    expect(status).toStrictEqual({
      lastSyncedAt: null,
      message: "Select at least one calendar to sync.",
      messageKey: "sync.selectCalendars",
      counts: null,
      state: "idle",
    });
    expect(fixture.graph.listCalendarView).toHaveBeenCalledTimes(0);
    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledTimes(0);
    expect(fixture.reminders.checkNow).toHaveBeenCalledTimes(0);
  });

  it("keeps calendar discovery working when contacts sync fails", async () => {
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a"), createCalendar("calendar-b")],
    });

    fixture.graph.listContacts.mockRejectedValue(new Error("Contacts unavailable"));

    const status = await fixture.service.syncAll("sign-in");

    expect(status).toStrictEqual({
      lastSyncedAt: null,
      message: "Choose calendars to sync.",
      messageKey: "sync.chooseCalendars",
      counts: null,
      state: "idle",
    });
    expect(fixture.db.upsertCalendars).toHaveBeenCalledWith(
      [createCalendar("calendar-a"), createCalendar("calendar-b")],
      "account-1",
    );
    expect(fixture.db.replaceContactsForAccount).not.toHaveBeenCalled();
  });

  it("uses the saved interval for automatic sync", async () => {
    vi.useFakeTimers();

    try {
      const fixture = createFixture({ syncIntervalMinutes: 10 });

      fixture.service.start();

      await vi.advanceTimersByTimeAsync(9 * 60_000);
      expect(fixture.graph.listCalendars).toHaveBeenCalledTimes(0);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();

      fixture.service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes the timer when the saved interval changes", async () => {
    vi.useFakeTimers();

    try {
      const fixture = createFixture({ syncIntervalMinutes: 5 });

      fixture.service.start();
      fixture.settings.getSettings.mockReturnValue({
        syncIntervalMinutes: 10,
        visibleCalendarIds: ["calendar-a"],
      });

      fixture.service.refreshSchedule();

      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(fixture.graph.listCalendars).toHaveBeenCalledTimes(0);

      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();

      fixture.service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs one follow-up sync when a mutation arrives during an in-flight sync", async () => {
    const fixture = createFixture();
    const firstCalendars = createDeferred<CalendarSummary[]>();

    fixture.graph.listCalendars
      .mockImplementationOnce(() => firstCalendars.promise)
      .mockResolvedValue([createCalendar("calendar-a")]);

    const firstSync = fixture.service.syncAll("manual");
    const overlappingMutation = fixture.service.syncAll("mutation", "account-1");

    expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();

    firstCalendars.resolve([createCalendar("calendar-a")]);

    await Promise.all([firstSync, overlappingMutation]);
    await Promise.resolve();

    expect(fixture.graph.listCalendars).toHaveBeenCalledTimes(2);
    expect(fixture.graph.listCalendars.mock.calls.map(([accountId]) => accountId)).toStrictEqual([
      "account-1",
      "account-1",
    ]);
  });

  it("coalesces multiple same-account mutations into one follow-up sync", async () => {
    const fixture = createFixture();
    const firstCalendars = createDeferred<CalendarSummary[]>();

    fixture.graph.listCalendars
      .mockImplementationOnce(() => firstCalendars.promise)
      .mockResolvedValue([createCalendar("calendar-a")]);

    const firstSync = fixture.service.syncAll("manual");
    const firstMutation = fixture.service.syncAll("mutation", "account-1");
    const secondMutation = fixture.service.syncAll("mutation", "account-1");

    firstCalendars.resolve([createCalendar("calendar-a")]);

    await Promise.all([firstSync, firstMutation, secondMutation]);
    await Promise.resolve();

    expect(fixture.graph.listCalendars).toHaveBeenCalledTimes(2);
  });

  it("falls back to one all-account follow-up sync for queued mutations across accounts", async () => {
    const fixture = createFixture({
      accountIds: ["account-1", "account-2"],
      calendars: [],
      visibleCalendarIds: ["calendar-a", "calendar-b"],
    });
    const firstCalendars = createDeferred<CalendarSummary[]>();

    fixture.graph.listCalendars = vi
      .fn()
      .mockImplementationOnce(() => firstCalendars.promise)
      .mockImplementation(async (homeAccountId: string) =>
        homeAccountId === "account-1"
          ? [createCalendar("calendar-a", "account-1")]
          : [createCalendar("calendar-b", "account-2")],
      );

    const firstSync = fixture.service.syncAll("manual");
    const firstMutation = fixture.service.syncAll("mutation", "account-1");
    const secondMutation = fixture.service.syncAll("mutation", "account-2");

    firstCalendars.resolve([createCalendar("calendar-a", "account-1")]);

    await Promise.all([firstSync, firstMutation, secondMutation]);
    await Promise.resolve();

    expect(fixture.graph.listCalendars).toHaveBeenCalledTimes(4);
    expect(fixture.graph.listCalendars.mock.calls.map(([accountId]) => accountId)).toStrictEqual([
      "account-1",
      "account-2",
      "account-1",
      "account-2",
    ]);
  });

  it("keeps non-mutation overlap coalesced into the active sync only", async () => {
    const fixture = createFixture();
    const firstCalendars = createDeferred<CalendarSummary[]>();

    fixture.graph.listCalendars
      .mockImplementationOnce(() => firstCalendars.promise)
      .mockResolvedValue([createCalendar("calendar-a")]);

    const firstSync = fixture.service.syncAll("manual");
    const overlappingManual = fixture.service.syncAll("manual");

    firstCalendars.resolve([createCalendar("calendar-a")]);

    await Promise.all([firstSync, overlappingManual]);
    await Promise.resolve();

    expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();
  });
});
