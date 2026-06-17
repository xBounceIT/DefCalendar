type AppLocale = "en" | "it";

interface MainTranslations {
  trayTooltip: string;
  showApp: string;
  refreshNow: string;
  signOut: string;
  quit: string;
  windowTitle: string;
  reminderTitle: string;
  inviteNotificationTitle: string;
  inviteNotificationUntitledEvent: string;
  inviteNotificationUnknownOrganizer: string;
  inviteNotificationAccept: string;
  inviteNotificationTentative: string;
  inviteNotificationDecline: string;
  taskbarInviteOverlayDescriptionOne: string;
  taskbarInviteOverlayDescriptionOther: string;
  signInToSync: string;
  syncing: string;
  connecting: string;
  syncFailed: string;
}

const translations: Record<AppLocale, MainTranslations> = {
  en: {
    trayTooltip: "DefCalendar",
    showApp: "Show DefCalendar",
    refreshNow: "Refresh Now",
    signOut: "Sign Out",
    quit: "Quit",
    windowTitle: "DefCalendar",
    reminderTitle: "Reminder",
    inviteNotificationTitle: "New invitation",
    inviteNotificationUntitledEvent: "Untitled event",
    inviteNotificationUnknownOrganizer: "Unknown organizer",
    inviteNotificationAccept: "Accept",
    inviteNotificationTentative: "Tentative",
    inviteNotificationDecline: "Decline",
    taskbarInviteOverlayDescriptionOne: "1 pending event invitation",
    taskbarInviteOverlayDescriptionOther: "{{count}} pending event invitations",
    signInToSync: "Sign in to sync Exchange 365.",
    syncing: "Syncing Exchange 365\u2026",
    connecting: "Connecting to Exchange 365\u2026",
    syncFailed: "Exchange 365 sync failed.",
  },
  it: {
    trayTooltip: "DefCalendar",
    showApp: "Mostra DefCalendar",
    refreshNow: "Aggiorna ora",
    signOut: "Esci",
    quit: "Esci dall\u2019applicazione",
    windowTitle: "DefCalendar",
    reminderTitle: "Promemoria",
    inviteNotificationTitle: "Nuovo invito",
    inviteNotificationUntitledEvent: "Evento senza titolo",
    inviteNotificationUnknownOrganizer: "Organizzatore sconosciuto",
    inviteNotificationAccept: "Accetta",
    inviteNotificationTentative: "Provvisorio",
    inviteNotificationDecline: "Rifiuta",
    taskbarInviteOverlayDescriptionOne: "1 invito a evento in attesa",
    taskbarInviteOverlayDescriptionOther: "{{count}} inviti a eventi in attesa",
    signInToSync: "Accedi per sincronizzare Exchange 365.",
    syncing: "Sincronizzazione Exchange 365\u2026",
    connecting: "Connessione a Exchange 365\u2026",
    syncFailed: "Sincronizzazione Exchange 365 fallita.",
  },
};

let currentLocale: AppLocale = "en";

function resolveMainLocale(
  language: null | string | undefined,
  systemLanguageTag: string,
): AppLocale {
  if (language === "it" || language === "en") {
    return language;
  }

  if (systemLanguageTag.toLowerCase().startsWith("it")) {
    return "it";
  }

  return "en";
}

function setMainLocale(locale: string): void {
  if (locale === "it" || locale === "en") {
    currentLocale = locale;
  }
}

function getMainLocale(): AppLocale {
  return currentLocale;
}

function t(key: keyof MainTranslations): string {
  return translations[currentLocale][key];
}

export {
  resolveMainLocale,
  setMainLocale,
  getMainLocale,
  t,
  type MainTranslations,
  type AppLocale,
};
