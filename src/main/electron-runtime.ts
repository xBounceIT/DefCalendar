import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");

export const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  powerMonitor,
  safeStorage,
  screen,
  shell,
} = electron;
