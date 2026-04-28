// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import ReminderPopup from "../src/renderer/src/reminder-popup";
import type { CalendarApi } from "../src/shared/ipc";
import type { ReminderDialogItem } from "../src/shared/schemas";

const originalCalendarApiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "calendarApi");

function createReminder(overrides: Partial<ReminderDialogItem> = {}): ReminderDialogItem {
  return {
    calendarId: "calendar-1",
    dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:pre",
    end: "2026-03-30T10:30:00.000Z",
    eventId: "event-1",
    isAllDay: false,
    location: "Room 3",
    onlineMeeting: null,
    reminderMinutesBeforeStart: 15,
    reminderType: "pre",
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning reminder",
    ...overrides,
  };
}

function installCalendarApi(item: ReminderDialogItem): CalendarApi {
  const calendarApi = {
    events: {
      openInApp: vi.fn().mockResolvedValue(undefined),
      openWebLink: vi.fn().mockResolvedValue(undefined),
    },
    reminder: {
      dismiss: vi.fn().mockResolvedValue(undefined),
      dismissAll: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue({
        items: [item],
        locale: "en",
        timeFormat: "system",
      }),
      minimizeWindow: vi.fn().mockResolvedValue(undefined),
      onState: vi.fn().mockReturnValue(() => undefined),
      snooze: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as CalendarApi;

  Object.defineProperty(globalThis, "calendarApi", {
    configurable: true,
    value: calendarApi,
    writable: true,
  });

  return calendarApi;
}

function restoreCalendarApi(): void {
  cleanup();
  vi.clearAllMocks();

  if (originalCalendarApiDescriptor) {
    Object.defineProperty(globalThis, "calendarApi", originalCalendarApiDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "calendarApi");
}

describe("reminder popup", () => {
  afterEach(() => {
    restoreCalendarApi();
  });

  it("opens the reminder event in the main app on row double click", async () => {
    const item = createReminder();
    const calendarApi = installCalendarApi(item);

    render(<ReminderPopup />);

    await expect(screen.findByText("Planning reminder")).resolves.not.toBeNull();
    fireEvent.doubleClick(screen.getByText("Planning reminder"));

    expect(calendarApi.events.openInApp).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "event-1",
    });
  });

  it("does not open the event modal when the join meeting button is double-clicked", async () => {
    const item = createReminder({
      onlineMeeting: {
        joinUrl: "https://teams.microsoft.com/l/meetup-join/example",
      },
    });
    const calendarApi = installCalendarApi(item);

    render(<ReminderPopup />);

    const joinButton = await screen.findByRole("button", { name: /join meeting/i });
    fireEvent.click(joinButton);
    fireEvent.doubleClick(joinButton);

    await waitFor(() => {
      expect(calendarApi.events.openWebLink).toHaveBeenCalledWith(
        "https://teams.microsoft.com/l/meetup-join/example",
      );
    });
    expect(calendarApi.events.openInApp).not.toHaveBeenCalled();
  });
});
