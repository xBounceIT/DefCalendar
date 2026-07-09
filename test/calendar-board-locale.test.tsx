// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import React from "react";
import i18n from "i18next";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import CalendarBoard from "../src/renderer/src/components/calendar-board";
import type { CalendarView } from "../src/shared/schemas";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

let capturedCalendarProps: Record<string, unknown> | null = null;

const DEFAULT_VIEWPORT_HEIGHT = 768;
const DEFAULT_VIEWPORT_WIDTH = 1024;
const TOOLTIP_GAP_PX = 8;
const TOOLTIP_MAX_WIDTH_PX = 320;
const TOOLTIP_SHOW_DELAY_MS = 900;
const TOOLTIP_TEST_HEIGHT = 32;
const TOOLTIP_VIEWPORT_SIDE_MARGIN_PX = 12;

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
  vi.useRealTimers();
  setViewportSize(DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT);
  capturedCalendarProps = null;
});

function setViewportSize(width: number, height: number): void {
  Object.defineProperty(globalThis, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(globalThis, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function createRect(
  options?: Partial<Pick<DOMRect, "height" | "left" | "top" | "width">>,
): DOMRect {
  const height = options?.height ?? 24;
  const left = options?.left ?? 120;
  const top = options?.top ?? 80;
  const width = options?.width ?? 160;

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  } as DOMRect;
}

function advanceTooltipDelay(ms = TOOLTIP_SHOW_DELAY_MS): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function getRenderedTooltip(): HTMLElement {
  const tooltip = document.querySelector(".calendar-event-tooltip");
  if (!(tooltip instanceof HTMLElement)) {
    throw new Error("Tooltip was not rendered");
  }

  return tooltip;
}

function showTooltip(): HTMLElement {
  advanceTooltipDelay();
  return getRenderedTooltip();
}

function readPx(value: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid pixel value: ${value}`);
  }

  return parsed;
}

function getTooltipTestWidth(): number {
  return Math.min(
    TOOLTIP_MAX_WIDTH_PX,
    Math.max(0, globalThis.innerWidth - TOOLTIP_VIEWPORT_SIDE_MARGIN_PX * 2),
  );
}

function getTooltipTestRect(tooltip: HTMLElement): DOMRect {
  const width = getTooltipTestWidth();
  const left = tooltip.style.left
    ? readPx(tooltip.style.left)
    : globalThis.innerWidth - readPx(tooltip.style.right) - width;
  const top = tooltip.style.top
    ? readPx(tooltip.style.top)
    : globalThis.innerHeight - readPx(tooltip.style.bottom) - TOOLTIP_TEST_HEIGHT;

  return createRect({
    height: TOOLTIP_TEST_HEIGHT,
    left,
    top,
    width,
  });
}

function rectsIntersect(left: DOMRect, right: DOMRect): boolean {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

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
      isLoadingEvents={false}
      onEventCopy={vi.fn()}
      onDateClick={vi.fn()}
      onDateDoubleClick={vi.fn()}
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
  eventRect?: DOMRect;
  isOrganizer?: boolean;
  isReminderOn?: boolean;
  response?: null | string;
}) {
  const eventRect = options?.eventRect ?? createRect();
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

  const eventElement = rendered.container.querySelector(".calendar-event-content");
  if (!(eventElement instanceof HTMLElement)) {
    throw new Error("Calendar event content was not rendered");
  }

  eventElement.setAttribute("title", "native event title");
  eventElement.querySelector(".fc-event-title")?.setAttribute("title", "native title");
  vi.spyOn(eventElement, "getBoundingClientRect").mockReturnValue(eventRect);

  act(() => {
    eventDidMount?.({
      el: eventElement,
      event,
    });
    eventMouseEnter?.({
      el: eventElement,
      event,
      jsEvent: new MouseEvent("mouseenter", {
        bubbles: true,
        clientX: 120,
        clientY: 80,
      }),
    });
  });

  return {
    ...rendered,
    eventElement,
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

    expect(capturedCalendarProps?.dateClick).toStrictEqual(expect.any(Function));
    expect(capturedCalendarProps?.dayCellClassNames).toStrictEqual(expect.any(Function));
    expect(capturedCalendarProps?.eventMouseEnter).toStrictEqual(expect.any(Function));
    expect(capturedCalendarProps?.eventMouseLeave).toStrictEqual(expect.any(Function));
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

  it("waits before rendering attendee response tooltip text", async () => {
    vi.useFakeTimers();
    await renderBoard("en");

    const { eventElement } = renderCalendarEvent({ response: " Accepted " });

    expect(eventElement.hasAttribute("title")).toBe(false);
    expect(eventElement.querySelector("[title]")).toBeNull();
    expect(document.querySelector(".calendar-event-tooltip")).toBeNull();

    advanceTooltipDelay(TOOLTIP_SHOW_DELAY_MS - 1);

    expect(document.querySelector(".calendar-event-tooltip")).toBeNull();

    advanceTooltipDelay(1);

    expect(getRenderedTooltip().textContent).toBe("Your response: Accepted");
  });

  it("renders organizer ownership tooltip text", async () => {
    vi.useFakeTimers();
    await renderBoard("en");

    renderCalendarEvent({ isOrganizer: true });

    expect(showTooltip().textContent).toBe("You're the owner");
  });

  it("renders organizer ownership tooltip text in Italian", async () => {
    vi.useFakeTimers();
    await renderBoard("it");

    renderCalendarEvent({ isOrganizer: true });

    expect(showTooltip().textContent).toBe("Sei il proprietario");
  });

  it("hides the custom tooltip on mouse leave", async () => {
    vi.useFakeTimers();
    await renderBoard("en");

    const { hideTooltip } = renderCalendarEvent({ response: "accepted" });

    showTooltip();

    act(() => {
      hideTooltip();
    });

    expect(document.querySelector(".calendar-event-tooltip")).toBeNull();
  });

  it("hides a visible tooltip while waiting to show the next hovered event", async () => {
    vi.useFakeTimers();
    await renderBoard("en");

    renderCalendarEvent({ response: "accepted" });

    expect(showTooltip().textContent).toBe("Your response: Accepted");

    renderCalendarEvent({ eventRect: createRect({ left: 300 }), isOrganizer: true });

    expect(document.querySelector(".calendar-event-tooltip")).toBeNull();

    advanceTooltipDelay();

    expect(getRenderedTooltip().textContent).toBe("You're the owner");
  });

  it("positions the tooltip to the right of the event when there is room", async () => {
    vi.useFakeTimers();
    setViewportSize(800, 600);
    await renderBoard("en");

    const eventRect = createRect({ left: 100, top: 80, width: 120 });
    renderCalendarEvent({ eventRect, response: "accepted" });

    const tooltip = showTooltip();

    expect(tooltip.style.left).toBe(`${eventRect.right + TOOLTIP_GAP_PX}px`);
    expect(tooltip.style.top).toBe(`${eventRect.top}px`);
    expect(tooltip.style.right).toBe("");
    expect(tooltip.style.bottom).toBe("");
    expect(rectsIntersect(getTooltipTestRect(tooltip), eventRect)).toBe(false);
  });

  it("keeps a side-positioned tooltip inside the viewport bottom", async () => {
    vi.useFakeTimers();
    setViewportSize(800, 200);
    await renderBoard("en");

    const eventRect = createRect({ height: 16, left: 100, top: 180, width: 120 });
    renderCalendarEvent({ eventRect, response: "accepted" });

    const tooltip = showTooltip();
    const tooltipRect = getTooltipTestRect(tooltip);

    expect(tooltip.style.left).toBe(`${eventRect.right + TOOLTIP_GAP_PX}px`);
    expect(tooltip.style.top).toBe(
      `${globalThis.innerHeight - TOOLTIP_TEST_HEIGHT - TOOLTIP_GAP_PX}px`,
    );
    expect(tooltipRect.bottom).toBeLessThanOrEqual(globalThis.innerHeight - TOOLTIP_GAP_PX);
    expect(rectsIntersect(tooltipRect, eventRect)).toBe(false);
  });

  it("positions the tooltip to the left when the right side is unavailable", async () => {
    vi.useFakeTimers();
    setViewportSize(520, 600);
    await renderBoard("en");

    const eventRect = createRect({ left: 392, top: 80, width: 120 });
    renderCalendarEvent({ eventRect, response: "accepted" });

    const tooltip = showTooltip();

    expect(tooltip.style.left).toBe("");
    expect(tooltip.style.right).toBe(
      `${globalThis.innerWidth - eventRect.left + TOOLTIP_GAP_PX}px`,
    );
    expect(tooltip.style.top).toBe(`${eventRect.top}px`);
    expect(tooltip.style.bottom).toBe("");
    expect(rectsIntersect(getTooltipTestRect(tooltip), eventRect)).toBe(false);
  });

  it("positions the tooltip below when neither side is available", async () => {
    vi.useFakeTimers();
    setViewportSize(300, 300);
    await renderBoard("en");

    const eventRect = createRect({ height: 20, left: 0, top: 100, width: 300 });
    renderCalendarEvent({ eventRect, response: "accepted" });

    const tooltip = showTooltip();

    expect(tooltip.style.left).toBe(`${TOOLTIP_GAP_PX}px`);
    expect(tooltip.style.right).toBe("");
    expect(tooltip.style.top).toBe(`${eventRect.bottom + TOOLTIP_GAP_PX}px`);
    expect(tooltip.style.bottom).toBe("");
    expect(rectsIntersect(getTooltipTestRect(tooltip), eventRect)).toBe(false);
  });

  it("positions the tooltip above when every preferred side is unavailable", async () => {
    vi.useFakeTimers();
    setViewportSize(300, 150);
    await renderBoard("en");

    const eventRect = createRect({ height: 50, left: 0, top: 100, width: 300 });
    renderCalendarEvent({ eventRect, response: "accepted" });

    const tooltip = showTooltip();

    expect(tooltip.style.left).toBe(`${TOOLTIP_GAP_PX}px`);
    expect(tooltip.style.right).toBe("");
    expect(tooltip.style.top).toBe("");
    expect(tooltip.style.bottom).toBe(
      `${globalThis.innerHeight - eventRect.top + TOOLTIP_GAP_PX}px`,
    );
    expect(rectsIntersect(getTooltipTestRect(tooltip), eventRect)).toBe(false);
  });

  it("uses an in-viewport fallback when no outside placement fits", async () => {
    vi.useFakeTimers();
    setViewportSize(300, 100);
    await renderBoard("en");

    const eventRect = createRect({ height: 60, left: 0, top: 20, width: 300 });
    renderCalendarEvent({ eventRect, response: "accepted" });

    const tooltip = showTooltip();
    const tooltipRect = getTooltipTestRect(tooltip);

    expect(tooltip.style.left).toBe(`${TOOLTIP_GAP_PX}px`);
    expect(tooltip.style.right).toBe("");
    expect(tooltip.style.top).toBe(`${eventRect.top}px`);
    expect(tooltip.style.bottom).toBe("");
    expect(tooltipRect.left).toBeGreaterThanOrEqual(TOOLTIP_GAP_PX);
    expect(tooltipRect.right).toBeLessThanOrEqual(
      globalThis.innerWidth - TOOLTIP_VIEWPORT_SIDE_MARGIN_PX,
    );
    expect(tooltipRect.bottom).toBeLessThanOrEqual(globalThis.innerHeight - TOOLTIP_GAP_PX);
  });

  it("renders a loading status while event ranges are fetched", async () => {
    expect.hasAssertions();
    await i18n.changeLanguage("en");
    const calendarRef = React.createRef<any>();

    render(
      <CalendarBoard
        activeView={"timeGridWeek" as CalendarView}
        calendarEvents={[]}
        calendarRef={calendarRef}
        hasVisibleCalendars
        isLoadingEvents
        onDateClick={vi.fn()}
        onDateDoubleClick={vi.fn()}
        onDatesSet={vi.fn()}
        onEventClick={vi.fn()}
        onEventCopy={vi.fn()}
        onEventDrop={vi.fn()}
        onEventResize={vi.fn()}
        selectedDate="2026-03-29T00:00:00.000Z"
        selectedDayForTable={null}
        timeFormat="system"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Loading");
  });
});
