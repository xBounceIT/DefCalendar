import { describe, expect, it, vi } from "vitest";
import { SyncService } from "../src/main/sync/sync-service";
import type { CalendarSummary } from "../src/shared/schemas";

interface SyncFixture {
  db: {
    getLatestSyncStatus: ReturnType<typeof vi.fn>;
    listCalendarIds: ReturnType<typeof vi.fn>;
    replaceEventsForCalendarRange: ReturnType<typeof vi.fn>;
    saveSyncState: ReturnType<typeof vi.fn>;
    upsertCalendars: ReturnType<typeof vi.fn>;
  };
  graph: {
    listCalendarView: ReturnType<typeof vi.fn>;
    listCalendars: ReturnType<typeof vi.fn>;
  };
  reminders: {
    checkNow: ReturnType<typeof vi.fn>;
  };
  service: SyncService;
  settings: {
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
  visibleCalendarIds?: string[];
}): SyncFixture {
  const calendars = args?.calendars ?? [createCalendar("calendar-a")];
  const visibleCalendarIds = args?.visibleCalendarIds ?? calendars.map((calendar) => calendar.id);

  const db = {
    getLatestSyncStatus: vi.fn().mockReturnValue({
      lastSyncedAt: null,
      message: "Sign in to sync Exchange 365.",
      messageKey: "sync.signInToSync",
      counts: null,
      state: "idle",
    }),
    listCalendarIds: vi.fn().mockReturnValue(args?.knownCalendarIds ?? []),
    replaceEventsForCalendarRange: vi.fn(),
    saveSyncState: vi.fn(),
    upsertCalendars: vi.fn(),
  };

  const graph = {
    listCalendarView: vi.fn().mockResolvedValue([]),
    listCalendars: vi.fn().mockResolvedValue(calendars),
  };

  const reminders = {
    checkNow: vi.fn().mockResolvedValue(undefined),
  };

  const settings = {
    getSettings: vi.fn().mockReturnValue({
      visibleCalendarIds,
    }),
    syncVisibleCalendars: vi.fn().mockReturnValue({
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
});
