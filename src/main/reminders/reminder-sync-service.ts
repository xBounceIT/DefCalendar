import type MsalAuthService from "@main/auth/msal-auth-service";
import type AppDatabase from "@main/db/database";
import type GraphCalendarService from "@main/graph/calendar-service";
import { isMissingGraphItemError } from "@main/graph/calendar-service";
import { MINUTE_MS } from "@shared/duration";

class ReminderSyncService {
  private readonly db: AppDatabase;
  private readonly auth: MsalAuthService;
  private readonly graph: GraphCalendarService;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private stopped = false;

  constructor(db: AppDatabase, auth: MsalAuthService, graph: GraphCalendarService) {
    this.db = db;
    this.auth = auth;
    this.graph = graph;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.stopped = false;
    this.timer = setInterval(() => void this.flush(), MINUTE_MS);
    void this.flush();
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    const controller = new AbortController();
    this.controller = controller;
    const pending = this.flushPending(controller.signal);
    this.inFlight = pending;
    try {
      await pending;
    } finally {
      if (this.inFlight === pending) {
        this.inFlight = null;
        this.controller = null;
      }
    }
  }

  private async flushPending(signal: AbortSignal): Promise<void> {
    for (const item of this.db.listPendingReminderDismissals()) {
      if (signal.aborted) {
        return;
      }
      try {
        const homeAccountId = this.db.getCalendarHomeAccountId(item.calendarId);
        if (!homeAccountId) {
          continue;
        }
        const assertSession = this.auth.createAccountSessionGuard(homeAccountId);
        const event = this.db.getEvent(item.calendarId, item.eventId);
        if (!event || Date.parse(event.start) !== Date.parse(item.start)) {
          this.db.completeReminderDismissal(item);
          continue;
        }
        try {
          await this.graph.dismissReminder(
            item.calendarId,
            item.eventId,
            homeAccountId,
            item.start,
            signal,
          );
        } catch (error) {
          if (!isMissingGraphItemError(error)) {
            throw error;
          }
        }
        signal.throwIfAborted();
        assertSession();
        this.db.completeReminderDismissal(item);
      } catch {}
    }
  }
}

export default ReminderSyncService;
