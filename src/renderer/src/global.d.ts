import type { CalendarApi } from "@shared/ipc";

declare global {
  var calendarApi: CalendarApi;

  interface Window {
    calendarApi: CalendarApi;
  }
}
