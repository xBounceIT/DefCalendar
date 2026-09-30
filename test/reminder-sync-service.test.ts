import { afterEach, describe, expect, it, vi } from "vitest";
import GraphCalendarService from "../src/main/graph/calendar-service";
import ReminderSyncService from "../src/main/reminders/reminder-sync-service";

function createFixture() {
  const items = [
    { calendarId: "calendar-1", eventId: "occurrence-1", start: "2026-09-30T10:00:00Z" },
    { calendarId: "calendar-2", eventId: "event-2", start: "2026-09-30T11:00:00Z" },
  ];
  const db = {
    listPendingReminderDismissals: vi.fn(() => [...items]),
    getCalendarHomeAccountId: vi.fn((id: string) =>
      id === "calendar-1" ? "account-1" : "account-2",
    ),
    getEvent: vi.fn(
      (calendarId: string, eventId: string) =>
        items.find((item) => item.calendarId === calendarId && item.eventId === eventId) ?? null,
    ),
    completeReminderDismissal: vi.fn((item: (typeof items)[number]) => {
      items.splice(items.indexOf(item), 1);
    }),
  };
  const auth = { createAccountSessionGuard: vi.fn(() => vi.fn()) };
  const graph = { dismissReminder: vi.fn().mockResolvedValue(undefined) };
  const service = new ReminderSyncService(db as never, auth as never, graph as never);
  return { items, db, auth, graph, service };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reminder sync", () => {
  it("checks fresh Graph state at startup and clears a stale dismissal without suppressing the new reminder", async () => {
    const fixture = createFixture();
    const getAccessTokenForAccount = vi.fn().mockResolvedValue("token");
    const graph = new GraphCalendarService(
      { ...fixture.auth, getAccessTokenForAccount } as never,
      { timeZone: "Europe/Rome" } as never,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "occurrence-1",
          start: { dateTime: "2026-10-01T10:00:00.0000000", timeZone: "UTC" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "event-2",
          start: { dateTime: "2026-09-30T11:00:00.0000000", timeZone: "UTC" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ReminderSyncService(fixture.db as never, fixture.auth as never, graph);
    service.start();
    try {
      await service.flush();
      expect(fixture.items).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const dismissals = fetchMock.mock.calls.filter(([, init]) => init.method === "POST");
      expect(dismissals).toHaveLength(1);
      expect(dismissals[0][0]).toBe(
        "https://graph.microsoft.com/v1.0/me/calendars/calendar-2/events/event-2/dismissReminder",
      );
      expect(getAccessTokenForAccount.mock.calls).toEqual([
        ["account-1", false, false],
        ["account-2", false, false],
        ["account-2", false, false],
      ]);
    } finally {
      service.stop();
    }
  });

  it("restarts processing retained operations after stopping", async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    fixture.service.stop();
    await fixture.service.flush();
    expect(fixture.graph.dismissReminder).not.toHaveBeenCalled();
    fixture.service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.items).toEqual([]);
    fixture.service.stop();
  });

  it("stops processing and leaves queued operations intact when stopped during a request", async () => {
    const fixture = createFixture();
    let resolveRequest = () => {};
    fixture.graph.dismissReminder.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const pending = fixture.service.flush();
    fixture.service.stop();
    resolveRequest();
    await pending;
    expect(fixture.graph.dismissReminder).toHaveBeenCalledOnce();
    expect(fixture.items).toHaveLength(2);
    await fixture.service.flush();
    expect(fixture.graph.dismissReminder).toHaveBeenCalledOnce();
  });

  it("sends each occurrence with its owning account and clears successful operations", async () => {
    const fixture = createFixture();
    await fixture.service.flush();
    expect(fixture.graph.dismissReminder.mock.calls).toEqual([
      ["calendar-1", "occurrence-1", "account-1", "2026-09-30T10:00:00Z", expect.any(AbortSignal)],
      ["calendar-2", "event-2", "account-2", "2026-09-30T11:00:00Z", expect.any(AbortSignal)],
    ]);
    expect(fixture.items).toEqual([]);
  });

  it("retains an offline dismissal and retries without blocking other accounts", async () => {
    const fixture = createFixture();
    fixture.graph.dismissReminder.mockRejectedValueOnce(new Error("offline"));
    await fixture.service.flush();
    expect(fixture.items).toHaveLength(1);
    await fixture.service.flush();
    expect(fixture.items).toEqual([]);
    expect(fixture.graph.dismissReminder).toHaveBeenCalledTimes(3);
  });

  it("does not send queued actions using an invalid account session", async () => {
    const fixture = createFixture();
    fixture.auth.createAccountSessionGuard.mockImplementationOnce(() => {
      throw new Error("signed out");
    });
    await fixture.service.flush();
    expect(fixture.items).toHaveLength(1);
    expect(fixture.graph.dismissReminder).toHaveBeenCalledExactlyOnceWith(
      "calendar-2",
      "event-2",
      "account-2",
      "2026-09-30T11:00:00Z",
      expect.any(AbortSignal),
    );
  });

  it("does not acknowledge a response received after the account session changes", async () => {
    const fixture = createFixture();
    fixture.auth.createAccountSessionGuard.mockReturnValueOnce(
      vi.fn(() => {
        throw new Error("session changed");
      }),
    );
    await fixture.service.flush();
    expect(fixture.items).toHaveLength(1);
    expect(fixture.db.completeReminderDismissal).toHaveBeenCalledOnce();
  });

  it("drops obsolete dismissals without dismissing the rescheduled occurrence", async () => {
    const fixture = createFixture();
    fixture.db.getEvent.mockReturnValueOnce({ ...fixture.items[0], start: "2026-10-01T10:00:00Z" });
    fixture.db.getEvent.mockReturnValueOnce(null);
    await fixture.service.flush();
    expect(fixture.graph.dismissReminder).not.toHaveBeenCalled();
    expect(fixture.items).toEqual([]);
  });

  it("clears a dismissal for an event removed from Microsoft 365", async () => {
    const fixture = createFixture();
    fixture.graph.dismissReminder.mockRejectedValueOnce(new Error("Item not found"));
    await fixture.service.flush();
    expect(fixture.items).toEqual([]);
  });

  it("keeps forbidden dismissals pending for retry", async () => {
    const fixture = createFixture();
    fixture.graph.dismissReminder.mockRejectedValueOnce(new Error("Forbidden"));
    await fixture.service.flush();
    expect(fixture.items).toHaveLength(1);
  });

  it("serializes overlapping flushes", async () => {
    const fixture = createFixture();
    let resolveRequest = () => {};
    fixture.graph.dismissReminder.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const first = fixture.service.flush();
    const second = fixture.service.flush();
    expect(fixture.graph.dismissReminder).toHaveBeenCalledOnce();
    resolveRequest();
    await Promise.all([first, second]);
    expect(fixture.graph.dismissReminder).toHaveBeenCalledTimes(2);
  });

  it("flushes at startup and retries periodically until stopped", async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    fixture.graph.dismissReminder.mockRejectedValue(new Error("offline"));
    fixture.service.start();
    fixture.service.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.graph.dismissReminder).toHaveBeenCalledTimes(4);
    fixture.service.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.graph.dismissReminder).toHaveBeenCalledTimes(4);
  });
});
