// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FullCalendar from "@fullcalendar/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarBoard from "../src/renderer/src/components/calendar-board";

function renderBoard(activeView: "dayGridMonth" | "timeGridWeek") {
  const onEventClick = vi.fn();
  const view = render(
    <CalendarBoard
      activeView={activeView}
      calendarEvents={[
        {
          id: "event-1",
          title: "Planning",
          start: "2026-03-30T09:00:00",
          end: "2026-03-30T10:00:00",
        },
      ]}
      calendarRef={React.createRef<FullCalendar>()}
      hasVisibleCalendars
      isLoadingEvents={false}
      onDateClick={vi.fn()}
      onDateDoubleClick={vi.fn()}
      onDatesSet={vi.fn()}
      onEventClick={onEventClick}
      onEventCopy={vi.fn()}
      onEventDrop={vi.fn()}
      onEventResize={vi.fn()}
      selectedDate="2026-03-30T00:00:00"
      selectedDayForTable={null}
      timeFormat="24h"
    />,
  );
  return { ...view, onEventClick };
}

describe("calendar title selection", () => {
  afterEach(() => {
    globalThis.getSelection()?.removeAllRanges();
    cleanup();
  });

  it.each(["dayGridMonth", "timeGridWeek"] as const)(
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

  it("keeps dragging available outside the title", () => {
    expect.hasAssertions();
    const { container } = renderBoard("timeGridWeek");
    const time = container.querySelector(".fc-event-time")!;
    expect(fireEvent.mouseDown(time, { button: 0 })).toBe(false);
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.mouseUp(time);
    expect(document.body.style.userSelect).not.toBe("none");
  });
});
