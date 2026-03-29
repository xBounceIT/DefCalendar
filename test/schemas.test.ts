import {
  appUpdateStatusSchema,
  createDefaultSettings,
  eventDraftSchema,
} from "../src/shared/schemas";
import { describe, expect, it } from "vitest";

describe("shared schemas", () => {
  it("accepts a valid event draft", () => {
    const draft = eventDraftSchema.parse({
      calendarId: "calendar-1",
      subject: "Weekly planning",
      body: "Agenda",
      location: "Room 3",
      start: "2026-03-27T09:00:00.000Z",
      end: "2026-03-27T10:00:00.000Z",
      timeZone: "Europe/Rome",
      isAllDay: false,
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
    });

    expect(draft.subject).toBe("Weekly planning");
  });

  it("rejects drafts where the end precedes the start", () => {
    expect(() =>
      eventDraftSchema.parse({
        calendarId: "calendar-1",
        subject: "Broken event",
        start: "2026-03-27T11:00:00.000Z",
        end: "2026-03-27T10:00:00.000Z",
        timeZone: "Europe/Rome",
        isAllDay: false,
        isReminderOn: true,
      }),
    ).toThrow(/end/i);
  });

  it("creates stable default settings", () => {
    const defaults = createDefaultSettings();

    expect(defaults.activeView).toBe("timeGridWeek");
    expect(defaults.visibleCalendarIds).toEqual([]);
  });

  it("accepts a valid app update status payload", () => {
    const status = appUpdateStatusSchema.parse({
      checkedAt: "2026-03-28T09:30:00.000Z",
      currentVersion: "0.1.0",
      downloadPercent: 64.5,
      error: null,
      latestVersion: "0.2.0",
      releaseNotes: "Fix stability issues",
      state: "downloading",
    });

    expect(status.state).toBe("downloading");
  });

  it("rejects app update status with invalid percent", () => {
    expect(() =>
      appUpdateStatusSchema.parse({
        checkedAt: "2026-03-28T09:30:00.000Z",
        currentVersion: "0.1.0",
        downloadPercent: 122,
        error: null,
        latestVersion: "0.2.0",
        releaseNotes: null,
        state: "downloading",
      }),
    ).toThrow(/100/);
  });
});
