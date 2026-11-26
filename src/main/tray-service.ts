import { Menu, Tray, dialog, nativeImage } from "electron";
import { join } from "pathe";
import { app } from "@main/electron-runtime";
import { t } from "@main/i18n";

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
    this.tray.setToolTip(t("trayTooltip"));
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
        label: t("showApp"),
        click: () => this.handlers.showWindow(),
      },
      {
        label: t("refreshNow"),
        click: () => this.handlers.refreshNow(),
      },
      { type: "separator" },
      {
        label: t("signOut"),
        click: async () => {
          try {
            await this.handlers.signOut();
          } catch {
            dialog.showErrorBox(t("windowTitle"), t("signOutError"));
          }
        },
      },
      {
        label: t("quit"),
        click: () => this.handlers.quit(),
      },
    ]);
  }
}

function createTrayIcon() {
  const iconName = process.platform === "darwin" ? "trayTemplate.png" : "logo.png";
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, iconName)
    : join(process.cwd(), "resources", iconName);

  return nativeImage.createFromPath(iconPath);
}

export default TrayService;
