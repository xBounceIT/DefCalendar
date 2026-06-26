// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import DayEventsTable from "../src/renderer/src/components/day-events-table";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import type { CalendarEvent } from "../src/shared/schemas";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function createEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
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
    end: "2026-03-31T11:00:00.000Z",
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
    start: "2026-03-30T14:00:00.000Z",
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

function createRect(height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: 100,
    toJSON: () => ({}),
    top: 0,
    width: 100,
    x: 0,
    y: 0,
  } as DOMRect;
}

interface RenderTableArgs {
  events?: CalendarEvent[];
  getEventCategoryColor?: (event: CalendarEvent) => null | string;
  language?: "en" | "it";
  selectedDay?: null | string;
}

function getSelectedDay(args?: RenderTableArgs): null | string {
  if (args && "selectedDay" in args) {
    return args.selectedDay ?? null;
  }

  return "2026-03-30T00:00:00.000Z";
}

function mockDayEventsTableMeasurements() {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  return vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function measureDayEventsTableElement(this: Element) {
      if (this.classList.contains("day-events-table__header")) {
        return createRect(32);
      }

      if (this.tagName.toLowerCase() === "thead") {
        return createRect(24);
      }

      if (this.classList.contains("day-events-table__row")) {
        return createRect(28);
      }

      return originalGetBoundingClientRect.call(this);
    });
}

function renderTable(args?: RenderTableArgs) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: enTranslations },
      it: { translation: itTranslations },
    },
    lng: args?.language ?? "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const onClear = vi.fn();
  const onEventClick = vi.fn();
  const onJoinMeeting = vi.fn();
  let currentArgs = args;

  const renderContent = (renderArgs?: RenderTableArgs) => (
    <I18nextProvider i18n={i18n}>
      <DayEventsTable
        events={renderArgs?.events ?? []}
        getEventCategoryColor={renderArgs?.getEventCategoryColor ?? (() => null)}
        onClear={onClear}
        onEventClick={onEventClick}
        onJoinMeeting={onJoinMeeting}
        selectedDay={getSelectedDay(renderArgs)}
        timeFormat="system"
      />
    </I18nextProvider>
  );

  const renderResult = render(renderContent(currentArgs));

  return {
    onClear,
    onEventClick,
    onJoinMeeting,
    rerenderTable(nextArgs: RenderTableArgs) {
      currentArgs = { ...currentArgs, ...nextArgs };
      renderResult.rerender(renderContent(currentArgs));
    },
  };
}

describe("day events table", () => {
  it("uses translated untitled fallback text", () => {
    renderTable({
      events: [createEvent({ id: "untitled", subject: "" })],
      language: "it",
    });

    expect(screen.getByText("Evento senza titolo")).toBeInTheDocument();
  });

  it("shows timed multi-day event on intermediate day", () => {
    renderTable({
      events: [
        createEvent({
          end: "2026-04-02T14:00:00.000Z",
          start: "2026-03-30T14:00:00.000Z",
          subject: "Multi-day timed event",
        }),
      ],
      selectedDay: "2026-04-01T12:00:00.000Z",
    });

    expect(screen.getByText("Multi-day timed event")).toBeInTheDocument();
  });

  it("colors category badges from the supplied category color resolver", () => {
    expect.assertions(2);

    renderTable({
      events: [
        createEvent({
          categories: ["Blue category"],
          id: "blue-event",
          subject: "Blue event",
        }),
        createEvent({
          categories: ["Yellow category"],
          end: "2026-03-30T16:00:00.000Z",
          id: "yellow-event",
          start: "2026-03-30T15:00:00.000Z",
          subject: "Yellow event",
        }),
      ],
      getEventCategoryColor: (event) =>
        event.id === "yellow-event" ? "#facc15" : "#2563eb",
    });

    expect(screen.getByText("Blue category")).toHaveStyle({
      backgroundColor: "rgb(37, 99, 235)",
      borderColor: "rgb(37, 99, 235)",
      color: "rgb(255, 255, 255)",
    });
    expect(screen.getByText("Yellow category")).toHaveStyle({
      backgroundColor: "rgb(250, 204, 21)",
      borderColor: "rgb(250, 204, 21)",
      color: "rgb(17, 24, 39)",
    });
  });

  it("marks ended events as completed and refreshes every minute", () => {
    expect.assertions(3);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T10:00:00.000Z"));

    renderTable({
      events: [
        createEvent({
          end: "2026-03-30T10:00:00.000Z",
          id: "ended-now",
          start: "2026-03-30T09:00:00.000Z",
          subject: "Ended now",
        }),
        createEvent({
          end: "2026-03-30T10:01:00.000Z",
          id: "ends-soon",
          start: "2026-03-30T09:30:00.000Z",
          subject: "Ends soon",
        }),
      ],
    });

    const endedRow = screen.getByText("Ended now").closest("tr");
    const futureRow = screen.getByText("Ends soon").closest("tr");

    expect(endedRow).toHaveClass("day-events-table__row--completed");
    expect(futureRow).not.toHaveClass("day-events-table__row--completed");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(futureRow).toHaveClass("day-events-table__row--completed");
  });

  it("opens event on row click without clearing table", () => {
    const event = createEvent({ subject: "Clickable" });
    const { onClear, onEventClick } = renderTable({ events: [event] });

    fireEvent.click(screen.getByText("Clickable"));

    expect(onEventClick).toHaveBeenCalledWith(event);
    expect(onClear).not.toHaveBeenCalled();
  });

  it("shows meeting as the rightmost column header", () => {
    renderTable({ events: [createEvent()] });

    const headers = screen
      .getAllByRole("columnheader")
      .map((columnHeader) => columnHeader.textContent?.trim() ?? "");

    expect(headers[headers.length - 2]).toBe("Action");
    expect(headers[headers.length - 1]).toBe("Meeting");
  });

  it("shows attendee response and organizer ownership in action column", () => {
    renderTable({
      language: "en",
      events: [
        createEvent({
          id: "attendee-accepted",
          isOrganizer: false,
          responseStatus: {
            response: "accepted",
            time: null,
          },
          subject: "Accepted attendee event",
        }),
        createEvent({
          id: "attendee-pending",
          isOrganizer: false,
          responseStatus: {
            response: "none",
            time: null,
          },
          subject: "Pending attendee event",
        }),
        createEvent({
          id: "organizer",
          isOrganizer: true,
          responseStatus: {
            response: "declined",
            time: null,
          },
          subject: "Owned event",
        }),
      ],
    });

    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Yet to respond")).toBeInTheDocument();
    expect(screen.getByText("You're the owner")).toBeInTheDocument();
  });

  it("shows join button and calls onJoinMeeting when clicked", () => {
    const event = createEvent({
      subject: "Online Meeting Event",
      onlineMeeting: {
        joinUrl: "https://teams.example.com/meeting",
        conferenceId: null,
        phones: [],
        provider: "Teams",
      },
    });
    const { onJoinMeeting } = renderTable({ events: [event] });

    const joinButton = screen.getByRole("button", { name: "Join meeting" });
    expect(joinButton).toBeInTheDocument();

    fireEvent.click(joinButton);

    expect(onJoinMeeting).toHaveBeenCalledWith(event);
  });

  it("resizes the event list height between the current height and ten rows", () => {
    expect.assertions(4);

    const getBoundingClientRectMock = mockDayEventsTableMeasurements();
    let panel: Element | null = null;

    try {
      const events = Array.from({ length: 12 }, (_, index) =>
        createEvent({ id: `event-${index}`, subject: `Event ${index}` }),
      );
      renderTable({ events });

      const resizeHandle = screen.getByRole("separator", { name: "Resize event list" });
      panel = resizeHandle.closest(".day-events-table");
      expect(panel).toHaveStyle({ height: "160px" });
      expect([
        resizeHandle.getAttribute("aria-valuemin"),
        resizeHandle.getAttribute("aria-valuemax"),
      ]).toStrictEqual(["160", "344"]);

      fireEvent.mouseDown(resizeHandle, { clientY: 0 });
      fireEvent.mouseMove(document, { clientY: 1000 });

      expect(panel).toHaveStyle({ height: "344px" });

      fireEvent.mouseMove(document, { clientY: -1000 });
      fireEvent.mouseUp(document);
    } finally {
      getBoundingClientRectMock.mockRestore();
    }

    expect(panel).toHaveStyle({ height: "160px" });
  });

  it("resets resized height after the event list closes", () => {
    expect.assertions(2);

    const getBoundingClientRectMock = mockDayEventsTableMeasurements();
    let reopenedPanel: Element | null = null;

    try {
      const events = Array.from({ length: 12 }, (_, index) =>
        createEvent({ id: `event-${index}`, subject: `Event ${index}` }),
      );
      const { rerenderTable } = renderTable({ events });

      const resizeHandle = screen.getByRole("separator", { name: "Resize event list" });
      const panel = resizeHandle.closest(".day-events-table");
      fireEvent.mouseDown(resizeHandle, { clientY: 0 });
      fireEvent.mouseMove(document, { clientY: 1000 });
      fireEvent.mouseUp(document);

      expect(panel).toHaveStyle({ height: "344px" });

      rerenderTable({ selectedDay: null });
      rerenderTable({ selectedDay: "2026-03-30T00:00:00.000Z" });

      reopenedPanel = screen
        .getByRole("separator", { name: "Resize event list" })
        .closest(".day-events-table");
    } finally {
      getBoundingClientRectMock.mockRestore();
    }

    expect(reopenedPanel).toHaveStyle({ height: "160px" });
  });
});
