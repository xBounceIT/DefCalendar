import type { CalendarView, UserSettings } from "@shared/schemas";
import { create } from "zustand";
import { createDefaultSettings } from "@shared/schema-values";

interface UiState {
  activeView: CalendarView;
  selectedDate: string;
  selectedDayForTable: null | string;
  rangeEnd: string;
  rangeStart: string;
  hydrated: boolean;
  clearSelectedDayForTable: () => void;
  hydrate: (settings: UserSettings) => void;
  setActiveView: (view: CalendarView) => void;
  setSelectedDate: (value: string) => void;
  setSelectedDayForTable: (value: null | string) => void;
  setRange: (start: string, end: string) => void;
}

const defaults = createDefaultSettings();

function createRange(selectedDate: string) {
  const seed = new Date(selectedDate);
  const rangeStart = new Date(seed.getFullYear(), seed.getMonth() - 1, 1).toISOString();
  const rangeEnd = new Date(seed.getFullYear(), seed.getMonth() + 2, 1).toISOString();
  return { rangeStart, rangeEnd };
}

const useUiStore = create<UiState>((set) => ({
  activeView: defaults.activeView,
  selectedDate: defaults.selectedDate,
  selectedDayForTable: null,
  ...createRange(defaults.selectedDate),
  hydrated: false,
  clearSelectedDayForTable: () => {
    set({ selectedDayForTable: null });
  },
  hydrate: (settings) => {
    set(() => ({
      activeView: settings.activeView,
      selectedDate: settings.selectedDate,
      ...createRange(settings.selectedDate),
      hydrated: true,
    }));
  },
  setActiveView: (activeView) => {
    set((state) => {
      if (state.activeView === activeView) {
        return state;
      }

      return { activeView };
    });
  },
  setSelectedDate: (selectedDate) => {
    set((state) => {
      if (state.selectedDate === selectedDate) {
        return state;
      }

      return { selectedDate };
    });
  },
  setSelectedDayForTable: (selectedDayForTable) => {
    set({ selectedDayForTable });
  },
  setRange: (rangeStart, rangeEnd) => {
    set((state) => {
      if (state.rangeStart === rangeStart && state.rangeEnd === rangeEnd) {
        return state;
      }

      return { rangeEnd, rangeStart };
    });
  },
}));

export default useUiStore;
