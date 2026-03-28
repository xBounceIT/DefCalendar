import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import {
  attachmentDeleteArgsSchema,
  attachmentUploadArgsSchema,
  authSignInRequestSchema,
  cancelEventArgsSchema,
  deleteEventArgsSchema,
  eventReferenceArgsSchema,
  eventDraftSchema,
  eventListArgsSchema,
  openExternalArgsSchema,
  reminderDismissArgsSchema,
  reminderSnoozeArgsSchema,
  respondToEventArgsSchema,
  setCalendarVisibilityArgsSchema,
  syncStatusSchema,
  userSettingsPatchSchema,
} from "@shared/schemas";
import type AppDatabase from "@main/db/database";
import type GraphCalendarService from "@main/graph/calendar-service";
import type MsalAuthService from "@main/auth/msal-auth-service";
import type ReminderWindowManager from "@main/reminders/reminder-window";
import type SettingsService from "@main/settings/settings-service";
import type { SyncService } from "@main/sync/sync-service";
import { app, ipcMain, shell } from "@main/electron-runtime";
import { IPC_CHANNELS } from "@shared/ipc";

interface RegisterIpcDependencies {
  auth: MsalAuthService;
  db: AppDatabase;
  graph: GraphCalendarService;
  reminderManager: ReminderWindowManager;
  settings: SettingsService;
  sync: SyncService;
  getMainWindow: () => BrowserWindow | null;
}

function registerIpc(dependencies: RegisterIpcDependencies): void {
  const enrichCalendars = () => {
    const settings = dependencies.settings.getSettings();
    const visible = new Set(settings.visibleCalendarIds);

    return dependencies.db.listCalendars().map((calendar) => ({
      ...calendar,
      isVisible: visible.has(calendar.id),
    }));
  };

  const broadcast = (channel: string, payload: unknown) => {
    const window = dependencies.getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const validateSender = (event: IpcMainInvokeEvent) => {
    const mainWindow = dependencies.getMainWindow();
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      throw new Error("Rejected IPC request from an untrusted sender.");
    }
  };

  ipcMain.handle(IPC_CHANNELS.appGetLocale, async (event) => {
    validateSender(event);
    return app.getLocale();
  });

  ipcMain.handle(IPC_CHANNELS.appGetVersion, async (event) => {
    validateSender(event);
    const version = app.getVersion();
    return `v${version}`;
  });

  ipcMain.handle(IPC_CHANNELS.authGetState, async (event) => {
    validateSender(event);
    return dependencies.auth.getAuthState();
  });

  ipcMain.handle(IPC_CHANNELS.authSignIn, async (event, input) => {
    validateSender(event);
    const args = authSignInRequestSchema.parse(input ?? {});
    const state = await dependencies.auth.signIn(args.mode);
    await dependencies.sync.syncAll("sign-in");
    broadcast(IPC_CHANNELS.authStateChanged, state);
    broadcast(IPC_CHANNELS.syncStatusChanged, dependencies.sync.getStatus());
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.authSignOut, async (event) => {
    validateSender(event);
    await dependencies.auth.signOut();
    dependencies.db.clearUserData();
    dependencies.sync.reset();
    const state = dependencies.auth.getAuthState();
    broadcast(IPC_CHANNELS.authStateChanged, state);
    broadcast(IPC_CHANNELS.syncStatusChanged, dependencies.sync.getStatus());
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.calendarsList, async (event) => {
    validateSender(event);
    return enrichCalendars();
  });

  ipcMain.handle(IPC_CHANNELS.calendarsSetVisibility, async (event, input) => {
    validateSender(event);
    const args = setCalendarVisibilityArgsSchema.parse(input);
    dependencies.settings.setCalendarVisibility(args.calendarId, args.isVisible);
    return enrichCalendars();
  });

  ipcMain.handle(IPC_CHANNELS.eventsList, async (event, input) => {
    validateSender(event);
    const args = eventListArgsSchema.parse(input);
    return dependencies.db.listEvents(args);
  });

  ipcMain.handle(IPC_CHANNELS.eventsCreate, async (event, input) => {
    validateSender(event);
    const draft = eventDraftSchema.parse(input);
    const created = await dependencies.graph.createEvent(draft);
    dependencies.db.upsertEvent(created);
    void dependencies.sync.syncAll("mutation");
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.eventsUpdate, async (event, input) => {
    validateSender(event);
    const draft = eventDraftSchema.parse(input);
    if (!draft.id) {
      throw new Error("Event id is required for updates.");
    }

    const current = dependencies.db.getEvent(draft.calendarId, draft.id);
    if (current?.unsupportedReason) {
      throw new Error(current.unsupportedReason);
    }

    const updated = await dependencies.graph.updateEvent(draft);
    dependencies.db.upsertEvent(updated);
    void dependencies.sync.syncAll("mutation");
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.eventsDelete, async (event, input) => {
    validateSender(event);
    const args = deleteEventArgsSchema.parse(input);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);
    if (current?.unsupportedReason) {
      throw new Error(current.unsupportedReason);
    }

    await dependencies.graph.deleteEvent(args.calendarId, args.eventId, args.etag);
    dependencies.db.deleteEvent(args.calendarId, args.eventId);
    void dependencies.sync.syncAll("mutation");
  });

  ipcMain.handle(IPC_CHANNELS.eventsRespond, async (event, input) => {
    validateSender(event);
    const args = respondToEventArgsSchema.parse(input);
    await dependencies.graph.respondToEvent(args);
    void dependencies.sync.syncAll("mutation");
  });

  ipcMain.handle(IPC_CHANNELS.eventsCancel, async (event, input) => {
    validateSender(event);
    const args = cancelEventArgsSchema.parse(input);
    await dependencies.graph.cancelEvent(args.calendarId, args.eventId, args.comment);
    dependencies.db.deleteEvent(args.calendarId, args.eventId);
    void dependencies.sync.syncAll("mutation");
  });

  ipcMain.handle(IPC_CHANNELS.eventsListAttachments, async (event, input) => {
    validateSender(event);
    const args = eventReferenceArgsSchema.parse(input);
    const attachments = await dependencies.graph.listAttachments(args.calendarId, args.eventId);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);
    if (current) {
      dependencies.db.upsertEvent({
        ...current,
        attachments,
        hasAttachments: attachments.length > 0,
      });
    }
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.eventsAddAttachment, async (event, input) => {
    validateSender(event);
    const args = attachmentUploadArgsSchema.parse(input);
    const attachments = await dependencies.graph.addAttachment(args.calendarId, args.eventId, args.attachment);
    const refreshed = await dependencies.graph.getEvent(args.calendarId, args.eventId);
    dependencies.db.upsertEvent({
      ...refreshed,
      attachments,
      hasAttachments: attachments.length > 0,
    });
    void dependencies.sync.syncAll("mutation");
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.eventsRemoveAttachment, async (event, input) => {
    validateSender(event);
    const args = attachmentDeleteArgsSchema.parse(input);
    const attachments = await dependencies.graph.removeAttachment(args.calendarId, args.eventId, args.attachmentId);
    const refreshed = await dependencies.graph.getEvent(args.calendarId, args.eventId);
    dependencies.db.upsertEvent({
      ...refreshed,
      attachments,
      hasAttachments: attachments.length > 0,
    });
    void dependencies.sync.syncAll("mutation");
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.eventsOpenWebLink, async (event, input) => {
    validateSender(event);
    const args = openExternalArgsSchema.parse({ url: input });
    await shell.openExternal(args.url);
  });

  ipcMain.handle(IPC_CHANNELS.syncRefresh, async (event) => {
    validateSender(event);
    const status = await dependencies.sync.syncAll("manual");
    return syncStatusSchema.parse(status);
  });

  ipcMain.handle(IPC_CHANNELS.syncGetStatus, async (event) => {
    validateSender(event);
    return syncStatusSchema.parse(dependencies.sync.getStatus());
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, async (event) => {
    validateSender(event);
    return dependencies.settings.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (event, input) => {
    validateSender(event);
    const patch = userSettingsPatchSchema.parse(input);
    return dependencies.settings.updateSettings(patch);
  });

  ipcMain.handle(IPC_CHANNELS.reminderSnooze, async (_event, input) => {
    const args = reminderSnoozeArgsSchema.parse(input);
    const snoozedUntil = new Date(Date.now() + args.minutes * 60_000).toISOString();
    dependencies.db.setSnooze(args.dedupeKey, snoozedUntil);
    dependencies.reminderManager.close(args.dedupeKey);
  });

  ipcMain.handle(IPC_CHANNELS.reminderDismiss, async (_event, input) => {
    const args = reminderDismissArgsSchema.parse(input);
    dependencies.db.markNotificationFired(args.dedupeKey);
    dependencies.reminderManager.close(args.dedupeKey);
  });

  ipcMain.handle(IPC_CHANNELS.reminderDismissAll, async (_event) => {
    for (const key of dependencies.reminderManager.keys()) {
      dependencies.db.markNotificationFired(key);
    }
    dependencies.reminderManager.closeAll();
  });

  dependencies.sync.onStatus((status) => {
    broadcast(IPC_CHANNELS.syncStatusChanged, status);
  });

  ipcMain.handle(IPC_CHANNELS.windowMinimize, async (event) => {
    validateSender(event);
    const window = dependencies.getMainWindow();
    if (window) {
      window.minimize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowMaximize, async (event) => {
    validateSender(event);
    const window = dependencies.getMainWindow();
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, async (event) => {
    validateSender(event);
    const window = dependencies.getMainWindow();
    if (window) {
      window.close();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, async (event) => {
    validateSender(event);
    const window = dependencies.getMainWindow();
    return window?.isMaximized() ?? false;
  });
}

export default registerIpc;
