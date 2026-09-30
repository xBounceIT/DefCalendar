// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import EventEditorDialog from "../src/renderer/src/components/event-editor-dialog";
import SchedulingAssistant from "../src/renderer/src/components/scheduling-assistant";
import useAttendeeAvailability from "../src/renderer/src/hooks/use-attendee-availability";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { EditorState } from "../src/renderer/src/event-editor-state";
import type { AttendeeAvailabilityArgs } from "../src/shared/attendee-availability";
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

describe("detailed scheduling assistant", () => {
  function setup(overrides: Parameters<typeof renderDialog>[0] = {}, open = true) {
    const load = vi.fn().mockImplementation(async (args: AttendeeAvailabilityArgs) =>
      args.emails.map((email) => ({
        email,
        status: "free",
        workingHours: {
          daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          startTime: "09:00:00",
          endTime: "18:00:00",
          timeZone: { name: Intl.DateTimeFormat().resolvedOptions().timeZone },
        },
        schedule: {
          start: args.start,
          end: args.end,
          slots:
            email === "coworker@example.com"
              ? [
                  {
                    start: toLocalIso("2026-09-29T09:00:00"),
                    end: toLocalIso("2026-09-29T10:00:00"),
                    status: "busy",
                  },
                ]
              : [],
        },
      })),
    );
    const view = renderDialog({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T09:17:00"),
        end: toLocalIso("2026-09-29T10:02:00"),
        draft: {
          subject: "Planning",
          attendees: [{ ...createParticipant(), email: "coworker@example.com", name: "Coworker" }],
        },
      }),
      timeFormat: "24h",
      onGetAttendeeAvailability: load,
      ...overrides,
    });
    const trigger = screen.getByRole("button", { name: "Scheduling assistant" });
    expect(trigger.closest(".scheduling-row")).not.toBeNull();
    if (open) {
      fireEvent.click(trigger);
    }
    return { ...view, load };
  }

  it("shows the preloaded scheduling window immediately without requesting the same people again", async () => {
    const { load, container } = setup({}, false);
    await screen.findByText("Busy");
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Scheduling assistant" }));
    expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull();
    expect(screen.queryByText("Loading calendars…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Scheduling assistant" }));
    expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("waits for an invited participant in every scheduling view and clears suggestions after the last invitee is removed", async () => {
    const { container } = setup({
      state: createMeetingState({ draft: { subject: "Planning", attendees: [] } }),
    });
    for (const view of ["Day", "Week", "Month"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(screen.getByRole("status")).toHaveTextContent("Add a participant to see suggestions");
      expect(
        container.querySelector(
          ".scheduling-assistant__overlays .scheduling-assistant__suggestion",
        ),
      ).toBeNull();
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).toBeNull();
      expect(screen.getByRole("button", { name: "Next suggestion" })).toBeDisabled();
    }
    const input = screen.getByRole("combobox", { name: "Add required participant" });
    fireEvent.change(input, { target: { value: "Coworker <coworker@example.com>" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove: Coworker" }));
    expect(screen.getByRole("status")).toHaveTextContent("Add a participant to see suggestions");
    expect(
      container.querySelector(".scheduling-assistant__overlays .scheduling-assistant__suggestion"),
    ).toBeNull();
    expect(container.querySelector(".scheduling-assistant__slot--suggested")).toBeNull();
  });

  it("shows a complete week, navigates periods and preserves the selected meeting", async () => {
    const { load, container, onSave } = setup();
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Open Monday, September 28" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Sunday, October 4" })).toBeInTheDocument();
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-28T00:00:00"),
          end: toLocalIso("2026-10-05T00:00:00"),
        }),
      ),
    );
    expect(screen.getByLabelText("Start date")).toHaveValue("09/29/2026");
    expect(screen.queryByRole("button", { name: "Adjust meeting end" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(screen.getByRole("button", { name: "Open Monday, October 5" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(screen.getByRole("button", { name: "Open Monday, September 28" })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("aligns monthly day boundaries with participant calendars through the extra DST hour", () => {
    vi.stubEnv("TZ", "Europe/Rome");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const { container } = setup({
      state: createMeetingState({
        start: toLocalIso("2026-10-25T09:00:00"),
        end: toLocalIso("2026-10-25T10:00:00"),
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    const headers = Array.from(
      container.querySelectorAll<HTMLElement>(".scheduling-assistant__days > button"),
    );
    const dividers = Array.from(
      container.querySelectorAll<HTMLElement>(".scheduling-assistant__day-divider"),
    );
    expect(headers).toHaveLength(31);
    expect(headers[24]!.style.width).toBe("75px");
    let left = 0;
    headers.forEach((header, index) => {
      expect(parseFloat(dividers[index]!.style.left)).toBe(left);
      left += parseFloat(header.style.width);
    });
  });

  it("loads a whole month once and opens a day's editable timeline using the cached availability", async () => {
    const { load, container, onSave } = setup();
    const toolbar = within(container.querySelector(".scheduling-assistant__toolbar")!);
    const controls = within(container.querySelector(".scheduling-assistant__controls")!);
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    fireEvent.click(toolbar.getByRole("button", { name: "Month" }));
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(30);
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-01T00:00:00"),
          end: toLocalIso("2026-10-01T00:00:00"),
        }),
      ),
    );
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    const calls = load.mock.calls.length;
    expect(container.querySelectorAll(".scheduling-assistant__overview-day")).toHaveLength(30);
    fireEvent.click(controls.getByRole("switch", { name: "Scheduling suggestions" }));
    expect(container.querySelector(".scheduling-assistant__suggestion")).toBeNull();
    fireEvent.click(controls.getByRole("switch", { name: "Scheduling suggestions" }));
    fireEvent.click(
      within(container.querySelector(".scheduling-assistant__days")!).getByRole("button", {
        name: "Open Tuesday, September 15",
      }),
    );
    expect(toolbar.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Loading calendars…")).not.toBeInTheDocument();
    expect(controls.getByLabelText("Start date")).toHaveValue("09/29/2026");
    fireEvent.click(
      within(container.querySelector(".scheduling-assistant__summary-track")!).getByLabelText(
        /09:00.*September 15.*Available/,
      ),
    );
    expect(
      within(container.querySelector(".scheduling-assistant__selection")!).getByRole("button", {
        name: "Adjust meeting end",
      }),
    ).toBeInTheDocument();
    fireEvent.click(toolbar.getByRole("button", { name: /^Save$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(load).toHaveBeenCalledTimes(calls);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-15T09:00:00"),
        end: toLocalIso("2026-09-15T10:00:00"),
      }),
    );
  });

  it("opens a page in the same dialog with two full days and applies a clicked suggested range to the draft", async () => {
    const { load, container, onSave } = setup();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    expect(load).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T00:00:00"),
        end: toLocalIso("2026-10-01T00:00:00"),
        includeSchedule: true,
      }),
    );
    expect(container.querySelectorAll(".scheduling-assistant__slot")).toHaveLength(96);
    fireEvent.click(screen.getByRole("button", { name: /12:00.*September 29.*Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T12:00:00"),
        end: toLocalIso("2026-09-29T13:00:00"),
      }),
    );
  });

  it("toggles all scheduling highlights and navigates suggestions without losing the selected duration", async () => {
    const { container } = setup();
    const next = screen.getByRole("button", { name: "Next suggestion" });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    expect(screen.getByRole("button", { name: "Move meeting" })).toHaveTextContent("10:00 – 11:00");
    fireEvent.click(screen.getByRole("switch", { name: "Scheduling suggestions" }));
    expect(container.querySelector(".scheduling-assistant__suggestion")).toBeNull();
    expect(container.querySelector(".scheduling-assistant__slot--suggested")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next suggestion" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Scheduling suggestions" }));
    expect(container.querySelector(".scheduling-assistant__suggestion")).not.toBeNull();
  });

  it("opens the two checked options with the keyboard and toggles working-hour suggestions and scheduling details", async () => {
    const { container } = setup();
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    const summary = container.querySelector(".scheduling-assistant__options > summary")!;
    fireEvent.keyDown(summary, { key: "ArrowDown" });
    const workingHours = screen.getByRole("menuitemcheckbox", {
      name: "Show only my working hours",
    });
    const details = screen.getByRole("menuitemcheckbox", {
      name: "Show detailed scheduling data",
    });
    expect(workingHours).toHaveAttribute("aria-checked", "true");
    expect(details).toHaveAttribute("aria-checked", "true");
    expect(workingHours).toHaveFocus();
    const midnight = screen.getByRole("button", { name: /00:00.*September 29.*Available/ });
    expect(midnight).not.toHaveClass("scheduling-assistant__slot--suggested");
    fireEvent.click(workingHours);
    expect(workingHours).toHaveAttribute("aria-checked", "false");
    expect(midnight).toHaveClass("scheduling-assistant__slot--suggested");
    fireEvent.keyDown(workingHours, { key: "ArrowDown" });
    expect(details).toHaveFocus();
    expect(container.querySelector(".scheduling-assistant__person small")).not.toBeNull();
    expect(container.querySelector(".scheduling-assistant__busy")).toHaveAttribute(
      "title",
      "09:00 – 10:00 · Busy",
    );
    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-checked", "false");
    expect(container.querySelector(".scheduling-assistant__person small")).toBeNull();
    expect(container.querySelector(".scheduling-assistant__busy")).toHaveAttribute("title", "Busy");
    fireEvent.click(details);
    expect(container.querySelector(".scheduling-assistant__person small")).not.toBeNull();
    fireEvent.keyDown(details, { key: "Escape" });
    expect(summary.parentElement).not.toHaveAttribute("open");
    expect(summary).toHaveFocus();
    expect(screen.getByRole("button", { name: "Move meeting" })).toHaveTextContent("09:17 – 10:02");
  });

  it("loads the visible days when navigating beyond the availability request limit", async () => {
    const { load, container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    for (let month = 0; month < 3; month++) {
      fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-12-01T00:00:00"),
          end: toLocalIso("2026-12-03T00:00:00"),
        }),
      ),
    );
    await waitFor(() =>
      expect(container.querySelector(".scheduling-assistant__slot--suggested")).not.toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Move meeting" })).not.toBeInTheDocument();
  });

  it("opens at the last supported date without crashing and prevents navigation into the next year", () => {
    const { container } = setup({
      state: createMeetingState({
        start: toLocalIso("9999-12-31T09:00:00"),
        end: toLocalIso("9999-12-31T10:00:00"),
      }),
    });
    const date = screen.getByLabelText("Start date");
    expect(container.querySelector(".scheduling-assistant")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(date).toHaveValue("12/31/9999");
  });

  it("adds required and optional participants and rooms, removes participants, and commits pending room input when returning", () => {
    const { onSave } = setup();
    for (const [label, value] of [
      ["Add required participant", "Required Person <required@example.com>"],
      ["Add optional participant", "Optional Person <optional@example.com>"],
    ]) {
      const input = screen.getByRole("combobox", { name: label });
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    fireEvent.click(screen.getByRole("button", { name: "Remove: Coworker" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Add a room" }), {
      target: { value: "Boardroom <room@example.com>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: expect.arrayContaining([
          expect.objectContaining({ email: "required@example.com", type: "required" }),
          expect.objectContaining({ email: "optional@example.com", type: "optional" }),
          expect.objectContaining({ email: "room@example.com", type: "resource" }),
        ]),
      }),
    );
    expect(vi.mocked(onSave).mock.calls[0]![0].attendees).toHaveLength(3);
  });

  it("moves, resizes and cancels horizontal dragging in half-hour steps", () => {
    const { onSave } = setup();
    const NativePointerEvent = class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    };
    vi.stubGlobal("PointerEvent", NativePointerEvent);
    const body = screen.getByRole("button", { name: "Move meeting" });
    fireEvent.pointerDown(body, { clientX: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(body, { clientX: 172, pointerId: 1 });
    fireEvent.pointerCancel(body, { pointerId: 1 });
    expect(body).toHaveTextContent("09:17 – 10:02");
    fireEvent.pointerDown(body, { clientX: 100, pointerId: 2, button: 0 });
    fireEvent.pointerMove(body, { clientX: 172, pointerId: 2 });
    fireEvent.pointerUp(body, { pointerId: 2 });
    expect(body).toHaveTextContent("10:30 – 11:30");
    fireEvent.keyDown(screen.getByRole("button", { name: "Adjust meeting end" }), {
      key: "ArrowRight",
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T10:30:00"),
        end: toLocalIso("2026-09-29T12:00:00"),
      }),
    );
  });

  it("keeps a dragged meeting visible beyond two days and follows its date after release", () => {
    const { container } = setup();
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId = 1;
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    const scroll = container.querySelector<HTMLDivElement>(".scheduling-assistant__scroll")!;
    fireEvent.pointerDown(meeting, { clientX: 100, button: 0 });
    scroll.scrollLeft += 48 * 36;
    fireEvent.pointerMove(meeting, { clientX: 100 });
    scroll.scrollLeft += 48 * 36;
    fireEvent.pointerMove(meeting, { clientX: 100 });
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(3);
    scroll.scrollLeft += 48 * 36;
    fireEvent.pointerMove(meeting, { clientX: 100 });
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(4);
    fireEvent.pointerUp(meeting);
    expect(screen.getByRole("button", { name: "Move meeting" })).toBeEnabled();
    expect(screen.getByLabelText("Start date")).toHaveValue("10/02/2026");
    expect(container.querySelector(".scheduling-assistant__days > button")).toHaveTextContent(
      "Friday, October 2",
    );
  });

  it.each([
    { edge: "start", origin: 292, target: 224, start: "06:00", end: "10:00" },
    { edge: "end", origin: 328, target: 486, start: "09:30", end: "14:30" },
  ])(
    "continues resizing the $edge beyond the visible columns while held at the viewport edge",
    ({ edge, origin, target, start, end }) => {
      expect.hasAssertions();
      const { container, onSave } = setup();
      vi.stubGlobal(
        "PointerEvent",
        class extends MouseEvent {
          pointerId = 1;
        },
      );
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 0;
      vi.stubGlobal("requestAnimationFrame", (draw: FrameRequestCallback) => {
        frames.set(++nextFrame, draw);
        return nextFrame;
      });
      vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
      const scroll = container.querySelector<HTMLDivElement>(".scheduling-assistant__scroll")!;
      vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({
        left: 0,
        right: 500,
        width: 500,
      } as DOMRect);
      scroll.scrollLeft = 612;
      const handle = screen.getByRole("button", { name: `Adjust meeting ${edge}` });
      fireEvent.pointerDown(handle, { button: 0, clientX: origin });
      fireEvent.pointerMove(handle, { clientX: target });
      for (let timestamp = 16; timestamp <= 480; timestamp += 16) {
        act(() => {
          const pending = [...frames.values()];
          frames.clear();
          for (const draw of pending) {
            draw(timestamp);
          }
        });
      }
      expect(screen.getByRole("button", { name: "Move meeting" })).toHaveTextContent(
        `${start} – ${end}`,
      );
      fireEvent.pointerUp(handle);
      expect(frames.size).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: toLocalIso(`2026-09-29T${start}:00`),
          end: toLocalIso(`2026-09-29T${end}:00`),
        }),
      );
    },
  );

  it("snaps keyboard movement from an off-grid time and removes only the selected unnamed participant", () => {
    setup({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T09:17:00"),
        end: toLocalIso("2026-09-29T10:02:00"),
        draft: {
          subject: "Planning",
          attendees: [
            { ...createParticipant(), email: null, name: "First" },
            { ...createParticipant(), email: null, name: "Second" },
          ],
        },
      }),
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Calendar for First" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("button", { name: "Move meeting" })).toHaveTextContent("10:00 – 11:00");
    fireEvent.click(screen.getByRole("button", { name: "Remove: First" }));
    expect(screen.queryByRole("button", { name: "Calendar for First" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendar for Second" })).toBeInTheDocument();
  });

  it("freezes changes if saving begins while a pointer drag is active", () => {
    const { rerenderDialog } = setup();
    const cancelFrame = vi.spyOn(globalThis, "cancelAnimationFrame");
    onTestFinished(() => cancelFrame.mockRestore());
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId = 1;
      },
    );
    const body = screen.getByRole("button", { name: "Move meeting" });
    fireEvent.pointerDown(body, { clientX: 100, button: 0 });
    rerenderDialog({ busy: true });
    expect(cancelFrame).toHaveBeenCalled();
    fireEvent.pointerMove(body, { clientX: 172 });
    expect(body).toHaveTextContent("09:30 – 10:30");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("preserves an end-time edit made while a horizontal drag is captured", () => {
    const { onSave } = setup();
    const cancelFrame = vi.spyOn(globalThis, "cancelAnimationFrame");
    onTestFinished(() => cancelFrame.mockRestore());
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientX: 100 });
    const endTime = screen.getByRole("textbox", { name: /End time/ });
    fireEvent.change(endTime, { target: { value: "12:00" } });
    fireEvent.blur(endTime);
    expect(cancelFrame).toHaveBeenCalled();
    fireEvent.pointerMove(meeting, { pointerId: 1, clientX: 172 });
    fireEvent.pointerCancel(meeting, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T09:30:00"),
        end: toLocalIso("2026-09-29T12:00:00"),
      }),
    );
  });

  it("supports all-day date changes and preserves the exclusive event end on save", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "All day" }));
    expect(screen.queryByRole("button", { name: "Adjust meeting end" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Start date" }), {
      target: { value: "09/30/2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        isAllDay: true,
        start: toLocalIso("2026-09-30T00:00:00"),
        end: toLocalIso("2026-10-01T00:00:00"),
      }),
    );
  });

  it("shows the complete multi-day event and disables a clipped start after navigating", () => {
    const { container } = setup({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T23:00:00"),
        end: toLocalIso("2026-10-03T01:00:00"),
        draft: { subject: "Long planning" },
      }),
    });
    expect(screen.getByRole("button", { name: "Adjust meeting start" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Adjust meeting end" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Adjust meeting start" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust meeting end" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move meeting" })).toBeDisabled();
  });

  it("keeps navigation before the meeting within two days without changing the selected event", async () => {
    const { container, load } = setup();
    const controls = within(container.querySelector(".scheduling-assistant__controls")!);
    fireEvent.click(controls.getByRole("button", { name: "Previous day" }));
    fireEvent.click(controls.getByRole("button", { name: "Previous day" }));
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(2);
    expect(controls.getByLabelText("Start date")).toHaveValue("09/29/2026");
    expect(container.querySelector(".scheduling-assistant__selection")).toBeNull();
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-27T00:00:00"),
          end: toLocalIso("2026-09-30T00:00:00"),
        }),
      ),
    );
  });

  it("extends the visible timeline and availability when the end date exceeds two days", async () => {
    expect.hasAssertions();
    const { onSave, load, container } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "End date", exact: true }), {
      target: { value: "10/03/2026" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "End date", exact: true }));
    expect(container.querySelectorAll(".scheduling-assistant__days > button")).toHaveLength(5);
    const endHandle = screen.getByRole("button", { name: "Adjust meeting end" });
    expect(endHandle).toBeEnabled();
    fireEvent.keyDown(endHandle, { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: /End time/ })).toHaveValue("10:30");
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        expect.objectContaining({ end: toLocalIso("2026-10-04T00:00:00") }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ end: toLocalIso("2026-10-03T10:30:00") }),
    );
  });

  it("keeps dragging when a previous emitted range commits after a newer pointer update", () => {
    expect.hasAssertions();
    const i18n = createInstance();
    void i18n.use(initReactI18next).init({
      resources: { en: { translation: enTranslations } },
      lng: "en",
      interpolation: { escapeValue: false },
    });
    const onChange = vi.fn();
    const range = { startInput: "2026-09-29T09:30", endInput: "2026-09-29T10:30" };
    const element = (value: typeof range) => (
      <I18nextProvider i18n={i18n}>
        <SchedulingAssistant
          date="2026-09-29"
          view="day"
          onViewChange={() => {}}
          {...value}
          allDay={false}
          participants={[]}
          availability={[]}
          loading={false}
          disabled={false}
          timeFormat="24h"
          controls={null}
          renderParticipantInput={() => null}
          onDateChange={() => {}}
          onChange={onChange}
          onRemove={() => {}}
          onBack={() => {}}
        />
      </I18nextProvider>
    );
    const view = render(element(range));
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId = 1;
      },
    );
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    fireEvent.pointerDown(meeting, { button: 0, clientX: 100 });
    fireEvent.pointerMove(meeting, { clientX: 172 });
    const previous = onChange.mock.lastCall![0];
    fireEvent.pointerMove(meeting, { clientX: 208 });
    const latest = onChange.mock.lastCall![0];
    view.rerender(element(previous));
    view.rerender(element(latest));
    fireEvent.pointerMove(meeting, { clientX: 244 });
    fireEvent.pointerUp(meeting);
    expect(onChange).toHaveBeenLastCalledWith({
      startInput: "2026-09-29T11:30",
      endInput: "2026-09-29T12:30",
    });
  });

  it("keeps the timeline width stable while shortening a scrolled multi-day event", () => {
    expect.hasAssertions();
    const { container } = setup({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T09:00:00"),
        end: toLocalIso("2026-10-03T23:30:00"),
        draft: { subject: "Long planning" },
      }),
    });
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId = 1;
      },
    );
    const scroll = container.querySelector<HTMLDivElement>(".scheduling-assistant__scroll")!;
    const matrix = container.querySelector<HTMLDivElement>(".scheduling-assistant__matrix")!;
    let scrollLeft = 8532;
    Object.defineProperty(scroll, "scrollLeft", {
      configurable: true,
      get: () => Math.min(scrollLeft, Number.parseFloat(matrix.style.width) - 1064),
      set: (value: number) => {
        scrollLeft = value;
      },
    });
    const originalWidth = matrix.style.width;
    const handle = screen.getByRole("button", { name: "Adjust meeting end" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 292 });
    fireEvent.pointerMove(handle, { clientX: 256 });
    fireEvent.pointerMove(handle, { clientX: 220 });
    expect(matrix.style.width).toBe(originalWidth);
    fireEvent.pointerMove(handle, { clientX: 184 });
    expect(screen.getByRole("textbox", { name: /End time/ })).toHaveValue("22:00");
    fireEvent.pointerUp(handle);
    expect(Number.parseFloat(matrix.style.width)).toBeLessThan(Number.parseFloat(originalWidth));
  });

  it("does not move or resize a meeting beyond the supported final calendar year", () => {
    expect.hasAssertions();
    setup({
      state: createMeetingState({
        start: toLocalIso("9999-12-31T23:00:00"),
        end: toLocalIso("9999-12-31T23:30:00"),
        draft: { subject: "Final day" },
      }),
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Adjust meeting end" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("textbox", { name: /End time/ })).toHaveValue("23:30");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move meeting" }), { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: /Start time/ })).toHaveValue("23:00");
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId = 1;
      },
    );
    const handle = screen.getByRole("button", { name: "Adjust meeting end" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(handle, { clientX: 172 });
    fireEvent.pointerUp(handle);
    expect(screen.getByRole("textbox", { name: /End time/ })).toHaveValue("23:30");
  });

  it("keeps keyboard activation of all-day calendars on the local date west of UTC", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "All day" }));
    fireEvent.click(screen.getByRole("button", { name: /12:00.*September 30/ }));
    const calendar = screen.getByRole("button", { name: "Calendar for Coworker" });
    fireEvent.keyDown(calendar, { key: "ArrowLeft" });
    expect(screen.getByLabelText("Start date")).toHaveValue("09/29/2026");
    fireEvent.keyDown(calendar, { key: "ArrowRight" });
    fireEvent.click(calendar);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        isAllDay: true,
        start: toLocalIso("2026-09-30T00:00:00"),
        end: toLocalIso("2026-10-01T00:00:00"),
      }),
    );
  });

  it("clears a captured move when the visible days change", () => {
    const { onSave, container } = setup({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T23:00:00"),
        end: toLocalIso("2026-09-30T01:00:00"),
        draft: { subject: "Overnight planning" },
      }),
    });
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId = 1;
      },
    );
    const body = screen.getByRole("button", { name: "Move meeting" });
    fireEvent.pointerDown(body, { clientX: 100, button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(container.querySelector(".scheduling-assistant__scroll")!.scrollLeft).toBe(576);
    fireEvent.pointerMove(body, { clientX: 172 });
    expect(screen.getByLabelText("Start date")).toHaveValue("09/29/2026");
    fireEvent.pointerCancel(body);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T23:00:00"),
        end: toLocalIso("2026-09-30T01:00:00"),
      }),
    );
  });
});

describe("availability request reuse", () => {
  const first: AttendeeAvailabilityArgs = {
    calendarId: "calendar-1",
    emails: ["coworker@example.com"],
    start: "2026-09-29T00:00:00Z",
    end: "2026-10-01T00:00:00Z",
    includeSchedule: true,
  };
  const next: AttendeeAvailabilityArgs = {
    ...first,
    start: "2026-09-30T00:00:00Z",
    end: "2026-10-02T00:00:00Z",
  };
  const free = [{ email: "coworker@example.com", status: "free" as const }];
  const busy = [{ email: "coworker@example.com", status: "busy" as const }];

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setupHook(load = vi.fn().mockResolvedValue(free), refreshMs = 0, strict = false) {
    const view = renderHook(
      ({ args, loader }) => useAttendeeAvailability(args, loader, refreshMs),
      {
        initialProps: { args: first as AttendeeAvailabilityArgs | null, loader: load },
        reactStrictMode: strict,
      },
    );
    return {
      ...view,
      load,
      change: (args: AttendeeAvailabilityArgs | null, loader = load) =>
        view.rerender({ args, loader }),
    };
  }

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("starts the initial request immediately and reuses recent days without a loading state", async () => {
    const { result, load, change } = setupHook();
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ items: free, loading: false });
    change(next);
    expect(result.current.loading).toBe(true);
    await advance(300);
    expect(load).toHaveBeenCalledTimes(2);
    change(first);
    expect(result.current).toEqual({ items: free, loading: false });
    await advance(300);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("starts immediately once after Strict Mode replays the mount effects", async () => {
    const load = vi.fn().mockResolvedValue(free);
    const { result } = setupHook(load, 0, true);
    await advance(0);
    expect(result.current).toEqual({ items: free, loading: false });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reuses a complete month's schedule for narrower ranges, recalculates their status and expires it normally", async () => {
    const month = { ...first, start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" };
    const load = vi.fn().mockImplementation(async (args: AttendeeAvailabilityArgs) => [
      {
        email: "coworker@example.com",
        status: "busy" as const,
        schedule: {
          start: args.start,
          end: args.end,
          slots: [
            { start: "2026-09-29T09:00:00Z", end: "2026-09-29T10:00:00Z", status: "busy" as const },
          ],
        },
      },
    ]);
    const { result, change } = setupHook(load);
    await advance(0);
    change(month);
    await advance(300);
    const day = { ...first, start: "2026-09-15T00:00:00Z", end: "2026-09-17T00:00:00Z" };
    change(day);
    expect(result.current.loading).toBe(false);
    expect(result.current.items[0]!.status).toBe("free");
    await advance(300);
    expect(load).toHaveBeenCalledTimes(2);
    change({ ...day, end: "2026-10-02T00:00:00Z" });
    expect(result.current.loading).toBe(true);
    await advance(300);
    expect(load).toHaveBeenCalledTimes(3);
    await advance(31_000);
    change(day);
    expect(result.current.loading).toBe(true);
    await advance(300);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("does not reuse a wider range when a participant's detailed schedule is missing", async () => {
    const load = vi.fn().mockResolvedValue(free);
    const { result, change } = setupHook(load);
    await advance(0);
    change({ ...first, start: "2026-09-29T09:00:00Z", end: "2026-09-29T10:00:00Z" });
    expect(result.current.loading).toBe(true);
    await advance(300);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch a queued request after the dialog is unmounted", async () => {
    const { load, unmount } = setupHook();
    act(() => {
      vi.advanceTimersByTime(0);
      unmount();
    });
    await advance(0);
    expect(load).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refetches an expired cached day instead of reporting old availability", async () => {
    const { result, load, change } = setupHook();
    await advance(0);
    change(next);
    await advance(31_000);
    load.mockResolvedValue(busy);
    change(first);
    expect(result.current).toEqual({ items: [], loading: true });
    await advance(300);
    expect(result.current).toEqual({ items: busy, loading: false });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("isolates reused results from a different calendar, loader and closed dialog", async () => {
    const { result, load, change } = setupHook();
    await advance(0);
    change({ ...first, calendarId: "calendar-2" });
    expect(result.current).toEqual({ items: [], loading: true });
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    const otherLoad = vi.fn().mockResolvedValue(busy);
    change(first, otherLoad);
    expect(result.current).toEqual({ items: [], loading: true });
    await advance(0);
    expect(result.current.items).toEqual(busy);
    change(null, otherLoad);
    expect(result.current).toEqual({ items: [], loading: false });
    change(first, otherLoad);
    await advance(0);
    expect(otherLoad).toHaveBeenCalledTimes(2);
  });

  it("keeps the current availability visible during periodic refresh and replaces it with new conflicts", async () => {
    const load = vi.fn().mockResolvedValueOnce(free).mockResolvedValue(busy);
    const { result } = setupHook(load, 60_000);
    await advance(0);
    await advance(60_000);
    expect(result.current).toEqual({ items: free, loading: false });
    await advance(300);
    expect(result.current).toEqual({ items: busy, loading: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("runs the scheduled refresh even if a slow previous response is still in the reuse window", async () => {
    const load = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(free), 31_000)),
      )
      .mockResolvedValue(busy);
    const { result } = setupHook(load, 60_000);
    await advance(31_000);
    expect(result.current.items).toEqual(free);
    await advance(29_000);
    await advance(300);
    expect(result.current.items).toEqual(busy);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not reuse transport failures when returning to a day", async () => {
    const failed = [{ email: "coworker@example.com", status: "unknown", error: "requestFailed" }];
    const load = vi.fn().mockResolvedValueOnce(failed).mockResolvedValue(free);
    const { result, change } = setupHook(load);
    await advance(0);
    expect(result.current.items).toEqual(failed);
    change(next);
    await advance(300);
    change(first);
    expect(result.current.loading).toBe(true);
    await advance(300);
    expect(result.current.items).toEqual(free);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("ignores a late response to an abandoned day and debounces navigation to uncached days", async () => {
    let resolveOld: (items: typeof busy) => void = () => undefined;
    const load = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValue(free);
    const { result, change } = setupHook(load);
    await advance(0);
    change(next);
    await advance(100);
    change({ ...next, start: "2026-10-01T00:00:00Z", end: "2026-10-03T00:00:00Z" });
    await advance(300);
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => resolveOld(busy));
    expect(result.current.items).toEqual(free);
    change(first);
    expect(result.current.loading).toBe(true);
    await advance(300);
    expect(load).toHaveBeenCalledTimes(3);
    expect(result.current.items).toEqual(free);
  });
});

describe("calendar dropdown", () => {
  it("saves the calendar chosen by typing on the closed dropdown", () => {
    expect.hasAssertions();
    const { onSave } = renderDialog({
      calendars: [createCalendar(), { ...createCalendar(), id: "calendar-2", name: "Birthdays" }],
      state: createMeetingState({ draft: { subject: "Planning" } }),
    });
    const trigger = screen.getByRole("button", { name: "Calendar" });
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
    const trigger = screen.getByRole("button", { name: "Calendar" });
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
    const trigger = screen.getByRole("button", { name: "Calendar" });
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
    const trigger = screen.getByRole("button", { name: "Calendar" });
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
      expect.objectContaining({ emails: ["coworker@example.com", "user@example.com"] }),
    );
    expect(
      within(screen.getByText("unfinished-address").closest(".attendee-pill")!).getByText(
        "Unknown",
      ),
    ).toBeInTheDocument();
  });

  it("times out a stalled check, checks a changed day and ignores its late response", async () => {
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
        start: "2026-09-30T11:00:00.000Z",
        end: "2026-09-30T12:00:00.000Z",
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
    "keeps an all-day event at local midnight and preloads the next day across the clock change on %s",
    async (day, nextDay) => {
      expect.hasAssertions();
      vi.stubEnv("TZ", "Europe/Rome");
      onTestFinished(() => {
        vi.unstubAllEnvs();
      });
      const load = vi.fn().mockResolvedValue([{ email: "coworker@example.com", status: "free" }]);
      const start = toLocalIso(`${day}T00:00:00`);
      const end = toLocalIso(`${nextDay}T00:00:00`);
      const view = renderDialog({
        onGetAttendeeAvailability: load,
        state: createMeetingState({ allDay: true, start, end }),
      });
      expect(await screen.findByText("Available")).toBeInTheDocument();
      const previewEnd = new Date(end);
      previewEnd.setDate(previewEnd.getDate() + 1);
      expect(load).toHaveBeenCalledWith(
        expect.objectContaining({ start, end: previewEnd.toISOString() }),
      );
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
      emails: ["coworker@example.com", "optional@example.com", "user@example.com"],
      start: toLocalIso("2026-09-29T00:00:00"),
      end: toLocalIso("2026-10-01T00:00:00"),
      includeSchedule: true,
    });
    editSubject("Planning");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() => expect(view.onSave).toHaveBeenCalled());
  });

  it("updates automatically when the day changes and discards a late response", async () => {
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
        start: "2026-09-30T11:00:00.000Z",
        end: "2026-09-30T12:00:00.000Z",
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
      emails: ["coworker@example.com", "user@example.com"],
      start: toLocalIso("2026-09-29T00:00:00"),
      end: toLocalIso("2026-10-01T00:00:00"),
      includeSchedule: true,
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
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ calendarId: "calendar-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });
});

describe("daily meeting planner", () => {
  function renderPlanningDialog(props: Parameters<typeof renderDialog>[0]) {
    const view = renderDialog(props);
    fireEvent.click(screen.getByRole("tab", { name: "Scheduling" }));
    return view;
  }

  it("switches between the original participants layout and planning without losing the selected time", async () => {
    expect.hasAssertions();
    const load = loadSchedules();
    const { container, onSave } = renderDialog({
      state: planningState(),
      onGetAttendeeAvailability: load,
    });
    const attendees = screen.getByRole("tab", { name: "Attendees" });
    const scheduling = screen.getByRole("tab", { name: "Scheduling" });
    expect(attendees).toHaveAttribute("aria-selected", "true");
    const originalPanel = screen.getByRole("tabpanel", { name: "Attendees" });
    expect(within(originalPanel).getByText("Test User")).toBeInTheDocument();
    expect(within(originalPanel).getByText("Coworker")).toBeInTheDocument();
    expect(within(originalPanel).getByText("No response: 1")).toBeInTheDocument();
    expect(container.querySelector(".meeting-planner")).toBeNull();
    fireEvent.keyDown(attendees, { key: "ArrowRight" });
    expect(scheduling).toHaveFocus();
    expect(scheduling).toHaveAttribute("aria-selected", "true");
    await screen.findByText("1 participant is unavailable");
    fireEvent.click(container.querySelectorAll(".meeting-planner__slot")[31]);
    fireEvent.keyDown(scheduling, { key: "Home" });
    expect(attendees).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Attendees" })).toBeInTheDocument();
    fireEvent.keyDown(attendees, { key: "End" });
    expect(scheduling).toHaveFocus();
    expect(screen.getByText("Everyone is available")).toBeInTheDocument();
    fireEvent.click(attendees);
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-29T15:30:00"),
          end: toLocalIso("2026-09-29T16:30:00"),
        }),
      ),
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  function loadSchedules() {
    return vi.fn().mockImplementation(async (args: AttendeeAvailabilityArgs) =>
      args.emails.map((email) => ({
        email,
        status: email === "coworker@example.com" ? "busy" : "free",
        schedule: {
          start: args.start,
          end: args.end,
          slots:
            email === "coworker@example.com"
              ? [
                  {
                    start: toLocalIso("2026-09-29T09:15:00"),
                    end: toLocalIso("2026-09-29T10:15:00"),
                    status: "busy",
                  },
                ]
              : [],
        },
      })),
    );
  }

  function planningState() {
    return createMeetingState({
      start: toLocalIso("2026-09-29T09:17:00"),
      end: toLocalIso("2026-09-29T10:02:00"),
      draft: {
        subject: "Planning",
        attendees: [{ ...createParticipant(), email: "coworker@example.com", name: "Coworker" }],
      },
    });
  }

  it("keeps a newly selected day when a previous captured drag is cancelled", () => {
    const { onSave } = renderPlanningDialog({ state: planningState() });
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    meeting.setPointerCapture = vi.fn();
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    fireEvent.pointerCancel(meeting, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-30T09:30:00"),
        end: toLocalIso("2026-09-30T10:30:00"),
      }),
    );
  });

  it("preserves an end-time edit made while a vertical drag is captured", () => {
    const { container, onSave } = renderPlanningDialog({ state: planningState() });
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    meeting.setPointerCapture = vi.fn();
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.click(container.querySelector(".scheduling-summary")!);
    const endTime = screen.getByRole("textbox", { name: /End time/ });
    fireEvent.change(endTime, { target: { value: "12:00" } });
    fireEvent.blur(endTime);
    fireEvent.pointerMove(meeting, { pointerId: 1, clientY: 164 });
    fireEvent.pointerCancel(meeting, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T09:30:00"),
        end: toLocalIso("2026-09-29T12:00:00"),
      }),
    );
  });

  it("reuses the day's busy grid while moving the event through a dense calendar", async () => {
    const load = vi.fn().mockImplementation(async (args: AttendeeAvailabilityArgs) =>
      args.emails.map((email) => ({
        email,
        status: "busy",
        schedule: {
          start: args.start,
          end: args.end,
          slots: Array.from({ length: 30 }, (_, index) => ({
            start: new Date(Date.parse(args.start) + index * 1_800_000).toISOString(),
            end: new Date(Date.parse(args.start) + index * 1_800_000 + 300_000).toISOString(),
            status: "busy",
          })),
        },
      })),
    );
    const { container } = renderPlanningDialog({
      state: planningState(),
      onGetAttendeeAvailability: load,
    });
    await screen.findByText("2 participants are unavailable");
    const busySlots = container.querySelectorAll(".meeting-planner__slot--busy").length;
    const parse = vi.spyOn(Date, "parse");
    onTestFinished(() => {
      parse.mockRestore();
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Move meeting" }), { key: "ArrowDown" });
    expect(container.querySelectorAll(".meeting-planner__slot--busy")).toHaveLength(busySlots);
    expect(parse.mock.calls.length).toBeLessThan(500);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shows the whole day and saves a clicked slot with a rounded duration without reloading calendars", async () => {
    const load = loadSchedules();
    const { container, onSave } = renderPlanningDialog({
      state: planningState(),
      onGetAttendeeAvailability: load,
      timeFormat: "24h",
    });
    expect(await screen.findByText("1 participant is unavailable")).toBeInTheDocument();
    const slots = container.querySelectorAll(".meeting-planner__slot");
    expect(slots).toHaveLength(48);
    expect(container.querySelectorAll(".meeting-planner__slot--busy")).toHaveLength(3);
    fireEvent.click(slots[31]);
    expect(screen.getByText("Everyone is available")).toBeInTheDocument();
    expect(screen.getByText("coworker@example.com").closest(".attendee-pill")).toHaveClass(
      "attendee-pill--free",
    );
    fireEvent.click(screen.getByRole("button", { name: "Extend by 30 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-29T15:30:00"),
          end: toLocalIso("2026-09-29T17:00:00"),
        }),
      ),
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("expands the avatar pill and focuses an individual calendar, then changes the planning day", async () => {
    const load = loadSchedules();
    const { container, onSave } = renderPlanningDialog({
      state: planningState(),
      onGetAttendeeAvailability: load,
    });
    await screen.findByText("1 participant is unavailable");
    const pill = screen.getByRole("button", { name: "Participant availability" });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /Coworker.*coworker@example.com.*Busy/ }));
    expect(
      container.querySelector(".meeting-planner__slot")?.getAttribute("aria-label"),
    ).not.toContain("Test User");
    fireEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(container.querySelector(".meeting-planner__slot")?.getAttribute("aria-label")).toContain(
      "Test User",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await screen.findByText("Everyone is available");
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-30T09:30:00"),
          end: toLocalIso("2026-09-30T10:30:00"),
        }),
      ),
    );
    expect(load).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-30T00:00:00"),
        end: toLocalIso("2026-10-02T00:00:00"),
      }),
    );
  });

  it("resizes with pointer capture and restores a cancelled drag before allowing keyboard resizing", async () => {
    const { container, onSave } = renderPlanningDialog({
      state: planningState(),
      onGetAttendeeAvailability: loadSchedules(),
    });
    await screen.findByText("1 participant is unavailable");
    const handle = screen.getByRole("button", { name: "Adjust meeting end" });
    handle.setPointerCapture = vi.fn();
    const scroll = container.querySelector(".meeting-planner__scroll")!;
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 164 });
    expect(screen.getByText("90 min")).toBeInTheDocument();
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(screen.getByText("45 min")).toBeInTheDocument();
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-29T09:30:00"),
          end: toLocalIso("2026-09-29T10:30:00"),
        }),
      ),
    );
  });

  it("moves the meeting body in half-hour steps while preserving its duration and pointer ownership", () => {
    expect.hasAssertions();
    const { container, onSave } = renderPlanningDialog({
      timeFormat: "24h",
      state: createMeetingState({
        start: toLocalIso("2026-09-29T11:00:00"),
        end: toLocalIso("2026-09-29T13:00:00"),
        draft: { subject: "Move meeting" },
      }),
    });
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    meeting.setPointerCapture = vi.fn();
    vi.spyOn(
      container.querySelector(".meeting-planner__scroll")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(meeting, { pointerId: 2, clientY: 164 });
    fireEvent.pointerUp(meeting, { pointerId: 2 });
    expect(meeting).toHaveTextContent("11:00 – 13:00");
    fireEvent.pointerMove(meeting, { pointerId: 1, clientY: 164 });
    fireEvent.pointerUp(meeting, { pointerId: 1 });
    expect(meeting.setPointerCapture).toHaveBeenCalledWith(1);
    expect(screen.getByText("120 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T12:00:00"),
        end: toLocalIso("2026-09-29T14:00:00"),
      }),
    );
  });

  it("restores a cancelled body drag and rounds an off-grid duration up when moving with the keyboard", () => {
    expect.hasAssertions();
    const { container, onSave } = renderPlanningDialog({ state: planningState() });
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    meeting.setPointerCapture = vi.fn();
    vi.spyOn(
      container.querySelector(".meeting-planner__scroll")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(meeting, { pointerId: 1, clientY: 132 });
    expect(screen.getByText("60 min")).toBeInTheDocument();
    fireEvent.pointerCancel(meeting, { pointerId: 1 });
    expect(screen.getByText("45 min")).toBeInTheDocument();
    fireEvent.keyDown(meeting, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-29T10:00:00"),
        end: toLocalIso("2026-09-29T11:00:00"),
      }),
    );
  });

  it("keeps a body drag inside the selected day without truncating an overnight meeting", () => {
    expect.hasAssertions();
    const { container, onSave } = renderPlanningDialog({
      timeFormat: "24h",
      state: createMeetingState({
        start: toLocalIso("2026-09-29T23:00:00"),
        end: toLocalIso("2026-09-30T01:00:00"),
        draft: { subject: "Night meeting" },
      }),
    });
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    meeting.setPointerCapture = vi.fn();
    vi.spyOn(
      container.querySelector(".meeting-planner__scroll")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(meeting, { pointerId: 1, clientY: 164 });
    fireEvent.pointerUp(meeting, { pointerId: 1 });
    expect(meeting).toHaveTextContent("23:30 – 01:30");
    fireEvent.keyDown(meeting, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-30T00:00:00"),
        end: toLocalIso("2026-09-30T02:00:00"),
      }),
    );
  });

  it("freezes a captured body move while saving", () => {
    expect.hasAssertions();
    const view = renderPlanningDialog({ state: planningState() });
    const meeting = screen.getByRole("button", { name: "Move meeting" });
    meeting.setPointerCapture = vi.fn();
    fireEvent.pointerDown(meeting, { button: 0, pointerId: 1, clientY: 100 });
    view.rerenderDialog({ busy: true });
    fireEvent.pointerMove(meeting, { pointerId: 1, clientY: 164 });
    fireEvent.pointerCancel(meeting, { pointerId: 1 });
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(meeting).toBeDisabled();
  });

  it("keeps participants without an email visible and never marks their availability as confirmed", async () => {
    const state = createMeetingState({
      draft: {
        attendees: [
          { ...createParticipant(), name: "Meeting room", email: null, type: "resource" },
        ],
      },
    });
    const load = loadSchedules();
    renderPlanningDialog({ state, onGetAttendeeAvailability: load });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Availability not confirmed")).toBeInTheDocument();
    expect(screen.queryByText("Everyone is available")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Participant availability" }));
    expect(screen.getByText("Meeting room")).toBeInTheDocument();
  });

  it("matches normalized participant addresses in the planner instead of reporting false unknown availability", async () => {
    renderPlanningDialog({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T15:00:00"),
        end: toLocalIso("2026-09-29T15:30:00"),
        draft: { attendees: [{ ...createParticipant(), email: " COWORKER@example.com " }] },
      }),
      onGetAttendeeAvailability: loadSchedules(),
    });
    expect(await screen.findByText("Everyone is available")).toBeInTheDocument();
  });

  it("keeps navigation within supported calendar years", () => {
    const { container } = renderPlanningDialog({
      state: createMeetingState({
        start: toLocalIso("9999-12-31T09:00:00"),
        end: toLocalIso("9999-12-31T10:00:00"),
      }),
    });
    const summary = container.querySelector(".scheduling-summary")!.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(container.querySelector(".scheduling-summary")).toHaveTextContent(summary!);
  });

  it("checks every day of a multi-day all-day meeting in the selection summary", async () => {
    const load = vi.fn().mockImplementation(async (args: AttendeeAvailabilityArgs) =>
      args.emails.map((email) => ({
        email,
        status: email === "coworker@example.com" ? "busy" : "free",
        schedule: {
          start: args.start,
          end: args.end,
          slots:
            email === "coworker@example.com"
              ? [
                  {
                    start: toLocalIso("2026-09-30T12:00:00"),
                    end: toLocalIso("2026-09-30T13:00:00"),
                    status: "busy",
                  },
                ]
              : [],
        },
      })),
    );
    renderPlanningDialog({
      state: createMeetingState({
        allDay: true,
        start: toLocalIso("2026-09-29T00:00:00"),
        end: toLocalIso("2026-10-01T00:00:00"),
      }),
      onGetAttendeeAvailability: load,
    });
    expect(await screen.findByText("1 participant is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Everyone is available")).not.toBeInTheDocument();
  });

  it("keeps an overnight end outside the day preview and extends it without shortening the meeting", async () => {
    const { onSave } = renderPlanningDialog({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T23:30:00"),
        end: toLocalIso("2026-09-30T00:30:00"),
        draft: { subject: "Night meeting" },
      }),
      onGetAttendeeAvailability: loadSchedules(),
    });
    await screen.findByText("Everyone is available");
    expect(screen.queryByRole("button", { name: "Adjust meeting end" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Extend by 30 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: toLocalIso("2026-09-29T23:30:00"),
          end: toLocalIso("2026-09-30T01:00:00"),
        }),
      ),
    );
  });

  it("freezes a captured resize gesture when saving starts", async () => {
    const view = renderPlanningDialog({
      state: planningState(),
      onGetAttendeeAvailability: loadSchedules(),
    });
    await screen.findByText("1 participant is unavailable");
    const handle = screen.getByRole("button", { name: "Adjust meeting end" });
    handle.setPointerCapture = vi.fn();
    vi.spyOn(
      view.container.querySelector(".meeting-planner__scroll")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 100 });
    view.rerenderDialog({ busy: true });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 164 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(handle).toBeDisabled();
  });

  it("keeps resizing owned by its captured pointer and stops after capture is lost", async () => {
    const { container } = renderPlanningDialog({
      state: planningState(),
      onGetAttendeeAvailability: loadSchedules(),
    });
    await screen.findByText("1 participant is unavailable");
    const handle = screen.getByRole("button", { name: "Adjust meeting end" });
    handle.setPointerCapture = vi.fn();
    vi.spyOn(
      container.querySelector(".meeting-planner__scroll")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 164 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(screen.getByText("30 min")).toBeInTheDocument();
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 164 });
    expect(screen.getByText("90 min")).toBeInTheDocument();
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 196 });
    expect(screen.getByText("90 min")).toBeInTheDocument();
  });

  it("keeps pointer movement aligned when snapping a late start into the next day", () => {
    const { container, onSave } = renderPlanningDialog({
      state: createMeetingState({
        start: toLocalIso("2026-09-29T23:47:00"),
        end: toLocalIso("2026-09-30T00:47:00"),
        draft: { subject: "Late meeting" },
      }),
    });
    const handle = screen.getByRole("button", { name: "Adjust meeting start" });
    handle.setPointerCapture = vi.fn();
    vi.spyOn(
      container.querySelector(".meeting-planner__scroll")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 132 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        start: toLocalIso("2026-09-30T00:30:00"),
        end: toLocalIso("2026-09-30T01:00:00"),
      }),
    );
  });

  it("refreshes calendars while open and applies new conflicts without changing the selected time", async () => {
    vi.useFakeTimers();
    try {
      const load = loadSchedules();
      const { container } = renderPlanningDialog({
        state: planningState(),
        onGetAttendeeAvailability: load,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      fireEvent.click(container.querySelectorAll(".meeting-planner__slot")[31]);
      expect(screen.getByText("Everyone is available")).toBeInTheDocument();
      load.mockImplementation(async (args: AttendeeAvailabilityArgs) =>
        args.emails.map((email) => ({
          email,
          status: "busy",
          schedule: {
            start: args.start,
            end: args.end,
            slots: [
              {
                start: toLocalIso("2026-09-29T15:30:00"),
                end: toLocalIso("2026-09-29T16:30:00"),
                status: "busy",
              },
            ],
          },
        })),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByText("2 participants are unavailable")).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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

function applyEditorStyles(viewportWidth?: number): void {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/renderer/src/styles.css", "utf8");
  document.head.append(style);
  if (viewportWidth !== undefined && style.sheet) {
    style.textContent = [...style.sheet.cssRules]
      .map((rule) => {
        if (!(rule instanceof CSSMediaRule)) {
          return rule.cssText;
        }
        const maxWidth = /max-width:\s*(\d+)px/u.exec(rule.conditionText);
        return maxWidth && viewportWidth <= Number(maxWidth[1])
          ? Array.from(rule.cssRules, (nested) => nested.cssText).join("\n")
          : "";
      })
      .join("\n");
  }
  onTestFinished(() => style.remove());
}

afterEach(() => {
  cleanup();
});

describe("event editor dialog", () => {
  it("stacks compact sidebar tab icons above their labels and keeps keyboard switching", () => {
    expect.hasAssertions();
    applyEditorStyles(621);
    renderDialog({ state: createMeetingState() });
    const attendees = screen.getByRole("tab", { name: "Attendees" });
    const scheduling = screen.getByRole("tab", { name: "Scheduling" });

    expect(getComputedStyle(scheduling).flexDirection).toBe("column");
    fireEvent.keyDown(attendees, { key: "ArrowRight" });
    expect(scheduling).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Scheduling" })).toBeInTheDocument();
  });

  it("allows the planner participant popup to extend above its panel", () => {
    expect.hasAssertions();
    applyEditorStyles();
    const { container } = renderDialog({ state: createMeetingState() });
    fireEvent.click(screen.getByRole("tab", { name: "Scheduling" }));
    fireEvent.click(screen.getByRole("button", { name: "Participant availability" }));

    expect(container.querySelector(".meeting-planner__popup")).toBeInTheDocument();
    expect(
      getComputedStyle(screen.getByRole("tabpanel", { name: "Scheduling" })).overflow,
    ).not.toBe("hidden");
  });

  it("keeps a toolbar menu within the island when opened and resized", () => {
    expect.hasAssertions();
    let compact = false;
    const bounds = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function menuBounds(this: HTMLElement) {
        if (this.classList.contains("event-toolbar")) {
          return new DOMRect(40, 20, compact ? 300 : 540, 54);
        }
        if (this.classList.contains("event-toolbar__dropdown")) {
          return new DOMRect(compact ? 140 : 440, 80, compact ? 280 : 360, 100);
        }
        return new DOMRect();
      });
    onTestFinished(() => bounds.mockRestore());
    const { container } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    const menu = container.querySelector<HTMLElement>(".event-toolbar__dropdown")!;

    expect(menu.style.left).toBe("-228px");
    expect(menu.style.maxWidth).toBe("524px");
    compact = true;
    fireEvent.resize(globalThis);
    expect(menu.style.left).toBe("-88px");
    expect(menu.style.maxWidth).toBe("284px");
  });

  it("disconnects menu resize observation when the toolbar popup closes", () => {
    expect.hasAssertions();
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { container } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));

    expect(observe).toHaveBeenCalledWith(container.querySelector(".event-toolbar"));
    expect(observe).toHaveBeenCalledWith(container.querySelector(".event-toolbar__dropdown"));
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(disconnect).toHaveBeenCalledOnce();
  });

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

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open agenda.txt" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open agenda.txt" }));
    await waitFor(() => {
      expect(onOpenAttachment).toHaveBeenCalledWith({
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      });
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Download agenda.txt" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Download agenda.txt" }));
    await waitFor(() => {
      expect(onDownloadAttachment).toHaveBeenCalledWith({
        attachmentId: "attachment-1",
        calendarId: "calendar-1",
        eventId: "event-1",
      });
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove agenda.txt" })).toBeEnabled(),
    );
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
