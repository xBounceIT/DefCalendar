import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewEventWindowManager from "../src/main/notifications/new-event-window";
import { IPC_CHANNELS, type NewEventNotificationItem } from "../src/shared/ipc";

const electron = vi.hoisted(() => {
  const load = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  class Window {
    readonly handlers = new Map<string, () => void>();
    readonly webHandlers = new Map<string, () => void>();
    readonly webContents = {
      on: vi.fn((event: string, handler: () => void) => this.webHandlers.set(event, handler)),
      send: vi.fn(),
    };
    readonly show = vi.fn();
    readonly moveTop = vi.fn();
    readonly focus = vi.fn();
    readonly restore = vi.fn();
    readonly isMinimized = vi.fn(() => false);
    readonly isDestroyed = vi.fn(() => false);
    readonly close = vi.fn(() => {
      this.handlers.get("close")?.();
      this.isDestroyed.mockReturnValue(true);
      this.handlers.get("closed")?.();
    });
    readonly loadURL = vi.fn(() => load());
    readonly loadFile = vi.fn(() => load());
    readonly on = vi.fn((event: string, handler: () => void) => this.handlers.set(event, handler));
    readonly once = this.on;

    constructor(readonly options: Record<string, unknown>) {
      instances.push(this);
    }
  }
  const instances: Window[] = [];
  return {
    BrowserWindow: Window,
    instances,
    load,
    screen: {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    },
  };
});

vi.mock("@main/electron-runtime", () => electron);

const items = [{ calendarId: "calendar-1", eventId: "event-1" }] as NewEventNotificationItem[];

beforeEach(() => {
  electron.instances.length = 0;
  electron.load.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("new event window", () => {
  it("presents only an independent secure popup when it is ready", () => {
    const manager = new NewEventWindowManager(vi.fn());
    manager.sync(items, true, true);
    const window = electron.instances[0];

    expect(window.options).toMatchObject({
      alwaysOnTop: true,
      show: false,
      skipTaskbar: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    expect(window.options).not.toHaveProperty("parent");
    expect(window.show).not.toHaveBeenCalled();
    window.handlers.get("ready-to-show")?.();

    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.moveTop).toHaveBeenCalledOnce();
    expect(window.loadFile).toHaveBeenCalledWith(expect.stringContaining("new-event-popup.html"));
    expect(manager.ownsWebContents(window.webContents as never)).toBe(true);
    expect(manager.ownsWebContents({} as never)).toBe(false);
  });

  it("loads the development popup entry", () => {
    vi.stubEnv("ELECTRON_RENDERER_URL", "http://localhost:5173");
    new NewEventWindowManager(vi.fn()).sync(items, true, true);
    expect(electron.instances[0].loadURL).toHaveBeenCalledWith(
      "http://localhost:5173/new-event-popup.html",
    );
  });

  it("refreshes taskbar attention after showing or focusing the active popup", () => {
    const onAttentionChanged = vi.fn();
    const manager = new NewEventWindowManager(vi.fn(), onAttentionChanged);
    manager.sync(items, true, true);
    const window = electron.instances[0];
    expect(manager.getWindow()).toBe(window);

    window.handlers.get("show")?.();
    window.handlers.get("focus")?.();
    expect(onAttentionChanged).toHaveBeenCalledTimes(2);

    manager.close();
    expect(manager.getWindow()).toBeNull();
    window.handlers.get("show")?.();
    window.handlers.get("focus")?.();
    expect(onAttentionChanged).toHaveBeenCalledTimes(2);
  });

  it("replaces a closing popup before native closed arrives and ignores its late events", () => {
    const onDismiss = vi.fn();
    const manager = new NewEventWindowManager(onDismiss);
    manager.sync(items, true, true);
    const closing = electron.instances[0];
    closing.handlers.get("ready-to-show")?.();
    closing.close.mockImplementation(() => undefined);

    manager.sync([], true);
    expect(manager.ownsWebContents(closing.webContents as never)).toBe(false);
    const nextItems = [{ ...items[0], eventId: "event-2" }];
    manager.sync(nextItems, true, true);

    expect(electron.instances).toHaveLength(2);
    const replacement = electron.instances[1];
    closing.handlers.get("ready-to-show")?.();
    closing.webHandlers.get("did-finish-load")?.();
    closing.handlers.get("closed")?.();
    replacement.webHandlers.get("did-finish-load")?.();
    replacement.handlers.get("ready-to-show")?.();

    expect(onDismiss).not.toHaveBeenCalled();
    expect(manager.ownsWebContents(replacement.webContents as never)).toBe(true);
    expect(replacement.focus).toHaveBeenCalledOnce();
    expect(replacement.webContents.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.newEventNotificationsChanged,
      nextItems,
    );
    expect(closing.focus).toHaveBeenCalledOnce();
  });

  it("dismisses the queue on native closure but preserves it on programmatic closure", () => {
    const onDismiss = vi.fn();
    const manager = new NewEventWindowManager(onDismiss);
    manager.sync(items, true, true);
    electron.instances[0].close();

    expect(onDismiss).toHaveBeenCalledOnce();
    manager.sync(items, true, true);
    manager.sync(items, false);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("handles native closure before teardown so a later arrival is not dismissed", () => {
    const onDismiss = vi.fn();
    const manager = new NewEventWindowManager(onDismiss);
    onDismiss.mockImplementation(() => manager.sync([], true));
    manager.sync(items, true, true);
    const closing = electron.instances[0];
    closing.handlers.get("close")?.();

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(manager.ownsWebContents(closing.webContents as never)).toBe(false);
    manager.sync([{ ...items[0], eventId: "event-2" }], true, true);
    closing.handlers.get("closed")?.();
    closing.handlers.get("close")?.();

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(electron.instances).toHaveLength(2);
    expect(manager.ownsWebContents(electron.instances[1].webContents as never)).toBe(true);
  });

  it.each(["development", "bundled"])(
    "releases a rejected %s load and allows recovery",
    async (entry) => {
      if (entry === "development") {
        vi.stubEnv("ELECTRON_RENDERER_URL", "http://localhost:5173");
      }
      let rejectLoad: (reason: Error) => void = () => undefined;
      const failedLoad = new Promise<void>((_resolve, reject) => {
        rejectLoad = reject;
      });
      electron.load.mockReturnValueOnce(failedLoad);
      const onDismiss = vi.fn();
      const manager = new NewEventWindowManager(onDismiss);
      manager.sync(items, true, true);
      const failed = electron.instances[0];
      const load = entry === "development" ? failed.loadURL : failed.loadFile;
      expect(load).toHaveBeenCalledOnce();
      rejectLoad(new Error("ERR_FILE_NOT_FOUND"));
      await failedLoad.catch(() => undefined);
      expect(failed.close).toHaveBeenCalledOnce();
      expect(onDismiss).not.toHaveBeenCalled();
      manager.sync(items, true, true);
      expect(electron.instances).toHaveLength(2);
    },
  );

  it("recovers from a crashed renderer without dismissing or disrupting a replacement", () => {
    const onDismiss = vi.fn();
    const manager = new NewEventWindowManager(onDismiss);
    manager.sync(items, true, true);
    const crashed = electron.instances[0];
    crashed.webHandlers.get("render-process-gone")?.();
    expect(crashed.close).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();

    manager.sync(items, true, true);
    crashed.webHandlers.get("render-process-gone")?.();
    expect(electron.instances[1].close).not.toHaveBeenCalled();
  });

  it("ignores a failed load after that popup was replaced", async () => {
    let rejectLoad: (reason: Error) => void = () => undefined;
    const pendingLoad = new Promise<void>((_resolve, reject) => {
      rejectLoad = reject;
    });
    electron.load.mockReturnValueOnce(pendingLoad);
    const manager = new NewEventWindowManager(vi.fn());
    manager.sync(items, true, true);
    manager.close();
    manager.sync(items, true, true);

    rejectLoad(new Error("ERR_ABORTED"));
    await pendingLoad.catch(() => undefined);

    expect(electron.instances[1].close).not.toHaveBeenCalled();
    expect(manager.ownsWebContents(electron.instances[1].webContents as never)).toBe(true);
  });

  it("coalesces early arrivals and delivers only the latest queue without another focus", () => {
    const manager = new NewEventWindowManager(vi.fn());
    manager.sync(items, true, true);
    const window = electron.instances[0];
    const nextItems = [...items, { ...items[0], calendarId: "暦-2" }];
    manager.sync(nextItems, true, true);
    manager.sync(nextItems.toReversed(), true);
    window.webHandlers.get("did-finish-load")?.();
    window.handlers.get("ready-to-show")?.();
    manager.sync(nextItems, true);

    expect(electron.instances).toHaveLength(1);
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.newEventNotificationsChanged,
      nextItems,
    );
  });

  it("updates the queue without stealing focus and restores only the popup for a new invite", () => {
    const manager = new NewEventWindowManager(vi.fn());
    manager.sync(items, true, true);
    const window = electron.instances[0];
    window.handlers.get("ready-to-show")?.();
    window.webHandlers.get("did-finish-load")?.();

    manager.sync(items, true);

    expect(window.webContents.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.newEventNotificationsChanged,
      items,
    );
    expect(window.focus).toHaveBeenCalledOnce();
    window.isMinimized.mockReturnValue(true);
    manager.sync([...items, { ...items[0], eventId: "event-2" }], true, true);

    expect(electron.instances).toHaveLength(1);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledTimes(2);
  });

  it.each(["disabled", "empty"])(
    "closes the popup when %s, including before it is ready",
    (reason) => {
      const manager = new NewEventWindowManager(vi.fn());
      manager.sync(items, true, true);
      const window = electron.instances[0];

      manager.sync(reason === "empty" ? [] : items, reason !== "disabled");
      window.handlers.get("ready-to-show")?.();

      expect(window.close).toHaveBeenCalledOnce();
      expect(window.focus).not.toHaveBeenCalled();
      expect(manager.ownsWebContents(window.webContents as never)).toBe(false);
    },
  );

  it("keeps dismissed popups closed until another invite arrives", () => {
    const manager = new NewEventWindowManager(vi.fn());
    manager.sync(items, false, true);
    manager.sync(items, true);
    expect(electron.instances).toHaveLength(0);

    manager.sync(items, true, true);
    manager.close();
    manager.sync(items, true);
    expect(electron.instances).toHaveLength(1);

    manager.sync(items, true, true);
    electron.instances[0].handlers.get("ready-to-show")?.();
    const replacement = electron.instances[1];
    expect(replacement.focus).not.toHaveBeenCalled();
    replacement.handlers.get("ready-to-show")?.();
    expect(replacement.focus).toHaveBeenCalledOnce();
  });
});
