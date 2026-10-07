import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent, EventDraft } from "../src/shared/schemas";
import windowsTimeZones from "../src/shared/windows-time-zones.json";
import GraphCalendarService, {
  extractPlainTextFromGraphHtml,
  isMissingGraphItemError,
  normalizeGraphResponseValue,
  parseRecurrence,
} from "../src/main/graph/calendar-service";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reminder dismissal", () => {
  const expectedStart = "2026-03-30T10:00:00Z";

  it("verifies a matching reminder start returned in a local time zone", async () => {
    expect.hasAssertions();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          createGraphEvent({
            start: { dateTime: "2026-03-30T12:00:00.0000000", timeZone: "W. Europe Standard Time" },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await createService().dismissReminder("calendar-1", "event-1", "account-1", expectedStart);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });

  it.each([
    { dateTime: "2026-10-25T02:30:00", timeZone: "Europe/Rome" },
    { dateTime: "2026-03-29T02:30:00", timeZone: "Europe/Rome" },
    { dateTime: "2026-03-30T12:00:00", timeZone: "Unknown/Zone" },
  ])("does not dismiss a reminder with an unverifiable local start %j", async (start) => {
    expect.hasAssertions();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(createGraphEvent({ start })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createService().dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
    ).rejects.toThrow("Cannot verify the reminder occurrence start.");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].method).not.toBe("POST");
  });

  it("does not dismiss a remotely rescheduled event even when the queued start is stale", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          createGraphEvent({ start: { dateTime: "2026-04-01T10:00:00", timeZone: "UTC" } }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await createService().dismissReminder("calendar-1", "event-1", "account-1", expectedStart);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("$select")).toBe("id,start");
    expect(fetchMock.mock.calls[0][1].method).not.toBe("POST");
  });

  it.each([undefined, { dateTime: "invalid" }])(
    "does not dismiss or acknowledge an unverifiable remote start %j",
    async (start) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(createGraphEvent({ start })));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        createService().dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
      ).rejects.toThrow("Cannot verify the reminder occurrence start.");
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("propagates an offline fresh-state read without sending the dismissal", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createService().dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
    ).rejects.toThrow("offline");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a session replaced during the fresh-state read before sending the dismissal", async () => {
    let valid = true;
    const service = createService({
      createAccountSessionGuard: vi.fn(() => () => {
        if (!valid) {
          throw new Error("Session changed");
        }
      }),
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      valid = false;
      return Response.json(createGraphEvent());
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      service.dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
    ).rejects.toThrow("Session changed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshes an expired token silently while keeping the same account and dismissal", async () => {
    const getAccessTokenForAccount = vi.fn().mockResolvedValue("token");
    const service = createService({ getAccessTokenForAccount });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(createGraphEvent()))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await service.dismissReminder("calendar-1", "event-1", "account-1", expectedStart);
    expect(getAccessTokenForAccount.mock.calls).toEqual([
      ["account-1", false, false],
      ["account-1", false, false],
      ["account-1", true, false],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0]);
  });

  it("aborts a running dismissal when its service is stopped", async () => {
    const controller = new AbortController();
    const service = createService();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(createGraphEvent()))
      .mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const result = service.dismissReminder(
      "calendar-1",
      "event-1",
      "account-1",
      expectedStart,
      controller.signal,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it("does not retry a throttled dismissal after its account session changes", async () => {
    vi.useFakeTimers();
    let valid = true;
    const assertSession = () => {
      if (!valid) {
        throw new Error("Session changed");
      }
    };
    const service = createService({ createAccountSessionGuard: vi.fn(() => assertSession) });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(createGraphEvent()))
      .mockImplementationOnce(async () => {
        valid = false;
        return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
      })
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = service
      .dismissReminder("calendar-1", "event-1", "account-1", expectedStart)
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toMatchObject({ message: "Session changed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a replaced session before sending a dismissal with a late token", async () => {
    let valid = true;
    const assertSession = () => {
      if (!valid) {
        throw new Error("Session changed");
      }
    };
    const service = createService({
      createAccountSessionGuard: vi.fn(() => assertSession),
      getAccessTokenForAccount: vi.fn(async () => {
        valid = false;
        return "late-token";
      }),
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      service.dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
    ).rejects.toThrow("Session changed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains the original account guard during a 401 retry", async () => {
    let valid = true;
    const assertSession = () => {
      if (!valid) {
        throw new Error("Session changed");
      }
    };
    const getAccessTokenForAccount = vi.fn().mockResolvedValue("token");
    const service = createService({
      createAccountSessionGuard: vi.fn(() => assertSession),
      getAccessTokenForAccount,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(createGraphEvent()))
      .mockImplementationOnce(async () => {
        valid = false;
        return new Response(null, { status: 401 });
      })
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      service.dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
    ).rejects.toThrow("Session changed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessTokenForAccount).toHaveBeenCalledTimes(2);
  });

  it("posts to the owning calendar with the correct account and accepts an empty 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(createGraphEvent()))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const getAccessTokenForAccount = vi.fn().mockResolvedValue("token");
    const service = createService({ getAccessTokenForAccount });
    await service.dismissReminder("calendar/+", "occurrence/+", "account-2", expectedStart);
    const [readUrl, readOptions] = fetchMock.mock.calls[0];
    const query = new URL(readUrl).searchParams;
    expect(query.get("$select")).toBe("id,start");
    expect(readOptions.headers.get("Prefer")).toContain('outlook.timezone="UTC"');
    expect(getAccessTokenForAccount).toHaveBeenCalledWith("account-2", false, false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/calendars/calendar%2F%2B/events/occurrence%2F%2B/dismissReminder",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("propagates failed dismissals for persistent retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(createGraphEvent()))
        .mockResolvedValueOnce(new Response(null, { status: 403 })),
    );
    const service = createService();
    await expect(
      service.dismissReminder("calendar-1", "event-1", "account-1", expectedStart),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("bounds stalled authentication and does not send a late dismissal after timeout", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let resolveToken = (_token: string) => {};
    const token = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const service = createService({ getAccessTokenForAccount: vi.fn().mockReturnValue(token) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = service.dismissReminder("calendar-1", "event-1", "account-1", expectedStart);
    controller.abort(new Error("timeout"));
    await expect(result).rejects.toThrow("timeout");
    expect(timeout).toHaveBeenCalledWith(15_000);
    resolveToken("late-token");
    await token;
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
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

function createService(authOverrides: Record<string, unknown> = {}) {
  const auth = {
    getAccessToken: vi.fn().mockResolvedValue("token"),
    getAccessTokenForAccount: vi.fn().mockResolvedValue("token"),
    getAccountUsername: vi.fn().mockReturnValue("attendee@example.com"),
    createAccountSessionGuard: vi.fn(() => vi.fn()),
    ...authOverrides,
  };

  return new GraphCalendarService(
    auth as never,
    {
      timeZone: "Europe/Rome",
    } as never,
  );
}

describe("graph participant availability", () => {
  it("ends an availability check even when authentication never settles", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new GraphCalendarService(
      { getAccessTokenForAccount: vi.fn().mockReturnValue(new Promise(() => undefined)) } as never,
      { timeZone: "UTC" } as never,
    );
    const promise = service.getAttendeeAvailability(
      {
        calendarId: "calendar-1",
        emails: ["coworker@example.com"],
        start: "2026-09-29T09:00:00Z",
        end: "2026-09-29T10:00:00Z",
      },
      "account-1",
    );
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(true);
    expect(await promise).toEqual([
      { email: "coworker@example.com", status: "unknown", error: "requestFailed" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not fetch a schedule when a token arrives after the check has expired", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    let resolveToken: (token: string) => void = () => undefined;
    const token = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new GraphCalendarService(
      { getAccessTokenForAccount: vi.fn().mockReturnValue(token) } as never,
      { timeZone: "UTC" } as never,
    );
    const promise = service.getAttendeeAvailability(
      {
        calendarId: "calendar-1",
        emails: ["coworker@example.com"],
        start: "2026-09-29T09:00:00Z",
        end: "2026-09-29T10:00:00Z",
      },
      "account-1",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await promise).toEqual([
      { email: "coworker@example.com", status: "unknown", error: "requestFailed" },
    ]);
    resolveToken("late-token");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a stalled batch at the deadline and preserves already fetched availability", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    const emails = Array.from({ length: 41 }, (_, index) => `person${index}@example.com`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: emails
              .slice(0, 20)
              .map((email) => ({ scheduleId: email, availabilityView: "000000000000" })),
          }),
          { status: 200 },
        ),
      )
      .mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(init.signal!.reason), {
              once: true,
            });
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const promise = createService().getAttendeeAvailability(
      {
        calendarId: "calendar-1",
        emails,
        start: "2026-09-29T09:00:00Z",
        end: "2026-09-29T10:00:00Z",
      },
      "account-1",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;
    expect(result.slice(0, 20)).toEqual(
      emails.slice(0, 20).map((email) => ({ email, status: "free" })),
    );
    expect(result.slice(20)).toEqual(
      emails.slice(20).map((email) => ({ email, status: "unknown", error: "requestFailed" })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("interrupts a long throttle delay at the availability deadline", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "3600" } }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = createService().getAttendeeAvailability(
      {
        calendarId: "calendar-1",
        emails: ["coworker@example.com"],
        start: "2026-09-29T09:00:00Z",
        end: "2026-09-29T10:00:00Z",
      },
      "account-1",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await promise).toEqual([
      { email: "coworker@example.com", status: "unknown", error: "requestFailed" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not repeatedly request a forbidden account for remaining batches", async () => {
    expect.hasAssertions();
    const emails = Array.from({ length: 41 }, (_, index) => `person${index}@example.com`);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Denied" } }), {
        status: 403,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await createService().getAttendeeAvailability(
        {
          calendarId: "calendar-1",
          emails,
          start: "2026-09-29T09:00:00Z",
          end: "2026-09-29T10:00:00Z",
        },
        "account-1",
      ),
    ).toEqual(emails.map((email) => ({ email, status: "unknown", error: "requestFailed" })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("preserves successful batches when a later batch fails", async () => {
    expect.hasAssertions();
    const emails = Array.from({ length: 21 }, (_, index) => `person${index}@example.com`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: emails
              .slice(0, 20)
              .map((email) => ({ scheduleId: email, availabilityView: "000000000000" })),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "ErrorInvalidRequest", message: "Mailbox unavailable" },
          }),
          { status: 400 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createService().getAttendeeAvailability(
      {
        calendarId: "calendar-1",
        emails,
        start: "2026-09-29T09:00:00Z",
        end: "2026-09-29T10:00:00Z",
      },
      "account-1",
    );
    expect(result.slice(0, 20)).toEqual(
      emails.slice(0, 20).map((email) => ({ email, status: "free" })),
    );
    expect(result[20]).toEqual({ email: emails[20], status: "unknown", error: "requestFailed" });
  });

  it("batches and deduplicates recipients using the selected account and UTC", async () => {
    const emails = Array.from({ length: 21 }, (_, index) => `person${index}@example.com`);
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            value: body.schedules.map((email: string) => ({
              scheduleId: email.toUpperCase(),
              availabilityView: "000000000000",
            })),
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const auth = { getAccessTokenForAccount: vi.fn().mockResolvedValue("account-token") };
    const service = new GraphCalendarService(auth as never, { timeZone: "Europe/Rome" } as never);
    const results = await service.getAttendeeAvailability(
      {
        calendarId: "calendar-2",
        emails: [...emails, emails[0].toUpperCase()],
        start: "2026-09-29T11:00:00+02:00",
        end: "2026-09-29T12:00:00+02:00",
      },
      "account-2",
    );
    expect(results).toEqual(emails.map((email) => ({ email, status: "free" })));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.getAccessTokenForAccount).toHaveBeenCalledWith("account-2", false);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me/calendar/getSchedule");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Prefer")).toBe(
      'outlook.timezone="UTC", IdType="ImmutableId"',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      schedules: emails.slice(0, 20),
      availabilityViewInterval: 5,
      startTime: { dateTime: "2026-09-29T09:00:00.000", timeZone: "UTC" },
      endTime: { dateTime: "2026-09-29T10:00:00.000", timeZone: "UTC" },
    });
  });

  it("passes the full-day schedule through when the planner requests it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            value: [{ scheduleId: "person@example.com", availabilityView: "0".repeat(288) }],
          }),
          { status: 200 },
        ),
      ),
    );
    const auth = { getAccessTokenForAccount: vi.fn().mockResolvedValue("account-token") };
    const service = new GraphCalendarService(auth as never, { timeZone: "Europe/Rome" } as never);
    const results = await service.getAttendeeAvailability(
      {
        calendarId: "calendar-1",
        emails: ["person@example.com"],
        start: "2026-09-29T00:00:00Z",
        end: "2026-09-30T00:00:00Z",
        includeSchedule: true,
      },
      "account-1",
    );
    expect(results).toEqual([
      {
        email: "person@example.com",
        status: "free",
        schedule: {
          start: "2026-09-29T00:00:00.000Z",
          end: "2026-09-30T00:00:00.000Z",
          slots: [
            { start: "2026-09-29T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z", status: "free" },
          ],
        },
      },
    ]);
  });

  it("keeps per-mailbox failures and omitted schedules unknown while reporting accessible colleagues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            value: [
              { scheduleId: "free@example.com", availabilityView: "000000000000" },
              { scheduleId: "denied@example.com", error: { responseCode: "5009" } },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    expect(
      await createService().getAttendeeAvailability(
        {
          calendarId: "calendar-1",
          emails: ["free@example.com", "denied@example.com", "external@example.org"],
          start: "2026-09-29T09:00:00Z",
          end: "2026-09-29T10:00:00Z",
        },
        "account-1",
      ),
    ).toEqual([
      { email: "free@example.com", status: "free" },
      { email: "denied@example.com", status: "unknown" },
      { email: "external@example.org", status: "unknown" },
    ]);
  });
});

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

describe("graph event time zones", () => {
  it.each([
    "2026-01-15T12:34:56.789Z",
    "2026-04-15T12:34:56.789Z",
    "2026-07-15T12:34:56.789Z",
    "2026-10-15T12:34:56.789Z",
  ])("round-trips %s through every supported Windows time zone", async (instant) => {
    expect.hasAssertions();
    const service = createService();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const [timeZone, ianaZone] of Object.entries(windowsTimeZones)) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: ianaZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date(instant))
          .map((part) => [part.type, part.value]),
      );
      const dateTime = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.7890000`;
      fetchMock.mockResolvedValueOnce(
        Response.json(
          createGraphEvent({
            start: { dateTime, timeZone },
            end: { dateTime, timeZone },
          }),
        ),
      );
      const event = await service.getEvent("calendar-1", "event-1", "account-1");
      expect({ timeZone, start: event.start, end: event.end }).toEqual({
        timeZone,
        start: instant,
        end: instant,
      });
    }
  });

  it("rejects an incomplete calendar snapshot instead of returning fabricated event times", async () => {
    expect.hasAssertions();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          value: [createGraphEvent(), createGraphEvent({ id: "event-2", end: undefined })],
        }),
      ),
    );
    await expect(
      createService().listCalendarView(
        "calendar-1",
        "2026-03-30T00:00:00Z",
        "2026-03-31T00:00:00Z",
        "account-1",
      ),
    ).rejects.toThrow("Cannot verify the event schedule.");
  });

  it("does not repeat a saved edit when its UTC verification fails", async () => {
    expect.hasAssertions();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          createGraphEvent({
            start: { dateTime: "2026-10-25T02:30:00", timeZone: "Europe/Rome" },
          }),
        ),
      )
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createService().updateEvent(createEventDraft(), "account-1")).rejects.toThrow(
      "offline",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[1][1].method).not.toBe("PATCH");
  });

  it.each([
    ["2026-10-25T00:30:00.000Z", "2026-10-25T02:00:00.000Z"],
    ["2026-10-25T01:30:00.000Z", "2026-10-25T02:00:00.000Z"],
    ["2026-10-24T23:30:00.000Z", "2026-10-25T00:30:00.000Z"],
  ])(
    "creates an exact UTC schedule when either boundary is ambiguous: %s to %s",
    async (start, end) => {
      expect.hasAssertions();
      const graphEvent = createGraphEvent({
        start: { dateTime: start, timeZone: "UTC" },
        end: { dateTime: end, timeZone: "UTC" },
      });
      const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
        Response.json(graphEvent),
      );
      vi.stubGlobal("fetch", fetchMock);
      const recurrence = {
        pattern: {
          type: "daily" as const,
          interval: 1,
          daysOfWeek: [],
          firstDayOfWeek: null,
          dayOfMonth: null,
          month: null,
          index: null,
        },
        range: {
          type: "noEnd" as const,
          startDate: "2026-10-25",
          endDate: null,
          numberOfOccurrences: null,
          recurrenceTimeZone: null,
        },
      };
      await expect(
        createService().createEvent(
          createEventDraft({ id: undefined, start, end, timeZone: "Europe/Rome", recurrence }),
          "account-1",
        ),
      ).resolves.toMatchObject({ start, end });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
        start: { dateTime: start.replace(/\.000Z$/, ""), timeZone: "UTC" },
        end: { dateTime: end.replace(/\.000Z$/, ""), timeZone: "UTC" },
        recurrence: { range: { recurrenceTimeZone: "Europe/Rome" } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    undefined,
    { dateTime: "invalid", timeZone: "UTC" },
    { dateTime: "2026-02-30T11:00:00", timeZone: "UTC" },
    { dateTime: "2026-10-15", timeZone: "UTC" },
    { dateTime: "2026-10-15T11:00:00", timeZone: "Unknown/Zone" },
    { dateTime: "2026-03-29T02:30:00", timeZone: "Europe/Rome" },
    { dateTime: "2026-10-25T02:30:00", timeZone: "Europe/Rome" },
    { dateTime: "2026-11-01T01:30:00", timeZone: "America/New_York" },
    { dateTime: "2026-04-05T01:45:00", timeZone: "Australia/Lord_Howe" },
  ])(
    "rejects an unverifiable event boundary %j instead of inventing an instant",
    async (boundary) => {
      expect.hasAssertions();
      const fetchMock = vi
        .fn()
        .mockResolvedValue(Response.json(createGraphEvent({ start: boundary })));
      vi.stubGlobal("fetch", fetchMock);
      await expect(createService().getEvent("calendar-1", "event-1", "account-1")).rejects.toThrow(
        "Cannot verify the event schedule.",
      );
    },
  );

  it.each(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"])(
    "reads an ambiguous edit response back in UTC to preserve the actual instant %s",
    async (start) => {
      expect.hasAssertions();
      const end = "2026-10-25T02:00:00.000Z";
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            createGraphEvent({
              start: { dateTime: "2026-10-25T02:30:00", timeZone: "Europe/Rome" },
              end: { dateTime: "2026-10-25T03:00:00", timeZone: "Europe/Rome" },
            }),
          ),
        )
        .mockResolvedValueOnce(
          Response.json(
            createGraphEvent({
              start: { dateTime: start, timeZone: "UTC" },
              end: { dateTime: end, timeZone: "UTC" },
            }),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        createService().updateEvent(
          createEventDraft({ start, end, timeZone: "Europe/Rome" }),
          "account-1",
        ),
      ).resolves.toMatchObject({ start, end });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
        start: { dateTime: start.replace(/\.000Z$/, ""), timeZone: "UTC" },
        end: { dateTime: "2026-10-25T02:00:00", timeZone: "UTC" },
      });
      expect(fetchMock.mock.calls[1][1].method).not.toBe("PATCH");
      expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Prefer")).toContain(
        'outlook.timezone="UTC"',
      );
    },
  );

  it.each([
    ["2026-10-15T11:00:00.0000000", "Europe/Rome", "2026-10-15T09:00:00.000Z"],
    ["2026-10-15T11:00:00.1234567", "W. Europe Standard Time", "2026-10-15T09:00:00.123Z"],
    ["2026-12-03T11:00:00", "Europe/Rome", "2026-12-03T10:00:00.000Z"],
    ["2026-10-15T11:00:00", "India Standard Time", "2026-10-15T05:30:00.000Z"],
    ["2026-10-15T11:00:00", "Pacific Standard Time", "2026-10-15T18:00:00.000Z"],
    ["2026-03-29T01:30:00", "Europe/Rome", "2026-03-29T00:30:00.000Z"],
    ["2026-04-05T02:15:00", "Australia/Lord_Howe", "2026-04-04T15:45:00.000Z"],
    ["2026-03-29T03:30:00", "Europe/Rome", "2026-03-29T01:30:00.000Z"],
    ["2026-10-25T01:30:00", "Europe/Rome", "2026-10-24T23:30:00.000Z"],
    ["2026-10-25T03:30:00", "Europe/Rome", "2026-10-25T02:30:00.000Z"],
    ["2026-10-15T00:00:00", "Europe/Rome", "2026-10-14T22:00:00.000Z"],
    ["2026-10-15T11:00:00.1234567Z", "Europe/Rome", "2026-10-15T11:00:00.123Z"],
    ["2026-10-15T11:00:00+02:00", "Europe/Rome", "2026-10-15T09:00:00.000Z"],
    ["2026-10-15T11:00:00+0200", "UTC", "2026-10-15T09:00:00.000Z"],
    ["2026-10-25T02:30:00+02:00", "Europe/Rome", "2026-10-25T00:30:00.000Z"],
    ["2026-10-25T02:30:00+01:00", "Europe/Rome", "2026-10-25T01:30:00.000Z"],
    ["2026-10-15T11:00:00", "UTC", "2026-10-15T11:00:00.000Z"],
    ["2026-10-15T11:00:00", undefined, "2026-10-15T11:00:00.000Z"],
  ])("reads %s in %s as %s", async (dateTime, timeZone, expected) => {
    expect.hasAssertions();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          createGraphEvent({
            start: { dateTime, timeZone },
            end: { dateTime, timeZone },
          }),
        ),
      ),
    );
    const event = await createService().getEvent("calendar-1", "event-1", "account-1");
    expect(event.start).toBe(expected);
    expect(event.end).toBe(expected);
  });

  it("uses each boundary's time zone independently", async () => {
    expect.hasAssertions();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          createGraphEvent({
            start: { dateTime: "2026-10-15T11:00:00", timeZone: "Europe/Rome" },
            end: { dateTime: "2026-10-15T10:45:00", timeZone: "UTC" },
          }),
        ),
      ),
    );
    await expect(
      createService().getEvent("calendar-1", "event-1", "account-1"),
    ).resolves.toMatchObject({
      start: "2026-10-15T09:00:00.000Z",
      end: "2026-10-15T10:45:00.000Z",
    });
  });

  it("keeps a rescheduled event at 11:00 through repeated edits and sync", async () => {
    expect.hasAssertions();
    const service = createService();
    let graphEvent = createGraphEvent();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "PATCH") {
        graphEvent = { ...graphEvent, ...JSON.parse(init.body as string) };
        return Response.json(graphEvent);
      }
      return Response.json({
        value: [
          createGraphEvent({
            ...graphEvent,
            start: { dateTime: "2026-10-15T09:00:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2026-10-15T10:45:00.0000000", timeZone: "UTC" },
          }),
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const start = "2026-10-15T09:00:00.000Z";
    let current = createCalendarEvent();
    for (const end of ["2026-10-15T11:00:00.000Z", "2026-10-15T10:45:00.000Z"]) {
      current = await service.updateEvent(
        createEventDraft({ start, end, timeZone: "Europe/Rome" }),
        "account-1",
        current,
      );
      expect(current).toMatchObject({ start, end });
      expect(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(current.start)),
      ).toBe("11:00");
    }
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      start: { dateTime: "2026-10-15T11:00:00", timeZone: "Europe/Rome" },
      end: { dateTime: "2026-10-15T13:00:00", timeZone: "Europe/Rome" },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      end: { dateTime: "2026-10-15T12:45:00", timeZone: "Europe/Rome" },
    });
    const synced = await service.listCalendarView(
      "calendar-1",
      "2026-10-15T00:00:00Z",
      "2026-10-16T00:00:00Z",
      "account-1",
    );
    expect(synced[0]).toMatchObject({ start: current.start, end: current.end });
  });
});

describe("graph calendar service body conversion", () => {
  it("reuses a placeholder transaction after creation succeeds but the following read fails", async () => {
    expect.hasAssertions();
    const transactions = new Map<string, string>();
    let createdCount = 0;
    let failRead = true;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      let eventId = "event-1";
      if (init.method === "POST") {
        const payload = JSON.parse(init.body as string);
        const key = payload.transactionId ?? crypto.randomUUID();
        if (!transactions.has(key)) {
          transactions.set(key, `event-${++createdCount}`);
        }
        eventId = transactions.get(key)!;
      } else if (failRead) {
        failRead = false;
        throw new Error("Lost the event read response");
      }
      return Response.json(
        createGraphEvent({
          id: eventId,
          subject: "Provvisorio",
          isOrganizer: true,
          isReminderOn: false,
          showAs: "busy",
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const draft = createEventDraft({
      id: undefined,
      subject: "Provvisorio",
      isReminderOn: false,
      timeZone: "UTC",
      start: "2026-10-25T01:30:00.000Z",
      end: "2026-10-25T02:00:00.000Z",
      transactionId: "00000000-0000-4000-8000-000000000001",
    });
    await expect(service.createEvent(draft, "account-1")).rejects.toThrow(
      "Lost the event read response",
    );
    await expect(service.createEvent(draft, "account-1")).resolves.toMatchObject({
      id: "event-1",
      isReminderOn: false,
    });
    expect(createdCount).toBe(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      transactionId: draft.transactionId,
      start: { dateTime: "2026-10-25T01:30:00", timeZone: "UTC" },
      end: { dateTime: "2026-10-25T02:00:00", timeZone: "UTC" },
    });
    expect(fetchMock.mock.calls[2][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("keeps UTC event boundaries stable through creation and a later calendar sync", async () => {
    expect.hasAssertions();
    const graphEvent = createGraphEvent({
      start: { dateTime: "2026-10-25T01:30:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-10-25T02:00:00.0000000", timeZone: "UTC" },
      isOrganizer: true,
      isReminderOn: false,
      subject: "Provvisorio",
      showAs: "busy",
    });
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
      Response.json(url.includes("calendarView") ? { value: [graphEvent] } : graphEvent),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const created = await service.createEvent(
      createEventDraft({
        id: undefined,
        subject: "Provvisorio",
        isReminderOn: false,
        timeZone: "UTC",
      }),
      "account-1",
    );
    const synced = await service.listCalendarView(
      "calendar-1",
      "2026-10-24T00:00:00Z",
      "2026-10-26T00:00:00Z",
      "account-1",
    );
    expect(created).toMatchObject({
      start: "2026-10-25T01:30:00.000Z",
      end: "2026-10-25T02:00:00.000Z",
    });
    expect(synced[0]).toStrictEqual(created);
    expect(
      fetchMock.mock.calls.every(([, init]) =>
        new Headers(init.headers).get("Prefer")?.includes('outlook.timezone="UTC"'),
      ),
    ).toBe(true);
  });

  it("preserves local midnight boundaries when editing an all-day event received in UTC", async () => {
    expect.hasAssertions();
    const graphEvent = createGraphEvent({
      isAllDay: true,
      start: { dateTime: "2026-03-29T22:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-03-30T22:00:00.0000000", timeZone: "UTC" },
    });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(graphEvent)));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const event = await service.getEvent("calendar-1", "event-1", "account-1");
    await service.updateEvent(
      createEventDraft({
        start: event.start,
        end: event.end,
        timeZone: event.timeZone,
        isAllDay: true,
      }),
      "account-1",
    );
    expect(event).toMatchObject({
      start: "2026-03-29T22:00:00.000Z",
      end: "2026-03-30T22:00:00.000Z",
      timeZone: "Europe/Rome",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      isAllDay: true,
      start: { dateTime: "2026-03-30T00:00:00", timeZone: "Europe/Rome" },
      end: { dateTime: "2026-03-31T00:00:00", timeZone: "Europe/Rome" },
    });
  });

  it("does not send a creation transaction identifier when updating an event", async () => {
    expect.hasAssertions();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(createGraphEvent()));
    vi.stubGlobal("fetch", fetchMock);
    await createService().updateEvent(
      createEventDraft({ transactionId: "00000000-0000-4000-8000-000000000001" }),
      "account-1",
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty(
      "transactionId",
    );
  });
  it("persists a busy personal placeholder with no desktop reminder or invite response", async () => {
    const graphEvent = createGraphEvent({
      subject: "Provvisorio",
      isOrganizer: true,
      isReminderOn: false,
      showAs: "busy",
      responseStatus: { response: "organizer" },
    });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(graphEvent)));
    vi.stubGlobal("fetch", fetchMock);
    const created = await createService().createEvent(
      createEventDraft({
        id: undefined,
        subject: "Provvisorio",
        body: null,
        location: null,
        isReminderOn: false,
        reminderMinutesBeforeStart: null,
        responseRequested: false,
      }),
      "account-1",
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload).toMatchObject({
      subject: "Provvisorio",
      attendees: [],
      showAs: "busy",
      isReminderOn: false,
      reminderMinutesBeforeStart: 0,
      responseRequested: false,
    });
    expect(payload).not.toHaveProperty("responseStatus");
    expect(created).toMatchObject({
      subject: "Provvisorio",
      isOrganizer: true,
      attendees: [],
      showAs: "busy",
      isReminderOn: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([null, undefined, 45])(
    "sends an integer reminder offset for disabled reminders even when the draft value is %s",
    async (reminderMinutesBeforeStart) => {
      expect.hasAssertions();
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            Response.json(createGraphEvent({ isReminderOn: false, reminderMinutesBeforeStart: 0 })),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      await createService().createEvent(
        createEventDraft({ id: undefined, isReminderOn: false, reminderMinutesBeforeStart }),
        "account-1",
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
        isReminderOn: false,
        reminderMinutesBeforeStart: 0,
      });
    },
  );

  it("disables an existing reminder with a numeric Graph patch and keeps later saves unchanged", async () => {
    expect.hasAssertions();
    const updatedGraphEvent = createGraphEvent({
      body: { content: "Agenda", contentType: "HTML" },
      location: { displayName: "Room 1" },
      isReminderOn: false,
      reminderMinutesBeforeStart: 0,
    });
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json(updatedGraphEvent)));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const draft = createEventDraft({ isReminderOn: false, reminderMinutesBeforeStart: null });
    const updated = await service.updateEvent(draft, "account-1", createCalendarEvent());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toStrictEqual({
      isReminderOn: false,
      reminderMinutesBeforeStart: 0,
    });
    await service.updateEvent({ ...draft, subject: "Updated planning" }, "account-1", updated);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toStrictEqual({
      subject: "Updated planning",
    });
  });
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
  it("stops consuming an oversized photo before the whole response is downloaded", async () => {
    const cancel = vi.fn();
    let chunks = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            pull(controller) {
              chunks += 1;
              controller.enqueue(new Uint8Array(1024 * 1024));
              if (chunks === 8) controller.close();
            },
            cancel,
          }),
          { headers: { "Content-Type": "image/jpeg" } },
        ),
      ),
    );
    await expect(
      createService().getContactPhoto("account-1", { email: "alice@example.com", name: "Alice" }),
    ).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(chunks).toBeLessThan(8);
  });

  it("bounds concurrent and queued photo loads and retries dropped contacts", async () => {
    let releaseRequests = false;
    let activeRequests = 0;
    let peakRequests = 0;
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      return new Promise<Response>((resolve) => {
        const complete = () => {
          activeRequests -= 1;
          resolve(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
        };
        if (releaseRequests) {
          complete();
        } else {
          pending.push(complete);
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contacts = Array.from({ length: 270 }, (_, index) => ({
      email: `person${index}@example.com`,
      name: null,
    }));
    const photos = contacts.map((contact) => service.getContactPhoto("account-1", contact));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    releaseRequests = true;
    pending.forEach((complete) => complete());
    const results = await Promise.all(photos);
    expect(peakRequests).toBe(6);
    expect(results.filter((photo) => photo === null)).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(262);
    const droppedIndex = results.findIndex((photo) => photo === null);
    await expect(service.getContactPhoto("account-1", contacts[droppedIndex])).resolves.toBe(
      "data:image/jpeg;base64,cGhvdG8=",
    );
    expect(fetchMock).toHaveBeenCalledTimes(263);
  });

  it("skips queued photos after their account signs out", async () => {
    const getAccountUsername = vi.fn().mockReturnValue("user@example.com");
    const pending: ((response: Response) => void)[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService({ getAccountUsername });
    const photos = Array.from({ length: 7 }, (_, index) =>
      service.getContactPhoto("account-1", {
        email: `person${index}@example.com`,
        name: null,
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    getAccountUsername.mockReturnValue(null);
    pending.forEach((resolve) =>
      resolve(new Response("photo", { headers: { "Content-Type": "image/jpeg" } })),
    );
    await expect(Promise.all(photos)).resolves.toEqual(Array.from({ length: 7 }, () => null));
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("keeps sharing pending loads when the cache duration elapses before completion", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    let complete!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contact = { email: "alice@example.com", name: "Alice" };
    const first = service.getContactPhoto("account-1", contact);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    now.mockReturnValue(5 * 60_000 + 1);
    const second = service.getContactPhoto("account-1", contact);
    complete(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      "data:image/jpeg;base64,cGhvdG8=",
      "data:image/jpeg;base64,cGhvdG8=",
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    await service.getContactPhoto("account-1", contact);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("evicts large photos when their combined cached data exceeds the memory budget", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(new Uint8Array(4 * 1024 * 1024), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    for (const email of [
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
      "alice@example.com",
    ]) {
      await service.getContactPhoto("account-1", { email, name: null });
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("uses the directory principal name for contacts whose SMTP address is an alias", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              displayName: "Alice",
              userPrincipalName: "alice@tenant.onmicrosoft.com",
              scoredEmailAddresses: [{ address: "alias@example.com" }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contacts = await service.searchPeople("account-1", "Alice", 5);
    await service.getContactPhoto("account-1", contacts[0]);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/users/alice%40tenant.onmicrosoft.com/photos/48x48/$value",
    );
  });

  it("does not return cached or in-flight photos after the account signs out", async () => {
    const getAccountUsername = vi.fn().mockReturnValue("user@example.com");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService({ getAccountUsername });
    const contact = { email: "alice@example.com", name: "Alice" };
    await service.getContactPhoto("account-1", contact);
    getAccountUsername.mockReturnValue(null);
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    getAccountUsername.mockReturnValue("user@example.com");
    let resolvePhoto!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePhoto = resolve;
        }),
    );
    const pending = service.getContactPhoto("account-1", { email: "bob@example.com", name: "Bob" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    getAccountUsername.mockReturnValue(null);
    resolvePhoto(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    await expect(pending).resolves.toBeNull();
  });

  it("resolves a saved participant alias by exact email and caches the photo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              displayName: "Alice Other",
              userPrincipalName: "other@tenant.onmicrosoft.com",
              scoredEmailAddresses: [{ address: "other@example.com" }],
            },
            {
              displayName: "Alice",
              userPrincipalName: "alice@tenant.onmicrosoft.com",
              scoredEmailAddresses: [{ address: "alias@example.com" }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contact = { email: "ALIAS@example.com", name: null };
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBe(
      "data:image/jpeg;base64,cGhvdG8=",
    );
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "/users/alice%40tenant.onmicrosoft.com/photos/48x48/$value",
    );
    await service.getContactPhoto("account-1", contact);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps initials when directory lookup only returns a fuzzy match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              displayName: "Alice",
              userPrincipalName: "alice@tenant.onmicrosoft.com",
              scoredEmailAddresses: [{ address: "other@example.com" }],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contact = { email: "alias@example.com", name: null };
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBeNull();
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels throttled photo retries when the photo timeout expires", async () => {
    vi.useFakeTimers();
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "600" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const pending = createService().getContactPhoto("account-1", {
        email: "alice@example.com",
        name: "Alice",
      });
      await vi.advanceTimersByTimeAsync(0);
      timeoutController.abort();
      await vi.advanceTimersByTimeAsync(0);
      await expect(Promise.race([pending, Promise.resolve("still waiting")])).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps contact ids for photo lookups", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          value: [
            {
              id: "contact-1",
              displayName: "Alice",
              emailAddresses: [{ address: "alice@example.com" }],
            },
          ],
        }),
      ),
    );
    await expect(createService().listContacts("account-1")).resolves.toEqual([
      { contactId: "contact-1", email: "alice@example.com", name: "Alice" },
    ]);
  });

  it("loads and caches contact photos separately for each account", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("photo", { headers: { "Content-Type": "image/jpeg" } })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contact = { contactId: "contact/1", email: "alice@example.com", name: "Alice" };
    const first = service.getContactPhoto("account-1", contact);
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBe(
      "data:image/jpeg;base64,cGhvdG8=",
    );
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/contacts/contact%2F1/photo/$value");
    await service.getContactPhoto("account-2", contact);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to a directory photo and tolerates unavailable photos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("photo", { headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    await expect(
      service.getContactPhoto("account-1", {
        contactId: "contact-1",
        email: "alice@example.com",
        name: "Alice",
      }),
    ).resolves.toBe("data:image/png;base64,cGhvdG8=");
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/users/alice%40example.com/photos/48x48/$value",
    );
    await expect(
      service.getContactPhoto("account-1", {
        email: "bob@example.com",
        name: "Bob",
      }),
    ).resolves.toBeNull();
  });

  it("rejects non-image photo responses and retries after network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(
        new Response("<svg />", { headers: { "Content-Type": "image/svg+xml" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const contact = { email: "alice@example.com", name: "Alice" };
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBeNull();
    await expect(service.getContactPhoto("account-1", contact)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

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
    expect(preferHeader).toContain('outlook.timezone="UTC"');
    expect(preferHeader).toContain('IdType="ImmutableId"');
  });

  it.each([
    { query: "vol pe", search: '"vol pe"' },
    { query: "", search: null },
    { query: "  ", search: null },
  ])("retrieves Graph people in relevance order for query '$query'", async ({ query, search }) => {
    expect.hasAssertions();

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          {
            displayName: "Volpe Francesco",
            scoredEmailAddresses: [
              { address: "invalid-address", relevanceScore: 20 },
              { address: "FRANCESCO1.VOLPE@TELECOMITALIA.IT", relevanceScore: 10 },
            ],
            userPrincipalName: "francesco1.volpe@telecomitalia.it",
          },
          {
            givenName: "Fallback",
            surname: "Person",
            userPrincipalName: "fallback@example.com",
          },
          {
            displayName: "Duplicate",
            scoredEmailAddresses: [
              { address: "francesco1.volpe@telecomitalia.it", relevanceScore: 8 },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();

    await expect(service.searchPeople("account-1", query, 5)).resolves.toStrictEqual([
      {
        email: "francesco1.volpe@telecomitalia.it",
        name: "Volpe Francesco",
        userPrincipalName: "francesco1.volpe@telecomitalia.it",
      },
      {
        email: "fallback@example.com",
        name: "Fallback Person",
        userPrincipalName: "fallback@example.com",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const requestHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect({
      pathname: requestUrl.pathname,
      querySources: requestHeaders.get("X-PeopleQuery-QuerySources"),
      search: requestUrl.searchParams.get("$search"),
      select: requestUrl.searchParams.get("$select"),
      top: requestUrl.searchParams.get("$top"),
    }).toStrictEqual({
      pathname: "/v1.0/me/people",
      querySources: "Mailbox,Directory",
      search,
      select: "displayName,givenName,surname,userPrincipalName,scoredEmailAddresses",
      top: "5",
    });
  });

  it("parses Graph attachment metadata types", async () => {
    expect.hasAssertions();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            contentType: "text/plain",
            id: "file-1",
            isInline: false,
            name: "agenda.txt",
            size: 12,
          },
          {
            "@odata.type": "#microsoft.graph.referenceAttachment",
            contentType: null,
            id: "reference-1",
            isInline: false,
            name: "cloud-file.docx",
            size: 0,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const attachments = await service.listAttachments("calendar-1", "event-1", "account-1");

    expect(attachments).toMatchObject([
      { attachmentType: "file", id: "file-1" },
      { attachmentType: "reference", id: "reference-1" },
    ]);
  });

  it("downloads raw attachment content through Graph value endpoint", async () => {
    expect.hasAssertions();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          "@odata.type": "#microsoft.graph.fileAttachment",
          contentType: "text/plain",
          id: "attachment-1",
          isInline: false,
          name: "agenda.txt",
          size: 5,
        }),
      )
      .mockResolvedValueOnce(
        new Response("hello", {
          headers: { "Content-Type": "text/plain" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const content = await service.getAttachmentContent(
      "calendar-1",
      "event-1",
      "attachment-1",
      "account-1",
    );

    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("$select")).toBe(
      "id,name,contentType,size,isInline",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/me/events/event-1/attachments/attachment-1/$value",
    );
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Accept")).toBe("text/plain");
    expect(content.attachment).toMatchObject({ attachmentType: "file", id: "attachment-1" });
    expect(content.buffer.toString("utf8")).toBe("hello");
    expect(content.contentType).toBe("text/plain");
  });

  it("rejects reference attachments before requesting raw content", async () => {
    expect.hasAssertions();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        "@odata.type": "#microsoft.graph.referenceAttachment",
        contentType: null,
        id: "reference-1",
        isInline: false,
        name: "cloud-file.docx",
        size: 0,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();

    await expect(
      service.getAttachmentContent("calendar-1", "event-1", "reference-1", "account-1"),
    ).rejects.toThrow("Cloud link attachments cannot be downloaded directly.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uploads small file attachments to Graph", async () => {
    expect.hasAssertions();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "attachment-1" }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              contentType: "text/plain",
              id: "attachment-1",
              isInline: false,
              name: "agenda.txt",
              size: 5,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const attachments = await service.addAttachment(
      "calendar-1",
      "event-1",
      {
        contentBytes: "aGVsbG8=",
        contentType: "text/plain",
        name: "agenda.txt",
        size: 5,
      },
      "account-1",
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/events/event-1/attachments");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toStrictEqual({
      "@odata.type": "#microsoft.graph.fileAttachment",
      contentBytes: "aGVsbG8=",
      contentType: "text/plain",
      name: "agenda.txt",
    });
    expect(attachments).toMatchObject([{ attachmentType: "file", id: "attachment-1" }]);
  });

  it("posts tentative responses using Graph tentativelyAccept action", async () => {
    expect.assertions(3);

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();

    await service.respondToEvent(
      {
        action: "tentative",
        calendarId: "calendar-1",
        comment: "Maybe",
        eventId: "event-1",
        sendResponse: true,
      },
      "account-1",
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/events/event-1/tentativelyAccept");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toStrictEqual({
      comment: "Maybe",
      sendResponse: true,
    });
  });

  it("parses Zoom links from event body content", async () => {
    const joinUrl = "https://acme.zoom.us/j/123456789?pwd=abc123";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          createGraphEvent({
            body: {
              content: `<p>Join here: <a href="${joinUrl}">${joinUrl}</a></p>`,
              contentType: "HTML",
            },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const [event] = await service.listCalendarView(
      "calendar-1",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "account-1",
    );

    expect(event).toMatchObject({ isOnlineMeeting: true });
    expect(event.onlineMeeting?.joinUrl).toBe(joinUrl);
  });

  it("strips HTML entities around parsed meeting links", async () => {
    const joinUrl = "https://acme.zoom.us/j/123456789";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          createGraphEvent({
            body: {
              content: `<p>${joinUrl}&nbsp;</p>`,
              contentType: "HTML",
            },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const [event] = await service.listCalendarView(
      "calendar-1",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "account-1",
    );

    expect(event).toMatchObject({ isOnlineMeeting: true });
    expect(event.onlineMeeting?.joinUrl).toBe(joinUrl);
  });

  it("parses WebEx links from event locations", async () => {
    const joinUrl = "https://example.webex.com/meet/team-room";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          createGraphEvent({
            location: {
              displayName: `Cisco WebEx: ${joinUrl}`,
            },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const [event] = await service.listCalendarView(
      "calendar-1",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "account-1",
    );

    expect(event).toMatchObject({ isOnlineMeeting: true });
    expect(event.onlineMeeting?.joinUrl).toBe(joinUrl);
  });

  it("keeps Graph-provided join URLs before parsed URLs", async () => {
    const graphJoinUrl = "https://teams.microsoft.com/l/meetup-join/graph-link";
    const bodyJoinUrl = "https://acme.zoom.us/j/123456789";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          createGraphEvent({
            body: {
              content: bodyJoinUrl,
              contentType: "HTML",
            },
            onlineMeeting: {
              joinUrl: graphJoinUrl,
            },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const [event] = await service.listCalendarView(
      "calendar-1",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "account-1",
    );

    expect(event.onlineMeeting?.joinUrl).toBe(graphJoinUrl);
  });

  it("ignores non-meeting URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          createGraphEvent({
            body: {
              content: "https://example.com/j/123456789",
              contentType: "HTML",
            },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const [event] = await service.listCalendarView(
      "calendar-1",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "account-1",
    );

    expect(event).toMatchObject({ isOnlineMeeting: false, onlineMeeting: null });
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
  }, 10_000);

  it("skips the graph patch but refetches the event for no-op event detail saves", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json(
        createGraphEvent({
          "@odata.etag": '"etag-2"',
          body: {
            content: "Agenda",
            contentType: "HTML",
          },
          isOrganizer: true,
          location: { displayName: "Room 1" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    const current = createCalendarEvent();
    const updated = await service.updateEvent(createEventDraft(), "account-1", current);

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestInit = fetchMock.mock.calls[0][1];
    expect(requestInit?.method ?? "GET").toBe("GET");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/events/event-1?");
    expect(updated).not.toBe(current);
    expect(updated.id).toBe("event-1");
    expect(updated.etag).toBe('"etag-2"');
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

describe("graph calendar service parseRecurrence", () => {
  it("coerces Graph's pattern.month=0 to null for absoluteMonthly + noEnd", () => {
    const result = parseRecurrence({
      pattern: {
        dayOfMonth: 10,
        interval: 1,
        month: 0,
        type: "absoluteMonthly",
      },
      range: {
        numberOfOccurrences: 0,
        startDate: "2026-05-10",
        type: "noEnd",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.pattern.month).toBeNull();
    expect(result?.range.numberOfOccurrences).toBeNull();
    expect(result?.pattern.dayOfMonth).toBe(10);
    expect(result?.pattern.interval).toBe(1);
  });

  it("preserves valid positive integers", () => {
    const result = parseRecurrence({
      pattern: {
        dayOfMonth: 15,
        interval: 2,
        month: 6,
        type: "absoluteYearly",
      },
      range: {
        numberOfOccurrences: 5,
        startDate: "2026-06-15",
        type: "numbered",
      },
    });

    expect(result?.pattern.month).toBe(6);
    expect(result?.pattern.dayOfMonth).toBe(15);
    expect(result?.pattern.interval).toBe(2);
    expect(result?.range.numberOfOccurrences).toBe(5);
  });

  it("falls back interval=0 to 1 to satisfy schema min(1)", () => {
    const result = parseRecurrence({
      pattern: {
        interval: 0,
        type: "daily",
      },
      range: {
        startDate: "2026-05-10",
        type: "noEnd",
      },
    });

    expect(result?.pattern.interval).toBe(1);
  });

  it("clamps out-of-range month and dayOfMonth to null to satisfy schema max bounds", () => {
    const result = parseRecurrence({
      pattern: {
        dayOfMonth: 32,
        interval: 1,
        month: 13,
        type: "absoluteYearly",
      },
      range: {
        startDate: "2026-05-10",
        type: "noEnd",
      },
    });

    expect(result?.pattern.month).toBeNull();
    expect(result?.pattern.dayOfMonth).toBeNull();
  });
});
