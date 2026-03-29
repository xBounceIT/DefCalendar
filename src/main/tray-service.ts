import { Menu, Tray, nativeImage } from "electron";
import { app } from "@main/electron-runtime";
import { join } from "pathe";

interface TrayHandlers {
  showWindow: () => void;
  refreshNow: () => void;
  signOut: () => void | Promise<void>;
  quit: () => void;
}

class TrayService {
  private readonly handlers: TrayHandlers;
  private tray: Tray | null = null;

  constructor(handlers: TrayHandlers) {
    this.handlers = handlers;
  }

  create(): void {
    if (this.tray) {
      return;
    }

    this.tray = new Tray(createTrayIcon());
    this.tray.setToolTip("DefCalendar");
    this.tray.on("click", () => {
      this.handlers.showWindow();
    });
    this.tray.setContextMenu(this.buildMenu());
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  refreshMenu(): void {
    this.tray?.setContextMenu(this.buildMenu());
  }

  private buildMenu() {
    return Menu.buildFromTemplate([
      {
        label: "Show DefCalendar",
        click: () => this.handlers.showWindow(),
      },
      {
        label: "Refresh Now",
        click: () => this.handlers.refreshNow(),
      },
      { type: "separator" },
      {
        label: "Sign Out",
        click: () => {
          void this.handlers.signOut();
        },
      },
      {
        label: "Quit",
        click: () => this.handlers.quit(),
      },
    ]);
  }
}

function createTrayIcon() {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "tray-icon.png")
    : join(process.cwd(), "resources", "tray-icon.png");

  return nativeImage.createFromPath(iconPath);
}

export default TrayService;
