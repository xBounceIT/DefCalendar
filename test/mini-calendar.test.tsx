// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import MiniCalendar from "../src/renderer/src/components/mini-calendar";
import { toLocalDateKey } from "../src/shared/calendar";

afterEach(cleanup);

function renderMiniCalendar(props: Partial<React.ComponentProps<typeof MiniCalendar>> = {}): {
  onDateSelect: ReturnType<typeof vi.fn>;
  onVisibleMonthChange: ReturnType<typeof vi.fn>;
  result: ReturnType<typeof render>;
} {
  const onDateSelect = vi.fn();
  const onVisibleMonthChange = vi.fn();

  const result = render(
    <I18nextProvider i18n={createTestI18n()}>
      <MiniCalendar
        eventDayKeys={new Set()}
        onDateSelect={onDateSelect}
        onVisibleMonthChange={onVisibleMonthChange}
        selectedDate={new Date(2026, 3, 15)}
        {...props}
      />
    </I18nextProvider>,
  );

  return { onDateSelect, onVisibleMonthChange, result };
}

describe(MiniCalendar, () => {
  it("renders the heading with the selected month + year (English)", () => {
    renderMiniCalendar();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toMatch(/April 2026/);
  });

  it("renders the 7 weekday headers", () => {
    const { result } = renderMiniCalendar();
    const headers = result.container.querySelectorAll(".mini-calendar-day-header");
    expect(headers).toHaveLength(7);
  });

  it("notifies parent when the visible month changes after Next click", () => {
    const { onVisibleMonthChange } = renderMiniCalendar();
    onVisibleMonthChange.mockClear();
    fireEvent.click(screen.getByLabelText("Next month"));
    expect(onVisibleMonthChange).toHaveBeenCalled();
    const passed = onVisibleMonthChange.mock.calls.at(-1)?.[0] as Date;
    expect(passed.getMonth()).toBe(4);
    expect(passed.getFullYear()).toBe(2026);
  });

  it("notifies parent when navigating to previous month", () => {
    const { onVisibleMonthChange } = renderMiniCalendar();
    onVisibleMonthChange.mockClear();
    fireEvent.click(screen.getByLabelText("Previous month"));
    const passed = onVisibleMonthChange.mock.calls.at(-1)?.[0] as Date;
    expect(passed.getMonth()).toBe(2);
    expect(passed.getFullYear()).toBe(2026);
  });

  it("today button selects today and resets the visible month", () => {
    const { onDateSelect } = renderMiniCalendar();
    fireEvent.click(screen.getByLabelText("Today"));
    expect(onDateSelect).toHaveBeenCalledOnce();
    const passed = onDateSelect.mock.calls[0]?.[0] as Date;
    const today = new Date();
    expect(passed.getFullYear()).toBe(today.getFullYear());
    expect(passed.getMonth()).toBe(today.getMonth());
    expect(passed.getDate()).toBe(today.getDate());
  });

  it("clicking a day in the grid invokes onDateSelect with that date", () => {
    const { onDateSelect, result } = renderMiniCalendar();
    const dayButtons = result.container.querySelectorAll(
      "button.mini-calendar-day:not(.other-month)",
    );
    expect(dayButtons.length).toBeGreaterThan(0);
    fireEvent.click(dayButtons[5]!);
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it("applies has-events class to days present in eventDayKeys", () => {
    const eventDay = new Date(2026, 3, 15);
    const { result } = renderMiniCalendar({
      eventDayKeys: new Set([toLocalDateKey(eventDay)]),
    });
    const hasEvents = result.container.querySelectorAll(".mini-calendar-day.has-events");
    expect(hasEvents.length).toBeGreaterThan(0);
  });

  it("marks the selected date with the 'selected' class", () => {
    const { result } = renderMiniCalendar();
    const selected = result.container.querySelector(".mini-calendar-day.selected");
    expect(selected?.textContent).toBe("15");
  });
});
