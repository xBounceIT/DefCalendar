import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type {
  CalendarEvent,
  ContactSuggestion,
  EventAttachment,
  EventListArgs,
} from "@shared/schemas";
import {
  appUpdateStatusSchema,
  attachmentDeleteArgsSchema,
  attachmentReferenceArgsSchema,
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
  searchEventsArgsSchema,
  setCalendarColorArgsSchema,
  setCalendarVisibilityArgsSchema,
  syncStatusSchema,
  type ThemeSetting,
  userSettingsPatchSchema,
} from "@shared/schemas";
import type AppDatabase from "@main/db/database";
import type EventActionService from "@main/events/event-action-service";
import { isMissingGraphItemError } from "@main/graph/calendar-service";
import type GraphCalendarService from "@main/graph/calendar-service";
import type MsalAuthService from "@main/auth/msal-auth-service";
import type NewEventNotificationService from "@main/notifications/new-event-notification-service";
import type ReminderService from "@main/reminders/reminder-service";
import type ReminderWindowManager from "@main/reminders/reminder-window";
import type SettingsService from "@main/settings/settings-service";
import type SystemInviteNotificationService from "@main/notifications/system-invite-notification-service";
import type TaskbarInviteAttentionService from "@main/notifications/taskbar-invite-attention-service";
import type { SyncService } from "@main/sync/sync-service";
import type UpdateService from "@main/update/update-service";
import { app, dialog, ipcMain, shell } from "@main/electron-runtime";
import { showAndFocusMainWindow, setTitleBarScrim } from "@main/window";
import { IPC_CHANNELS } from "@shared/ipc";

const MIN_PEOPLE_SEARCH_QUERY_LENGTH = 2;

interface RegisterIpcDependencies {
  auth: MsalAuthService;
  db: AppDatabase;
  eventActions: EventActionService;
  graph: GraphCalendarService;
  newEventNotifications: NewEventNotificationService;
  reminders: ReminderService;
  reminderManager: ReminderWindowManager;
  settings: SettingsService;
  systemInviteNotifications: SystemInviteNotificationService;
  taskbarInviteAttention: TaskbarInviteAttentionService;
  sync: SyncService;
  updates: UpdateService;
  getMainWindow: () => BrowserWindow | null;
  onThemePreferenceChange: (theme: ThemeSetting) => void;
}

function mergeContactSuggestions(
  cachedContacts: ContactSuggestion[],
  peopleContacts: ContactSuggestion[],
  limit: number,
): ContactSuggestion[] {
  const suggestions = new Map<string, ContactSuggestion>();

  for (const contact of [...cachedContacts, ...peopleContacts]) {
    const parsed = contactSuggestionSchema.safeParse(contact);
    if (!parsed.success) {
      continue;
    }

    const email = parsed.data.email.toLowerCase();
    if (suggestions.has(email)) {
      continue;
    }

    suggestions.set(email, {
      email,
      name: parsed.data.name,
    });
    if (suggestions.size >= limit) {
      return [...suggestions.values()];
    }
  }

  return [...suggestions.values()];
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

  const ensureEventsRangeForList = async (args: EventListArgs) => {
    try {
      await dependencies.sync.ensureEventsRange(args);
    } catch {
      return;
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

  ipcMain.handle(IPC_CHANNELS.windowSetTitleBarScrim, async (event, input) => {
    validateMainSender(event);
    const args = z
      .object({
        active: z.boolean(),
        isDarkTheme: z.boolean(),
      })
      .parse(input);
    const window = dependencies.getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    setTitleBarScrim(window, args.isDarkTheme, args.active);
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
    dependencies.newEventNotifications.clear();
    await dependencies.reminders.checkNow();
    const state = dependencies.auth.getAuthState();
    broadcast(IPC_CHANNELS.authStateChanged, state);
    broadcast(IPC_CHANNELS.syncStatusChanged, dependencies.sync.getStatus());
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.authSwitchAccount, async (event, homeAccountId: string) => {
    validateMainSender(event);
    const state = await dependencies.auth.switchAccount(homeAccountId);
    dependencies.newEventNotifications.clear();
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
    const cachedContacts = dependencies.db
      .searchContacts(args)
      .map((contact) => contactSuggestionSchema.parse(contact));

    if (args.query.length < MIN_PEOPLE_SEARCH_QUERY_LENGTH || cachedContacts.length >= args.limit) {
      return cachedContacts;
    }

    try {
      const peopleContacts = await dependencies.graph.searchPeople(
        args.homeAccountId,
        args.query,
        args.limit,
      );
      return mergeContactSuggestions(cachedContacts, peopleContacts, args.limit);
    } catch {
      return cachedContacts;
    }
  });

  ipcMain.handle(IPC_CHANNELS.eventsList, async (event, input) => {
    validateMainSender(event);
    const args = eventListArgsSchema.parse(input);
    await ensureEventsRangeForList(args);
    return dependencies.db.listEvents(args);
  });

  ipcMain.handle(IPC_CHANNELS.eventsSearch, async (event, input) => {
    validateMainSender(event);
    const args = searchEventsArgsSchema.parse(input);
    return dependencies.db.searchEvents(args);
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
    const updated = await dependencies.graph.updateEvent(draft, homeAccountId, current);
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
    await dependencies.eventActions.respondToEvent(args);
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

  ipcMain.handle(IPC_CHANNELS.eventsOpenAttachment, async (event, input) => {
    validateMainSender(event);
    const args = attachmentReferenceArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const content = await dependencies.graph.getAttachmentContent(
      args.calendarId,
      args.eventId,
      args.attachmentId,
      homeAccountId,
    );
    const directory = await fs.mkdtemp(path.join(tmpdir(), "defcalendar-attachment-"));
    const filePath = path.join(directory, sanitizeAttachmentFileName(content.attachment.name));
    await fs.writeFile(filePath, content.buffer);
    const openError = await shell.openPath(filePath);
    if (openError) {
      throw new Error(openError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.eventsDownloadAttachment, async (event, input) => {
    validateMainSender(event);
    const args = attachmentReferenceArgsSchema.parse(input);
    const homeAccountId = resolveCalendarHomeAccountId(args.calendarId);
    const attachment = await dependencies.graph.getAttachmentMetadata(
      args.calendarId,
      args.eventId,
      args.attachmentId,
      homeAccountId,
    );
    if (attachment.attachmentType === "reference") {
      throw new Error("Cloud link attachments cannot be downloaded directly.");
    }

    const fileName = sanitizeAttachmentFileName(attachment.name);
    const options = {
      defaultPath: path.join(app.getPath("downloads"), fileName),
      properties: ["showOverwriteConfirmation" as const],
    };
    const window = dependencies.getMainWindow();
    const result =
      window && !window.isDestroyed()
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return false;
    }

    const content = await dependencies.graph.getAttachmentContent(
      args.calendarId,
      args.eventId,
      args.attachmentId,
      homeAccountId,
      attachment,
    );
    await fs.writeFile(result.filePath, content.buffer);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.eventsOpenInApp, async (event, input) => {
    validateReminderSender(event);
    const args = eventReferenceArgsSchema.parse(input);
    if (dependencies.eventActions.openInApp(args)) {
      dependencies.reminderManager.minimize();
    }
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

    if (patch.theme !== previousSettings.theme && patch.theme !== undefined) {
      dependencies.onThemePreferenceChange(patch.theme);
    }

    void dependencies.reminders.checkNow();
    dependencies.systemInviteNotifications.refresh();
    dependencies.taskbarInviteAttention.refresh();
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

  ipcMain.handle(IPC_CHANNELS.newEventNotificationsGet, async (event) => {
    validateMainSender(event);
    return dependencies.newEventNotifications.getItems();
  });

  ipcMain.handle(IPC_CHANNELS.newEventNotificationsDismiss, async (event, input) => {
    validateMainSender(event);
    const eventId = z.string().min(1).parse(input);
    dependencies.newEventNotifications.dismiss(eventId);
  });

  ipcMain.handle(IPC_CHANNELS.newEventNotificationsDismissAll, async (event) => {
    validateMainSender(event);
    dependencies.newEventNotifications.clear();
  });

  dependencies.newEventNotifications.onChange((items) => {
    broadcast(IPC_CHANNELS.newEventNotificationsChanged, items);
    if (items.length === 0) {
      return;
    }
    if (!dependencies.settings.getSettings().newEventPopupEnabled) {
      return;
    }

    const window = dependencies.getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    showAndFocusMainWindow(window);
  });

  dependencies.sync.onStatus((status) => {
    broadcast(IPC_CHANNELS.syncStatusChanged, status);
  });

  dependencies.updates.onStatus((status) => {
    broadcast(IPC_CHANNELS.updatesStatusChanged, appUpdateStatusSchema.parse(status));
  });
}

function sanitizeAttachmentFileName(name: string): string {
  const forbidden = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  const sanitized = Array.from(name, (character) =>
    forbidden.has(character) || character.charCodeAt(0) < 32 ? "_" : character,
  )
    .join("")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!sanitized) {
    return "attachment";
  }

  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(sanitized)
    ? `_${sanitized}`
    : sanitized;
}

export default registerIpc;
