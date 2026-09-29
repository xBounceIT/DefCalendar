// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const renderContent = (overrides = props) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createTestI18n()}>
        <EventSearchDialog
          calendarMap={calendarMap}
          isOpen
          onClose={onClose}
          onSelect={onSelect}
          timeFormat="24h"
          visibleCalendarIds={["calendar-1"]}
          {...overrides}
        />
      </I18nextProvider>
    </QueryClientProvider>
  );
  const result = render(renderContent());
  return {
    onClose,
    onSelect,
    result,
    rerenderDialog: (overrides: Partial<React.ComponentProps<typeof EventSearchDialog>>) => {
      result.rerender(renderContent({ ...props, ...overrides }));
    },
  };
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

  it("changes sort only after choosing an option from the popup", async () => {
    expect.hasAssertions();
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
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "Most recent" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(searchMock).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Best match" }));

    await waitFor(() => {
      expect(searchMock.mock.calls.length).toBeGreaterThan(1);
    });
    const args = searchMock.mock.calls.at(-1)?.[0] as { sort: string };
    expect(args.sort).toBe("relevance");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("keeps the selection when reopening the menu and resets it after closing the dialog", async () => {
    expect.hasAssertions();
    const { rerenderDialog } = renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    const sortButton = screen.getByRole("button", { name: /sort/i });
    fireEvent.click(sortButton);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Oldest first" }));
    expect(sortButton).toHaveTextContent("Oldest first");
    fireEvent.click(sortButton);
    const selectedOption = screen.getByRole("menuitemradio", { name: "Oldest first" });
    expect(selectedOption).toHaveAttribute("aria-checked", "true");
    expect(selectedOption).toHaveFocus();
    rerenderDialog({ isOpen: false });
    rerenderDialog({ isOpen: true });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sort/i })).toHaveTextContent("Most recent");
    expect(searchMock).not.toHaveBeenCalled();
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

  it("preserves a selected result title for copying", async () => {
    expect.hasAssertions();
    searchMock.mockResolvedValue([createEvent()]);
    const { onSelect } = renderDialog();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "stand" } });
    const title = await screen.findByText("Standup");
    title.closest("li")?.focus();
    const selection = globalThis.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(title);
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      fireEvent.click(title);
      expect(onSelect).not.toHaveBeenCalled();
      expect(selection.toString()).toBe("Standup");
      selection.removeAllRanges();
      fireEvent.click(title);
      expect(onSelect).toHaveBeenCalledOnce();
    } finally {
      selection.removeAllRanges();
    }
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
  it.each([false, true])("closes the sort menu on Tab with shift=%s", async (shiftKey) => {
    expect.hasAssertions();
    const { onClose } = renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    const sortButton = screen.getByRole("button", { name: /sort/i });
    fireEvent.click(sortButton);
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "Most recent" }), {
      key: "Tab",
      shiftKey,
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(sortButton).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dismisses the open sort menu with Escape when focus returns to its trigger", async () => {
    expect.hasAssertions();
    const { onClose } = renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    const sortButton = screen.getByRole("button", { name: /sort/i });
    fireEvent.click(sortButton);
    act(() => sortButton.focus());
    fireEvent.keyDown(sortButton, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(sortButton).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the menu when visible calendars disappear and keeps it closed on their return", async () => {
    expect.hasAssertions();
    const { rerenderDialog } = renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: /sort/i }));
    rerenderDialog({ visibleCalendarIds: [] });
    expect(screen.getByRole("button", { name: /sort/i })).toBeDisabled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    rerenderDialog({ visibleCalendarIds: ["calendar-1"] });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports popup keyboard navigation and dismisses it without closing the dialog", () => {
    expect.hasAssertions();
    const { onClose } = renderDialog();
    const sortButton = screen.getByRole("button", { name: /sort/i });
    fireEvent.keyDown(sortButton, { key: "ArrowDown" });
    const recentOption = screen.getByRole("menuitemradio", { name: "Most recent" });
    const oldestOption = screen.getByRole("menuitemradio", { name: "Oldest first" });
    expect(recentOption).toHaveFocus();
    fireEvent.keyDown(recentOption, { key: "ArrowDown" });
    expect(oldestOption).toHaveFocus();
    fireEvent.keyDown(oldestOption, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(sortButton).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dismisses the popup when clicking outside without changing sort", () => {
    expect.hasAssertions();
    renderDialog();
    const sortButton = screen.getByRole("button", { name: /sort/i });
    fireEvent.click(sortButton);
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(sortButton).toHaveTextContent("Most recent");
  });

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
