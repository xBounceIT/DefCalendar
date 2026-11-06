import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemReminderNotificationService from "../src/main/notifications/system-reminder-notification-service";
import { setMainLocale } from "../src/main/i18n";
import type { ReminderDialogState } from "../src/shared/ipc";

const notificationMock = vi.hoisted(() => {
  class MockNotification {
    static isSupported = vi.fn(() => true);
    static instances: MockNotification[] = [];
    readonly handlers = new Map<string, (...args: unknown[]) => void>();
    readonly options: Record<string, unknown>;
    body: unknown;
    readonly close = vi.fn(() => this.emit("close"));
    readonly show = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.body = options.body;
      MockNotification.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
      this.handlers.set(event, handler);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      this.handlers.get(event)?.(...args);
    }
  }

  return { MockNotification };
});

vi.mock("@main/electron-runtime", () => ({
  Notification: notificationMock.MockNotification,
}));

function createState(): ReminderDialogState {
  return {
    items: [
      {
        calendarId: "calendar-1",
        dedupeKey: "calendar-1:event-1:pre",
        end: "2026-03-30T11:00:00.000Z",
        eventId: "event-1",
        isAllDay: false,
        location: "Room 3",
        onlineMeeting: null,
        reminderMinutesBeforeStart: 15,
        start: "2026-03-30T10:00:00.000Z",
        subject: "Planning",
      },
    ],
    locale: "en",
    timeFormat: "24h",
    theme: "system",
  };
}

function createFixture() {
  let listener: ((state: ReminderDialogState) => void) | null = null;
  const state = createState();
  const unsubscribe = vi.fn();
  const reminders = {
    dismiss: vi.fn(),
    getState: vi.fn(() => state),
    onState: vi.fn((callback: (state: ReminderDialogState) => void) => {
      listener = callback;
      return unsubscribe;
    }),
    snooze: vi.fn(),
  };
  const eventActions = { openInApp: vi.fn(() => true) };
  const service = new SystemReminderNotificationService({ eventActions, reminders });
  return {
    eventActions,
    reminders,
    service,
    state,
    unsubscribe,
    publish: (next: ReminderDialogState) => listener?.(next),
  };
}

beforeEach(() => {
  notificationMock.MockNotification.instances.length = 0;
  notificationMock.MockNotification.isSupported.mockReturnValue(true);
  setMainLocale("en");
});

afterEach(() => {
  vi.clearAllMocks();
  setMainLocale("en");
});

describe("system reminder notifications", () => {
  it.each([
    { event: "close", args: [], operation: "dismiss" },
    { event: "action", args: [{ actionIndex: 0 }], operation: "snooze" },
    { event: "action", args: [{ actionIndex: 1 }], operation: "dismiss" },
  ] as const)(
    "retains reminders when $operation fails after $event",
    ({ event, args, operation }) => {
      const fixture = createFixture();
      fixture.service.start();
      const notification = notificationMock.MockNotification.instances[0];
      fixture.reminders[operation].mockImplementationOnce(() => {
        throw new Error("Private database error");
      });

      expect(() => notification.emit(event, ...args)).not.toThrow();
      expect(notification.close).not.toHaveBeenCalled();
      expect(notification.show).toHaveBeenCalledTimes(2);
      expect(notification.body).toContain("Could not save the reminder action. Please try again.");
      expect(notification.body).not.toContain("Private database error");
      expect(fixture.eventActions.openInApp).not.toHaveBeenCalled();

      notification.emit(event, ...args);
      expect(notification.close).toHaveBeenCalledOnce();
    },
  );

  it("shows native reminders once without opening the app on arrival or refresh", () => {
    const fixture = createFixture();
    fixture.service.start();
    fixture.service.start();
    fixture.publish({ ...fixture.state, timeFormat: "12h" });

    expect(notificationMock.MockNotification.instances).toHaveLength(1);
    const notification = notificationMock.MockNotification.instances[0];
    expect(notification.options).toMatchObject({
      actions: [
        { text: "Snooze for 5 minutes", type: "button" },
        { text: "Dismiss", type: "button" },
      ],
      groupId: "defcalendar-reminders",
      id: "reminder:calendar-1:event-1:pre",
      title: "Reminder",
    });
    expect(notification.options.body).toContain("Planning");
    expect(notification.options.body).toContain("Room 3");
    expect(notification.show).toHaveBeenCalledOnce();
    expect(fixture.eventActions.openInApp).not.toHaveBeenCalled();
    expect(fixture.reminders.onState).toHaveBeenCalledOnce();
  });

  it("opens the event only after clicking the notification", () => {
    const fixture = createFixture();
    fixture.service.start();
    notificationMock.MockNotification.instances[0].emit("click");
    expect(fixture.eventActions.openInApp).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "event-1",
    });
    expect(fixture.reminders.dismiss).not.toHaveBeenCalled();
  });

  it.each([0, 1])("handles reminder action %s through the reminder service", (actionIndex) => {
    const fixture = createFixture();
    fixture.service.start();
    const notification = notificationMock.MockNotification.instances[0];
    notification.emit("action", { actionIndex });
    expect(fixture.reminders.snooze.mock.calls).toStrictEqual(
      actionIndex === 0 ? [[fixture.state.items[0].dedupeKey, 5]] : [],
    );
    expect(fixture.reminders.dismiss.mock.calls).toStrictEqual(
      actionIndex === 1 ? [[fixture.state.items[0].dedupeKey]] : [],
    );
    expect(notification.close).toHaveBeenCalledOnce();
  });

  it("shows a snoozed reminder again when it becomes due", () => {
    const fixture = createFixture();
    fixture.service.start();
    notificationMock.MockNotification.instances[0].emit("action", {}, 0);
    fixture.publish({ ...fixture.state, items: [] });
    fixture.publish(fixture.state);
    expect(notificationMock.MockNotification.instances).toHaveLength(2);
  });

  it("dismisses the reminder when the user closes its macOS notification", () => {
    const fixture = createFixture();
    fixture.service.start();
    const notification = notificationMock.MockNotification.instances[0];
    notification.emit("close");
    expect(fixture.reminders.dismiss).toHaveBeenCalledExactlyOnceWith(
      fixture.state.items[0].dedupeKey,
    );
    notification.emit("click");
    notification.emit("action", { actionIndex: 1 });
    expect(notificationMock.MockNotification.instances).toHaveLength(1);
    expect(fixture.reminders.dismiss).toHaveBeenCalledExactlyOnceWith(
      fixture.state.items[0].dedupeKey,
    );
    expect(fixture.eventActions.openInApp).not.toHaveBeenCalled();
  });

  it("retries failed delivery on the next state update without dismissing the reminder", () => {
    const fixture = createFixture();
    fixture.service.start();
    const notification = notificationMock.MockNotification.instances[0];
    notification.emit("failed", {}, "Delivery failed");
    fixture.publish(fixture.state);
    notification.emit("close");
    notification.emit("action", { actionIndex: 0 });

    expect(notificationMock.MockNotification.instances).toHaveLength(2);
    expect(notificationMock.MockNotification.instances[1].show).toHaveBeenCalledOnce();
    expect(fixture.reminders.dismiss).not.toHaveBeenCalled();
    expect(fixture.reminders.snooze).not.toHaveBeenCalled();
  });

  it("closes removed reminders and ignores stale interactions", () => {
    const fixture = createFixture();
    fixture.service.start();
    const notification = notificationMock.MockNotification.instances[0];
    fixture.publish({ ...fixture.state, items: [] });
    notification.emit("click");
    notification.emit("action", { actionIndex: 1 });
    expect(notification.close).toHaveBeenCalledOnce();
    expect(fixture.eventActions.openInApp).not.toHaveBeenCalled();
    expect(fixture.reminders.dismiss).not.toHaveBeenCalled();
  });

  it("does not create a notification when unsupported", () => {
    notificationMock.MockNotification.isSupported.mockReturnValue(false);
    createFixture().service.start();
    expect(notificationMock.MockNotification.instances).toHaveLength(0);
  });

  it("localizes all-day reminders and releases notifications on stop", () => {
    setMainLocale("it");
    const fixture = createFixture();
    fixture.state.locale = "it";
    fixture.state.items[0].isAllDay = true;
    fixture.service.start();
    const notification = notificationMock.MockNotification.instances[0];
    expect(notification.options.title).toBe("Promemoria");
    expect(notification.options.body).toContain("mar");
    fixture.service.stop();
    expect(notification.close).toHaveBeenCalledOnce();
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
    expect(fixture.reminders.dismiss).not.toHaveBeenCalled();
  });
});
