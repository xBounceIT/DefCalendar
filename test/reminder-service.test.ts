import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReminderService from "../src/main/reminders/reminder-service";

const { getLocale, powerMonitor } = vi.hoisted(() => ({
  getLocale: vi.fn().mockReturnValue("en-US"),
  powerMonitor: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock(import("@main/electron-runtime"), () => ({
  app: {
    getLocale,
  },
  powerMonitor,
}));

function createCandidate(overrides?: {
  calendarId?: string;
  dedupeKey?: string;
  dismissedAt?: null | string;
  reminderMinutesBeforeStart?: number;
  reminderType?: "pre" | "start";
  snoozedUntil?: null | string;
  start?: string;
  subject?: string;
}) {
  const calendarId = overrides?.calendarId ?? "calendar-1";
  const start = overrides?.start ?? "2026-03-30T10:00:00.000Z";
  const reminderType = overrides?.reminderType ?? "pre";

  return {
    dedupeKey: overrides?.dedupeKey ?? `${calendarId}:event-1:${start}:${reminderType}`,
    dismissedAt: overrides?.dismissedAt ?? null,
    event: {
      calendarId,
      end: "2026-03-30T10:30:00.000Z",
      isAllDay: false,
      location: "Room 3",
      reminderMinutesBeforeStart: overrides?.reminderMinutesBeforeStart ?? 15,
      start,
      subject: overrides?.subject ?? "Planning",
    },
    reminderType,
    snoozedUntil: overrides?.snoozedUntil ?? null,
  };
}

function createFixture(args?: {
  candidates?: ReturnType<typeof createCandidate>[];
  hasWindow?: boolean;
  localEvents?: {
    calendarId: string;
    end: string;
    id: string;
    isAllDay: boolean;
    location: string;
    reminderMinutesBeforeStart: null | number;
    start: string;
    subject: string;
  }[];
  localReminderOverrideEnabled?: boolean;
  localReminderRules?: { minutes: number; when: "after" | "before" }[];
  reminderStateByKey?: Record<string, { dismissedAt: null | string; snoozedUntil: null | string }>;
  visibleCalendarIds?: string[];
}) {
  const candidates = args?.candidates ?? [];
  const localEvents = args?.localEvents ?? [];
  const reminderStateByKey = args?.reminderStateByKey ?? {};
  const db = {
    dismissReminder: vi.fn(),
    dismissReminders: vi.fn(),
    getReminderState: vi
      .fn()
      .mockImplementation((dedupeKey: string) => reminderStateByKey[dedupeKey] ?? null),
    getReminderStates: vi.fn().mockImplementation((keys: string[]) => {
      const map = new Map<string, { dismissedAt: null | string; snoozedUntil: null | string }>();
      for (const key of keys) {
        const state = reminderStateByKey[key];
        if (state) {
          map.set(key, state);
        }
      }
      return map;
    }),
    listReminderEventsByStartRange: vi
      .fn()
      .mockImplementation(
        (visibleCalendarIds: string[], windowStart: string, windowEnd: string) => {
          const windowStartTime = new Date(windowStart).getTime();
          const windowEndTime = new Date(windowEnd).getTime();

          return localEvents
            .filter((event) => visibleCalendarIds.includes(event.calendarId))
            .filter((event) => {
              const eventStart = new Date(event.start).getTime();
              return eventStart >= windowStartTime && eventStart <= windowEndTime;
            })
            .map((event) => ({
              ...event,
              onlineMeeting: null,
            }));
        },
      ),
    listReminderCandidates: vi
      .fn()
      .mockImplementation(
        (visibleCalendarIds: string[], _windowStart: string, _windowEnd: string) =>
          candidates.filter((candidate) => visibleCalendarIds.includes(candidate.event.calendarId)),
      ),
    pruneNotificationState: vi.fn(),
    pruneReminderState: vi.fn(),
    snoozeReminder: vi.fn(),
  };
  const reminderManager = {
    close: vi.fn(),
    hasWindow: vi.fn().mockReturnValue(args?.hasWindow ?? false),
    show: vi.fn(),
  };
  const settings = {
    getSettings: vi.fn().mockReturnValue({
      language: "system",
      localReminderOverrideEnabled: args?.localReminderOverrideEnabled ?? false,
      localReminderRules: args?.localReminderRules ?? [{ minutes: 15, when: "before" }],
      timeFormat: "24h",
      visibleCalendarIds: args?.visibleCalendarIds ?? ["calendar-1"],
    }),
  };

  return {
    db,
    reminderManager,
    service: new ReminderService(db as never, reminderManager as never, settings as never),
    settings,
  };
}

describe("reminder service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T09:45:00.000Z"));
    getLocale.mockReturnValue("en-US");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows a reminder when its configured reminder time is due", async () => {
    const fixture = createFixture({ candidates: [createCandidate()] });

    await fixture.service.checkNow();

    expect(fixture.db.listReminderCandidates).toHaveBeenCalledWith(
      ["calendar-1"],
      "2026-03-28T09:45:00.000Z",
      "2026-04-13T09:45:00.000Z",
    );
    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      {
        items: [
          {
            dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:pre",
            end: "2026-03-30T10:30:00.000Z",
            isAllDay: false,
            location: "Room 3",
            onlineMeeting: null,
            reminderMinutesBeforeStart: 15,
            reminderType: "pre",
            start: "2026-03-30T10:00:00.000Z",
            subject: "Planning",
          },
        ],
        locale: "en",
        timeFormat: "24h",
      },
      true,
    );
  });

  it("schedules the next check at the exact reminder offset", async () => {
    const fixture = createFixture({ candidates: [createCandidate()] });

    vi.setSystemTime(new Date("2026-03-30T09:44:59.000Z"));
    fixture.service.start();
    void fixture.service.checkNow();

    expect(fixture.reminderManager.show).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(fixture.reminderManager.show).toHaveBeenCalledOnce();
    expect(fixture.reminderManager.show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:pre" }),
        ],
      }),
      true,
    );

    fixture.service.stop();
  });

  it("shows overdue reminders only for visible calendars", async () => {
    vi.setSystemTime(new Date("2026-03-30T10:05:00.000Z"));

    const fixture = createFixture({
      candidates: [
        createCandidate({ calendarId: "calendar-1", subject: "Visible reminder" }),
        createCandidate({ calendarId: "calendar-2", subject: "Hidden reminder" }),
      ],
      visibleCalendarIds: ["calendar-1"],
    });

    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ subject: "Visible reminder" })],
      }),
      true,
    );
  });

  it("keeps snoozed reminders hidden until the snooze time expires", async () => {
    const fixture = createFixture({
      candidates: [createCandidate({ snoozedUntil: "2026-03-30T09:50:00.000Z" })],
    });

    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-03-30T09:50:00.000Z"));
    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).toHaveBeenCalledOnce();
  });

  it("dismisses every active reminder from the aggregated state", async () => {
    const fixture = createFixture({
      candidates: [
        createCandidate(),
        createCandidate({
          dedupeKey: "calendar-1:event-2:2026-03-30T10:15:00.000Z:pre",
          reminderMinutesBeforeStart: 30,
          start: "2026-03-30T10:15:00.000Z",
          subject: "Follow up",
        }),
      ],
    });

    await fixture.service.checkNow();
    fixture.service.dismissAll();

    expect(fixture.db.dismissReminders).toHaveBeenCalledWith([
      "calendar-1:event-1:2026-03-30T10:00:00.000Z:pre",
      "calendar-1:event-2:2026-03-30T10:15:00.000Z:pre",
    ]);
  });

  it("shows a start-time reminder when the event starts", async () => {
    vi.setSystemTime(new Date("2026-03-30T10:00:00.000Z"));
    const fixture = createFixture({
      candidates: [createCandidate({ reminderMinutesBeforeStart: 0, reminderType: "start" })],
    });

    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:start",
            reminderMinutesBeforeStart: 0,
            reminderType: "start",
          }),
        ],
      }),
      true,
    );
  });

  it("keeps snoozed start-time reminders hidden until the snooze time expires", async () => {
    vi.setSystemTime(new Date("2026-03-30T10:00:00.000Z"));
    const fixture = createFixture({
      candidates: [
        createCandidate({
          reminderMinutesBeforeStart: 0,
          reminderType: "start",
          snoozedUntil: "2026-03-30T10:05:00.000Z",
        }),
      ],
    });

    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-03-30T10:05:00.000Z"));
    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            reminderMinutesBeforeStart: 0,
            reminderType: "start",
          }),
        ],
      }),
      true,
    );
  });

  it("uses local reminder rules instead of synced event reminders when override is enabled", async () => {
    vi.setSystemTime(new Date("2026-03-30T09:45:00.000Z"));
    const fixture = createFixture({
      localEvents: [
        {
          calendarId: "calendar-1",
          end: "2026-03-30T10:30:00.000Z",
          id: "event-1",
          isAllDay: false,
          location: "Room 3",
          reminderMinutesBeforeStart: null,
          start: "2026-03-30T10:00:00.000Z",
          subject: "Planning",
        },
      ],
      localReminderOverrideEnabled: true,
      localReminderRules: [
        { minutes: 15, when: "before" },
        { minutes: 10, when: "after" },
      ],
    });

    await fixture.service.checkNow();

    expect(fixture.db.listReminderCandidates).toHaveBeenCalledTimes(0);
    expect(fixture.db.listReminderEventsByStartRange).toHaveBeenCalledWith(
      ["calendar-1"],
      "2026-03-16T09:45:00.000Z",
      "2026-04-13T09:45:00.000Z",
    );
    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:before:15",
            reminderMinutesBeforeStart: 15,
          }),
        ],
      }),
      true,
    );
  });

  it("shows after-start local reminders when they become due", async () => {
    vi.setSystemTime(new Date("2026-03-30T10:10:00.000Z"));

    const fixture = createFixture({
      localEvents: [
        {
          calendarId: "calendar-1",
          end: "2026-03-30T10:30:00.000Z",
          id: "event-1",
          isAllDay: false,
          location: "Room 3",
          reminderMinutesBeforeStart: null,
          start: "2026-03-30T10:00:00.000Z",
          subject: "Planning",
        },
      ],
      localReminderOverrideEnabled: true,
      localReminderRules: [{ minutes: 10, when: "after" }],
    });

    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z:after:10",
            reminderMinutesBeforeStart: 10,
          }),
        ],
      }),
      true,
    );
  });

  it("respects dismissed state for local reminder dedupe keys", async () => {
    const fixture = createFixture({
      localEvents: [
        {
          calendarId: "calendar-1",
          end: "2026-03-30T10:30:00.000Z",
          id: "event-1",
          isAllDay: false,
          location: "Room 3",
          reminderMinutesBeforeStart: null,
          start: "2026-03-30T10:00:00.000Z",
          subject: "Planning",
        },
      ],
      localReminderOverrideEnabled: true,
      localReminderRules: [{ minutes: 15, when: "before" }],
      reminderStateByKey: {
        "calendar-1:event-1:2026-03-30T10:00:00.000Z:before:15": {
          dismissedAt: "2026-03-30T09:44:00.000Z",
          snoozedUntil: null,
        },
      },
    });

    await fixture.service.checkNow();

    expect(fixture.reminderManager.show).not.toHaveBeenCalled();
  });

  it("auto-dismisses and skips stale reminders that would have fired more than 48 hours ago", async () => {
    vi.setSystemTime(new Date("2026-03-30T09:45:00.000Z"));
    const fixture = createFixture({
      candidates: [
        createCandidate({
          start: "2026-03-27T10:00:00.000Z",
          dedupeKey: "calendar-1:event-stale:2026-03-27T10:00:00.000Z:pre",
          subject: "Old meeting",
        }),
      ],
    });

    await fixture.service.checkNow();

    expect(fixture.db.dismissReminders).toHaveBeenCalledWith([
      "calendar-1:event-stale:2026-03-27T10:00:00.000Z:pre",
    ]);
    expect(fixture.reminderManager.show).not.toHaveBeenCalled();
  });

  it("shows reminders that are due within the stale threshold", async () => {
    vi.setSystemTime(new Date("2026-03-30T09:45:00.000Z"));
    const fixture = createFixture({
      candidates: [
        createCandidate({
          start: "2026-03-29T10:00:00.000Z",
          dedupeKey: "calendar-1:event-recent:2026-03-29T10:00:00.000Z:pre",
          subject: "Recent meeting",
        }),
      ],
    });

    await fixture.service.checkNow();

    expect(fixture.db.dismissReminders).not.toHaveBeenCalled();
    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ subject: "Recent meeting" })],
      }),
      true,
    );
  });

  it("auto-dismisses stale reminders under local override rules", async () => {
    vi.setSystemTime(new Date("2026-03-30T09:45:00.000Z"));
    const fixture = createFixture({
      localEvents: [
        {
          calendarId: "calendar-1",
          end: "2026-03-27T10:30:00.000Z",
          id: "event-stale",
          isAllDay: false,
          location: "Room 3",
          reminderMinutesBeforeStart: null,
          start: "2026-03-27T10:00:00.000Z",
          subject: "Old meeting",
        },
      ],
      localReminderOverrideEnabled: true,
      localReminderRules: [{ minutes: 15, when: "before" }],
    });

    await fixture.service.checkNow();

    expect(fixture.db.dismissReminders).toHaveBeenCalledWith([
      "calendar-1:event-stale:2026-03-27T10:00:00.000Z:before:15",
    ]);
    expect(fixture.reminderManager.show).not.toHaveBeenCalled();
  });

  it("does not check reminders when started without an explicit checkNow call", () => {
    const fixture = createFixture({ candidates: [createCandidate()] });

    fixture.service.start();

    expect(fixture.db.listReminderCandidates).not.toHaveBeenCalled();
    expect(fixture.reminderManager.show).not.toHaveBeenCalled();

    fixture.service.stop();
  });
});
