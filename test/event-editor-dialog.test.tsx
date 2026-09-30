// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import EventEditorDialog from "../src/renderer/src/components/event-editor-dialog";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { EditorState } from "../src/renderer/src/event-editor-state";
import type {
  CalendarEvent,
  CalendarSummary,
  EventAttachment,
  EventParticipant,
} from "../src/shared/schemas";

beforeEach(() => {
  vi.stubGlobal("calendarApi", { contacts: { getPhoto: vi.fn().mockResolvedValue(null) } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createCalendar(): CalendarSummary {
  return {
    canEdit: true,
    canShare: false,
    color: "#5b7cfa",
    homeAccountId: "account-1",
    id: "calendar-1",
    isDefaultCalendar: true,
    isVisible: true,
    name: "Primary Calendar",
    ownerAddress: "user@example.com",
    ownerName: "Test User",
  };
}

function createParticipant(): EventParticipant {
  return {
    email: "user@example.com",
    name: "Test User",
    response: null,
    status: null,
    type: "required",
  };
}

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    allowNewTimeProposals: true,
    attachments: [],
    attendees: [],
    body: null,
    bodyContentType: "html",
    bodyPreview: null,
    calendarId: "calendar-1",
    cancelled: false,
    categories: [],
    changeKey: null,
    end: "2026-03-30T10:00:00.000Z",
    etag: null,
    hasAttachments: false,
    id: "event-1",
    isAllDay: false,
    isOnlineMeeting: false,
    isOrganizer: true,
    isReminderOn: true,
    lastModifiedDateTime: null,
    location: null,
    locations: [],
    onlineMeeting: null,
    onlineMeetingProvider: null,
    organizer: createParticipant(),
    recurrence: null,
    reminderMinutesBeforeStart: 0,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal",
    showAs: "busy",
    start: "2026-03-30T09:00:00.000Z",
    subject: "Planning",
    seriesMasterId: null,
    occurrenceId: null,
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: "https://outlook.office.com/calendar/item/1",
    ...overrides,
  };
}

function createAttendeeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return createEvent({
    attendees: [
      {
        email: "coworker@example.com",
        name: "Coworker",
        response: "accepted",
        status: null,
        type: "required",
      },
    ],
    isOrganizer: false,
    responseStatus: null,
    ...overrides,
  });
}

function createAttachment(overrides: Partial<EventAttachment> = {}): EventAttachment {
  return {
    attachmentType: "file",
    contentType: "text/plain",
    id: "attachment-1",
    isInline: false,
    name: "agenda.txt",
    size: 1234,
    ...overrides,
  };
}

function renderDialog(props?: Partial<React.ComponentProps<typeof EventEditorDialog>>) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const onAddAttachment = props?.onAddAttachment ?? vi.fn().mockResolvedValue([]);
  const onDownloadAttachment = props?.onDownloadAttachment ?? vi.fn().mockResolvedValue(true);
  const onFindAcceptConflicts = props?.onFindAcceptConflicts ?? vi.fn().mockResolvedValue([]);
  const onListAttachments = props?.onListAttachments ?? vi.fn().mockResolvedValue([]);
  const onOpenAttachment = props?.onOpenAttachment ?? vi.fn().mockResolvedValue(undefined);
  const onRemoveAttachment = props?.onRemoveAttachment ?? vi.fn().mockResolvedValue([]);
  const onSave = props?.onSave ?? vi.fn().mockResolvedValue(undefined);
  const onSearchContacts = props?.onSearchContacts ?? vi.fn().mockResolvedValue([]);
  const state: EditorState = props?.state ?? {
    event: createEvent(),
    mode: "edit",
  };

  const baseProps = props ?? {};
  const renderElement = (
    overrides: Partial<React.ComponentProps<typeof EventEditorDialog>> = {},
  ) => {
    const mergedProps = { ...baseProps, ...overrides };
    return (
      <I18nextProvider i18n={i18n}>
        <EventEditorDialog
          accounts={[
            {
              color: "#5b7cfa",
              homeAccountId: "account-1",
              name: "Test User",
              tenantId: "tenant-1",
              username: "user@example.com",
            },
          ]}
          availableCategoriesByAccount={{
            "account-1": [
              { color: "preset7", displayName: "Blue category" },
              { color: "preset4", displayName: "Green category" },
              { color: "preset0", displayName: "Red category" },
            ],
          }}
          busy={false}
          calendars={[createCalendar()]}
          categoriesLoading={false}
          errorMessage={null}
          onAddAttachment={onAddAttachment}
          onCancelMeeting={vi.fn().mockResolvedValue(undefined)}
          onDelete={vi.fn().mockResolvedValue(undefined)}
          onDismiss={vi.fn()}
          onDownloadAttachment={onDownloadAttachment}
          onDuplicate={vi.fn()}
          onFindAcceptConflicts={onFindAcceptConflicts}
          onForward={vi.fn().mockResolvedValue(undefined)}
          onListAttachments={onListAttachments}
          onOpenAttachment={onOpenAttachment}
          onOpenInOutlook={vi.fn().mockResolvedValue(undefined)}
          onRemoveAttachment={onRemoveAttachment}
          onRespond={vi.fn().mockResolvedValue(undefined)}
          onSearchContacts={onSearchContacts}
          onGetAttendeeAvailability={vi.fn().mockResolvedValue([])}
          onSave={onSave}
          state={state}
          timeFormat="system"
          {...mergedProps}
        />
      </I18nextProvider>
    );
  };

  const view = render(renderElement());

  return {
    ...view,
    onAddAttachment,
    onDownloadAttachment,
    onFindAcceptConflicts,
    onListAttachments,
    onOpenAttachment,
    onRemoveAttachment,
    rerenderDialog: (nextProps: Partial<React.ComponentProps<typeof EventEditorDialog>>) =>
      view.rerender(renderElement(nextProps)),
    onSave,
    onSearchContacts,
  };
}

function createMeetingState(
  overrides: Partial<Extract<EditorState, { mode: "create" }>> = {},
): EditorState {
  return {
    mode: "create",
    calendarId: "calendar-1",
    allDay: false,
    start: "2026-09-29T09:00:00.000Z",
    end: "2026-09-29T10:00:00.000Z",
    draft: { attendees: [{ ...createParticipant(), email: "coworker@example.com" }] },
    ...overrides,
  };
}

describe("calendar dropdown", () => {
  it("saves the calendar chosen by typing on the closed dropdown", () => {
    expect.hasAssertions();
    const { onSave } = renderDialog({
      calendars: [createCalendar(), { ...createCalendar(), id: "calendar-2", name: "Birthdays" }],
      state: createMeetingState({ draft: { subject: "Planning" } }),
    });
    const trigger = screen.getByRole("button", { name: "Calendar", exact: true });
    fireEvent.keyDown(trigger, { key: "b" });
    expect(trigger).toHaveTextContent("Birthdays (user@example.com)");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "calendar-2" }));
  });

  it.each(["create", "edit"] as const)("saves the selected calendar in %s mode", (mode) => {
    expect.hasAssertions();
    const { onSave } = renderDialog({
      calendars: [createCalendar(), { ...createCalendar(), id: "calendar-2", name: "Birthdays" }],
      state:
        mode === "create"
          ? createMeetingState({ draft: { subject: "Planning" } })
          : { mode: "edit", event: createEvent() },
    });
    const trigger = screen.getByRole("button", { name: "Calendar", exact: true });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("option", { name: "Primary Calendar (user@example.com)" }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("option", { name: "Birthdays (user@example.com)" }));
    expect(trigger).toHaveTextContent("Birthdays (user@example.com)");
    expect(screen.queryByRole("listbox", { name: "Calendar" })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: mode === "create" ? "Create Event" : "Save Changes" }),
    );
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "calendar-2" }));
  });

  it("supports keyboard navigation and dismisses without changing the calendar", () => {
    expect.hasAssertions();
    renderDialog({
      calendars: [createCalendar(), { ...createCalendar(), id: "calendar-2", name: "Birthdays" }],
    });
    const trigger = screen.getByRole("button", { name: "Calendar", exact: true });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], { key: "Home" });
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], { key: "End" });
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("Primary Calendar");
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.blur(screen.getAllByRole("option")[0], {
      relatedTarget: screen.getByPlaceholderText("Subject"),
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("prevents changing the calendar for an attendee", () => {
    expect.hasAssertions();
    renderDialog({ state: { mode: "edit", event: createAttendeeEvent() } });
    const trigger = screen.getByRole("button", { name: "Calendar", exact: true });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox", { name: "Calendar" })).not.toBeInTheDocument();
  });
});

describe("new meeting participant availability", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks valid participants even when another address is malformed", async () => {
    expect.hasAssertions();
    const load = vi.fn().mockResolvedValue([{ email: "coworker@example.com", status: "free" }]);
    renderDialog({
      onGetAttendeeAvailability: load,
      state: createMeetingState({
        draft: {
          attendees: [
            { ...createParticipant(), email: "coworker@example.com" },
            { ...createParticipant(), email: "unfinished-address" },
          ],
        },
      }),
    });
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({ emails: ["coworker@example.com"] }),
    );
    expect(
      within(screen.getByText("unfinished-address").closest(".attendee-pill")!).getByText(
        "Unknown",
      ),
    ).toBeInTheDocument();
  });

  it("times out a stalled check, checks a changed time and ignores its late response", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    let resolveOld: (items: { email: string; status: "free" }[]) => void = () => undefined;
    const stalled = new Promise<{ email: string; status: "free" }[]>((resolve) => {
      resolveOld = resolve;
    });
    const load = vi
      .fn()
      .mockReturnValueOnce(stalled)
      .mockResolvedValue([{ email: "coworker@example.com", status: "busy" }]);
    const view = renderDialog({ onGetAttendeeAvailability: load, state: createMeetingState() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_300);
    });
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    view.rerenderDialog({
      state: createMeetingState({
        start: "2026-09-29T11:00:00.000Z",
        end: "2026-09-29T12:00:00.000Z",
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await act(async () => {
      resolveOld([{ email: "coworker@example.com", status: "free" }]);
    });
    expect(screen.getByText("coworker@example.com").closest(".attendee-pill")).toHaveClass(
      "attendee-pill--busy",
    );
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("allows the service deadline to return successful colleagues before the UI times out", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    const load = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          globalThis.setTimeout(
            () =>
              resolve([
                { email: "coworker@example.com", status: "free" },
                { email: "other@example.com", status: "unknown", error: "requestFailed" },
              ]),
            30_001,
          );
        }),
    );
    renderDialog({
      onGetAttendeeAvailability: load,
      state: createMeetingState({
        draft: {
          attendees: [
            { ...createParticipant(), email: "coworker@example.com" },
            { ...createParticipant(), email: "other@example.com" },
          ],
        },
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_301);
    });
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(
      within(screen.getByText("other@example.com").closest(".attendee-pill")!).getByText("Unknown"),
    ).toBeInTheDocument();
  });

  it.each([
    ["2026-03-29", "2026-03-30"],
    ["2026-10-25", "2026-10-26"],
  ])(
    "keeps an all-day range at local midnight across the clock change on %s",
    async (day, nextDay) => {
      expect.hasAssertions();
      const load = vi.fn().mockResolvedValue([{ email: "coworker@example.com", status: "free" }]);
      const start = toLocalIso(`${day}T00:00:00`);
      const end = toLocalIso(`${nextDay}T00:00:00`);
      const view = renderDialog({
        onGetAttendeeAvailability: load,
        state: createMeetingState({ allDay: true, start, end }),
      });
      expect(await screen.findByText("Available")).toBeInTheDocument();
      expect(load).toHaveBeenCalledWith(expect.objectContaining({ start, end }));
      editSubject("All-day meeting");
      fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
      expect(view.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ start, end, isAllDay: true }),
      );
    },
  );

  it("highlights required and optional participants without blocking save", async () => {
    expect.hasAssertions();
    const load = vi.fn().mockResolvedValue([
      { email: "coworker@example.com", status: "busy" },
      { email: "optional@example.com", status: "free" },
    ]);
    const view = renderDialog({
      onGetAttendeeAvailability: load,
      state: createMeetingState({
        draft: {
          attendees: [
            { ...createParticipant(), email: "coworker@example.com" },
            { ...createParticipant(), email: "optional@example.com", type: "optional" },
          ],
        },
      }),
    });
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh availability" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Availability for the selected time, where calendar sharing allows it."),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByText("coworker@example.com").closest(".attendee-pill")!).getByText("Busy"),
    ).toBeInTheDocument();
    expect(screen.getByText("coworker@example.com").closest(".attendee-pill")).toHaveClass(
      "attendee-pill--busy",
    );
    expect(load).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      emails: ["coworker@example.com", "optional@example.com"],
      start: "2026-09-29T09:00:00.000Z",
      end: "2026-09-29T10:00:00.000Z",
    });
    editSubject("Planning");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() => expect(view.onSave).toHaveBeenCalled());
  });

  it("updates automatically when the time changes and discards a late response", async () => {
    expect.hasAssertions();
    let resolveOld: (items: { email: string; status: "busy" }[]) => void = () => undefined;
    const oldRequest = new Promise<{ email: string; status: "busy" }[]>((resolve) => {
      resolveOld = resolve;
    });
    const load = vi
      .fn()
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue([{ email: "coworker@example.com", status: "free" }]);
    const view = renderDialog({ onGetAttendeeAvailability: load, state: createMeetingState() });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    view.rerenderDialog({
      state: createMeetingState({
        start: "2026-09-29T11:00:00.000Z",
        end: "2026-09-29T12:00:00.000Z",
      }),
    });
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(await screen.findByText("Available")).toBeInTheDocument();
    await act(async () => {
      resolveOld([{ email: "coworker@example.com", status: "busy" }]);
    });
    expect(screen.getByText("coworker@example.com").closest(".attendee-pill")).toHaveClass(
      "attendee-pill--free",
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("checks the exclusive end of an all-day meeting and marks permission failures unknown", async () => {
    expect.hasAssertions();
    const load = vi.fn().mockRejectedValue(new Error("Access denied"));
    renderDialog({
      onGetAttendeeAvailability: load,
      state: createMeetingState({
        allDay: true,
        start: toLocalIso("2026-09-29T00:00:00"),
        end: toLocalIso("2026-09-30T00:00:00"),
      }),
    });
    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      emails: ["coworker@example.com"],
      start: toLocalIso("2026-09-29T00:00:00"),
      end: toLocalIso("2026-09-30T00:00:00"),
    });
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("does not check existing meetings against their own reservations", async () => {
    expect.hasAssertions();
    const load = vi.fn();
    renderDialog({
      onGetAttendeeAvailability: load,
      state: {
        mode: "edit",
        event: createEvent({
          attendees: [{ ...createParticipant(), email: "coworker@example.com" }],
        }),
      },
    });
    expect(screen.queryByText("Checking…")).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("updates availability when the selected calendar or participants change", async () => {
    expect.hasAssertions();
    const load = vi
      .fn()
      .mockResolvedValueOnce([{ email: "coworker@example.com", status: "free" }])
      .mockResolvedValue([{ email: "coworker@example.com", status: "unknown" }]);
    renderDialog({
      onGetAttendeeAvailability: load,
      state: createMeetingState(),
      calendars: [
        createCalendar(),
        { ...createCalendar(), id: "calendar-2", homeAccountId: "account-2" },
      ],
    });
    expect(await screen.findByText("Available")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calendar", exact: true }));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ calendarId: "calendar-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });
});

function openSchedulingSection(container: HTMLElement) {
  const schedulingButton = container.querySelector(".scheduling-summary");
  if (!(schedulingButton instanceof HTMLButtonElement)) {
    throw new Error("Scheduling summary button not found");
  }
  fireEvent.click(schedulingButton);
}

function toLocalIso(value: string): string {
  return new Date(value).toISOString();
}

function editSubject(value: string): void {
  fireEvent.change(screen.getByPlaceholderText("Subject"), {
    target: { value },
  });
}

function applyEditorStyles(): void {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/renderer/src/styles.css", "utf8");
  document.head.append(style);
  onTestFinished(() => style.remove());
}

afterEach(() => {
  cleanup();
});

describe("event editor dialog", () => {
  it("keeps padded scheduling controls and weekly options able to wrap", () => {
    expect.hasAssertions();
    applyEditorStyles();
    const { container } = renderDialog();
    openSchedulingSection(container);
    fireEvent.click(screen.getByLabelText("Recurring event"));

    const weekdays = screen.getByLabelText("mon").closest("fieldset")!;
    expect(getComputedStyle(weekdays).minWidth).toBe("0px");
    expect(getComputedStyle(weekdays.querySelector("div")!).flexWrap).toBe("wrap");
    expect(getComputedStyle(container.querySelector(".scheduling-dropdown__row")!).flexWrap).toBe(
      "wrap",
    );
    expect(
      getComputedStyle(container.querySelector(".scheduling-dropdown__options")!).flexWrap,
    ).toBe("wrap");
  });

  it("keeps long attendee pills within the padded field and separates scheduling hover", () => {
    expect.hasAssertions();
    applyEditorStyles();
    const { container } = renderDialog({
      state: {
        event: createEvent({
          attendees: [{ ...createParticipant(), email: "very-long-attendee-address@example.com" }],
        }),
        mode: "edit",
      },
    });
    expect(getComputedStyle(container.querySelector(".attendee-pill")!).maxWidth).toBe(
      "min(250px, 100%)",
    );
    expect(getComputedStyle(container.querySelector(".scheduling-teams-stack")!).paddingTop).toBe(
      "4px",
    );
    expect(getComputedStyle(container.querySelector(".teams-toggle__label")!).whiteSpace).toBe(
      "normal",
    );
  });

  it("allows selecting a saved attendee event title while keeping it read-only", () => {
    expect.hasAssertions();
    renderDialog({
      state: { event: createAttendeeEvent(), mode: "edit" },
    });

    const subject = screen.getByPlaceholderText<HTMLInputElement>("Subject");
    expect(subject).toBeEnabled();
    expect(subject).toHaveAttribute("readonly");
    subject.focus();
    subject.setSelectionRange(0, subject.value.length);
    expect(subject).toHaveFocus();
    expect(subject.value.slice(subject.selectionStart!, subject.selectionEnd!)).toBe("Planning");
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });

  it("opens the current unsaved location in Google Maps while creating an event", () => {
    expect.hasAssertions();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      onSave,
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: "2026-03-30T10:00:00.000Z",
        mode: "create",
        start: "2026-03-30T09:00:00.000Z",
      },
    });

    expect(screen.queryByRole("link", { name: "Open in Google Maps" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Location"), {
      target: { value: "  Caffè & Bar #1, Via Roma 10, Milano  " },
    });

    const link = screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" });
    const url = new URL(link.href);
    expect({
      origin: url.origin,
      pathname: url.pathname,
      parameters: Object.fromEntries(url.searchParams),
      target: link.target,
      rel: link.rel,
    }).toStrictEqual({
      origin: "https://www.google.com",
      pathname: "/maps/search/",
      parameters: { api: "1", query: "Caffè & Bar #1, Via Roma 10, Milano" },
      target: "_blank",
      rel: "noopener noreferrer",
    });
    fireEvent.click(link);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Location"), { target: { value: "   " } });
    expect(screen.queryByRole("link", { name: "Open in Google Maps" })).not.toBeInTheDocument();
  });

  it("updates the map link when an existing event location is edited", () => {
    expect.hasAssertions();
    const { rerenderDialog } = renderDialog({
      state: { event: createEvent({ location: "Roma" }), mode: "edit" },
    });

    expect(screen.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Roma",
    );
    fireEvent.change(screen.getByPlaceholderText("Location"), { target: { value: "Milano" } });
    expect(screen.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Milano",
    );
    rerenderDialog({ state: { event: createEvent({ location: null }), mode: "edit" } });
    expect(screen.queryByRole("link", { name: "Open in Google Maps" })).not.toBeInTheDocument();
  });

  it("offers the map link for a read-only attendee event", () => {
    expect.hasAssertions();
    renderDialog({
      state: { event: createAttendeeEvent({ location: "Via Roma 10, Milano" }), mode: "edit" },
    });

    expect(screen.getByPlaceholderText("Location")).toBeDisabled();
    expect(screen.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Via+Roma+10%2C+Milano",
    );
  });

  it.each(["Via Roma \uD800, Milano", "Via Roma \uDC00, Milano"])(
    "keeps the editor usable for malformed Unicode in the location: %j",
    (location) => {
      expect.hasAssertions();
      renderDialog({ state: { event: createEvent({ location }), mode: "edit" } });

      expect(screen.getByPlaceholderText("Location")).toHaveValue(location);
      const link = screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" });
      expect(new URL(link.href).searchParams.get("query")).toBe("Via Roma \uFFFD, Milano");
    },
  );

  it("reports locations exceeding the Google Maps URL limit without truncating them", () => {
    expect.hasAssertions();
    const location = "東".repeat(223);
    renderDialog({ state: { event: createEvent({ location }), mode: "edit" } });

    expect(screen.queryByRole("link", { name: "Open in Google Maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Location is too long for Google Maps");
    expect(screen.getByPlaceholderText("Location")).toHaveValue(location);
  });

  it("allows a 2048-character map URL and recovers when an oversized location is shortened", () => {
    expect.hasAssertions();
    const location = "A".repeat(2000);
    renderDialog({ state: { event: createEvent({ location }), mode: "edit" } });
    expect(
      screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" }).href,
    ).toHaveLength(2048);

    const input = screen.getByPlaceholderText("Location");
    fireEvent.change(input, { target: { value: `${location}A` } });
    expect(screen.queryByRole("link", { name: "Open in Google Maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Location is too long for Google Maps");

    fireEvent.change(input, { target: { value: "Roma" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Roma",
    );
  });

  it.each([
    "javascript:alert(1)",
    "https://evil.example/?api=0&query=other#fragment",
    "45.4642,9.1900",
    "📍 東京駅 + 50%",
  ])("treats the location only as map search text: %j", (location) => {
    expect.hasAssertions();
    renderDialog({ state: { event: createEvent({ location }), mode: "edit" } });
    const url = new URL(
      screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" }).href,
    );

    expect({ origin: url.origin, pathname: url.pathname, hash: url.hash }).toStrictEqual({
      origin: "https://www.google.com",
      pathname: "/maps/search/",
      hash: "",
    });
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({ api: "1", query: location });
  });

  it("lists and manages event attachments", async () => {
    expect.hasAssertions();
    const attachment = createAttachment();
    const onDownloadAttachment = vi.fn().mockResolvedValue(true);
    const onListAttachments = vi.fn().mockResolvedValue([attachment]);
    const onOpenAttachment = vi.fn().mockResolvedValue(undefined);
    const onRemoveAttachment = vi.fn().mockResolvedValue([]);

    renderDialog({
      onDownloadAttachment,
      onListAttachments,
      onOpenAttachment,
      onRemoveAttachment,
      state: {
        event: createEvent({ attachments: [attachment], hasAttachments: true }),
        mode: "edit",
      },
    });

    await expect(screen.findByText("agenda.txt")).resolves.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open agenda.txt" }));
    await waitFor(() => {
      expect(onOpenAttachment).toHaveBeenCalledWith({
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Download agenda.txt" }));
    await waitFor(() => {
      expect(onDownloadAttachment).toHaveBeenCalledWith({
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove agenda.txt" }));
    await waitFor(() => {
      expect(onRemoveAttachment).toHaveBeenCalledWith({
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      });
    });
    expect(onRemoveAttachment).toHaveBeenCalledOnce();
  });

  it("clears attachment loading when switching to an event without attachments", async () => {
    expect.hasAssertions();
    let resolveAttachments: (attachments: EventAttachment[]) => void = () => {};
    const loadingAttachments = new Promise<EventAttachment[]>((resolve) => {
      resolveAttachments = resolve;
    });
    const onListAttachments = vi.fn().mockReturnValue(loadingAttachments);
    const { rerenderDialog } = renderDialog({
      onListAttachments,
      state: {
        event: createEvent({
          attachments: [createAttachment()],
          hasAttachments: true,
          id: "event-with-attachments",
        }),
        mode: "edit",
      },
    });

    await expect(screen.findByText("Loading…")).resolves.toBeInTheDocument();

    rerenderDialog({
      state: {
        event: createEvent({
          attachments: [],
          hasAttachments: false,
          id: "event-without-attachments",
        }),
        mode: "edit",
      },
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No attachments")).toBeInTheDocument();
    resolveAttachments([]);
    expect(onListAttachments).toHaveBeenCalledOnce();
  });

  it("does not show stale attachments while loading a different event", async () => {
    expect.hasAssertions();
    let resolveSecondLoad: (attachments: EventAttachment[]) => void = () => {};
    const secondLoad = new Promise<EventAttachment[]>((resolve) => {
      resolveSecondLoad = resolve;
    });
    const firstAttachment = createAttachment({ id: "first-attachment", name: "first.txt" });
    const onListAttachments = vi
      .fn()
      .mockResolvedValueOnce([firstAttachment])
      .mockReturnValueOnce(secondLoad);
    const { rerenderDialog } = renderDialog({
      onListAttachments,
      state: {
        event: createEvent({
          attachments: [firstAttachment],
          hasAttachments: true,
          id: "first-event",
        }),
        mode: "edit",
      },
    });

    await expect(screen.findByText("first.txt")).resolves.toBeInTheDocument();

    rerenderDialog({
      state: {
        event: createEvent({
          attachments: [],
          hasAttachments: true,
          id: "second-event",
        }),
        mode: "edit",
      },
    });

    await waitFor(() => {
      expect(screen.queryByText("first.txt")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolveSecondLoad([]);
    expect(onListAttachments).toHaveBeenCalledTimes(2);
  });

  it("adds attachment files", async () => {
    expect.hasAssertions();
    const returnedAttachment = createAttachment({ name: "notes.txt", size: 5 });
    const onAddAttachment = vi.fn().mockResolvedValue([returnedAttachment]);
    const { container } = renderDialog({ onAddAttachment });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(input).not.toBeNull();
    if (!input) {
      throw new Error("File input not found");
    }
    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "notes.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(onAddAttachment).toHaveBeenCalledWith({
        attachment: {
          contentBytes: "aGVsbG8=",
          contentType: "text/plain",
          name: "notes.txt",
          size: 5,
        },
        calendarId: "calendar-1",
        eventId: "event-1",
      });
    });
    await expect(screen.findByText("notes.txt")).resolves.toBeInTheDocument();
  });

  it("preserves successful attachment uploads when a later file fails", async () => {
    expect.hasAssertions();
    const returnedAttachment = createAttachment({ name: "first.txt", size: 5 });
    const onAddAttachment = vi
      .fn()
      .mockResolvedValueOnce([returnedAttachment])
      .mockRejectedValueOnce(new Error("Upload failed"));
    const { container } = renderDialog({ onAddAttachment });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(input).not.toBeNull();
    if (!input) {
      throw new Error("File input not found");
    }
    fireEvent.change(input, {
      target: {
        files: [
          new File(["first"], "first.txt", { type: "text/plain" }),
          new File(["second"], "second.txt", { type: "text/plain" }),
        ],
      },
    });

    await waitFor(() => {
      expect(onAddAttachment).toHaveBeenCalledTimes(2);
    });
    await expect(screen.findByText("first.txt")).resolves.toBeInTheDocument();
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
  });

  it("blocks attachment files above three megabytes", async () => {
    expect.hasAssertions();
    const onAddAttachment = vi.fn().mockResolvedValue([]);
    const { container } = renderDialog({ onAddAttachment });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const largeFile = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    });

    expect(input).not.toBeNull();
    if (!input) {
      throw new Error("File input not found");
    }
    fireEvent.change(input, {
      target: {
        files: [largeFile],
      },
    });

    await expect(
      screen.findByText("large.pdf must be smaller than 3 MB."),
    ).resolves.toBeInTheDocument();
    expect(onAddAttachment).not.toHaveBeenCalled();
  });

  it("shows reference attachments without local open or download actions", async () => {
    expect.hasAssertions();
    const attachment = createAttachment({
      attachmentType: "reference",
      contentType: null,
      id: "reference-1",
      name: "cloud-file.docx",
      size: 0,
    });

    renderDialog({
      onListAttachments: vi.fn().mockResolvedValue([attachment]),
      state: {
        event: createEvent({ attachments: [attachment], hasAttachments: true }),
        mode: "edit",
      },
    });

    await expect(screen.findByText("cloud-file.docx")).resolves.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open cloud-file.docx" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download cloud-file.docx" })).toBeDisabled();
    expect(screen.getByText("Open from Outlook")).toBeInTheDocument();
  });

  it("shows and preserves a zero-minute reminder", async () => {
    const { onSave } = renderDialog();

    await expect(screen.findByRole("button", { name: "0 min" })).resolves.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "5 minutes" })).toBeNull();

    editSubject("Planning Updated");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderMinutesBeforeStart: 0,
      }),
    );
  }, 10_000);

  it("allows selecting next-day midnight end time for late-night starts", () => {
    const { container, onSave } = renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: toLocalIso("2026-01-15T23:30"),
        mode: "create",
        start: toLocalIso("2026-01-15T23:00"),
      },
    });

    openSchedulingSection(container);

    const startTimeInput = screen.getByLabelText("Start time");
    fireEvent.focus(startTimeInput);
    const option2330 = screen.getByText("23:30");
    fireEvent.click(option2330);

    editSubject("Late event");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        end: toLocalIso("2026-01-16T00:00"),
        start: toLocalIso("2026-01-15T23:30"),
      }),
    );
  });

  it("auto-adjusts end date to next day when start moves to 23:30", () => {
    const { container, onSave } = renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: toLocalIso("2026-01-15T23:30"),
        mode: "create",
        start: toLocalIso("2026-01-15T23:00"),
      },
    });

    openSchedulingSection(container);

    const startTimeInput = screen.getByLabelText("Start time");
    fireEvent.focus(startTimeInput);
    const option2330 = screen.getByText("23:30");
    fireEvent.click(option2330);

    editSubject("Late event");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        end: toLocalIso("2026-01-16T00:00"),
        start: toLocalIso("2026-01-15T23:30"),
      }),
    );
  });

  it("shifts end date by the same delta when start date changes", () => {
    const { container, onSave } = renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: toLocalIso("2026-01-16T00:30"),
        mode: "create",
        start: toLocalIso("2026-01-15T23:30"),
      },
    });

    openSchedulingSection(container);

    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-01-20" },
    });

    editSubject("Late event");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        end: toLocalIso("2026-01-21T00:30"),
        start: toLocalIso("2026-01-20T23:30"),
      }),
    );
  });

  it("selects categories from the tag dropdown", async () => {
    const { onSave } = renderDialog();

    fireEvent.click(screen.getAllByRole("button", { name: /Categories/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Blue category/i }));
    fireEvent.click(screen.getByRole("button", { name: /Red category/i }));

    fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]!);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["Blue category", "Red category"],
      }),
    );
  });

  it("saves required and optional attendees from separate rows in create mode", () => {
    const { onSave } = renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: "2026-03-30T10:00:00.000Z",
        mode: "create",
        start: "2026-03-30T09:00:00.000Z",
      },
    });

    editSubject("Planning");
    const requiredInput = screen.getByRole("combobox", { name: "Required attendees" });
    const optionalInput = screen.getByRole("combobox", { name: "Optional attendees" });

    fireEvent.change(requiredInput, {
      target: { value: "alice@example.com, bob@example.com" },
    });
    fireEvent.keyDown(requiredInput, { key: "Enter" });

    fireEvent.change(optionalInput, {
      target: { value: "carol@example.com" },
    });
    fireEvent.keyDown(optionalInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [
          {
            email: "alice@example.com",
            name: null,
            response: null,
            status: null,
            type: "required",
          },
          {
            email: "bob@example.com",
            name: null,
            response: null,
            status: null,
            type: "required",
          },
          {
            email: "carol@example.com",
            name: null,
            response: null,
            status: null,
            type: "optional",
          },
        ],
      }),
    );
  });

  it("preserves selected categories missing from account master list", async () => {
    const { onSave } = renderDialog({
      availableCategoriesByAccount: {
        "account-1": [{ color: "preset7", displayName: "Blue category" }],
      },
      state: {
        event: createEvent({ categories: ["Legacy category"] }),
        mode: "edit",
      },
    });

    editSubject("Planning Updated");
    fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]!);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["Legacy category"],
      }),
    );
  });

  it("prefills attendee pills in the matching rows", () => {
    renderDialog({
      state: {
        event: createEvent({
          attendees: [
            {
              email: "alice@example.com",
              name: "Alice",
              response: null,
              status: null,
              type: "required",
            },
            {
              email: "bob@example.com",
              name: "Bob",
              response: null,
              status: null,
              type: "optional",
            },
          ],
        }),
        mode: "edit",
      },
    });

    const requiredRow = screen
      .getByRole("combobox", { name: "Required attendees" })
      .closest(".attendee-pills-wrapper");
    const optionalRow = screen
      .getByRole("combobox", { name: "Optional attendees" })
      .closest(".attendee-pills-wrapper");

    expect(requiredRow).toBeInstanceOf(HTMLElement);
    expect(optionalRow).toBeInstanceOf(HTMLElement);
    expect(within(requiredRow as HTMLElement).getByText("alice@example.com")).toBeInTheDocument();
    expect(within(optionalRow as HTMLElement).getByText("bob@example.com")).toBeInTheDocument();
  });

  it.each(["Required attendees", "Optional attendees"])(
    "preserves suggestion relevance in %s and updates it as the query changes",
    async (label) => {
      const onSearchContacts = vi.fn().mockImplementation(({ query }) =>
        Promise.resolve(
          query
            ? [
                { email: "zoe@example.com", name: "Zoe" },
                { email: "alice@example.com", name: "Alice" },
              ]
            : [
                { email: "zoe@example.com", name: "Zoe" },
                { email: "alice@example.com", name: "Alice" },
                { email: "coworker@example.com", name: "Coworker" },
              ],
        ),
      );
      renderDialog({
        onSearchContacts,
        state: {
          event: createEvent({
            attendees: [{ ...createParticipant(), email: "coworker@example.com" }],
          }),
          mode: "edit",
        },
      });
      const input = screen.getByRole("combobox", { name: label });
      fireEvent.click(input);
      await screen.findByRole("option", { name: /Alice/ });
      expect(onSearchContacts).toHaveBeenLastCalledWith({
        homeAccountId: "account-1",
        limit: null,
        query: "",
      });
      expect(within(screen.getByRole("listbox")).getAllByRole("option")).toEqual([
        screen.getByRole("option", { name: /Zoe/ }),
        screen.getByRole("option", { name: /Alice/ }),
      ]);

      fireEvent.change(input, { target: { value: "zo" } });
      await waitFor(() =>
        expect(onSearchContacts).toHaveBeenLastCalledWith({
          homeAccountId: "account-1",
          limit: null,
          query: "zo",
        }),
      );
      await screen.findByRole("option", { name: /Zoe/ });
      expect(within(screen.getByRole("listbox")).getAllByRole("option")).toEqual([
        screen.getByRole("option", { name: /Zoe/ }),
        screen.getByRole("option", { name: /Alice/ }),
      ]);

      fireEvent.change(input, { target: { value: "" } });
      await screen.findByRole("option", { name: /Alice/ });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      fireEvent.click(input);
      await screen.findByRole("option", { name: /Alice/ });
    },
  );

  it("loads profile photos in the optional attendee popup and keeps initials when unavailable", async () => {
    const photo = "data:image/jpeg;base64,cGhvdG8=";
    const getPhoto = vi
      .fn()
      .mockImplementation(({ email }) =>
        Promise.resolve(email === "alice@example.com" ? photo : null),
      );
    vi.stubGlobal("calendarApi", { contacts: { getPhoto } });
    const observers: { callback: IntersectionObserverCallback; element?: Element }[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        private record: (typeof observers)[number];
        constructor(callback: IntersectionObserverCallback) {
          this.record = { callback };
          observers.push(this.record);
        }
        observe(element: Element) {
          this.record.element = element;
        }
        disconnect() {}
      },
    );
    renderDialog({
      onSearchContacts: vi.fn().mockResolvedValue([
        {
          contactId: "contact-1",
          email: "alice@example.com",
          name: "Alice Smith",
          userPrincipalName: "alice@tenant.onmicrosoft.com",
        },
        { email: "bob@example.com", name: "Bob Jones" },
      ]),
    });

    fireEvent.focus(screen.getByRole("combobox", { name: "Optional attendees" }));
    const alice = await screen.findByRole("option", { name: /Alice Smith/ });
    expect(getPhoto).not.toHaveBeenCalled();
    for (const observer of observers) {
      observer.callback(
        [{ isIntersecting: true, target: observer.element } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }
    await waitFor(() => expect(alice.querySelector("img")).toHaveAttribute("src", photo));
    expect(getPhoto).toHaveBeenCalledWith({
      contactId: "contact-1",
      email: "alice@example.com",
      homeAccountId: "account-1",
      name: "Alice Smith",
      userPrincipalName: "alice@tenant.onmicrosoft.com",
    });
    expect(screen.getByRole("option", { name: /Bob Jones/ }).querySelector("img")).toBeNull();
    expect(
      within(screen.getByRole("option", { name: /Bob Jones/ })).getByText("BJ"),
    ).toBeInTheDocument();
    fireEvent.error(alice.querySelector("img")!);
    expect(within(alice).getByText("AS")).toBeInTheDocument();
  });

  it("loads participant photos in the sidebar without opening the contact picker", async () => {
    const photo = "data:image/jpeg;base64,cGhvdG8=";
    const getPhoto = vi.fn().mockResolvedValue(photo);
    vi.stubGlobal("calendarApi", { contacts: { getPhoto } });
    const { container, rerenderDialog } = renderDialog({
      state: {
        event: createAttendeeEvent({
          attendees: [
            { ...createParticipant(), email: "andra.pantea@example.com", name: null },
            { ...createParticipant(), email: null, name: "No Email" },
          ],
        }),
        mode: "edit",
      },
    });
    const avatar = container.querySelector(".attendees-sidebar__attendee-avatar")!;
    await waitFor(() => expect(avatar.querySelector("img")).toHaveAttribute("src", photo));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(getPhoto).toHaveBeenCalledOnce();
    expect(getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "andra.pantea@example.com",
        homeAccountId: "account-1",
        name: null,
      }),
    );
    fireEvent.error(avatar.querySelector("img")!);
    expect(avatar).toHaveTextContent("AN");
    expect(container.querySelectorAll(".attendees-sidebar__attendee-avatar")[1]).toHaveTextContent(
      "NE",
    );
    rerenderDialog({ calendars: [] });
    expect(avatar.querySelector("img")).toBeNull();
    expect(getPhoto).toHaveBeenCalledOnce();
  });

  it("lets Tab leave an empty contact field and supports selecting from the list with arrow keys", async () => {
    renderDialog({
      onSearchContacts: vi.fn().mockResolvedValue([
        { email: "bob@example.com", name: "Bob" },
        { email: "alice@example.com", name: "Alice" },
      ]),
    });
    const input = screen.getByRole("combobox", { name: "Required attendees" });
    fireEvent.click(input);
    await screen.findByRole("option", { name: /Alice/ });
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .every((option) => option.tabIndex === -1),
    ).toBe(true);
    expect(input.closest(".attendee-pills-wrapper")?.querySelector(".attendee-pill")).toBeNull();
    expect(screen.getByRole("option", { name: /Bob/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Alice/ })).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Alice/ }).id,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      within(input.closest(".attendee-pills-wrapper") as HTMLElement).getByText(
        "alice@example.com",
      ),
    ).toBeInTheDocument();
  });

  it("does not select a contact while Enter is confirming an IME composition", async () => {
    renderDialog({
      onSearchContacts: vi.fn().mockResolvedValue([{ email: "alice@example.com", name: "Alice" }]),
    });
    const input = screen.getByRole("combobox", { name: "Required attendees" });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "Alice" } });
    await screen.findByRole("option", { name: /Alice/ });
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
    expect(input).toHaveValue("Alice");
    expect(input.closest(".attendee-pills-wrapper")?.querySelector(".attendee-pill")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(input).toHaveValue("");
    expect(
      within(input.closest(".attendee-pills-wrapper") as HTMLElement).getByText(
        "alice@example.com",
      ),
    ).toBeInTheDocument();
  });

  it("ignores stale search results and does not reopen a dismissed contact popup", async () => {
    let resolveInitial!: (contacts: { email: string; name: string }[]) => void;
    let resolveSearch!: (contacts: { email: string; name: string }[]) => void;
    const onSearchContacts = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSearch = resolve;
          }),
      );
    renderDialog({ onSearchContacts });
    const input = screen.getByRole("combobox", { name: "Required attendees" });
    fireEvent.focus(input);
    await waitFor(() => expect(onSearchContacts).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "bob" } });
    await waitFor(() => expect(onSearchContacts).toHaveBeenCalledTimes(2));
    resolveInitial([{ email: "alice@example.com", name: "Alice" }]);
    expect(screen.queryByRole("option", { name: /Alice/ })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    resolveSearch([{ email: "bob@example.com", name: "Bob" }]);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("keeps participant contact search disabled without event or calendar write permissions", () => {
    const { onSearchContacts, rerenderDialog } = renderDialog({
      state: { event: createAttendeeEvent(), mode: "edit" },
    });
    for (const label of ["Required attendees", "Optional attendees"]) {
      const input = screen.getByRole("combobox", { name: label });
      expect(input).toBeDisabled();
      fireEvent.click(input);
    }
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSearchContacts).not.toHaveBeenCalled();
    rerenderDialog({
      calendars: [{ ...createCalendar(), canEdit: false }],
      state: { event: createEvent(), mode: "edit" },
    });
    expect(screen.getByRole("combobox", { name: "Required attendees" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Optional attendees" })).toBeDisabled();
  });

  it("inserts a selected contact from the attendee popup", async () => {
    const onSearchContacts = vi
      .fn()
      .mockResolvedValue([{ email: "john.doe@example.com", name: "Doe, John" }]);
    const { onSave } = renderDialog({
      onSearchContacts,
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: "2026-03-30T10:00:00.000Z",
        mode: "create",
        start: "2026-03-30T09:00:00.000Z",
      },
    });

    editSubject("Planning");

    const requiredInput = screen.getByRole("combobox", { name: "Required attendees" });
    fireEvent.focus(requiredInput);
    fireEvent.change(requiredInput, {
      target: { value: '"Doe, J' },
    });

    await screen.findByRole("option", { name: /Doe, John/i });
    fireEvent.click(screen.getByRole("option", { name: /Doe, John/i }));

    const requiredRow = requiredInput.closest(".attendee-pills-wrapper");
    expect(requiredInput).toHaveValue("");
    expect(requiredRow).toBeInstanceOf(HTMLElement);
    expect(
      within(requiredRow as HTMLElement).getByText("john.doe@example.com"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [
          {
            email: "john.doe@example.com",
            name: "Doe, John",
            response: null,
            status: null,
            type: "required",
          },
        ],
      }),
    );
  });

  it("prefers required attendees when the same email is entered in both rows", () => {
    const { onSave } = renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: "2026-03-30T10:00:00.000Z",
        mode: "create",
        start: "2026-03-30T09:00:00.000Z",
      },
    });

    editSubject("Planning");
    const requiredInput = screen.getByRole("combobox", { name: "Required attendees" });
    const optionalInput = screen.getByRole("combobox", { name: "Optional attendees" });

    fireEvent.change(requiredInput, {
      target: { value: "alice@example.com" },
    });
    fireEvent.keyDown(requiredInput, { key: "Enter" });

    fireEvent.change(optionalInput, {
      target: { value: "alice@example.com, bob@example.com" },
    });
    fireEvent.keyDown(optionalInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [
          {
            email: "alice@example.com",
            name: null,
            response: null,
            status: null,
            type: "required",
          },
          {
            email: "bob@example.com",
            name: null,
            response: null,
            status: null,
            type: "optional",
          },
        ],
      }),
    );
  });

  it("preserves resource attendees outside the required and optional pill rows", () => {
    const { onSave } = renderDialog({
      state: {
        event: createEvent({
          attendees: [
            {
              email: "room@example.com",
              name: "Room 1",
              response: null,
              status: null,
              type: "resource",
            },
            {
              email: "alice@example.com",
              name: "Alice",
              response: null,
              status: null,
              type: "required",
            },
            {
              email: "bob@example.com",
              name: "Bob",
              response: null,
              status: null,
              type: "optional",
            },
          ],
        }),
        mode: "edit",
      },
    });

    const requiredRow = screen
      .getByRole("combobox", { name: "Required attendees" })
      .closest(".attendee-pills-wrapper");
    const optionalRow = screen
      .getByRole("combobox", { name: "Optional attendees" })
      .closest(".attendee-pills-wrapper");

    expect(requiredRow).toBeInstanceOf(HTMLElement);
    expect(optionalRow).toBeInstanceOf(HTMLElement);
    expect(within(requiredRow as HTMLElement).getByText("alice@example.com")).toBeInTheDocument();
    expect(within(optionalRow as HTMLElement).getByText("bob@example.com")).toBeInTheDocument();

    editSubject("Planning Updated");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: expect.arrayContaining([
          expect.objectContaining({
            email: "room@example.com",
            type: "resource",
          }),
          expect.objectContaining({
            email: "alice@example.com",
            type: "required",
          }),
          expect.objectContaining({
            email: "bob@example.com",
            type: "optional",
          }),
        ]),
      }),
    );
  });

  it("shows attendee response actions in the sidebar", () => {
    renderDialog({
      state: {
        event: createAttendeeEvent(),
        mode: "edit",
      },
    });

    const organizerHeading = screen.getByText("Organizer");
    const responsesHeading = screen.getByText("Responses");

    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
    expect(screen.queryByText("Response actions")).toBeNull();
    expect(organizerHeading.compareDocumentPosition(responsesHeading)).toBeGreaterThan(0);
  });

  it("shows the forward action for existing events", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
  });

  it("forwards an event with recipients and a comment from the toolbar", () => {
    const onForward = vi.fn().mockResolvedValue(undefined);

    renderDialog({ onForward });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    const popup = screen.getByText("Forward to").closest(".event-toolbar__popup");
    expect(popup).toBeInstanceOf(HTMLElement);

    fireEvent.change(within(popup as HTMLElement).getByRole("combobox", { name: "Forward to" }), {
      target: { value: "Dana Swope <dana@example.com>" },
    });
    fireEvent.change(within(popup as HTMLElement).getByLabelText("Comment"), {
      target: { value: "Please cover this meeting" },
    });
    fireEvent.click(within(popup as HTMLElement).getByRole("button", { name: "Send forward" }));

    expect(onForward).toHaveBeenCalledWith({
      calendarId: "calendar-1",
      comment: "Please cover this meeting",
      eventId: "event-1",
      toRecipients: [{ email: "dana@example.com", name: "Dana Swope" }],
    });
  });

  it("shows notResponded attendees in the no response group", () => {
    renderDialog({
      state: {
        event: createAttendeeEvent({
          attendees: [
            {
              email: "andrea@example.com",
              name: "Andrea",
              response: "notResponded",
              status: {
                response: "notResponded",
                time: null,
              },
              type: "required",
            },
          ],
        }),
        mode: "edit",
      },
    });

    expect(screen.getByText("No response: 1")).toBeInTheDocument();
    expect(screen.getByText("Andrea")).toBeInTheDocument();
  });

  it("shows tentativelyAccepted attendees in the tentative group", () => {
    renderDialog({
      state: {
        event: createAttendeeEvent({
          attendees: [
            {
              email: "fabio@example.com",
              name: "Fabio",
              response: "tentativelyAccepted",
              status: {
                response: "tentativelyAccepted",
                time: null,
              },
              type: "required",
            },
          ],
        }),
        mode: "edit",
      },
    });

    expect(screen.getByText("Tentative: 1")).toBeInTheDocument();
    expect(screen.getByText("Fabio")).toBeInTheDocument();
  });

  it("checks overlaps before accepting from the sidebar", async () => {
    const attendeeEvent = createAttendeeEvent();
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([]);
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(onFindAcceptConflicts).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: attendeeEvent.calendarId,
          eventId: attendeeEvent.id,
          start: attendeeEvent.start,
          end: attendeeEvent.end,
        }),
      );
      expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "accept", "", true);
    });
  });

  it("accepts recurring events for the whole series from the sidebar", async () => {
    const attendeeEvent = createAttendeeEvent({
      seriesMasterId: "series-1",
    });
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([]);
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(onFindAcceptConflicts).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: attendeeEvent.id,
          lookupEnd: expect.any(String),
          seriesMasterId: "series-1",
        }),
      );
      expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "accept", "", true, "series-1");
    });
  });

  it("blocks accept until overlapping events are confirmed", async () => {
    const attendeeEvent = createAttendeeEvent();
    const conflict = createEvent({
      id: "conflict-1",
      start: "2026-03-30T09:30:00.000Z",
      subject: "Existing busy event",
    });
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([conflict]);
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await expect(screen.findByText("Existing busy event")).resolves.toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept anyway" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "accept", "", true);
  });

  it("shows an error and does not accept when overlap lookup fails", async () => {
    const attendeeEvent = createAttendeeEvent();
    const onFindAcceptConflicts = vi.fn().mockRejectedValue(new Error("lookup failed"));
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await expect(
      screen.findByText("Unable to check for overlapping events. Try again before accepting."),
    ).resolves.toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("sends refuse immediately from the sidebar", () => {
    const attendeeEvent = createAttendeeEvent();
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([]);
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "decline", "", true);
    expect(onFindAcceptConflicts).not.toHaveBeenCalled();
  });

  it("shows recurring refuse scope options from the sidebar", () => {
    const attendeeEvent = createAttendeeEvent({
      seriesMasterId: "series-1",
    });

    renderDialog({
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));

    expect(screen.getByRole("button", { name: "Deny only current" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete current and future" })).toBeInTheDocument();
  });

  it("declines only the current recurring event from the sidebar dropdown", () => {
    const attendeeEvent = createAttendeeEvent({
      seriesMasterId: "series-1",
    });
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny only current" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "decline", "", true);
  });

  it("deletes current and future recurring events from the sidebar dropdown", () => {
    const attendeeEvent = createAttendeeEvent({
      seriesMasterId: "series-1",
    });
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onDelete,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete current and future" }));

    expect(onDelete).toHaveBeenCalledWith(attendeeEvent, "series-1");
  });

  it("supports tentative responses with a comment from the other popup", () => {
    const attendeeEvent = createAttendeeEvent();
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([]);
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Need to confirm a conflict" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tentative" }));

    expect(onRespond).toHaveBeenCalledWith(
      attendeeEvent,
      "tentative",
      "Need to confirm a conflict",
      true,
    );
    expect(onFindAcceptConflicts).not.toHaveBeenCalled();
  });

  it("preserves silent accept after confirming overlaps", async () => {
    const attendeeEvent = createAttendeeEvent();
    const conflict = createEvent({
      id: "conflict-1",
      start: "2026-03-30T09:30:00.000Z",
      subject: "Existing busy event",
    });
    const onFindAcceptConflicts = vi.fn().mockResolvedValue([conflict]);
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onFindAcceptConflicts,
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "This comment should not be sent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept without sending" }));

    await expect(screen.findByText("Existing busy event")).resolves.toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept anyway" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "accept", "", false);
  });

  it("supports silent responses from the other popup and closes on outside click", () => {
    const attendeeEvent = createAttendeeEvent();
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.getByRole("button", { name: "Tentative without sending" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Tentative without sending" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "This comment should not be sent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refuse without sending" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "decline", "", false);
  });

  it("disables Save in edit mode until the form has unsaved changes", () => {
    renderDialog();

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeDisabled();

    editSubject("Planning Updated");
    expect(saveButton).toBeEnabled();

    editSubject("Planning");
    expect(saveButton).toBeDisabled();
  });

  it("keeps Save enabled in create/clone mode even without edits", () => {
    renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        draft: {
          calendarId: "calendar-1",
          end: "2026-03-30T10:00:00.000Z",
          isAllDay: false,
          start: "2026-03-30T09:00:00.000Z",
          subject: "Cloned planning",
        },
        end: "2026-03-30T10:00:00.000Z",
        mode: "create",
        start: "2026-03-30T09:00:00.000Z",
      },
    });

    expect(screen.getByRole("button", { name: "Create Event" })).toBeEnabled();
  });

  it("does not enable Save when only the response comment changes", () => {
    renderDialog();

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Heads up — running 5 min late." },
    });

    expect(saveButton).toBeDisabled();
  });

  it("hides response actions and join for a cancelled attendee event but keeps delete", () => {
    renderDialog({
      state: {
        event: createAttendeeEvent({
          cancelled: true,
          isOnlineMeeting: true,
          onlineMeeting: {
            conferenceId: null,
            joinUrl: "https://teams.microsoft.com/meet/123",
            phones: [],
            provider: "teamsForBusiness",
          },
        }),
        mode: "edit",
      },
    });

    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuse" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Other" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Join meeting" })).toBeNull();

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes a cancelled attendee event from the toolbar", () => {
    const cancelledEvent = createAttendeeEvent({ cancelled: true });
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onDelete,
      state: {
        event: cancelledEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(cancelledEvent);
  });
});
