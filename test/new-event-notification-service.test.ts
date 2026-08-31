import { describe, expect, it, vi } from "vitest";

import NewEventNotificationService from "../src/main/notifications/new-event-notification-service";
import type { CalendarEvent } from "../src/shared/schemas";

function createInvite(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
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
    end: "2026-03-30T11:00:00.000Z",
    etag: null,
    hasAttachments: false,
    id: "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: false,
    isReminderOn: true,
    lastModifiedDateTime: null,
    location: null,
    locations: [],
    occurrenceId: null,
    onlineMeeting: null,
    onlineMeetingProvider: null,
    organizer: null,
    recurrence: null,
    reminderMinutesBeforeStart: 15,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal",
    seriesMasterId: null,
    showAs: "busy",
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning",
    timeZone: "Europe/Rome",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

describe("new event notification service", () => {
  it("keeps pending invites with the same event id in different calendars independent", () => {
    expect.hasAssertions();
    const service = new NewEventNotificationService(() =>
      new Date("2026-03-30T09:30:00.000Z").getTime(),
    );
    const listener = vi.fn();
    service.onChange(listener);

    service.recordCandidates([
      createInvite({ calendarId: "calendar-1", id: "shared-event" }),
      createInvite({ calendarId: "calendar-2", id: "shared-event" }),
    ]);

    expect(service.getItems()).toHaveLength(2);

    service.dismiss({ calendarId: "calendar-1", eventId: "shared-event" });

    expect(service.getItems()).toStrictEqual([
      expect.objectContaining({ calendarId: "calendar-2", eventId: "shared-event" }),
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("records only future invites that still need a response", () => {
    expect.hasAssertions();
    const service = new NewEventNotificationService(() =>
      new Date("2026-03-30T09:30:00.000Z").getTime(),
    );
    const futurePendingInvite = createInvite({
      end: "2026-03-30T11:00:00.000Z",
      id: "future-pending",
      start: "2026-03-30T10:00:00.000Z",
    });

    service.recordCandidates([
      createInvite({
        end: "2026-03-30T09:30:00.000Z",
        id: "past-pending",
        start: "2026-03-30T09:00:00.000Z",
      }),
      createInvite({
        id: "future-accepted",
        responseStatus: { response: "accepted", time: "2026-03-30T09:00:00.000Z" },
      }),
      futurePendingInvite,
    ]);

    expect(service.getItems()).toStrictEqual([
      expect.objectContaining({ eventId: futurePendingInvite.id }),
    ]);
  });
});
