import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/shared/schema-values";
import useUiStore from "../src/renderer/src/store";

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  const defaults = createDefaultSettings();
  useUiStore.setState({
    activeView: defaults.activeView,
    hydrated: true,
    selectedDate: defaults.selectedDate,
    rangeStart: "2026-04-01T00:00:00.000Z",
    rangeEnd: "2026-07-01T00:00:00.000Z",
  });
});

describe("ui store setters", () => {
  it("does not notify subscribers when range is unchanged", () => {
    const { rangeEnd, rangeStart, setRange } = useUiStore.getState();
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      setRange(rangeStart, rangeEnd);
      expect(listener).not.toHaveBeenCalled();

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
      expect(listener).not.toHaveBeenCalled();

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
      expect(listener).not.toHaveBeenCalled();

      const nextView = activeView === "dayGridMonth" ? "timeGridWeek" : "dayGridMonth";
      setActiveView(nextView);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });
});

describe("ui store hydrate", () => {
  it("populates activeView, selectedDate, and a derived range, and sets hydrated=true", () => {
    useUiStore.setState({ hydrated: false });
    const { hydrate } = useUiStore.getState();

    hydrate({
      ...createDefaultSettings(),
      activeView: "timeGridDay",
      selectedDate: "2026-06-15T00:00:00.000Z",
    });

    const state = useUiStore.getState();
    expect(state.activeView).toBe("timeGridDay");
    expect(state.selectedDate).toBe("2026-06-15T00:00:00.000Z");
    expect(state.hydrated).toBe(true);

    expect(state.rangeStart).toBe(new Date("2026-05-01T00:00:00").toISOString());
    expect(state.rangeEnd).toBe(new Date("2026-08-01T00:00:00").toISOString());
  });
});
