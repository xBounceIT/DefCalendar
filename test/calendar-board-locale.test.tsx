// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { EventInput } from "@fullcalendar/core";
import React from "react";
import i18n from "i18next";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import CalendarBoard from "../src/renderer/src/components/calendar-board";
import type { CalendarView } from "../src/shared/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";

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
      onDatesSet={vi.fn()}
      onEventClick={vi.fn()}
      onEventDrop={vi.fn()}
      onEventResize={vi.fn()}
      onSelection={vi.fn()}
      selectedDate="2026-03-29T00:00:00.000Z"
      timeFormat="system"
    />,
  );
}

describe("calendar board locale", () => {
  it("passes the Italian locale and translated all-day label", async () => {
    await renderBoard("it");

    expect(capturedCalendarProps?.locale).toBe("it");
    expect(capturedCalendarProps?.allDayText).toBe("Giornata intera");
  });

  it("passes the English locale and translated all-day label", async () => {
    await renderBoard("en");

    expect(capturedCalendarProps?.locale).toBe("en");
    expect(capturedCalendarProps?.allDayText).toBe("All day");
  });
});
