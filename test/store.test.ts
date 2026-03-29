import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/shared/schema-values";
import useUiStore from "../src/renderer/src/store";

function createRange(selectedDate: string): { rangeEnd: string; rangeStart: string } {
  const seed = new Date(selectedDate);
  const rangeStart = new Date(seed.getFullYear(), seed.getMonth() - 1, 1).toISOString();
  const rangeEnd = new Date(seed.getFullYear(), seed.getMonth() + 2, 1).toISOString();
  return { rangeEnd, rangeStart };
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  const defaults = createDefaultSettings();
  useUiStore.setState({
    activeView: defaults.activeView,
    hydrated: true,
    selectedDate: defaults.selectedDate,
    ...createRange(defaults.selectedDate),
  });
});

describe("ui store setters", () => {
  it("does not notify subscribers when range is unchanged", () => {
    const { rangeEnd, rangeStart, setRange } = useUiStore.getState();
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      setRange(rangeStart, rangeEnd);
      expect(listener).toHaveBeenCalledTimes(0);

      setRange(shiftDays(rangeStart, 1), shiftDays(rangeEnd, 1));
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("does not notify subscribers when selected date is unchanged", () => {
    const { selectedDate, setSelectedDate } = useUiStore.getState();
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      setSelectedDate(selectedDate);
      expect(listener).toHaveBeenCalledTimes(0);

      setSelectedDate(shiftDays(selectedDate, 1));
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("does not notify subscribers when active view is unchanged", () => {
    const { activeView, setActiveView } = useUiStore.getState();
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      setActiveView(activeView);
      expect(listener).toHaveBeenCalledTimes(0);

      const nextView = activeView === "dayGridMonth" ? "timeGridWeek" : "dayGridMonth";
      setActiveView(nextView);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });
});
