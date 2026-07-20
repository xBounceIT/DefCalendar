import {
  appUpdateStatusSchema,
  attachmentUploadSchema,
  calendarSummarySchema,
  createDefaultSettings,
  eventDraftSchema,
  userSettingsPatchSchema,
  userSettingsSchema,
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
    expect(defaults.language).toBe("system");
    expect(defaults.timeFormat).toBe("system");
    expect(defaults.syncIntervalMinutes).toBe(1);
    expect(defaults).toMatchObject({ localReminderOverrideEnabled: false });
    expect(defaults.localReminderRules).toStrictEqual([{ minutes: 15, when: "before" }]);
    expect(defaults.newEventPopupEnabled).toBe(false);
    expect(defaults.systemInviteNotificationsEnabled).toBe(false);
    expect(defaults.taskbarInviteNotificationsEnabled).toBe(true);
    expect(defaults.visibleCalendarIds).toStrictEqual([]);
  });

  it("defaults invite notification settings for legacy settings", () => {
    const legacySettings: Record<string, unknown> = { ...createDefaultSettings() };
    delete legacySettings.systemInviteNotificationsEnabled;
    delete legacySettings.taskbarInviteNotificationsEnabled;

    const settings = userSettingsSchema.parse(legacySettings);

    expect(settings.systemInviteNotificationsEnabled).toBe(false);
    expect(settings.taskbarInviteNotificationsEnabled).toBe(true);
  });

  it("defaults theme for legacy settings", () => {
    const legacySettings: Record<string, unknown> = { ...createDefaultSettings() };
    delete legacySettings.theme;

    const settings = userSettingsSchema.parse(legacySettings);

    expect(settings.theme).toBe("system");
  });

  it("preserves explicit theme patch values", () => {
    const patch = userSettingsPatchSchema.parse({ theme: "dark" });

    expect(patch).toStrictEqual({ theme: "dark" });
  });

  it("does not inject defaults into sparse settings patches", () => {
    const patch = userSettingsPatchSchema.parse({ activeView: "timeGridDay" });

    expect(patch).toStrictEqual({ activeView: "timeGridDay" });
  });

  it("preserves explicit invite notification patch values", () => {
    const enabledPatch = userSettingsPatchSchema.parse({
      systemInviteNotificationsEnabled: true,
    });
    const disabledPatch = userSettingsPatchSchema.parse({
      systemInviteNotificationsEnabled: false,
      taskbarInviteNotificationsEnabled: false,
    });

    expect(enabledPatch.systemInviteNotificationsEnabled).toBe(true);
    expect(disabledPatch.systemInviteNotificationsEnabled).toBe(false);
    expect(disabledPatch.taskbarInviteNotificationsEnabled).toBe(false);
  });

  it("accepts calendar summaries with account ownership", () => {
    const calendar = calendarSummarySchema.parse({
      canEdit: true,
      canShare: false,
      color: "#5b7cfa",
      homeAccountId: "account-1",
      id: "calendar-1",
      isDefaultCalendar: true,
      isVisible: true,
      name: "Primary",
      ownerAddress: "user@example.com",
      ownerName: "Test User",
    });

    expect(calendar.homeAccountId).toBe("account-1");
  });

  it("rejects attachment uploads when decoded content reaches three megabytes", () => {
    expect.hasAssertions();
    expect(() =>
      attachmentUploadSchema.parse({
        contentBytes: "A".repeat(4 * 1024 * 1024),
        contentType: "application/octet-stream",
        name: "large.bin",
        size: 1,
      }),
    ).toThrow(/3 MB/);
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
