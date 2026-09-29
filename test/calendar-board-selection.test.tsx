// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FullCalendar from "@fullcalendar/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarBoard from "../src/renderer/src/components/calendar-board";

function renderBoard(
  activeView: "dayGridMonth" | "timeGridWeek" | "timeGridDay",
  meeting?: { allDay?: boolean; cancelled?: boolean; joinUrl: null | string },
) {
  const onEventClick = vi.fn();
  const onEventCopy = vi.fn();
  const onJoinMeeting = vi.fn();
  const eventData = {
    location: "Meeting room",
    organizer: { name: "Giulia Rossi" },
    attendees: [{ name: "Luca Bianchi" }],
    bodyPreview: "Project review",
    isReminderOn: true,
    onlineMeeting: meeting ? { joinUrl: meeting.joinUrl } : null,
    cancelled: meeting?.cancelled ?? false,
  };
  const view = render(
    <CalendarBoard
      activeView={activeView}
      calendarEvents={[
        {
          id: "event-1",
          title: "Planning",
          start: "2026-03-30T09:00:00",
          end: "2026-03-30T10:00:00",
          allDay: meeting?.allDay ?? false,
          extendedProps: {
            calendarId: "work",
            eventId: "event-1",
            eventData,
          },
        },
      ]}
      calendarRef={React.createRef<FullCalendar>()}
      hasVisibleCalendars
      isLoadingEvents={false}
      onDateClick={vi.fn()}
      onDateDoubleClick={vi.fn()}
      onDatesSet={vi.fn()}
      onEventClick={onEventClick}
      onEventCopy={onEventCopy}
      onJoinMeeting={onJoinMeeting}
      onEventDrop={vi.fn()}
      onEventResize={vi.fn()}
      selectedDate="2026-03-30T00:00:00"
      selectedDayForTable={null}
      timeFormat="24h"
    />,
  );
  return { ...view, eventData, onEventClick, onEventCopy, onJoinMeeting };
}

describe("calendar title selection", () => {
  afterEach(() => {
    globalThis.getSelection()?.removeAllRanges();
    cleanup();
  });

  it.each(["dayGridMonth", "timeGridWeek", "timeGridDay"] as const)(
    "allows native selection in %s without opening or dragging the event",
    (activeView) => {
      expect.hasAssertions();
      const { onEventClick } = renderBoard(activeView);
      const title = screen.getByText("Planning");

      expect(fireEvent.mouseDown(title, { button: 0 })).toBe(true);
      expect(document.body.style.userSelect).not.toBe("none");
      const range = document.createRange();
      range.selectNodeContents(title);
      const selection = globalThis.getSelection()!;
      selection.addRange(range);
      fireEvent.mouseUp(title);
      fireEvent.click(title);
      expect(selection.toString()).toBe("Planning");
      expect(onEventClick).not.toHaveBeenCalled();

      selection.removeAllRanges();
      fireEvent.click(title);
      expect(onEventClick).toHaveBeenCalledOnce();
    },
  );

  it.each(["Meeting room", "Organizer: Giulia Rossi", "Attendees: Luca Bianchi", "Project review"])(
    "allows selecting %s without opening or dragging the event",
    (text) => {
      expect.hasAssertions();
      const { onEventClick } = renderBoard("timeGridDay");
      const detail = screen.getByText(text);

      expect(fireEvent.mouseDown(detail, { button: 0 })).toBe(true);
      expect(document.body.style.userSelect).not.toBe("none");
      const range = document.createRange();
      range.selectNodeContents(detail);
      const selection = globalThis.getSelection()!;
      selection.addRange(range);
      fireEvent.mouseUp(detail);
      fireEvent.click(detail);

      expect(selection.toString()).toBe(text);
      expect(onEventClick).not.toHaveBeenCalled();
      selection.removeAllRanges();
      fireEvent.click(detail);
      expect(onEventClick).toHaveBeenCalledOnce();
    },
  );

  it.each(["dayGridMonth", "timeGridWeek", "timeGridDay"] as const)(
    "copies the event in %s without opening or dragging it",
    (activeView) => {
      expect.hasAssertions();
      const { onEventClick, onEventCopy } = renderBoard(activeView);
      const button = screen.getByRole("button", { hidden: true });
      expect(button.getAttribute("aria-label")).toBe("Copy event");

      expect(fireEvent.mouseDown(button, { button: 0 })).toBe(true);
      expect(document.body.style.userSelect).not.toBe("none");
      fireEvent.mouseUp(button);
      fireEvent.click(button);

      expect(onEventCopy).toHaveBeenCalledExactlyOnceWith("work", "event-1");
      expect(onEventClick).not.toHaveBeenCalled();
      expect(button.getAttribute("aria-label")).toBe("Event copied");
    },
  );

  it("keeps dragging available outside the title", () => {
    expect.hasAssertions();
    const { container } = renderBoard("timeGridWeek");
    const time = container.querySelector(".fc-event-time")!;
    expect(fireEvent.mouseDown(time, { button: 0 })).toBe(false);
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.mouseUp(time);
    expect(document.body.style.userSelect).not.toBe("none");
  });

  it.each(["timeGridWeek", "timeGridDay"] as const)(
    "joins the meeting from its view-specific position in %s without opening or dragging it",
    (activeView) => {
      expect.hasAssertions();
      const { container, eventData, onEventClick, onEventCopy, onJoinMeeting } = renderBoard(
        activeView,
        {
          joinUrl: "https://meet.google.com/abc-defg-hij",
        },
      );
      const button = container.querySelector<HTMLButtonElement>(
        ".calendar-event-content__join-btn",
      )!;

      expect({
        label: button.getAttribute("aria-label"),
        isLast: button.parentElement?.lastElementChild === button,
        position: button.parentElement?.className,
        precedingElement: button.previousElementSibling?.classList.contains(
          activeView === "timeGridDay"
            ? "calendar-event-content__icon"
            : "calendar-event-card__body",
        ),
        details: [
          "Meeting room",
          "Organizer: Giulia Rossi",
          "Attendees: Luca Bianchi",
          "Project review",
        ].map((text) => screen.getByText(text).textContent),
      }).toStrictEqual({
        label: "Join meeting",
        isLast: true,
        position:
          activeView === "timeGridDay" ? "calendar-event-content__header" : "calendar-event-card",
        precedingElement: true,
        details: [
          "Meeting room",
          "Organizer: Giulia Rossi",
          "Attendees: Luca Bianchi",
          "Project review",
        ],
      });
      expect(fireEvent.mouseDown(button, { button: 0 })).toBe(true);
      expect(document.body.style.userSelect).not.toBe("none");
      fireEvent.mouseUp(button);
      fireEvent.click(button);

      expect(onJoinMeeting).toHaveBeenCalledExactlyOnceWith(eventData);
      expect({
        eventOpens: onEventClick.mock.calls.length,
        eventCopies: onEventCopy.mock.calls.length,
      }).toStrictEqual({ eventOpens: 0, eventCopies: 0 });
    },
  );

  it.each([
    { joinUrl: null },
    { joinUrl: "" },
    { joinUrl: " \n " },
    { joinUrl: "https://meet.google.com/abc-defg-hij", cancelled: true },
    { joinUrl: "https://meet.google.com/abc-defg-hij", allDay: true },
  ])("omits the meeting button for unavailable meetings: %j", (meeting) => {
    expect.hasAssertions();
    const { container } = renderBoard("timeGridDay", meeting);
    expect(container.querySelector(".calendar-event-content__join-btn")).toBeNull();
  });

  it("keeps the month event compact when it has a meeting link", () => {
    expect.hasAssertions();
    const { container } = renderBoard("dayGridMonth", {
      joinUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(container.querySelector(".calendar-event-content__join-btn")).toBeNull();
  });
});
