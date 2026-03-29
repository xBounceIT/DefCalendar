import { Menu, Tray, nativeImage } from "electron";

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

    this.tray = new Tray(nativeImage.createEmpty());
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

export default TrayService;
