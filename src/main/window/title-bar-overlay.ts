import type { BrowserWindow } from "electron";
import type { VisualTheme } from "@shared/theme";
import { getTitleBarColors, getTitleBarScrimColors } from "@shared/theme";

const TITLE_BAR_HEIGHT = 40;

let scrimActive = false;

function applyTitleBarOverlay(window: BrowserWindow, visualTheme: VisualTheme): void {
  const style = scrimActive ? getTitleBarScrimColors(visualTheme) : getTitleBarColors(visualTheme);

  window.setBackgroundColor(style.color);

  window.setTitleBarOverlay({
    color: style.color,
    symbolColor: style.symbolColor,
    height: TITLE_BAR_HEIGHT,
  });
}

function setTitleBarScrim(window: BrowserWindow, visualTheme: VisualTheme, active: boolean): void {
  if (process.platform !== "win32") {
    return;
  }

  scrimActive = active;
  applyTitleBarOverlay(window, visualTheme);
}

function setTitleBarTheme(window: BrowserWindow, visualTheme: VisualTheme): void {
  if (process.platform !== "win32") {
    return;
  }

  applyTitleBarOverlay(window, visualTheme);
}

function getInitialTitleBarStyle(visualTheme: VisualTheme) {
  return getTitleBarColors(visualTheme);
}

export { TITLE_BAR_HEIGHT, getInitialTitleBarStyle, setTitleBarScrim, setTitleBarTheme };
