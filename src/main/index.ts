import AppDatabase from "@main/db/database";
import type { BrowserWindow } from "electron";
import GraphCalendarService from "@main/graph/calendar-service";
import { IPC_CHANNELS } from "@shared/ipc";
import MsalAuthService from "@main/auth/msal-auth-service";
import ReminderService from "@main/reminders/reminder-service";
import ReminderWindowManager from "@main/reminders/reminder-window";
import SafeStorageTokenCache from "@main/auth/cache-plugin";
import SettingsService from "@main/settings/settings-service";
import { SyncService } from "@main/sync/sync-service";
import TrayService from "@main/tray-service";
import { app, ipcMain } from "@main/electron-runtime";
import createMainWindow from "@main/window";
import { join } from "pathe";
import { loadAppConfig } from "@main/config";
import registerIpc from "@main/ipc/register-ipc";
import { setMainLocale } from "@main/i18n";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let trayService: TrayService | null = null;
let shouldQuit = false;

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  const db = new AppDatabase();
  const settings = new SettingsService(db);

  const savedSettings = settings.getSettings();
  if (savedSettings.language) {
    setMainLocale(savedSettings.language);
  }

  const reminderManager = new ReminderWindowManager();
  const reminders = new ReminderService(db, reminderManager);
  const auth = new MsalAuthService(
    config,
    new SafeStorageTokenCache(join(app.getPath("userData"), "msal-token-cache.bin")),
  );

  await auth.initialize();

  const graph = new GraphCalendarService(auth, config);
  const sync = new SyncService({ auth, graph, db, settings, reminders, config });

  ipcMain.handle(IPC_CHANNELS.appSetLocale, async (_event, locale: unknown) => {
    if (typeof locale === "string" && (locale === "en" || locale === "it")) {
      setMainLocale(locale);
      trayService?.refreshMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(locale === "it" ? "DefCalendar" : "DefCalendar");
      }
    }
  });

  const signOutEverywhere = async () => {
    await auth.signOut();
    db.clearUserData();
    sync.reset();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.authStateChanged, auth.getAuthState());
      mainWindow.webContents.send(IPC_CHANNELS.syncStatusChanged, sync.getStatus());
    }
  };

  const ensureWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
      mainWindow.on("close", (event) => {
        if (!shouldQuit) {
          event.preventDefault();
          mainWindow?.hide();
        }
      });
    }

    return mainWindow;
  };

  ensureWindow();

  trayService = new TrayService({
    showWindow: () => {
      const window = ensureWindow();
      window.show();
      window.focus();
    },
    refreshNow: () => {
      void sync.syncAll("manual");
    },
    signOut: async () => {
      await signOutEverywhere();
    },
    quit: () => {
      shouldQuit = true;
      trayService?.destroy();
      app.quit();
    },
  });
  trayService.create();

  registerIpc({
    auth,
    db,
    graph,
    reminderManager,
    settings,
    sync,
    getMainWindow: () => mainWindow,
  });

  reminders.start();
  sync.start();

  if (auth.hasSession()) {
    void sync.syncAll("startup");
  }

  app.on("second-instance", () => {
    const window = ensureWindow();
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  });

  app.on("activate", () => {
    const window = ensureWindow();
    window.show();
  });

  app.on("before-quit", () => {
    shouldQuit = true;
    reminders.stop();
    sync.stop();
    trayService?.destroy();
  });
}

async function startApplication(): Promise<void> {
  await app.whenReady();
  await bootstrap();
}

void startApplication();
