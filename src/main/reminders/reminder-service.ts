import type AppDatabase from "@main/db/database";
import type ReminderWindowManager from "@main/reminders/reminder-window";
import type SettingsService from "@main/settings/settings-service";
import { app, powerMonitor } from "@main/electron-runtime";
import { resolveMainLocale } from "@main/i18n";
import type { ReminderDialogItem, ReminderDialogState } from "@shared/ipc";

const MAX_REMINDER_MINUTES = 20_160;
const REMINDER_REFRESH_INTERVAL_MS = 60_000;
const REMINDER_STATE_RETENTION_DAYS = 30;

interface ReminderEvaluation {
  nextCheckAt: null | number;
  state: ReminderDialogState;
}

interface DueReminderEntry {
  dueAt: number;
  item: ReminderDialogItem;
}

class ReminderService {
  private readonly db: AppDatabase;
  private readonly reminderManager: ReminderWindowManager;
  private readonly settings: SettingsService;
  private readonly listeners = new Set<(state: ReminderDialogState) => void>();
  private timer: NodeJS.Timeout | null = null;
  private state: ReminderDialogState = {
    items: [],
    locale: "en",
    timeFormat: "system",
  };
  private started = false;

  private readonly handlePowerResume = () => {
    void this.checkNow();
  };

  constructor(db: AppDatabase, reminderManager: ReminderWindowManager, settings: SettingsService) {
    this.db = db;
    this.reminderManager = reminderManager;
    this.settings = settings;
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    powerMonitor.on("resume", this.handlePowerResume);
    powerMonitor.on("unlock-screen", this.handlePowerResume);
    void this.checkNow();
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    powerMonitor.removeListener("resume", this.handlePowerResume);
    powerMonitor.removeListener("unlock-screen", this.handlePowerResume);
  }

  getState(): ReminderDialogState {
    return this.state;
  }

  onState(listener: (state: ReminderDialogState) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  dismiss(dedupeKey: string): void {
    this.db.dismissReminder(dedupeKey);
    void this.checkNow();
  }

  dismissAll(): void {
    for (const item of this.state.items) {
      this.db.dismissReminder(item.dedupeKey);
    }

    void this.checkNow();
  }

  snooze(dedupeKey: string, minutes: number): void {
    this.db.snoozeReminder(dedupeKey, new Date(Date.now() + minutes * 60_000).toISOString());
    void this.checkNow();
  }

  async checkNow(): Promise<void> {
    const now = Date.now();
    const previousState = this.state;
    const evaluation = this.evaluate(now);
    const hasNewDueItems = evaluation.state.items.some(
      (item) =>
        !previousState.items.some((previousItem) => previousItem.dedupeKey === item.dedupeKey),
    );
    const stateChanged = JSON.stringify(previousState) !== JSON.stringify(evaluation.state);

    this.state = evaluation.state;
    if (stateChanged) {
      for (const listener of this.listeners) {
        listener(this.state);
      }
    }

    if (this.state.items.length === 0) {
      this.reminderManager.close();
    } else if (stateChanged || !this.reminderManager.hasWindow()) {
      this.reminderManager.show(this.state, hasNewDueItems || !this.reminderManager.hasWindow());
    }

    this.scheduleNextCheck(evaluation.nextCheckAt, now);
    this.db.pruneReminderState(
      new Date(now - REMINDER_STATE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
    this.db.pruneNotificationState(
      new Date(now - REMINDER_STATE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
  }

  private evaluate(now: number): ReminderEvaluation {
    const settings = this.settings.getSettings();
    const dueItems: DueReminderEntry[] = [];
    let nextCheckAt: null | number = null;
    const candidates = this.db.listReminderCandidates(
      settings.visibleCalendarIds,
      new Date(now + MAX_REMINDER_MINUTES * 60_000).toISOString(),
    );

    for (const candidate of candidates) {
      if (candidate.dismissedAt) {
        continue;
      }

      const reminderMinutes = candidate.event.reminderMinutesBeforeStart;
      if (reminderMinutes === null) {
        continue;
      }

      const reminderAt = new Date(candidate.event.start).getTime() - reminderMinutes * 60_000;
      if (Number.isNaN(reminderAt)) {
        continue;
      }

      const snoozedUntil = candidate.snoozedUntil
        ? new Date(candidate.snoozedUntil).getTime()
        : null;
      const dueAt = snoozedUntil !== null && snoozedUntil > reminderAt ? snoozedUntil : reminderAt;
      if (dueAt <= now) {
        dueItems.push({
          dueAt,
          item: {
            dedupeKey: candidate.dedupeKey,
            end: candidate.event.end,
            isAllDay: candidate.event.isAllDay,
            location: candidate.event.location,
            reminderMinutesBeforeStart: reminderMinutes,
            start: candidate.event.start,
            subject: candidate.event.subject,
          },
        });
        continue;
      }

      if (nextCheckAt === null || dueAt < nextCheckAt) {
        nextCheckAt = dueAt;
      }
    }

    dueItems.sort((left, right) => {
      if (left.dueAt !== right.dueAt) {
        return left.dueAt - right.dueAt;
      }

      const startDifference =
        new Date(left.item.start).getTime() - new Date(right.item.start).getTime();
      if (startDifference !== 0) {
        return startDifference;
      }

      return left.item.subject.localeCompare(right.item.subject);
    });

    if (dueItems.length > 0) {
      const refreshAt = now + REMINDER_REFRESH_INTERVAL_MS;
      if (nextCheckAt === null || refreshAt < nextCheckAt) {
        nextCheckAt = refreshAt;
      }
    }

    return {
      nextCheckAt,
      state: {
        items: dueItems.map((entry) => entry.item),
        locale: resolveMainLocale(settings.language, app.getLocale()),
        timeFormat: settings.timeFormat,
      },
    };
  }

  private scheduleNextCheck(nextCheckAt: null | number, now: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.started || nextCheckAt === null) {
      return;
    }

    const delay = Math.max(0, nextCheckAt - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.checkNow();
    }, delay);
  }
}

export default ReminderService;
