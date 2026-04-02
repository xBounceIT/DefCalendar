// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import EventEditorDialog from "../src/renderer/src/components/event-editor-dialog";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { EditorState } from "../src/renderer/src/event-editor-state";
import type { CalendarEvent, CalendarSummary, EventParticipant } from "../src/shared/schemas";

afterEach(() => {
  cleanup();
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

function renderDialog(props?: Partial<React.ComponentProps<typeof EventEditorDialog>>) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const onSave = props?.onSave ?? vi.fn().mockResolvedValue(undefined);
  const onSearchContacts = props?.onSearchContacts ?? vi.fn().mockResolvedValue([]);
  const state: EditorState = props?.state ?? {
    event: createEvent(),
    mode: "edit",
  };

  const view = render(
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
        onAddAttachment={vi.fn().mockResolvedValue([])}
        onCancelMeeting={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onDismiss={vi.fn()}
        onDuplicate={vi.fn()}
        onListAttachments={vi.fn().mockResolvedValue([])}
        onOpenInOutlook={vi.fn().mockResolvedValue(undefined)}
        onRemoveAttachment={vi.fn().mockResolvedValue([])}
        onRespond={vi.fn().mockResolvedValue(undefined)}
        onSearchContacts={onSearchContacts}
        onSave={onSave}
        state={state}
        timeFormat="system"
        {...props}
      />
    </I18nextProvider>,
  );

  return { ...view, onSave, onSearchContacts };
}

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

afterEach(() => {
  cleanup();
});

describe("event editor dialog", () => {
  it("shows and preserves a zero-minute reminder", async () => {
    const { onSave } = renderDialog();

    expect(await screen.findByRole("button", { name: "0 min" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "5 minutes" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderMinutesBeforeStart: 0,
      }),
    );
  });

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

    const startTimeBtn = screen.getByRole("button", { name: "Start time" });
    fireEvent.click(startTimeBtn);
    const option2330 = screen.getByText("23:30");
    fireEvent.click(option2330);

    fireEvent.change(screen.getByPlaceholderText("Subject"), {
      target: { value: "Late event" },
    });
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

    const startTimeBtn = screen.getByRole("button", { name: "Start time" });
    fireEvent.click(startTimeBtn);
    const option2330 = screen.getByText("23:30");
    fireEvent.click(option2330);

    fireEvent.change(screen.getByPlaceholderText("Subject"), {
      target: { value: "Late event" },
    });
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

    fireEvent.change(screen.getByPlaceholderText("Subject"), {
      target: { value: "Late event" },
    });
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

  it("saves attendees from the attendees row in create mode", () => {
    const { onSave } = renderDialog({
      state: {
        allDay: false,
        calendarId: "calendar-1",
        end: "2026-03-30T10:00:00.000Z",
        mode: "create",
        start: "2026-03-30T09:00:00.000Z",
      },
    });

    expect(screen.queryByRole("button", { name: "Add attendee" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Subject"), {
      target: { value: "Planning" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Attendees" }), {
      target: { value: "alice@example.com, bob@example.com" },
    });
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

    fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]!);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["Legacy category"],
      }),
    );
  });

  it("prefills attendees row from existing attendees", () => {
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

    expect(screen.getByRole("textbox", { name: "Attendees" })).toHaveValue(
      "Alice <alice@example.com>, Bob <bob@example.com>",
    );
  });

  it("inserts a selected contact as Name <email> from the attendees popup", async () => {
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

    fireEvent.change(screen.getByPlaceholderText("Subject"), {
      target: { value: "Planning" },
    });

    const attendeesInput = screen.getByRole("textbox", { name: "Attendees" });
    fireEvent.focus(attendeesInput);
    fireEvent.change(attendeesInput, {
      target: { value: '"Doe, J' },
    });

    await screen.findByRole("option", { name: /Doe, John/i });
    fireEvent.click(screen.getByRole("option", { name: /Doe, John/i }));

    expect(attendeesInput).toHaveValue('"Doe, John" <john.doe@example.com>, ');

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

  it("sends accept immediately from the sidebar", () => {
    const attendeeEvent = createAttendeeEvent();
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "accept", "", true);
  });

  it("sends refuse immediately from the sidebar", () => {
    const attendeeEvent = createAttendeeEvent();
    const onRespond = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      onRespond,
      state: {
        event: attendeeEvent,
        mode: "edit",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));

    expect(onRespond).toHaveBeenCalledWith(attendeeEvent, "decline", "", true);
  });

  it("supports tentative responses with a comment from the other popup", () => {
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
});
