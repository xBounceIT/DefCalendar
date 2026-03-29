import type { AppConfig } from "@main/config";
import type AppDatabase from "@main/db/database";
import type GraphCalendarService from "@main/graph/calendar-service";
import type MsalAuthService from "@main/auth/msal-auth-service";
import type ReminderService from "@main/reminders/reminder-service";
import type SettingsService from "@main/settings/settings-service";
import type { SyncStatus } from "@shared/schemas";

type SyncReason = "startup" | "sign-in" | "switch-account" | "manual" | "interval" | "mutation";

interface SyncServiceDependencies {
  auth: MsalAuthService;
  config: AppConfig;
  db: AppDatabase;
  graph: GraphCalendarService;
  reminders: ReminderService;
  settings: SettingsService;
}

class SyncService {
  private readonly dependencies: SyncServiceDependencies;
  private readonly intervalMs: number;
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<SyncStatus> | null = null;
  private status: SyncStatus;

  constructor(dependencies: SyncServiceDependencies) {
    this.dependencies = dependencies;
    this.intervalMs = dependencies.config.syncIntervalMinutes * 60_000;
    this.status = dependencies.db.getLatestSyncStatus();
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.syncAll("interval");
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset(): void {
    this.setStatus({
      lastSyncedAt: null,
      message: "Sign in to sync Exchange 365.",
      messageKey: "sync.signInToSync",
      counts: null,
      state: "idle",
    });
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  onStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async syncAll(reason: SyncReason): Promise<SyncStatus> {
    if (this.inFlight) {
      return this.inFlight;
    }

    const nextSync = this.runSync(reason);
    this.inFlight = nextSync;

    try {
      return await nextSync;
    } finally {
      if (this.inFlight === nextSync) {
        this.inFlight = null;
      }
    }
  }

  private async runSync(reason: SyncReason): Promise<SyncStatus> {
    if (!this.dependencies.auth.hasSession()) {
      const idleStatus = {
        lastSyncedAt: this.status.lastSyncedAt,
        message: "Sign in to sync Exchange 365.",
        messageKey: "sync.signInToSync",
        counts: null,
        state: "idle" as const,
      };
      this.setStatus(idleStatus);
      return idleStatus;
    }

    const homeAccountId = this.dependencies.auth.getActiveAccountId();
    let syncMessage = "Syncing Exchange 365…";
    let syncMessageKey = "sync.syncing";
    if (reason === "sign-in" || reason === "switch-account") {
      syncMessage = "Connecting to Exchange 365…";
      syncMessageKey = "sync.connecting";
    }

    this.setStatus({
      lastSyncedAt: this.status.lastSyncedAt,
      message: syncMessage,
      messageKey: syncMessageKey,
      counts: null,
      state: "syncing",
    });

    try {
      const knownCalendarIds = this.dependencies.db.listCalendarIds(homeAccountId ?? undefined);
      const calendars = await this.dependencies.graph.listCalendars();
      this.dependencies.db.upsertCalendars(calendars, homeAccountId ?? "");
      const settings = this.dependencies.settings.syncVisibleCalendars({
        calendarIds: calendars.map((calendar) => calendar.id),
        knownCalendarIds,
      });

      if (reason === "sign-in") {
        const nextStatus: SyncStatus = {
          lastSyncedAt: this.status.lastSyncedAt,
          message: "Choose calendars to sync.",
          messageKey: "sync.chooseCalendars",
          counts: null,
          state: "idle",
        };
        this.setStatus(nextStatus);
        return nextStatus;
      }

      const visibleCalendarIdSet = new Set(settings.visibleCalendarIds);
      const calendarsToSync = calendars.filter((calendar) => visibleCalendarIdSet.has(calendar.id));
      if (calendarsToSync.length === 0) {
        const nextStatus: SyncStatus = {
          lastSyncedAt: this.status.lastSyncedAt,
          message: "Select at least one calendar to sync.",
          messageKey: "sync.selectCalendars",
          counts: null,
          state: "idle",
        };
        this.setStatus(nextStatus);
        return nextStatus;
      }

      const rangeStart = new Date(
        Date.now() - this.dependencies.config.syncLookBehindDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const rangeEnd = new Date(
        Date.now() + this.dependencies.config.syncLookAheadDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const finishedAt = new Date().toISOString();

      const syncedCalendars = await Promise.all(
        calendarsToSync.map(async (calendar) => ({
          calendarId: calendar.id,
          events: await this.dependencies.graph.listCalendarView(calendar.id, rangeStart, rangeEnd),
        })),
      );

      for (const syncedCalendar of syncedCalendars) {
        this.dependencies.db.replaceEventsForCalendarRange({
          calendarId: syncedCalendar.calendarId,
          events: syncedCalendar.events,
          rangeEnd,
          rangeStart,
        });
        this.dependencies.db.saveSyncState({
          calendarId: syncedCalendar.calendarId,
          errorMessage: null,
          lastSyncedAt: finishedAt,
          rangeEnd,
          rangeStart,
        });
      }

      await this.dependencies.reminders.checkNow();

      const totalEvents = syncedCalendars.reduce((sum, sc) => sum + sc.events.length, 0);

      let calendarSuffix = "s";
      if (calendarsToSync.length === 1) {
        calendarSuffix = "";
      }
      let eventSuffix = "s";
      if (totalEvents === 1) {
        eventSuffix = "";
      }
      const nextStatus: SyncStatus = {
        lastSyncedAt: finishedAt,
        message: `Synced ${calendarsToSync.length} calendar${calendarSuffix}, ${totalEvents} event${eventSuffix}.`,
        messageKey: "sync.synced",
        counts: {
          calendars: calendarsToSync.length,
          events: totalEvents,
        },
        state: "idle",
      };
      this.setStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      let errorMessage = "Exchange 365 sync failed.";
      let messageKey: null | string = "sync.syncFailed";
      if (error instanceof Error) {
        const { message } = error;
        errorMessage = message;
        if (message !== "Exchange 365 sync failed.") {
          messageKey = null;
        }
      }

      const nextStatus: SyncStatus = {
        lastSyncedAt: this.status.lastSyncedAt,
        message: errorMessage,
        messageKey,
        counts: null,
        state: "error",
      };
      this.setStatus(nextStatus);
      return nextStatus;
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;

    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export { SyncService, type SyncReason };
