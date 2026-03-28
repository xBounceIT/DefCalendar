import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import type FullCalendar from "@fullcalendar/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { addMinutesToIso, isEventEditable } from "@shared/calendar";
import { isAdminApprovalRequiredMessage } from "@shared/exchange-auth";
import type { CalendarApi } from "@shared/ipc";
import { calendarViewSchema } from "@shared/schema-values";
import { createDefaultSettings } from "@shared/schemas";
import type {
  AccountSummary,
  AttachmentDeleteArgs,
  AttachmentUploadArgs,
  AuthSignInMode,
  CalendarEvent,
  CalendarSummary,
  CancelEventArgs,
  EventDraft,
  EventParticipant,
  EventResponseAction,
  RespondToEventArgs,
  SyncStatus,
} from "@shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { setAppLocale } from "./i18n";

import AuthScreen from "./components/auth-screen";
import CalendarSidebar from "./components/calendar-sidebar";
import SettingsDialog from "./components/settings-dialog";
import type { EditorState } from "./event-editor-state";
import EventEditorDialog from "./components/event-editor-dialog";
import TitleBar from "./components/title-bar";
import WorkspacePanel from "./components/workspace-panel";
import useUiStore from "./store";

interface EditorSeed {
  allDay: boolean;
  end: string;
  start: string;
}

const EMPTY_CALENDARS: CalendarSummary[] = [];
const EMPTY_EVENTS: CalendarEvent[] = [];

function App() {
  const { calendarApi } = globalThis;
  if (!calendarApi) {
    return <StartupFailureScreen />;
  }

  return <CalendarApp calendarApi={calendarApi} />;
}

function StartupFailureScreen() {
  const { t } = useTranslation();

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">{t("app.startupError")}</p>
        <h1>{t("common.appName")}</h1>
        <p className="auth-copy">{t("app.startupErrorMessage")}</p>
        <p className="banner banner--error">{t("app.startupErrorBanner")}</p>
      </div>
    </div>
  );
}

function CalendarApp({ calendarApi }: { calendarApi: CalendarApi }) {
  const { t, i18n } = useTranslation();
  const calendarRef = useRef<FullCalendar | null>(null);
  const queryClient = useQueryClient();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [pendingSignInMode, setPendingSignInMode] = useState<AuthSignInMode>("user");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: null,
    message: t("sync.signInToSync"),
    state: "idle",
  });
  const {
    activeView,
    hydrate,
    hydrated,
    rangeEnd,
    rangeStart,
    selectedDate,
    setActiveView,
    setRange,
    setSelectedDate,
  } = useUiStore();

  const authQuery = useQuery({
    queryFn: () => calendarApi.auth.getState(),
    queryKey: ["auth"],
  });
  const signedIn = authQuery.data?.status === "signed_in";

  const settingsQuery = useQuery({
    enabled: signedIn,
    queryFn: () => calendarApi.settings.get(),
    queryKey: ["settings"],
  });

  const calendarsQuery = useQuery({
    enabled: signedIn,
    queryFn: () => calendarApi.calendars.list(),
    queryKey: ["calendars"],
  });

  const visibleCalendarIds = useMemo(() => {
    const ids = (calendarsQuery.data ?? [])
      .filter((calendar) => calendar.isVisible)
      .map((calendar) => calendar.id)
      .toSorted();
    return ids;
  }, [calendarsQuery.data]);

  const eventsQuery = useQuery({
    enabled: signedIn && visibleCalendarIds.length > 0,
    queryFn: () =>
      calendarApi.events.list({
        calendarIds: visibleCalendarIds,
        end: rangeEnd,
        start: rangeStart,
      }),
    queryKey: ["events"],
    gcTime: 0,
    staleTime: 0,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (signedIn && visibleCalendarIds.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    }
  }, [rangeStart, rangeEnd, visibleCalendarIds, signedIn, queryClient]);

  const signInMutation = useMutation({
    mutationFn: (mode: AuthSignInMode = "user") => calendarApi.auth.signInWithExchange365(mode),
    onError: (error) => {
      setBannerError(toErrorMessage(error));
    },
    onSuccess: async () => {
      setBannerError(null);
      await invalidateCalendarData(queryClient);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => calendarApi.auth.signOut(),
    onError: (error) => {
      setBannerError(toErrorMessage(error));
    },
    onSuccess: async () => {
      setEditorState(null);
      await invalidateCalendarData(queryClient);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => calendarApi.sync.refresh(),
    onError: (error) => {
      setBannerError(toErrorMessage(error));
    },
    onSuccess: async (status) => {
      setSyncStatus(status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendars"] }),
        queryClient.invalidateQueries({ queryKey: ["events"] }),
      ]);
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (draft: EventDraft) => calendarApi.events.create(draft),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: (draft: EventDraft) => calendarApi.events.update(draft),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (event: CalendarEvent) =>
      calendarApi.events.delete({
        calendarId: event.calendarId,
        etag: event.etag,
        eventId: event.id,
      }),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const respondToEventMutation = useMutation({
    mutationFn: (args: RespondToEventArgs) => calendarApi.events.respond(args),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const cancelEventMutation = useMutation({
    mutationFn: (args: CancelEventArgs) => calendarApi.events.cancel(args),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  useEffect(() => {
    async function loadSyncStatus(): Promise<void> {
      const status = await calendarApi.sync.getStatus();
      setSyncStatus({
        ...status,
        message: translateSyncMessage(status.message, t),
      });
    }

    void loadSyncStatus();

    const unsubscribeSync = calendarApi.sync.onStatus((status) => {
      setSyncStatus({
        ...status,
        message: translateSyncMessage(status.message, t),
      });
      if (status.state !== "syncing") {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["calendars"] }),
          queryClient.invalidateQueries({ queryKey: ["events"] }),
        ]);
      }
    });

    const unsubscribeAuth = calendarApi.auth.onState(() => {
      void invalidateCalendarData(queryClient);
    });

    return () => {
      unsubscribeSync();
      unsubscribeAuth();
    };
  }, [queryClient, t, calendarApi]);

  useEffect(() => {
    if (settingsQuery.data && !hydrated) {
      hydrate(settingsQuery.data);
      if (settingsQuery.data.language) {
        setAppLocale(settingsQuery.data.language);
      }
    }
  }, [hydrate, hydrated, settingsQuery.data]);

  useEffect(() => {
    setSyncStatus((prev) => ({
      ...prev,
      message: translateSyncMessage(prev.message, t),
    }));
  }, [i18n.language, t]);

  useEffect(() => {
    if (!signedIn || !hydrated) {
      return;
    }

    void calendarApi.settings
      .update({
        activeView,
        selectedDate,
      })
      .catch(() => undefined);
  }, [activeView, calendarApi, hydrated, selectedDate, signedIn]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api || !hydrated) {
      return;
    }

    if (api.view.type !== activeView) {
      api.changeView(activeView);
    }

    const targetDate = new Date(selectedDate);
    if (!Number.isNaN(targetDate.getTime())) {
      api.gotoDate(targetDate);
    }
  }, [activeView, hydrated, selectedDate]);

  let account: AccountSummary | null = null;
  if (signedIn && authQuery.data?.status === "signed_in") {
    const { account: signedInAccount } = authQuery.data;
    account = signedInAccount;
  }

  const calendars = calendarsQuery.data ?? EMPTY_CALENDARS;
  let events = EMPTY_EVENTS;
  if (visibleCalendarIds.length > 0 && eventsQuery.data) {
    events = eventsQuery.data;
  }

  const calendarMap = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  let editableCalendar =
    calendars.find((calendar) => calendar.isVisible && calendar.canEdit) ?? null;
  if (!editableCalendar) {
    editableCalendar = calendars.find((calendar) => calendar.canEdit) ?? null;
  }

  const eventLookup = useMemo(
    () => new Map(events.map((event) => [`${event.calendarId}:${event.id}`, event])),
    [events],
  );

  const calendarEvents = useMemo(
    () => buildCalendarEvents(events, calendarMap),
    [calendarMap, events],
  );

  const busy =
    signInMutation.isPending ||
    signOutMutation.isPending ||
    refreshMutation.isPending ||
    createEventMutation.isPending ||
    updateEventMutation.isPending ||
    deleteEventMutation.isPending ||
    respondToEventMutation.isPending ||
    cancelEventMutation.isPending;

  async function handleCalendarToggle(calendar: CalendarSummary): Promise<void> {
    const nextCalendars = await calendarApi.calendars.setVisibility({
      calendarId: calendar.id,
      isVisible: !calendar.isVisible,
    });
    queryClient.setQueryData(["calendars"], nextCalendars);
  }

  function openCreateDialog(seed: EditorSeed): void {
    if (!editableCalendar) {
      setBannerError(t("app.noWritableCalendar"));
      return;
    }

    setDialogError(null);
    setEditorState({
      allDay: seed.allDay,
      calendarId: editableCalendar.id,
      end: seed.end,
      mode: "create",
      start: seed.start,
    });
  }

  function handleSelection(selection: DateSelectArg): void {
    openCreateDialog({
      allDay: selection.allDay,
      end: selection.end.toISOString(),
      start: selection.start.toISOString(),
    });
    calendarRef.current?.getApi().unselect();
  }

  function handleEventClick(clickInfo: EventClickArg): void {
    const { calendarId, eventId } = clickInfo.event.extendedProps;
    const eventData = eventLookup.get(`${calendarId}:${eventId}`);
    if (!eventData) {
      return;
    }

    setDialogError(null);
    setEditorState({
      event: eventData,
      mode: "edit",
    });
  }

  async function handleEventMove(changeInfo: EventDropArg | EventResizeDoneArg): Promise<void> {
    const { calendarId, eventId } = changeInfo.event.extendedProps;
    const source = eventLookup.get(`${calendarId}:${eventId}`);
    if (!source) {
      changeInfo.revert();
      return;
    }

    if (!isEventEditable(source)) {
      changeInfo.revert();
      return;
    }

    const nextDraft: EventDraft = {
      body: source.body,
      calendarId: source.calendarId,
      end: getEventBoundary(changeInfo.event.end, source.end),
      etag: source.etag,
      id: source.id,
      isAllDay: source.isAllDay,
      isReminderOn: source.isReminderOn,
      location: source.location,
      reminderMinutesBeforeStart: source.reminderMinutesBeforeStart,
      start: getEventBoundary(changeInfo.event.start, source.start),
      subject: source.subject,
      timeZone: source.timeZone,
      webLink: source.webLink,
    };

    try {
      await updateEventMutation.mutateAsync(nextDraft);
    } catch {
      changeInfo.revert();
    }
  }

  function handleDatesSet(dates: DatesSetArg): void {
    setRange(dates.start.toISOString(), dates.end.toISOString());
    setSelectedDate(dates.view.calendar.getDate().toISOString());

    const nextView = calendarViewSchema.safeParse(dates.view.type);
    if (nextView.success) {
      setActiveView(nextView.data);
    }
  }

  function openSelectedDateComposer(): void {
    openCreateDialog({
      allDay: false,
      end: addMinutesToIso(selectedDate, 60),
      start: selectedDate,
    });
  }

  async function saveDraft(draft: EventDraft): Promise<void> {
    if (editorState?.mode === "edit") {
      await updateEventMutation.mutateAsync(draft);
      return;
    }

    await createEventMutation.mutateAsync(draft);
  }

  async function deleteDraft(event: CalendarEvent): Promise<void> {
    await deleteEventMutation.mutateAsync(event);
  }

  async function cancelMeeting(event: CalendarEvent, comment: string): Promise<void> {
    await cancelEventMutation.mutateAsync({
      calendarId: event.calendarId,
      comment,
      etag: event.etag,
      eventId: event.id,
    });
  }

  async function respondToMeeting(
    event: CalendarEvent,
    action: EventResponseAction,
    comment: string,
  ): Promise<void> {
    await respondToEventMutation.mutateAsync({
      action,
      calendarId: event.calendarId,
      comment,
      eventId: event.id,
      sendResponse: true,
    });
  }

  async function listEventAttachments(event: CalendarEvent) {
    return calendarApi.events.listAttachments({
      calendarId: event.calendarId,
      eventId: event.id,
    });
  }

  async function addEventAttachment(args: AttachmentUploadArgs) {
    return calendarApi.events.addAttachment(args);
  }

  async function removeEventAttachment(args: AttachmentDeleteArgs) {
    return calendarApi.events.removeAttachment(args);
  }

  function dismissEditor(): void {
    resetEditor(setDialogError, setEditorState);
  }

  function handleToday(): void {
    calendarRef.current?.getApi().today();
  }

  function handlePrev(): void {
    calendarRef.current?.getApi().prev();
  }

  function handleNext(): void {
    calendarRef.current?.getApi().next();
  }

  function handleViewSelect(view: typeof activeView): void {
    setActiveView(view);
    calendarRef.current?.getApi().changeView(view);
  }

  function startSignIn(mode: AuthSignInMode): void {
    setBannerError(null);
    setPendingSignInMode(mode);
    signInMutation.mutate(mode);
  }

  if (authQuery.isLoading) {
    return <div className="loading-shell">{t("app.loading")}</div>;
  }

  if (!signedIn) {
    let signInError = bannerError;
    if (!signInError) {
      signInError = toErrorMessage(signInMutation.error);
    }

    return (
      <AuthScreen
        errorMessage={signInError}
        isPending={signInMutation.isPending}
        onAdminApproval={() => {
          startSignIn("admin_consent");
        }}
        onSignIn={() => {
          startSignIn("user");
        }}
        pendingMode={pendingSignInMode}
        showAdminApprovalAction={isAdminApprovalRequiredMessage(signInError)}
      />
    );
  }

  let accountName: string | null = null;
  if (account?.name) {
    accountName = account.name;
  }

  const bannerMessage = buildBannerMessage({
    authError: authQuery.error,
    bannerError,
    calendarsError: calendarsQuery.error,
    eventsError: eventsQuery.error,
  });

  function handleDateSelect(date: Date): void {
    setSelectedDate(date.toISOString());
    const api = calendarRef.current?.getApi();
    if (api) {
      api.gotoDate(date);
    }
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <CalendarSidebar
        accountEmail={account?.username ?? ""}
        accountName={accountName}
        calendars={calendars}
        canCreateEvent={Boolean(editableCalendar)}
        isRefreshing={refreshMutation.isPending}
        onCalendarToggle={(calendar) => {
          void handleCalendarToggle(calendar);
        }}
        onCreateEvent={openSelectedDateComposer}
        onDateSelect={handleDateSelect}
        onRefresh={() => {
          refreshMutation.mutate();
        }}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onSignOut={() => {
          signOutMutation.mutate();
        }}
        selectedDate={selectedDate}
        syncStatus={syncStatus}
      />
      <WorkspacePanel
        activeView={activeView}
        bannerMessage={bannerMessage}
        calendarEvents={calendarEvents}
        calendarRef={calendarRef}
        canCreateEvent={Boolean(editableCalendar)}
        hasVisibleCalendars={visibleCalendarIds.length > 0}
        onCreateEvent={openSelectedDateComposer}
        onDatesSet={handleDatesSet}
        onEventClick={handleEventClick}
        onEventDrop={(changeInfo) => {
          void handleEventMove(changeInfo);
        }}
        onEventResize={(changeInfo) => {
          void handleEventMove(changeInfo);
        }}
        onNext={handleNext}
        onPrev={handlePrev}
        onSelection={handleSelection}
        onToday={handleToday}
        onViewSelect={handleViewSelect}
        selectedDate={selectedDate}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settingsQuery.data ?? createDefaultSettings()}
        calendars={calendars}
        onSave={(newSettings) => {
          void calendarApi.settings.update(newSettings);
        }}
      />
      <EventEditorDialog
        onAddAttachment={addEventAttachment}
        onCancelMeeting={cancelMeeting}
        busy={busy}
        calendars={calendars}
        currentUser={
          account
            ? {
                email: account.username,
                name: account.name,
                response: null,
                status: null,
                type: "required",
              }
            : null
        }
        errorMessage={dialogError}
        onListAttachments={listEventAttachments}
        onDelete={deleteDraft}
        onDismiss={dismissEditor}
        onOpenInOutlook={openExternalEvent}
        onRemoveAttachment={removeEventAttachment}
        onRespond={respondToMeeting}
        onSave={saveDraft}
        state={editorState}
      />
    </div>
  );
}

function buildBannerMessage(args: {
  authError: unknown;
  bannerError: null | string;
  calendarsError: unknown;
  eventsError: unknown;
}): null | string {
  if (args.bannerError) {
    return args.bannerError;
  }

  const parsedAuthError = toErrorMessage(args.authError);
  if (parsedAuthError) {
    return parsedAuthError;
  }

  const parsedCalendarsError = toErrorMessage(args.calendarsError);
  if (parsedCalendarsError) {
    return parsedCalendarsError;
  }

  return toErrorMessage(args.eventsError);
}

function buildCalendarEvents(
  events: CalendarEvent[],
  calendarMap: Map<string, CalendarSummary>,
): EventInput[] {
  return events.map((event) => {
    const calendar = calendarMap.get(event.calendarId);
    const supportsDirectManipulation = event.recurrence === null && !event.cancelled;
    const canEditEvent =
      Boolean(calendar?.canEdit) &&
      isEventEditable(event) &&
      event.isOrganizer &&
      supportsDirectManipulation;
    let classNames: string[] = [];
    if (event.unsupportedReason) {
      classNames = ["calendar-event--readonly"];
    } else if (!supportsDirectManipulation) {
      classNames = ["calendar-event--managed"];
    }

    return {
      allDay: event.isAllDay,
      classNames,
      durationEditable: canEditEvent,
      editable: canEditEvent,
      end: event.end,
      extendedProps: {
        calendarColor: calendar?.color ?? null,
        calendarId: event.calendarId,
        eventData: event,
        eventId: event.id,
      },
      id: `${event.calendarId}:${event.id}`,
      start: event.start,
      startEditable: canEditEvent,
      title: event.subject,
    };
  });
}

function getEventBoundary(value: Date | null | undefined, fallback: string): string {
  if (value) {
    return value.toISOString();
  }

  return fallback;
}

async function invalidateCalendarData(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["auth"] }),
    queryClient.invalidateQueries({ queryKey: ["settings"] }),
    queryClient.invalidateQueries({ queryKey: ["calendars"] }),
    queryClient.invalidateQueries({ queryKey: ["events"] }),
  ]);
}

async function openExternalEvent(url: string): Promise<void> {
  await globalThis.calendarApi.events.openWebLink(url);
}

function resetEditor(
  setDialogError: React.Dispatch<React.SetStateAction<string | null>>,
  setEditorState: React.Dispatch<React.SetStateAction<EditorState | null>>,
): void {
  setDialogError(null);
  setEditorState(null);
}

function toErrorMessage(value: unknown): null | string {
  if (!value) {
    return null;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return "An unexpected error occurred.";
}

const SYNC_MESSAGE_MAP: Record<string, string> = {
  "Sign in to sync Exchange 365.": "sync.signInToSync",
  "Syncing Exchange 365\u2026": "sync.syncing",
  "Connecting to Exchange 365\u2026": "sync.connecting",
  "Exchange 365 sync failed.": "sync.syncFailed",
};

function translateSyncMessage(
  message: null | string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): null | string {
  if (!message) {
    return null;
  }

  const syncMatch = message.match(/^Synced (\d+) calendar\(s?\), (\d+) event\(s?\)\.$/);
  if (syncMatch) {
    const calendars = Number.parseInt(syncMatch[1], 10);
    const events = Number.parseInt(syncMatch[3], 10);
    return t("sync.synced", { count: events, calendars, events });
  }

  const key = SYNC_MESSAGE_MAP[message];
  if (key) {
    return t(key);
  }

  return message;
}

export default App;
