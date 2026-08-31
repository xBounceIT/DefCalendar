import type { AppConfig } from "@main/config";
import type AppDatabase from "@main/db/database";
import type GraphCalendarService from "@main/graph/calendar-service";
import type MsalAuthService from "@main/auth/msal-auth-service";
import type NewEventNotificationService from "@main/notifications/new-event-notification-service";
import type ReminderService from "@main/reminders/reminder-service";
import type { ReminderCheckTrigger } from "@main/reminders/reminder-service";
import type SettingsService from "@main/settings/settings-service";
import { DAY_MS, MINUTE_MS } from "@shared/duration";
import { isDeclinedEventResponse, isPendingInvite } from "@shared/event-response";
import type {
  CalendarEvent,
  CalendarSummary,
  EventListArgs,
  SyncStatus,
  UserSettings,
} from "@shared/schemas";
import type { SyncWindowDays } from "@shared/sync";

type SyncReason = "startup" | "sign-in" | "switch-account" | "manual" | "interval" | "mutation";

const GRAPH_CALENDAR_VIEW_MAX_DAYS = 1825;
const ON_DEMAND_SYNC_RANGE_FRESHNESS_MS = DAY_MS;

interface SyncServiceDependencies {
  auth: MsalAuthService;
  config: AppConfig;
  db: AppDatabase;
  graph: GraphCalendarService;
  newEventNotifications: NewEventNotificationService;
  reminders: ReminderService;
  settings: SettingsService;
}

class SyncService {
  private readonly dependencies: SyncServiceDependencies;
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<SyncStatus> | null = null;
  private pendingMutationAllAccounts = false;
  private readonly pendingMutationAccountIds = new Set<string>();
  private status: SyncStatus;

  constructor(dependencies: SyncServiceDependencies) {
    this.dependencies = dependencies;
    this.status = this.withSyncWindow(dependencies.db.getLatestSyncStatus());
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.syncAll("interval");
    }, this.getIntervalMs());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  refreshSchedule(): void {
    const isRunning = this.timer !== null;
    this.stop();

    if (isRunning) {
      this.start();
    }
  }

  reset(): void {
    this.setStatus({
      lastSyncedAt: null,
      message: "Sign in to sync Exchange 365.",
      messageKey: "sync.signInToSync",
      counts: null,
      progress: null,
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

  async ensureEventsRange(args: EventListArgs): Promise<void> {
    if (
      !this.dependencies.auth.hasSession() ||
      !args.calendarIds?.length ||
      args.start >= args.end
    ) {
      return;
    }

    const calendarIds = [...new Set(args.calendarIds)].toSorted((left, right) =>
      left.localeCompare(right),
    );
    const syncedAt = new Date().toISOString();
    const freshAfter = new Date(Date.now() - ON_DEMAND_SYNC_RANGE_FRESHNESS_MS).toISOString();
    const settings = this.dependencies.settings.getSettings();
    const shouldRecordInviteCandidates = areInviteNotificationsEnabled(settings);
    const shouldReconcileCoveredEvents =
      shouldRecordInviteCandidates || this.dependencies.newEventNotifications.getItems().length > 0;

    await Promise.all(
      calendarIds.map(async (calendarId) => {
        const uncoveredRanges = this.dependencies.db.listUncoveredCalendarSyncRanges(
          calendarId,
          args.start,
          args.end,
          freshAfter,
        );
        if (shouldReconcileCoveredEvents) {
          const coveredEvents = this.dependencies.db
            .listEvents({
              calendarIds: [calendarId],
              end: args.end,
              start: args.start,
            })
            .filter((event) =>
              uncoveredRanges.every(
                (range) => event.start >= range.rangeEnd || event.end <= range.rangeStart,
              ),
            );
          this.recordInviteCandidates(
            coveredEvents,
            buildEventsById(coveredEvents),
            shouldRecordInviteCandidates,
          );
        }
        if (uncoveredRanges.length === 0) {
          return;
        }

        const homeAccountId = this.dependencies.db.getCalendarHomeAccountId(calendarId);
        if (!homeAccountId) {
          return;
        }

        for (const range of uncoveredRanges) {
          let fetchedEvents: CalendarEvent[];
          try {
            fetchedEvents = await this.dependencies.graph.listCalendarView(
              calendarId,
              range.rangeStart,
              range.rangeEnd,
              homeAccountId,
            );
          } catch {
            continue;
          }
          const persistedEvents = this.dependencies.db.listEvents({
            calendarIds: [calendarId],
            end: range.rangeEnd,
            start: range.rangeStart,
          });
          const previousEventsById = buildEventsById(persistedEvents);
          const mergedEvents = mergeFetchedAndPersistedEvents(fetchedEvents, persistedEvents);

          this.dependencies.db.replaceEventsForCalendarRange({
            calendarId,
            events: mergedEvents,
            rangeEnd: range.rangeEnd,
            rangeStart: range.rangeStart,
          });
          this.dependencies.db.recordCalendarSyncRange({
            calendarId,
            preserveOverlappingCoverage: true,
            rangeEnd: range.rangeEnd,
            rangeStart: range.rangeStart,
            syncedAt,
          });

          this.recordInviteCandidates(
            mergedEvents,
            previousEventsById,
            shouldRecordInviteCandidates,
          );
        }
      }),
    );
  }
  async syncAll(reason: SyncReason, homeAccountId?: string): Promise<SyncStatus> {
    if (this.inFlight) {
      if (reason === "mutation") {
        this.queuePendingMutation(homeAccountId);
      }

      return this.inFlight;
    }

    const nextSync = this.runSync(reason, homeAccountId);
    this.inFlight = nextSync;

    try {
      return await nextSync;
    } finally {
      if (this.inFlight === nextSync) {
        this.inFlight = null;
      }

      this.startPendingMutationSync();
    }
  }

  private queuePendingMutation(homeAccountId?: string): void {
    if (!homeAccountId) {
      this.pendingMutationAllAccounts = true;
      this.pendingMutationAccountIds.clear();
      return;
    }

    if (!this.pendingMutationAllAccounts) {
      this.pendingMutationAccountIds.add(homeAccountId);
    }
  }

  private startPendingMutationSync(): void {
    if (this.inFlight) {
      return;
    }

    const homeAccountId = this.takePendingMutationHomeAccountId();
    if (homeAccountId === null) {
      return;
    }

    void this.syncAll("mutation", homeAccountId);
  }

  private takePendingMutationHomeAccountId(): null | string | undefined {
    if (this.pendingMutationAllAccounts) {
      this.pendingMutationAllAccounts = false;
      this.pendingMutationAccountIds.clear();
      return undefined;
    }

    if (this.pendingMutationAccountIds.size === 0) {
      return null;
    }

    if (this.pendingMutationAccountIds.size === 1) {
      const [homeAccountId] = this.pendingMutationAccountIds;
      this.pendingMutationAccountIds.clear();
      return homeAccountId;
    }

    this.pendingMutationAccountIds.clear();
    return undefined;
  }

  private async runSync(reason: SyncReason, homeAccountId?: string): Promise<SyncStatus> {
    if (!this.dependencies.auth.hasSession()) {
      const idleStatus = {
        lastSyncedAt: this.status.lastSyncedAt,
        message: "Sign in to sync Exchange 365.",
        messageKey: "sync.signInToSync",
        counts: null,
        progress: null,
        state: "idle" as const,
      };
      return this.setStatus(idleStatus);
    }

    const accountIds = this.resolveAccountIds(reason, homeAccountId);
    if (accountIds.length === 0) {
      const idleStatus = {
        lastSyncedAt: this.status.lastSyncedAt,
        message: "Sign in to sync Exchange 365.",
        messageKey: "sync.signInToSync",
        counts: null,
        progress: null,
        state: "idle" as const,
      };
      return this.setStatus(idleStatus);
    }

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
      progress: null,
      state: "syncing",
    });

    try {
      let settings = this.dependencies.settings.getSettings();
      const calendars: CalendarSummary[] = [];

      for (const accountId of accountIds) {
        const knownCalendarIds = this.dependencies.db.listCalendarIds(accountId);
        const accountCalendars = await this.dependencies.graph.listCalendars(accountId);
        this.dependencies.db.upsertCalendars(accountCalendars, accountId);
        settings = this.dependencies.settings.syncVisibleCalendars({
          calendarIds: accountCalendars.map((calendar) => calendar.id),
          knownCalendarIds,
        });
        calendars.push(...accountCalendars);

        try {
          const accountContacts = await this.dependencies.graph.listContacts(accountId);
          this.dependencies.db.replaceContactsForAccount(accountContacts, accountId);
        } catch {}
      }

      if (reason === "sign-in") {
        const nextStatus: SyncStatus = {
          lastSyncedAt: this.status.lastSyncedAt,
          message: "Choose calendars to sync.",
          messageKey: "sync.chooseCalendars",
          counts: null,
          progress: null,
          state: "idle",
        };
        return this.setStatus(nextStatus);
      }

      const visibleCalendarIdSet = new Set(settings.visibleCalendarIds);
      const calendarsToSync = calendars.filter((calendar) => visibleCalendarIdSet.has(calendar.id));
      if (calendarsToSync.length === 0) {
        const nextStatus: SyncStatus = {
          lastSyncedAt: this.status.lastSyncedAt,
          message: "Select at least one calendar to sync.",
          messageKey: "sync.selectCalendars",
          counts: null,
          progress: null,
          state: "idle",
        };
        return this.setStatus(nextStatus);
      }

      if (reason === "manual") {
        this.dependencies.db.clearCalendarSyncRanges(
          calendarsToSync.map((calendar) => calendar.id),
        );
      }

      const syncWindow = this.getSyncWindow();
      const lookAheadDays = syncWindow.lookAheadDays;
      const maxLookBehindDays = GRAPH_CALENDAR_VIEW_MAX_DAYS - lookAheadDays;
      const rollingLookBehindDays = syncWindow.lookBehindDays;
      const rangeBaseTime = Date.now();
      const rollingRangeStart = new Date(
        rangeBaseTime - rollingLookBehindDays * DAY_MS,
      ).toISOString();
      const deepRangeStart = new Date(rangeBaseTime - maxLookBehindDays * DAY_MS).toISOString();
      const rangeEnd = new Date(rangeBaseTime + lookAheadDays * DAY_MS).toISOString();
      const finishedAt = new Date().toISOString();
      const inviteNotificationsEnabled = areInviteNotificationsEnabled(settings);
      const shouldRecordInviteCandidates =
        inviteNotificationsEnabled && reason !== "sign-in" && reason !== "switch-account";

      const totalCalendars = calendarsToSync.length;
      let processedCalendars = 0;
      let processedEvents = 0;
      let syncFailed = false;

      this.setStatus({
        lastSyncedAt: this.status.lastSyncedAt,
        message: syncMessage,
        messageKey: syncMessageKey,
        counts: null,
        progress: { processedCalendars: 0, totalCalendars, processedEvents: 0 },
        state: "syncing",
      });

      const calendarsToStore = await Promise.all(
        calendarsToSync.map(async (calendar) => {
          try {
            const isDeepBackfill =
              this.dependencies.db.getDeepBackfillCompletedAt(calendar.id) === null;
            const rangeStart = isDeepBackfill ? deepRangeStart : rollingRangeStart;
            const fetchedEvents = await this.dependencies.graph.listCalendarView(
              calendar.id,
              rangeStart,
              rangeEnd,
              calendar.homeAccountId,
            );
            processedCalendars += 1;
            processedEvents += fetchedEvents.length;
            if (!syncFailed) {
              this.setStatus({
                lastSyncedAt: this.status.lastSyncedAt,
                message: syncMessage,
                messageKey: syncMessageKey,
                counts: null,
                progress: { processedCalendars, totalCalendars, processedEvents },
                state: "syncing",
              });
            }
            return {
              calendarId: calendar.id,
              fetchedEvents,
              isDeepBackfill,
              rangeStart,
              shouldRecordInviteCandidates: shouldRecordInviteCandidates && !isDeepBackfill,
            };
          } catch (error) {
            syncFailed = true;
            throw error;
          }
        }),
      );

      const syncedCalendars = [];
      for (const syncedCalendar of calendarsToStore) {
        const { calendarId, fetchedEvents, isDeepBackfill, rangeStart } = syncedCalendar;
        const persistedEvents = this.dependencies.db.listEvents({
          calendarIds: [calendarId],
          end: rangeEnd,
          start: rangeStart,
        });
        const events = mergeFetchedAndPersistedEvents(fetchedEvents, persistedEvents);
        this.dependencies.db.replaceEventsForCalendarRange({
          calendarId,
          events,
          rangeEnd,
          rangeStart,
        });
        this.dependencies.db.saveSyncState({
          calendarId,
          errorMessage: null,
          lastSyncedAt: finishedAt,
          rangeEnd,
          rangeStart,
        });
        this.dependencies.db.recordCalendarSyncRange({
          calendarId,
          rangeEnd,
          rangeStart,
          syncedAt: finishedAt,
        });
        if (isDeepBackfill) {
          this.dependencies.db.markDeepBackfillCompleted(calendarId, finishedAt);
        }
        syncedCalendars.push({
          ...syncedCalendar,
          events,
          previousEventsById: buildEventsById(persistedEvents),
        });
      }

      const totalEvents = syncedCalendars.reduce((sum, sc) => sum + sc.events.length, 0);
      if (processedEvents !== totalEvents) {
        processedEvents = totalEvents;
        this.setStatus({
          lastSyncedAt: this.status.lastSyncedAt,
          message: syncMessage,
          messageKey: syncMessageKey,
          counts: null,
          progress: { processedCalendars, totalCalendars, processedEvents },
          state: "syncing",
        });
      }

      const newEvents: CalendarEvent[] = [];
      for (const syncedCalendar of syncedCalendars) {
        const shouldSuppressInviteCandidates =
          inviteNotificationsEnabled && syncedCalendar.isDeepBackfill;
        const candidates = this.findInviteCandidates(
          syncedCalendar.events,
          syncedCalendar.previousEventsById,
          syncedCalendar.shouldRecordInviteCandidates || shouldSuppressInviteCandidates,
        );
        if (shouldSuppressInviteCandidates) {
          this.markInviteCandidatesHandled(candidates);
        } else {
          newEvents.push(...candidates);
        }
      }
      this.persistInviteCandidates(newEvents);

      const reminderTrigger: ReminderCheckTrigger =
        reason === "startup" || reason === "switch-account" ? "startup" : "tick";
      await this.dependencies.reminders.checkNow(reminderTrigger);

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
        progress: null,
        state: "idle",
      };
      return this.setStatus(nextStatus);
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
        progress: null,
        state: "error",
      };
      return this.setStatus(nextStatus);
    }
  }

  private recordInviteCandidates(
    events: CalendarEvent[],
    previousEventsById: Map<string, CalendarEvent>,
    shouldRecordCandidates: boolean,
  ): void {
    this.persistInviteCandidates(
      this.findInviteCandidates(events, previousEventsById, shouldRecordCandidates),
    );
  }

  private persistInviteCandidates(candidates: CalendarEvent[]): void {
    if (candidates.length === 0) {
      return;
    }

    this.dependencies.newEventNotifications.recordCandidates(candidates);
    this.markInviteCandidatesHandled(candidates);
  }

  private markInviteCandidatesHandled(candidates: CalendarEvent[]): void {
    for (const event of candidates) {
      this.dependencies.db.markNotificationFired(buildInviteNotificationKey(event));
    }
  }

  private findInviteCandidates(
    events: CalendarEvent[],
    previousEventsById: Map<string, CalendarEvent>,
    shouldRecordCandidates: boolean,
  ): CalendarEvent[] {
    const candidates: CalendarEvent[] = [];
    const eventsById = buildEventsById(events);

    for (const previous of previousEventsById.values()) {
      if (eventsById.has(previous.id)) {
        continue;
      }

      this.dependencies.newEventNotifications.dismiss({
        calendarId: previous.calendarId,
        eventId: previous.id,
      });
      this.dependencies.db.clearNotificationFired(buildInviteNotificationKey(previous));
    }

    for (const event of eventsById.values()) {
      const notificationKey = buildInviteNotificationKey(event);
      const previous = previousEventsById.get(event.id);
      if (!isPendingInvite(event)) {
        this.dependencies.newEventNotifications.dismiss({
          calendarId: event.calendarId,
          eventId: event.id,
        });
        if (previous === undefined || isPendingInvite(previous)) {
          this.dependencies.db.clearNotificationFired(notificationKey);
        }
        continue;
      }

      const responseWasReset = previous !== undefined && !isPendingInvite(previous);
      if (responseWasReset) {
        this.dependencies.db.clearNotificationFired(notificationKey);
      }
      if (!shouldRecordCandidates) {
        continue;
      }
      if (!responseWasReset && this.dependencies.db.hasNotificationFired(notificationKey)) {
        continue;
      }

      candidates.push(event);
    }

    return candidates;
  }

  private resolveAccountIds(reason: SyncReason, homeAccountId?: string): string[] {
    if (homeAccountId) {
      return [homeAccountId];
    }

    if (reason === "sign-in" || reason === "switch-account") {
      const activeAccountId = this.dependencies.auth.getActiveAccountId();
      return activeAccountId ? [activeAccountId] : [];
    }

    return this.dependencies.auth.getAccountIds();
  }

  private getIntervalMs(): number {
    const syncIntervalMinutes =
      this.dependencies.settings.getSettings().syncIntervalMinutes ??
      this.dependencies.config.syncIntervalMinutes;

    return syncIntervalMinutes * MINUTE_MS;
  }

  private getSyncWindow(): SyncWindowDays {
    const lookAheadDays = this.dependencies.config.syncLookAheadDays;
    return {
      lookAheadDays,
      lookBehindDays: Math.min(
        this.dependencies.config.syncLookBehindDays,
        GRAPH_CALENDAR_VIEW_MAX_DAYS - lookAheadDays,
      ),
    };
  }

  private withSyncWindow(status: SyncStatus): SyncStatus {
    return {
      ...status,
      syncWindow: this.getSyncWindow(),
    };
  }

  private setStatus(status: SyncStatus): SyncStatus {
    const nextStatus = this.withSyncWindow(status);
    this.status = nextStatus;

    for (const listener of this.listeners) {
      listener(nextStatus);
    }

    return nextStatus;
  }
}

function buildEventIdentityKey(
  event: Pick<
    CalendarEvent,
    "end" | "location" | "occurrenceId" | "organizer" | "start" | "subject"
  >,
): string {
  if (event.occurrenceId) {
    return `occurrence:${event.occurrenceId}`;
  }

  return [
    event.subject.trim().toLowerCase(),
    event.start,
    event.end,
    event.organizer?.email?.trim().toLowerCase() ?? "",
    event.location?.trim().toLowerCase() ?? "",
  ].join("|");
}

function compareCalendarEvents(
  left: Pick<CalendarEvent, "id" | "start" | "subject">,
  right: Pick<CalendarEvent, "id" | "start" | "subject">,
): number {
  return (
    left.start.localeCompare(right.start) ||
    left.subject.localeCompare(right.subject) ||
    left.id.localeCompare(right.id)
  );
}

function buildEventsById(events: CalendarEvent[]): Map<string, CalendarEvent> {
  return new Map(events.map((event) => [event.id, event]));
}

function mergePersistedDeclinedEvents(
  syncedEvents: CalendarEvent[],
  persistedEvents: CalendarEvent[],
): CalendarEvent[] {
  if (persistedEvents.length === 0) {
    return syncedEvents;
  }

  const syncedIds = new Set(syncedEvents.map((event) => event.id));
  const syncedKeys = new Set(syncedEvents.map(buildEventIdentityKey));
  const preservedEvents = persistedEvents.filter(
    (event) =>
      shouldPreserveDeclinedEvent(event) &&
      !syncedIds.has(event.id) &&
      !syncedKeys.has(buildEventIdentityKey(event)),
  );
  if (preservedEvents.length === 0) {
    return syncedEvents;
  }

  return [...syncedEvents, ...preservedEvents].toSorted(compareCalendarEvents);
}

function mergeFetchedAndPersistedEvents(
  fetchedEvents: CalendarEvent[],
  persistedEvents: CalendarEvent[],
): CalendarEvent[] {
  const persistedEventsById = buildEventsById(persistedEvents);
  const newestEvents = fetchedEvents.map((event) => {
    const persisted = persistedEventsById.get(event.id);
    return persisted && shouldPreservePersistedEvent(persisted, event) ? persisted : event;
  });
  return mergePersistedDeclinedEvents(newestEvents, persistedEvents);
}

function shouldPreservePersistedEvent(persisted: CalendarEvent, fetched: CalendarEvent): boolean {
  if (!persisted.lastModifiedDateTime) {
    return false;
  }
  const persistedModifiedAt = Date.parse(persisted.lastModifiedDateTime);
  if (Number.isNaN(persistedModifiedAt)) {
    return false;
  }
  if (!fetched.lastModifiedDateTime) {
    return true;
  }
  const fetchedModifiedAt = Date.parse(fetched.lastModifiedDateTime);
  if (Number.isNaN(fetchedModifiedAt)) {
    return true;
  }

  return persistedModifiedAt >= fetchedModifiedAt;
}

function buildInviteNotificationKey(event: Pick<CalendarEvent, "calendarId" | "id">): string {
  return `${event.calendarId}:${event.id}:invite`;
}

function areInviteNotificationsEnabled(settings: UserSettings): boolean {
  return (
    settings.newEventPopupEnabled ||
    settings.systemInviteNotificationsEnabled ||
    settings.taskbarInviteNotificationsEnabled
  );
}

function shouldPreserveDeclinedEvent(
  event: Pick<CalendarEvent, "cancelled" | "isOrganizer" | "responseStatus">,
): boolean {
  return (
    !event.cancelled &&
    !event.isOrganizer &&
    isDeclinedEventResponse(event.responseStatus?.response)
  );
}

export { SyncService, type SyncReason };
