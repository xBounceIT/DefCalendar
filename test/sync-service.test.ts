import { describe, expect, it, vi } from "vitest";
import { SyncService } from "../src/main/sync/sync-service";
import { DAY_MS } from "../src/shared/duration";
import type {
  CalendarEvent,
  CalendarSummary,
  SyncStatus,
  UserSettings,
} from "../src/shared/schemas";

const FIXTURE_LOOKBEHIND_DAYS = 30;
const FIXTURE_LOOKAHEAD_DAYS = 30;
const FIXTURE_SYNC_WINDOW = {
  lookAheadDays: FIXTURE_LOOKAHEAD_DAYS,
  lookBehindDays: FIXTURE_LOOKBEHIND_DAYS,
};

interface SyncFixture {
  db: {
    clearNotificationFired: ReturnType<typeof vi.fn>;
    clearCalendarSyncRanges: ReturnType<typeof vi.fn>;
    getDeepBackfillCompletedAt: ReturnType<typeof vi.fn>;
    getCalendarHomeAccountId: ReturnType<typeof vi.fn>;
    getLatestSyncStatus: ReturnType<typeof vi.fn>;
    hasNotificationFired: ReturnType<typeof vi.fn>;
    listCalendarIds: ReturnType<typeof vi.fn>;
    listUncoveredCalendarSyncRanges: ReturnType<typeof vi.fn>;
    listEvents: ReturnType<typeof vi.fn>;
    markDeepBackfillCompleted: ReturnType<typeof vi.fn>;
    markNotificationFired: ReturnType<typeof vi.fn>;
    replaceContactsForAccount: ReturnType<typeof vi.fn>;
    recordCalendarSyncRange: ReturnType<typeof vi.fn>;
    replaceEventsForCalendarRange: ReturnType<typeof vi.fn>;
    saveSyncState: ReturnType<typeof vi.fn>;
    upsertCalendars: ReturnType<typeof vi.fn>;
  };
  graph: {
    listCalendarView: ReturnType<typeof vi.fn>;
    listCalendars: ReturnType<typeof vi.fn>;
    listContacts: ReturnType<typeof vi.fn>;
  };
  newEventNotifications: {
    clear: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    getItems: ReturnType<typeof vi.fn>;
    onChange: ReturnType<typeof vi.fn>;
    recordCandidates: ReturnType<typeof vi.fn>;
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

function createEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    allowNewTimeProposals: true,
    attachments: [],
    attendees: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: overrides?.calendarId ?? "calendar-a",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: overrides?.end ?? "2026-03-30T11:00:00.000Z",
    etag: null,
    hasAttachments: false,
    id: overrides?.id ?? "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: true,
    isReminderOn: true,
    lastModifiedDateTime: null,
    location: null,
    locations: [],
    occurrenceId: null,
    onlineMeeting: null,
    onlineMeetingProvider: null,
    organizer: null,
    recurrence: null,
    reminderMinutesBeforeStart: 15,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal",
    seriesMasterId: null,
    showAs: "busy",
    start: overrides?.start ?? "2026-03-30T10:00:00.000Z",
    subject: overrides?.subject ?? "Planning",
    timeZone: "Europe/Rome",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

function createFixture(args?: {
  accountIds?: string[];
  calendars?: CalendarSummary[];
  currentTime?: string;
  knownCalendarIds?: string[];
  newEventPopupEnabled?: boolean;
  syncIntervalMinutes?: UserSettings["syncIntervalMinutes"];
  systemInviteNotificationsEnabled?: boolean;
  taskbarInviteNotificationsEnabled?: boolean;
  visibleCalendarIds?: string[];
}): SyncFixture {
  const calendars = args?.calendars ?? [createCalendar("calendar-a")];
  const visibleCalendarIds = args?.visibleCalendarIds ?? calendars.map((calendar) => calendar.id);
  const syncIntervalMinutes = args?.syncIntervalMinutes ?? 15;

  const db = {
    clearNotificationFired: vi.fn(),
    clearCalendarSyncRanges: vi.fn(),
    getDeepBackfillCompletedAt: vi.fn().mockReturnValue("2026-01-01T00:00:00.000Z"),
    getCalendarHomeAccountId: vi.fn().mockReturnValue("account-1"),
    getLatestSyncStatus: vi.fn().mockReturnValue({
      lastSyncedAt: null,
      message: "Sign in to sync Exchange 365.",
      messageKey: "sync.signInToSync",
      counts: null,
      state: "idle",
    }),
    hasNotificationFired: vi.fn().mockReturnValue(false),
    listUncoveredCalendarSyncRanges: vi
      .fn()
      .mockImplementation((_calendarId: string, rangeStart: string, rangeEnd: string) => [
        { rangeEnd, rangeStart },
      ]),
    listCalendarIds: vi.fn().mockReturnValue(args?.knownCalendarIds ?? []),
    listEvents: vi.fn().mockReturnValue([]),
    markDeepBackfillCompleted: vi.fn(),
    markNotificationFired: vi.fn(),
    recordCalendarSyncRange: vi.fn(),
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
      newEventPopupEnabled: args?.newEventPopupEnabled ?? false,
      syncIntervalMinutes,
      systemInviteNotificationsEnabled: args?.systemInviteNotificationsEnabled ?? false,
      taskbarInviteNotificationsEnabled: args?.taskbarInviteNotificationsEnabled ?? false,
      visibleCalendarIds,
    }),
    syncVisibleCalendars: vi.fn().mockReturnValue({
      newEventPopupEnabled: args?.newEventPopupEnabled ?? false,
      syncIntervalMinutes,
      systemInviteNotificationsEnabled: args?.systemInviteNotificationsEnabled ?? false,
      taskbarInviteNotificationsEnabled: args?.taskbarInviteNotificationsEnabled ?? false,
      visibleCalendarIds,
    }),
  };

  const auth = {
    getAccountIds: vi.fn().mockReturnValue(args?.accountIds ?? ["account-1"]),
    getActiveAccountId: vi.fn().mockReturnValue("account-1"),
    hasSession: vi.fn().mockReturnValue(true),
  };

  const newEventNotifications = {
    clear: vi.fn(),
    dismiss: vi.fn(),
    getItems: vi.fn().mockReturnValue([]),
    onChange: vi.fn(),
    recordCandidates: vi.fn(),
  };

  const service = new SyncService(
    {
      auth: auth as never,
      config: {
        syncIntervalMinutes: 15,
        syncLookAheadDays: FIXTURE_LOOKAHEAD_DAYS,
        syncLookBehindDays: FIXTURE_LOOKBEHIND_DAYS,
      } as never,
      db: db as never,
      graph: graph as never,
      newEventNotifications: newEventNotifications as never,
      reminders: reminders as never,
      settings: settings as never,
    },
    () => new Date(args?.currentTime ?? "2026-03-30T00:00:00.000Z").getTime(),
  );

  return {
    db,
    graph,
    newEventNotifications,
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
      progress: null,
      state: "idle",
      syncWindow: FIXTURE_SYNC_WINDOW,
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
    expect(fixture.graph.listCalendarView).not.toHaveBeenCalled();
    expect(fixture.reminders.checkNow).not.toHaveBeenCalled();
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
    expect(fixture.db.clearCalendarSyncRanges).toHaveBeenCalledWith(["calendar-a", "calendar-b"]);
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

  it("does not let a late-resolving parallel fetch overwrite an error status", async () => {
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a"), createCalendar("calendar-b")],
    });

    const slow = createDeferred<CalendarEvent[]>();
    fixture.graph.listCalendarView = vi.fn().mockImplementation(async (calendarId: string) => {
      if (calendarId === "calendar-a") {
        throw new Error("graph down");
      }
      return slow.promise;
    });

    const statuses: SyncStatus[] = [];
    fixture.service.onStatus((status) => {
      statuses.push({ ...status });
    });

    const result = await fixture.service.syncAll("manual");

    expect(result.state).toBe("error");

    slow.resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorIndex = statuses.findIndex((status) => status.state === "error");
    const syncingAfterError = statuses
      .slice(errorIndex + 1)
      .filter((status) => status.state === "syncing");
    expect(syncingAfterError).toStrictEqual([]);
    expect(statuses.at(-1)?.state).toBe("error");
  });

  it("gates late progress emits for non-network throws (e.g. db lookup failure)", async () => {
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a"), createCalendar("calendar-b")],
    });

    const slow = createDeferred<CalendarEvent[]>();
    fixture.db.getDeepBackfillCompletedAt = vi.fn().mockImplementation((calendarId: string) => {
      if (calendarId === "calendar-a") {
        throw new Error("db lookup failed");
      }
      return "2026-01-01T00:00:00.000Z";
    });
    fixture.graph.listCalendarView = vi.fn().mockImplementation(async (calendarId: string) => {
      if (calendarId === "calendar-b") {
        return slow.promise;
      }
      return [];
    });

    const statuses: SyncStatus[] = [];
    fixture.service.onStatus((status) => {
      statuses.push({ ...status });
    });

    const result = await fixture.service.syncAll("manual");

    expect(result.state).toBe("error");

    slow.resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorIndex = statuses.findIndex((status) => status.state === "error");
    const syncingAfterError = statuses
      .slice(errorIndex + 1)
      .filter((status) => status.state === "syncing");
    expect(syncingAfterError).toStrictEqual([]);
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

  it("does not record invite candidates when invite notifications are disabled", async () => {
    const fixture = createFixture();
    fixture.graph.listCalendarView.mockResolvedValue([
      createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null }),
    ]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("records invite candidates when the in-app invite popup is enabled", async () => {
    const fixture = createFixture({ newEventPopupEnabled: true });
    const invite = createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
  });

  it("records invite candidates when system invite notifications are enabled", async () => {
    const fixture = createFixture({ systemInviteNotificationsEnabled: true });
    const invite = createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
  });

  it("records invite candidates when taskbar invite notifications are enabled", async () => {
    const fixture = createFixture({ taskbarInviteNotificationsEnabled: true });
    const invite = createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
  });

  it("records invite candidates once when multiple invite notification modes are enabled", async () => {
    const fixture = createFixture({
      newEventPopupEnabled: true,
      systemInviteNotificationsEnabled: true,
      taskbarInviteNotificationsEnabled: true,
    });
    const invite = createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledOnce();
    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
  });

  it("records only future unanswered invite candidates", async () => {
    expect.hasAssertions();
    const fixture = createFixture({
      currentTime: "2026-03-30T09:30:00.000Z",
      newEventPopupEnabled: true,
    });
    const pastPendingInvite = createEvent({
      end: "2026-03-30T09:30:00.000Z",
      id: "past-pending",
      isOrganizer: false,
      responseStatus: null,
      start: "2026-03-30T09:00:00.000Z",
    });
    const futureAcceptedInvite = createEvent({
      id: "future-accepted",
      isOrganizer: false,
      responseStatus: { response: "accepted", time: "2026-03-30T09:00:00.000Z" },
    });
    const futurePendingInvite = createEvent({
      id: "future-pending",
      isOrganizer: false,
      responseStatus: null,
    });
    fixture.graph.listCalendarView.mockResolvedValue([
      pastPendingInvite,
      futureAcceptedInvite,
      futurePendingInvite,
    ]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledExactlyOnceWith([
      futurePendingInvite,
    ]);
    expect(fixture.db.markNotificationFired).toHaveBeenCalledExactlyOnceWith(
      "calendar-a:future-pending:invite",
    );
    expect(fixture.newEventNotifications.dismiss.mock.calls).toStrictEqual(
      expect.arrayContaining([
        [{ calendarId: "calendar-a", eventId: "past-pending" }],
        [{ calendarId: "calendar-a", eventId: "future-accepted" }],
      ]),
    );
  });

  it("records a pending invite rescheduled from the past into the future", async () => {
    expect.hasAssertions();
    const fixture = createFixture({
      currentTime: "2026-03-30T09:30:00.000Z",
      newEventPopupEnabled: true,
    });
    const previousInvite = createEvent({
      end: "2026-03-30T09:30:00.000Z",
      id: "rescheduled-invite",
      isOrganizer: false,
      responseStatus: null,
      start: "2026-03-30T09:00:00.000Z",
    });
    const rescheduledInvite = createEvent({
      id: "rescheduled-invite",
      isOrganizer: false,
      responseStatus: null,
    });
    fixture.db.hasNotificationFired.mockReturnValue(true);
    fixture.db.listEvents.mockReturnValue([previousInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([rescheduledInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.db.clearNotificationFired).toHaveBeenCalledExactlyOnceWith(
      "calendar-a:rescheduled-invite:invite",
    );
    expect(fixture.newEventNotifications.dismiss).toHaveBeenCalledExactlyOnceWith({
      calendarId: "calendar-a",
      eventId: "rescheduled-invite",
    });
    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledExactlyOnceWith([
      rescheduledInvite,
    ]);
  });

  it("records new pending invite candidates on startup for already synced calendars", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const invite = createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("startup");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
  });

  it("persists startup invite suppression across the first deep backfill", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const invite = createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null });
    const firedMarkers = new Set<string>();
    fixture.db.getDeepBackfillCompletedAt
      .mockReturnValueOnce(null)
      .mockReturnValue("2026-03-30T12:00:00.000Z");
    fixture.db.hasNotificationFired.mockImplementation((key: string) => firedMarkers.has(key));
    fixture.db.markNotificationFired.mockImplementation((key: string) => {
      firedMarkers.add(key);
    });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("startup");
    await fixture.service.syncAll("startup");

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
    expect(fixture.db.markNotificationFired).toHaveBeenCalledExactlyOnceWith(
      "calendar-a:invite-1:invite",
    );
  });

  it("does not re-record a pending invite candidate on startup", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const previousInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
    });
    const updatedInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: {
        response: "notResponded",
        time: null,
      },
    });
    fixture.db.hasNotificationFired.mockReturnValue(true);
    fixture.db.listEvents.mockReturnValue([previousInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([updatedInvite]);

    await fixture.service.syncAll("startup");

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("recovers a pending startup invite without a delivery marker", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const invite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: {
        response: "notResponded",
        time: null,
      },
    });
    fixture.db.listEvents.mockReturnValue([invite]);
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.syncAll("startup");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
    expect(fixture.db.markNotificationFired).toHaveBeenCalledWith("calendar-a:invite-1:invite");
  });

  it("does not record startup invite candidates when invite notifications are disabled", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.graph.listCalendarView.mockResolvedValue([
      createEvent({ id: "invite-1", isOrganizer: false, responseStatus: null }),
    ]);

    await fixture.service.syncAll("startup");

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("clears a response-reset marker while invite notifications are disabled", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const acceptedInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: { response: "accepted", time: "2026-03-29T09:00:00.000Z" },
    });
    const resetInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
    });
    fixture.db.listEvents.mockReturnValue([acceptedInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([resetInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.db.clearNotificationFired).toHaveBeenCalledWith("calendar-a:invite-1:invite");
    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("dismisses a queued invite after it is answered outside the app", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const pendingInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
    });
    const acceptedInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: { response: "accepted", time: "2026-03-29T09:00:00.000Z" },
    });
    fixture.db.listEvents.mockReturnValue([pendingInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([acceptedInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.dismiss).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      eventId: "invite-1",
    });
    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("dismisses a queued invite that is removed from the calendar", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const pendingInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
    });
    fixture.db.listEvents.mockReturnValue([pendingInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.dismiss).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      eventId: "invite-1",
    });
    expect(fixture.db.clearNotificationFired).toHaveBeenCalledWith("calendar-a:invite-1:invite");
  });

  it("records an existing invite when organizer changes reset the attendee response", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const previousInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: {
        response: "accepted",
        time: "2026-03-29T12:00:00.000Z",
      },
    });
    const resetInvite = createEvent({
      end: "2026-03-31T11:00:00.000Z",
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
      start: "2026-03-31T10:00:00.000Z",
    });
    fixture.db.hasNotificationFired.mockReturnValue(true);
    fixture.db.listEvents.mockReturnValue([previousInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([resetInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([resetInvite]);
    expect(fixture.db.clearNotificationFired).toHaveBeenCalledWith("calendar-a:invite-1:invite");
  });

  it("does not record an existing invite that was already awaiting response", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const previousInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
    });
    const updatedInvite = createEvent({
      end: "2026-03-31T11:00:00.000Z",
      id: "invite-1",
      isOrganizer: false,
      responseStatus: {
        response: "notResponded",
        time: null,
      },
      start: "2026-03-31T10:00:00.000Z",
    });
    fixture.db.hasNotificationFired.mockReturnValue(true);
    fixture.db.listEvents.mockReturnValue([previousInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([updatedInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it.each(["accepted", "tentative", "declined"] as const)(
    "does not record an existing invite that remains %s",
    async (response) => {
      expect.hasAssertions();
      const fixture = createFixture({ newEventPopupEnabled: true });
      const previousInvite = createEvent({
        id: "invite-1",
        isOrganizer: false,
        responseStatus: {
          response: "accepted",
          time: "2026-03-29T12:00:00.000Z",
        },
      });
      const updatedInvite = createEvent({
        end: "2026-03-31T11:00:00.000Z",
        id: "invite-1",
        isOrganizer: false,
        responseStatus: {
          response,
          time: "2026-03-30T12:00:00.000Z",
        },
        start: "2026-03-31T10:00:00.000Z",
      });
      fixture.db.listEvents.mockReturnValue([previousInvite]);
      fixture.graph.listCalendarView.mockResolvedValue([updatedInvite]);

      await fixture.service.syncAll("manual");

      expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
    },
  );

  it("continues to record new pending invites by id", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const existingInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: {
        response: "accepted",
        time: "2026-03-29T12:00:00.000Z",
      },
    });
    const newInvite = createEvent({
      id: "invite-2",
      isOrganizer: false,
      responseStatus: null,
    });
    fixture.db.listEvents.mockReturnValue([existingInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([newInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([newInvite]);
  });

  it("uses the final event state when a paged response contains duplicate ids", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const pendingInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: null,
    });
    const acceptedInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      responseStatus: { response: "accepted", time: "2026-03-29T09:00:00.000Z" },
    });
    fixture.graph.listCalendarView.mockResolvedValue([pendingInvite, acceptedInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("does not restore a stale pending response after a newer acceptance", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ newEventPopupEnabled: true });
    const acceptedInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      lastModifiedDateTime: "2026-03-30T09:05:00.000Z",
      responseStatus: { response: "accepted", time: "2026-03-30T09:05:00.000Z" },
    });
    const stalePendingInvite = createEvent({
      id: "invite-1",
      isOrganizer: false,
      lastModifiedDateTime: "2026-03-30T09:00:00.000Z",
      responseStatus: null,
    });
    fixture.db.listEvents.mockReturnValue([acceptedInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([stalePendingInvite]);

    await fixture.service.syncAll("manual");

    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledWith(
      expect.objectContaining({ events: [acceptedInvite] }),
    );
    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("rechecks persisted event versions after all calendar fetches finish", async () => {
    expect.hasAssertions();
    const slowCalendar = createDeferred<CalendarEvent[]>();
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a"), createCalendar("calendar-b")],
      newEventPopupEnabled: true,
    });
    const stalePendingInvite = createEvent({
      calendarId: "calendar-a",
      id: "invite-1",
      isOrganizer: false,
      lastModifiedDateTime: "2026-03-30T09:00:00.000Z",
      responseStatus: null,
    });
    const acceptedInvite = createEvent({
      calendarId: "calendar-a",
      id: "invite-1",
      isOrganizer: false,
      lastModifiedDateTime: "2026-03-30T09:05:00.000Z",
      responseStatus: { response: "accepted", time: "2026-03-30T09:05:00.000Z" },
    });
    fixture.graph.listCalendarView.mockImplementation((calendarId: string) =>
      calendarId === "calendar-a" ? Promise.resolve([stalePendingInvite]) : slowCalendar.promise,
    );
    fixture.db.listEvents.mockImplementation((args: { calendarIds?: string[] }) =>
      args.calendarIds?.[0] === "calendar-a" ? [acceptedInvite] : [],
    );

    const syncPromise = fixture.service.syncAll("manual");
    await vi.waitFor(() => {
      expect(fixture.graph.listCalendarView).toHaveBeenCalledTimes(2);
    });
    await Promise.resolve();

    expect(fixture.db.listEvents).not.toHaveBeenCalled();

    slowCalendar.resolve([]);
    await syncPromise;

    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "calendar-a", events: [acceptedInvite] }),
    );
  });

  it("keeps locally declined attendee events when calendarView omits them", async () => {
    const fixture = createFixture();
    const declinedEvent = createEvent({
      calendarId: "calendar-a",
      id: "declined-event",
      isOrganizer: false,
      responseStatus: {
        response: "declined",
        time: "2026-03-29T12:00:00.000Z",
      },
    });

    fixture.db.listEvents.mockReturnValue([declinedEvent]);
    const statuses: SyncStatus[] = [];
    fixture.service.onStatus((status) => {
      statuses.push({ ...status });
    });

    const status = await fixture.service.syncAll("manual");

    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      events: [declinedEvent],
      rangeEnd: expect.any(String),
      rangeStart: expect.any(String),
    });
    expect(statuses).toContainEqual(
      expect.objectContaining({
        progress: { processedCalendars: 1, processedEvents: 1, totalCalendars: 1 },
        state: "syncing",
      }),
    );
    expect(status.counts).toStrictEqual({ calendars: 1, events: 1 });
  });

  it("does not duplicate a declined event when Graph returns the same meeting under a new id", async () => {
    const fixture = createFixture();
    const localDeclinedEvent = createEvent({
      calendarId: "calendar-a",
      id: "old-id",
      isOrganizer: false,
      responseStatus: {
        response: "declined",
        time: "2026-03-29T12:00:00.000Z",
      },
    });
    const syncedDeclinedEvent = createEvent({
      calendarId: "calendar-a",
      id: "new-id",
      isOrganizer: false,
      responseStatus: {
        response: "declined",
        time: "2026-03-29T12:05:00.000Z",
      },
    });

    fixture.db.listEvents.mockReturnValue([localDeclinedEvent]);
    fixture.graph.listCalendarView.mockResolvedValue([syncedDeclinedEvent]);

    await fixture.service.syncAll("manual");

    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      events: [syncedDeclinedEvent],
      rangeEnd: expect.any(String),
      rangeStart: expect.any(String),
    });
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
      progress: null,
      state: "idle",
      syncWindow: FIXTURE_SYNC_WINDOW,
    });
    expect(fixture.graph.listCalendarView).not.toHaveBeenCalled();
    expect(fixture.db.replaceEventsForCalendarRange).not.toHaveBeenCalled();
    expect(fixture.reminders.checkNow).not.toHaveBeenCalled();
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
      progress: null,
      state: "idle",
      syncWindow: FIXTURE_SYNC_WINDOW,
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
      expect(fixture.graph.listCalendars).not.toHaveBeenCalled();

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
      expect(fixture.graph.listCalendars).not.toHaveBeenCalled();

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
      .mockReturnValueOnce(firstCalendars.promise)
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
      .mockReturnValueOnce(firstCalendars.promise)
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
      .mockReturnValueOnce(firstCalendars.promise)
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
      .mockReturnValueOnce(firstCalendars.promise)
      .mockResolvedValue([createCalendar("calendar-a")]);

    const firstSync = fixture.service.syncAll("manual");
    const overlappingManual = fixture.service.syncAll("manual");

    firstCalendars.resolve([createCalendar("calendar-a")]);

    await Promise.all([firstSync, overlappingManual]);
    await Promise.resolve();

    expect(fixture.graph.listCalendars).toHaveBeenCalledOnce();
  });

  it("fetches the maximum Graph window for calendars that have not been deeply backfilled", async () => {
    const fixture = createFixture();
    fixture.db.getDeepBackfillCompletedAt.mockReturnValue(null);

    const before = Date.now();
    await fixture.service.syncAll("manual");
    const after = Date.now();

    expect(fixture.graph.listCalendarView).toHaveBeenCalledOnce();
    const [, rangeStart, rangeEnd] = fixture.graph.listCalendarView.mock.calls[0] as [
      string,
      string,
      string,
    ];
    const rangeStartMs = new Date(rangeStart).getTime();
    const rangeEndMs = new Date(rangeEnd).getTime();
    const maxBackfillMs = (1825 - FIXTURE_LOOKAHEAD_DAYS) * DAY_MS;
    expect(rangeStartMs).toBeGreaterThanOrEqual(before - maxBackfillMs);
    expect(rangeStartMs).toBeLessThanOrEqual(after - maxBackfillMs);
    expect(rangeEndMs - rangeStartMs).toBeLessThanOrEqual(1825 * DAY_MS);
    expect(fixture.db.markDeepBackfillCompleted).toHaveBeenCalledWith(
      "calendar-a",
      expect.any(String),
    );
  });

  it("uses the rolling lookbehind window for calendars already deeply backfilled", async () => {
    const fixture = createFixture();
    fixture.db.getDeepBackfillCompletedAt.mockReturnValue("2025-01-01T00:00:00.000Z");

    const before = Date.now();
    await fixture.service.syncAll("manual");
    const after = Date.now();

    expect(fixture.graph.listCalendarView).toHaveBeenCalledOnce();
    const [, rangeStart] = fixture.graph.listCalendarView.mock.calls[0] as [string, string];
    const rangeStartMs = new Date(rangeStart).getTime();
    const lookbehindMs = FIXTURE_LOOKBEHIND_DAYS * DAY_MS;
    expect(rangeStartMs).toBeGreaterThanOrEqual(before - lookbehindMs);
    expect(rangeStartMs).toBeLessThanOrEqual(after - lookbehindMs);
    expect(fixture.db.markDeepBackfillCompleted).not.toHaveBeenCalled();
  });

  it("marks deep backfill complete only for calendars that needed it", async () => {
    const fixture = createFixture({
      calendars: [createCalendar("calendar-a"), createCalendar("calendar-b")],
      visibleCalendarIds: ["calendar-a", "calendar-b"],
    });
    fixture.db.getDeepBackfillCompletedAt.mockImplementation((calendarId: string) =>
      calendarId === "calendar-a" ? "2025-01-01T00:00:00.000Z" : null,
    );

    await fixture.service.syncAll("manual");

    expect(fixture.db.markDeepBackfillCompleted).toHaveBeenCalledOnce();
    expect(fixture.db.markDeepBackfillCompleted).toHaveBeenCalledWith(
      "calendar-b",
      expect.any(String),
    );
  });

  it("skips on-demand event range fetches when no calendar ids are provided", async () => {
    expect.hasAssertions();
    const fixture = createFixture();

    await fixture.service.ensureEventsRange({
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.db.listUncoveredCalendarSyncRanges).not.toHaveBeenCalled();
    expect(fixture.graph.listCalendarView).not.toHaveBeenCalled();
    expect(fixture.db.replaceEventsForCalendarRange).not.toHaveBeenCalled();
    expect(fixture.db.recordCalendarSyncRange).not.toHaveBeenCalled();
  });

  it("skips on-demand event range fetches when the range is already covered", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.db.listUncoveredCalendarSyncRanges.mockReturnValue([]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.graph.listCalendarView).not.toHaveBeenCalled();
    expect(fixture.db.replaceEventsForCalendarRange).not.toHaveBeenCalled();
    expect(fixture.db.recordCalendarSyncRange).not.toHaveBeenCalled();
  });

  it("recovers cached pending invites when an on-demand range is already covered", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ taskbarInviteNotificationsEnabled: true });
    const invite = createEvent({
      end: "2026-11-19T09:30:00.000Z",
      id: "pending-invite",
      isOrganizer: false,
      responseStatus: null,
      start: "2026-11-19T09:00:00.000Z",
    });
    fixture.db.listUncoveredCalendarSyncRanges.mockReturnValue([]);
    fixture.db.listEvents.mockReturnValue([invite]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.graph.listCalendarView).not.toHaveBeenCalled();
    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
    expect(fixture.db.markNotificationFired).toHaveBeenCalledWith(
      "calendar-a:pending-invite:invite",
    );
  });

  it("checks on-demand coverage freshness before skipping a range", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));

    try {
      const fixture = createFixture();
      fixture.db.listUncoveredCalendarSyncRanges.mockReturnValue([]);

      await fixture.service.ensureEventsRange({
        calendarIds: ["calendar-a"],
        end: "2026-11-30T23:00:00.000Z",
        start: "2026-11-01T00:00:00.000Z",
      });

      expect(fixture.db.listUncoveredCalendarSyncRanges).toHaveBeenCalledWith(
        "calendar-a",
        "2026-11-01T00:00:00.000Z",
        "2026-11-30T23:00:00.000Z",
        "2026-07-01T12:00:00.000Z",
      );
      expect(fixture.graph.listCalendarView).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reject on-demand range checks when Graph fetch fails", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.graph.listCalendarView.mockRejectedValue(new Error("Graph unavailable"));

    await expect(
      fixture.service.ensureEventsRange({
        calendarIds: ["calendar-a"],
        end: "2026-11-30T23:00:00.000Z",
        start: "2026-11-01T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();

    expect(fixture.db.replaceEventsForCalendarRange).not.toHaveBeenCalled();
    expect(fixture.db.recordCalendarSyncRange).not.toHaveBeenCalled();
  });

  it("fetches uncovered on-demand event ranges and records coverage", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const fetchedEvent = createEvent({
      id: "fetched-event",
      start: "2026-11-19T09:00:00.000Z",
      end: "2026-11-19T09:30:00.000Z",
    });
    const declinedEvent = createEvent({
      id: "declined-event",
      isOrganizer: false,
      responseStatus: {
        response: "declined",
        time: "2026-11-01T09:00:00.000Z",
      },
      start: "2026-11-20T09:00:00.000Z",
      end: "2026-11-20T09:30:00.000Z",
    });
    fixture.graph.listCalendarView.mockResolvedValue([fetchedEvent]);
    fixture.db.listEvents.mockReturnValue([declinedEvent]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.graph.listCalendarView).toHaveBeenCalledWith(
      "calendar-a",
      "2026-11-01T00:00:00.000Z",
      "2026-11-30T23:00:00.000Z",
      "account-1",
    );
    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      events: [fetchedEvent, declinedEvent],
      rangeEnd: "2026-11-30T23:00:00.000Z",
      rangeStart: "2026-11-01T00:00:00.000Z",
    });
    expect(fixture.db.recordCalendarSyncRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      preserveOverlappingCoverage: true,
      rangeEnd: "2026-11-30T23:00:00.000Z",
      rangeStart: "2026-11-01T00:00:00.000Z",
      syncedAt: expect.any(String),
    });
    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("records pending invites discovered by an on-demand event range fetch", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ taskbarInviteNotificationsEnabled: true });
    const invite = createEvent({
      end: "2026-11-19T09:30:00.000Z",
      id: "pending-invite",
      isOrganizer: false,
      responseStatus: {
        response: "notResponded",
        time: null,
      },
      start: "2026-11-19T09:00:00.000Z",
    });
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
    expect(fixture.db.markNotificationFired).toHaveBeenCalledWith(
      "calendar-a:pending-invite:invite",
    );
  });

  it("recovers a stored pending invite whose notification was never recorded", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ taskbarInviteNotificationsEnabled: true });
    const invite = createEvent({
      end: "2026-11-19T09:30:00.000Z",
      id: "pending-invite",
      isOrganizer: false,
      responseStatus: {
        response: "notResponded",
        time: null,
      },
      start: "2026-11-19T09:00:00.000Z",
    });
    fixture.db.listEvents.mockReturnValue([invite]);
    fixture.graph.listCalendarView.mockResolvedValue([invite]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.newEventNotifications.recordCandidates).toHaveBeenCalledWith([invite]);
    expect(fixture.db.markNotificationFired).toHaveBeenCalledWith(
      "calendar-a:pending-invite:invite",
    );
  });

  it("does not re-record pending invites already stored during an on-demand fetch", async () => {
    expect.hasAssertions();
    const fixture = createFixture({ taskbarInviteNotificationsEnabled: true });
    const storedInvite = createEvent({
      end: "2026-11-19T09:30:00.000Z",
      id: "pending-invite",
      isOrganizer: false,
      responseStatus: null,
      start: "2026-11-19T09:00:00.000Z",
    });
    const fetchedInvite = createEvent({
      ...storedInvite,
      responseStatus: {
        response: "notResponded",
        time: null,
      },
    });
    fixture.db.hasNotificationFired.mockReturnValue(true);
    fixture.db.listEvents.mockReturnValue([storedInvite]);
    fixture.graph.listCalendarView.mockResolvedValue([fetchedInvite]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.newEventNotifications.recordCandidates).not.toHaveBeenCalled();
  });

  it("fetches only uncovered slices for partially covered on-demand ranges", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const fetchedEvent = createEvent({
      id: "partial-range-event",
      start: "2026-11-15T09:00:00.000Z",
      end: "2026-11-15T09:30:00.000Z",
    });
    fixture.db.listUncoveredCalendarSyncRanges.mockReturnValue([
      {
        rangeEnd: "2026-11-20T00:00:00.000Z",
        rangeStart: "2026-11-10T00:00:00.000Z",
      },
    ]);
    fixture.graph.listCalendarView.mockResolvedValue([fetchedEvent]);

    await fixture.service.ensureEventsRange({
      calendarIds: ["calendar-a"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    });

    expect(fixture.graph.listCalendarView).toHaveBeenCalledWith(
      "calendar-a",
      "2026-11-10T00:00:00.000Z",
      "2026-11-20T00:00:00.000Z",
      "account-1",
    );
    expect(fixture.db.replaceEventsForCalendarRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      events: [fetchedEvent],
      rangeEnd: "2026-11-20T00:00:00.000Z",
      rangeStart: "2026-11-10T00:00:00.000Z",
    });
    expect(fixture.db.recordCalendarSyncRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      preserveOverlappingCoverage: true,
      rangeEnd: "2026-11-20T00:00:00.000Z",
      rangeStart: "2026-11-10T00:00:00.000Z",
      syncedAt: expect.any(String),
    });
  });

  it("records sync range coverage during regular sync", async () => {
    expect.hasAssertions();
    const fixture = createFixture();

    await fixture.service.syncAll("manual");

    expect(fixture.db.recordCalendarSyncRange).toHaveBeenCalledWith({
      calendarId: "calendar-a",
      rangeEnd: expect.any(String),
      rangeStart: expect.any(String),
      syncedAt: expect.any(String),
    });
  });
});
