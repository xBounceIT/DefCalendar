import type { CalendarView, UserSettings } from "@shared/schemas";
import { create } from "zustand";
import { createDefaultSettings } from "@shared/schema-values";

interface UiState {
  activeView: CalendarView;
  selectedDate: string;
  rangeStart: string;
  rangeEnd: string;
  hydrated: boolean;
  hydrate: (settings: UserSettings) => void;
  setActiveView: (view: CalendarView) => void;
  setSelectedDate: (value: string) => void;
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
  ...createRange(defaults.selectedDate),
  hydrated: false,
  hydrate: (settings) => {
    set(() => ({
      activeView: settings.activeView,
      selectedDate: settings.selectedDate,
      ...createRange(settings.selectedDate),
      hydrated: true,
    }));
  },
  setActiveView: (activeView) => {
    set(() => ({ activeView }));
  },
  setSelectedDate: (selectedDate) => {
    set(() => ({ selectedDate }));
  },
  setRange: (rangeStart, rangeEnd) => {
    set(() => ({ rangeStart, rangeEnd }));
  },
}));

export default useUiStore;
