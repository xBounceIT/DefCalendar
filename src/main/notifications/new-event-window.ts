import type { BrowserWindow as ElectronBrowserWindow, WebContents } from "electron";
import { join } from "pathe";
import { BrowserWindow, screen } from "@main/electron-runtime";
import { t } from "@main/i18n";
import { IPC_CHANNELS, type NewEventNotificationItem } from "@shared/ipc";

const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 460;

class NewEventWindowManager {
  private window: ElectronBrowserWindow | null = null;
  private items: NewEventNotificationItem[] = [];
  private isLoaded = false;
  private isReadyToShow = false;
  private shouldFocusOnReady = false;

  constructor(
    private readonly onDismiss: () => void,
    private readonly onAttentionChanged: () => void = () => undefined,
  ) {}

  sync(items: NewEventNotificationItem[], enabled: boolean, focus = false): void {
    this.items = items;
    if (!enabled || items.length === 0) {
      this.close();
      return;
    }

    if ((!this.window || this.window.isDestroyed()) && !focus) {
      return;
    }

    const window = this.ensureWindow();
    this.pushState();
    if (!this.isReadyToShow) {
      this.shouldFocusOnReady ||= focus;
    } else if (focus) {
      this.present(window);
    }
  }

  close(): void {
    const window = this.window;
    this.releaseWindow();
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  private releaseWindow(): void {
    this.window = null;
    this.isLoaded = false;
    this.isReadyToShow = false;
    this.shouldFocusOnReady = false;
  }

  ownsWebContents(contents: WebContents): boolean {
    return this.getWindow()?.webContents === contents;
  }

  getWindow(): ElectronBrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  private ensureWindow(): ElectronBrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
    const window = new BrowserWindow({
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: "#f4efe7",
      frame: false,
      height: POPUP_HEIGHT,
      maximizable: false,
      minimizable: true,
      resizable: false,
      show: false,
      skipTaskbar: false,
      title: t("inviteNotificationTitle"),
      width: POPUP_WIDTH,
      x: x + Math.round((width - POPUP_WIDTH) / 2),
      y: y + Math.round((height - POPUP_HEIGHT) / 2),
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window = window;
    window.once("ready-to-show", () => {
      if (this.window !== window || window.isDestroyed()) {
        return;
      }
      this.isReadyToShow = true;
      if (this.shouldFocusOnReady) {
        this.shouldFocusOnReady = false;
        this.present(window);
      }
    });
    window.webContents.on("did-finish-load", () => {
      if (this.window === window) {
        this.isLoaded = true;
        this.pushState();
      }
    });
    const dismissWindow = () => {
      if (this.window === window) {
        this.releaseWindow();
        this.onDismiss();
      }
    };
    window.on("close", dismissWindow);
    window.on("closed", dismissWindow);

    const refreshAttention = () => {
      if (this.window === window) {
        this.onAttentionChanged();
      }
    };
    window.on("show", refreshAttention);
    window.on("focus", refreshAttention);

    const closeFailedWindow = () => {
      if (this.window === window) {
        this.close();
      }
    };
    window.webContents.on("render-process-gone", closeFailedWindow);

    if (process.env.ELECTRON_RENDERER_URL) {
      void window
        .loadURL(`${process.env.ELECTRON_RENDERER_URL}/new-event-popup.html`)
        .catch(closeFailedWindow);
    } else {
      void window
        .loadFile(join(__dirname, "../renderer/new-event-popup.html"))
        .catch(closeFailedWindow);
    }

    return window;
  }

  private present(window: ElectronBrowserWindow): void {
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.moveTop();
    window.focus();
  }

  private pushState(): void {
    if (this.window && !this.window.isDestroyed() && this.isLoaded) {
      this.window.webContents.send(IPC_CHANNELS.newEventNotificationsChanged, this.items);
    }
  }
}

export default NewEventWindowManager;
