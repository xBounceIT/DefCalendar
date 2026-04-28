import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent, EventDraft } from "../src/shared/schemas";
import GraphCalendarService, {
  extractPlainTextFromGraphHtml,
  isMissingGraphItemError,
  normalizeGraphResponseValue,
} from "../src/main/graph/calendar-service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createGraphEvent(overrides?: Record<string, unknown>) {
  return {
    attendees: [],
    body: {
      content: "",
      contentType: "HTML",
    },
    end: {
      dateTime: "2026-03-30T11:00:00.0000000",
      timeZone: "UTC",
    },
    hasAttachments: false,
    id: "event-1",
    isAllDay: false,
    isOrganizer: false,
    isReminderOn: true,
    organizer: {
      emailAddress: {
        address: "organizer@example.com",
        name: "Organizer",
      },
    },
    start: {
      dateTime: "2026-03-30T10:00:00.0000000",
      timeZone: "UTC",
    },
    subject: "Planning",
    ...overrides,
  };
}

function createService() {
  const auth = {
    getAccessToken: vi.fn().mockResolvedValue("token"),
    getAccessTokenForAccount: vi.fn().mockResolvedValue("token"),
    getAccountUsername: vi.fn().mockReturnValue("attendee@example.com"),
  };

  return new GraphCalendarService(
    auth as never,
    {
      timeZone: "Europe/Rome",
    } as never,
  );
}

function createCalendarEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    allowNewTimeProposals: true,
    attendees: [],
    attachments: [],
    body: "Agenda",
    bodyContentType: "html",
    bodyPreview: "Agenda",
    calendarId: "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: "change-1",
    end: "2026-03-30T11:00:00.000Z",
    etag: '"etag-1"',
    hasAttachments: false,
    id: "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: true,
    isReminderOn: true,
    lastModifiedDateTime: null,
    location: "Room 1",
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
    timeZone: "UTC",
    type: "singleInstance",
    unsupportedReason: null,
    webLink: "https://example.com/events/event-1",
    ...overrides,
  };
}

function createEventDraft(overrides?: Partial<EventDraft>): EventDraft {
  return {
    allowNewTimeProposals: true,
    attachmentIdsToRemove: [],
    attachmentsToAdd: [],
    attendees: [],
    body: "Agenda",
    bodyContentType: "html",
    calendarId: "calendar-1",
    categories: [],
    end: "2026-03-30T11:00:00.000Z",
    etag: '"etag-1"',
    id: "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isReminderOn: true,
    location: "Room 1",
    recurrence: null,
    recurrenceEditScope: "single",
    reminderMinutesBeforeStart: 15,
    responseRequested: true,
    sensitivity: "normal",
    showAs: "busy",
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning",
    timeZone: "UTC",
    webLink: "https://example.com/events/event-1",
    ...overrides,
  };
}

describe("graph calendar service body conversion", () => {
  it("returns null for empty input", () => {
    expect(extractPlainTextFromGraphHtml()).toBeNull();
    expect(extractPlainTextFromGraphHtml("")).toBeNull();
  });

  it("drops script content even with malformed closing tags", () => {
    expect(extractPlainTextFromGraphHtml('<script>alert(1)</script foo="bar"><p>Agenda</p>')).toBe(
      "Agenda",
    );
  });

  it("does not double-unescape HTML entities", () => {
    expect(extractPlainTextFromGraphHtml("<p>&amp;quot; &amp;lt; &amp;amp;</p>")).toBe(
      "&quot; &lt; &amp;",
    );
  });

  it("keeps common formatting readable as plain text", () => {
    expect(
      extractPlainTextFromGraphHtml(
        "<p>Hello&nbsp;team</p><p>Line <strong>two</strong><br>Line three</p>",
      ),
    ).toBe("Hello team\n\nLine two\nLine three");
  });

  it("preserves readable plain text content", () => {
    expect(extractPlainTextFromGraphHtml("Already plain text")).toBe("Already plain text");
  });
});

describe("graph calendar service response normalization", () => {
  it("normalizes tentative variants", () => {
    expect(normalizeGraphResponseValue("tentative")).toBe("tentative");
    expect(normalizeGraphResponseValue("tentativelyAccepted")).toBe("tentative");
    expect(normalizeGraphResponseValue("  TENTATIVELYACCEPTED  ")).toBe("tentative");
  });

  it("normalizes unanswered variants", () => {
    expect(normalizeGraphResponseValue("none")).toBe("none");
    expect(normalizeGraphResponseValue("notResponded")).toBe("none");
    expect(normalizeGraphResponseValue("organizer")).toBe("none");
  });

  it("keeps accepted and declined values", () => {
    expect(normalizeGraphResponseValue("accepted")).toBe("accepted");
    expect(normalizeGraphResponseValue("declined")).toBe("declined");
  });

  it("returns null for empty values", () => {
    expect(normalizeGraphResponseValue(null)).toBeNull();
    expect(normalizeGraphResponseValue(undefined)).toBeNull();
    expect(normalizeGraphResponseValue("   ")).toBeNull();
  });
});

describe("graph calendar service request handling", () => {
  it("uses immutable ids and mailbox-wide event paths for item lookups", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ value: [] }))
      .mockResolvedValueOnce(Response.json(createGraphEvent()))
      .mockResolvedValueOnce(Response.json({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();

    await service.listCalendarView(
      "calendar-1",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "account-1",
    );
    await service.getEvent("calendar-1", "event-1", "account-1");
    await service.listAttachments("calendar-1", "event-1", "account-1");

    expect(String(fetchMock.mock.calls[1][0])).toContain("/me/events/event-1?");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/me/events/event-1/attachments?");

    const preferHeader = new Headers(fetchMock.mock.calls[0][1]?.headers).get("Prefer");
    expect(preferHeader).toContain('outlook.timezone="Europe/Rome"');
    expect(preferHeader).toContain('IdType="ImmutableId"');
  });

  it("posts forward requests with Graph recipients payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();

    await service.forwardEvent(
      {
        calendarId: "calendar-1",
        comment: "Please cover this one",
        eventId: "event-1",
        toRecipients: [{ email: "dana@example.com", name: "Dana Swope" }],
      },
      "account-1",
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/events/event-1/forward");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toStrictEqual({
      comment: "Please cover this one",
      toRecipients: [
        {
          emailAddress: {
            address: "dana@example.com",
            name: "Dana Swope",
          },
        },
      ],
    });
  });

  it("patches only changed event details and returns the patch response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        createGraphEvent({
          "@odata.etag": '"etag-2"',
          body: {
            content: "Agenda",
            contentType: "HTML",
          },
          isOrganizer: true,
          location: { displayName: "Room 1" },
          subject: "Updated planning",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const updated = await service.updateEvent(
      createEventDraft({ subject: "Updated planning" }),
      "account-1",
      createCalendarEvent(),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/events/event-1?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("%24select=");
    expect(String(fetchMock.mock.calls[0][0])).toContain("onlineMeeting");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("If-Match")).toBe('"etag-1"');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toStrictEqual({
      subject: "Updated planning",
    });
    expect(updated.subject).toBe("Updated planning");
    expect(updated.etag).toBe('"etag-2"');
  });

  it("skips the graph patch for no-op event detail saves", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const current = createCalendarEvent();
    const updated = await service.updateEvent(createEventDraft(), "account-1", current);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updated).toBe(current);
  });

  it("retries an event detail update once with the latest etag after a stale conflict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "ErrorIrresolvableConflict",
              message: "The send or update operation could not be performed.",
            },
          },
          { status: 412 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          createGraphEvent({
            "@odata.etag": '"etag-2"',
            body: {
              content: "Agenda",
              contentType: "HTML",
            },
            end: {
              dateTime: "2026-03-30T11:00:00.000Z",
              timeZone: "UTC",
            },
            isOrganizer: true,
            location: { displayName: "Room 2" },
            start: {
              dateTime: "2026-03-30T10:00:00.000Z",
              timeZone: "UTC",
            },
            subject: "External planning",
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          createGraphEvent({
            "@odata.etag": '"etag-3"',
            body: {
              content: "Agenda",
              contentType: "HTML",
            },
            isOrganizer: true,
            location: { displayName: "Room 2" },
            subject: "Updated planning",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const updated = await service.updateEvent(
      createEventDraft({ subject: "Updated planning" }),
      "account-1",
      createCalendarEvent(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("If-Match")).toBe('"etag-1"');
    expect(String(fetchMock.mock.calls[1][0])).toContain("/me/events/event-1?");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("PATCH");
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("If-Match")).toBe('"etag-2"');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toStrictEqual({
      subject: "Updated planning",
    });
    expect(updated.etag).toBe('"etag-3"');
    expect(updated.location).toBe("Room 2");
  });

  it("surfaces an event detail update error when the stale retry also fails", async () => {
    const conflictBody = {
      error: {
        code: "ErrorIrresolvableConflict",
        message: "The send or update operation could not be performed.",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(conflictBody, { status: 412 }))
      .mockResolvedValueOnce(
        Response.json(
          createGraphEvent({
            "@odata.etag": '"etag-2"',
            body: {
              content: "Agenda",
              contentType: "HTML",
            },
            end: {
              dateTime: "2026-03-30T11:00:00.000Z",
              timeZone: "UTC",
            },
            isOrganizer: true,
            location: { displayName: "Room 1" },
            start: {
              dateTime: "2026-03-30T10:00:00.000Z",
              timeZone: "UTC",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(Response.json(conflictBody, { status: 412 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();

    await expect(
      service.updateEvent(
        createEventDraft({ subject: "Updated planning" }),
        "account-1",
        createCalendarEvent(),
      ),
    ).rejects.toThrow("The send or update operation could not be performed.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recognizes missing-store item errors", () => {
    expect({
      matches: isMissingGraphItemError(
        new Error(
          "The specified object was not found in the store. The process failed to get the correct properties.",
        ),
      ),
    }).toMatchObject({ matches: true });
  });
});
