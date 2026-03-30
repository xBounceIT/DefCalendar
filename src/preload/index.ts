import type { AppUpdateStatus, AuthSignInMode, AuthState, SyncStatus } from "@shared/schemas";
import { contextBridge, ipcRenderer } from "electron";
import type { CalendarApi, ReminderDialogState } from "@shared/ipc";
import IPC_CHANNELS from "@shared/ipc-values";

const calendarApi: CalendarApi = {
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
    setVisibility: (args) => ipcRenderer.invoke(IPC_CHANNELS.calendarsSetVisibility, args),
  },
  events: {
    list: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsList, args),
    create: (draft) => ipcRenderer.invoke(IPC_CHANNELS.eventsCreate, draft),
    update: (draft) => ipcRenderer.invoke(IPC_CHANNELS.eventsUpdate, draft),
    delete: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsDelete, args),
    respond: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsRespond, args),
    cancel: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsCancel, args),
    listAttachments: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsListAttachments, args),
    addAttachment: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsAddAttachment, args),
    removeAttachment: (args) => ipcRenderer.invoke(IPC_CHANNELS.eventsRemoveAttachment, args),
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
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized),
  },
};

contextBridge.exposeInMainWorld("calendarApi", calendarApi);
