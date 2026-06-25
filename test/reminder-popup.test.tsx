// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "i18next";
import React from "react";
import ReminderPopup from "../src/renderer/src/reminder-popup";
import type { CalendarApi } from "../src/shared/ipc";
import type { ReminderDialogItem, ReminderDialogState } from "../src/shared/schemas";

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

function installCalendarApi(
  item: ReminderDialogItem,
  stateOverrides: Partial<Pick<ReminderDialogState, "locale" | "timeFormat">> = {},
): CalendarApi {
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
        locale: stateOverrides.locale ?? "en",
        timeFormat: stateOverrides.timeFormat ?? "system",
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
  void i18n.changeLanguage("en");
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it("renders the future start countdown", async () => {
    expect.hasAssertions();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-30T09:45:00.000Z").getTime());
    const item = createReminder();
    installCalendarApi(item);

    render(<ReminderPopup />);

    await expect(screen.findByText("starts in 15 min")).resolves.not.toBeNull();
  });

  it("renders ADESSO for meetings starting now in Italian", async () => {
    expect.hasAssertions();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-30T10:00:00.000Z").getTime());
    const item = createReminder();
    installCalendarApi(item, { locale: "it" });

    render(<ReminderPopup />);

    const status = await screen.findByText("ADESSO");
    expect(status.className).toContain("reminder-item-start-status--now");
  });

  it("renders elapsed text for meetings that already started", async () => {
    expect.hasAssertions();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-30T10:06:30.000Z").getTime());
    const item = createReminder();
    installCalendarApi(item);

    render(<ReminderPopup />);

    await expect(screen.findByText("started 6 min ago")).resolves.not.toBeNull();
  });

  it("updates the start status while the popup remains open", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T09:58:59.000Z"));
    const item = createReminder();
    installCalendarApi(item);

    render(<ReminderPopup />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("starts in 2 min")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByText("NOW")).not.toBeNull();
  });

  it("opens the reminder event in the main app on row double click", async () => {
    expect.hasAssertions();
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
    expect.hasAssertions();
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
