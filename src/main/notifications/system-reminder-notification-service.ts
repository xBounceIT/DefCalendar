import { Notification } from "@main/electron-runtime";
import type EventActionService from "@main/events/event-action-service";
import { t } from "@main/i18n";
import { formatNotificationTime } from "@main/notifications/notification-time";
import type ReminderService from "@main/reminders/reminder-service";
import type { ReminderDialogItem, ReminderDialogState } from "@shared/ipc";

interface SystemReminderNotificationDependencies {
  eventActions: Pick<EventActionService, "openInApp">;
  reminders: Pick<ReminderService, "getState" | "onState" | "snooze" | "dismiss">;
}

class SystemReminderNotificationService {
  private readonly activeNotifications = new Map<string, InstanceType<typeof Notification>>();
  private readonly dependencies: SystemReminderNotificationDependencies;
  private unsubscribe: null | (() => void) = null;

  constructor(dependencies: SystemReminderNotificationDependencies) {
    this.dependencies = dependencies;
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.dependencies.reminders.onState((state) => this.sync(state));
    this.sync(this.dependencies.reminders.getState());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const key of this.activeNotifications.keys()) {
      this.close(key);
    }
  }

  private sync(state: ReminderDialogState): void {
    const nextKeys = new Set(state.items.map((item) => item.dedupeKey));
    for (const key of this.activeNotifications.keys()) {
      if (!nextKeys.has(key)) {
        this.close(key);
      }
    }

    if (!Notification.isSupported()) {
      return;
    }

    for (const item of state.items) {
      if (!this.activeNotifications.has(item.dedupeKey)) {
        this.show(item, state);
      }
    }
  }

  private show(item: ReminderDialogItem, state: ReminderDialogState): void {
    const notification = new Notification({
      actions: [
        { text: t("reminderNotificationSnooze"), type: "button" },
        { text: t("reminderNotificationDismiss"), type: "button" },
      ],
      body: [
        item.subject || t("inviteNotificationUntitledEvent"),
        formatNotificationTime(item, state.timeFormat, state.locale),
        item.location?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
      groupId: "defcalendar-reminders",
      id: `reminder:${item.dedupeKey}`,
      title: t("reminderTitle"),
    });

    notification.on("click", () => {
      if (this.activeNotifications.get(item.dedupeKey) === notification) {
        this.dependencies.eventActions.openInApp({
          calendarId: item.calendarId,
          eventId: item.eventId,
        });
      }
    });
    notification.on("close", () => {
      if (this.activeNotifications.get(item.dedupeKey) === notification) {
        this.runReminderAction(item, notification, () => {
          this.dependencies.reminders.dismiss(item.dedupeKey);
        });
      }
    });
    notification.on("failed", () => {
      if (this.activeNotifications.get(item.dedupeKey) === notification) {
        this.close(item.dedupeKey);
      }
    });
    notification.on("action", (event: unknown, actionIndex?: number) => {
      if (this.activeNotifications.get(item.dedupeKey) !== notification) {
        return;
      }

      const index = actionIndex ?? readActionIndex(event);
      if (index === 0) {
        this.runReminderAction(item, notification, () => {
          this.dependencies.reminders.snooze(item.dedupeKey, 5);
        });
      } else if (index === 1) {
        this.runReminderAction(item, notification, () => {
          this.dependencies.reminders.dismiss(item.dedupeKey);
        });
      }
    });

    this.activeNotifications.set(item.dedupeKey, notification);
    notification.show();
  }

  private runReminderAction(
    item: ReminderDialogItem,
    notification: InstanceType<typeof Notification>,
    action: () => void,
  ): void {
    try {
      action();
      this.close(item.dedupeKey);
    } catch {
      if (this.activeNotifications.get(item.dedupeKey) === notification) {
        notification.body = [
          t("reminderNotificationActionFailed"),
          item.subject || t("inviteNotificationUntitledEvent"),
        ].join("\n");
        notification.show();
      }
    }
  }

  private close(key: string): void {
    const notification = this.activeNotifications.get(key);
    this.activeNotifications.delete(key);
    notification?.close();
  }
}

function readActionIndex(event: unknown): number | undefined {
  if (!event || typeof event !== "object" || !("actionIndex" in event)) {
    return undefined;
  }

  return typeof event.actionIndex === "number" ? event.actionIndex : undefined;
}

export default SystemReminderNotificationService;
