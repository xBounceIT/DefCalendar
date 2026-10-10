import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import EventActionService from "../src/main/events/event-action-service";
import registerIpc from "../src/main/ipc/register-ipc";
import PhotonLocationService from "../src/main/locations/photon-location-service";
import OsmMapService from "../src/main/locations/osm-map-service";
import { IPC_CHANNELS } from "../src/shared/ipc";
import { createDefaultSettings, type ContactSuggestion } from "../src/shared/schemas";

const { app, dialog, ipcMain, shell } = vi.hoisted(() => ({
  app: {
    getLocale: vi.fn().mockReturnValue("en-US"),
    getPath: vi.fn().mockReturnValue(String.raw`C:\tmp`),
    getVersion: vi.fn().mockReturnValue("0.1.0"),
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn().mockResolvedValue(""),
  },
}));

vi.mock(import("@main/electron-runtime"), () => ({
  app,
  dialog,
  ipcMain,
  net: { fetch: vi.fn() },
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
  let rejectDeferred: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return {
    promise,
    reject: rejectDeferred,
    resolve: resolveDeferred,
  };
}

function createFixture() {
  const handlers = new Map<
    string,
    (event: { sender: unknown }, input?: unknown) => Promise<unknown>
  >();
  const spellingSession = {
    on: vi.fn(),
    addWordToSpellCheckerDictionary: vi.fn().mockReturnValue(true),
    availableSpellCheckerLanguages: ["en-US", "it", "fr"],
    listWordsInSpellCheckerDictionary: vi.fn().mockResolvedValue(["DefCalendar"]),
    removeWordFromSpellCheckerDictionary: vi.fn().mockReturnValue(true),
    setSpellCheckerLanguages: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
  };
  const mainWebContents = { send: vi.fn(), session: spellingSession };
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

  const assertAccountSession = vi.fn();
  const auth = {
    onSessionValidation: vi.fn(),
    createAccountSessionGuard: vi.fn().mockReturnValue(assertAccountSession),
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
    getContactByEmail: vi
      .fn<(homeAccountId: string, email: string) => ContactSuggestion | null>()
      .mockReturnValue(null),
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
    getContactPhoto: vi.fn().mockResolvedValue("data:image/jpeg;base64,cGhvdG8="),
    getAttendeeAvailability: vi
      .fn()
      .mockResolvedValue([{ email: "coworker@example.com", status: "busy" }]),
    addAttachment: vi.fn().mockResolvedValue([]),
    cancelEvent: vi.fn().mockResolvedValue(undefined),
    createEvent: vi.fn().mockResolvedValue(storedEvent),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    forwardEvent: vi.fn().mockResolvedValue(undefined),
    listContacts: vi.fn().mockResolvedValue([]),
    searchPeople: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue(storedEvent),
    getAttachmentContent: vi.fn().mockResolvedValue({
      attachment: {
        attachmentType: "file",
        contentType: "text/plain",
        id: "attachment-1",
        isInline: false,
        name: "agenda.txt",
        size: 5,
      },
      buffer: Buffer.from("hello"),
      contentType: "text/plain",
    }),
    getAttachmentMetadata: vi.fn().mockResolvedValue({
      attachmentType: "file",
      contentType: "text/plain",
      id: "attachment-1",
      isInline: false,
      name: "agenda.txt",
      size: 5,
    }),
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
      ...createDefaultSettings(),
      newEventPopupEnabled: false,
      systemInviteNotificationsEnabled: false,
      taskbarInviteNotificationsEnabled: false,
      syncIntervalMinutes: 15,
      visibleCalendarIds: [],
    }),
    updateSettings: vi.fn((patch: Record<string, unknown>) => ({
      ...createDefaultSettings(),
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
    auth: auth as never,
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
    assertAccountSession,
    auth,
    settings,
    db,
    graph,
    handlers,
    mainWebContents,
    mainWindow,
    newEventNotifications,
    reminderManager,
    reminderWebContents,
    reminders,
    sync,
    systemInviteNotifications,
    taskbarInviteAttention,
  };
}

describe("register ipc", () => {
  it("validates map coordinates and sender before loading tiles", async () => {
    expect.hasAssertions();
    const map = vi.spyOn(OsmMapService.prototype, "render").mockResolvedValue([]);
    onTestFinished(() => map.mockRestore());
    const fixture = createFixture();
    const handler = fixture.handlers.get(IPC_CHANNELS.locationsMap)!;
    await expect(handler({ sender: {} }, { latitude: 0, longitude: 0 })).rejects.toThrow(
      "untrusted sender",
    );
    await expect(
      handler({ sender: fixture.mainWebContents }, { latitude: 100, longitude: 0 }),
    ).rejects.toThrow();
    expect(map).not.toHaveBeenCalled();
    await expect(
      handler({ sender: fixture.mainWebContents }, { latitude: 0, longitude: 0 }),
    ).resolves.toStrictEqual([]);
    expect(map).toHaveBeenCalledExactlyOnceWith({ latitude: 0, longitude: 0 });
  });

  it.each([IPC_CHANNELS.eventsCreate, IPC_CHANNELS.eventsUpdate])(
    "stores and returns local physical place preferences after %s",
    async (channel) => {
      expect.hasAssertions();
      const fixture = createFixture();
      const coordinates = { latitude: 41.8902, longitude: 12.4922 };
      const result = await fixture.handlers.get(channel)!(
        { sender: fixture.mainWebContents },
        {
          ...createEventDraft({ id: "event-1" }),
          location: "Room 3",
          isPhysicalLocation: true,
          locationCoordinates: coordinates,
        },
      );
      expect(result).toMatchObject({ isPhysicalLocation: true, locationCoordinates: coordinates });
      expect(fixture.db.upsertEvent).toHaveBeenCalledWith(
        expect.objectContaining({ isPhysicalLocation: true, locationCoordinates: coordinates }),
      );
    },
  );

  it("validates location search input and sender before calling Photon", async () => {
    const search = vi
      .spyOn(PhotonLocationService.prototype, "search")
      .mockResolvedValue([{ label: "Roma, Italia" }]);
    try {
      const fixture = createFixture();
      const handler = fixture.handlers.get(IPC_CHANNELS.locationsSearch)!;
      await expect(handler({ sender: {} }, { query: "Roma", language: "it" })).rejects.toThrow(
        "untrusted sender",
      );
      await expect(
        handler({ sender: fixture.mainWebContents }, { query: "ab", language: "it" }),
      ).rejects.toThrow();
      await expect(
        handler({ sender: fixture.mainWebContents }, { query: "Roma", language: "xx" }),
      ).rejects.toThrow();
      expect(search).not.toHaveBeenCalled();
      await expect(
        handler({ sender: fixture.mainWebContents }, { query: " Roma ", language: "it" }),
      ).resolves.toEqual([{ label: "Roma, Italia" }]);
      expect(search).toHaveBeenCalledWith({ query: "Roma", language: "it" });
    } finally {
      search.mockRestore();
    }
  });

  it("does not persist spelling settings when a native setter fails", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.mainWebContents.session.setSpellCheckerEnabled.mockImplementationOnce(() => {
      throw new Error("Native setter failed");
    });
    await expect(
      fixture.handlers.get(IPC_CHANNELS.settingsUpdate)!(
        { sender: fixture.mainWebContents },
        { spellcheckEnabled: false },
      ),
    ).rejects.toThrow("Native setter failed");
    expect(fixture.settings.updateSettings).not.toHaveBeenCalled();
    expect(fixture.mainWebContents.session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(true);
  });

  it("restores native spelling settings when persistence fails", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.settings.updateSettings.mockImplementationOnce(() => {
      throw new Error("Database write failed");
    });
    await expect(
      fixture.handlers.get(IPC_CHANNELS.settingsUpdate)!(
        { sender: fixture.mainWebContents },
        { spellcheckEnabled: false },
      ),
    ).rejects.toThrow("Database write failed");
    expect(fixture.mainWebContents.session.setSpellCheckerEnabled.mock.calls).toStrictEqual([
      [false],
      [true],
    ]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("broadcasts automatic session validation changes without waiting for a sync", () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const state = {
      status: "signed_out",
      accounts: [],
      sessionIssues: [
        {
          homeAccountId: "account-1",
          username: "one@example.com",
          reason: "missing_permissions",
          missingPermissions: ["People.Read"],
        },
      ],
    };
    expect(fixture.auth.onSessionValidation).toHaveBeenCalledOnce();
    fixture.auth.onSessionValidation.mock.calls[0][0](state);

    expect(fixture.mainWebContents.send).toHaveBeenCalledExactlyOnceWith(
      IPC_CHANNELS.authStateChanged,
      state,
    );
    expect(fixture.sync.syncAll).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "clears in-memory alerts after automatic removal (another account remains: %s)",
    async (hasOtherAccount) => {
      expect.hasAssertions();
      const fixture = createFixture();
      const state = hasOtherAccount
        ? {
            status: "signed_in",
            accounts: [{ homeAccountId: "account-2" }],
          }
        : { status: "signed_out", accounts: [] };

      fixture.auth.onSessionValidation.mock.calls[0][0](state, "account-1");

      expect(fixture.newEventNotifications.clear).toHaveBeenCalledOnce();
      expect(fixture.reminders.checkNow).toHaveBeenCalledOnce();
      expect(fixture.mainWebContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.authStateChanged,
        state,
      );
      expect(fixture.sync.reset).toHaveBeenCalledOnce();
      expect(fixture.sync.syncAll.mock.calls).toEqual(hasOtherAccount ? [["manual"]] : []);
    },
  );

  it("starts a fresh surviving-account sync after manual sign-out", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const previousSync = createDeferred<ReturnType<typeof fixture.sync.getStatus>>();
    const state = { status: "signed_in", accounts: [{ homeAccountId: "account-2" }] };
    let previousSyncActive = true;
    let completed = false;
    fixture.auth.getAuthState.mockReturnValue(state);
    fixture.sync.reset.mockImplementation(() => {
      previousSyncActive = false;
    });
    fixture.sync.syncAll.mockImplementation(() =>
      previousSyncActive ? previousSync.promise : Promise.resolve(fixture.sync.getStatus()),
    );

    const request = fixture.handlers.get(IPC_CHANNELS.authSignOut)!(
      { sender: fixture.mainWebContents },
      "account-1",
    ).then((result) => {
      completed = true;
      return result;
    });

    try {
      await vi.waitFor(() => expect(completed).toBe(true), { timeout: 200 });
      expect(await request).toEqual(state);
      expect(fixture.sync.syncAll).toHaveBeenCalledExactlyOnceWith("manual");
      expect(fixture.db.clearUserData).toHaveBeenCalledExactlyOnceWith("account-1");
    } finally {
      previousSync.resolve(fixture.sync.getStatus());
      await request;
    }
  });

  it.each([
    [IPC_CHANNELS.eventsCreate, "createEvent", createEventDraft(), createCalendarEvent()],
    [
      IPC_CHANNELS.eventsUpdate,
      "updateEvent",
      createEventDraft({ id: "event-1" }),
      createCalendarEvent(),
    ],
    [
      IPC_CHANNELS.eventsDelete,
      "deleteEvent",
      { calendarId: "calendar-1", eventId: "event-1" },
      undefined,
    ],
    [
      IPC_CHANNELS.eventsCancel,
      "cancelEvent",
      { calendarId: "calendar-1", eventId: "event-1" },
      undefined,
    ],
    [
      IPC_CHANNELS.eventsListAttachments,
      "listAttachments",
      { calendarId: "calendar-1", eventId: "event-1" },
      [],
    ],
    [
      IPC_CHANNELS.eventsRespond,
      "getEvent",
      { calendarId: "calendar-1", eventId: "event-1", action: "accept", sendResponse: true },
      createCalendarEvent(),
    ],
    [
      IPC_CHANNELS.eventsRemoveAttachment,
      "getEvent",
      { calendarId: "calendar-1", eventId: "event-1", attachmentId: "attachment-1" },
      createCalendarEvent(),
    ],
    [
      IPC_CHANNELS.eventsAddAttachment,
      "getEvent",
      {
        calendarId: "calendar-1",
        eventId: "event-1",
        attachment: { name: "note.txt", contentType: "text/plain", contentBytes: "aGk=", size: 2 },
      },
      createCalendarEvent(),
    ],
    [
      IPC_CHANNELS.eventsForward,
      "forwardEvent",
      {
        calendarId: "calendar-1",
        eventId: "event-1",
        toRecipients: [{ email: "alice@example.com", name: "Alice" }],
      },
      undefined,
    ],
  ] as const)(
    "discards late Graph results for %s after the account session changes",
    async (channel, method, input, result) => {
      expect.hasAssertions();
      const fixture = createFixture();
      const deferred = createDeferred<unknown>();
      fixture.graph[method].mockReturnValueOnce(deferred.promise);
      const request = fixture.handlers.get(channel)!({ sender: fixture.mainWebContents }, input);
      const settledRequest = request.catch((error: unknown) => error);
      await vi.waitFor(() => expect(fixture.graph[method]).toHaveBeenCalledOnce());
      fixture.assertAccountSession.mockImplementation(() => {
        throw new Error("The Microsoft 365 session changed during the request.");
      });
      deferred.resolve(result);

      await expect(settledRequest).resolves.toBeInstanceOf(Error);
      expect(fixture.db.upsertEvent).not.toHaveBeenCalled();
      expect(fixture.db.deleteEvent).not.toHaveBeenCalled();
      expect(fixture.sync.syncAll).not.toHaveBeenCalled();
    },
  );

  it("does not schedule a mutation sync if the session changes while reminders are checked", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const deferred = createDeferred<void>();
    fixture.reminders.checkNow.mockReturnValueOnce(deferred.promise);
    const request = fixture.handlers.get(IPC_CHANNELS.eventsCreate)!(
      { sender: fixture.mainWebContents },
      createEventDraft(),
    );
    const settledRequest = request.catch((error: unknown) => error);
    await vi.waitFor(() => expect(fixture.reminders.checkNow).toHaveBeenCalledOnce());
    fixture.assertAccountSession.mockImplementation(() => {
      throw new Error("The Microsoft 365 session changed during the request.");
    });
    deferred.resolve();

    await expect(settledRequest).resolves.toBeInstanceOf(Error);
    expect(fixture.sync.syncAll).not.toHaveBeenCalled();
  });

  it("does not restore a declined event from the cache after sign-out when Graph returns not found", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.graph.getEvent.mockImplementationOnce(async () => {
      fixture.assertAccountSession.mockImplementation(() => {
        throw new Error("The Microsoft 365 session changed during the request.");
      });
      throw new Error("The specified object was not found in the store.");
    });

    await expect(
      fixture.handlers.get(IPC_CHANNELS.eventsRespond)!(
        { sender: fixture.mainWebContents },
        { calendarId: "calendar-1", eventId: "event-1", action: "decline" },
      ),
    ).rejects.toThrow("session changed");
    expect(fixture.db.upsertEvent).not.toHaveBeenCalled();
    expect(fixture.sync.syncAll).not.toHaveBeenCalled();
  });

  it("validates availability requests and resolves the account from the selected calendar", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.db.getCalendarHomeAccountId.mockReturnValue("account-2");
    const handler = fixture.handlers.get(IPC_CHANNELS.attendeesGetAvailability)!;
    const args = {
      calendarId: "calendar-2",
      emails: ["coworker@example.com"],
      start: "2026-09-29T09:00:00Z",
      end: "2026-09-29T10:00:00Z",
    };
    expect(await handler({ sender: fixture.mainWebContents }, args)).toEqual([
      { email: "coworker@example.com", status: "busy" },
    ]);
    expect(fixture.graph.getAttendeeAvailability).toHaveBeenCalledWith(args, "account-2");
    await expect(handler({ sender: fixture.reminderWebContents }, args)).rejects.toThrow();
    await expect(
      handler({ sender: fixture.mainWebContents }, { ...args, end: args.start }),
    ).rejects.toThrow();
    expect(fixture.graph.getAttendeeAvailability).toHaveBeenCalledTimes(1);
  });

  it("preserves availability failure flags but strips meeting details at the IPC boundary", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.graph.getAttendeeAvailability.mockResolvedValueOnce([
      {
        email: "coworker@example.com",
        status: "unknown",
        error: "requestFailed",
        subject: "Private meeting",
        accessToken: "secret",
        schedule: {
          start: "2026-09-29T09:00:00Z",
          end: "2026-09-29T10:00:00Z",
          slots: [
            {
              start: "2026-09-29T09:30:00Z",
              end: "2026-09-29T10:00:00Z",
              status: "busy",
              subject: "Private meeting",
              location: "Private room",
            },
          ],
        },
      },
    ] as never);
    const result = await fixture.handlers.get(IPC_CHANNELS.attendeesGetAvailability)!(
      { sender: fixture.mainWebContents },
      {
        calendarId: "calendar-1",
        emails: ["coworker@example.com"],
        start: "2026-09-29T09:00:00Z",
        end: "2026-09-29T10:00:00Z",
      },
    );
    expect(result).toEqual([
      {
        email: "coworker@example.com",
        status: "unknown",
        error: "requestFailed",
        schedule: {
          start: "2026-09-29T09:00:00Z",
          end: "2026-09-29T10:00:00Z",
          slots: [{ start: "2026-09-29T09:30:00Z", end: "2026-09-29T10:00:00Z", status: "busy" }],
        },
      },
    ]);
  });

  it("lists and removes dictionary words only for the main window", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const event = { sender: fixture.mainWebContents };
    const get = fixture.handlers.get(IPC_CHANNELS.spellcheckGetDictionaries)!;
    const remove = fixture.handlers.get(IPC_CHANNELS.spellcheckRemoveWord)!;
    await expect(get(event)).resolves.toMatchObject({
      availableLanguages: ["en-US", "it", "fr"],
      customWords: ["DefCalendar"],
    });
    await remove(event, "DefCalendar");
    expect(
      fixture.mainWebContents.session.removeWordFromSpellCheckerDictionary,
    ).toHaveBeenCalledWith("DefCalendar");
    await expect(get({ sender: {} })).rejects.toThrow("untrusted sender");
    await expect(remove({ sender: {} }, "DefCalendar")).rejects.toThrow("untrusted sender");
    await expect(remove(event, "two words")).rejects.toThrow();
  });

  it("adds dictionary words through the main window and reports native failures", async () => {
    const fixture = createFixture();
    const add = fixture.handlers.get(IPC_CHANNELS.spellcheckAddWord)!;
    const nativeAdd = fixture.mainWebContents.session.addWordToSpellCheckerDictionary;
    const event = { sender: fixture.mainWebContents };
    await expect(add(event, "  CaffèTech  ")).resolves.toBeUndefined();
    expect(nativeAdd).toHaveBeenCalledWith("CaffèTech");
    nativeAdd.mockClear();
    await expect(add({ sender: {} }, "Contoso")).rejects.toThrow("untrusted sender");
    expect(nativeAdd).not.toHaveBeenCalled();
    nativeAdd.mockReturnValue(false);
    await expect(add(event, "Contoso")).rejects.toThrow("Could not add word to dictionary");
  });

  it.each([
    "",
    "   ",
    "two words",
    "two\nwords",
    "bad\u0000word",
    "bad\u0007word",
    "x".repeat(257),
    null,
    123,
  ])("rejects invalid dictionary input %j before calling the native API", async (input) => {
    const fixture = createFixture();
    const add = fixture.handlers.get(IPC_CHANNELS.spellcheckAddWord)!;
    await expect(add({ sender: fixture.mainWebContents }, input)).rejects.toThrow();
    expect(fixture.mainWebContents.session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
  });

  it("defers applying dictionaries until spell checking is enabled", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const update = fixture.handlers.get(IPC_CHANNELS.settingsUpdate)!;
    const event = { sender: fixture.mainWebContents };
    await update(event, { spellcheckLanguages: ["it"], spellcheckEnabled: false });
    expect(fixture.mainWebContents.session.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
    expect(fixture.mainWebContents.session.setSpellCheckerLanguages).not.toHaveBeenCalled();
    await update(event, { spellcheckLanguages: ["it"], spellcheckEnabled: true });
    expect(fixture.mainWebContents.session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(true);
    expect(fixture.mainWebContents.session.setSpellCheckerLanguages.mock.calls).toStrictEqual(
      process.platform === "darwin" ? [] : [[["it"]]],
    );
  });

  it.skipIf(process.platform === "darwin")(
    "rejects unsupported language dictionaries",
    async () => {
      expect.hasAssertions();
      const fixture = createFixture();
      const update = fixture.handlers.get(IPC_CHANNELS.settingsUpdate)!;
      await expect(
        update({ sender: fixture.mainWebContents }, { spellcheckLanguages: ["xx"] }),
      ).rejects.toThrow("Unsupported spelling dictionary");
    },
  );

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

  it("dismisses one invite through a validated calendar and event reference", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const args = { calendarId: "calendar-1", eventId: "event-1" };
    const handler = fixture.handlers.get(IPC_CHANNELS.newEventNotificationsDismiss);

    await handler?.(invokeEvent, args);

    expect(fixture.newEventNotifications.dismiss).toHaveBeenCalledWith(args);
    await expect(handler?.(invokeEvent, "event-1")).rejects.toThrow();
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

  it("broadcasts the updated account state when incomplete consent rejects a re-sign-in", async () => {
    const fixture = createFixture();
    const state = { status: "signed_out", accounts: [] };
    fixture.auth.signIn.mockRejectedValue(new Error("Missing required permissions"));
    fixture.auth.getAuthState.mockReturnValue(state);

    await expect(
      fixture.handlers.get(IPC_CHANNELS.authSignIn)?.(
        { sender: fixture.mainWebContents },
        { mode: "user" },
      ),
    ).rejects.toThrow("Missing required permissions");

    expect(fixture.mainWebContents.send).toHaveBeenCalledWith(IPC_CHANNELS.authStateChanged, state);
    expect(fixture.sync.syncAll).not.toHaveBeenCalled();
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

  it("browses relevant people before cached contacts without a query and preserves photo identifiers", async () => {
    const fixture = createFixture();
    fixture.db.searchContacts.mockReturnValue([
      { contactId: "contact-1", email: "alice@example.com", name: "Alice" },
    ]);
    fixture.graph.searchPeople.mockResolvedValueOnce([
      { email: "zoe@example.com", name: "Zoe" },
      {
        email: "ALICE@example.com",
        name: "Alice From Graph",
        userPrincipalName: "alice@tenant.onmicrosoft.com",
      },
    ]);
    const response = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(
      { sender: fixture.mainWebContents },
      { homeAccountId: "account-1", limit: null, query: "" },
    );
    expect(response).toEqual([
      { email: "zoe@example.com", name: "Zoe" },
      {
        contactId: "contact-1",
        email: "alice@example.com",
        name: "Alice",
        userPrincipalName: "alice@tenant.onmicrosoft.com",
      },
    ]);
    expect(fixture.graph.searchPeople).toHaveBeenCalledWith(
      "account-1",
      "",
      25,
      expect.any(AbortSignal),
    );
  });

  it("loads a photo for the validated contact and account", async () => {
    const fixture = createFixture();
    const args = {
      contactId: "contact-1",
      email: "alice@example.com",
      homeAccountId: "account-1",
      name: "Alice",
    };
    const response = await fixture.handlers.get(IPC_CHANNELS.contactsGetPhoto)?.(
      { sender: fixture.mainWebContents },
      args,
    );
    expect(response).toBe("data:image/jpeg;base64,cGhvdG8=");
    expect(fixture.graph.getContactPhoto).toHaveBeenCalledWith("account-1", args);
  });

  it.each(["success", "failure", "timeout"])(
    "discards contact suggestions after the account session changes on Graph %s",
    async (outcome) => {
      expect.hasAssertions();
      vi.useFakeTimers();
      try {
        const fixture = createFixture();
        const people = createDeferred<ContactSuggestion[]>();
        fixture.graph.searchPeople.mockReturnValueOnce(people.promise);
        const request = fixture.handlers.get(IPC_CHANNELS.contactsSearch)!(
          { sender: fixture.mainWebContents },
          { homeAccountId: "account-1", limit: null, query: "" },
        );
        const settledRequest = request.catch((error: unknown) => error);
        fixture.assertAccountSession.mockImplementation(() => {
          throw new Error("The Microsoft 365 session changed during the request.");
        });
        if (outcome === "success") {
          people.resolve([{ email: "zoe@example.com", name: "Zoe" }]);
        } else if (outcome === "failure") {
          people.reject(new Error("People unavailable"));
        } else {
          await vi.advanceTimersByTimeAsync(500);
        }
        await expect(settledRequest).resolves.toStrictEqual(
          new Error("The Microsoft 365 session changed during the request."),
        );
        expect(fixture.auth.createAccountSessionGuard).toHaveBeenCalledWith("account-1");
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("rejects contact searches for a removed account before reading cached contacts", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    fixture.auth.createAccountSessionGuard.mockImplementationOnce(() => {
      throw new Error("The Microsoft 365 session changed during the request.");
    });
    await expect(
      fixture.handlers.get(IPC_CHANNELS.contactsSearch)!(
        { sender: fixture.mainWebContents },
        { homeAccountId: "removed-account", limit: null, query: "" },
      ),
    ).rejects.toThrow("session changed");
    expect(fixture.db.searchContacts).not.toHaveBeenCalled();
    expect(fixture.graph.searchPeople).not.toHaveBeenCalled();
  });

  it("uses the saved contact photo identity for fuzzy people results and event participants", async () => {
    const fixture = createFixture();
    const contact = {
      contactId: "personal-andra",
      email: "andra.pantea@example.com",
      name: null,
    };
    fixture.db.getContactByEmail.mockReturnValue(contact);
    fixture.db.searchContacts.mockReturnValue([]);
    fixture.graph.searchPeople.mockResolvedValue([{ email: contact.email, name: "Andra Pantea" }]);
    const event = { sender: fixture.mainWebContents };
    const results = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(event, {
      homeAccountId: "account-1",
      limit: null,
      query: "andra.panta",
    });
    expect(results).toEqual([{ email: contact.email, name: "Andra Pantea" }]);
    for (const name of ["Andra Pantea", null]) {
      await fixture.handlers.get(IPC_CHANNELS.contactsGetPhoto)?.(event, {
        email: contact.email,
        homeAccountId: "account-1",
        name,
      });
      expect(fixture.db.getContactByEmail).toHaveBeenLastCalledWith("account-1", contact.email);
      expect(fixture.graph.getContactPhoto).toHaveBeenLastCalledWith("account-1", {
        ...contact,
        homeAccountId: "account-1",
      });
    }
  });

  it("searches cached contacts for an account", async () => {
    expect.hasAssertions();

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
    expect(fixture.graph.searchPeople).toHaveBeenCalledWith(
      "account-1",
      "ali",
      5,
      expect.any(AbortSignal),
    );
    expect(response).toStrictEqual([
      { email: "alice@example.com", name: "Alice Example" },
      { email: "bob@example.com", name: null },
    ]);
  });

  it("preserves Graph relevance order and merges cached contacts without duplicates", async () => {
    expect.hasAssertions();

    const fixture = createFixture();
    fixture.graph.searchPeople.mockResolvedValueOnce([
      { email: "volpe@example.com", name: "Volpe Francesco" },
      {
        email: "ALICE@example.com",
        name: "Alice From Graph",
        userPrincipalName: "alice@tenant.onmicrosoft.com",
      },
    ]);
    const invokeEvent = { sender: fixture.mainWebContents };

    const response = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(invokeEvent, {
      homeAccountId: "account-1",
      limit: 5,
      query: "volpe",
    });

    expect(response).toStrictEqual([
      { email: "volpe@example.com", name: "Volpe Francesco" },
      {
        email: "alice@example.com",
        name: "Alice Example",
        userPrincipalName: "alice@tenant.onmicrosoft.com",
      },
      { email: "bob@example.com", name: null },
    ]);
  });

  it.each(["", "ali"])(
    "returns cached contacts when Graph search fails for query '%s'",
    async (query) => {
      expect.hasAssertions();

      const fixture = createFixture();
      fixture.graph.searchPeople.mockRejectedValueOnce(new Error("People unavailable"));
      const invokeEvent = { sender: fixture.mainWebContents };

      const response = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(invokeEvent, {
        homeAccountId: "account-1",
        limit: 5,
        query,
      });

      expect(response).toStrictEqual([
        { email: "alice@example.com", name: "Alice Example" },
        { email: "bob@example.com", name: null },
      ]);
    },
  );

  it.each([
    { cached: [{ email: "alice@example.com", name: "Alice" }], deadline: 500, query: "alice" },
    { cached: [], deadline: 5_000, query: "alice" },
    { cached: [{ email: "alice@example.com", name: "Alice" }], deadline: 500, query: "" },
    { cached: [], deadline: 5_000, query: "" },
  ])(
    "bounds the directory wait to $deadline ms when Graph does not settle",
    async ({ cached, deadline, query }) => {
      vi.useFakeTimers();
      try {
        const fixture = createFixture();
        fixture.db.searchContacts.mockReturnValue(cached);
        const people = createDeferred<ContactSuggestion[]>();
        fixture.graph.searchPeople.mockReturnValue(people.promise);
        const response = fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(
          { sender: fixture.mainWebContents },
          { homeAccountId: "account-1", limit: null, query },
        );
        let settled = false;
        void response?.then(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(deadline - 1);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const result = await response;
        expect(result).toEqual(cached);
        expect(fixture.graph.searchPeople.mock.calls[0][3].aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        people.resolve([{ email: "late@example.com", name: "Late Directory Match" }]);
        await vi.advanceTimersByTimeAsync(0);
        expect(result).toEqual(cached);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("merges a prompt directory result and cancels its deadline", async () => {
    vi.useFakeTimers();
    try {
      const fixture = createFixture();
      fixture.graph.searchPeople.mockResolvedValueOnce([
        { email: "remote@example.com", name: "Remote" },
      ]);
      const result = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(
        { sender: fixture.mainWebContents },
        { homeAccountId: "account-1", limit: null, query: "remote" },
      );
      expect(result).toEqual([
        { email: "remote@example.com", name: "Remote" },
        { email: "alice@example.com", name: "Alice Example" },
        { email: "bob@example.com", name: null },
      ]);
      expect(vi.getTimerCount()).toBe(0);
      expect(fixture.graph.searchPeople.mock.calls[0][3].aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("searches relevant people for one-character contact queries", async () => {
    expect.hasAssertions();

    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(invokeEvent, {
      homeAccountId: "account-1",
      limit: 5,
      query: "a",
    });

    expect(fixture.graph.searchPeople).toHaveBeenCalledWith(
      "account-1",
      "a",
      5,
      expect.any(AbortSignal),
    );
  });

  it("prioritizes Graph matches even when cached contacts fill the requested limit", async () => {
    expect.hasAssertions();

    const fixture = createFixture();
    fixture.graph.searchPeople.mockResolvedValueOnce([
      { email: "zoe@example.com", name: "Zoe" },
      { email: "ZOE@example.com", name: "Duplicate" },
      { email: "alice@example.com", name: "Alice From Graph" },
      { email: "remote@example.com", name: "Remote" },
    ]);
    const invokeEvent = { sender: fixture.mainWebContents };

    const response = await fixture.handlers.get(IPC_CHANNELS.contactsSearch)?.(invokeEvent, {
      homeAccountId: "account-1",
      limit: 2,
      query: "ali",
    });

    expect(fixture.graph.searchPeople).toHaveBeenCalledWith(
      "account-1",
      "ali",
      2,
      expect.any(AbortSignal),
    );
    expect(response).toStrictEqual([
      { email: "zoe@example.com", name: "Zoe" },
      { email: "alice@example.com", name: "Alice Example" },
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

  it("opens attachments through the default app from trusted main senders", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };

    await fixture.handlers.get(IPC_CHANNELS.eventsOpenAttachment)?.(invokeEvent, {
      attachmentId: "attachment-1",
      calendarId: "calendar-1",
      eventId: "event-1",
    });

    expect(fixture.graph.getAttachmentContent).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "attachment-1",
      "account-1",
    );
    expect(shell.openPath).toHaveBeenCalledOnce();
    expect(String(shell.openPath.mock.calls[0]?.[0])).toMatch(/agenda\.txt$/);
  });

  it("rejects attachment open requests from untrusted senders", async () => {
    expect.hasAssertions();
    const fixture = createFixture();

    await expect(
      fixture.handlers.get(IPC_CHANNELS.eventsOpenAttachment)?.(
        { sender: {} },
        {
          attachmentId: "attachment-1",
          calendarId: "calendar-1",
          eventId: "event-1",
        },
      ),
    ).rejects.toThrow("Rejected IPC request from an untrusted sender.");
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  it("returns false when attachment download is cancelled", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const response = await fixture.handlers.get(IPC_CHANNELS.eventsDownloadAttachment)?.(
      invokeEvent,
      {
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      },
    );

    expect(response).toBe(false);
    expect(fixture.graph.getAttachmentMetadata).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "attachment-1",
      "account-1",
    );
    expect(fixture.graph.getAttachmentContent).not.toHaveBeenCalled();
    expect(dialog.showSaveDialog).toHaveBeenCalledOnce();
  });

  it("rejects reference attachment downloads before prompting for a save location", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    fixture.graph.getAttachmentMetadata.mockResolvedValueOnce({
      attachmentType: "reference",
      contentType: null,
      id: "reference-1",
      isInline: false,
      name: "cloud-file.docx",
      size: 0,
    });

    await expect(
      fixture.handlers.get(IPC_CHANNELS.eventsDownloadAttachment)?.(invokeEvent, {
        attachmentId: "reference-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      }),
    ).rejects.toThrow("Cloud link attachments cannot be downloaded directly.");
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(fixture.graph.getAttachmentContent).not.toHaveBeenCalled();
  });

  it("writes selected attachment downloads", async () => {
    expect.hasAssertions();
    const fixture = createFixture();
    const invokeEvent = { sender: fixture.mainWebContents };
    const filePath = path.join(
      tmpdir(),
      `defcalendar-attachment-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath });

    let response: unknown = null;
    try {
      response = await fixture.handlers.get(IPC_CHANNELS.eventsDownloadAttachment)?.(invokeEvent, {
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      });
      await expect(readFile(filePath, "utf8")).resolves.toBe("hello");
    } finally {
      await rm(filePath, { force: true });
    }
    expect(response).toBe(true);
    expect(fixture.graph.getAttachmentContent).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "attachment-1",
      "account-1",
      expect.objectContaining({ id: "attachment-1" }),
    );
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
