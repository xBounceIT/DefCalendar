import {
  appUpdateStatusSchema,
  attachmentUploadSchema,
  createDefaultSettings,
  eventDraftSchema,
  userSettingsPatchSchema,
  userSettingsSchema,
} from "../src/shared/schemas";
import { describe, expect, it } from "vitest";

describe("shared schemas", () => {
  it("enables English and Italian when migrating legacy settings", () => {
    expect.hasAssertions();
    const legacy: Record<string, unknown> = { ...createDefaultSettings() };
    delete legacy.spellcheckEnabled;
    delete legacy.spellcheckLanguages;
    delete legacy.spellcheckOnboardingSeen;
    expect(userSettingsSchema.parse(legacy)).toMatchObject({
      spellcheckEnabled: true,
      spellcheckLanguages: ["en-US", "it"],
      spellcheckOnboardingSeen: false,
    });
  });

  it("preserves disabled spelling and an empty dictionary selection", () => {
    expect.hasAssertions();
    expect(
      userSettingsPatchSchema.parse({ spellcheckEnabled: false, spellcheckLanguages: [] }),
    ).toStrictEqual({ spellcheckEnabled: false, spellcheckLanguages: [] });
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
    const darkPatch = userSettingsPatchSchema.parse({ theme: "dark" });
    const navyPatch = userSettingsPatchSchema.parse({ theme: "blue-navy" });

    expect(darkPatch).toStrictEqual({ theme: "dark" });
    expect(navyPatch).toStrictEqual({ theme: "blue-navy" });
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

  it("rejects app update status with invalid percent", () => {
    expect(() =>
      appUpdateStatusSchema.parse({
        checkedAt: "2026-03-28T09:30:00.000Z",
        manualInstall: false,
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
