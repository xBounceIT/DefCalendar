import { formatNotificationTime } from "@main/notifications/notification-time";
import type EventActionService from "@main/events/event-action-service";
import { Notification } from "@main/electron-runtime";
import { t } from "@main/i18n";
import type NewEventNotificationService from "@main/notifications/new-event-notification-service";
import type SettingsService from "@main/settings/settings-service";
import type { EventResponseAction, NewEventNotificationItem, UserSettings } from "@shared/schemas";
import buildEventReferenceKey from "@shared/event-reference";

type InviteNotification = InstanceType<typeof Notification>;

const INVITE_GROUP_ID = "defcalendar-invites";
const RESPONSE_ACTIONS: EventResponseAction[] = ["accept", "tentative", "decline"];

interface SystemInviteNotificationDependencies {
  eventActions: EventActionService;
  newEventNotifications: NewEventNotificationService;
  settings: SettingsService;
}

class SystemInviteNotificationService {
  private readonly activeNotifications = new Map<string, InviteNotification>();
  private readonly dependencies: SystemInviteNotificationDependencies;
  private readonly suppressedEventKeys = new Map<string, string>();
  private readonly displayedItems = new Map<string, string>();
  private unsubscribe: null | (() => void) = null;

  constructor(dependencies: SystemInviteNotificationDependencies) {
    this.dependencies = dependencies;
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.dependencies.newEventNotifications.onChange((items) => {
      this.sync(items);
    });
    this.refresh();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.closeAll();
    this.suppressedEventKeys.clear();
  }

  refresh(): void {
    this.sync(this.dependencies.newEventNotifications.getItems());
  }

  sync(items: NewEventNotificationItem[]): void {
    items = items.filter((item) => !item.popupDismissed);
    const settings = this.dependencies.settings.getSettings();
    if (!settings.systemInviteNotificationsEnabled) {
      this.closeAll();
      this.suppressedEventKeys.clear();
      return;
    }

    if (!Notification.isSupported()) {
      this.closeAll();
      this.suppressedEventKeys.clear();
      return;
    }

    const nextEventKeys = new Set(items.map(buildEventReferenceKey));
    for (const eventKey of this.activeNotifications.keys()) {
      if (!nextEventKeys.has(eventKey)) {
        this.close(eventKey);
      }
    }
    for (const eventKey of this.suppressedEventKeys.keys()) {
      if (!nextEventKeys.has(eventKey)) {
        this.suppressedEventKeys.delete(eventKey);
      }
    }

    for (const item of items) {
      const eventKey = buildEventReferenceKey(item);
      const previousItem =
        this.displayedItems.get(eventKey) ?? this.suppressedEventKeys.get(eventKey);
      if (previousItem !== undefined && previousItem !== JSON.stringify(item)) {
        this.close(eventKey);
        this.suppressedEventKeys.delete(eventKey);
      }
      if (this.activeNotifications.has(eventKey) || this.suppressedEventKeys.has(eventKey)) {
        continue;
      }

      this.show(item, settings);
    }
  }

  private show(item: NewEventNotificationItem, settings: UserSettings): void {
    const eventKey = buildEventReferenceKey(item);
    const notification = new Notification({
      actions:
        item.kind === "cancelled"
          ? []
          : [
              { text: t("inviteNotificationAccept"), type: "button" },
              { text: t("inviteNotificationTentative"), type: "button" },
              { text: t("inviteNotificationDecline"), type: "button" },
            ],
      body: buildBody(item, settings),
      groupId: INVITE_GROUP_ID,
      id: createNotificationId(item),
      title: t(
        item.kind === "cancelled"
          ? "inviteCancellationTitle"
          : item.kind === "updated"
            ? "inviteUpdateTitle"
            : "inviteNotificationTitle",
      ),
    });

    notification.on("action", (event: unknown, actionIndex?: number) => {
      if (this.activeNotifications.get(eventKey) !== notification) {
        return;
      }
      const resolvedIndex = typeof actionIndex === "number" ? actionIndex : readActionIndex(event);
      this.handleAction(item, resolvedIndex, notification);
    });
    notification.on("click", () => {
      if (this.activeNotifications.get(eventKey) === notification) {
        this.dependencies.eventActions.openInApp({
          calendarId: item.calendarId,
          eventId: item.eventId,
        });
      }
    });
    notification.on("failed", () => {
      if (this.activeNotifications.get(eventKey) === notification) {
        this.close(eventKey);
      }
    });

    this.activeNotifications.set(eventKey, notification);
    this.displayedItems.set(eventKey, JSON.stringify(item));
    notification.show();
  }

  private handleAction(
    item: NewEventNotificationItem,
    actionIndex: number | undefined,
    notification: InviteNotification,
  ): void {
    if (item.kind === "cancelled") {
      return;
    }
    if (actionIndex === undefined) {
      return;
    }

    const action = RESPONSE_ACTIONS[actionIndex];
    if (!action) {
      return;
    }

    if (action === "accept") {
      if (
        this.dependencies.eventActions.openInApp({
          calendarId: item.calendarId,
          eventId: item.eventId,
        })
      ) {
        const eventKey = buildEventReferenceKey(item);
        this.suppressedEventKeys.set(eventKey, JSON.stringify(item));
        this.close(eventKey);
      }
      return;
    }

    void this.dependencies.eventActions
      .respondToEvent({
        action,
        calendarId: item.calendarId,
        comment: "",
        eventId: item.eventId,
        sendResponse: true,
        ...(item.revision ? { notificationRevision: item.revision } : {}),
      })
      .then(() => {
        const eventKey = buildEventReferenceKey(item);
        if (this.activeNotifications.get(eventKey) === notification) {
          this.close(eventKey);
        }
      })
      .catch(() => {
        if (this.activeNotifications.get(buildEventReferenceKey(item)) === notification) {
          this.dependencies.eventActions.openInApp({
            calendarId: item.calendarId,
            eventId: item.eventId,
          });
        }
      });
  }

  private close(eventKey: string): void {
    const notification = this.activeNotifications.get(eventKey);
    if (!notification) {
      return;
    }

    this.activeNotifications.delete(eventKey);
    this.displayedItems.delete(eventKey);
    notification.close();
  }

  private closeAll(): void {
    for (const eventKey of this.activeNotifications.keys()) {
      this.close(eventKey);
    }
  }
}

function createNotificationId(item: NewEventNotificationItem): string {
  return `invite:${item.calendarId}:${item.eventId}`;
}

function readActionIndex(event: unknown): number | undefined {
  if (!event || typeof event !== "object" || !("actionIndex" in event)) {
    return undefined;
  }

  const actionIndex = (event as { actionIndex?: unknown }).actionIndex;
  return typeof actionIndex === "number" ? actionIndex : undefined;
}

function buildBody(item: NewEventNotificationItem, settings: UserSettings): string {
  const subject = item.subject || t("inviteNotificationUntitledEvent");
  const organizer =
    item.organizerName ?? item.organizerEmail ?? t("inviteNotificationUnknownOrganizer");
  const time = formatNotificationTime(item, settings.timeFormat);
  const location = item.location?.trim();

  return [subject, time, organizer, location].filter(Boolean).join("\n");
}

export default SystemInviteNotificationService;
