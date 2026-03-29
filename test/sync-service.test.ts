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

function createCalendar(id: string): CalendarSummary {
  return {
    canEdit: true,
    canShare: false,
    color: "#5b7cfa",
    id,
    isDefaultCalendar: false,
    isVisible: true,
    name: id,
    ownerAddress: "user@example.com",
    ownerName: "User",
  };
}

function createFixture(args?: {
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
    syncVisibleCalendars: vi.fn().mockReturnValue({
      visibleCalendarIds,
    }),
  };

  const auth = {
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
      state: "idle",
    });
    expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();
    expect(fixture.db.upsertCalendars).toHaveBeenCalledOnce();
    expect(fixture.settings.syncVisibleCalendars).toHaveBeenCalledWith({
      calendarIds: ["calendar-a", "calendar-b"],
      knownCalendarIds: [],
    });
    expect(fixture.graph.listCalendarView).toHaveBeenCalledTimes(0);
    expect(fixture.reminders.checkNow).toHaveBeenCalledTimes(0);
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
      state: "idle",
    });
    expect(fixture.graph.listCalendarView).toHaveBeenCalledTimes(0);
    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledTimes(0);
    expect(fixture.reminders.checkNow).toHaveBeenCalledTimes(0);
  });
});
