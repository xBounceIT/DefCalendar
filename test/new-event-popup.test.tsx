// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import NewEventPopup from "../src/renderer/src/components/new-event-popup";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { CalendarApi, NewEventNotificationItem } from "../src/shared/ipc";
import type { CalendarEvent } from "../src/shared/schemas";

const originalCalendarApiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "calendarApi");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();

  if (originalCalendarApiDescriptor) {
    Object.defineProperty(globalThis, "calendarApi", originalCalendarApiDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "calendarApi");
});

function createNotificationItem(
  overrides: Partial<NewEventNotificationItem> = {},
): NewEventNotificationItem {
  return {
    calendarId: "calendar-1",
    end: "2026-03-30T10:00:00.000Z",
    eventId: "event-1",
    isAllDay: false,
    location: null,
    onlineMeetingJoinUrl: null,
    organizerEmail: "organizer@example.com",
    organizerName: "Organizer",
    start: "2026-03-30T09:00:00.000Z",
    subject: "Planning invite",
    ...overrides,
  };
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
    id: "conflict-1",
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
    start: "2026-03-30T09:30:00.000Z",
    subject: "Existing busy event",
    seriesMasterId: null,
    occurrenceId: null,
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

function installCalendarApi(items: NewEventNotificationItem[]): CalendarApi {
  const calendarApi = {
    app: {
      getLocale: vi.fn().mockResolvedValue("en-US"),
      getVersion: vi.fn().mockResolvedValue("v0.1.0"),
      setLocale: vi.fn().mockResolvedValue(undefined),
    },
    auth: {
      getState: vi.fn(),
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
      list: vi.fn(),
    },
    contacts: {
      search: vi.fn(),
    },
    events: {
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
      respond: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
    },
    settings: {
      get: vi.fn(),
      update: vi.fn(),
    },
    sync: {
      getStatus: vi.fn(),
      onStatus: vi.fn().mockReturnValue(() => undefined),
      refresh: vi.fn(),
    },
    updates: {
      check: vi.fn(),
      download: vi.fn(),
      getStatus: vi.fn(),
      install: vi.fn(),
      onStatus: vi.fn().mockReturnValue(() => undefined),
    },
    reminder: {
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
      getState: vi.fn(),
      minimizeWindow: vi.fn(),
      onState: vi.fn().mockReturnValue(() => undefined),
      snooze: vi.fn(),
    },
    newEventNotifications: {
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
      get: vi.fn().mockResolvedValue(items),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
  } satisfies CalendarApi;

  Object.defineProperty(globalThis, "calendarApi", {
    configurable: true,
    value: calendarApi,
    writable: true,
  });

  return calendarApi;
}

function renderPopup(props?: Partial<React.ComponentProps<typeof NewEventPopup>>) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const onFindAcceptConflicts = props?.onFindAcceptConflicts ?? vi.fn().mockResolvedValue([]);

  const view = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <NewEventPopup
          onFindAcceptConflicts={onFindAcceptConflicts}
          timeFormat="system"
          {...props}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { ...view, onFindAcceptConflicts };
}

describe("new event popup", () => {
  it("warns before accepting overlapping invitations", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([createCalendarEvent()]);

    renderPopup({ onFindAcceptConflicts });

    await expect(screen.findByText("Planning invite")).resolves.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await expect(screen.findByText("Existing busy event")).resolves.toBeInTheDocument();
    expect(calendarApi.events.respond).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept anyway" }));

    await waitFor(() => {
      expect(calendarApi.events.respond).toHaveBeenCalledWith({
        action: "accept",
        calendarId: item.calendarId,
        comment: "",
        eventId: item.eventId,
        sendResponse: true,
      });
    });
  });

  it("responds tentatively without checking overlaps", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([createCalendarEvent()]);

    renderPopup({ onFindAcceptConflicts });

    await expect(screen.findByText("Planning invite")).resolves.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentative" }));

    await waitFor(() => {
      expect(calendarApi.events.respond).toHaveBeenCalledWith({
        action: "tentative",
        calendarId: item.calendarId,
        comment: "",
        eventId: item.eventId,
        sendResponse: true,
      });
    });
    expect(onFindAcceptConflicts).not.toHaveBeenCalled();
  });

  it("declines without checking overlaps", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([createCalendarEvent()]);

    renderPopup({ onFindAcceptConflicts });

    await expect(screen.findByText("Planning invite")).resolves.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => {
      expect(calendarApi.events.respond).toHaveBeenCalledWith({
        action: "decline",
        calendarId: item.calendarId,
        comment: "",
        eventId: item.eventId,
        sendResponse: true,
      });
    });
    expect(onFindAcceptConflicts).not.toHaveBeenCalled();
  });

  it("shows an error and does not accept when overlap lookup fails", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    const onFindAcceptConflicts = vi.fn().mockRejectedValue(new Error("lookup failed"));

    renderPopup({ onFindAcceptConflicts });

    await expect(screen.findByText("Planning invite")).resolves.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await expect(
      screen.findByText("Unable to check for overlapping events. Try again before accepting."),
    ).resolves.toBeInTheDocument();
    expect(calendarApi.events.respond).not.toHaveBeenCalled();
  });
});
