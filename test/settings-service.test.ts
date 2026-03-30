import { createDefaultSettings, userSettingsSchema } from "../src/shared/schemas";
import { describe, expect, it } from "vitest";
import SettingsService from "../src/main/settings/settings-service";

type UserSettings = ReturnType<typeof createDefaultSettings>;

interface SettingsFixture {
  readSettings: () => UserSettings;
  service: SettingsService;
}

function createSettingsFixture(visibleCalendarIds: string[]): SettingsFixture {
  let settings = userSettingsSchema.parse({
    ...createDefaultSettings(),
    visibleCalendarIds,
  });

  const db = {
    getSettings: () => settings,
    saveSettings: (nextSettings: UserSettings) => {
      settings = userSettingsSchema.parse(nextSettings);
    },
  };

  return {
    readSettings: () => settings,
    service: new SettingsService(db),
  };
}

describe("settings service", () => {
  it("keeps user-hidden calendars hidden across sync", () => {
    const fixture = createSettingsFixture(["calendar-a"]);

    fixture.service.syncVisibleCalendars({
      calendarIds: ["calendar-a", "calendar-b"],
      knownCalendarIds: ["calendar-a", "calendar-b"],
    });

    expect(fixture.readSettings().visibleCalendarIds).toEqual(["calendar-a"]);
  });

  it("preserves visible calendars from other accounts", () => {
    const fixture = createSettingsFixture(["calendar-a", "calendar-b"]);

    fixture.service.syncVisibleCalendars({
      calendarIds: ["calendar-a", "calendar-c"],
      knownCalendarIds: ["calendar-a"],
    });

    expect(fixture.readSettings().visibleCalendarIds).toEqual([
      "calendar-a",
      "calendar-b",
      "calendar-c",
    ]);
  });

  it("shows newly discovered calendars by default", () => {
    const fixture = createSettingsFixture(["calendar-a"]);

    fixture.service.syncVisibleCalendars({
      calendarIds: ["calendar-a", "calendar-b"],
      knownCalendarIds: ["calendar-a"],
    });

    expect(fixture.readSettings().visibleCalendarIds).toEqual(["calendar-a", "calendar-b"]);
  });

  it("removes deleted calendars from visible settings", () => {
    const fixture = createSettingsFixture(["calendar-a", "calendar-b"]);

    fixture.service.syncVisibleCalendars({
      calendarIds: ["calendar-a"],
      knownCalendarIds: ["calendar-a", "calendar-b"],
    });

    expect(fixture.readSettings().visibleCalendarIds).toEqual(["calendar-a"]);
  });

  it("marks all calendars visible on first sync", () => {
    const fixture = createSettingsFixture([]);

    fixture.service.syncVisibleCalendars({
      calendarIds: ["calendar-a", "calendar-b"],
      knownCalendarIds: [],
    });

    expect(fixture.readSettings().visibleCalendarIds).toEqual(["calendar-a", "calendar-b"]);
  });

  it("persists the auto sync interval", () => {
    const fixture = createSettingsFixture([]);

    fixture.service.updateSettings({ syncIntervalMinutes: 30 });

    expect(fixture.readSettings().syncIntervalMinutes).toBe(30);
  });

  it("persists local reminder override rules", () => {
    const fixture = createSettingsFixture([]);

    fixture.service.updateSettings({
      localReminderOverrideEnabled: true,
      localReminderRules: [
        { minutes: 20, when: "before" },
        { minutes: 10, when: "after" },
      ],
    });

    expect(fixture.readSettings()).toMatchObject({ localReminderOverrideEnabled: true });
    expect(fixture.readSettings().localReminderRules).toEqual([
      { minutes: 20, when: "before" },
      { minutes: 10, when: "after" },
    ]);
  });
});
