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

function createEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
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

function renderDialog(props?: Partial<React.ComponentProps<typeof EventEditorDialog>>) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const onSave = props?.onSave ?? vi.fn().mockResolvedValue(undefined);
  const state: EditorState = props?.state ?? {
    event: createEvent(),
    mode: "edit",
  };

  render(
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
        onSave={onSave}
        state={state}
        timeFormat="system"
        {...props}
      />
    </I18nextProvider>,
  );

  return { onSave };
}

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
});
