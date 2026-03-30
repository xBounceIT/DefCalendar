// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import App from "../src/renderer/src/app";
import type { CalendarApi } from "../src/shared/ipc";

interface MockedCalendarModule {
  default: unknown;
}

vi.mock<MockedCalendarModule>(import("@fullcalendar/daygrid"), () => ({
  default: {},
}));
vi.mock<MockedCalendarModule>(import("@fullcalendar/interaction"), () => ({
  default: {},
}));
vi.mock<MockedCalendarModule>(import("@fullcalendar/timegrid"), () => ({
  default: {},
}));

const signedInSelectedDate = "2026-03-27T09:00:00.000Z";
const mockCalendarSurfaceDate = {
  current: new Date(signedInSelectedDate),
};

const mockCalendarSurfaceApi = {
  changeView: vi.fn(),
  getDate: vi.fn(() => mockCalendarSurfaceDate.current),
  gotoDate: vi.fn((date: Date) => {
    mockCalendarSurfaceDate.current = date;
  }),
  next: vi.fn(),
  prev: vi.fn(),
  today: vi.fn(),
  unselect: vi.fn(),
  updateSize: vi.fn(),
  view: {
    type: "timeGridWeek",
  },
};
const mockResizeObserverObserve = vi.fn();
const mockResizeObserverDisconnect = vi.fn();

class MockResizeObserver {
  disconnect(): void {
    mockResizeObserverDisconnect();
  }

  observe(target: unknown): void {
    mockResizeObserverObserve(target);
  }

  unobserve(): void {}
}

vi.mock<MockedCalendarModule>(import("@fullcalendar/react"), async () => {
  const ReactModule = await import("react");

  return {
    default: ReactModule.forwardRef(function MockCalendar(_props, ref) {
      ReactModule.useImperativeHandle(ref, () => ({
        getApi: () => mockCalendarSurfaceApi,
      }));

      return <div data-testid="mock-calendar" />;
    }),
  };
});

const originalCalendarApiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "calendarApi");
const originalResizeObserverDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "ResizeObserver",
);

function restoreResizeObserver(): void {
  if (originalResizeObserverDescriptor) {
    Object.defineProperty(globalThis, "ResizeObserver", originalResizeObserverDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "ResizeObserver");
}

function installResizeObserverMock(): void {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });
}

function installCalendarApi(calendarApi: CalendarApi): void {
  Object.defineProperty(globalThis, "calendarApi", {
    configurable: true,
    value: calendarApi,
    writable: true,
  });
}

function restoreCalendarApi(): void {
  cleanup();
  vi.clearAllMocks();
  mockCalendarSurfaceDate.current = new Date(signedInSelectedDate);
  mockCalendarSurfaceApi.view.type = "timeGridWeek";

  if (originalCalendarApiDescriptor) {
    Object.defineProperty(globalThis, "calendarApi", originalCalendarApiDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "calendarApi");
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function createCalendarApiMock(): CalendarApi {
  return {
    app: {
      getLocale: vi.fn().mockResolvedValue("en-US"),
      getVersion: vi.fn().mockResolvedValue("v0.1.0"),
      setLocale: vi.fn().mockResolvedValue(undefined),
    },
    auth: {
      getState: vi.fn().mockResolvedValue({ status: "signed_out", accounts: [] }),
      onState: vi.fn().mockReturnValue(() => undefined),
      signInWithExchange365: vi.fn(),
      signOut: vi.fn(),
      switchAccount: vi.fn(),
    },
    calendars: {
      list: vi.fn(),
      setVisibility: vi.fn(),
    },
    categories: {
      list: vi.fn().mockResolvedValue([]),
    },
    events: {
      addAttachment: vi.fn(),
      cancel: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      listAttachments: vi.fn(),
      openWebLink: vi.fn(),
      removeAttachment: vi.fn(),
      respond: vi.fn(),
      update: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: [],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      }),
      update: vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: [],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      }),
    },
    sync: {
      getStatus: vi.fn().mockResolvedValue({
        lastSyncedAt: null,
        message: "Sign in to sync Exchange 365.",
        messageKey: "sync.signInToSync",
        counts: null,
        state: "idle",
      }),
      onStatus: vi.fn().mockReturnValue(() => undefined),
      refresh: vi.fn(),
    },
    updates: {
      getStatus: vi.fn().mockResolvedValue({
        checkedAt: null,
        currentVersion: "0.1.0",
        downloadPercent: null,
        error: null,
        latestVersion: null,
        releaseNotes: null,
        state: "idle",
      }),
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
      onStatus: vi.fn().mockReturnValue(() => undefined),
    },
    reminder: {
      getState: vi.fn().mockResolvedValue({
        items: [],
        locale: "en",
        timeFormat: "system",
      }),
      onState: vi.fn().mockReturnValue(() => undefined),
      snooze: vi.fn(),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    },
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockResolvedValue(false),
    },
  };
}

function createSignedInCalendarApiMock(): CalendarApi {
  return {
    app: {
      getLocale: vi.fn().mockResolvedValue("en-US"),
      getVersion: vi.fn().mockResolvedValue("v0.1.0"),
      setLocale: vi.fn().mockResolvedValue(undefined),
    },
    auth: {
      getState: vi.fn().mockResolvedValue({
        status: "signed_in",
        account: {
          homeAccountId: "account-1",
          name: "Daniel D'Angeli",
          tenantId: "tenant-1",
          username: "daniel.dangeli@syncsecurity.it",
          color: "#5b7cfa",
        },
        accounts: [
          {
            homeAccountId: "account-1",
            username: "daniel.dangeli@syncsecurity.it",
            name: "Daniel D'Angeli",
            tenantId: "tenant-1",
            color: "#5b7cfa",
            lastSignedInAt: "2026-03-27T08:00:00.000Z",
          },
        ],
        activeAccountId: "account-1",
      }),
      onState: vi.fn().mockReturnValue(() => undefined),
      signInWithExchange365: vi.fn(),
      signOut: vi.fn(),
      switchAccount: vi.fn(),
    },
    calendars: {
      list: vi.fn().mockResolvedValue([
        {
          id: "calendar-1",
          homeAccountId: "account-1",
          name: "Calendario",
          color: "#bde7f6",
          canEdit: true,
          canShare: false,
          isDefaultCalendar: true,
          isVisible: true,
          ownerAddress: "daniel.dangeli@syncsecurity.it",
          ownerName: "Daniel D'Angeli",
        },
      ]),
      setVisibility: vi.fn(),
    },
    categories: {
      list: vi.fn().mockResolvedValue([]),
    },
    events: {
      addAttachment: vi.fn(),
      cancel: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      listAttachments: vi.fn(),
      openWebLink: vi.fn(),
      removeAttachment: vi.fn(),
      respond: vi.fn(),
      update: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      }),
      update: vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      }),
    },
    sync: {
      getStatus: vi.fn().mockResolvedValue({
        lastSyncedAt: "2026-03-27T15:43:00.000Z",
        message: "Synced 3 calendars, 0 events.",
        messageKey: "sync.synced",
        counts: {
          calendars: 3,
          events: 0,
        },
        state: "idle",
      }),
      onStatus: vi.fn().mockReturnValue(() => undefined),
      refresh: vi.fn(),
    },
    updates: {
      getStatus: vi.fn().mockResolvedValue({
        checkedAt: null,
        currentVersion: "0.1.0",
        downloadPercent: null,
        error: null,
        latestVersion: null,
        releaseNotes: null,
        state: "idle",
      }),
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
      onStatus: vi.fn().mockReturnValue(() => undefined),
    },
    reminder: {
      getState: vi.fn().mockResolvedValue({
        items: [],
        locale: "en",
        timeFormat: "system",
      }),
      onState: vi.fn().mockReturnValue(() => undefined),
      snooze: vi.fn(),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    },
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockResolvedValue(false),
    },
  };
}

function createSignInFlowCalendarApiMock(): CalendarApi {
  let signedIn = false;
  const signedInState = {
    status: "signed_in" as const,
    account: {
      homeAccountId: "account-1",
      username: "daniel.dangeli@syncsecurity.it",
      name: "Daniel D'Angeli",
      tenantId: "tenant-1",
      color: "#5b7cfa",
    },
    accounts: [
      {
        homeAccountId: "account-1",
        username: "daniel.dangeli@syncsecurity.it",
        name: "Daniel D'Angeli",
        tenantId: "tenant-1",
        color: "#5b7cfa",
        lastSignedInAt: "2026-03-27T08:00:00.000Z",
      },
    ],
    activeAccountId: "account-1",
  };

  return {
    app: {
      getLocale: vi.fn().mockResolvedValue("en-US"),
      getVersion: vi.fn().mockResolvedValue("v0.1.0"),
      setLocale: vi.fn().mockResolvedValue(undefined),
    },
    auth: {
      getState: vi.fn().mockImplementation(() => {
        if (signedIn) {
          return Promise.resolve(signedInState);
        }
        return Promise.resolve({ status: "signed_out", accounts: [] });
      }),
      onState: vi.fn().mockReturnValue(() => undefined),
      signInWithExchange365: vi.fn().mockImplementation(async () => {
        signedIn = true;
        return signedInState;
      }),
      signOut: vi.fn(),
      switchAccount: vi.fn(),
    },
    calendars: {
      list: vi.fn().mockResolvedValue([
        {
          id: "calendar-1",
          homeAccountId: "account-1",
          name: "Calendar One",
          color: "#5b7cfa",
          canEdit: true,
          canShare: false,
          isDefaultCalendar: true,
          isVisible: true,
          ownerAddress: "daniel.dangeli@syncsecurity.it",
          ownerName: "Daniel D'Angeli",
        },
        {
          id: "calendar-2",
          homeAccountId: "account-2",
          name: "Calendar Two",
          color: "#34a853",
          canEdit: true,
          canShare: false,
          isDefaultCalendar: false,
          isVisible: true,
          ownerAddress: "daniel.dangeli@syncsecurity.it",
          ownerName: "Daniel D'Angeli",
        },
      ]),
      setVisibility: vi.fn(),
    },
    categories: {
      list: vi.fn().mockResolvedValue([]),
    },
    events: {
      create: vi.fn(),
      delete: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      openWebLink: vi.fn(),
      update: vi.fn(),
      respond: vi.fn(),
      cancel: vi.fn(),
      listAttachments: vi.fn(),
      addAttachment: vi.fn(),
      removeAttachment: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1", "calendar-2"],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      }),
      update: vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1", "calendar-2"],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      }),
    },
    sync: {
      getStatus: vi.fn().mockResolvedValue({
        lastSyncedAt: null,
        message: "Choose calendars to sync.",
        messageKey: "sync.chooseCalendars",
        counts: null,
        state: "idle",
      }),
      onStatus: vi.fn().mockReturnValue(() => undefined),
      refresh: vi.fn().mockResolvedValue({
        lastSyncedAt: null,
        message: "Synced 2 calendars, 0 events.",
        messageKey: "sync.synced",
        counts: {
          calendars: 2,
          events: 0,
        },
        state: "idle",
      }),
    },
    updates: {
      getStatus: vi.fn().mockResolvedValue({
        checkedAt: null,
        currentVersion: "0.1.0",
        downloadPercent: null,
        error: null,
        latestVersion: null,
        releaseNotes: null,
        state: "idle",
      }),
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
      onStatus: vi.fn().mockReturnValue(() => undefined),
    },
    reminder: {
      getState: vi.fn().mockResolvedValue({
        items: [],
        locale: "en",
        timeFormat: "system",
      }),
      onState: vi.fn().mockReturnValue(() => undefined),
      snooze: vi.fn(),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    },
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockResolvedValue(false),
    },
  };
}

describe("app startup", () => {
  it("renders the Exchange auth screen when the preload bridge is available", async () => {
    try {
      installResizeObserverMock();
      installCalendarApi(createCalendarApiMock());

      renderApp();

      await expect(
        screen.findByRole("button", { name: "Sync Microsoft 365" }),
      ).resolves.not.toBeNull();
      expect(screen.getByText(/Welcome to DefCalendar/i)).not.toBeNull();
      expect(screen.getByText(/Your personal calendar companion\./i)).not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("shows calendar selection after signing in", async () => {
    try {
      installResizeObserverMock();
      installCalendarApi(createSignInFlowCalendarApiMock());

      renderApp();

      await expect(
        screen.findByRole("button", { name: "Sync Microsoft 365" }),
      ).resolves.not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Sync Microsoft 365" }));

      await expect(screen.findByText("Choose calendars to sync")).resolves.not.toBeNull();
      expect(screen.getByRole("button", { name: "Start syncing" })).not.toBeNull();
      expect(screen.getByText("Calendar One")).not.toBeNull();
      expect(screen.queryByText("Calendar Two")).toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("renders the signed-in workspace without the removed dashboard headings", async () => {
    try {
      installResizeObserverMock();
      installCalendarApi(createSignedInCalendarApiMock());

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      expect([
        screen.queryByRole("heading", { level: 1, name: "DefCalendar" }),
        screen.queryByText("Exchange 365"),
      ]).toStrictEqual([null, null]);

      await waitFor(() => {
        expect({
          observed: mockResizeObserverObserve.mock.calls.length > 0,
          updated: mockCalendarSurfaceApi.updateSize.mock.calls.length > 0,
        }).toStrictEqual({
          observed: true,
          updated: true,
        });
      });
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("focuses today on cold startup instead of the persisted date", async () => {
    const persistedSelectedDate = "2025-12-15T09:00:00.000Z";
    const startupDate = new Date();
    const persistedHeaderDate = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(persistedSelectedDate));
    const startupHeaderDate = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(startupDate);
    const startupDateKey = startupDate.toISOString().slice(0, 10);

    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      calendarApi.settings.get = vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: persistedSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      });
      calendarApi.settings.update = vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: startupDate.toISOString(),
        visibleCalendarIds: ["calendar-1"],
        language: "system",
        timeFormat: "system",
        updateChannel: "stable",
      });
      installCalendarApi(calendarApi);

      renderApp();

      await expect(
        screen.findByRole("heading", { level: 2, name: startupHeaderDate }),
      ).resolves.not.toBeNull();
      expect(screen.queryByRole("heading", { level: 2, name: persistedHeaderDate })).toBeNull();
      await waitFor(() => {
        expect(calendarApi.settings.update).toHaveBeenCalled();
      });
      const settingsUpdateArg = calendarApi.settings.update.mock.calls.at(-1)?.[0];
      expect(settingsUpdateArg).toBeDefined();
      expect(settingsUpdateArg?.activeView).toBe("timeGridWeek");
      expect(settingsUpdateArg?.selectedDate.slice(0, 10)).toBe(startupDateKey);
      expect(settingsUpdateArg?.selectedDate.slice(0, 10)).not.toBe(
        persistedSelectedDate.slice(0, 10),
      );
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("localizes sync summary with calendar and event counts", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      calendarApi.app.getLocale = vi.fn().mockResolvedValue("it-IT");
      calendarApi.settings.get = vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        language: "it",
        timeFormat: "system",
        updateChannel: "stable",
      });
      calendarApi.settings.update = vi.fn().mockResolvedValue({
        activeView: "timeGridWeek",
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        language: "it",
        timeFormat: "system",
        updateChannel: "stable",
      });
      calendarApi.sync.getStatus = vi.fn().mockResolvedValue({
        lastSyncedAt: "2026-03-27T15:43:00.000Z",
        message: "Synced 1 calendar, 18 events.",
        messageKey: "sync.synced",
        counts: {
          calendars: 1,
          events: 18,
        },
        state: "idle",
      });
      installCalendarApi(calendarApi);

      renderApp();

      await expect(
        screen.findByText("Sincronizzato 1 calendario, 18 eventi."),
      ).resolves.not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("shows a startup error when the preload bridge is missing", () => {
    try {
      installResizeObserverMock();
      Reflect.deleteProperty(globalThis, "calendarApi");

      renderApp();

      expect(screen.getByText(/secure desktop bridge|ponte desktop sicuro/i)).not.toBeNull();
      expect(screen.getByText(/Restart the app|Riavvia l’app/i)).not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });
});
