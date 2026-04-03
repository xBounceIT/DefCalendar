// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import React from "react";
import i18n from "i18next";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import CalendarBoard from "../src/renderer/src/components/calendar-board";
import type { CalendarView } from "../src/shared/schemas";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

let capturedCalendarProps: Record<string, unknown> | null = null;

vi.mock<{
  default: unknown;
}>(import("@fullcalendar/react"), async () => {
  const ReactModule = await import("react");

  return {
    default: ReactModule.forwardRef(function MockCalendar(props, ref) {
      capturedCalendarProps = props as Record<string, unknown>;

      ReactModule.useImperativeHandle(ref, () => ({
        getApi: () => ({
          updateSize: vi.fn(),
        }),
      }));

      return <div data-testid="mock-calendar" />;
    }),
  };
});

afterEach(() => {
  cleanup();
  capturedCalendarProps = null;
});

async function renderBoard(language: "en" | "it") {
  if (language === "it") {
    i18n.addResourceBundle("it", "translation", itTranslations, true, true);
  }

  await i18n.changeLanguage(language);

  const events: EventInput[] = [];
  const calendarRef = React.createRef<any>();

  render(
    <CalendarBoard
      activeView={"timeGridWeek" as CalendarView}
      calendarEvents={events}
      calendarRef={calendarRef}
      hasVisibleCalendars
      onDateClick={vi.fn()}
      onDatesSet={vi.fn()}
      onEventClick={vi.fn()}
      onEventDrop={vi.fn()}
      onEventResize={vi.fn()}
      selectedDate="2026-03-29T00:00:00.000Z"
      selectedDayForTable={null}
      timeFormat="system"
    />,
  );
}

function renderCalendarEvent(options?: {
  isOrganizer?: boolean;
  isReminderOn?: boolean;
  response?: null | string;
}) {
  const isOrganizer = options?.isOrganizer ?? false;
  const isReminderOn = options?.isReminderOn ?? false;
  const response = options?.response ?? null;
  const eventContent = capturedCalendarProps?.eventContent as (
    info: EventContentArg,
  ) => React.ReactNode;
  const eventDidMount = capturedCalendarProps?.eventDidMount as
    | ((info: { event: EventContentArg["event"]; el: HTMLElement }) => void)
    | undefined;
  const eventMouseEnter = capturedCalendarProps?.eventMouseEnter as
    | ((info: { event: EventContentArg["event"]; el: HTMLElement; jsEvent: MouseEvent }) => void)
    | undefined;
  const eventMouseLeave = capturedCalendarProps?.eventMouseLeave as (() => void) | undefined;

  const event = {
    title: "Focus time",
    extendedProps: {
      eventData: {
        isOrganizer,
        isReminderOn,
        responseStatus: response
          ? {
              response,
              time: null,
            }
          : null,
      },
    },
  } as EventContentArg["event"];

  const rendered = render(
    <>
      {eventContent({
        event,
        timeText: "9:00",
      } as EventContentArg)}
    </>,
  );

  const container = rendered.container.querySelector(".calendar-event-content");
  if (container instanceof HTMLElement) {
    act(() => {
      eventDidMount?.({
        el: container,
        event,
      });
      eventMouseEnter?.({
        el: container,
        event,
        jsEvent: new MouseEvent("mouseenter", {
          bubbles: true,
          clientX: 120,
          clientY: 80,
        }),
      });
    });
  }

  return {
    ...rendered,
    hideTooltip: () => {
      eventMouseLeave?.();
    },
  };
}

describe("calendar board locale", () => {
  it("passes the Italian locale and translated all-day label", async () => {
    await renderBoard("it");

    expect(capturedCalendarProps?.locale).toBe("it");
    expect(capturedCalendarProps?.allDayText).toBe("Giornata intera");
    expectTypeOf(capturedCalendarProps?.dateClick).toBeFunction();
    expect(capturedCalendarProps?.selectable).toBeUndefined();
    expect(capturedCalendarProps?.select).toBeUndefined();
    expect(capturedCalendarProps?.selectMirror).toBeUndefined();
  });

  it("passes the English locale and translated all-day label", async () => {
    await renderBoard("en");

    expect(capturedCalendarProps?.locale).toBe("en");
    expect(capturedCalendarProps?.allDayText).toBe("All day");
  });

  it("passes the day click callback to FullCalendar", async () => {
    await renderBoard("en");

    expect(capturedCalendarProps?.dateClick).toEqual(expect.any(Function));
    expect(capturedCalendarProps?.dayCellClassNames).toEqual(expect.any(Function));
    expect(capturedCalendarProps?.eventMouseEnter).toEqual(expect.any(Function));
    expect(capturedCalendarProps?.eventMouseLeave).toEqual(expect.any(Function));
    expect(capturedCalendarProps?.selectable).toBeUndefined();
    expect(capturedCalendarProps?.select).toBeUndefined();
    expect(capturedCalendarProps?.selectMirror).toBeUndefined();
  });

  it("renders a bell icon for events with reminders", async () => {
    await renderBoard("en");

    const { container, getByText } = renderCalendarEvent({ isReminderOn: true });

    getByText("9:00");
    getByText("Focus time");
    expect(container.querySelector(".calendar-event-content__icon")).not.toBeNull();
  });

  it("does not render a bell icon for events without reminders", async () => {
    await renderBoard("en");

    const { container } = renderCalendarEvent({ isReminderOn: false });

    expect(container.querySelector(".calendar-event-content__icon")).toBeNull();
  });

  it("renders attendee response tooltip text", async () => {
    await renderBoard("en");

    const { queryByTitle } = renderCalendarEvent({ response: " Accepted " });

    expect(queryByTitle("Your response: Accepted")).toBeNull();
    await waitFor(() => {
      expect(document.querySelector(".calendar-event-tooltip")?.textContent).toBe(
        "Your response: Accepted",
      );
    });
  });

  it("renders organizer ownership tooltip text", async () => {
    await renderBoard("en");

    const { queryByTitle } = renderCalendarEvent({ isOrganizer: true });

    expect(queryByTitle("You're the owner")).toBeNull();
    await waitFor(() => {
      expect(document.querySelector(".calendar-event-tooltip")?.textContent).toBe(
        "You're the owner",
      );
    });
  });

  it("renders organizer ownership tooltip text in Italian", async () => {
    await renderBoard("it");

    const { queryByTitle } = renderCalendarEvent({ isOrganizer: true });

    expect(queryByTitle("Sei il proprietario")).toBeNull();
    await waitFor(() => {
      expect(document.querySelector(".calendar-event-tooltip")?.textContent).toBe(
        "Sei il proprietario",
      );
    });
  });

  it("hides the custom tooltip on mouse leave", async () => {
    await renderBoard("en");

    const { hideTooltip } = renderCalendarEvent({ response: "accepted" });

    await waitFor(() => {
      expect(document.querySelector(".calendar-event-tooltip")).not.toBeNull();
    });

    act(() => {
      hideTooltip();
    });

    await waitFor(() => {
      expect(document.querySelector(".calendar-event-tooltip")).toBeNull();
    });
  });
});
