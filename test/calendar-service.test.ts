import { afterEach, describe, expect, it, vi } from "vitest";
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
