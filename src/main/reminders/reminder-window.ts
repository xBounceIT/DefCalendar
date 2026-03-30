import type { WebContents } from "electron";
import { join } from "pathe";
import { BrowserWindow, screen, shell } from "@main/electron-runtime";
import { IPC_CHANNELS, type ReminderDialogState } from "@shared/ipc";
import { t } from "../i18n";

const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 460;

class ReminderWindowManager {
  private state: ReminderDialogState = {
    items: [],
    locale: "en",
    timeFormat: "system",
  };
  private window: BrowserWindow | null = null;
  private isLoaded = false;
  private isReadyToShow = false;
  private shouldFocusOnReady = false;

  show(state: ReminderDialogState, focus: boolean): void {
    this.state = state;
    const window = this.ensureWindow();
    this.pushState();

    if (!this.isReadyToShow) {
      this.shouldFocusOnReady = this.shouldFocusOnReady || focus;
      return;
    }

    if (focus) {
      shell.beep();
      this.present(window);
      return;
    }

    if (!window.isVisible()) {
      window.show();
    }
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
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

  minimize():void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.minimize();
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;
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
      skipTaskbar: true,
      title: t("reminderTitle"),
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

    window.setAlwaysOnTop(true, "screen-saver");

    window.once("ready-to-show", () => {
      this.isReadyToShow = true;
      if (this.shouldFocusOnReady) {
        shell.beep();
        this.present(window);
        this.shouldFocusOnReady = false;
        return;
      }

      window.show();
    });

    window.webContents.on("did-finish-load", () => {
      this.isLoaded = true;
      this.pushState();
    });

    window.on("closed", () => {
      this.window = null;
      this.isLoaded = false;
      this.isReadyToShow = false;
      this.shouldFocusOnReady = false;
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/reminder-popup.html`);
    } else {
      void window.loadFile(join(__dirname, "../renderer/reminder-popup.html"));
    }

    this.window = window;
    return window;
  }

  private present(window: BrowserWindow): void {
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
