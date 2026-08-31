import type { BrowserWindow } from "electron";
import type { CalendarEvent, EventReferenceArgs, RespondToEventArgs } from "@shared/schemas";
import type AppDatabase from "@main/db/database";
import { IPC_CHANNELS } from "@shared/ipc";
import { isMissingGraphItemError } from "@main/graph/calendar-service";
import type GraphCalendarService from "@main/graph/calendar-service";
import type NewEventNotificationService from "@main/notifications/new-event-notification-service";
import type ReminderService from "@main/reminders/reminder-service";
import type { SyncService } from "@main/sync/sync-service";
import { showAndFocusMainWindow } from "@main/window";

interface EventActionServiceDependencies {
  db: AppDatabase;
  getMainWindow: () => BrowserWindow | null;
  graph: GraphCalendarService;
  newEventNotifications: NewEventNotificationService;
  reminders: ReminderService;
  sync: SyncService;
}

class EventActionService {
  private readonly dependencies: EventActionServiceDependencies;

  constructor(dependencies: EventActionServiceDependencies) {
    this.dependencies = dependencies;
  }

  async respondToEvent(args: RespondToEventArgs): Promise<void> {
    const homeAccountId = this.resolveCalendarHomeAccountId(args.calendarId);
    const current = this.dependencies.db.getEvent(args.calendarId, args.eventId);
    const isSeriesTarget = targetsDifferentEvent(args.eventId, args.targetEventId);
    await this.dependencies.graph.respondToEvent(args, homeAccountId);
    this.dependencies.newEventNotifications.dismiss({
      calendarId: args.calendarId,
      eventId: args.eventId,
    });

    if (isSeriesTarget) {
      await this.dependencies.reminders.checkNow();
      await this.dependencies.sync.syncAll("mutation", homeAccountId);
      return;
    }

    let nextEvent = current;
    try {
      const refreshed = await this.dependencies.graph.getEvent(
        args.calendarId,
        args.eventId,
        homeAccountId,
      );
      nextEvent = mergeCachedAttachments(refreshed, current);
    } catch (error) {
      if (!isMissingGraphItemError(error)) {
        throw error;
      }
    }

    if (nextEvent) {
      replaceStoredEvent(
        this.dependencies.db,
        current,
        applyResponseToEvent(nextEvent, args.action),
      );
    }

    await this.dependencies.reminders.checkNow();
    void this.dependencies.sync.syncAll("mutation", homeAccountId);
  }

  openInApp(args: EventReferenceArgs): boolean {
    const calendarEvent = this.dependencies.db.getEvent(args.calendarId, args.eventId);
    if (!calendarEvent) {
      return false;
    }

    const window = this.dependencies.getMainWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    showAndFocusMainWindow(window);
    window.webContents.send(IPC_CHANNELS.eventsOpenInAppRequested, calendarEvent);
    return true;
  }

  private resolveCalendarHomeAccountId(calendarId: string): string {
    const homeAccountId = this.dependencies.db.getCalendarHomeAccountId(calendarId);
    if (!homeAccountId) {
      throw new Error("Calendar not found.");
    }

    return homeAccountId;
  }
}

function mergeCachedAttachments(
  event: CalendarEvent,
  current: CalendarEvent | null,
): CalendarEvent {
  if (!current || current.attachments.length === 0 || event.attachments.length > 0) {
    return event;
  }

  return {
    ...event,
    attachments: current.attachments,
    hasAttachments: event.hasAttachments || current.attachments.length > 0,
  };
}

function applyResponseToEvent(
  event: CalendarEvent,
  action: RespondToEventArgs["action"],
): CalendarEvent {
  return {
    ...event,
    isReminderOn: action === "decline" ? false : event.isReminderOn,
    responseStatus: {
      response: action === "accept" ? "accepted" : action === "decline" ? "declined" : "tentative",
      time: new Date().toISOString(),
    },
  };
}

function replaceStoredEvent(
  db: AppDatabase,
  current: CalendarEvent | null,
  nextEvent: CalendarEvent,
): void {
  db.upsertEvent(nextEvent);

  if (current && current.id !== nextEvent.id) {
    db.deleteEvent(current.calendarId, current.id);
  }
}

function targetsDifferentEvent(eventId: string, targetEventId?: string): boolean {
  return Boolean(targetEventId && targetEventId !== eventId);
}

export default EventActionService;
