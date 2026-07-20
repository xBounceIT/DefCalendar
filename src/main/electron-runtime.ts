import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");

export const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  nativeTheme,
} = electron;
