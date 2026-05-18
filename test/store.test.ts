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
    expect(state.hydrated).toBeTruthy();

    const seed = new Date("2026-06-15T00:00:00.000Z");
    const expectedStart = new Date(seed.getFullYear(), seed.getMonth() - 1, 1).toISOString();
    const expectedEnd = new Date(seed.getFullYear(), seed.getMonth() + 2, 1).toISOString();
    expect(state.rangeStart).toBe(expectedStart);
    expect(state.rangeEnd).toBe(expectedEnd);
  });
});

describe("ui store selectedDayForTable", () => {
  it("setSelectedDayForTable assigns the value", () => {
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      useUiStore.getState().setSelectedDayForTable("2026-06-15");
      expect(useUiStore.getState().selectedDayForTable).toBe("2026-06-15");
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("clearSelectedDayForTable resets the value to null", () => {
    useUiStore.setState({ selectedDayForTable: "2026-06-15" });
    useUiStore.getState().clearSelectedDayForTable();
    expect(useUiStore.getState().selectedDayForTable).toBeNull();
  });
});

describe("ui store happy-path notifications", () => {
  it("notifies subscribers when setSelectedDate receives a new value", () => {
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      const current = useUiStore.getState().selectedDate;
      useUiStore.getState().setSelectedDate(shiftDays(current, 7));
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("notifies subscribers when setRange receives a new range", () => {
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      const { rangeStart, rangeEnd } = useUiStore.getState();
      useUiStore.getState().setRange(shiftDays(rangeStart, 30), shiftDays(rangeEnd, 30));
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("notifies subscribers when setActiveView switches view", () => {
    const listener = vi.fn();
    const unsubscribe = useUiStore.subscribe(listener);

    try {
      const current = useUiStore.getState().activeView;
      const next = current === "dayGridMonth" ? "timeGridWeek" : "dayGridMonth";
      useUiStore.getState().setActiveView(next);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });
});
