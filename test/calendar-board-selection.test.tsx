// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FullCalendar from "@fullcalendar/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarBoard from "../src/renderer/src/components/calendar-board";
import type { Hit, InteractionSettings } from "@fullcalendar/core/internal";
import { DateComponent } from "@fullcalendar/core/internal";
import dateContextPlugin from "../src/renderer/src/date-context-plugin";
import { toDateTimeInputValue } from "../src/shared/calendar";

function renderBoard(
  activeView: "dayGridMonth" | "timeGridWeek" | "timeGridDay",
  meeting?: { allDay?: boolean; cancelled?: boolean; joinUrl: null | string },
  onCreatePlaceholder?: React.ComponentProps<typeof CalendarBoard>["onCreatePlaceholder"],
) {
  const onEventClick = vi.fn();
  const onEventCopy = vi.fn();
  const onJoinMeeting = vi.fn();
  const calendarRef = React.createRef<FullCalendar>();
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
      calendarRef={calendarRef}
      onCreatePlaceholder={onCreatePlaceholder}
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
  return { ...view, calendarRef, eventData, onEventClick, onEventCopy, onJoinMeeting };
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

describe("calendar date context interaction", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the real month calendar context menu with the selected day range", () => {
    expect.hasAssertions();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { container, calendarRef } = renderBoard("dayGridMonth", undefined, onCreate);
    const cells = [...container.querySelectorAll<HTMLElement>(".fc-daygrid-day")];
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const index = cells.indexOf(this);
        if (index >= 0) {
          return new DOMRect(60 + (index % 7) * 100, 40 + Math.floor(index / 7) * 100, 100, 100);
        }
        return new DOMRect(60, 40, 700, 600);
      });
    try {
      act(() => {
        calendarRef
          .current!.getApi()
          .select({ start: "2026-03-30", end: "2026-04-01", allDay: true });
      });
      const cell = cells.find((value) => value.dataset.date === "2026-03-31")!;
      const rect = cell.getBoundingClientRect();
      fireEvent.contextMenu(cell, { clientX: rect.left + 50, clientY: rect.top + 50 });
      expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
      fireEvent.click(screen.getByRole("menuitem", { name: "Create placeholder" }));
      expect(screen.getByRole("dialog", { name: "Placeholder" })).not.toBeNull();
      expect((screen.getByLabelText("Start time") as HTMLInputElement).value).toBe(
        toDateTimeInputValue(new Date(2026, 2, 30, 9).toISOString(), false).slice(11),
      );
      expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
        toDateTimeInputValue(new Date(2026, 2, 31, 9, 30).toISOString(), false).slice(11),
      );
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog", { name: "Placeholder" })).toBeNull();
      expect(onCreate).not.toHaveBeenCalled();
    } finally {
      rectSpy.mockRestore();
    }
  });

  function createInteraction(allDay: boolean) {
    const el = document.createElement("div");
    const date = new Date("2026-09-30T09:00:00Z");
    const hit = {
      dateSpan: { range: { start: date, end: new Date(date.getTime() + 30 * 60_000) }, allDay },
      dateProfile: { activeRange: { start: new Date("2026-09-01"), end: new Date("2026-10-01") } },
    } as Hit;
    const queryHit = vi.fn<InteractionSettings["component"]["queryHit"]>().mockReturnValue(hit);
    const trigger = vi.fn();
    const settings = {
      el,
      component: {
        isValidDateDownEl: DateComponent.prototype.isValidDateDownEl,
        prepareHits: vi.fn(),
        queryHit,
        context: { emitter: { trigger }, dateEnv: { toDate: (value: Date) => value } },
      },
    } as unknown as InteractionSettings;
    el.getBoundingClientRect = () => new DOMRect(100, -200, 700, 1200);
    const interaction = new dateContextPlugin.componentInteractions[0](settings);
    return { el, date, hit, queryHit, trigger, interaction };
  }

  it.each([true, false])(
    "resolves a date context click using calendar hit coordinates (allDay: %s)",
    (allDay) => {
      const { el, date, queryHit, trigger, interaction } = createInteraction(allDay);
      expect(fireEvent.contextMenu(el, { clientX: 150, clientY: 200 })).toBe(false);
      expect(queryHit).toHaveBeenCalledExactlyOnceWith(50, 400, 700, 1200);
      expect(trigger).toHaveBeenCalledExactlyOnceWith("dateContextClick", {
        date,
        allDay,
        jsEvent: expect.any(MouseEvent),
      });
      interaction.destroy();
      fireEvent.contextMenu(el, { clientX: 150, clientY: 200 });
      expect(trigger).toHaveBeenCalledOnce();
    },
  );

  it("keeps existing event context clicks and inactive cells out of event creation", () => {
    const { el, hit, queryHit, trigger, interaction } = createInteraction(false);
    const existingEvent = document.createElement("div");
    existingEvent.className = "fc-event";
    el.append(existingEvent);
    expect(fireEvent.contextMenu(existingEvent, { clientX: 150, clientY: 200 })).toBe(true);
    expect(queryHit).not.toHaveBeenCalled();
    queryHit
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ ...hit, dateProfile: { ...hit.dateProfile, activeRange: null } });
    expect(fireEvent.contextMenu(el)).toBe(true);
    expect(fireEvent.contextMenu(el)).toBe(true);
    expect(trigger).not.toHaveBeenCalled();
    interaction.destroy();
  });
});
