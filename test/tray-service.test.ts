import { beforeEach, describe, expect, it, vi } from "vitest";
import TrayService from "../src/main/tray-service";

interface MockTrayInstance {
  setToolTip: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

interface MenuItemTemplate {
  label?: string;
  type?: string;
  click?: () => void;
}

const menuTemplates: MenuItemTemplate[][] = [];

const { TrayMock, trayInstances, buildFromTemplateMock, createFromPathMock, isPackagedRef } =
  vi.hoisted(() => {
    const trayInstances: MockTrayInstance[] = [];
    const isPackagedRef = { value: false };

    class TrayMock {
      public setToolTip = vi.fn();
      public setContextMenu = vi.fn();
      public on = vi.fn();
      public destroy = vi.fn();
      constructor(_icon: unknown) {
        trayInstances.push(this as unknown as MockTrayInstance);
      }
    }

    return {
      TrayMock,
      trayInstances,
      buildFromTemplateMock: vi.fn(),
      createFromPathMock: vi.fn((path: string) => ({ path })),
      isPackagedRef,
    };
  });

vi.mock(import("electron"), () => ({
  Menu: { buildFromTemplate: buildFromTemplateMock },
  Tray: TrayMock,
  nativeImage: { createFromPath: createFromPathMock },
}));

vi.mock(import("@main/electron-runtime"), () => ({
  app: {
    get isPackaged() {
      return isPackagedRef.value;
    },
  },
}));

beforeEach(() => {
  trayInstances.length = 0;
  menuTemplates.length = 0;
  isPackagedRef.value = false;
  buildFromTemplateMock.mockReset();
  buildFromTemplateMock.mockImplementation((template: MenuItemTemplate[]) => {
    menuTemplates.push(template);
    return { template };
  });
  createFromPathMock.mockClear();
});

function createHandlers() {
  return {
    showWindow: vi.fn(),
    refreshNow: vi.fn(),
    signOut: vi.fn(),
    quit: vi.fn(),
  };
}

describe("trayService.create", () => {
  it("creates a Tray with icon, tooltip, click handler, and context menu", () => {
    new TrayService(createHandlers()).create();

    expect(createFromPathMock).toHaveBeenCalledOnce();
    expect(buildFromTemplateMock).toHaveBeenCalledOnce();
    const template = menuTemplates[0];
    expect(template?.map((item) => item.label ?? item.type)).toStrictEqual([
      "Show DefCalendar",
      "Refresh Now",
      "separator",
      "Sign Out",
      "Quit",
    ]);
  });

  it("is idempotent — does not recreate tray on second call", () => {
    const service = new TrayService(createHandlers());

    service.create();
    service.create();

    expect(createFromPathMock).toHaveBeenCalledOnce();
    expect(buildFromTemplateMock).toHaveBeenCalledOnce();
  });

  it("uses resourcesPath for the icon when packaged", () => {
    isPackagedRef.value = true;
    const originalResourcesPath = process.resourcesPath;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/app/resources",
    });

    try {
      new TrayService(createHandlers()).create();
      expect(createFromPathMock).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]app[\\/]resources[\\/]logo\.png$/),
      );
    } finally {
      Object.defineProperty(process, "resourcesPath", {
        configurable: true,
        value: originalResourcesPath,
      });
    }
  });

  it("uses cwd resources directory when not packaged", () => {
    new TrayService(createHandlers()).create();
    const passed = createFromPathMock.mock.calls[0]?.[0] as string;
    expect(passed).toMatch(/resources[\\/]logo\.png$/);
  });
});

describe("trayService menu handlers", () => {
  it("each menu item invokes the matching handler", () => {
    const handlers = createHandlers();
    new TrayService(handlers).create();
    const template = menuTemplates[0];
    if (!template) {
      throw new Error("expected template to be captured");
    }
    const find = (label: string) => template.find((item) => item.label === label);

    find("Show DefCalendar")?.click?.();
    expect(handlers.showWindow).toHaveBeenCalledOnce();

    find("Refresh Now")?.click?.();
    expect(handlers.refreshNow).toHaveBeenCalledOnce();

    find("Sign Out")?.click?.();
    expect(handlers.signOut).toHaveBeenCalledOnce();

    find("Quit")?.click?.();
    expect(handlers.quit).toHaveBeenCalledOnce();
  });

  it("tray click handler invokes showWindow", () => {
    const handlers = createHandlers();
    new TrayService(handlers).create();
    const tray = trayInstances[0]!;
    const clickHandler = tray.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | (() => void)
      | undefined;
    expect(clickHandler).toBeDefined();
    clickHandler?.();
    expect(handlers.showWindow).toHaveBeenCalledOnce();
  });

  it("tolerates a Promise return from signOut without unhandled rejection", () => {
    const handlers = {
      ...createHandlers(),
      signOut: vi.fn().mockRejectedValue(new Error("ignore")),
    };
    new TrayService(handlers).create();
    const template = menuTemplates[0];
    const signOut = template?.find((item) => item.label === "Sign Out");

    expect(() => signOut?.click?.()).not.toThrow();
    expect(handlers.signOut).toHaveBeenCalledOnce();
  });
});

describe("trayService.destroy and refreshMenu", () => {
  it("destroy() invokes tray.destroy and allows a fresh create() to recreate it", () => {
    const service = new TrayService(createHandlers());
    service.create();
    const tray = trayInstances[0]!;

    service.destroy();
    service.create();

    expect(tray.destroy).toHaveBeenCalledOnce();
    expect(trayInstances).toHaveLength(2);
  });

  it("refreshMenu() rebuilds the context menu when tray exists", () => {
    const service = new TrayService(createHandlers());
    service.create();
    buildFromTemplateMock.mockClear();

    service.refreshMenu();

    expect(buildFromTemplateMock).toHaveBeenCalledOnce();
  });

  it("refreshMenu() is a no-op when tray was never created", () => {
    const service = new TrayService(createHandlers());
    buildFromTemplateMock.mockClear();

    service.refreshMenu();

    expect(buildFromTemplateMock).not.toHaveBeenCalled();
  });
});
