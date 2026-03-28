import type { UserSettings, UserSettingsPatch } from "@shared/schemas";
import { createDefaultSettings, userSettingsSchema } from "@shared/schema-values";
import type AppDatabase from "@main/db/database";

interface SyncVisibleCalendarsArgs {
  calendarIds: string[];
  knownCalendarIds: string[];
}

type SettingsStore = Pick<AppDatabase, "getSettings" | "saveSettings">;

class SettingsService {
  private readonly db: SettingsStore;

  constructor(db: SettingsStore) {
    this.db = db;
  }

  getSettings(): UserSettings {
    return this.db.getSettings();
  }

  updateSettings(patch: UserSettingsPatch): UserSettings {
    const current = this.db.getSettings();
    const next = userSettingsSchema.parse({
      ...current,
      ...patch,
    });

    this.db.saveSettings(next);
    return next;
  }

  syncVisibleCalendars({ calendarIds, knownCalendarIds }: SyncVisibleCalendarsArgs): UserSettings {
    const current = this.safeCurrentSettings();
    const nextCalendarIds = new Set(calendarIds);
    const knownCalendarIdSet = new Set(knownCalendarIds);
    const nextVisibleCalendarIds: string[] = [];
    const visibleCalendarIdSet = new Set<string>();

    for (const calendarId of current.visibleCalendarIds) {
      if (nextCalendarIds.has(calendarId) && !visibleCalendarIdSet.has(calendarId)) {
        nextVisibleCalendarIds.push(calendarId);
        visibleCalendarIdSet.add(calendarId);
      }
    }

    for (const calendarId of calendarIds) {
      if (!knownCalendarIdSet.has(calendarId) && !visibleCalendarIdSet.has(calendarId)) {
        nextVisibleCalendarIds.push(calendarId);
        visibleCalendarIdSet.add(calendarId);
      }
    }

    const next = userSettingsSchema.parse({
      ...current,
      visibleCalendarIds: nextVisibleCalendarIds,
    });

    this.db.saveSettings(next);
    return next;
  }

  setCalendarVisibility(calendarId: string, isVisible: boolean): UserSettings {
    const current = this.safeCurrentSettings();
    const visible = new Set(current.visibleCalendarIds);

    if (isVisible) {
      visible.add(calendarId);
    } else {
      visible.delete(calendarId);
    }

    const next = userSettingsSchema.parse({
      ...current,
      visibleCalendarIds: [...visible],
    });

    this.db.saveSettings(next);
    return next;
  }

  private safeCurrentSettings(): UserSettings {
    try {
      return this.db.getSettings();
    } catch {
      const defaults = createDefaultSettings();
      this.db.saveSettings(defaults);
      return defaults;
    }
  }
}

export default SettingsService;
