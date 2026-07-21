import { app, BrowserWindow, shell } from "@main/electron-runtime";
import { join } from "pathe";
import { t } from "./i18n";

const TITLE_BAR_HEIGHT = 40;
const TITLE_BAR_SYMBOL_LIGHT = "#1a1a1a";
const TITLE_BAR_SYMBOL_DARK = "#ffffff";
const TITLE_BAR_BG_LIGHT = "#f5f5f5";
const TITLE_BAR_BG_DARK = "#070d1c";

interface TitleBarStyle {
  color: string;
  symbolColor: string;
}

function getTitleBarStyle(isDarkTheme: boolean): TitleBarStyle {
  return isDarkTheme
    ? { color: TITLE_BAR_BG_DARK, symbolColor: TITLE_BAR_SYMBOL_DARK }
    : { color: TITLE_BAR_BG_LIGHT, symbolColor: TITLE_BAR_SYMBOL_LIGHT };
}

function createMainWindow(isDarkTheme: boolean): BrowserWindow {
  const titleBarStyle = getTitleBarStyle(isDarkTheme);
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "logo.png")
    : join(process.cwd(), "resources", "logo.png");

  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1160,
    minHeight: 760,
    show: false,
    backgroundColor: titleBarStyle.color,
    autoHideMenuBar: true,
    icon: iconPath,
    title: t("windowTitle"),
    titleBarStyle: "hidden",
    titleBarOverlay:
      process.platform === "win32"
        ? {
            color: titleBarStyle.color,
            symbolColor: titleBarStyle.symbolColor,
            height: TITLE_BAR_HEIGHT,
          }
        : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  return window;
}

function setTitleBarTheme(window: BrowserWindow, isDarkTheme: boolean): void {
  if (process.platform !== "win32") {
    return;
  }

  const titleBarStyle = getTitleBarStyle(isDarkTheme);
  window.setBackgroundColor(titleBarStyle.color);
  window.setTitleBarOverlay({
    color: titleBarStyle.color,
    symbolColor: titleBarStyle.symbolColor,
    height: TITLE_BAR_HEIGHT,
  });
}

function showAndFocusMainWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

export default createMainWindow;
export { setTitleBarTheme, showAndFocusMainWindow };
