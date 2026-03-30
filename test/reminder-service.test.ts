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
  snoozedUntil?: null | string;
  start?: string;
  subject?: string;
}) {
  const calendarId = overrides?.calendarId ?? "calendar-1";
  const start = overrides?.start ?? "2026-03-30T10:00:00.000Z";

  return {
    dedupeKey: overrides?.dedupeKey ?? `${calendarId}:event-1:${start}`,
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
    snoozedUntil: overrides?.snoozedUntil ?? null,
  };
}

function createFixture(args?: {
  candidates?: ReturnType<typeof createCandidate>[];
  hasWindow?: boolean;
  visibleCalendarIds?: string[];
}) {
  const candidates = args?.candidates ?? [];
  const db = {
    dismissReminder: vi.fn(),
    listReminderCandidates: vi
      .fn()
      .mockImplementation((visibleCalendarIds: string[]) =>
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
      "2026-04-13T09:45:00.000Z",
    );
    expect(fixture.reminderManager.show).toHaveBeenCalledWith(
      {
        items: [
          {
            dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z",
            end: "2026-03-30T10:30:00.000Z",
            isAllDay: false,
            location: "Room 3",
            reminderMinutesBeforeStart: 15,
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

    expect(fixture.reminderManager.show).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(fixture.reminderManager.show).toHaveBeenCalledOnce();
    expect(fixture.reminderManager.show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ dedupeKey: "calendar-1:event-1:2026-03-30T10:00:00.000Z" }),
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
          dedupeKey: "calendar-1:event-2:2026-03-30T10:15:00.000Z",
          reminderMinutesBeforeStart: 30,
          start: "2026-03-30T10:15:00.000Z",
          subject: "Follow up",
        }),
      ],
    });

    await fixture.service.checkNow();
    fixture.service.dismissAll();

    expect(fixture.db.dismissReminder).toHaveBeenNthCalledWith(
      1,
      "calendar-1:event-1:2026-03-30T10:00:00.000Z",
    );
    expect(fixture.db.dismissReminder).toHaveBeenNthCalledWith(
      2,
      "calendar-1:event-2:2026-03-30T10:15:00.000Z",
    );
  });
});
