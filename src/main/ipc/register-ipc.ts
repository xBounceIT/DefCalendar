import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
  CalendarEvent,
  EventAttachment,
  EventResponseAction,
  ParticipantResponseStatus,
} from "@shared/schemas";
import {
  appUpdateStatusSchema,
  attachmentDeleteArgsSchema,
  attachmentUploadArgsSchema,
  authSignInRequestSchema,
  cancelEventArgsSchema,
  contactSuggestionSchema,
  deleteEventArgsSchema,
  eventDraftSchema,
  eventListArgsSchema,
  eventReferenceArgsSchema,
  forwardEventArgsSchema,
  listOutlookCategoriesArgsSchema,
  outlookCategorySchema,
  openExternalArgsSchema,
  reminderDialogStateSchema,
  reminderDismissArgsSchema,
  reminderSnoozeArgsSchema,
  respondToEventArgsSchema,
  searchContactsArgsSchema,
  setCalendarColorArgsSchema,
  setCalendarVisibilityArgsSchema,
  syncStatusSchema,
  userSettingsPatchSchema,
} from "@shared/schemas";
import type AppDatabase from "@main/db/database";
import { isMissingGraphItemError } from "@main/graph/calendar-service";
import type GraphCalendarService from "@main/graph/calendar-service";
import type MsalAuthService from "@main/auth/msal-auth-service";
import type ReminderService from "@main/reminders/reminder-service";
import type ReminderWindowManager from "@main/reminders/reminder-window";
import type SettingsService from "@main/settings/settings-service";
import type { SyncService } from "@main/sync/sync-service";
import type UpdateService from "@main/update/update-service";
import { app, ipcMain, shell } from "@main/electron-runtime";
import { IPC_CHANNELS } from "@shared/ipc";

interface RegisterIpcDependencies {
  auth: MsalAuthService;
  db: AppDatabase;
  graph: GraphCalendarService;
  reminders: ReminderService;
  reminderManager: ReminderWindowManager;
  settings: SettingsService;
  sync: SyncService;
  updates: UpdateService;
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

  const resolveCalendarHomeAccountId = (calendarId: string) => {
    const homeAccountId = dependencies.db.getCalendarHomeAccountId(calendarId);
    if (!homeAccountId) {
      throw new Error("Calendar not found.");
    }

    return homeAccountId;
  };

  const toParticipantResponseStatus = (action: EventResponseAction): ParticipantResponseStatus => ({
    response: action === "accept" ? "accepted" : action === "decline" ? "declined" : "tentative",
    time: new Date().toISOString(),
  });

  const mergeCachedAttachments = (
    event: CalendarEvent,
    current: CalendarEvent | null,
  ): CalendarEvent => {
    if (!current || current.attachments.length === 0 || event.attachments.length > 0) {
      return event;
    }

    return {
      ...event,
      attachments: current.attachments,
      hasAttachments: event.hasAttachments || current.attachments.length > 0,
    };
  };

  const applyResponseToEvent = (
    event: CalendarEvent,
    action: EventResponseAction,
  ): CalendarEvent => ({
    ...event,
    isReminderOn: action === "decline" ? false : event.isReminderOn,
    responseStatus: toParticipantResponseStatus(action),
  });

  const replaceStoredEvent = (current: CalendarEvent | null, nextEvent: CalendarEvent) => {
    dependencies.db.upsertEvent(nextEvent);

    if (current && current.id !== nextEvent.id) {
      dependencies.db.deleteEvent(current.calendarId, current.id);
    }
  };

  const targetsDifferentEvent = (eventId: string, targetEventId?: string) =>
    Boolean(targetEventId && targetEventId !== eventId);

  const broadcast = (channel: string, payload: unknown) => {
    const window = dependencies.getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const validateMainSender = (event: IpcMainInvokeEvent) => {
    const mainWindow = dependencies.getMainWindow();
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      throw new Error("Rejected IPC request from an untrusted sender.");
    }
  };

  const validateReminderSender = (event: IpcMainInvokeEvent) => {
    const mainWindow = dependencies.getMainWindow();
    if (
      (mainWindow && event.sender === mainWindow.webContents) ||
      dependencies.reminderManager.ownsWebContents(event.sender)
    ) {
      return;
    }

    throw new Error("Rejected IPC request from an untrusted sender.");
  };

  ipcMain.handle(IPC_CHANNELS.appGetLocale, async (event) => {
    validateMainSender(event);
    return app.getLocale();
  });

  ipcMain.handle(IPC_CHANNELS.appGetVersion, async (event) => {
    validateMainSender(event);
    const version = app.getVersion();
    return `v${version}`;
  });

  ipcMain.handle(IPC_CHANNELS.authGetState, async (event) => {
    validateMainSender(event);
    return dependencies.auth.getAuthState();
  });

  ipcMain.handle(IPC_CHANNELS.authSignIn, async (event, input) => {
    validateMainSender(event);
    const args = authSignInRequestSchema.parse(input ?? {});
    const state = await dependencies.auth.signIn(args.mode);
    void dependencies.sync.syncAll("sign-in");
    broadcast(IPC_CHANNELS.authStateChanged, state);
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.authSignOut, async (event, homeAccountId?: string) => {
    validateMainSender(event);
    const activeAccountId = homeAccountId ?? dependencies.auth.getActiveAccountId();
    await dependencies.auth.signOut(activeAccountId ?? undefined);
    if (activeAccountId) {
      dependencies.db.clearUserData(activeAccountId);
    } else {
      dependencies.db.clearUserData();
    }
    if (dependencies.auth.hasSession()) {
      await dependencies.sync.syncAll("manual");
    } else {
      dependencies.sync.reset();
    }
    await dependencies.reminders.checkNow();
    const state = dependencies.auth.getAuthState();
    broadcast(IPC_CHANNELS.authStateChanged, state);
    broadcast(IPC_CHANNELS.syncStatusChanged, dependencies.sync.getStatus());
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.authSwitchAccount, async (event, homeAccountId: string) => {
    validateMainSender(event);
    const state = await dependencies.auth.switchAccount(homeAccountId);
    await dependencies.sync.syncAll("switch-account", homeAccountId);
    broadcast(IPC_CHANNELS.authStateChanged, state);
    broadcast(IPC_CHANNELS.syncStatusChanged, dependencies.sync.getStatus());
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.calendarsList, async (event) => {
    validateMainSender(event);
    return enrichCalendars();
  });

  ipcMain.handle(IPC_CHANNELS.calendarsSetVisibility, async (event, input) => {
    validateMainSender(event);
    const args = setCalendarVisibilityArgsSchema.parse(input);
    dependencies.settings.setCalendarVisibility(args.calendarId, args.isVisible);
    void dependencies.reminders.checkNow();
    return enrichCalendars();
  });

  ipcMain.handle(IPC_CHANNELS.calendarsSetColor, async (event, input) => {
    validateMainSender(event);
    const args = setCalendarColorArgsSchema.parse(input);
    dependencies.db.setCalendarColor(args.calendarId, args.color);
    return enrichCalendars();
  });

  ipcMain.handle(IPC_CHANNELS.categoriesList, async (event, input) => {
    validateMainSender(event);
    const args = listOutlookCategoriesArgsSchema.parse(input);
    const categories = await dependencies.graph.listOutlookCategories(args.homeAccountId);
    return categories.map((category) => outlookCategorySchema.parse(category));
  });

  ipcMain.handle(IPC_CHANNELS.contactsSearch, async (event, input) => {
    validateMainSender(event);
    const args = searchContactsArgsSchema.parse(input);
    return dependencies.db
      .searchContacts(args)
      .map((contact) => contactSuggestionSchema.parse(contact));
  });

  ipcMain.handle(IPC_CHANNELS.eventsList, async (event, input) => {
    validateMainSender(event);
    const args = eventListArgsSchema.parse(input);
    return dependencies.db.listEvents(args);
  });

  ipcMain.handle(IPC_CHANNELS.eventsCreate, async (event, input) => {
    validateMainSender(event);
    const draft = eventDraftSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(draft.calendarId);
    const created = await dependencies.graph.createEvent(draft, homeAccountId);
    dependencies.db.upsertEvent(created);
    await dependencies.reminders.checkNow();
    void dependencies.sync.syncAll("mutation", homeAccountId);
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.eventsUpdate, async (event, input) => {
    validateMainSender(event);
    const draft = eventDraftSchema.parse(input);
    if (!draft.id) {
      throw new Error("Event id is required for updates.");
    }

    const current = dependencies.db.getEvent(draft.calendarId, draft.id);
    if (current?.unsupportedReason) {
      throw new Error(current.unsupportedReason);
    }

    const homeAccountId = resolveCalendarHomeAccountId(draft.calendarId);
    const updated = await dependencies.graph.updateEvent(draft, homeAccountId);
    replaceStoredEvent(current, mergeCachedAttachments(updated, current));
    await dependencies.reminders.checkNow();
    void dependencies.sync.syncAll("mutation", homeAccountId);
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.eventsDelete, async (event, input) => {
    validateMainSender(event);
    const args = deleteEventArgsSchema.parse(input);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);
    if (current?.unsupportedReason) {
      throw new Error(current.unsupportedReason);
    }

    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const isSeriesTarget = targetsDifferentEvent(args.eventId, args.targetEventId);
    await dependencies.graph.deleteEvent(
      args.calendarId,
      args.eventId,
      homeAccountId,
      args.etag,
      args.targetEventId,
    );

    if (!isSeriesTarget) {
      dependencies.db.deleteEvent(args.calendarId, args.eventId);
    }

    await dependencies.reminders.checkNow();
    if (isSeriesTarget) {
      await dependencies.sync.syncAll("mutation", homeAccountId);
      return;
    }

    void dependencies.sync.syncAll("mutation", homeAccountId);
  });

  ipcMain.handle(IPC_CHANNELS.eventsRespond, async (event, input) => {
    validateMainSender(event);
    const args = respondToEventArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);
    const isSeriesTarget = targetsDifferentEvent(args.eventId, args.targetEventId);
    await dependencies.graph.respondToEvent(args, homeAccountId);

    if (isSeriesTarget) {
      await dependencies.reminders.checkNow();
      await dependencies.sync.syncAll("mutation", homeAccountId);
      return;
    }

    let nextEvent = current;
    try {
      const refreshed = await dependencies.graph.getEvent(
        args.calendarId,
        args.eventId,
        homeAccountId,
      );
      nextEvent = mergeCachedAttachments(refreshed, current);
    } catch (error) {
      if (!isMissingGraphItemError(error)) {
        throw error;
      }
    }

    if (nextEvent) {
      replaceStoredEvent(current, applyResponseToEvent(nextEvent, args.action));
    }

    await dependencies.reminders.checkNow();
    void dependencies.sync.syncAll("mutation", homeAccountId);
  });

  ipcMain.handle(IPC_CHANNELS.eventsForward, async (event, input) => {
    validateMainSender(event);
    const args = forwardEventArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    await dependencies.graph.forwardEvent(args, homeAccountId);
    void dependencies.sync.syncAll("mutation", homeAccountId);
  });

  ipcMain.handle(IPC_CHANNELS.eventsCancel, async (event, input) => {
    validateMainSender(event);
    const args = cancelEventArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    await dependencies.graph.cancelEvent(
      args.calendarId,
      args.eventId,
      homeAccountId,
      args.comment,
    );
    dependencies.db.deleteEvent(args.calendarId, args.eventId);
    await dependencies.reminders.checkNow();
    void dependencies.sync.syncAll("mutation", homeAccountId);
  });

  ipcMain.handle(IPC_CHANNELS.eventsListAttachments, async (event, input) => {
    validateMainSender(event);
    const args = eventReferenceArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);

    let attachments: EventAttachment[] = [];
    try {
      attachments = await dependencies.graph.listAttachments(
        args.calendarId,
        args.eventId,
        homeAccountId,
      );
    } catch (error) {
      if (!isMissingGraphItemError(error)) {
        throw error;
      }

      return current?.attachments ?? [];
    }

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
    validateMainSender(event);
    const args = attachmentUploadArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);
    const attachments = await dependencies.graph.addAttachment(
      args.calendarId,
      args.eventId,
      args.attachment,
      homeAccountId,
    );
    const refreshed = await dependencies.graph.getEvent(
      args.calendarId,
      args.eventId,
      homeAccountId,
    );
    replaceStoredEvent(current, {
      ...refreshed,
      attachments,
      hasAttachments: attachments.length > 0,
    });
    void dependencies.sync.syncAll("mutation", homeAccountId);
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.eventsRemoveAttachment, async (event, input) => {
    validateMainSender(event);
    const args = attachmentDeleteArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const current = dependencies.db.getEvent(args.calendarId, args.eventId);
    const attachments = await dependencies.graph.removeAttachment(
      args.calendarId,
      args.eventId,
      args.attachmentId,
      homeAccountId,
    );
    const refreshed = await dependencies.graph.getEvent(
      args.calendarId,
      args.eventId,
      homeAccountId,
    );
    replaceStoredEvent(current, {
      ...refreshed,
      attachments,
      hasAttachments: attachments.length > 0,
    });
    void dependencies.sync.syncAll("mutation", homeAccountId);
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.eventsOpenWebLink, async (event, input) => {
    validateReminderSender(event);
    const args = openExternalArgsSchema.parse({ url: input });
    await shell.openExternal(args.url);
  });

  ipcMain.handle(IPC_CHANNELS.syncRefresh, async (event) => {
    validateMainSender(event);
    const status = await dependencies.sync.syncAll("manual");
    return syncStatusSchema.parse(status);
  });

  ipcMain.handle(IPC_CHANNELS.syncGetStatus, async (event) => {
    validateMainSender(event);
    return syncStatusSchema.parse(dependencies.sync.getStatus());
  });

  ipcMain.handle(IPC_CHANNELS.updatesGetStatus, async (event) => {
    validateMainSender(event);
    return appUpdateStatusSchema.parse(dependencies.updates.getStatus());
  });

  ipcMain.handle(IPC_CHANNELS.updatesCheck, async (event) => {
    validateMainSender(event);
    const status = await dependencies.updates.checkForUpdates();
    return appUpdateStatusSchema.parse(status);
  });

  ipcMain.handle(IPC_CHANNELS.updatesDownload, async (event) => {
    validateMainSender(event);
    const status = await dependencies.updates.downloadUpdate();
    return appUpdateStatusSchema.parse(status);
  });

  ipcMain.handle(IPC_CHANNELS.updatesInstall, async (event) => {
    validateMainSender(event);
    dependencies.updates.installUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, async (event) => {
    validateMainSender(event);
    return dependencies.settings.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (event, input) => {
    validateMainSender(event);
    const patch = userSettingsPatchSchema.parse(input);
    const previousSettings = dependencies.settings.getSettings();
    const updatedSettings = dependencies.settings.updateSettings(patch);

    if (
      patch.updateChannel !== undefined &&
      patch.updateChannel !== previousSettings.updateChannel
    ) {
      dependencies.updates.setAllowPrerelease(patch.updateChannel === "prerelease");
    }

    if (
      patch.syncIntervalMinutes !== undefined &&
      patch.syncIntervalMinutes !== previousSettings.syncIntervalMinutes
    ) {
      dependencies.sync.refreshSchedule();
    }

    void dependencies.reminders.checkNow();
    return updatedSettings;
  });

  ipcMain.handle(IPC_CHANNELS.reminderGetState, async (event) => {
    validateReminderSender(event);
    return reminderDialogStateSchema.parse(dependencies.reminders.getState());
  });

  ipcMain.handle(IPC_CHANNELS.reminderSnooze, async (_event, input) => {
    validateReminderSender(_event);
    const args = reminderSnoozeArgsSchema.parse(input);
    dependencies.reminders.snooze(args.dedupeKey, args.minutes);
  });

  ipcMain.handle(IPC_CHANNELS.reminderDismiss, async (_event, input) => {
    validateReminderSender(_event);
    const args = reminderDismissArgsSchema.parse(input);
    dependencies.reminders.dismiss(args.dedupeKey);
  });

  ipcMain.handle(IPC_CHANNELS.reminderDismissAll, async (_event) => {
    validateReminderSender(_event);
    dependencies.reminders.dismissAll();
  });

  ipcMain.handle(IPC_CHANNELS.reminderWindowMinimize, async (event) => {
    validateReminderSender(event);
    dependencies.reminderManager.minimize();
  });

  dependencies.sync.onStatus((status) => {
    broadcast(IPC_CHANNELS.syncStatusChanged, status);
  });

  dependencies.updates.onStatus((status) => {
    broadcast(IPC_CHANNELS.updatesStatusChanged, appUpdateStatusSchema.parse(status));
  });

  ipcMain.handle(IPC_CHANNELS.windowMinimize, async (event) => {
    validateMainSender(event);
    const window = dependencies.getMainWindow();
    if (window) {
      window.minimize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowMaximize, async (event) => {
    validateMainSender(event);
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
    validateMainSender(event);
    const window = dependencies.getMainWindow();
    if (window) {
      window.close();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, async (event) => {
    validateMainSender(event);
    const window = dependencies.getMainWindow();
    return window?.isMaximized() ?? false;
  });
}

export default registerIpc;
