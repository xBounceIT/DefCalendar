import type { DatesSetArg, EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import type FullCalendar from "@fullcalendar/react";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addMinutesToIso,
  buildEventDayKeys,
  getOutlookCategoryColor,
  isEventEditable,
  roundUpToNext15Minutes,
} from "@shared/calendar";
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
  OutlookCategory,
  EventResponseAction,
  RespondToEventArgs,
  SyncStatus,
} from "@shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { resolveLocaleSettingAsync, setAppLocale } from "./i18n";

import AuthScreen from "./components/auth-screen";
import CalendarSidebar from "./components/calendar-sidebar";
import CalendarSelectionScreen from "./components/calendar-selection-screen";
import SettingsDialog from "./components/settings-dialog";
import type { EditorState } from "./event-editor-state";
import EventEditorDialog from "./components/event-editor-dialog";
import TitleBar from "./components/title-bar";
import UpdateAvailablePopup from "./components/update-available-popup";
import WorkspacePanel from "./components/workspace-panel";
import useUiStore from "./store";

interface EditorSeed {
  allDay: boolean;
  end: string;
  start: string;
}

const EMPTY_CALENDARS: CalendarSummary[] = [];
const EMPTY_CATEGORIES_BY_ACCOUNT: Record<string, OutlookCategory[]> = {};
const EMPTY_EVENTS: CalendarEvent[] = [];
const eventQueryKeys = {
  all: ["events"] as const,
  board: (calendarIds: string[], rangeStart: string, rangeEnd: string) =>
    ["events", "board", calendarIds, rangeStart, rangeEnd] as const,
  miniCalendar: (calendarIds: string[], rangeStart: string, rangeEnd: string) =>
    ["events", "mini-calendar", calendarIds, rangeStart, rangeEnd] as const,
};

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
  const { t } = useTranslation();
  const calendarRef = useRef<FullCalendar | null>(null);
  const queryClient = useQueryClient();
  const fallbackSettings = useMemo(() => createDefaultSettings(), []);
  const startupSelectedDate = useRef(new Date().toISOString());
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [pendingSignInMode, setPendingSignInMode] = useState<AuthSignInMode>("user");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [showCalendarSelection, setShowCalendarSelection] = useState(false);
  const [isApplyingCalendarSelection, setIsApplyingCalendarSelection] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: null,
    message: "Sign in to sync Exchange 365.",
    messageKey: "sync.signInToSync",
    counts: null,
    state: "idle",
  });
  const localizedSyncStatus = useMemo(() => localizeSyncStatus(syncStatus, t), [syncStatus, t]);
  const {
    activeView,
    clearSelectedDayForTable,
    hydrate,
    hydrated,
    rangeEnd,
    rangeStart,
    selectedDate,
    selectedDayForTable,
    setActiveView,
    setRange,
    setSelectedDate,
    setSelectedDayForTable,
  } = useUiStore();
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(() =>
    startOfMonth(new Date(selectedDate)),
  );

  const authQuery = useQuery({
    queryFn: () => calendarApi.auth.getState(),
    queryKey: ["auth"],
  });
  const signedIn = authQuery.data?.status === "signed_in";
  const accounts: AccountSummary[] = authQuery.data?.accounts ?? [];
  const activeAccountId =
    authQuery.data?.status === "signed_in" ? authQuery.data.activeAccountId : null;
  const activeAccount = accounts.find((a) => a.homeAccountId === activeAccountId) ?? null;

  const settingsQuery = useQuery({
    queryFn: () => calendarApi.settings.get(),
    queryKey: ["settings"],
  });

  const appSettings = settingsQuery.data ?? fallbackSettings;

  const calendarsQuery = useQuery({
    enabled: signedIn,
    queryFn: () => calendarApi.calendars.list(),
    queryKey: ["calendars"],
  });

  const calendars = calendarsQuery.data ?? EMPTY_CALENDARS;

  const categoryAccountIds = useMemo(
    () =>
      [...new Set(calendars.map((calendar) => calendar.homeAccountId))].toSorted((a, b) =>
        a.localeCompare(b),
      ),
    [calendars],
  );

  const categoriesQuery = useQuery({
    enabled: signedIn && categoryAccountIds.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        categoryAccountIds.map(async (homeAccountId) => {
          const categories = await calendarApi.categories.list({ homeAccountId });
          return [homeAccountId, categories] as const;
        }),
      );

      return Object.fromEntries(entries) as Record<string, OutlookCategory[]>;
    },
    queryKey: ["categories", ...categoryAccountIds],
  });
  const availableCategoriesByAccount = categoriesQuery.data ?? EMPTY_CATEGORIES_BY_ACCOUNT;

  const visibleCalendarIds = useMemo(() => {
    const ids = calendars
      .filter((calendar) => calendar.isVisible)
      .map((calendar) => calendar.id)
      .toSorted();
    return ids;
  }, [calendars]);
  const miniCalendarRange = useMemo(
    () => createMiniCalendarRange(miniCalendarMonth),
    [miniCalendarMonth],
  );

  const eventsQuery = useQuery({
    enabled: signedIn && visibleCalendarIds.length > 0,
    queryFn: () =>
      calendarApi.events.list({
        calendarIds: visibleCalendarIds,
        end: rangeEnd,
        start: rangeStart,
      }),
    queryKey: eventQueryKeys.board(visibleCalendarIds, rangeStart, rangeEnd),
    gcTime: 0,
    staleTime: 0,
    placeholderData: (previousData) => previousData,
  });
  const miniCalendarEventsQuery = useQuery({
    enabled: signedIn && visibleCalendarIds.length > 0,
    queryFn: () =>
      calendarApi.events.list({
        calendarIds: visibleCalendarIds,
        end: miniCalendarRange.rangeEnd,
        start: miniCalendarRange.rangeStart,
      }),
    queryKey: eventQueryKeys.miniCalendar(
      visibleCalendarIds,
      miniCalendarRange.rangeStart,
      miniCalendarRange.rangeEnd,
    ),
  });

  const signInMutation = useMutation({
    mutationFn: (mode: AuthSignInMode = "user") => calendarApi.auth.signInWithExchange365(mode),
    onError: (error) => {
      setBannerError(toErrorMessage(error));
    },
    onSuccess: async () => {
      setBannerError(null);
      setShowAuthScreen(false);
      setShowCalendarSelection(true);
      queryClient.setQueryData(["calendars"], EMPTY_CALENDARS);
      queryClient.removeQueries({ queryKey: eventQueryKeys.all });
      await invalidateCalendarData(queryClient);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: (homeAccountId?: string) => calendarApi.auth.signOut(homeAccountId),
    onError: (error) => {
      setBannerError(toErrorMessage(error));
    },
    onSuccess: async () => {
      setShowCalendarSelection(false);
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
        invalidateEventQueries(queryClient),
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
      await invalidateEventQueries(queryClient);
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: (draft: EventDraft) => calendarApi.events.update(draft),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await invalidateEventQueries(queryClient);
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
      await invalidateEventQueries(queryClient);
    },
  });

  const respondToEventMutation = useMutation({
    mutationFn: (args: RespondToEventArgs) => calendarApi.events.respond(args),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await invalidateEventQueries(queryClient);
    },
  });

  const cancelEventMutation = useMutation({
    mutationFn: (args: CancelEventArgs) => calendarApi.events.cancel(args),
    onError: (error) => {
      setDialogError(toErrorMessage(error));
    },
    onSuccess: async () => {
      resetEditor(setDialogError, setEditorState);
      await invalidateEventQueries(queryClient);
    },
  });

  useEffect(() => {
    async function loadSyncStatus(): Promise<void> {
      const status = await calendarApi.sync.getStatus();
      setSyncStatus(status);
    }

    void loadSyncStatus();

    const unsubscribeSync = calendarApi.sync.onStatus((status) => {
      setSyncStatus(status);
      if (status.state !== "syncing") {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["calendars"] }),
          invalidateEventQueries(queryClient),
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
  }, [queryClient, calendarApi]);

  useEffect(() => {
    if (settingsQuery.data && !hydrated) {
      hydrate({
        ...settingsQuery.data,
        selectedDate: startupSelectedDate.current,
      });
    }
  }, [hydrate, hydrated, settingsQuery.data]);

  useEffect(() => {
    let cancelled = false;

    async function applyLocalePreference(): Promise<void> {
      const locale = await resolveLocaleSettingAsync(appSettings.language);
      if (!cancelled) {
        setAppLocale(locale);
      }
    }

    void applyLocalePreference();

    return () => {
      cancelled = true;
    };
  }, [appSettings.language]);

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
    const currentDateIso = api.getDate().toISOString();
    if (!Number.isNaN(targetDate.getTime()) && currentDateIso !== selectedDate) {
      api.gotoDate(targetDate);
    }
  }, [activeView, hydrated, selectedDate]);

  const activeAccountCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.homeAccountId === activeAccountId),
    [activeAccountId, calendars],
  );
  let events = EMPTY_EVENTS;
  if (visibleCalendarIds.length > 0 && eventsQuery.data) {
    events = eventsQuery.data;
  }

  const calendarMap = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );
  const categoryColorsByAccount = useMemo(
    () => buildCategoryColorsByAccount(availableCategoriesByAccount),
    [availableCategoriesByAccount],
  );

  const editableCalendar = useMemo(
    () => getPreferredEditableCalendar(calendars, activeAccountId),
    [activeAccountId, calendars],
  );

  const eventLookup = useMemo(
    () => new Map(events.map((event) => [`${event.calendarId}:${event.id}`, event])),
    [events],
  );

  const calendarEvents = useMemo(
    () => buildCalendarEvents(events, calendarMap, categoryColorsByAccount),
    [calendarMap, categoryColorsByAccount, events],
  );
  const miniCalendarEventDayKeys = useMemo(
    () => buildEventDayKeys(miniCalendarEventsQuery.data ?? EMPTY_EVENTS),
    [miniCalendarEventsQuery.data],
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

  async function handleCalendarColorChange(
    calendar: CalendarSummary,
    color: string,
  ): Promise<void> {
    const nextCalendars = await calendarApi.calendars.setColor({
      calendarId: calendar.id,
      color,
    });
    queryClient.setQueryData(["calendars"], nextCalendars);
    await invalidateEventQueries(queryClient);
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

  function handleDuplicate(draft: EventDraft): void {
    if (!editableCalendar) {
      setBannerError(t("app.noWritableCalendar"));
      return;
    }

    setDialogError(null);
    setEditorState({
      allDay: draft.isAllDay,
      calendarId: draft.calendarId,
      draft,
      end: draft.end,
      mode: "create",
      start: draft.start,
    });
  }

  function handleDateClick(clickInfo: DateClickArg): void {
    setSelectedDayForTable(clickInfo.date.toISOString());
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

  function handleJoinMeeting(event: CalendarEvent): void {
    const joinUrl = event.onlineMeeting?.joinUrl;
    if (joinUrl) {
      window.open(joinUrl, "_blank", "noopener,noreferrer");
    }
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
      allowNewTimeProposals: source.allowNewTimeProposals ?? true,
      attachmentIdsToRemove: [],
      attachmentsToAdd: [],
      attendees: source.attendees,
      body: source.body,
      bodyContentType: source.bodyContentType,
      calendarId: source.calendarId,
      categories: source.categories,
      end: getEventBoundary(changeInfo.event.end, source.end),
      etag: source.etag,
      id: source.id,
      isAllDay: source.isAllDay,
      isOnlineMeeting: source.isOnlineMeeting,
      isReminderOn: source.isReminderOn,
      location: source.location,
      recurrence: source.recurrence,
      recurrenceEditScope: "single",
      reminderMinutesBeforeStart: source.reminderMinutesBeforeStart,
      responseRequested: source.responseRequested ?? true,
      sensitivity: source.sensitivity ?? "normal",
      showAs: source.showAs ?? "busy",
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
    const nextRangeStart = dates.start.toISOString();
    const nextRangeEnd = dates.end.toISOString();
    if (rangeStart !== nextRangeStart || rangeEnd !== nextRangeEnd) {
      setRange(nextRangeStart, nextRangeEnd);
      if (selectedDayForTable) {
        clearSelectedDayForTable();
      }
    }

    const nextSelectedDate = dates.view.calendar.getDate().toISOString();
    if (selectedDate !== nextSelectedDate) {
      setSelectedDate(nextSelectedDate);
    }

    const nextView = calendarViewSchema.safeParse(dates.view.type);
    if (nextView.success && activeView !== nextView.data) {
      setActiveView(nextView.data);
    }
  }

  function openSelectedDateComposer(): void {
    const now = new Date();
    const roundedStart = roundUpToNext15Minutes(now);
    openCreateDialog({
      allDay: false,
      end: addMinutesToIso(roundedStart.toISOString(), 30),
      start: roundedStart.toISOString(),
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
    sendResponse: boolean,
  ): Promise<void> {
    await respondToEventMutation.mutateAsync({
      action,
      calendarId: event.calendarId,
      comment,
      eventId: event.id,
      sendResponse,
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

  async function handleCalendarSelectionContinue(selectedCalendarIds: string[]): Promise<void> {
    const selectionCalendars = activeAccountCalendars;
    if (selectionCalendars.length > 0 && selectedCalendarIds.length === 0) {
      setBannerError(t("calendarSelection.selectAtLeastOne"));
      return;
    }

    setBannerError(null);
    setIsApplyingCalendarSelection(true);

    try {
      const selectedIds = new Set(selectedCalendarIds);

      for (const calendar of selectionCalendars) {
        const shouldBeVisible = selectedIds.has(calendar.id);
        if (calendar.isVisible !== shouldBeVisible) {
          await calendarApi.calendars.setVisibility({
            calendarId: calendar.id,
            isVisible: shouldBeVisible,
          });
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendars"] }),
        invalidateEventQueries(queryClient),
      ]);

      if (selectedCalendarIds.length > 0) {
        await refreshMutation.mutateAsync();
      }

      setShowCalendarSelection(false);
    } catch (error) {
      setBannerError(toErrorMessage(error));
    } finally {
      setIsApplyingCalendarSelection(false);
    }
  }

  if (authQuery.isLoading) {
    return <div className="loading-shell">{t("app.loading")}</div>;
  }

  if (!signedIn || showAuthScreen) {
    let signInError = bannerError;
    if (!signInError) {
      signInError = toErrorMessage(signInMutation.error);
    }

    return (
      <AuthScreen
        errorMessage={signInError}
        isAddAccountMode={signedIn && showAuthScreen}
        isPending={signInMutation.isPending}
        onAdminApproval={() => {
          startSignIn("admin_consent");
        }}
        onCancel={signedIn ? () => setShowAuthScreen(false) : undefined}
        onSignIn={() => {
          startSignIn("user");
        }}
        pendingMode={pendingSignInMode}
        showAdminApprovalAction={isAdminApprovalRequiredMessage(signInError)}
      />
    );
  }

  if (showCalendarSelection) {
    let calendarSelectionError = bannerError;
    if (!calendarSelectionError) {
      calendarSelectionError = toErrorMessage(calendarsQuery.error);
    }

    return (
      <CalendarSelectionScreen
        accountEmail={activeAccount?.username ?? null}
        calendars={activeAccountCalendars}
        errorMessage={calendarSelectionError}
        isPending={isApplyingCalendarSelection || refreshMutation.isPending}
        onContinue={(selectedCalendarIds) => {
          void handleCalendarSelectionContinue(selectedCalendarIds);
        }}
      />
    );
  }

  const bannerMessage = buildBannerMessage({
    authError: authQuery.error,
    bannerError,
    calendarsError: calendarsQuery.error,
    eventsError: eventsQuery.error ?? miniCalendarEventsQuery.error,
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
        accounts={accounts}
        calendars={calendars}
        canCreateEvent={Boolean(editableCalendar)}
        eventDayKeys={miniCalendarEventDayKeys}
        isRefreshing={refreshMutation.isPending}
        onAccountAdd={() => setShowAuthScreen(true)}
        onCalendarColorChange={(calendar, color) => {
          void handleCalendarColorChange(calendar, color);
        }}
        onCalendarToggle={(calendar) => {
          void handleCalendarToggle(calendar);
        }}
        onCreateEvent={openSelectedDateComposer}
        onDateSelect={handleDateSelect}
        onMiniCalendarMonthChange={setMiniCalendarMonth}
        onRefresh={() => {
          refreshMutation.mutate();
        }}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onSignOut={() => {
          signOutMutation.mutate(undefined);
        }}
        selectedDate={selectedDate}
        syncStatus={localizedSyncStatus}
        timeFormat={appSettings.timeFormat}
      />
      <WorkspacePanel
        activeView={activeView}
        bannerMessage={bannerMessage}
        calendarEvents={calendarEvents}
        calendarRef={calendarRef}
        canCreateEvent={Boolean(editableCalendar)}
        events={events}
        hasVisibleCalendars={visibleCalendarIds.length > 0}
        onClearDaySelection={clearSelectedDayForTable}
        onCreateEvent={openSelectedDateComposer}
        onDateClick={handleDateClick}
        onDatesSet={handleDatesSet}
        onEventClick={handleEventClick}
        onEventDrop={(changeInfo) => {
          void handleEventMove(changeInfo);
        }}
        onEventResize={(changeInfo) => {
          void handleEventMove(changeInfo);
        }}
        onJoinMeeting={handleJoinMeeting}
        onNext={handleNext}
        onPrev={handlePrev}
        onToday={handleToday}
        onViewSelect={handleViewSelect}
        selectedDate={selectedDate}
        selectedDayForTable={selectedDayForTable}
        timeFormat={appSettings.timeFormat}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={appSettings}
        calendars={calendars}
        onSave={(newSettings) => {
          const previousSettings = appSettings;
          const nextSettings = { ...previousSettings, ...newSettings };
          queryClient.setQueryData(["settings"], nextSettings);

          void calendarApi.settings
            .update(newSettings)
            .then((savedSettings) => {
              queryClient.setQueryData(["settings"], savedSettings);
            })
            .catch(() => {
              queryClient.setQueryData(["settings"], previousSettings);
            });
        }}
      />
      <EventEditorDialog
        accounts={accounts}
        availableCategoriesByAccount={availableCategoriesByAccount}
        onAddAttachment={addEventAttachment}
        onCancelMeeting={cancelMeeting}
        busy={busy}
        calendars={calendars}
        categoriesLoading={categoriesQuery.isLoading}
        errorMessage={dialogError}
        onListAttachments={listEventAttachments}
        onDelete={deleteDraft}
        onDismiss={dismissEditor}
        onDuplicate={handleDuplicate}
        onOpenInOutlook={openExternalEvent}
        onRemoveAttachment={removeEventAttachment}
        onRespond={respondToMeeting}
        onSave={saveDraft}
        state={editorState}
        timeFormat={appSettings.timeFormat}
      />
      <UpdateAvailablePopup />
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
  categoryColorsByAccount: Map<string, Map<string, string>>,
): EventInput[] {
  return events.map((event) => {
    const calendar = calendarMap.get(event.calendarId);
    const categoryColor = resolveFirstCategoryColor(event, calendar, categoryColorsByAccount);
    const calendarColor = categoryColor ? null : (calendar?.userColor ?? calendar?.color ?? null);
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

    const eventInput: EventInput = {
      allDay: event.isAllDay,
      classNames,
      durationEditable: canEditEvent,
      editable: canEditEvent,
      end: event.end,
      extendedProps: {
        calendarColor,
        calendarId: event.calendarId,
        eventData: event,
        eventId: event.id,
      },
      id: `${event.calendarId}:${event.id}`,
      start: event.start,
      startEditable: canEditEvent,
      title: event.subject,
    };

    if (categoryColor) {
      eventInput.backgroundColor = toEventBackgroundColor(categoryColor);
      eventInput.borderColor = categoryColor;
    }

    return eventInput;
  });
}

function buildCategoryColorsByAccount(
  availableCategoriesByAccount: Record<string, OutlookCategory[]>,
): Map<string, Map<string, string>> {
  const lookup = new Map<string, Map<string, string>>();

  for (const [homeAccountId, categories] of Object.entries(availableCategoriesByAccount)) {
    const colors = new Map<string, string>();

    for (const category of categories) {
      const color = getOutlookCategoryColor(category.color);
      if (!color) {
        continue;
      }

      colors.set(category.displayName.toLocaleLowerCase(), color);
    }

    lookup.set(homeAccountId, colors);
  }

  return lookup;
}

function resolveFirstCategoryColor(
  event: Pick<CalendarEvent, "categories">,
  calendar: CalendarSummary | undefined,
  categoryColorsByAccount: Map<string, Map<string, string>>,
): null | string {
  const firstCategory = event.categories[0]?.trim();
  if (!firstCategory || !calendar) {
    return null;
  }

  return (
    categoryColorsByAccount.get(calendar.homeAccountId)?.get(firstCategory.toLocaleLowerCase()) ??
    null
  );
}

function toEventBackgroundColor(color: string): string {
  const normalized = color.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return color;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.2)`;
}

function getPreferredEditableCalendar(
  calendars: CalendarSummary[],
  activeAccountId: null | string,
): CalendarSummary | null {
  const activeCalendars = calendars.filter(
    (calendar) => calendar.homeAccountId === activeAccountId,
  );

  return (
    activeCalendars.find((calendar) => calendar.isVisible && calendar.canEdit) ??
    activeCalendars.find((calendar) => calendar.canEdit) ??
    calendars.find((calendar) => calendar.isVisible && calendar.canEdit) ??
    calendars.find((calendar) => calendar.canEdit) ??
    null
  );
}

function getEventBoundary(value: Date | null | undefined, fallback: string): string {
  if (value) {
    return value.toISOString();
  }

  return fallback;
}

function addDaysToIso(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function invalidateCalendarData(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["auth"] }),
    queryClient.invalidateQueries({ queryKey: ["settings"] }),
    queryClient.invalidateQueries({ queryKey: ["calendars"] }),
    queryClient.invalidateQueries({ queryKey: ["categories"] }),
    invalidateEventQueries(queryClient),
  ]);
}

function createMiniCalendarRange(month: Date): { rangeEnd: string; rangeStart: string } {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  return {
    rangeEnd: endOfWeek(monthEnd, { weekStartsOn: 1 }).toISOString(),
    rangeStart: startOfWeek(monthStart, { weekStartsOn: 1 }).toISOString(),
  };
}

function invalidateEventQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
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
  "Choose calendars to sync.": "sync.chooseCalendars",
  "Select at least one calendar to sync.": "sync.selectCalendars",
  "Calendar cache is up to date.": "sync.cacheUpToDate",
  "Exchange 365 sync failed.": "sync.syncFailed",
};

function translateSyncedCounts(
  counts: NonNullable<SyncStatus["counts"]>,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const { calendars, events } = counts;

  if (calendars === 1 && events === 1) {
    return t("sync.synced.oneCalendarOneEvent", { calendars, events });
  }
  if (calendars === 1) {
    return t("sync.synced.oneCalendarOtherEvents", { calendars, events });
  }
  if (events === 1) {
    return t("sync.synced.otherCalendarsOneEvent", { calendars, events });
  }

  return t("sync.synced.otherCalendarsOtherEvents", { calendars, events });
}

function translateSyncMessage(
  status: SyncStatus,
  t: (key: string, opts?: Record<string, unknown>) => string,
): null | string {
  if (status.counts) {
    return translateSyncedCounts(status.counts, t);
  }

  if (status.messageKey) {
    return t(status.messageKey);
  }

  const { message } = status;
  if (!message) {
    return null;
  }

  const key = SYNC_MESSAGE_MAP[message];
  if (key) {
    return t(key);
  }

  return message;
}

function localizeSyncStatus(
  status: SyncStatus,
  t: (key: string, opts?: Record<string, unknown>) => string,
): SyncStatus {
  return {
    ...status,
    message: translateSyncMessage(status, t),
  };
}

export default App;
