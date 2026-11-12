// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import NewEventPopup from "../src/renderer/src/components/new-event-popup";
import NewEventWindow from "../src/renderer/src/components/new-event-window";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { CalendarApi, NewEventNotificationItem } from "../src/shared/ipc";
import { createDefaultSettings, type CalendarEvent } from "../src/shared/schemas";

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
    spellcheck: {
      onDictionaryStatesChanged: vi.fn().mockReturnValue(() => undefined),
      addWord: vi.fn().mockResolvedValue(undefined),
      getDictionaries: vi.fn(),
      removeWord: vi.fn(),
    },
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
    locations: {
      map: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    },
    contacts: {
      getPhoto: vi.fn().mockResolvedValue(null),
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
      acknowledge: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
      dismissAll: vi.fn().mockResolvedValue(undefined),
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
  it("reports popup close failures without discarding the invitation", async () => {
    const api = installCalendarApi([createNotificationItem()]);
    vi.mocked(api.newEventNotifications.dismissAll).mockRejectedValueOnce(new Error("disk full"));
    renderPopup();
    await screen.findByText("Planning invite");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    await screen.findByRole("alert");
    expect(screen.getByText("Planning invite")).toBeInTheDocument();
    expect(api.events.respond).not.toHaveBeenCalled();
  });
  it("shows queue load failures and supports retry without losing pending notices", async () => {
    const api = installCalendarApi([createNotificationItem()]);
    vi.mocked(api.newEventNotifications.get).mockRejectedValueOnce(new Error("IPC unavailable"));
    renderPopup();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Planning invite");
    expect(api.newEventNotifications.dismissAll).not.toHaveBeenCalled();
  });
  it("discards an overlap lookup if an organizer changes the invitation while it is running", async () => {
    const item = createNotificationItem();
    const api = installCalendarApi([item]);
    let changed: ((items: NewEventNotificationItem[]) => void) | undefined;
    vi.mocked(api.newEventNotifications.onChanged).mockImplementation((listener) => {
      changed = listener;
      return () => undefined;
    });
    let resolveLookup: (events: CalendarEvent[]) => void = () => undefined;
    const lookup = new Promise<CalendarEvent[]>((resolve) => {
      resolveLookup = resolve;
    });
    renderPopup({ onFindAcceptConflicts: () => lookup });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await act(async () => {
      changed?.([
        {
          ...item,
          start: "2026-03-31T09:00:00.000Z",
          end: "2026-03-31T10:00:00.000Z",
          kind: "updated",
        },
      ]);
      resolveLookup([]);
      await lookup;
    });
    expect(api.events.respond).not.toHaveBeenCalled();
    expect(screen.getByText("Update to review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });
  it("only shows closed invitations when explicitly opened from the pending list", async () => {
    const item = createNotificationItem({ popupDismissed: true });
    const api = installCalendarApi([item]);
    const view = renderPopup();
    await waitFor(() => expect(api.newEventNotifications.get).toHaveBeenCalled());
    expect(screen.queryByText(item.subject)).not.toBeInTheDocument();
    view.unmount();
    const onClose = vi.fn();
    renderPopup({ showAll: true, onClose });
    await screen.findByText(item.subject);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.newEventNotifications.dismissAll).toHaveBeenCalledOnce();
    expect(api.events.respond).not.toHaveBeenCalled();
  });

  it("offers review rather than RSVP actions for cancellations", async () => {
    const item = createNotificationItem({ kind: "cancelled" });
    const api = installCalendarApi([item]);
    renderPopup({ showAll: true });
    await screen.findByText("Cancellation to review");
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(api.newEventNotifications.acknowledge).toHaveBeenCalledWith({
      calendarId: item.calendarId,
      eventId: item.eventId,
    });
    expect(api.events.respond).not.toHaveBeenCalled();
  });

  it("keeps a failed response actionable and shows the error", async () => {
    const api = installCalendarApi([createNotificationItem()]);
    vi.mocked(api.events.respond).mockRejectedValue(new Error("offline"));
    renderPopup();
    fireEvent.click(await screen.findByRole("button", { name: "Tentative" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Tentative" })).toBeEnabled();
    expect(api.newEventNotifications.dismiss).not.toHaveBeenCalled();
    expect(api.newEventNotifications.dismissAll).not.toHaveBeenCalled();
  });
  it("checks overlaps and responds inside the independent popup", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    vi.mocked(calendarApi.settings.get).mockResolvedValue({
      ...createDefaultSettings(),
      language: "en",
      theme: "dark",
      visibleCalendarIds: ["calendar-1"],
    });
    vi.mocked(calendarApi.events.list).mockResolvedValue([createCalendarEvent()]);

    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <NewEventWindow />
      </QueryClientProvider>,
    );
    await screen.findByText(item.subject);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await screen.findByRole("alertdialog");
    expect(calendarApi.events.list).toHaveBeenCalledWith({
      calendarIds: ["calendar-1"],
      start: item.start,
      end: item.end,
    });
    expect(calendarApi.events.respond).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Accept anyway" }));
    await waitFor(() =>
      expect(calendarApi.events.respond).toHaveBeenCalledWith({
        action: "accept",
        calendarId: item.calendarId,
        comment: "",
        eventId: item.eventId,
        sendResponse: true,
      }),
    );
    expect(calendarApi.events.openInApp).not.toHaveBeenCalled();
    view.unmount();
  });

  it("checks the latest selected calendars before accepting from an already open popup", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    const initialSettings = {
      ...createDefaultSettings(),
      language: "en" as const,
      visibleCalendarIds: ["calendar-1"],
    };
    vi.mocked(calendarApi.settings.get).mockResolvedValue(initialSettings);
    vi.mocked(calendarApi.events.list).mockResolvedValue([
      createCalendarEvent({ calendarId: "calendar-2" }),
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewEventWindow />
      </QueryClientProvider>,
    );
    await screen.findByText(item.subject);

    vi.mocked(calendarApi.settings.get).mockResolvedValue({
      ...initialSettings,
      visibleCalendarIds: ["calendar-1", "calendar-2"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await screen.findByRole("alertdialog");
    expect(calendarApi.events.list).toHaveBeenCalledWith({
      calendarIds: ["calendar-1", "calendar-2"],
      start: item.start,
      end: item.end,
    });
    expect(calendarApi.events.respond).not.toHaveBeenCalled();
  });

  it("does not accept when current calendar selections cannot be read", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    vi.mocked(calendarApi.settings.get).mockResolvedValue({
      ...createDefaultSettings(),
      language: "en",
      visibleCalendarIds: ["calendar-1"],
    });
    vi.mocked(calendarApi.events.list).mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewEventWindow />
      </QueryClientProvider>,
    );
    await screen.findByText(item.subject);

    vi.mocked(calendarApi.settings.get).mockRejectedValue(new Error("settings unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await screen.findByText("Unable to check for overlapping events. Try again before accepting.");
    expect(calendarApi.events.list).not.toHaveBeenCalled();
    expect(calendarApi.events.respond).not.toHaveBeenCalled();
  });

  it("lets the invitation popup be closed while initial settings are still loading", () => {
    const calendarApi = installCalendarApi([createNotificationItem()]);
    vi.mocked(calendarApi.settings.get).mockReturnValue(new Promise(() => undefined));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewEventWindow />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(calendarApi.newEventNotifications.dismissAll).toHaveBeenCalledOnce();
    expect(calendarApi.events.respond).not.toHaveBeenCalled();
  });

  it("reports a failed close even before popup settings have loaded", async () => {
    const api = installCalendarApi([createNotificationItem()]);
    vi.mocked(api.settings.get).mockReturnValue(new Promise(() => undefined));
    vi.mocked(api.newEventNotifications.dismissAll).mockRejectedValue(new Error("disk full"));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewEventWindow />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Unable to complete the action. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });

  it("reports initial settings errors and lets the user retry without opening the main app", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    vi.mocked(calendarApi.settings.get)
      .mockRejectedValueOnce(new Error("settings unavailable"))
      .mockResolvedValue({ ...createDefaultSettings(), language: "en" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NewEventWindow />
      </QueryClientProvider>,
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText(item.subject);
    expect(calendarApi.events.openInApp).not.toHaveBeenCalled();
    expect(calendarApi.settings.get).toHaveBeenCalledTimes(2);
  });

  it("ignores stale settings refreshes and removes popup subscriptions on unmount", async () => {
    const item = createNotificationItem();
    const calendarApi = installCalendarApi([item]);
    const settings = {
      ...createDefaultSettings(),
      language: "en" as const,
      theme: "dark" as const,
    };
    vi.mocked(calendarApi.settings.get).mockResolvedValue(settings);
    const listeners = new Set<(next: NewEventNotificationItem[]) => void>();
    vi.mocked(calendarApi.newEventNotifications.onChanged).mockImplementation((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    });
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <NewEventWindow />
      </QueryClientProvider>,
    );
    await screen.findByText(item.subject);

    let resolveStale: (value: typeof settings) => void = () => undefined;
    const stale = new Promise<typeof settings>((resolve) => {
      resolveStale = resolve;
    });
    vi.mocked(calendarApi.settings.get)
      .mockReturnValueOnce(stale)
      .mockResolvedValue({ ...settings, theme: "light" });
    fireEvent(window, new Event("focus"));
    act(() => {
      for (const listener of listeners) {
        listener([item]);
      }
    });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    await act(async () => {
      resolveStale(settings);
      await stale;
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    view.unmount();
    const previousCalls = vi.mocked(calendarApi.settings.get).mock.calls.length;
    fireEvent(window, new Event("focus"));
    expect(listeners.size).toBe(0);
    expect(calendarApi.settings.get).toHaveBeenCalledTimes(previousCalls);
  });

  it.each(["item", "all", "removed", "unmounted"])(
    "does not accept after the pending lookup is cancelled by %s",
    async (change) => {
      expect.hasAssertions();
      const item = createNotificationItem();
      const other = createNotificationItem({ eventId: "other", subject: "Other invitation" });
      const calendarApi = installCalendarApi([item, other]);
      let publish: (items: NewEventNotificationItem[]) => void = () => undefined;
      vi.spyOn(calendarApi.newEventNotifications, "onChanged").mockImplementation((listener) => {
        publish = listener;
        return () => undefined;
      });
      let resolveLookup: (events: CalendarEvent[]) => void = () => undefined;
      const lookup = new Promise<CalendarEvent[]>((resolve) => {
        resolveLookup = resolve;
      });
      const onFindAcceptConflicts = vi.fn().mockReturnValueOnce(lookup).mockResolvedValue([]);
      const view = renderPopup({ onFindAcceptConflicts });
      const title = await screen.findByText(item.subject);
      fireEvent.click(title.closest("li")!.querySelector(".new-event-popup__action--accept")!);
      expect(onFindAcceptConflicts).toHaveBeenCalledOnce();

      if (change === "item") {
        fireEvent.click(title.closest("li")!.querySelector("button")!);
      } else if (change === "all") {
        fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
      } else if (change === "removed") {
        act(() => publish([other]));
      } else {
        view.unmount();
      }

      await act(async () => {
        resolveLookup([]);
        await lookup;
      });
      expect(calendarApi.events.respond).not.toHaveBeenCalled();
    },
  );

  it("keeps checking an invitation when a different calendar's matching event id is removed", async () => {
    expect.hasAssertions();
    const item = createNotificationItem();
    const other = createNotificationItem({ calendarId: "calendar-2", subject: "Other invitation" });
    const calendarApi = installCalendarApi([item, other]);
    let publish: (items: NewEventNotificationItem[]) => void = () => undefined;
    vi.spyOn(calendarApi.newEventNotifications, "onChanged").mockImplementation((listener) => {
      publish = listener;
      return () => undefined;
    });
    let resolveLookup: (events: CalendarEvent[]) => void = () => undefined;
    const lookup = new Promise<CalendarEvent[]>((resolve) => {
      resolveLookup = resolve;
    });
    renderPopup({ onFindAcceptConflicts: vi.fn().mockReturnValue(lookup) });
    await screen.findByText(item.subject);
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]);

    await act(async () => {
      publish([item]);
      resolveLookup([]);
      await lookup;
    });

    await waitFor(() => {
      expect(calendarApi.events.respond).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ calendarId: item.calendarId, eventId: item.eventId }),
      );
    });
    expect(screen.queryByText(other.subject)).toBeNull();
  });

  it("ignores an old lookup failure while checking a new invitation", async () => {
    expect.hasAssertions();
    const item = createNotificationItem();
    const other = createNotificationItem({ calendarId: "calendar-2", subject: "Other invitation" });
    const calendarApi = installCalendarApi([item, other]);
    let publish: (items: NewEventNotificationItem[]) => void = () => undefined;
    vi.spyOn(calendarApi.newEventNotifications, "onChanged").mockImplementation((listener) => {
      publish = listener;
      return () => undefined;
    });
    let rejectFirst: (error: Error) => void = () => undefined;
    const firstLookup = new Promise<CalendarEvent[]>((_resolve, reject) => {
      rejectFirst = reject;
    });
    let resolveSecond: (events: CalendarEvent[]) => void = () => undefined;
    const secondLookup = new Promise<CalendarEvent[]>((resolve) => {
      resolveSecond = resolve;
    });
    const onFindAcceptConflicts = vi
      .fn()
      .mockReturnValueOnce(firstLookup)
      .mockReturnValueOnce(secondLookup);
    renderPopup({ onFindAcceptConflicts });
    await screen.findByText(item.subject);
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]);
    act(() => publish([other]));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await act(async () => {
      rejectFirst(new Error("Old lookup failed"));
      await firstLookup.catch(() => undefined);
    });
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(
      screen.queryByText("Unable to check for overlapping events. Try again before accepting."),
    ).toBeNull();
    expect(calendarApi.events.respond).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecond([]);
      await secondLookup;
    });
    await waitFor(() => {
      expect(calendarApi.events.respond).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ calendarId: other.calendarId, eventId: other.eventId }),
      );
    });
    expect(onFindAcceptConflicts).toHaveBeenCalledTimes(2);
  });

  it("focuses the dialog when pending invitations are present", async () => {
    installCalendarApi([createNotificationItem()]);

    renderPopup();

    const dialog = await screen.findByRole("dialog", { name: "Invitations to manage" });
    await waitFor(() => {
      expect(dialog).toHaveFocus();
    });

    dialog.blur();
    window.dispatchEvent(new Event("focus"));

    expect(dialog).toHaveFocus();
  });

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

  it("dismisses only the selected invite when event ids match across calendars", async () => {
    expect.hasAssertions();
    const first = createNotificationItem({ calendarId: "calendar-1", eventId: "shared-event" });
    const second = createNotificationItem({
      calendarId: "calendar-2",
      eventId: "shared-event",
      subject: "Second planning invite",
    });
    const calendarApi = installCalendarApi([first, second]);

    renderPopup();

    const firstInvite = await screen.findByText("Planning invite");
    fireEvent.click(
      firstInvite.closest(".new-event-popup__item")?.querySelector("button") as HTMLElement,
    );

    expect(calendarApi.newEventNotifications.dismiss).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "shared-event",
    });
  });

  it("does not let a stale initial response replace a newer notification update", async () => {
    expect.hasAssertions();
    let changeListener: ((items: NewEventNotificationItem[]) => void) | null = null;
    let resolveInitial: (items: NewEventNotificationItem[]) => void = () => undefined;
    const initialResponse = new Promise<NewEventNotificationItem[]>((resolve) => {
      resolveInitial = resolve;
    });
    const freshItem = createNotificationItem({ subject: "Fresh planning invite" });
    const calendarApi = installCalendarApi([]);
    vi.spyOn(calendarApi.newEventNotifications, "get").mockReturnValue(initialResponse);
    vi.spyOn(calendarApi.newEventNotifications, "onChanged").mockImplementation((listener) => {
      changeListener = listener;
      return () => undefined;
    });

    renderPopup();

    await act(async () => {
      changeListener?.([freshItem]);
      resolveInitial([]);
      await initialResponse;
    });

    expect(screen.getByText("Fresh planning invite")).toBeInTheDocument();
  });
});
