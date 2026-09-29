// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import DatePicker from "../src/renderer/src/components/date-picker";
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

  it("does not reset month navigation when a parent recreates the same selected date", () => {
    const onVisibleMonthChange = vi.fn();
    const onDateSelect = vi.fn();
    const i18n = createTestI18n();
    const content = () => (
      <I18nextProvider i18n={i18n}>
        <MiniCalendar
          selectedDate={new Date(2026, 3, 15)}
          onDateSelect={onDateSelect}
          onVisibleMonthChange={onVisibleMonthChange}
        />
      </I18nextProvider>
    );
    const result = render(content());
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    onVisibleMonthChange.mockClear();
    result.rerender(content());
    expect(screen.getByRole("heading")).toHaveTextContent("May 2026");
    expect(onVisibleMonthChange).not.toHaveBeenCalled();
  });
});

describe("custom date picker", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value() {
        this.style.display = "block";
      },
    });

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  });

  function renderPicker({
    value = "2026-09-29",
    language = "en",
    disabled = false,
    allowClear = false,
  } = {}) {
    const onChange = vi.fn();
    function Harness() {
      const [date, setDate] = React.useState(value);
      return (
        <I18nextProvider i18n={createTestI18n(language)}>
          <DatePicker
            id="test-date"
            label="Event date"
            value={date}
            disabled={disabled}
            allowClear={allowClear}
            onChange={(next) => {
              setDate(next);
              onChange(next);
            }}
          />
          <button type="button">Outside</button>
        </I18nextProvider>
      );
    }
    const result = render(<Harness />);
    const open = () =>
      fireEvent.click(screen.getByRole("button", { name: /Open calendar|Apri calendario/ }));
    return { onChange, open, result };
  }

  it("selects a date using the shared custom calendar and restores trigger focus", () => {
    const { open, onChange } = renderPicker();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, September 30th, 2026" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-09-30");
    expect(screen.getByLabelText("Event date", { selector: "input" })).toHaveValue("09/30/2026");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open calendar/ })).toHaveFocus();
  });

  it("jumps directly to another year and month without selecting a date prematurely", () => {
    const { open, onChange } = renderPicker();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Choose year" }));
    fireEvent.click(screen.getByRole("button", { name: "Next years" }));
    fireEvent.click(screen.getByRole("button", { name: "2040", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Feb", exact: true }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, February 29th, 2040" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2040-02-29");
  });

  it("changes months across year boundaries using the up and down controls", () => {
    const { open, onChange } = renderPicker({ value: "2026-12-31" });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading")).toHaveTextContent("January 2027");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading")).toHaveTextContent("December 2026");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("navigates leap days and clamps month navigation from the keyboard", () => {
    const { open, onChange } = renderPicker({ value: "2028-01-31" });
    open();
    const january = screen.getByRole("button", { name: "Monday, January 31st, 2028" });
    expect(january).toHaveFocus();
    fireEvent.keyDown(january, { key: "PageDown" });
    const leapDay = screen.getByRole("button", { name: "Tuesday, February 29th, 2028" });
    expect(leapDay).toHaveFocus();
    fireEvent.keyDown(leapDay, { key: "ArrowRight" });
    const march = screen.getByRole("button", { name: "Wednesday, March 1st, 2028" });
    expect(march).toHaveFocus();
    fireEvent.click(march);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2028-03-01");
  });

  it("dismisses on Escape, focus leaving, and outside click", () => {
    const { open, onChange } = renderPicker();
    open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open();
    fireEvent.focusIn(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports typed Italian dates and rejects invalid dates without changing the value", () => {
    const { onChange, open } = renderPicker({ language: "it" });
    const input = screen.getByLabelText("Event date", { selector: "input" });
    expect(input).toHaveValue("29/09/2026");
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input).toHaveValue("29/09/2026");
    fireEvent.change(input, { target: { value: "30/09/2026" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-09-30");
    open();
    expect(screen.getByRole("heading")).toHaveTextContent("settembre 2026");
    expect(screen.getByRole("button", { name: "Scegli anno" })).toBeInTheDocument();
  });

  it("clears an optional date and picks today", () => {
    const { onChange, open } = renderPicker({ allowClear: true });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByLabelText("Event date", { selector: "input" })).toHaveValue("");
    open();
    expect(
      within(screen.getByRole("dialog")).queryAllByRole("button", { pressed: true }),
    ).toHaveLength(0);
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { current: "date" }),
    ).toHaveFocus();
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", { name: "Today" })[1]!,
    );
    expect(onChange).toHaveBeenLastCalledWith(toLocalDateKey(new Date()));
  });

  it("opens an empty optional field with no committed selection and commits only the chosen date", () => {
    const { onChange } = renderPicker({ value: "", allowClear: true });
    const input = screen.getByLabelText("Event date", { selector: "input" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    const today = within(dialog).getByRole("button", { current: "date" });
    expect(today).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(today);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(toLocalDateKey(new Date()));
  });

  it.each(["0001-01-01", "9999-12-31"])(
    "keeps keyboard and year navigation within the supported range from %s",
    (value) => {
      const { open, onChange, result } = renderPicker({ value });
      open();
      const direction = value.startsWith("0001") ? "PageUp" : "PageDown";
      const active = document.activeElement!;
      fireEvent.keyDown(active, { key: direction, shiftKey: true });
      expect(active).toHaveFocus();
      fireEvent.click(screen.getByRole("button", { name: "Choose year" }));
      const years = result.container.querySelectorAll(".mini-calendar-choices button");
      expect(
        [...years].every(
          (button) => Number(button.textContent) >= 1 && Number(button.textContent) <= 9999,
        ),
      ).toBe(true);
      expect(
        screen.getByRole("button", {
          name: value.startsWith("0001") ? "Previous years" : "Next years",
        }),
      ).toBeDisabled();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("keeps disabled fields inert", () => {
    const { open, onChange } = renderPicker({ disabled: true });
    open();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Event date", { selector: "input" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
