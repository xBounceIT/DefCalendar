import { BrowserWindow, screen, shell } from "@main/electron-runtime";
import type { ReminderPopupData } from "@shared/ipc";
import { join } from "pathe";
import { t } from "../i18n";

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 200;
const POPUP_GAP = 12;

class ReminderWindowManager {
  private readonly windows = new Map<string, BrowserWindow>();
  private nextIndex = 0;

  create(data: ReminderPopupData): void {
    if (this.windows.has(data.dedupeKey)) {
      return;
    }

    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;

    const columnIndex = this.nextIndex % 3;
    const rowIndex = Math.floor(this.nextIndex / 3);

    const posX =
      x + Math.round((width - POPUP_WIDTH) / 2) + columnIndex * (POPUP_WIDTH + POPUP_GAP);
    const posY =
      y + Math.round((height - POPUP_HEIGHT) / 2) + rowIndex * (POPUP_HEIGHT + POPUP_GAP);

    this.nextIndex++;

    const params = new URLSearchParams({
      dedupeKey: data.dedupeKey,
      subject: data.subject,
      location: data.location ?? "",
      start: data.start,
      end: data.end,
    });

    const window = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      x: Math.round(posX),
      y: Math.round(posY),
      alwaysOnTop: true,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      title: t("reminderTitle"),
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    window.once("ready-to-show", () => {
      shell.beep();
      window.show();
    });

    window.on("closed", () => {
      this.windows.delete(data.dedupeKey);
      this.reindex();
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/reminder-popup.html?${params.toString()}`,
      );
    } else {
      void window.loadFile(join(__dirname, "../renderer/reminder-popup.html"), {
        search: params.toString(),
      });
    }

    this.windows.set(data.dedupeKey, window);
  }

  close(dedupeKey: string): void {
    const window = this.windows.get(dedupeKey);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  closeAll(): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
    this.windows.clear();
    this.nextIndex = 0;
  }

  has(dedupeKey: string): boolean {
    return this.windows.has(dedupeKey);
  }

  keys(): IterableIterator<string> {
    return this.windows.keys();
  }

  get size(): number {
    return this.windows.size;
  }

  private reindex(): void {
    this.nextIndex = this.windows.size;
    let i = 0;
    for (const window of this.windows.values()) {
      if (window.isDestroyed()) {
        continue;
      }
      const display = screen.getPrimaryDisplay();
      const { x, y, width, height } = display.workArea;
      const columnIndex = i % 3;
      const rowIndex = Math.floor(i / 3);
      const posX =
        x + Math.round((width - POPUP_WIDTH) / 2) + columnIndex * (POPUP_WIDTH + POPUP_GAP);
      const posY =
        y + Math.round((height - POPUP_HEIGHT) / 2) + rowIndex * (POPUP_HEIGHT + POPUP_GAP);
      window.setPosition(Math.round(posX), Math.round(posY));
      i++;
    }
  }
}

export default ReminderWindowManager;
