import type { BrowserWindow } from "electron";

const TITLE_BAR_HEIGHT = 40;
const TITLE_BAR_SYMBOL_LIGHT = "#1a1a1a";
const TITLE_BAR_SYMBOL_DARK = "#ffffff";
const TITLE_BAR_BG_LIGHT = "#f5f5f5";
const TITLE_BAR_BG_DARK = "#07080a";
const TITLE_BAR_SCRIM_SYMBOL_LIGHT = "rgba(26, 26, 26, 0.55)";
const TITLE_BAR_SCRIM_SYMBOL_DARK = "rgba(255, 255, 255, 0.55)";

interface TitleBarOverlayStyle {
  color: string;
  symbolColor: string;
}

let scrimActive = false;

function getTitleBarStyle(isDarkTheme: boolean): TitleBarOverlayStyle {
  return isDarkTheme
    ? { color: TITLE_BAR_BG_DARK, symbolColor: TITLE_BAR_SYMBOL_DARK }
    : { color: TITLE_BAR_BG_LIGHT, symbolColor: TITLE_BAR_SYMBOL_LIGHT };
}

function getTitleBarScrimStyle(isDarkTheme: boolean): TitleBarOverlayStyle {
  return {
    color: "rgba(0, 0, 0, 0)",
    symbolColor: isDarkTheme ? TITLE_BAR_SCRIM_SYMBOL_DARK : TITLE_BAR_SCRIM_SYMBOL_LIGHT,
  };
}

function applyTitleBarOverlay(window: BrowserWindow, isDarkTheme: boolean): void {
  const style = scrimActive ? getTitleBarScrimStyle(isDarkTheme) : getTitleBarStyle(isDarkTheme);

  if (!scrimActive) {
    window.setBackgroundColor(style.color);
  }

  window.setTitleBarOverlay({
    color: style.color,
    symbolColor: style.symbolColor,
    height: TITLE_BAR_HEIGHT,
  });
}

function setTitleBarScrim(window: BrowserWindow, isDarkTheme: boolean, active: boolean): void {
  if (process.platform !== "win32") {
    return;
  }

  scrimActive = active;
  applyTitleBarOverlay(window, isDarkTheme);
}

function setTitleBarTheme(window: BrowserWindow, isDarkTheme: boolean): void {
  if (process.platform !== "win32") {
    return;
  }

  applyTitleBarOverlay(window, isDarkTheme);
}

function getInitialTitleBarStyle(isDarkTheme: boolean): TitleBarOverlayStyle {
  return getTitleBarStyle(isDarkTheme);
}

export { TITLE_BAR_HEIGHT, getInitialTitleBarStyle, setTitleBarScrim, setTitleBarTheme };
