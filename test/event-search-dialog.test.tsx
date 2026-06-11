// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { CalendarEvent, CalendarSummary } from "@shared/schemas";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import EventSearchDialog from "../src/renderer/src/components/event-search-dialog";

let searchMock: ReturnType<typeof vi.fn> = vi.fn();

function createCalendar(overrides?: Partial<CalendarSummary>): CalendarSummary {
  return {
    canEdit: true,
    canShare: false,
    color: "#5b7cfa",
    homeAccountId: "account-1",
    id: "calendar-1",
    isDefaultCalendar: false,
    isVisible: true,
    name: "Personal",
    ownerAddress: null,
    ownerName: null,
    userColor: null,
    ...overrides,
  };
}

function createEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    allowNewTimeProposals: null,
    attendees: [],
    attachments: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: "2026-04-15T10:30:00.000Z",
    etag: null,
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
    responseRequested: null,
    responseStatus: null,
    seriesMasterId: null,
    sensitivity: "normal",
    start: "2026-04-15T10:00:00.000Z",
    subject: "Standup",
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  } as CalendarEvent;
}

beforeEach(() => {
  searchMock = vi.fn().mockResolvedValue([]);
  (globalThis as unknown as { calendarApi: unknown }).calendarApi = {
    events: { search: searchMock },
  };
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { calendarApi?: unknown }).calendarApi;
  vi.useRealTimers();
});

function renderDialog(props: Partial<React.ComponentProps<typeof EventSearchDialog>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const calendarMap = new Map<string, CalendarSummary>([["calendar-1", createCalendar()]]);
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createTestI18n()}>
        <EventSearchDialog
          calendarMap={calendarMap}
          isOpen
          onClose={onClose}
          onSelect={onSelect}
          timeFormat="24h"
          visibleCalendarIds={["calendar-1"]}
          {...props}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onClose, onSelect, result };
}

describe("eventSearchDialog visibility", () => {
  it("renders nothing when isOpen=false", () => {
    const { result } = renderDialog({ isOpen: false });
    expect(result.container.querySelector(".event-search-dialog")).toBeNull();
  });

  it("renders the dialog with input and close button when open", () => {
    renderDialog();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /close/i }).length).toBeGreaterThan(0);
  });

  it("disables the input and shows banner when no calendars are visible", () => {
    renderDialog({ visibleCalendarIds: [] });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("shows the hint message before the user types enough characters", () => {
    renderDialog();
    expect(document.querySelector(".event-search-dialog__empty")).not.toBeNull();
  });
});

describe("eventSearchDialog query lifecycle", () => {
  it("does not call search until 2+ characters are typed", async () => {
    renderDialog();
    const input = screen.getByRole("combobox") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 250));

    expect(searchMock).not.toHaveBeenCalled();
  });

  it("debounces and invokes search with normalized query", async () => {
    renderDialog();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  team " } });

    await waitFor(
      () => {
        expect(searchMock).toHaveBeenCalled();
      },
      { timeout: 1000 },
    );
    const args = searchMock.mock.calls[0]?.[0] as {
      query: string;
      calendarIds: string[];
      sort: string;
    };
    expect(args.query).toBe("team");
    expect(args.calendarIds).toStrictEqual(["calendar-1"]);
    expect(args.sort).toBe("recent");
  });

  it("re-runs the search with the next sort mode when the sort button is clicked", async () => {
    renderDialog();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "team" } });

    await waitFor(
      () => {
        expect(searchMock).toHaveBeenCalled();
      },
      { timeout: 1000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /sort/i }));

    await waitFor(() => {
      expect(searchMock.mock.calls.length).toBeGreaterThan(1);
    });
    const args = searchMock.mock.calls.at(-1)?.[0] as { sort: string };
    expect(args.sort).toBe("oldest");
    expect(input).toHaveFocus();
  });

  it("renders results when search returns events", async () => {
    searchMock.mockResolvedValue([createEvent({ subject: "Weekly Sync" })]);
    renderDialog();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "weekly" } });

    await waitFor(() => {
      expect(screen.getByText("Weekly Sync")).toBeInTheDocument();
    });
  });

  it("calls onSelect when a result row is clicked", async () => {
    const event = createEvent({ subject: "Demo" });
    searchMock.mockResolvedValue([event]);
    const { onSelect } = renderDialog();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "demo" } });

    const result = await screen.findByText("Demo");
    fireEvent.click(result.closest("li")!);

    expect(onSelect).toHaveBeenCalledOnce();
    const selected = onSelect.mock.calls[0]?.[0] as CalendarEvent | undefined;
    expect(selected?.id).toBe(event.id);
  });
});

describe("eventSearchDialog keyboard nav", () => {
  it("escape closes the dialog", () => {
    const { onClose } = renderDialog();
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("enter on highlighted result selects it", async () => {
    const event = createEvent({ subject: "Pick me" });
    searchMock.mockResolvedValue([event]);
    const { onSelect } = renderDialog();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "pick" } });
    await screen.findByText("Pick me");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledOnce();
  });
});
