import type {
  AttachmentDeleteArgs,
  AttachmentUploadArgs,
  AppUpdateStatus,
  AuthSignInMode,
  AuthState,
  CalendarEvent,
  CalendarSummary,
  CancelEventArgs,
  DeleteEventArgs,
  EventAttachment,
  EventDraft,
  EventListArgs,
  EventReferenceArgs,
  RespondToEventArgs,
  SetCalendarVisibilityArgs,
  SyncStatus,
  UserSettings,
  UserSettingsPatch,
} from "./schemas";
import type { EventAttachment, EventResponseAction, ReminderPopupData } from "./ipc-types";

export const IPC_CHANNELS = {
  appGetLocale: "app:get-locale",
  appGetVersion: "app:get-version",
  appSetLocale: "app:set-locale",
  authGetState: "auth:get-state",
  authSignIn: "auth:sign-in",
  authSignOut: "auth:sign-out",
  authStateChanged: "auth:state-changed",
  calendarsList: "calendars:list",
  calendarsSetVisibility: "calendars:set-visibility",
  eventsList: "events:list",
  eventsCreate: "events:create",
  eventsUpdate: "events:update",
  eventsDelete: "events:delete",
  eventsRespond: "events:respond",
  eventsCancel: "events:cancel",
  eventsListAttachments: "events:list-attachments",
  eventsAddAttachment: "events:add-attachment",
  eventsRemoveAttachment: "events:remove-attachment",
  eventsOpenWebLink: "events:open-web-link",
  syncRefresh: "sync:refresh",
  syncGetStatus: "sync:get-status",
  syncStatusChanged: "sync:status-changed",
  updatesGetStatus: "updates:get-status",
  updatesCheck: "updates:check",
  updatesDownload: "updates:download",
  updatesInstall: "updates:install",
  updatesStatusChanged: "updates:status-changed",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  reminderSnooze: "reminder:snooze",
  reminderDismiss: "reminder:dismiss",
  reminderDismissAll: "reminder:dismiss-all",
  windowMinimize: "window:minimize",
  windowMaximize: "window:maximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",
} as const;

interface CalendarApi {
  app: {
    getLocale: () => Promise<string>;
    getVersion: () => Promise<string>;
    setLocale: (locale: string) => Promise<void>;
  };
  auth: {
    getState: () => Promise<AuthState>;
    signInWithExchange365: (mode?: AuthSignInMode) => Promise<AuthState>;
    signOut: () => Promise<AuthState>;
    onState: (listener: (state: AuthState) => void) => () => void;
  };
  calendars: {
    list: () => Promise<CalendarSummary[]>;
    setVisibility: (args: SetCalendarVisibilityArgs) => Promise<CalendarSummary[]>;
  };
  events: {
    list: (args: EventListArgs) => Promise<CalendarEvent[]>;
    create: (draft: EventDraft) => Promise<CalendarEvent>;
    update: (draft: EventDraft) => Promise<CalendarEvent>;
    delete: (args: DeleteEventArgs) => Promise<void>;
    respond: (args: RespondToEventArgs) => Promise<void>;
    cancel: (args: CancelEventArgs) => Promise<void>;
    listAttachments: (args: EventReferenceArgs) => Promise<EventAttachment[]>;
    addAttachment: (args: AttachmentUploadArgs) => Promise<EventAttachment[]>;
    removeAttachment: (args: AttachmentDeleteArgs) => Promise<EventAttachment[]>;
    openWebLink: (url: string) => Promise<void>;
  };
  sync: {
    refresh: () => Promise<SyncStatus>;
    getStatus: () => Promise<SyncStatus>;
    onStatus: (listener: (status: SyncStatus) => void) => () => void;
  };
  updates: {
    getStatus: () => Promise<AppUpdateStatus>;
    check: () => Promise<AppUpdateStatus>;
    download: () => Promise<AppUpdateStatus>;
    install: () => Promise<void>;
    onStatus: (listener: (status: AppUpdateStatus) => void) => () => void;
  };
  settings: {
    get: () => Promise<UserSettings>;
    update: (patch: UserSettingsPatch) => Promise<UserSettings>;
  };
  reminder: {
    snooze: (dedupeKey: string, minutes: number) => Promise<void>;
    dismiss: (dedupeKey: string) => Promise<void>;
    dismissAll: () => Promise<void>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
}

export { type CalendarApi, type EventAttachment, type EventResponseAction, type ReminderPopupData };
