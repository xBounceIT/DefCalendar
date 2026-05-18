import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import createMainWindow from "../src/main/window";

interface MockBrowserWindowInstance {
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  webContents: {
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    getURL: ReturnType<typeof vi.fn>;
  };
  options: Record<string, unknown>;
}

const { BrowserWindowMock, openExternalMock } = vi.hoisted(() => {
  const openExternalMock = vi.fn();

  class BrowserWindowMock {
    public loadURL = vi.fn();
    public loadFile = vi.fn();
    public show = vi.fn();
    public once = vi.fn();
    public webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      getURL: vi.fn().mockReturnValue("http://localhost:5173/"),
    };
    public options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  return { BrowserWindowMock, openExternalMock };
});

vi.mock(import("@main/electron-runtime"), () => ({
  app: { isPackaged: false },
  BrowserWindow: BrowserWindowMock,
  shell: {
    openExternal: openExternalMock,
  },
}));

vi.mock(import("@main/i18n"), () => ({
  t: vi.fn().mockReturnValue("DefCalendar"),
}));

beforeEach(() => {
  openExternalMock.mockReset();
});

afterEach(() => {
  delete process.env.ELECTRON_RENDERER_URL;
});

function makeWindow(): MockBrowserWindowInstance {
  return createMainWindow() as unknown as MockBrowserWindowInstance;
}

describe("createMainWindow — security configuration", () => {
  it("creates the window with sandbox + contextIsolation enforced", () => {
    const win = makeWindow();
    const webPreferences = win.options.webPreferences as Record<string, unknown>;

    expect(webPreferences.sandbox).toBe(true);
    expect(webPreferences.contextIsolation).toBe(true);
    expect(webPreferences.nodeIntegration).toBe(false);
    expectTypeOf(webPreferences.preload).toBeString();
    expect(webPreferences.preload).toMatch(/preload[\\/]index\.cjs$/);
  });

  it("denies new-window requests and forwards URL to the OS browser", () => {
    const win = makeWindow();
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (input: {
      url: string;
    }) => { action: string };

    const result = handler({ url: "https://example.com/page" });

    expect(result).toStrictEqual({ action: "deny" });
    expect(openExternalMock).toHaveBeenCalledWith("https://example.com/page");
  });

  it("intercepts external navigation via will-navigate", () => {
    const win = makeWindow();
    const willNavigate = win.webContents.on.mock.calls.find(
      ([event]) => event === "will-navigate",
    )?.[1] as (event: { preventDefault: () => void }, url: string) => void;
    const event = { preventDefault: vi.fn() };

    willNavigate(event, "https://external.test/path");

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternalMock).toHaveBeenCalledWith("https://external.test/path");
  });

  it("does NOT intercept will-navigate when target equals the current URL", () => {
    const win = makeWindow();
    const willNavigate = win.webContents.on.mock.calls.find(
      ([event]) => event === "will-navigate",
    )?.[1] as (event: { preventDefault: () => void }, url: string) => void;
    const event = { preventDefault: vi.fn() };

    willNavigate(event, "http://localhost:5173/");

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openExternalMock).not.toHaveBeenCalled();
  });
});

describe("createMainWindow — load source", () => {
  it("loads the dev URL when ELECTRON_RENDERER_URL is set", () => {
    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173/";
    const win = makeWindow();

    expect(win.loadURL).toHaveBeenCalledWith("http://localhost:5173/");
    expect(win.loadFile).not.toHaveBeenCalled();
  });

  it("loads the bundled HTML file when ELECTRON_RENDERER_URL is not set", () => {
    const win = makeWindow();

    expect(win.loadFile).toHaveBeenCalledOnce();
    expect(win.loadURL).not.toHaveBeenCalled();
    expect(win.loadFile.mock.calls[0]?.[0] as string).toMatch(/renderer[\\/]index\.html$/);
  });

  it("calls window.show() once ready-to-show fires", () => {
    const win = makeWindow();
    const onceCall = win.once.mock.calls.find(([event]) => event === "ready-to-show");
    expect(onceCall).toBeDefined();
    const handler = onceCall?.[1] as () => void;

    handler();
    expect(win.show).toHaveBeenCalledOnce();
  });
});
