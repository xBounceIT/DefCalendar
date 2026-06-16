import type { CalendarApi, NewEventNotificationItem } from "@shared/ipc";
import type {
  AppUpdateStatus,
  AuthState,
  CalendarEvent,
  CalendarSummary,
  RespondToEventArgs,
  SyncStatus,
  UserSettings,
} from "@shared/schemas";

const account = {
  color: "#2563eb",
  homeAccountId: "mock-account",
  lastSignedInAt: "2026-06-16T08:00:00.000Z",
  name: "Demo User",
  tenantId: "mock-tenant",
  username: "demo@example.com",
};

const inviteStart = "2026-06-16T09:00:00.000Z";
const inviteEnd = "2026-06-16T10:00:00.000Z";

const calendars: CalendarSummary[] = [
  {
    canEdit: true,
    canShare: false,
    color: "#2563eb",
    homeAccountId: account.homeAccountId,
    id: "calendar-primary",
    isDefaultCalendar: true,
    isVisible: true,
    name: "Demo calendar",
    ownerAddress: account.username,
    ownerName: account.name,
    userColor: "#2563eb",
  },
  {
    canEdit: true,
    canShare: false,
    color: "#16a34a",
    homeAccountId: account.homeAccountId,
    id: "calendar-team",
    isDefaultCalendar: false,
    isVisible: true,
    name: "Team calendar",
    ownerAddress: "team@example.com",
    ownerName: "Team calendar",
    userColor: "#16a34a",
  },
];

function createEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    allowNewTimeProposals: true,
    attachments: [],
    attendees: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: "calendar-primary",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: inviteEnd,
    etag: null,
    hasAttachments: false,
    id: "event-1",
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
    start: inviteStart,
    subject: "Demo event",
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

const invitation = createEvent({
  attendees: [
    {
      email: account.username,
      name: account.name,
      response: "none",
      status: { response: "none", time: null },
      type: "required",
    },
  ],
  id: "invite-product-review",
  isOrganizer: false,
  location: "Conference Room A",
  organizer: {
    email: "organizer@example.com",
    name: "Ari Organizer",
    response: null,
    type: "required",
  },
  responseStatus: { response: "none", time: null },
  subject: "Product review invitation",
});

const conflict = createEvent({
  calendarId: "calendar-team",
  end: "2026-06-16T09:45:00.000Z",
  id: "busy-roadmap-sync",
  location: "Teams",
  organizer: {
    email: "lead@example.com",
    name: "Mira Lead",
    response: null,
    type: "required",
  },
  start: "2026-06-16T08:45:00.000Z",
  subject: "Roadmap sync",
});

const nonConflict = createEvent({
  end: "2026-06-16T11:30:00.000Z",
  id: "adjacent-follow-up",
  start: "2026-06-16T10:30:00.000Z",
  subject: "Follow-up block",
});

const events = [invitation, conflict, nonConflict];

const newEventItems: NewEventNotificationItem[] = [
  {
    calendarId: invitation.calendarId,
    end: invitation.end,
    eventId: invitation.id,
    isAllDay: invitation.isAllDay,
    location: invitation.location,
    onlineMeetingJoinUrl: null,
    organizerEmail: invitation.organizer?.email ?? null,
    organizerName: invitation.organizer?.name ?? null,
    start: invitation.start,
    subject: invitation.subject,
  },
];

const authState: AuthState = {
  account,
  accounts: [account],
  activeAccountId: account.homeAccountId,
  status: "signed_in",
};

const settings: UserSettings = {
  activeAccountId: account.homeAccountId,
  activeView: "timeGridWeek",
  language: "en",
  localReminderOverrideEnabled: false,
  localReminderRules: [{ minutes: 15, when: "before" }],
  newEventPopupEnabled: true,
  selectedDate: "2026-06-16T09:00:00.000Z",
  syncIntervalMinutes: 15,
  timeFormat: "24h",
  updateChannel: "stable",
  visibleCalendarIds: calendars.map((calendar) => calendar.id),
};

const syncStatus: SyncStatus = {
  counts: {
    calendars: calendars.length,
    events: events.length,
  },
  lastSyncedAt: "2026-06-16T08:30:00.000Z",
  message: "Synced 2 calendars, 3 events.",
  messageKey: "sync.synced",
  state: "idle",
};

const updateStatus: AppUpdateStatus = {
  checkedAt: null,
  currentVersion: "0.5.4",
  downloadPercent: null,
  error: null,
  latestVersion: null,
  releaseNotes: null,
  state: "idle",
};

function rangesOverlap(start: string, end: string, rangeStart: string, rangeEnd: string): boolean {
  return new Date(start).getTime() < new Date(rangeEnd).getTime()
    && new Date(end).getTime() > new Date(rangeStart).getTime();
}

function createMockCalendarApi(): CalendarApi {
  let currentCalendars = calendars;
  let currentSettings = settings;
  let currentNewEventItems = [...newEventItems];
  const newEventListeners = new Set<(items: NewEventNotificationItem[]) => void>();

  function emitNewEventItems(): void {
    const items = [...currentNewEventItems];
    for (const listener of newEventListeners) {
      listener(items);
    }
  }

  return {
    app: {
      getLocale: async () => "en-US",
      getVersion: async () => "0.5.4",
      setLocale: async () => undefined,
    },
    auth: {
      getState: async () => authState,
      onState: () => () => undefined,
      signInWithExchange365: async () => authState,
      signOut: async () => ({ accounts: [account], status: "signed_out" }),
      switchAccount: async () => authState,
    },
    calendars: {
      list: async () => currentCalendars,
      setColor: async ({ calendarId, color }) => {
        currentCalendars = currentCalendars.map((calendar) =>
          calendar.id === calendarId ? { ...calendar, userColor: color } : calendar,
        );
        return currentCalendars;
      },
      setVisibility: async ({ calendarId, isVisible }) => {
        currentCalendars = currentCalendars.map((calendar) =>
          calendar.id === calendarId ? { ...calendar, isVisible } : calendar,
        );
        return currentCalendars;
      },
    },
    categories: {
      list: async () => [
        { color: "preset4", displayName: "Review" },
        { color: "preset10", displayName: "Focus" },
      ],
    },
    contacts: {
      search: async () => [],
    },
    events: {
      addAttachment: async () => [],
      cancel: async () => undefined,
      create: async (draft) => createEvent({ ...draft, id: `created-${Date.now()}` }),
      delete: async () => undefined,
      forward: async () => undefined,
      list: async ({ calendarIds, end, start }) => {
        const calendarIdSet = new Set(calendarIds ?? currentCalendars.map((calendar) => calendar.id));
        return events.filter(
          (event) =>
            calendarIdSet.has(event.calendarId) && rangesOverlap(event.start, event.end, start, end),
        );
      },
      listAttachments: async () => [],
      onOpenInApp: () => () => undefined,
      openInApp: async () => undefined,
      openWebLink: async () => undefined,
      removeAttachment: async () => [],
      respond: async (args: RespondToEventArgs) => {
        currentNewEventItems = currentNewEventItems.filter((item) => item.eventId !== args.eventId);
        emitNewEventItems();
      },
      search: async () => events,
      update: async (draft) => createEvent({ ...draft, id: draft.id ?? `updated-${Date.now()}` }),
    },
    newEventNotifications: {
      dismiss: async (eventId) => {
        currentNewEventItems = currentNewEventItems.filter((item) => item.eventId !== eventId);
        emitNewEventItems();
      },
      dismissAll: async () => {
        currentNewEventItems = [];
        emitNewEventItems();
      },
      get: async () => currentNewEventItems,
      onChanged: (listener) => {
        newEventListeners.add(listener);
        return () => {
          newEventListeners.delete(listener);
        };
      },
    },
    reminder: {
      dismiss: async () => undefined,
      dismissAll: async () => undefined,
      getState: async () => ({
        items: [],
        locale: "en",
        timeFormat: currentSettings.timeFormat,
      }),
      minimizeWindow: async () => undefined,
      onState: () => () => undefined,
      snooze: async () => undefined,
    },
    settings: {
      get: async () => currentSettings,
      update: async (patch) => {
        currentSettings = {
          ...currentSettings,
          ...patch,
        };
        return currentSettings;
      },
    },
    sync: {
      getStatus: async () => syncStatus,
      onStatus: () => () => undefined,
      refresh: async () => syncStatus,
    },
    updates: {
      check: async () => updateStatus,
      download: async () => updateStatus,
      getStatus: async () => updateStatus,
      install: async () => undefined,
      onStatus: () => () => undefined,
    },
  };
}

export { createMockCalendarApi };
