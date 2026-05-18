import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS, type ReminderDialogState } from "@shared/ipc";
import ReminderWindowManager from "../src/main/reminders/reminder-window";

interface FakeWebContents {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

interface FakeWindow {
  webContents: FakeWebContents;
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  moveTop: ReturnType<typeof vi.fn>;
  minimize: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  fireOnce: (event: string) => void;
  fireWebEvent: (event: string) => void;
  fireOn: (event: string) => void;
  options: Record<string, unknown>;
}

const fakeWindows: FakeWindow[] = [];

const { BrowserWindowMock, beepMock, screenMock } = vi.hoisted(() => {
  const beepMock = vi.fn();
  const screenMock = {
    getPrimaryDisplay: vi.fn().mockReturnValue({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  };

  const onceHandlers = new WeakMap<object, Map<string, () => void>>();
  const onHandlers = new WeakMap<object, Map<string, () => void>>();
  const webOnHandlers = new WeakMap<object, Map<string, () => void>>();

  function makeWindow(options: Record<string, unknown>): FakeWindow {
    const webContents: FakeWebContents = {
      on: vi.fn(),
      send: vi.fn(),
    };
    const win: FakeWindow = {
      webContents,
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      moveTop: vi.fn(),
      minimize: vi.fn(),
      restore: vi.fn(),
      close: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      isMinimized: vi.fn().mockReturnValue(false),
      isVisible: vi.fn().mockReturnValue(false),
      isDestroyed: vi.fn().mockReturnValue(false),
      on: vi.fn((event: string, cb: () => void) => {
        const map = onHandlers.get(win) ?? new Map();
        map.set(event, cb);
        onHandlers.set(win, map);
      }),
      once: vi.fn((event: string, cb: () => void) => {
        const map = onceHandlers.get(win) ?? new Map();
        map.set(event, cb);
        onceHandlers.set(win, map);
      }),
      fireOnce: (event: string) => {
        const cb = onceHandlers.get(win)?.get(event);
        if (!cb) {
          throw new Error(`No once handler for ${event}`);
        }
        cb();
      },
      fireOn: (event: string) => {
        const cb = onHandlers.get(win)?.get(event);
        if (!cb) {
          throw new Error(`No on handler for ${event}`);
        }
        cb();
      },
      fireWebEvent: (event: string) => {
        const cb = webOnHandlers.get(webContents)?.get(event);
        if (!cb) {
          throw new Error(`No webContents on handler for ${event}`);
        }
        cb();
      },
      options,
    };
    webContents.on.mockImplementation((event: string, cb: () => void) => {
      const map = webOnHandlers.get(webContents) ?? new Map();
      map.set(event, cb);
      webOnHandlers.set(webContents, map);
    });
    fakeWindows.push(win);
    return win;
  }

  function BrowserWindowMock(options: Record<string, unknown>) {
    return makeWindow(options);
  }

  return { BrowserWindowMock, beepMock, screenMock };
});

vi.mock(import("@main/electron-runtime"), () => ({
  BrowserWindow: BrowserWindowMock,
  screen: screenMock,
  shell: {
    beep: beepMock,
  },
}));

vi.mock(import("../src/main/i18n"), () => ({
  t: vi.fn().mockReturnValue("Reminder"),
}));

const STATE: ReminderDialogState = {
  items: [
    {
      calendarId: "cal-1",
      dedupeKey: "cal-1:event-1:start:start",
      end: "2026-04-01T10:30:00.000Z",
      eventId: "event-1",
      isAllDay: false,
      location: null,
      reminderType: "start",
      snoozeOptionsMinutes: [5, 10, 15],
      start: "2026-04-01T10:00:00.000Z",
      subject: "Standup",
    },
  ],
  locale: "en",
  timeFormat: "system",
};

beforeEach(() => {
  fakeWindows.length = 0;
  beepMock.mockReset();
});

afterEach(() => {
  delete process.env.ELECTRON_RENDERER_URL;
});

describe("reminderWindowManager.show", () => {
  it("creates window with secure webPreferences and loads URL when ELECTRON_RENDERER_URL is set", async () => {
    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173";
    const manager = new ReminderWindowManager();

    manager.show(STATE, false);

    expect(fakeWindows).toHaveLength(1);
    const win = fakeWindows[0]!;
    const webPreferences = win.options.webPreferences as Record<string, unknown>;
    expect(webPreferences.sandbox).toBeTruthy();
    expect(webPreferences.contextIsolation).toBeTruthy();
    expect(webPreferences.nodeIntegration).toBeFalsy();
    expect(win.loadURL).toHaveBeenCalledWith("http://localhost:5173/reminder-popup.html");
    expect(win.loadFile).not.toHaveBeenCalled();
  });

  it("loads bundled file when ELECTRON_RENDERER_URL is unset", async () => {
    const manager = new ReminderWindowManager();

    manager.show(STATE, false);

    const win = fakeWindows[0]!;
    expect(win.loadFile).toHaveBeenCalledOnce();
    expect(win.loadURL).not.toHaveBeenCalled();
  });

  it("defers presentation until ready-to-show, then beeps + focuses if requested", async () => {
    const manager = new ReminderWindowManager();

    manager.show(STATE, true);
    const win = fakeWindows[0]!;
    expect(win.show).not.toHaveBeenCalled();
    expect(beepMock).not.toHaveBeenCalled();

    win.fireOnce("ready-to-show");

    expect(beepMock).toHaveBeenCalledOnce();
    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
    expect(win.moveTop).toHaveBeenCalledOnce();
  });

  it("just shows (no beep/focus) when ready and focus=false and not visible", async () => {
    const manager = new ReminderWindowManager();

    manager.show(STATE, false);
    const win = fakeWindows[0]!;
    win.fireOnce("ready-to-show");
    win.show.mockClear();

    manager.show(STATE, false);

    expect(beepMock).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
    expect(win.show).toHaveBeenCalledOnce();
  });

  it("coalesces focus requests received before ready-to-show", async () => {
    const manager = new ReminderWindowManager();

    manager.show(STATE, false);
    manager.show(STATE, true);
    manager.show(STATE, false);

    const win = fakeWindows[0]!;
    win.fireOnce("ready-to-show");

    expect(beepMock).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it("restores a minimized window when presenting", async () => {
    const manager = new ReminderWindowManager();

    manager.show(STATE, true);
    const win = fakeWindows[0]!;
    win.isMinimized.mockReturnValue(true);
    win.fireOnce("ready-to-show");

    expect(win.restore).toHaveBeenCalledOnce();
  });

  it("pushes state to webContents only after did-finish-load", async () => {
    const manager = new ReminderWindowManager();

    manager.show(STATE, false);
    const win = fakeWindows[0]!;
    expect(win.webContents.send).not.toHaveBeenCalled();

    win.fireWebEvent("did-finish-load");

    expect(win.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.reminderStateChanged, STATE);
  });
});

describe("reminderWindowManager lifecycle", () => {
  it("close() closes window when present", async () => {
    const manager = new ReminderWindowManager();
    manager.show(STATE, false);
    const win = fakeWindows[0]!;

    manager.close();
    expect(win.close).toHaveBeenCalledOnce();
  });

  it("close() is a no-op when no window exists", async () => {
    const manager = new ReminderWindowManager();
    expect(() => manager.close()).not.toThrow();
  });

  it("hasWindow returns true while alive, false after closed", async () => {
    const manager = new ReminderWindowManager();
    manager.show(STATE, false);
    expect(manager.hasWindow()).toBeTruthy();

    const win = fakeWindows[0]!;
    win.fireOn("closed");
    expect(manager.hasWindow()).toBeFalsy();
  });

  it("ownsWebContents returns true only for the active window's webContents", async () => {
    const manager = new ReminderWindowManager();
    manager.show(STATE, false);
    const win = fakeWindows[0]!;

    expect(
      manager.ownsWebContents(win.webContents as unknown as Electron.WebContents),
    ).toBeTruthy();
    expect(manager.ownsWebContents({} as unknown as Electron.WebContents)).toBeFalsy();
  });

  it("minimize() minimizes the window when alive", async () => {
    const manager = new ReminderWindowManager();
    manager.show(STATE, false);
    const win = fakeWindows[0]!;

    manager.minimize();
    expect(win.minimize).toHaveBeenCalledOnce();
  });

  it("show() reuses existing window instead of creating a new one", async () => {
    const manager = new ReminderWindowManager();
    manager.show(STATE, false);
    manager.show(STATE, false);

    expect(fakeWindows).toHaveLength(1);
  });
});
