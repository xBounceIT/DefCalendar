import { beforeEach, describe, expect, it, vi } from "vitest";

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
    isDestroyed: vi.fn().mockReturnValue(false),
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
    ownsWebContents: vi.fn((contents: unknown) => contents === reminderWebContents),
  };
  const settings = {
    getSettings: vi.fn().mockReturnValue({
      syncIntervalMinutes: 15,
      visibleCalendarIds: [],
    }),
  };
  const sync = {
    getStatus: vi.fn().mockReturnValue(syncStatus),
    onStatus: vi.fn(),
    refreshSchedule: vi.fn(),
    reset: vi.fn(),
    syncAll: vi.fn().mockResolvedValue(syncStatus),
  };
  const updates = {
    onStatus: vi.fn(),
  };

  registerIpc({
    auth: auth as never,
    db: db as never,
    getMainWindow: () => mainWindow as never,
    graph: graph as never,
    reminderManager: reminderManager as never,
    reminders: reminders as never,
    settings: settings as never,
    sync: sync as never,
    updates: updates as never,
  });

  return {
    auth,
    db,
    graph,
    handlers,
    mainWebContents,
    reminderWebContents,
    reminders,
    sync,
  };
}

describe("register ipc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
