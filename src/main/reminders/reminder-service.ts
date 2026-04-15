import type AppDatabase from "@main/db/database";
import type ReminderWindowManager from "@main/reminders/reminder-window";
import type SettingsService from "@main/settings/settings-service";
import { app, powerMonitor } from "@main/electron-runtime";
import { resolveMainLocale } from "@main/i18n";
import type { ReminderDialogItem, ReminderDialogState } from "@shared/ipc";
import type { LocalReminderRule, UserSettings } from "@shared/schemas";
import { REMINDER_TYPE } from "@shared/schema-values";
import { MINUTE_MS, DAY_MS } from "@shared/duration";

type ReminderCheckTrigger = "startup" | "tick";

const MAX_REMINDER_MINUTES = 20_160;
const REMINDER_REFRESH_INTERVAL_MS = MINUTE_MS;
const REMINDER_STATE_RETENTION_DAYS = 30;
const STALE_REMINDER_THRESHOLD_MS = 2 * DAY_MS;

interface ReminderEvaluation {
  nextCheckAt: null | number;
  state: ReminderDialogState;
}

interface DueReminderEntry {
  dueAt: number;
  item: ReminderDialogItem;
}

interface ReminderComputation {
  dueItems: DueReminderEntry[];
  nextCheckAt: null | number;
  staleKeys: string[];
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
    void this.checkNow("startup");
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
    this.db.dismissReminders(this.state.items.map((item) => item.dedupeKey));

    void this.checkNow();
  }

  snooze(dedupeKey: string, minutes: number): void {
    this.db.snoozeReminder(dedupeKey, new Date(Date.now() + minutes * MINUTE_MS).toISOString());
    void this.checkNow();
  }

  async checkNow(trigger: ReminderCheckTrigger = "tick"): Promise<void> {
    const now = Date.now();
    const previousState = this.state;
    const evaluation = this.evaluate(now, trigger);
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
      new Date(now - REMINDER_STATE_RETENTION_DAYS * DAY_MS).toISOString(),
    );
    this.db.pruneNotificationState(
      new Date(now - REMINDER_STATE_RETENTION_DAYS * DAY_MS).toISOString(),
    );
  }

  private evaluate(now: number, trigger: ReminderCheckTrigger): ReminderEvaluation {
    const settings = this.settings.getSettings();
    const computation = settings.localReminderOverrideEnabled
      ? this.evaluateWithLocalReminderRules(
          now,
          settings.visibleCalendarIds,
          settings.localReminderRules,
          trigger,
        )
      : this.evaluateWithSyncedReminderSettings(now, settings.visibleCalendarIds, trigger);

    if (computation.staleKeys.length > 0) {
      this.db.dismissReminders(computation.staleKeys);
    }

    return this.toReminderEvaluation(now, computation, settings);
  }

  private evaluateWithSyncedReminderSettings(
    now: number,
    visibleCalendarIds: string[],
    trigger: ReminderCheckTrigger,
  ): ReminderComputation {
    const dueItems: DueReminderEntry[] = [];
    let nextCheckAt: null | number = null;
    const schedulingHorizon = now + MAX_REMINDER_MINUTES * MINUTE_MS;
    const windowStart = new Date(now - STALE_REMINDER_THRESHOLD_MS).toISOString();
    const candidates = this.db.listReminderCandidates(
      visibleCalendarIds,
      windowStart,
      new Date(schedulingHorizon).toISOString(),
    );
    const staleKeys: string[] = [];

    for (const candidate of candidates) {
      if (candidate.dismissedAt) {
        continue;
      }

      const reminderMinutes = candidate.event.reminderMinutesBeforeStart;
      if (reminderMinutes === null) {
        continue;
      }

      const eventStart = new Date(candidate.event.start).getTime();
      if (Number.isNaN(eventStart)) {
        continue;
      }

      const reminderAt =
        candidate.reminderType === REMINDER_TYPE.START
          ? eventStart
          : eventStart - reminderMinutes * MINUTE_MS;

      const snoozedUntil = candidate.snoozedUntil
        ? new Date(candidate.snoozedUntil).getTime()
        : null;
      const dueAt = snoozedUntil !== null && snoozedUntil > reminderAt ? snoozedUntil : reminderAt;

      if (
        trigger === "startup" &&
        eventStart < now &&
        (snoozedUntil === null || snoozedUntil <= now)
      ) {
        staleKeys.push(candidate.dedupeKey);
        continue;
      }
      if (dueAt < now - STALE_REMINDER_THRESHOLD_MS) {
        staleKeys.push(candidate.dedupeKey);
        continue;
      }
      if (dueAt <= now) {
        dueItems.push({
          dueAt,
          item: {
            dedupeKey: candidate.dedupeKey,
            end: candidate.event.end,
            isAllDay: candidate.event.isAllDay,
            location: candidate.event.location,
            onlineMeeting: candidate.event.onlineMeeting ?? null,
            reminderMinutesBeforeStart: reminderMinutes,
            reminderType: candidate.reminderType,
            start: candidate.event.start,
            subject: candidate.event.subject,
          },
        });
        continue;
      }

      const nextDueAt = Math.min(dueAt, schedulingHorizon);

      if (nextCheckAt === null || nextDueAt < nextCheckAt) {
        nextCheckAt = nextDueAt;
      }
    }

    return {
      dueItems,
      nextCheckAt,
      staleKeys,
    };
  }

  private evaluateWithLocalReminderRules(
    now: number,
    visibleCalendarIds: string[],
    localReminderRules: LocalReminderRule[],
    trigger: ReminderCheckTrigger,
  ): ReminderComputation {
    const dueItems: DueReminderEntry[] = [];
    let nextCheckAt: null | number = null;
    const schedulingHorizon = now + MAX_REMINDER_MINUTES * MINUTE_MS;

    let maxBeforeMinutes = 0;
    let maxAfterMinutes = 0;
    for (const rule of localReminderRules) {
      if (rule.when === "after") {
        maxAfterMinutes = Math.max(maxAfterMinutes, rule.minutes);
      } else {
        maxBeforeMinutes = Math.max(maxBeforeMinutes, rule.minutes);
      }
    }

    const lookbackMinutes = Math.max(
      maxBeforeMinutes > 0 ? MAX_REMINDER_MINUTES : maxAfterMinutes,
      STALE_REMINDER_THRESHOLD_MS / MINUTE_MS + maxAfterMinutes,
    );
    const events = this.db.listReminderEventsByStartRange(
      visibleCalendarIds,
      new Date(now - lookbackMinutes * MINUTE_MS).toISOString(),
      new Date(schedulingHorizon).toISOString(),
    );

    const staleKeys: string[] = [];

    const validEvents: {
      event: (typeof events)[number];
      eventStart: number;
      ruleKeys: Map<LocalReminderRule, string>;
      startKey: string;
    }[] = [];
    const allDedupeKeys: string[] = [];
    for (const event of events) {
      const eventStart = new Date(event.start).getTime();
      if (Number.isNaN(eventStart)) {
        continue;
      }
      const ruleKeys = new Map<LocalReminderRule, string>();
      for (const rule of localReminderRules) {
        const key = this.createLocalReminderDedupeKey(
          event.calendarId,
          event.id,
          event.start,
          rule,
        );
        ruleKeys.set(rule, key);
        allDedupeKeys.push(key);
      }
      const startKey = this.createStartReminderDedupeKey(event.calendarId, event.id, event.start);
      allDedupeKeys.push(startKey);
      validEvents.push({ event, eventStart, ruleKeys, startKey });
    }
    const stateMap = this.db.getReminderStates(allDedupeKeys);

    for (const { event, eventStart, ruleKeys, startKey } of validEvents) {
      for (const rule of localReminderRules) {
        const reminderAt =
          rule.when === "before"
            ? eventStart - rule.minutes * MINUTE_MS
            : eventStart + rule.minutes * MINUTE_MS;
        const dedupeKey = ruleKeys.get(rule)!;
        const reminderState = stateMap.get(dedupeKey) ?? null;

        if (reminderState?.dismissedAt) {
          continue;
        }

        const snoozedUntil = reminderState?.snoozedUntil
          ? new Date(reminderState.snoozedUntil).getTime()
          : null;
        const dueAt =
          snoozedUntil !== null && snoozedUntil > reminderAt ? snoozedUntil : reminderAt;

        const startupStaleTime = rule.when === "after" ? reminderAt : eventStart;
        if (
          trigger === "startup" &&
          startupStaleTime < now &&
          (snoozedUntil === null || snoozedUntil <= now)
        ) {
          staleKeys.push(dedupeKey);
          continue;
        }

        if (dueAt < now - STALE_REMINDER_THRESHOLD_MS) {
          staleKeys.push(dedupeKey);
          continue;
        }
        if (dueAt <= now) {
          dueItems.push({
            dueAt,
            item: {
              dedupeKey,
              end: event.end,
              isAllDay: event.isAllDay,
              location: event.location,
              onlineMeeting: event.onlineMeeting ?? null,
              reminderMinutesBeforeStart: rule.minutes,
              start: event.start,
              subject: event.subject,
            },
          });
          continue;
        }

        const nextDueAt = Math.min(dueAt, schedulingHorizon);

        if (nextCheckAt === null || nextDueAt < nextCheckAt) {
          nextCheckAt = nextDueAt;
        }
      }

      const startState = stateMap.get(startKey) ?? null;
      if (!startState?.dismissedAt) {
        const startSnoozedUntil = startState?.snoozedUntil
          ? new Date(startState.snoozedUntil).getTime()
          : null;
        const startDueAt =
          startSnoozedUntil !== null && startSnoozedUntil > eventStart
            ? startSnoozedUntil
            : eventStart;

        if (
          trigger === "startup" &&
          eventStart < now &&
          (startSnoozedUntil === null || startSnoozedUntil <= now)
        ) {
          staleKeys.push(startKey);
        } else if (startDueAt < now - STALE_REMINDER_THRESHOLD_MS) {
          staleKeys.push(startKey);
        } else if (startDueAt <= now) {
          dueItems.push({
            dueAt: startDueAt,
            item: {
              dedupeKey: startKey,
              end: event.end,
              isAllDay: event.isAllDay,
              location: event.location,
              onlineMeeting: event.onlineMeeting ?? null,
              reminderMinutesBeforeStart: 0,
              reminderType: REMINDER_TYPE.START,
              start: event.start,
              subject: event.subject,
            },
          });
        } else {
          const nextDueAt = Math.min(startDueAt, schedulingHorizon);
          if (nextCheckAt === null || nextDueAt < nextCheckAt) {
            nextCheckAt = nextDueAt;
          }
        }
      }
    }

    return {
      dueItems,
      nextCheckAt,
      staleKeys,
    };
  }

  private toReminderEvaluation(
    now: number,
    computation: ReminderComputation,
    settings: Pick<UserSettings, "language" | "timeFormat">,
  ): ReminderEvaluation {
    const dueItems = [...computation.dueItems];
    let nextCheckAt = computation.nextCheckAt;

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

  private createLocalReminderDedupeKey(
    calendarId: string,
    eventId: string,
    eventStart: string,
    rule: LocalReminderRule,
  ): string {
    return `${calendarId}:${eventId}:${eventStart}:${rule.when}:${rule.minutes}`;
  }

  private createStartReminderDedupeKey(
    calendarId: string,
    eventId: string,
    eventStart: string,
  ): string {
    return `${calendarId}:${eventId}:${eventStart}:${REMINDER_TYPE.START}`;
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

export type { ReminderCheckTrigger };
export default ReminderService;
