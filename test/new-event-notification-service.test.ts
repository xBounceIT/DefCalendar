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
  const now = () => Date.parse("2026-03-30T09:30:00.000Z");

  it.each([
    ["accepted", " ACCEPTED "],
    ["tentative", "tentativelyAccepted"],
  ])(
    "does not consume an unread update when response representations normalize equally: %s",
    (before, after) => {
      const service = new NewEventNotificationService(now);
      const original = createInvite({ responseStatus: { response: before, time: null } });
      const updated = { ...original, subject: "Unread update" };
      service.reconcile([updated], [original], true);
      const reference = service.getItems()[0];
      service.reconcile(
        [{ ...updated, responseStatus: { response: after, time: null } }],
        [updated],
        true,
      );
      expect(service.getItems()).toEqual([reference]);
    },
  );

  it("migrates persisted notices without revisions once before exposing them to clients", () => {
    const initial = new NewEventNotificationService(now);
    const event = createInvite({ responseStatus: { response: "accepted", time: null } });
    initial.reconcile([{ ...event, subject: "Updated" }], [event], true);
    let saved = initial.getItems().map((item) => {
      const legacy = { ...item };
      delete legacy.revision;
      return legacy;
    });
    const store = {
      listPendingInvites: () => structuredClone(saved),
      savePendingInvites: vi.fn((items: typeof saved) => {
        saved = structuredClone(items);
      }),
    };
    const service = new NewEventNotificationService(now, store);
    expect(service.getItems()[0].revision).toEqual(expect.any(String));
    const restarted = new NewEventNotificationService(now, store);
    expect(restarted.getItems()[0].revision).toBe(service.getItems()[0].revision);
    expect(store.savePendingInvites).toHaveBeenCalledOnce();
    service.acknowledge({ calendarId: event.calendarId, eventId: event.id });
    expect(service.getItems()).toHaveLength(1);
  });

  it("records attendee membership changes while ignoring attendee order and RSVP changes", () => {
    const service = new NewEventNotificationService(now);
    const alice = {
      name: "Alice",
      email: "alice@example.com",
      type: "required" as const,
      response: null,
    };
    const bob = { ...alice, name: "Bob", email: "bob@example.com" };
    const original = createInvite({
      responseStatus: { response: "accepted", time: null },
      attendees: [alice, bob],
    });
    service.reconcile(
      [{ ...original, attendees: [bob, { ...alice, response: "accepted" }] }],
      [original],
      true,
    );
    expect(service.getItems()).toEqual([]);
    service.reconcile([{ ...original, attendees: [alice] }], [original], true);
    expect(service.getItems()).toEqual([expect.objectContaining({ kind: "updated" })]);
  });

  it("does not acknowledge a newer update using a previous notification snapshot", () => {
    const service = new NewEventNotificationService(now);
    const original = createInvite({ responseStatus: { response: "accepted", time: null } });
    const first = { ...original, subject: "First update" };
    service.reconcile([first], [original], true);
    const snapshot = service.getItems()[0];
    service.reconcile([{ ...first, subject: "Second update" }], [first], true);
    service.acknowledge(snapshot);
    expect(service.getItems()).toEqual([expect.objectContaining({ subject: "Second update" })]);
  });

  it("rolls back memory after a failed queue write so the same transition can be retried", () => {
    const store = {
      listPendingInvites: () => [],
      savePendingInvites: vi.fn().mockImplementationOnce(() => {
        throw new Error("disk full");
      }),
    };
    const service = new NewEventNotificationService(now, store);
    const listener = vi.fn();
    service.onChange(listener);
    const invite = createInvite();
    expect(() => service.reconcile([invite], [], false)).toThrow("disk full");
    expect(service.getItems()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    service.reconcile([invite], [], false);
    expect(store.savePendingInvites).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps a visible popup through unchanged syncs without broadcasting duplicate arrivals", () => {
    const service = new NewEventNotificationService(now);
    const invite = createInvite();
    const listener = vi.fn();
    service.onChange(listener);
    service.recordCandidates([invite]);
    service.reconcile([invite], [invite], true);
    service.reconcile([invite], [invite], true);
    expect(listener).toHaveBeenCalledOnce();
    expect(service.getItems()[0].popupDismissed).toBe(false);
  });

  it("keeps closed invitations across restart until a response succeeds", () => {
    let saved: ReturnType<NewEventNotificationService["getItems"]> = [];
    const store = {
      listPendingInvites: () => structuredClone(saved),
      savePendingInvites: (items: typeof saved) => {
        saved = structuredClone(items);
      },
    };
    const service = new NewEventNotificationService(now, store);
    const invite = createInvite();
    service.recordCandidates([invite]);
    service.hide({ calendarId: invite.calendarId, eventId: invite.id });
    expect(service.getItems()).toEqual([expect.objectContaining({ popupDismissed: true })]);

    const restarted = new NewEventNotificationService(now, store);
    restarted.reconcile([invite], [invite], true);
    expect(restarted.getItems()).toEqual(service.getItems());
    restarted.reconcile(
      [{ ...invite, responseStatus: { response: "accepted", time: null } }],
      [invite],
      true,
    );
    expect(restarted.getItems()).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("recovers previously notified pending invitations without reopening their popup", () => {
    const service = new NewEventNotificationService(now);
    const invite = createInvite();
    service.reconcile([invite], [invite], false);
    expect(service.getItems()).toEqual([
      expect.objectContaining({ kind: "invitation", popupDismissed: true }),
    ]);
  });

  it("keeps a later update pending until reviewed without changing an accepted response", () => {
    const service = new NewEventNotificationService(now);
    const accepted = createInvite({ responseStatus: { response: "accepted", time: null } });
    const updated = { ...accepted, subject: "Changed meeting", location: "Room 2" };
    service.reconcile([updated], [accepted], true);
    service.hideAll();
    service.reconcile([updated], [updated], true);
    expect(service.getItems()).toEqual([
      expect.objectContaining({
        kind: "updated",
        popupDismissed: true,
        requiresResponse: false,
        subject: "Changed meeting",
      }),
    ]);
    service.acknowledge(service.getItems()[0]);
    service.reconcile([updated], [updated], true);
    expect(service.getItems()).toEqual([]);
  });

  it("still requires an RSVP after reviewing changes to an unanswered invitation", () => {
    const service = new NewEventNotificationService(now);
    const invite = createInvite();
    const updated = { ...invite, location: "Room 2" };
    service.reconcile([updated], [invite], true);
    service.acknowledge(service.getItems()[0]);
    expect(service.getItems()).toEqual([
      expect.objectContaining({ kind: "invitation", requiresResponse: true, popupDismissed: true }),
    ]);
    service.acknowledge(service.getItems()[0]);
    expect(service.getItems()).toHaveLength(1);
  });

  it.each([true, false])(
    "retains cancellations for review when Graph returns a cancelled item: %s",
    (returned) => {
      const service = new NewEventNotificationService(now);
      const invite = createInvite();
      const cancelled = { ...invite, cancelled: true };
      service.recordCandidates([invite]);
      service.hideAll();
      service.reconcile(returned ? [cancelled] : [], [invite], true);
      expect(service.getItems()).toEqual([
        expect.objectContaining({ kind: "cancelled", popupDismissed: false }),
      ]);
      service.hideAll();
      service.reconcile(returned ? [cancelled] : [], returned ? [cancelled] : [], true);
      expect(service.getItems()).toHaveLength(1);
      service.acknowledge(service.getItems()[0]);
      expect(service.getItems()).toEqual([]);
    },
  );

  it("does not turn reminder or response changes into meeting updates", () => {
    const service = new NewEventNotificationService(now);
    const accepted = createInvite({ responseStatus: { response: "accepted", time: null } });
    service.reconcile(
      [{ ...accepted, reminderMinutesBeforeStart: 30, isReminderOn: false, changeKey: "new-key" }],
      [accepted],
      true,
    );
    expect(service.getItems()).toEqual([]);
  });

  it("only hides the selected invitation and shows a subsequent organizer update again", () => {
    const service = new NewEventNotificationService(now);
    const invite = createInvite();
    service.recordCandidates([invite, createInvite({ calendarId: "calendar-2" })]);
    service.hide({ calendarId: invite.calendarId, eventId: invite.id });
    expect(service.getItems().map((item) => Boolean(item.popupDismissed))).toEqual([true, false]);
    service.reconcile([{ ...invite, subject: "Updated" }], [invite], true);
    expect(service.getItems()[0]).toMatchObject({ kind: "updated", popupDismissed: false });
  });
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
