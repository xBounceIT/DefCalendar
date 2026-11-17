import type { BrowserWindow as ElectronBrowserWindow, Rectangle, WebContents } from "electron";
import { join } from "pathe";
import { BrowserWindow, shell } from "@main/electron-runtime";
import getPopupPosition from "@main/notifications/popup-position";
import { IPC_CHANNELS, type ReminderDialogState } from "@shared/ipc";
import { t } from "../i18n";

const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 460;

class ReminderWindowManager {
  private state: ReminderDialogState = {
    items: [],
    locale: "en",
    timeFormat: "system",
    theme: "system",
  };
  private window: ElectronBrowserWindow | null = null;
  private isLoaded = false;
  private isReadyToShow = false;
  private shouldAnnounceOnReady = false;

  show(state: ReminderDialogState, announce: boolean): void {
    this.state = state;
    const window = this.ensureWindow(announce);
    this.pushState();

    if (!this.isReadyToShow) {
      this.shouldAnnounceOnReady ||= announce;
      return;
    }

    if (announce) {
      this.present(window, true);
    } else if (process.platform !== "darwin" && !window.isVisible()) {
      window.show();
    }
  }

  close(): void {
    const window = this.window;
    this.releaseWindow();
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  hasWindow(): boolean {
    return Boolean(this.window && !this.window.isDestroyed());
  }

  ownsWebContents(contents: WebContents): boolean {
    return Boolean(
      this.window && !this.window.isDestroyed() && this.window.webContents === contents,
    );
  }

  minimize(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.minimize();
    }
  }

  private releaseWindow(): void {
    this.window = null;
    this.isLoaded = false;
    this.isReadyToShow = false;
    this.shouldAnnounceOnReady = false;
  }

  private ensureWindow(announce: boolean): ElectronBrowserWindow {
    let previousBounds: Rectangle | undefined;
    if (this.window && !this.window.isDestroyed()) {
      if (process.platform !== "darwin" || !announce || !this.window.isMinimized()) {
        return this.window;
      }
      const minimizedWindow = this.window;
      previousBounds = minimizedWindow.getNormalBounds();
      this.releaseWindow();
      minimizedWindow.destroy();
    }

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
      title: t("reminderTitle"),
      width: POPUP_WIDTH,
      ...getPopupPosition(POPUP_WIDTH, POPUP_HEIGHT, previousBounds),
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window = window;
    window.setAlwaysOnTop(true, "screen-saver");

    window.once("ready-to-show", () => {
      if (this.window !== window || window.isDestroyed()) {
        return;
      }
      this.isReadyToShow = true;
      const announceOnReady = this.shouldAnnounceOnReady;
      this.shouldAnnounceOnReady = false;
      this.present(window, announceOnReady);
    });

    window.webContents.on("did-finish-load", () => {
      if (this.window === window) {
        this.isLoaded = true;
        this.pushState();
      }
    });

    window.on("closed", () => {
      if (this.window === window) {
        this.releaseWindow();
      }
    });

    const closeFailedWindow = () => {
      if (this.window === window) {
        this.close();
      }
    };
    window.webContents.on("render-process-gone", closeFailedWindow);
    const load = process.env.ELECTRON_RENDERER_URL
      ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/reminder-popup.html`)
      : window.loadFile(join(__dirname, "../renderer/reminder-popup.html"));
    void load.catch(closeFailedWindow);

    return window;
  }

  private present(window: ElectronBrowserWindow, announce: boolean): void {
    if (announce) {
      shell.beep();
    }
    if (process.platform === "darwin") {
      window.showInactive();
      return;
    }
    if (!announce) {
      window.show();
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    if (!window.isVisible()) {
      window.show();
    }

    window.setAlwaysOnTop(true, "screen-saver");
    window.moveTop();
    window.focus();
  }

  private pushState(): void {
    if (!this.window || this.window.isDestroyed() || !this.isLoaded) {
      return;
    }

    this.window.webContents.send(IPC_CHANNELS.reminderStateChanged, this.state);
  }
}

export default ReminderWindowManager;
