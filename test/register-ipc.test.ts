import { beforeEach, describe, expect, it, vi } from "vitest";

import EventActionService from "../src/main/events/event-action-service";
import registerIpc from "../src/main/ipc/register-ipc";
import { IPC_CHANNELS } from "../src/shared/ipc";

const { app, ipcMain, shell } = vi.hoisted(() => ({
  app: {
    getLocale: vi.fn().mockReturnValue("en-US"),
    getVersion: vi.fn().mockReturnValue("0.1.0"),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock(import("@main/electron-runtime"), () => ({
  app,
  ipcMain,
  shell,
}));

function createCalendarEvent() {
  return {
    allowNewTimeProposals: true,
    attachments: [],
    attendees: [],
    body: null,
    bodyContentType: "html" as const,
    bodyPreview: null,
    calendarId: "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: "2026-03-30T11:00:00.000Z",
    etag: '"etag-1"',
    hasAttachments: false,
    id: "event-1",
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
    reminderMinutesBeforeStart: 15,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal" as const,
    seriesMasterId: null,
    showAs: "busy" as const,
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning",
    timeZone: "Europe/Rome",
    type: null,
    unsupportedReason: null,
    webLink: "https://example.com/events/event-1",
  };
}

function createEventDraft(overrides?: { id?: string }) {
  return {
    attachmentIdsToRemove: [],
    attachmentsToAdd: [],
    attendees: [],
    calendarId: "calendar-1",
    end: "2026-03-30T11:00:00.000Z",
    id: overrides?.id,
    isAllDay: false,
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning",
    timeZone: "Europe/Rome",
  };
}

function createDeferred<T>() {
  let resolveDeferred: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });

  return {
    promise,
    resolve: resolveDeferred,
  };
}

function createFixture() {
  const handlers = new Map<
    string,
    (event: { sender: unknown }, input?: unknown) => Promise<unknown>
  >();
  const mainWebContents = { send: vi.fn() };
  const reminderWebContents = {};
  const mainWindow = {
    focus: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isMinimized: vi.fn().mockReturnValue(false),
    restore: vi.fn(),
    show: vi.fn(),
    webContents: mainWebContents,
  };
  const syncStatus = {
    counts: null,
    lastSyncedAt: null,
    message: "Idle",
    messageKey: null,
    state: "idle" as const,
  };
  const storedEvent = createCalendarEvent();

  ipcMain.handle.mockImplementation(
    (
      channel: string,
      handler: (event: { sender: unknown }, input?: unknown) => Promise<unknown>,
    ) => {
      handlers.set(channel, handler);
    },
  );

  const auth = {
    getAccountIds: vi.fn().mockReturnValue(["account-1"]),
    getActiveAccountId: vi.fn().mockReturnValue("account-1"),
    getAuthState: vi.fn(),
    hasSession: vi.fn().mockReturnValue(true),
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchAccount: vi.fn(),
  };
  const db = {
    clearUserData: vi.fn(),
    deleteEvent: vi.fn(),
    getCalendarHomeAccountId: vi.fn().mockReturnValue("account-1"),
    getEvent: vi.fn().mockReturnValue(storedEvent),
    listCalendars: vi.fn().mockReturnValue([]),
    listEvents: vi.fn(),
    searchContacts: vi.fn().mockReturnValue([
      { email: "alice@example.com", name: "Alice Example" },
      { email: "bob@example.com", name: null },
    ]),
    searchEvents: vi.fn().mockReturnValue([storedEvent]),
    upsertEvent: vi.fn(),
  };
  const graph = {
    addAttachment: vi.fn().mockResolvedValue([]),
    cancelEvent: vi.fn().mockResolvedValue(undefined),
    createEvent: vi.fn().mockResolvedValue(storedEvent),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    forwardEvent: vi.fn().mockResolvedValue(undefined),
    listContacts: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue(storedEvent),
    listAttachments: vi.fn().mockResolvedValue([]),
    listOutlookCategories: vi
      .fn()
      .mockResolvedValue([{ color: "preset7", displayName: "Blue category" }]),
    removeAttachment: vi.fn().mockResolvedValue([]),
    respondToEvent: vi.fn().mockResolvedValue(undefined),
    updateEvent: vi.fn().mockResolvedValue(storedEvent),
  };
  const reminders = {
    checkNow: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
    getState: vi.fn(),
    snooze: vi.fn(),
  };
  const reminderManager = {
    minimize: vi.fn(),
    ownsWebContents: vi.fn((contents: unknown) => contents === reminderWebContents),
  };
  const settings = {
    getSettings: vi.fn().mockReturnValue({
      newEventPopupEnabled: false,
      systemInviteNotificationsEnabled: false,
      taskbarInviteNotificationsEnabled: false,
      syncIntervalMinutes: 15,
      visibleCalendarIds: [],
    }),
    updateSettings: vi.fn((patch: Record<string, unknown>) => ({
      newEventPopupEnabled: false,
      systemInviteNotificationsEnabled: false,
      taskbarInviteNotificationsEnabled: false,
      syncIntervalMinutes: 15,
      visibleCalendarIds: [],
      ...patch,
    })),
  };
  const sync = {
    ensureEventsRange: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue(syncStatus),
    onStatus: vi.fn(),
    refreshSchedule: vi.fn(),
    reset: vi.fn(),
    syncAll: vi.fn().mockResolvedValue(syncStatus),
  };
  const updates = {
    onStatus: vi.fn(),
    setAllowPrerelease: vi.fn(),
  };

  const newEventNotifications = {
    clear: vi.fn(),
    dismiss: vi.fn(),
    getItems: vi.fn().mockReturnValue([]),
    onChange: vi.fn(),
    recordCandidates: vi.fn(),
  };
  const eventActions = new EventActionService({
    db: db as never,
    getMainWindow: () => mainWindow as never,
    graph: graph as never,
    newEventNotifications: newEventNotifications as never,
    reminders: reminders as never,
    sync: sync as never,
  });
  const systemInviteNotifications = {
    refresh: vi.fn(),
  };
  const taskbarInviteAttention = {
    refresh: vi.fn(),
  };

  registerIpc({
    auth: auth as never,
    db: db as never,
    eventActions,
    getMainWindow: () => mainWindow as never,
    graph: graph as never,
    newEventNotifications: newEventNotifications as never,
    reminderManager: reminderManager as never,
    reminders: reminders as never,
    settings: settings as never,
    systemInviteNotifications: systemInviteNotifications as never,
    taskbarInviteAttention: taskbarInviteAttention as never,
    sync: sync as never,
    updates: updates as never,
  });

  return {
    auth,
    db,
    graph,
    handlers,
    mainWebContents,
    mainWindow,
    reminderManager,
    reminderWebContents,
    reminders,
    sync,
    systemInviteNotifications,
    taskbarInviteAttention,
  };
}

describe("register ipc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensures the requested event range before listing cached events", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const args = {
      calendarIds: ["calendar-1"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    };
    const storedEvent = createCalendarEvent();
    fixture.db.listEvents.mockReturnValue([storedEvent]);

    const response = await fixture.handlers.get(IPC_CHANNELS.eventsList)?.(invokeEvent, args);

    expect(fixture.sync.ensureEventsRange).toHaveBeenCalledWith(args);
    expect(fixture.db.listEvents).toHaveBeenCalledWith(args);
    expect(fixture.sync.ensureEventsRange.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.db.listEvents.mock.invocationCallOrder[0],
    );
    expect(response).toStrictEqual([storedEvent]);
  });

  it("falls back to cached events when range fetching fails", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const args = {
      calendarIds: ["calendar-1"],
      end: "2026-11-30T23:00:00.000Z",
      start: "2026-11-01T00:00:00.000Z",
    };
    const storedEvent = createCalendarEvent();
    fixture.sync.ensureEventsRange.mockRejectedValue(new Error("Graph unavailable"));
    fixture.db.listEvents.mockReturnValue([storedEvent]);

    const response = await fixture.handlers.get(IPC_CHANNELS.eventsList)?.(invokeEvent, args);

    expect(fixture.sync.ensureEventsRange).toHaveBeenCalledWith(args);
    expect(fixture.db.listEvents).toHaveBeenCalledWith(args);
    expect(response).toStrictEqual([storedEvent]);
  });

  it("refreshes reminders before the background sync after reminder-affecting event mutations", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await fixture.handlers.get(IPC_CHANNELS.eventsCreate)?.(invokeEvent, createEventDraft());
    await fixture.handlers.get(IPC_CHANNELS.eventsUpdate)?.(
      invokeEvent,
      createEventDraft({ id: "event-1" }),
    );
    await fixture.handlers.get(IPC_CHANNELS.eventsDelete)?.(invokeEvent, {
      calendarId: "calendar-1",
      etag: '"etag-1"',
      eventId: "event-1",
    });
    await fixture.handlers.get(IPC_CHANNELS.eventsCancel)?.(invokeEvent, {
      calendarId: "calendar-1",
      comment: "",
      eventId: "event-1",
    });

    expect(fixture.reminders.checkNow).toHaveBeenCalledTimes(4);
    expect(fixture.sync.syncAll).toHaveBeenNthCalledWith(1, "mutation", "account-1");
    expect(fixture.sync.syncAll).toHaveBeenNthCalledWith(2, "mutation", "account-1");
    expect(fixture.sync.syncAll).toHaveBeenNthCalledWith(3, "mutation", "account-1");
    expect(fixture.sync.syncAll).toHaveBeenNthCalledWith(4, "mutation", "account-1");
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[0],
    );
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[1]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[1],
    );
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[2]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[2],
    );
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[3]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[3],
    );
  });

  it("allows reminder windows to open external links", async () => {
    const fixture = createFixture();
    const url = "https://teams.microsoft.com/l/meetup-join/example";

    await fixture.handlers.get(IPC_CHANNELS.eventsOpenWebLink)?.(
      { sender: fixture.reminderWebContents },
      url,
    );

    expect(shell.openExternal).toHaveBeenCalledWith(url);
  });

  it("allows reminder windows to open cached events in the main app", async () => {
    const fixture = createFixture();

    await fixture.handlers.get(IPC_CHANNELS.eventsOpenInApp)?.(
      { sender: fixture.reminderWebContents },
      {
        calendarId: "calendar-1",
        eventId: "event-1",
      },
    );

    expect(fixture.db.getEvent).toHaveBeenCalledWith("calendar-1", "event-1");
    expect(fixture.mainWindow.show).toHaveBeenCalledOnce();
    expect(fixture.mainWindow.focus).toHaveBeenCalledOnce();
    expect(fixture.mainWebContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.eventsOpenInAppRequested,
      expect.objectContaining({ id: "event-1" }),
    );
    expect(fixture.reminderManager.minimize).toHaveBeenCalledOnce();
  });

  it("restores a minimized main window before opening a reminder event", async () => {
    const fixture = createFixture();
    fixture.mainWindow.isMinimized.mockReturnValue(true);

    await fixture.handlers.get(IPC_CHANNELS.eventsOpenInApp)?.(
      { sender: fixture.reminderWebContents },
      {
        calendarId: "calendar-1",
        eventId: "event-1",
      },
    );

    expect(fixture.mainWindow.restore).toHaveBeenCalledOnce();
  });

  it("leaves the reminder window visible when a reminder event is missing from cache", async () => {
    const fixture = createFixture();
    fixture.db.getEvent.mockReturnValue(null);

    await fixture.handlers.get(IPC_CHANNELS.eventsOpenInApp)?.(
      { sender: fixture.reminderWebContents },
      {
        calendarId: "calendar-1",
        eventId: "missing-event",
      },
    );

    expect(fixture.mainWebContents.send).not.toHaveBeenCalledWith(
      IPC_CHANNELS.eventsOpenInAppRequested,
      expect.anything(),
    );
    expect(fixture.reminderManager.minimize).not.toHaveBeenCalled();
  });

  it("rejects in-app event open requests from untrusted senders", async () => {
    const fixture = createFixture();

    await expect(
      fixture.handlers.get(IPC_CHANNELS.eventsOpenInApp)?.(
        { sender: {} },
        {
          calendarId: "calendar-1",
          eventId: "event-1",
        },
      ),
    ).rejects.toThrow("Rejected IPC request from an untrusted sender.");
    expect(fixture.mainWebContents.send).not.toHaveBeenCalled();
  });

  it("rejects external link requests from untrusted senders", async () => {
    const fixture = createFixture();
    const url = "https://example.com";

    await expect(
      fixture.handlers.get(IPC_CHANNELS.eventsOpenWebLink)?.({ sender: {} }, url),
    ).rejects.toThrow("Rejected IPC request from an untrusted sender.");
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("lists outlook categories for an account", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    const response = await fixture.handlers.get(IPC_CHANNELS.categoriesList)?.(invokeEvent, {
      homeAccountId: "account-1",
    });

    expect(fixture.graph.listOutlookCategories).toHaveBeenCalledWith("account-1");
    expect(response).toStrictEqual([{ color: "preset7", displayName: "Blue category" }]);
  });

  it("returns the signed-in auth state without waiting for sign-in sync", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const handler = fixture.handlers.get(IPC_CHANNELS.authSignIn);
    const state = {
      account: {
        color: "#5b7cfa",
        homeAccountId: "account-1",
        name: "Daniel D'Angeli",
        tenantId: "tenant-1",
        username: "daniel.dangeli@syncsecurity.it",
      },
      accounts: [],
      activeAccountId: "account-1",
      status: "signed_in" as const,
    };
    const deferredSync = createDeferred<unknown>();

    fixture.auth.signIn.mockResolvedValue(state);
    fixture.sync.syncAll.mockReturnValue(deferredSync.promise);

    let resolvedState: null | typeof state = null;
    if (!handler) {
      throw new Error("Auth sign-in handler was not registered.");
    }

    void handler(invokeEvent, { mode: "user" }).then((value) => {
      resolvedState = value as typeof state;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resolvedState).toStrictEqual(state);
    expect(fixture.sync.syncAll).toHaveBeenCalledWith("sign-in");
    expect(fixture.mainWebContents.send).toHaveBeenCalledWith(IPC_CHANNELS.authStateChanged, state);

    deferredSync.resolve(fixture.sync.getStatus());
  });

  it("searches cached events with the parsed query and calendar filter", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    const response = await fixture.handlers.get(IPC_CHANNELS.eventsSearch)?.(invokeEvent, {
      calendarIds: ["calendar-1"],
      limit: 10,
      query: "planning",
    });

    expect(fixture.db.searchEvents).toHaveBeenCalledWith({
      calendarIds: ["calendar-1"],
      limit: 10,
      query: "planning",
      sort: "recent",
    });
    expect(response).toStrictEqual([createCalendarEvent()]);
  });

  it("rejects event search input that fails schema validation", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await expect(
      fixture.handlers.get(IPC_CHANNELS.eventsSearch)?.(invokeEvent, {
        limit: 10,
        query: "x",
      }),
    ).rejects.toThrow();

    expect(fixture.db.searchEvents).not.toHaveBeenCalled();
  });

  it("searches cached contacts for an account", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    const response = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(invokeEvent, {
      homeAccountId: "account-1",
      limit: 5,
      query: "ali",
    });

    expect(fixture.db.searchContacts).toHaveBeenCalledWith({
      homeAccountId: "account-1",
      limit: 5,
      query: "ali",
    });
    expect(response).toStrictEqual([
      { email: "alice@example.com", name: "Alice Example" },
      { email: "bob@example.com", name: null },
    ]);
  });

  it("refreshes invite notification services when settings change", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    const response = await fixture.handlers.get(IPC_CHANNELS.settingsUpdate)?.(invokeEvent, {
      systemInviteNotificationsEnabled: true,
      taskbarInviteNotificationsEnabled: true,
    });

    expect(response).toMatchObject({
      systemInviteNotificationsEnabled: true,
      taskbarInviteNotificationsEnabled: true,
    });
    expect(fixture.systemInviteNotifications.refresh).toHaveBeenCalledOnce();
    expect(fixture.taskbarInviteAttention.refresh).toHaveBeenCalledOnce();
  });

  it("keeps a declined attendee event locally when Graph can no longer fetch it", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const attendeeEvent = {
      ...createCalendarEvent(),
      isOrganizer: false,
    };

    fixture.db.getEvent.mockReturnValue(attendeeEvent);
    fixture.graph.getEvent.mockRejectedValueOnce(
      new Error("The specified object was not found in the store."),
    );

    await fixture.handlers.get(IPC_CHANNELS.eventsRespond)?.(invokeEvent, {
      action: "decline",
      calendarId: "calendar-1",
      comment: "",
      eventId: "event-1",
      sendResponse: false,
    });

    expect(fixture.graph.respondToEvent).toHaveBeenCalledWith(
      {
        action: "decline",
        calendarId: "calendar-1",
        comment: "",
        eventId: "event-1",
        sendResponse: false,
      },
      "account-1",
    );
    expect(fixture.db.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-1",
        isReminderOn: false,
        responseStatus: expect.objectContaining({
          response: "declined",
          time: expect.any(String),
        }),
      }),
    );
    expect(fixture.reminders.checkNow).toHaveBeenCalledOnce();
    expect(fixture.sync.syncAll).toHaveBeenCalledWith("mutation", "account-1");
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[0],
    );
  });

  it("waits for sync when deleting a recurring series from an occurrence", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await fixture.handlers.get(IPC_CHANNELS.eventsDelete)?.(invokeEvent, {
      calendarId: "calendar-1",
      eventId: "event-1",
      targetEventId: "series-1",
    });

    expect(fixture.graph.deleteEvent).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "account-1",
      undefined,
      "series-1",
    );
    expect(fixture.db.deleteEvent).not.toHaveBeenCalled();
    expect(fixture.sync.syncAll).toHaveBeenCalledWith("mutation", "account-1");
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[0],
    );
  });

  it("waits for sync when accepting a recurring series from an occurrence", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await fixture.handlers.get(IPC_CHANNELS.eventsRespond)?.(invokeEvent, {
      action: "accept",
      calendarId: "calendar-1",
      comment: "",
      eventId: "event-1",
      sendResponse: true,
      targetEventId: "series-1",
    });

    expect(fixture.graph.respondToEvent).toHaveBeenCalledWith(
      {
        action: "accept",
        calendarId: "calendar-1",
        comment: "",
        eventId: "event-1",
        sendResponse: true,
        targetEventId: "series-1",
      },
      "account-1",
    );
    expect(fixture.graph.getEvent).not.toHaveBeenCalled();
    expect(fixture.db.upsertEvent).not.toHaveBeenCalled();
    expect(fixture.sync.syncAll).toHaveBeenCalledWith("mutation", "account-1");
    expect(fixture.reminders.checkNow.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.sync.syncAll.mock.invocationCallOrder[0],
    );
  });

  it("forwards an event and triggers a background sync", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await fixture.handlers.get(IPC_CHANNELS.eventsForward)?.(invokeEvent, {
      calendarId: "calendar-1",
      comment: "Please join in my place",
      eventId: "event-1",
      toRecipients: [{ email: "alice@example.com", name: "Alice Example" }],
    });

    expect(fixture.graph.forwardEvent).toHaveBeenCalledWith(
      {
        calendarId: "calendar-1",
        comment: "Please join in my place",
        eventId: "event-1",
        toRecipients: [{ email: "alice@example.com", name: "Alice Example" }],
      },
      "account-1",
    );
    expect(fixture.reminders.checkNow).not.toHaveBeenCalled();
    expect(fixture.sync.syncAll).toHaveBeenCalledWith("mutation", "account-1");
  });

  it("returns cached attachments when Graph reports the event is gone", async () => {
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const cachedAttachments = [
      {
        contentType: "text/plain",
        id: "attachment-1",
        isInline: false,
        name: "agenda.txt",
        size: 123,
      },
    ];

    fixture.db.getEvent.mockReturnValue({
      ...createCalendarEvent(),
      attachments: cachedAttachments,
      hasAttachments: true,
    });
    fixture.graph.listAttachments.mockRejectedValueOnce(
      new Error("The process failed to get the correct properties."),
    );

    const response = await fixture.handlers.get(IPC_CHANNELS.eventsListAttachments)?.(invokeEvent, {
      calendarId: "calendar-1",
      eventId: "event-1",
    });

    expect(response).toStrictEqual(cachedAttachments);
    expect(fixture.db.upsertEvent).not.toHaveBeenCalled();
  });
});
