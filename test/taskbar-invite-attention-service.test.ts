import { describe, expect, it, vi } from "vitest";
import TaskbarInviteAttentionService from "../src/main/notifications/taskbar-invite-attention-service";
import { createDefaultSettings } from "../src/shared/schemas";
import type { NewEventNotificationItem, UserSettings } from "../src/shared/schemas";

const electronRuntimeMock = vi.hoisted(() => ({
  app: {
    setBadgeCount: vi.fn(() => true),
  },
  nativeImage: {
    createFromBuffer: vi.fn((buffer: Buffer) => ({ buffer })),
  },
}));

vi.mock(import("@main/electron-runtime"), () => electronRuntimeMock);

type ItemsListener = (items: NewEventNotificationItem[]) => void;

interface MockWindow {
  flashFrame: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  isFocused: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  setOverlayIcon?: ReturnType<typeof vi.fn>;
  showInactive: ReturnType<typeof vi.fn>;
}

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

function createWindow(overrides: Partial<MockWindow> = {}): MockWindow {
  return {
    flashFrame: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isFocused: vi.fn().mockReturnValue(false),
    isMinimized: vi.fn().mockReturnValue(false),
    isVisible: vi.fn().mockReturnValue(true),
    setOverlayIcon: vi.fn(),
    showInactive: vi.fn(),
    ...overrides,
  };
}

function createService(args?: {
  items?: NewEventNotificationItem[];
  settings?: UserSettings;
  window?: MockWindow | null;
}) {
  let listener: ItemsListener | null = null;
  const items = args?.items ?? [];
  const settings = args?.settings ?? createDefaultSettings();
  const window = args?.window === undefined ? createWindow() : args.window;
  const newEventNotifications = {
    getItems: vi.fn().mockReturnValue(items),
    onChange: vi.fn((nextListener: ItemsListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
  };
  const settingsService = {
    getSettings: vi.fn().mockReturnValue(settings),
  };
  const service = new TaskbarInviteAttentionService({
    getMainWindow: () => window as never,
    newEventNotifications: newEventNotifications as never,
    settings: settingsService as never,
  });

  return {
    get listener() {
      return listener;
    },
    newEventNotifications,
    service,
    settings: settingsService,
    window,
  };
}

function resetMocks(): void {
  vi.clearAllMocks();
}

describe("taskbar invite attention service", () => {
  it("flashes and badges pending invitations", () => {
    expect.hasAssertions();
    resetMocks();
    const fixture = createService({
      items: [createItem(), createItem({ eventId: "event-2" })],
    });

    fixture.service.start();

    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenCalledWith(2);
    expect(electronRuntimeMock.nativeImage.createFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
    );
    expect(fixture.window?.setOverlayIcon).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(Buffer) }),
      "2 pending event invitations",
    );
    expect(fixture.window?.flashFrame).toHaveBeenCalledWith(true);
  });

  it("shows a hidden tray window without focusing before flashing", () => {
    expect.hasAssertions();
    resetMocks();
    const window = createWindow({
      isVisible: vi.fn().mockReturnValue(false),
    });
    const fixture = createService({ items: [createItem()], window });

    fixture.service.start();

    expect(window.showInactive).toHaveBeenCalledOnce();
    expect(window.setOverlayIcon).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(Buffer) }),
      "1 pending event invitation",
    );
    expect(window.flashFrame).toHaveBeenCalledWith(true);
  });

  it("updates and clears attention as the invite queue changes", () => {
    expect.hasAssertions();
    resetMocks();
    const fixture = createService({ items: [createItem()] });

    fixture.service.start();
    fixture.listener?.([
      createItem(),
      createItem({ eventId: "event-2" }),
      createItem({ eventId: "event-3" }),
    ]);
    fixture.listener?.([]);

    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenCalledWith(3);
    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(fixture.window?.setOverlayIcon).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(Buffer) }),
      "3 pending event invitations",
    );
    expect(fixture.window?.setOverlayIcon).toHaveBeenLastCalledWith(null, "");
    expect(fixture.window?.flashFrame).toHaveBeenCalledWith(false);
  });

  it("does not flash a focused window", () => {
    expect.hasAssertions();
    resetMocks();
    const window = createWindow({
      isFocused: vi.fn().mockReturnValue(true),
    });
    const fixture = createService({ items: [createItem()], window });

    fixture.service.start();

    expect(window.setOverlayIcon).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(Buffer) }),
      "1 pending event invitation",
    );
    expect(window.flashFrame).not.toHaveBeenCalledWith(true);
  });

  it("keeps badge and flash behavior when overlay icons are unavailable", () => {
    expect.hasAssertions();
    resetMocks();
    const window = createWindow({
      setOverlayIcon: undefined,
    });
    const fixture = createService({ items: [createItem()], window });

    fixture.service.start();

    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenCalledWith(1);
    expect(electronRuntimeMock.nativeImage.createFromBuffer).not.toHaveBeenCalled();
    expect(window.flashFrame).toHaveBeenCalledWith(true);
  });

  it("stops flashing on focus without clearing the badge", () => {
    expect.hasAssertions();
    resetMocks();
    const fixture = createService({ items: [createItem()] });

    fixture.service.start();
    fixture.service.stopFlashing();

    expect(fixture.window?.flashFrame).toHaveBeenCalledWith(true);
    expect(fixture.window?.flashFrame).toHaveBeenCalledWith(false);
    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenLastCalledWith(1);
  });

  it("clears attention when disabled", () => {
    expect.hasAssertions();
    resetMocks();
    const window = createWindow();
    const fixture = createService({
      items: [createItem()],
      settings: {
        ...createDefaultSettings(),
        taskbarInviteNotificationsEnabled: false,
      },
      window,
    });

    fixture.service.start();

    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenCalledWith(0);
    expect(window.setOverlayIcon).toHaveBeenCalledWith(null, "");
    expect(window.flashFrame).not.toHaveBeenCalledWith(true);
  });

  it("handles missing and destroyed windows without throwing", () => {
    expect.hasAssertions();
    resetMocks();
    const missingWindowFixture = createService({ items: [createItem()], window: null });
    const destroyedWindow = createWindow({
      isDestroyed: vi.fn().mockReturnValue(true),
    });
    const destroyedWindowFixture = createService({
      items: [createItem({ eventId: "event-2" })],
      window: destroyedWindow,
    });

    expect(() => missingWindowFixture.service.start()).not.toThrow();
    expect(() => destroyedWindowFixture.service.start()).not.toThrow();

    expect(electronRuntimeMock.app.setBadgeCount).toHaveBeenCalledWith(1);
    expect(destroyedWindow.setOverlayIcon).not.toHaveBeenCalled();
    expect(destroyedWindow.flashFrame).not.toHaveBeenCalled();
  });
});
