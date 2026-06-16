import { describe, expect, it, vi } from "vitest";
import SystemInviteNotificationService from "../src/main/notifications/system-invite-notification-service";
import { createDefaultSettings } from "../src/shared/schemas";
import type { NewEventNotificationItem, UserSettings } from "../src/shared/schemas";

const notificationMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const instances: unknown[] = [];

  class MockNotification {
    static isSupported = vi.fn(() => true);

    readonly handlers = new Map<string, Handler[]>();
    readonly options: Record<string, unknown>;
    readonly close = vi.fn(() => {
      this.emit("close");
    });
    readonly show = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
    }

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  return {
    MockNotification,
    instances: instances as MockNotification[],
  };
});

vi.mock(import("@main/electron-runtime"), () => ({
  Notification: notificationMock.MockNotification,
}));

function createItem(overrides: Partial<NewEventNotificationItem> = {}): NewEventNotificationItem {
  return {
    calendarId: "calendar-1",
    end: "2026-03-30T11:00:00.000Z",
    eventId: "event-1",
    isAllDay: false,
    location: "Room 3",
    onlineMeetingJoinUrl: null,
    organizerEmail: "organizer@example.com",
    organizerName: "Organizer",
    start: "2026-03-30T10:00:00.000Z",
    subject: "Planning",
    ...overrides,
  };
}

function createService(args?: {
  items?: NewEventNotificationItem[];
  respondToEvent?: ReturnType<typeof vi.fn>;
  settings?: UserSettings;
}) {
  const settings = args?.settings ?? {
    ...createDefaultSettings(),
    systemInviteNotificationsEnabled: true,
  };
  const items = args?.items ?? [];
  const onChange = vi.fn();
  const eventActions = {
    openInApp: vi.fn().mockReturnValue(true),
    respondToEvent: args?.respondToEvent ?? vi.fn().mockResolvedValue(undefined),
  };
  const newEventNotifications = {
    getItems: vi.fn().mockReturnValue(items),
    onChange,
  };
  const settingsService = {
    getSettings: vi.fn().mockReturnValue(settings),
  };
  const service = new SystemInviteNotificationService({
    eventActions: eventActions as never,
    newEventNotifications: newEventNotifications as never,
    settings: settingsService as never,
  });

  return {
    eventActions,
    newEventNotifications,
    settings: settingsService,
    service,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function resetNotificationMock(): void {
  notificationMock.instances.length = 0;
  notificationMock.MockNotification.isSupported.mockReturnValue(true);
  vi.clearAllMocks();
}

describe("system invite notification service", () => {
  it("does not show notifications when the setting is disabled", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { service } = createService({
      settings: createDefaultSettings(),
    });

    service.sync([createItem()]);

    expect(notificationMock.instances).toHaveLength(0);
  });

  it("does not show notifications when native notifications are unsupported", () => {
    expect.hasAssertions();
    resetNotificationMock();
    notificationMock.MockNotification.isSupported.mockReturnValue(false);
    const { service } = createService();

    service.sync([createItem()]);

    expect(notificationMock.instances).toHaveLength(0);
  });

  it("shows one notification with three response actions per invite", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { service } = createService();

    service.sync([createItem()]);
    service.sync([createItem()]);

    expect(notificationMock.instances).toHaveLength(1);
    expect(notificationMock.instances[0].options).toMatchObject({
      actions: [
        { text: "Accept", type: "button" },
        { text: "Tentative", type: "button" },
        { text: "Decline", type: "button" },
      ],
      groupId: "defcalendar-invites",
      id: "invite:calendar-1:event-1",
      title: "New invitation",
    });
    expect(notificationMock.instances[0].options).not.toHaveProperty("timeoutType");
    expect(notificationMock.instances[0].show).toHaveBeenCalledOnce();
  });

  it("reads settings once while showing multiple invites in a sync pass", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { service, settings } = createService();

    service.sync([createItem(), createItem({ eventId: "event-2" })]);

    expect(settings.getSettings).toHaveBeenCalledOnce();
    expect(notificationMock.instances).toHaveLength(2);
  });

  it("opens the event when the notification body is clicked", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { eventActions, service } = createService();

    service.sync([createItem()]);
    notificationMock.instances[0].emit("click");

    expect(eventActions.openInApp).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "event-1",
    });
  });

  it("keeps notification handlers alive after Windows closes the live toast banner", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { eventActions, service } = createService();

    service.sync([createItem()]);
    notificationMock.instances[0].emit("close");
    notificationMock.instances[0].emit("click");
    service.sync([createItem()]);

    expect(eventActions.openInApp).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "event-1",
    });
    expect(notificationMock.instances).toHaveLength(1);
  });

  it("opens the event for accept actions so overlap checks run in the app", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { eventActions, service } = createService();

    service.sync([createItem()]);
    notificationMock.instances[0].emit("action", { actionIndex: 0 });

    expect(eventActions.openInApp).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "event-1",
    });
    expect(eventActions.respondToEvent).not.toHaveBeenCalled();
    expect(notificationMock.instances[0].close).toHaveBeenCalledOnce();
  });

  it("responds to tentative and decline action button clicks through the shared event action service", async () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { eventActions, service } = createService();

    service.sync([createItem()]);
    notificationMock.instances[0].emit("action", { actionIndex: 1 });
    await flushPromises();

    expect(eventActions.respondToEvent).toHaveBeenCalledWith({
      action: "tentative",
      calendarId: "calendar-1",
      comment: "",
      eventId: "event-1",
      sendResponse: true,
    });
    expect(notificationMock.instances[0].close).toHaveBeenCalledOnce();
  });

  it("keeps the invite pending and opens the event when responding fails", async () => {
    expect.hasAssertions();
    resetNotificationMock();
    const respondToEvent = vi.fn().mockRejectedValue(new Error("Graph failed"));
    const { eventActions, service } = createService({ respondToEvent });

    service.sync([createItem()]);
    notificationMock.instances[0].emit("action", { actionIndex: 2 });
    await flushPromises();

    expect(notificationMock.instances[0].close).not.toHaveBeenCalled();
    expect(eventActions.openInApp).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      eventId: "event-1",
    });
  });

  it("closes active notifications when pending invites are cleared", () => {
    expect.hasAssertions();
    resetNotificationMock();
    const { service } = createService();

    service.sync([createItem()]);
    service.sync([]);

    expect(notificationMock.instances[0].close).toHaveBeenCalledOnce();
  });
});
