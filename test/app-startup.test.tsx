// @vitest-environment jsdom

import type { DateSelectArg, EventInput } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import App from "../src/renderer/src/app";
import useUiStore from "../src/renderer/src/store";
import { setAppLocale } from "../src/renderer/src/i18n";
import { createDefaultSettings } from "../src/shared/schema-values";
import type { CalendarApi, NewEventNotificationItem } from "../src/shared/ipc";
import type { CalendarEvent, EventListArgs, UserSettingsPatch } from "../src/shared/schemas";
import type { DateContextClickArg } from "../src/renderer/src/date-context-plugin";
import { toDateTimeInputValue } from "../src/shared/calendar";
import PlaceholderEventMenu from "../src/renderer/src/components/placeholder-event-menu";
import { TIME_OPTIONS, TimeSelect } from "../src/renderer/src/components/event-editor-dialog";
import type { AuthState } from "../src/shared/schemas";

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
let capturedCalendarProps: null | Record<string, unknown> = null;
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
    default: ReactModule.forwardRef(function MockCalendar(props, ref) {
      capturedCalendarProps = props as Record<string, unknown>;

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

function createRange(selectedDate: string): { rangeEnd: string; rangeStart: string } {
  const seed = new Date(selectedDate);
  const rangeStart = new Date(seed.getFullYear(), seed.getMonth() - 1, 1).toISOString();
  const rangeEnd = new Date(seed.getFullYear(), seed.getMonth() + 2, 1).toISOString();
  return { rangeEnd, rangeStart };
}

function createCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    allowNewTimeProposals: true,
    attachments: [],
    attendees: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: "2026-03-30T10:00:00.000Z",
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
    onlineMeeting: null,
    onlineMeetingProvider: null,
    organizer: null,
    recurrence: null,
    reminderMinutesBeforeStart: 0,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal",
    showAs: "busy",
    start: "2026-03-30T09:00:00.000Z",
    subject: "Planning",
    seriesMasterId: null,
    occurrenceId: null,
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

function createNewEventNotificationItem(
  overrides: Partial<NewEventNotificationItem> = {},
): NewEventNotificationItem {
  return {
    calendarId: "calendar-1",
    end: "2026-03-30T11:00:00.000Z",
    eventId: "event-1",
    isAllDay: false,
    location: "Room 3",
    onlineMeetingJoinUrl: null,
    organizerEmail: "organizer@example.com",
    organizerName: "Organizer",
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning invite",
    ...overrides,
  };
}

function resetUiStoreState(): void {
  const defaults = createDefaultSettings();
  useUiStore.setState({
    activeView: defaults.activeView,
    hydrated: false,
    selectedDate: defaults.selectedDate,
    selectedDayForTable: null,
    ...createRange(defaults.selectedDate),
  });
}

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
  capturedCalendarProps = null;
  mockCalendarSurfaceDate.current = new Date(signedInSelectedDate);
  mockCalendarSurfaceApi.view.type = "timeGridWeek";
  resetUiStoreState();

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

function getCalendarDateClickHandler(): (arg: DateClickArg) => void {
  return capturedCalendarProps?.dateClick as (arg: DateClickArg) => void;
}

function createCalendarApiMock(): CalendarApi {
  return {
    spellcheck: {
      onDictionaryStatesChanged: vi.fn().mockReturnValue(() => undefined),
      addWord: vi.fn().mockResolvedValue(undefined),
      getDictionaries: vi.fn().mockResolvedValue({
        availableLanguages: ["en-US", "it"],
        dictionaryStates: { "en-US": "ready", it: "ready" },
        customWords: [],
        usesSystemLanguages: false,
      }),
      removeWord: vi.fn(),
    },
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
      setColor: vi.fn(),
      setVisibility: vi.fn(),
    },
    categories: {
      list: vi.fn().mockResolvedValue([]),
    },
    locations: {
      map: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    },
    contacts: {
      getPhoto: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue([]),
    },
    events: {
      getAttendeeAvailability: vi.fn().mockResolvedValue([]),
      addAttachment: vi.fn(),
      cancel: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      forward: vi.fn(),
      list: vi.fn(),
      listAttachments: vi.fn(),
      onOpenInApp: vi.fn().mockReturnValue(() => undefined),
      openInApp: vi.fn(),
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
      minimizeWindow: vi.fn(),
    },
    newEventNotifications: {
      get: vi.fn().mockResolvedValue([]),
      onChanged: vi.fn().mockReturnValue(() => undefined),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    },
  };
}

function createSignedInCalendarApiMock(): CalendarApi {
  return {
    spellcheck: {
      onDictionaryStatesChanged: vi.fn().mockReturnValue(() => undefined),
      addWord: vi.fn().mockResolvedValue(undefined),
      getDictionaries: vi.fn().mockResolvedValue({
        availableLanguages: ["en-US", "it"],
        dictionaryStates: { "en-US": "ready", it: "ready" },
        customWords: [],
        usesSystemLanguages: false,
      }),
      removeWord: vi.fn(),
    },
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
      setColor: vi.fn(),
      setVisibility: vi.fn(),
    },
    categories: {
      list: vi.fn().mockResolvedValue([]),
    },
    locations: {
      map: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    },
    contacts: {
      getPhoto: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue([]),
    },
    events: {
      getAttendeeAvailability: vi.fn().mockResolvedValue([]),
      addAttachment: vi.fn(),
      cancel: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      forward: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      listAttachments: vi.fn(),
      onOpenInApp: vi.fn().mockReturnValue(() => undefined),
      openInApp: vi.fn(),
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
      minimizeWindow: vi.fn(),
    },
    newEventNotifications: {
      get: vi.fn().mockResolvedValue([]),
      onChanged: vi.fn().mockReturnValue(() => undefined),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
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
    spellcheck: {
      onDictionaryStatesChanged: vi.fn().mockReturnValue(() => undefined),
      addWord: vi.fn().mockResolvedValue(undefined),
      getDictionaries: vi.fn().mockResolvedValue({
        availableLanguages: ["en-US", "it"],
        dictionaryStates: { "en-US": "ready", it: "ready" },
        customWords: [],
        usesSystemLanguages: false,
      }),
      removeWord: vi.fn(),
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
      setColor: vi.fn(),
      setVisibility: vi.fn(),
    },
    categories: {
      list: vi.fn().mockResolvedValue([]),
    },
    locations: {
      map: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    },
    contacts: {
      getPhoto: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue([]),
    },
    events: {
      getAttendeeAvailability: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      delete: vi.fn(),
      forward: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      onOpenInApp: vi.fn().mockReturnValue(() => undefined),
      openInApp: vi.fn(),
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
      minimizeWindow: vi.fn(),
    },
    newEventNotifications: {
      get: vi.fn().mockResolvedValue([]),
      onChanged: vi.fn().mockReturnValue(() => undefined),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    },
  };
}

function createDelayedAuthRefreshCalendarApiMock(): CalendarApi {
  const base = createCalendarApiMock();
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
    ...base,
    auth: {
      ...base.auth,
      getState: vi.fn().mockResolvedValue({ status: "signed_out", accounts: [] }),
      signInWithExchange365: vi.fn().mockResolvedValue(signedInState),
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
      ]),
      setVisibility: vi.fn(),
    },
  };
}

function choosePlaceholderAction(): void {
  expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Create placeholder" }));
}

function changePlaceholderBoundary(boundary: "Start" | "End", value: string): void {
  fireEvent.change(screen.getByLabelText(`${boundary} date`), {
    target: { value: value.slice(0, 10) },
  });
  const time = screen.getByLabelText(`${boundary} time`);
  fireEvent.change(time, { target: { value: value.slice(11) } });
  fireEvent.blur(time);
}

describe("app startup", () => {
  it.each([false, true])("hides open time choices when disabled, floating=%s", (floating) => {
    expect.hasAssertions();
    installResizeObserverMock();
    const onChange = vi.fn();
    try {
      const view = render(
        <TimeSelect
          disabled={false}
          floating={floating}
          onChange={onChange}
          options={TIME_OPTIONS}
          scrollToSelected
          value="09:30"
        />,
      );
      fireEvent.focus(screen.getByRole("textbox"));
      expect(document.querySelector(".time-select__dropdown")).not.toBeNull();
      view.rerender(
        <TimeSelect
          disabled
          floating={floating}
          onChange={onChange}
          options={TIME_OPTIONS}
          scrollToSelected
          value="09:30"
        />,
      );
      expect(document.querySelector(".time-select__dropdown")).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      cleanup();
      restoreResizeObserver();
    }
  });

  it("closes time choices when the focused chevron is clicked", () => {
    expect.hasAssertions();
    try {
      render(
        <TimeSelect
          disabled={false}
          onChange={vi.fn()}
          options={TIME_OPTIONS}
          scrollToSelected
          value="09:30"
        />,
      );
      act(() => screen.getByRole("textbox").focus());
      const chevron = screen.getByRole("button", { name: "Toggle time options" });
      act(() => chevron.focus());
      fireEvent.click(chevron);
      expect(document.querySelector(".time-select__dropdown")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("closes time choices when keyboard focus leaves the control", () => {
    expect.hasAssertions();
    try {
      render(
        <>
          <TimeSelect
            disabled={false}
            onChange={vi.fn()}
            options={TIME_OPTIONS}
            scrollToSelected
            value="09:30"
          />
          <button type="button">Next field</button>
        </>,
      );
      act(() => screen.getByRole("textbox").focus());
      expect(document.querySelector(".time-select__dropdown")).not.toBeNull();
      act(() => screen.getByRole("button", { name: "Next field" }).focus());
      expect(document.querySelector(".time-select__dropdown")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("keeps a growing error popup inside the viewport without moving focus", async () => {
    expect.hasAssertions();
    installResizeObserverMock();
    const heightSpy = vi.spyOn(window, "innerHeight", "get").mockReturnValue(720);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return new DOMRect(0, 0, 344, this.querySelector('[role="alert"]') ? 310 : 246);
      });
    try {
      render(
        <PlaceholderEventMenu
          range={{ start: "2026-09-30T09:00:00Z", end: "2026-09-30T10:00:00Z" }}
          position={{ x: 800, y: 700 }}
          onCreate={vi.fn().mockRejectedValue(new Error("Graph failure"))}
          onDismiss={vi.fn()}
        />,
      );
      choosePlaceholderAction();
      const dialog = screen.getByRole("dialog", { name: "Placeholder" });
      expect(dialog.style.top).toBe("466px");
      const startTime = screen.getByLabelText("Start time");
      act(() => startTime.focus());
      fireEvent.submit(screen.getByRole("button", { name: "Create placeholder" }).closest("form")!);
      await screen.findByRole("alert");
      expect(dialog.style.top).toBe("402px");
      expect(document.activeElement).toBe(startTime);
    } finally {
      cleanup();
      heightSpy.mockRestore();
      rectSpy.mockRestore();
      restoreResizeObserver();
    }
  });

  it.each([
    { top: 20, height: 720, expectedTop: 62, expectedHeight: 186 },
    { top: 650, height: 720, expectedTop: 458, expectedHeight: 186 },
    { top: 20, height: 200, expectedTop: 62, expectedHeight: 128 },
  ])("anchors floating time choices without scrolling their ancestors: %j", (geometry) => {
    expect.hasAssertions();
    installResizeObserverMock();
    const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const scrollAncestors = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollAncestors,
    });
    const heightSpy = vi.spyOn(window, "innerHeight", "get").mockReturnValue(geometry.height);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("time-select")) {
          return new DOMRect(100, geometry.top, 100, 38);
        }
        if (this.matches('[data-selected="true"]')) {
          return new DOMRect(100, 400, 100, 36);
        }
        return new DOMRect(100, 100, 100, 180);
      });
    try {
      render(
        <TimeSelect
          disabled={false}
          floating
          onChange={vi.fn()}
          options={TIME_OPTIONS}
          scrollToSelected
          value="09:30"
        />,
      );
      fireEvent.focus(screen.getByRole("textbox"));
      const dropdown = document.querySelector<HTMLElement>(".time-select__dropdown")!;
      const list = document.querySelector<HTMLElement>(".time-select__list")!;
      expect({
        top: dropdown.style.top,
        width: dropdown.style.width,
        height: list.style.maxHeight,
        popover: dropdown.getAttribute("popover"),
      }).toStrictEqual({
        top: `${geometry.expectedTop}px`,
        width: "120px",
        height: `${geometry.expectedHeight}px`,
        popover: "manual",
      });
      expect(list.scrollTop).toBeGreaterThan(0);
      expect(scrollAncestors).not.toHaveBeenCalled();
    } finally {
      cleanup();
      rectSpy.mockRestore();
      heightSpy.mockRestore();
      if (originalScroll) {
        Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
      } else {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      }
      restoreResizeObserver();
    }
  });

  it("offers a context action before opening the custom date and time selectors", async () => {
    expect.hasAssertions();
    installResizeObserverMock();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();
    const start = new Date(2026, 8, 30, 9);
    const end = new Date(2026, 8, 30, 10);
    try {
      render(
        <PlaceholderEventMenu
          range={{ start: start.toISOString(), end: end.toISOString() }}
          position={{ x: 50, y: 50 }}
          onCreate={onCreate}
          onDismiss={onDismiss}
        />,
      );
      expect(screen.getByRole("menu", { name: "Calendar actions" })).not.toBeNull();
      expect(onCreate).not.toHaveBeenCalled();
      choosePlaceholderAction();
      expect(
        document.querySelector(
          'input[type="datetime-local"], input[type="date"], input[type="time"]',
        ),
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Open calendar for Start date" }));
      const picker = document.querySelector('.date-picker__popover[aria-label="Start date"]')!;
      expect(picker).not.toBeNull();
      fireEvent.keyDown(picker, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Start date" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Placeholder" })).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Open calendar for End date" }));
      const nextDay = document
        .querySelector('.date-picker__popover[aria-label="End date"]')!
        .querySelector('[data-date="2026-10-01"]')!;
      fireEvent.pointerDown(nextDay);
      fireEvent.click(nextDay);
      const startTime = screen.getByLabelText("Start time");
      fireEvent.focus(startTime);
      fireEvent.keyDown(startTime, { key: "Escape" });
      expect(screen.getByRole("dialog", { name: "Placeholder" })).not.toBeNull();
      changePlaceholderBoundary("End", "2026-10-01T10:45");
      fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledExactlyOnceWith({
          start: start.toISOString(),
          end: new Date(2026, 9, 1, 10, 45).toISOString(),
          title: "",
        }),
      );
      expect(onDismiss).toHaveBeenCalledOnce();
    } finally {
      cleanup();
      restoreResizeObserver();
    }
  });

  it.each(["slot", "selection", "day", "overnight"] as const)(
    "creates a personal busy placeholder without reminders from a %s context",
    async (target) => {
      try {
        const api = createSignedInCalendarApiMock();
        api.events.create = vi
          .fn()
          .mockResolvedValue(createCalendarEvent({ subject: "Provvisorio" }));
        installCalendarApi(api);
        renderApp();
        await screen.findByTestId("mock-calendar");
        await waitFor(() => expect(api.events.list).toHaveBeenCalledTimes(2));
        const start = new Date(
          2026,
          8,
          30,
          target === "overnight" ? 23 : 9,
          target === "overnight" ? 45 : 0,
        );
        const end = new Date(start.getTime() + (target === "selection" ? 90 : 30) * 60_000);
        if (target === "selection") {
          act(() => {
            (capturedCalendarProps!.select as (arg: DateSelectArg) => void)({
              start,
              end,
              allDay: false,
            } as DateSelectArg);
          });
        }
        act(() => {
          (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
            date:
              target === "day"
                ? new Date(2026, 8, 30)
                : new Date(start.getTime() + (target === "selection" ? 30 * 60_000 : 0)),
            allDay: target === "day",
            jsEvent: new MouseEvent("contextmenu", { clientX: 100, clientY: 200 }),
          });
        });
        choosePlaceholderAction();
        expect((screen.getByLabelText("Start time") as HTMLInputElement).value).toBe(
          toDateTimeInputValue(start.toISOString(), false).slice(11),
        );
        expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
          toDateTimeInputValue(end.toISOString(), false).slice(11),
        );
        fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
        await waitFor(() => {
          expect(api.events.create).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
              calendarId: "calendar-1",
              subject: "Provvisorio",
              start: start.toISOString(),
              end: end.toISOString(),
              attendees: [],
              isAllDay: false,
              isReminderOn: false,
              reminderMinutesBeforeStart: null,
              showAs: "busy",
              responseRequested: false,
              isOnlineMeeting: false,
              timeZone: "UTC",
            }),
          );
          expect(api.events.list).toHaveBeenCalledTimes(4);
          expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
        });
        expect(api.events.respond).not.toHaveBeenCalled();
        expect(vi.mocked(api.events.create).mock.calls[0][0]).not.toHaveProperty("responseStatus");
      } finally {
        restoreCalendarApi();
      }
    },
  );

  it.each([
    { locale: "en", title: "  Preparazione riunione  ", subject: "Preparazione riunione" },
    { locale: "en", title: "   ", subject: "Provvisorio" },
    { locale: "it", title: "  Caffè ☕ – 会議  ", subject: "Caffè ☕ – 会議" },
    { locale: "it", title: "", subject: "Provvisorio" },
  ])(
    "creates a placeholder with title '$title' as '$subject' in $locale",
    async ({ locale, title, subject }) => {
      try {
        const api = createSignedInCalendarApiMock();
        vi.mocked(api.app.getLocale).mockResolvedValue(locale === "it" ? "it-IT" : "en-US");
        api.events.create = vi.fn().mockResolvedValue(createCalendarEvent({ subject }));
        installCalendarApi(api);
        renderApp();
        await screen.findByTestId("mock-calendar");
        act(() => {
          (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
            date: new Date(2026, 8, 30, 9),
            allDay: false,
            jsEvent: new MouseEvent("contextmenu"),
          });
        });
        const createLabel = locale === "it" ? "Crea Provvisorio" : "Create placeholder";
        const dialogLabel = locale === "it" ? "Provvisorio" : "Placeholder";
        fireEvent.click(await screen.findByRole("menuitem", { name: createLabel }));
        const titleInput = screen.getByRole("textbox", {
          name: locale === "it" ? "Titolo" : "Title",
        }) as HTMLInputElement;
        expect({
          required: titleInput.required,
          placeholder: titleInput.placeholder,
        }).toStrictEqual({
          required: false,
          placeholder: "Provvisorio",
        });
        fireEvent.change(titleInput, { target: { value: title } });
        fireEvent.click(screen.getByRole("button", { name: createLabel }));
        await waitFor(() =>
          expect(api.events.create).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ subject }),
          ),
        );
        await waitFor(() => expect(screen.queryByRole("dialog", { name: dialogLabel })).toBeNull());
      } finally {
        restoreCalendarApi();
      }
    },
  );

  it.each(["Preparazione riunione", "Titolo aggiornato"])(
    "preserves placeholder inputs after a failed save and retries with title '%s'",
    async (retryTitle) => {
      try {
        const api = createSignedInCalendarApiMock();
        api.events.create = vi
          .fn()
          .mockRejectedValueOnce(new Error("Offline"))
          .mockResolvedValueOnce(createCalendarEvent());
        installCalendarApi(api);
        renderApp();
        await screen.findByTestId("mock-calendar");
        const start = new Date(2026, 8, 30, 9);
        const end = new Date(2026, 8, 30, 11);
        act(() => {
          (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
            date: start,
            allDay: false,
            jsEvent: new MouseEvent("contextmenu"),
          });
        });
        choosePlaceholderAction();
        fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
          target: { value: "Preparazione riunione" },
        });
        changePlaceholderBoundary("End", toDateTimeInputValue(start.toISOString(), false));
        expect(
          (screen.getByRole("button", { name: "Create placeholder" }) as HTMLButtonElement)
            .disabled,
        ).toBe(true);
        expect(screen.getByRole("alert").textContent).toBe("The end must be after the start.");
        expect(api.events.create).not.toHaveBeenCalled();
        changePlaceholderBoundary("End", toDateTimeInputValue(end.toISOString(), false));
        fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
        await screen.findByText("Offline");
        await waitFor(() =>
          expect(
            (screen.getByRole("button", { name: "Create placeholder" }) as HTMLButtonElement)
              .disabled,
          ).toBe(false),
        );
        expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
          toDateTimeInputValue(end.toISOString(), false).slice(11),
        );
        expect((screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value).toBe(
          "Preparazione riunione",
        );
        fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
          target: { value: retryTitle },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
        await waitFor(() =>
          expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull(),
        );
        expect(api.events.create).toHaveBeenCalledTimes(2);
        expect(vi.mocked(api.events.create).mock.calls[1][0].end).toBe(end.toISOString());
        const firstDraft = vi.mocked(api.events.create).mock.calls[0][0];
        const retryDraft = vi.mocked(api.events.create).mock.calls[1][0];
        expect({
          subject: firstDraft.subject,
          firstTransactionId: firstDraft.transactionId,
          retryTransactionId: retryDraft.transactionId,
        }).toStrictEqual({
          subject: "Preparazione riunione",
          firstTransactionId: expect.any(String),
          retryTransactionId: expect.any(String),
        });
        expect(retryDraft).toStrictEqual({
          ...firstDraft,
          subject: retryTitle,
          transactionId: retryDraft.transactionId,
        });
        expect(retryDraft.transactionId === firstDraft.transactionId).toBe(
          retryTitle === firstDraft.subject,
        );
        expect(screen.queryByText("Offline")).toBeNull();
      } finally {
        restoreCalendarApi();
      }
    },
  );

  it("prevents duplicate placeholder submissions while saving and dismisses without creating", async () => {
    try {
      const api = createSignedInCalendarApiMock();
      let resolveCreation!: (event: CalendarEvent) => void;
      api.events.create = vi.fn().mockReturnValue(
        new Promise<CalendarEvent>((resolve) => {
          resolveCreation = resolve;
        }),
      );
      installCalendarApi(api);
      renderApp();
      await screen.findByTestId("mock-calendar");
      const openMenu = () => {
        act(() => {
          (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
            date: new Date(2026, 8, 30, 9),
            allDay: false,
            jsEvent: new MouseEvent("contextmenu"),
          });
        });
        if (screen.queryByRole("menuitem", { name: "Create placeholder" })) {
          choosePlaceholderAction();
        }
      };
      openMenu();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
      expect(api.events.create).not.toHaveBeenCalled();
      openMenu();
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
      openMenu();
      const form = screen.getByRole("button", { name: "Create placeholder" }).closest("form")!;
      fireEvent.submit(form);
      fireEvent.submit(form);
      await waitFor(() => expect(api.events.create).toHaveBeenCalledOnce());
      expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      await act(async () => {
        resolveCreation(createCalendarEvent());
      });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull());
    } finally {
      restoreCalendarApi();
    }
  });

  it("does not enable placeholder creation on read-only calendars", async () => {
    try {
      const api = createSignedInCalendarApiMock();
      const calendars = await api.calendars.list();
      api.calendars.list = vi
        .fn()
        .mockResolvedValue(calendars.map((calendar) => ({ ...calendar, canEdit: false })));
      installCalendarApi(api);
      renderApp();
      await screen.findByTestId("mock-calendar");
      expect(capturedCalendarProps!.selectable).toBe(false);
      act(() => {
        (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
          date: new Date(2026, 8, 30, 9),
          allDay: false,
          jsEvent: new MouseEvent("contextmenu"),
        });
      });
      expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
      expect(api.events.create).not.toHaveBeenCalled();
    } finally {
      restoreCalendarApi();
    }
  });

  it("keeps a saving placeholder protected when another menu is opened", async () => {
    expect.hasAssertions();
    try {
      const api = createSignedInCalendarApiMock();
      let resolveCreation!: (event: CalendarEvent) => void;
      api.events.create = vi.fn().mockReturnValue(
        new Promise<CalendarEvent>((resolve) => {
          resolveCreation = resolve;
        }),
      );
      installCalendarApi(api);
      renderApp();
      await screen.findByTestId("mock-calendar");
      const openMenu = () => {
        act(() => {
          (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
            date: new Date(2026, 8, 30, 9),
            allDay: false,
            jsEvent: new MouseEvent("contextmenu"),
          });
        });
        if (screen.queryByRole("menuitem", { name: "Create placeholder" })) {
          choosePlaceholderAction();
        }
      };
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
      await waitFor(() => expect(api.events.create).toHaveBeenCalledOnce());
      fireEvent.keyDown(document, { key: "Escape" });
      openMenu();
      const button = screen.getByRole("button", { name: "Saving…" });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.submit(button.closest("form")!);
      expect(api.events.create).toHaveBeenCalledOnce();
      await act(async () => {
        resolveCreation(createCalendarEvent());
      });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull());
    } finally {
      restoreCalendarApi();
    }
  });

  it("dismisses an open placeholder when its destination account changes", async () => {
    expect.hasAssertions();
    try {
      const api = createSignedInCalendarApiMock();
      const authState = await api.auth.getState();
      const firstCalendar = (await api.calendars.list())[0];
      api.calendars.list = vi
        .fn()
        .mockResolvedValue([
          firstCalendar,
          { ...firstCalendar, id: "calendar-2", homeAccountId: "account-2" },
        ]);
      let notifyAuth!: (state: AuthState) => void;
      api.auth.onState = vi.fn().mockImplementation((listener) => {
        notifyAuth = listener;
        return () => undefined;
      });
      installCalendarApi(api);
      renderApp();
      await screen.findByTestId("mock-calendar");
      act(() => {
        (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
          date: new Date(2026, 8, 30, 9),
          allDay: false,
          jsEvent: new MouseEvent("contextmenu"),
        });
      });
      choosePlaceholderAction();
      expect(screen.getByRole("dialog", { name: "Placeholder" })).not.toBeNull();
      const nextAuth = { ...authState, activeAccountId: "account-2" };
      api.auth.getState = vi.fn().mockResolvedValue(nextAuth);
      act(() => {
        notifyAuth(nextAuth);
      });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull());
      expect(api.events.create).not.toHaveBeenCalled();
    } finally {
      restoreCalendarApi();
    }
  });

  it("preserves the selected instants across the repeated hour at daylight saving end", async () => {
    expect.hasAssertions();
    try {
      vi.stubEnv("TZ", "Europe/Rome");
      const api = createSignedInCalendarApiMock();
      api.events.create = vi.fn().mockResolvedValue(createCalendarEvent());
      installCalendarApi(api);
      renderApp();
      await screen.findByTestId("mock-calendar");
      const start = new Date("2026-10-25T01:30:00.000Z");
      const end = new Date("2026-10-25T02:00:00.000Z");
      act(() => {
        (capturedCalendarProps!.select as (arg: DateSelectArg) => void)({
          start,
          end,
          allDay: false,
        } as DateSelectArg);
        (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
          date: start,
          allDay: false,
          jsEvent: new MouseEvent("contextmenu"),
        });
      });
      choosePlaceholderAction();
      fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
      await waitFor(() =>
        expect(api.events.create).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            start: start.toISOString(),
            end: end.toISOString(),
            timeZone: "UTC",
          }),
        ),
      );
    } finally {
      restoreCalendarApi();
      vi.unstubAllEnvs();
    }
  });

  it("shows failures from the placeholder callback without losing the selected interval", async () => {
    expect.hasAssertions();
    const range = { start: "2026-09-30T09:00:00Z", end: "2026-09-30T10:00:00Z" };
    const onCreate = vi.fn().mockRejectedValue(new Error("Creation failed before IPC"));
    const onDismiss = vi.fn();
    try {
      render(
        <PlaceholderEventMenu
          range={range}
          position={{ x: 50, y: 50 }}
          onCreate={onCreate}
          onDismiss={onDismiss}
        />,
      );
      choosePlaceholderAction();
      fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
      expect((await screen.findByRole("alert")).textContent).toBe("Creation failed before IPC");
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("rejects a nonexistent daylight-saving local time before submitting", () => {
    expect.hasAssertions();
    try {
      vi.stubEnv("TZ", "Europe/Rome");
      const onCreate = vi.fn();
      render(
        <PlaceholderEventMenu
          range={{
            start: new Date(2026, 2, 29, 1, 30).toISOString(),
            end: new Date(2026, 2, 29, 4).toISOString(),
          }}
          position={{ x: 50, y: 50 }}
          onCreate={onCreate}
          onDismiss={vi.fn()}
        />,
      );
      choosePlaceholderAction();
      changePlaceholderBoundary("Start", "2026-03-29T02:30");
      expect(
        (screen.getByRole("button", { name: "Create placeholder" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      fireEvent.submit(screen.getByRole("button", { name: "Create placeholder" }).closest("form")!);
      expect(onCreate).not.toHaveBeenCalled();
    } finally {
      cleanup();
      vi.unstubAllEnvs();
    }
  });

  it("keeps retry identity across reopening and assigns a new identity to a different interval", async () => {
    expect.hasAssertions();
    try {
      const api = createSignedInCalendarApiMock();
      api.events.create = vi.fn().mockRejectedValue(new Error("Offline"));
      installCalendarApi(api);
      renderApp();
      await screen.findByTestId("mock-calendar");
      const start = new Date(2026, 8, 30, 9);
      const openMenu = () => {
        act(() => {
          (capturedCalendarProps!.dateContextClick as (arg: DateContextClickArg) => void)({
            date: start,
            allDay: false,
            jsEvent: new MouseEvent("contextmenu"),
          });
        });
        if (screen.queryByRole("menuitem", { name: "Create placeholder" })) {
          choosePlaceholderAction();
        }
      };
      const submit = async () => {
        fireEvent.click(screen.getByRole("button", { name: "Create placeholder" }));
        await screen.findByText("Offline");
      };
      openMenu();
      await submit();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      openMenu();
      await submit();
      changePlaceholderBoundary(
        "End",
        toDateTimeInputValue(new Date(2026, 8, 30, 10).toISOString(), false),
      );
      await submit();
      changePlaceholderBoundary(
        "End",
        toDateTimeInputValue(new Date(2026, 8, 30, 9, 30).toISOString(), false),
      );
      await submit();
      const drafts = vi.mocked(api.events.create).mock.calls.map(([draft]) => draft);
      expect(drafts).toHaveLength(4);
      expect(drafts[1]).toStrictEqual(drafts[0]);
      expect(drafts[2].transactionId).not.toBe(drafts[0].transactionId);
      expect(drafts[3]).toStrictEqual(drafts[0]);
    } finally {
      restoreCalendarApi();
    }
  });
  it.each([
    ["en", /one@example.com was signed out.*Tasks.ReadWrite/],
    ["it", /one@example.com è stato disconnesso.*Tasks.ReadWrite/],
  ] as const)("explains the startup permission logout in %s", async (language, message) => {
    try {
      installResizeObserverMock();
      const calendarApi = createCalendarApiMock();
      vi.mocked(calendarApi.auth.getState).mockResolvedValue({
        status: "signed_out",
        accounts: [],
        sessionIssues: [
          {
            homeAccountId: "account-1",
            username: "one@example.com",
            reason: "missing_permissions",
            missingPermissions: ["Tasks.ReadWrite"],
          },
        ],
      });
      vi.mocked(calendarApi.settings.get).mockResolvedValue({
        ...createDefaultSettings(),
        language,
      });
      installCalendarApi(calendarApi);
      renderApp();

      await expect(screen.findByText(message)).resolves.not.toBeNull();
      expect(calendarApi.calendars.list).not.toHaveBeenCalled();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
      await setAppLocale("en");
    }
  });

  it("shows the removed account's permissions while another account remains signed in", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const state = await calendarApi.auth.getState();
      vi.mocked(calendarApi.auth.getState).mockResolvedValue({
        ...state,
        sessionIssues: [
          {
            homeAccountId: "removed-account",
            username: "removed@example.com",
            reason: "missing_permissions",
            missingPermissions: ["People.Read"],
          },
        ],
      });
      installCalendarApi(calendarApi);
      renderApp();

      await expect(
        screen.findByText(/removed@example.com was signed out.*People.Read/),
      ).resolves.not.toBeNull();
      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("rolls back a failed spelling save and exposes the error in settings", async () => {
    expect.hasAssertions();
    try {
      installResizeObserverMock();
      const api = createSignedInCalendarApiMock();
      const settings = {
        ...createDefaultSettings(),
        language: "en" as const,
        spellcheckOnboardingSeen: true,
        visibleCalendarIds: ["calendar-1"],
      };
      api.settings.get = vi.fn().mockResolvedValue(settings);
      api.settings.update = vi.fn((patch: UserSettingsPatch) =>
        patch.spellcheckEnabled !== undefined
          ? Promise.reject(new Error("Save failed"))
          : Promise.resolve({ ...settings, ...patch }),
      );
      installCalendarApi(api);
      renderApp();
      fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
      fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
      fireEvent.click(await screen.findByRole("checkbox", { name: "Enable spell check" }));
      await screen.findByText("Could not save your preference. Please try again.");
      expect(
        (screen.getByRole("checkbox", { name: "Enable spell check" }) as HTMLInputElement).checked,
      ).toBe(true);
      expect(api.settings.update).toHaveBeenCalledWith({ spellcheckEnabled: false });
    } finally {
      restoreResizeObserver();
      restoreCalendarApi();
    }
  });
  it("persists the spelling introduction once and opens dictionary settings", async () => {
    expect.hasAssertions();
    try {
      installResizeObserverMock();
      const api = createSignedInCalendarApiMock();
      const settings = {
        ...createDefaultSettings(),
        language: "en" as const,
        visibleCalendarIds: ["calendar-1"],
      };
      api.settings.get = vi.fn().mockResolvedValue(settings);
      api.settings.update = vi
        .fn()
        .mockResolvedValue({ ...settings, spellcheckOnboardingSeen: true });
      api.spellcheck = {
        onDictionaryStatesChanged: vi.fn().mockReturnValue(() => undefined),
        addWord: vi.fn(),
        getDictionaries: vi.fn().mockResolvedValue({
          availableLanguages: ["en-US", "it"],
          dictionaryStates: { "en-US": "ready", it: "ready" },
          customWords: [],
          usesSystemLanguages: false,
        }),
        removeWord: vi.fn(),
      };
      installCalendarApi(api);
      const view = renderApp();
      await screen.findByRole("dialog", { name: "Spelling suggestions are here" });
      fireEvent.click(screen.getByRole("button", { name: "Manage dictionaries" }));
      await screen.findByRole("checkbox", { name: "Enable spell check" });
      expect(api.settings.update).toHaveBeenCalledWith({ spellcheckOnboardingSeen: true });
      expect(screen.queryByRole("dialog", { name: "Spelling suggestions are here" })).toBeNull();
      view.unmount();
      api.settings.get = vi.fn().mockResolvedValue({ ...settings, spellcheckOnboardingSeen: true });
      renderApp();
      await screen.findByRole("button", { name: "Settings" });
      expect(screen.queryByRole("dialog", { name: "Spelling suggestions are here" })).toBeNull();
    } finally {
      restoreResizeObserver();
      restoreCalendarApi();
    }
  });

  it("keeps the introduction open when saving fails", async () => {
    expect.hasAssertions();
    try {
      installResizeObserverMock();
      const api = createSignedInCalendarApiMock();
      api.settings.get = vi.fn().mockResolvedValue({
        ...createDefaultSettings(),
        language: "en",
        visibleCalendarIds: ["calendar-1"],
      });
      api.settings.update = vi.fn().mockRejectedValue(new Error("Save failed"));
      installCalendarApi(api);
      renderApp();
      fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
      await screen.findByText("Could not save your preference. Please try again.");
      expect(screen.getByRole("dialog", { name: "Spelling suggestions are here" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Got it" }).hasAttribute("disabled")).toBe(false);
    } finally {
      restoreResizeObserver();
      restoreCalendarApi();
    }
  });
  it("renders the Exchange auth screen when the preload bridge is available", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createCalendarApiMock();
      installCalendarApi(calendarApi);

      renderApp();

      await expect(
        screen.findByRole("button", { name: "Sync Microsoft 365" }),
      ).resolves.not.toBeNull();
      expect(screen.getByText(/Welcome to DefCalendar/i)).not.toBeNull();
      expect(screen.getByText(/Your personal calendar companion\./i)).not.toBeNull();
      expect(calendarApi.newEventNotifications.get).not.toHaveBeenCalled();
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

  it("uses the returned sign-in state before auth refetch completes", async () => {
    try {
      installResizeObserverMock();
      installCalendarApi(createDelayedAuthRefreshCalendarApiMock());

      renderApp();

      await expect(
        screen.findByRole("button", { name: "Sync Microsoft 365" }),
      ).resolves.not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Sync Microsoft 365" }));

      await expect(screen.findByText("Choose calendars to sync")).resolves.not.toBeNull();
      expect(screen.getByText("Calendar One")).not.toBeNull();
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

  it("does not show the in-app invite popup for system-only invite notifications", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const settings = {
        ...createDefaultSettings(),
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        newEventPopupEnabled: false,
        systemInviteNotificationsEnabled: true,
        taskbarInviteNotificationsEnabled: false,
      };
      calendarApi.settings.get = vi.fn().mockResolvedValue(settings);
      calendarApi.settings.update = vi.fn().mockResolvedValue(settings);
      calendarApi.newEventNotifications.get = vi
        .fn()
        .mockResolvedValue([createNewEventNotificationItem()]);
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      await waitFor(() => {
        expect(screen.queryByText("New invitations")).toBeNull();
      });
      expect(calendarApi.newEventNotifications.get).not.toHaveBeenCalled();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("shows the in-app invite popup when taskbar invite notifications are enabled", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const settings = {
        ...createDefaultSettings(),
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        newEventPopupEnabled: false,
        systemInviteNotificationsEnabled: false,
        taskbarInviteNotificationsEnabled: true,
      };
      calendarApi.settings.get = vi.fn().mockResolvedValue(settings);
      calendarApi.settings.update = vi.fn().mockResolvedValue(settings);
      calendarApi.newEventNotifications.get = vi
        .fn()
        .mockResolvedValue([createNewEventNotificationItem()]);
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByText("New invitations")).resolves.not.toBeNull();
      expect(screen.getByText("Planning invite")).not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("shows the in-app invite popup when popup invite notifications are enabled", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const settings = {
        ...createDefaultSettings(),
        selectedDate: signedInSelectedDate,
        visibleCalendarIds: ["calendar-1"],
        newEventPopupEnabled: true,
      };
      calendarApi.settings.get = vi.fn().mockResolvedValue(settings);
      calendarApi.settings.update = vi.fn().mockResolvedValue(settings);
      calendarApi.newEventNotifications.get = vi
        .fn()
        .mockResolvedValue([createNewEventNotificationItem()]);
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByText("New invitations")).resolves.not.toBeNull();
      expect(screen.getByText("Planning invite")).not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("opens the event editor when the main process requests an in-app event open", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const event = createCalendarEvent({ subject: "Reminder planning" });
      let openInAppListener: ((event: CalendarEvent) => void) | null = null;
      calendarApi.events.onOpenInApp = vi.fn().mockImplementation((listener) => {
        openInAppListener = listener;
        return () => undefined;
      });
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      expect(openInAppListener).toBeInstanceOf(Function);

      act(() => {
        openInAppListener?.(event);
      });

      await expect(screen.findByDisplayValue("Reminder planning")).resolves.not.toBeNull();
      expect(screen.getByRole("dialog")).not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("preserves native title copying and only copies the whole event without selected text", async () => {
    expect.hasAssertions();
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const event = createCalendarEvent({ isOrganizer: false });
      let openInAppListener: ((event: CalendarEvent) => void) | null = null;
      vi.spyOn(calendarApi.events, "onOpenInApp").mockImplementation((listener) => {
        openInAppListener = listener;
        return () => undefined;
      });
      installCalendarApi(calendarApi);
      renderApp();

      await screen.findByTestId("mock-calendar");
      act(() => {
        openInAppListener?.(event);
      });

      const subject = await screen.findByDisplayValue<HTMLInputElement>(event.subject);
      expect(subject).toMatchObject({ disabled: false, readOnly: true });
      subject.focus();
      subject.setSelectionRange(0, subject.value.length);
      expect(fireEvent.keyDown(subject, { key: "c", ctrlKey: true })).toBe(true);

      const selection = globalThis.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(screen.getByRole("dialog"));
      selection.removeAllRanges();
      selection.addRange(range);
      expect(selection.toString()).not.toBe("");
      expect([
        fireEvent.keyDown(document.body, { key: "c", ctrlKey: true }),
        fireEvent.keyDown(document.body, { key: "c", metaKey: true }),
      ]).toEqual([true, true]);

      selection.removeAllRanges();
      expect(fireEvent.keyDown(document.body, { key: "c", ctrlKey: true })).toBe(false);
    } finally {
      globalThis.getSelection()?.removeAllRanges();
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("checks recurring accept conflicts across the widened series lookup range", async () => {
    try {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date("2026-03-30T00:00:00.000Z"));
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      const event = createCalendarEvent({
        attendees: [
          {
            email: "organizer@example.com",
            name: "Organizer",
            response: "accepted",
            status: null,
            type: "required",
          },
        ],
        id: "occurrence-1",
        isOrganizer: false,
        seriesMasterId: "series-1",
        subject: "Recurring invite",
      });
      const earlierOccurrence = createCalendarEvent({
        end: "2026-02-23T10:00:00.000Z",
        id: "occurrence-0",
        seriesMasterId: "series-1",
        start: "2026-02-23T09:00:00.000Z",
      });
      const earlierConflict = createCalendarEvent({
        end: "2026-02-23T09:45:00.000Z",
        id: "earlier-conflict",
        start: "2026-02-23T09:15:00.000Z",
        subject: "Earlier conflict",
      });
      const earlierStartMs = new Date(earlierOccurrence.start).getTime();
      const earlierEndMs = new Date(earlierOccurrence.end).getTime();
      const widenedSeriesLookupStartCutoffMs = new Date("2026-01-01T00:00:00.000Z").getTime();
      const listEventsMock = vi
        .spyOn(calendarApi.events, "list")
        .mockImplementation(async (args: EventListArgs) => {
          const rangeStartMs = new Date(args.start).getTime();
          const rangeEndMs = new Date(args.end).getTime();
          if (
            rangeStartMs < widenedSeriesLookupStartCutoffMs &&
            rangeStartMs <= earlierStartMs &&
            rangeEndMs >= earlierEndMs
          ) {
            return [earlierOccurrence, earlierConflict];
          }

          return [];
        });
      let openInAppListener: ((event: CalendarEvent) => void) | null = null;
      vi.spyOn(calendarApi.events, "onOpenInApp").mockImplementation((listener) => {
        openInAppListener = listener;
        return () => undefined;
      });
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      act(() => {
        openInAppListener?.(event);
      });
      await expect(screen.findByDisplayValue("Recurring invite")).resolves.not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Accept" }));

      await expect(screen.findByText("Earlier conflict")).resolves.not.toBeNull();
      const overlapCall = listEventsMock.mock.calls.find(([args]) => {
        const rangeStartMs = new Date(args.start).getTime();
        const rangeEndMs = new Date(args.end).getTime();
        return (
          rangeStartMs < widenedSeriesLookupStartCutoffMs &&
          rangeStartMs <= earlierStartMs &&
          rangeEndMs >= earlierEndMs
        );
      });
      expect(overlapCall?.[0].calendarIds).toStrictEqual(["calendar-1"]);
      expect(overlapCall?.[0].start).toBe("2025-03-30T09:00:00.000Z");
      expect(new Date(overlapCall?.[0].end ?? "").getTime()).toBeLessThan(
        new Date("2027-03-30T00:01:00.000Z").getTime(),
      );
      expect(calendarApi.events.respond).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("loads categories on signed-in startup and colors events from the first category", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      calendarApi.categories.list = vi.fn().mockResolvedValue([
        { color: "preset7", displayName: "Blue category" },
        { color: "preset0", displayName: "Red category" },
      ]);
      calendarApi.events.list = vi.fn().mockResolvedValue([
        createCalendarEvent({
          categories: ["Blue category", "Red category"],
        }),
        createCalendarEvent({
          categories: ["Missing category", "Red category"],
          id: "event-2",
          subject: "Fallback event",
        }),
      ]);
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      await waitFor(() => {
        expect(calendarApi.categories.list).toHaveBeenCalledWith({ homeAccountId: "account-1" });
        const calendarEvents = (capturedCalendarProps?.events as EventInput[] | undefined) ?? [];
        expect(calendarEvents).toHaveLength(2);
        expect(calendarEvents[0]?.backgroundColor).toBe("rgba(37, 99, 235, 0.2)");
      });

      const calendarEvents = capturedCalendarProps?.events as EventInput[];

      expect(calendarEvents[0]).toStrictEqual(
        expect.objectContaining({
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          borderColor: "#2563eb",
          extendedProps: expect.objectContaining({
            calendarColor: null,
          }),
        }),
      );
      expect(calendarEvents[1]).toStrictEqual(
        expect.objectContaining({
          extendedProps: expect.objectContaining({
            calendarColor: "#bde7f6",
          }),
        }),
      );
      expect(calendarEvents[1]?.backgroundColor).toBeUndefined();
      expect(calendarEvents[1]?.borderColor).toBeUndefined();

      act(() => {
        useUiStore.getState().setSelectedDayForTable("2026-03-30T00:00:00.000Z");
      });

      const categoryBadge = await screen.findByText("Blue category");
      expect({
        backgroundColor: categoryBadge.style.backgroundColor,
        borderColor: categoryBadge.style.borderColor,
        color: categoryBadge.style.color,
        missingStyle: screen.getByText("Missing category").getAttribute("style"),
      }).toStrictEqual({
        backgroundColor: "rgb(37, 99, 235)",
        borderColor: "rgb(37, 99, 235)",
        color: "rgb(255, 255, 255)",
        missingStyle: null,
      });
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("normalizes attendee response values before assigning calendar event status classes", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      calendarApi.events.list = vi.fn().mockResolvedValue([
        createCalendarEvent({
          id: "event-accepted",
          isOrganizer: false,
          responseStatus: {
            response: " Accepted ",
            time: null,
          },
        }),
        createCalendarEvent({
          id: "event-declined",
          isOrganizer: false,
          responseStatus: {
            response: "DECLINED",
            time: null,
          },
        }),
      ]);
      installCalendarApi(calendarApi);

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      await waitFor(() => {
        const calendarEvents = (capturedCalendarProps?.events as EventInput[] | undefined) ?? [];
        expect(calendarEvents).toHaveLength(2);
      });

      const calendarEvents = capturedCalendarProps?.events as EventInput[];

      expect(calendarEvents[0]?.classNames).toContain("calendar-event--accepted");
      expect(calendarEvents[1]?.classNames).toContain("calendar-event--declined");
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("refetches both board and mini-calendar events after refresh", async () => {
    try {
      installResizeObserverMock();
      const calendarApi = createSignedInCalendarApiMock();
      calendarApi.sync.refresh = vi.fn().mockResolvedValue({
        lastSyncedAt: "2026-03-27T15:43:00.000Z",
        message: "Synced 1 calendar, 1 event.",
        messageKey: "sync.synced",
        counts: {
          calendars: 1,
          events: 1,
        },
        state: "idle",
      });
      installCalendarApi(calendarApi);

      renderApp();

      const listEventsMock = vi.mocked(calendarApi.events.list);

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();
      await waitFor(() => {
        expect(listEventsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      fireEvent.click(screen.getByTitle("Sync"));

      await waitFor(() => {
        expect(calendarApi.sync.refresh).toHaveBeenCalledOnce();
        expect(listEventsMock.mock.calls.length).toBeGreaterThanOrEqual(4);
      });
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });

  it("dismisses the day events table when navigating to a new range", async () => {
    try {
      installResizeObserverMock();
      installCalendarApi(createSignedInCalendarApiMock());

      renderApp();

      await expect(screen.findByTestId("mock-calendar")).resolves.not.toBeNull();

      const dateClick = capturedCalendarProps?.dateClick as
        | ((arg: { date: Date }) => void)
        | undefined;

      expect(dateClick).toBeInstanceOf(Function);

      act(() => {
        dateClick?.({
          date: new Date("2026-03-30T12:00:00.000Z"),
        });
      });

      await expect(screen.findByText("No events on this day")).resolves.not.toBeNull();

      const datesSet = capturedCalendarProps?.datesSet as
        | ((arg: {
            end: Date;
            start: Date;
            view: { calendar: { getDate: () => Date }; type: string };
          }) => void)
        | undefined;
      expect(datesSet).toBeInstanceOf(Function);

      act(() => {
        datesSet?.({
          end: new Date("2030-02-01T00:00:00.000Z"),
          start: new Date("2030-01-01T00:00:00.000Z"),
          view: {
            calendar: {
              getDate: () => mockCalendarSurfaceDate.current,
            },
            type: "timeGridWeek",
          },
        });
      });

      await waitFor(() => {
        expect(screen.queryByText("No events on this day")).toBeNull();
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
      const settingsUpdateArg = vi.mocked(calendarApi.settings.update).mock.calls.at(-1)?.[0];
      expect(settingsUpdateArg).toBeDefined();
      expect(settingsUpdateArg?.activeView).toBe("timeGridWeek");
      expect(settingsUpdateArg?.selectedDate).toBeDefined();
      expect(settingsUpdateArg?.selectedDate?.slice(0, 10)).toBe(startupDateKey);
      expect(settingsUpdateArg?.selectedDate?.slice(0, 10)).not.toBe(
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
      expect(screen.getByText(/restart the app|riavvia/i)).not.toBeNull();
    } finally {
      restoreCalendarApi();
      restoreResizeObserver();
    }
  });
});
