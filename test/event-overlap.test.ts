import { describe, expect, it } from "vitest";

import {
  findOverlappingBusyEvents,
  toCalendarOverlapTarget,
} from "../src/renderer/src/event-overlap";
import type { CalendarEvent } from "../src/shared/schemas";

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    allowNewTimeProposals: true,
    attachments: [],
    attendees: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: "2026-03-30T10:00:00.000Z",
    etag: null,
    hasAttachments: false,
    id: "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: true,
    isReminderOn: true,
    lastModifiedDateTime: null,
    location: null,
    locations: [],
    onlineMeeting: null,
    onlineMeetingProvider: null,
    organizer: null,
    recurrence: null,
    reminderMinutesBeforeStart: 0,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal",
    showAs: "busy",
    start: "2026-03-30T09:00:00.000Z",
    subject: "Planning",
    seriesMasterId: null,
    occurrenceId: null,
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

describe("event overlap detection", () => {
  it("finds busy overlapping events", () => {
    const target = createEvent({ id: "invite" });
    const conflict = createEvent({
      id: "conflict",
      start: "2026-03-30T09:30:00.000Z",
      subject: "Busy planning",
    });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [conflict])).toStrictEqual([
      conflict,
    ]);
  });

  it("ignores adjacent events", () => {
    const target = createEvent({ id: "invite" });
    const candidate = createEvent({
      id: "candidate",
      start: "2026-03-30T10:00:00.000Z",
      end: "2026-03-30T11:00:00.000Z",
    });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [candidate])).toStrictEqual(
      [],
    );
  });

  it("ignores the target event itself", () => {
    const target = createEvent({ id: "invite" });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [target])).toStrictEqual([]);
  });

  it("ignores cancelled events", () => {
    const target = createEvent({ id: "invite" });
    const candidate = createEvent({ cancelled: true, id: "candidate" });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [candidate])).toStrictEqual(
      [],
    );
  });

  it("ignores free and tentative availability", () => {
    const target = createEvent({ id: "invite" });
    const freeEvent = createEvent({ id: "free", showAs: "free" });
    const tentativeEvent = createEvent({ id: "tentative", showAs: "tentative" });

    expect(
      findOverlappingBusyEvents(toCalendarOverlapTarget(target), [freeEvent, tentativeEvent]),
    ).toStrictEqual([]);
  });

  it("ignores declined attendee events", () => {
    const target = createEvent({ id: "invite" });
    const candidate = createEvent({
      id: "declined",
      isOrganizer: false,
      responseStatus: {
        response: "declined",
        time: null,
      },
    });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [candidate])).toStrictEqual(
      [],
    );
  });

  it("ignores invalid date ranges", () => {
    const target = createEvent({ id: "invite" });
    const candidate = createEvent({
      end: "not-a-date",
      id: "invalid",
      start: "2026-03-30T09:30:00.000Z",
    });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [candidate])).toStrictEqual(
      [],
    );
  });

  it("detects all-day overlaps", () => {
    const target = createEvent({
      end: "2026-04-01T00:00:00.000Z",
      id: "invite",
      isAllDay: true,
      start: "2026-03-31T00:00:00.000Z",
    });
    const candidate = createEvent({
      end: "2026-03-31T13:00:00.000Z",
      id: "candidate",
      start: "2026-03-31T12:00:00.000Z",
    });

    expect(findOverlappingBusyEvents(toCalendarOverlapTarget(target), [candidate])).toStrictEqual([
      candidate,
    ]);
  });
});
