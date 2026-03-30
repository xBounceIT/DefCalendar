import {
  addMinutesToIso,
  buildEventDayKeys,
  fromDateTimeInputValue,
  isEventEditable,
  toDateTimeInputValue,
} from "../src/shared/calendar";
import type { CalendarEvent } from "../src/shared/schemas";
import { describe, expect, it } from "vitest";

function createIso(year: number, monthIndex: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

function createEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "event-1",
    calendarId: "calendar-1",
    subject: "Meeting",
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    location: null,
    start: createIso(2026, 2, 27, 9),
    end: createIso(2026, 2, 27, 10),
    timeZone: "UTC",
    isAllDay: false,
    isReminderOn: false,
    reminderMinutesBeforeStart: null,
    webLink: null,
    etag: null,
    changeKey: null,
    type: null,
    attendees: [],
    organizer: null,
    locations: [],
    onlineMeeting: null,
    isOnlineMeeting: false,
    onlineMeetingProvider: null,
    recurrence: null,
    seriesMasterId: null,
    occurrenceId: null,
    showAs: null,
    sensitivity: null,
    allowNewTimeProposals: null,
    responseRequested: null,
    categories: [],
    hasAttachments: false,
    attachments: [],
    isOrganizer: true,
    responseStatus: null,
    cancelled: false,
    unsupportedReason: null,
    lastModifiedDateTime: null,
    ...overrides,
  };
}

describe("calendar utilities", () => {
  it("round-trips timed datetime inputs", () => {
    const iso = "2026-03-27T09:15:00.000Z";
    const input = toDateTimeInputValue(iso, false);

    expect(input).toMatch(/2026-03-27T/);
    expect(fromDateTimeInputValue(input, false)).toBeTypeOf("string");
  });

  it("adds minutes to ISO strings", () => {
    expect(addMinutesToIso("2026-03-27T09:00:00.000Z", 30)).toBe("2026-03-27T09:30:00.000Z");
  });

  it("marks unsupported events as read-only", () => {
    expect({ editable: isEventEditable({ unsupportedReason: null }) }).toStrictEqual({
      editable: true,
    });
    expect({
      editable: isEventEditable({ unsupportedReason: "Recurring events are view-only." }),
    }).toStrictEqual({ editable: false });
  });

  it("builds day keys for multi-day events", () => {
    const dayKeys = buildEventDayKeys([
      createEvent({
        end: createIso(2026, 2, 29, 10),
        start: createIso(2026, 2, 27, 9),
      }),
    ]);

    expect([...dayKeys]).toStrictEqual(["2026-03-27", "2026-03-28", "2026-03-29"]);
  });

  it("treats all-day event ends as exclusive", () => {
    const dayKeys = buildEventDayKeys([
      createEvent({
        end: createIso(2026, 2, 28),
        isAllDay: true,
        start: createIso(2026, 2, 27),
      }),
    ]);

    expect([...dayKeys]).toStrictEqual(["2026-03-27"]);
  });

  it("does not mark the next day for events ending at midnight", () => {
    const dayKeys = buildEventDayKeys([
      createEvent({
        end: createIso(2026, 2, 28),
        start: createIso(2026, 2, 27, 22),
      }),
    ]);

    expect([...dayKeys]).toStrictEqual(["2026-03-27"]);
  });
});
