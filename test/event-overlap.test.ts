import { describe, expect, it } from "vitest";

import {
  findOverlappingBusyEvents,
  getCalendarOverlapLookupRange,
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

  it("expands the lookup range for recurring series targets", () => {
    const target = toCalendarOverlapTarget(
      createEvent({
        id: "occurrence-1",
        seriesMasterId: "series-1",
      }),
      new Date("2026-03-30T00:00:00.000Z"),
    );

    expect(getCalendarOverlapLookupRange(target)).toStrictEqual({
      end: "2026-06-28T00:00:00.000Z",
      start: "2025-03-30T09:00:00.000Z",
    });
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

  it("checks cached same-series occurrences when the target accepts a series", () => {
    const target = createEvent({
      id: "occurrence-1",
      seriesMasterId: "series-1",
    });
    const earlierOccurrence = createEvent({
      end: "2026-02-23T10:00:00.000Z",
      id: "occurrence-0",
      seriesMasterId: "series-1",
      start: "2026-02-23T09:00:00.000Z",
    });
    const earlierConflict = createEvent({
      end: "2026-02-23T09:45:00.000Z",
      id: "earlier-conflict",
      start: "2026-02-23T09:15:00.000Z",
      subject: "Earlier conflict",
    });
    const futureOccurrence = createEvent({
      end: "2026-04-06T10:00:00.000Z",
      id: "occurrence-2",
      seriesMasterId: "series-1",
      start: "2026-04-06T09:00:00.000Z",
    });
    const futureConflict = createEvent({
      end: "2026-04-06T09:45:00.000Z",
      id: "conflict",
      start: "2026-04-06T09:15:00.000Z",
      subject: "Future conflict",
    });

    expect(
      findOverlappingBusyEvents(toCalendarOverlapTarget(target), [
        earlierOccurrence,
        earlierConflict,
        futureOccurrence,
        futureConflict,
      ]),
    ).toStrictEqual([earlierConflict, futureConflict]);
  });

  it("does not report same-series occurrences as conflicts", () => {
    const target = createEvent({
      id: "occurrence-1",
      seriesMasterId: "series-1",
    });
    const futureOccurrence = createEvent({
      end: "2026-04-06T10:00:00.000Z",
      id: "occurrence-2",
      seriesMasterId: "series-1",
      start: "2026-04-06T09:00:00.000Z",
    });

    expect(
      findOverlappingBusyEvents(toCalendarOverlapTarget(target), [futureOccurrence]),
    ).toStrictEqual([]);
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
