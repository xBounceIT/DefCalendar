import type {
  AppUpdateStatus,
  AuthSignInMode,
  AuthState,
  CalendarEvent,
  SyncStatus,
} from "@shared/schemas";
import { contextBridge, ipcRenderer } from "electron";
import type { CalendarApi, NewEventNotificationItem, ReminderDialogState } from "@shared/ipc";
import IPC_CHANNELS from "@shared/ipc-values";
import { createMockCalendarApi } from "./mock-calendar-api";

const ipcCalendarApi: CalendarApi = {
  app: {
    getLocale: () => ipcRenderer.invoke(IPC_CHANNELS.appGetLocale),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
    setLocale: (locale: string) => ipcRenderer.invoke(IPC_CHANNELS.appSetLocale, locale),
  },
  auth: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.authGetState),
    signInWithExchange365: (mode: AuthSignInMode = "user") =>
      ipcRenderer.invoke(IPC_CHANNELS.authSignIn, { mode }),
    signOut: (homeAccountId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.authSignOut, homeAccountId),
    switchAccount: (homeAccountId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.authSwitchAccount, homeAccountId),
    onState: (listener: (state: AuthState) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: AuthState) => listener(state);
      ipcRenderer.on(IPC_CHANNELS.authStateChanged, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.authStateChanged, wrapped);
      };
    },
  },
  calendars: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.calendarsList),
    setColor: (args) => ipcRenderer.invoke(IPC_CHANNELS.calendarsSetColor, args),
    setVisibility: (args) => ipcRenderer.invoke(IPC_CHANNELS.calendarsSetVisibility, args),
  },
  categories: {
    list: (args) => ipcRenderer.invoke(IPC_CHANNELS.categoriesList, args),
  },
  contacts: {
    search: (args) => ipcRenderer.invoke(IPC_CHANNELS.contactsSearch, args),
  },
  events: {
    list: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsList, args),
    search: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsSearch, args),
    create: (draft) => ipcRenderer.invoke(IPC_CHANNELS.eventsCreate, draft),
    update: (draft) => ipcRenderer.invoke(IPC_CHANNELS.eventsUpdate, draft),
    delete: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsDelete, args),
    respond: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsRespond, args),
    forward: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsForward, args),
    cancel: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsCancel, args),
    listAttachments: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsListAttachments, args),
    addAttachment: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsAddAttachment, args),
    removeAttachment: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsRemoveAttachment, args),
    openInApp: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsOpenInApp, args),
    onOpenInApp: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, event: CalendarEvent) => listener(event);
      ipcRenderer.on(IPC_CHANNELS.eventsOpenInAppRequested, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.eventsOpenInAppRequested, wrapped);
      };
    },
    openWebLink: (url) => ipcRenderer.invoke(IPC_CHANNELS.eventsOpenWebLink, url),
  },
  sync: {
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.syncRefresh),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncGetStatus),
    onStatus: (listener: (status: SyncStatus) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: SyncStatus) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.syncStatusChanged, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.syncStatusChanged, wrapped);
      };
    },
  },
  updates: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updatesGetStatus),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.updatesDownload),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updatesInstall),
    onStatus: (listener: (status: AppUpdateStatus) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus) =>
        listener(status);
      ipcRenderer.on(IPC_CHANNELS.updatesStatusChanged, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.updatesStatusChanged, wrapped);
      };
    },
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch),
  },
  reminder: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.reminderGetState),
    onState: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: ReminderDialogState) =>
        listener(state);
      ipcRenderer.on(IPC_CHANNELS.reminderStateChanged, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.reminderStateChanged, wrapped);
      };
    },
    snooze: (dedupeKey: string, minutes: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.reminderSnooze, { dedupeKey, minutes }),
    dismiss: (dedupeKey: string) => ipcRenderer.invoke(IPC_CHANNELS.reminderDismiss, { dedupeKey }),
    dismissAll: () => ipcRenderer.invoke(IPC_CHANNELS.reminderDismissAll),
    minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.reminderWindowMinimize),
  },
  newEventNotifications: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.newEventNotificationsGet),
    onChanged: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, items: NewEventNotificationItem[]) =>
        listener(items);
      ipcRenderer.on(IPC_CHANNELS.newEventNotificationsChanged, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.newEventNotificationsChanged, wrapped);
      };
    },
    dismiss: (eventId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.newEventNotificationsDismiss, eventId),
    dismissAll: () => ipcRenderer.invoke(IPC_CHANNELS.newEventNotificationsDismissAll),
  },
};

const calendarApi =
  process.env.DEFCALENDAR_MOCK_DATA === "1" ? createMockCalendarApi() : ipcCalendarApi;

contextBridge.exposeInMainWorld("calendarApi", calendarApi);
