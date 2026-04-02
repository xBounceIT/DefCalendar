// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import DayEventsTable from "../src/renderer/src/components/day-events-table";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import type { CalendarEvent } from "../src/shared/schemas";

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
    end: "2026-03-31T11:00:00.000Z",
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
    organizer: null,
    recurrence: null,
    reminderMinutesBeforeStart: 0,
    responseRequested: true,
    responseStatus: null,
    sensitivity: "normal",
    showAs: "busy",
    start: "2026-03-30T14:00:00.000Z",
    subject: "Planning",
    seriesMasterId: null,
    occurrenceId: null,
    timeZone: "UTC",
    type: null,
    unsupportedReason: null,
    webLink: null,
    ...overrides,
  };
}

function renderTable(args?: {
  events?: CalendarEvent[];
  language?: "en" | "it";
  selectedDay?: string;
}) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: enTranslations },
      it: { translation: itTranslations },
    },
    lng: args?.language ?? "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const onClear = vi.fn();
  const onEventClick = vi.fn();
  const onJoinMeeting = vi.fn();

  render(
    <I18nextProvider i18n={i18n}>
      <DayEventsTable
        events={args?.events ?? []}
        onClear={onClear}
        onEventClick={onEventClick}
        onJoinMeeting={onJoinMeeting}
        selectedDay={args?.selectedDay ?? "2026-03-30T00:00:00.000Z"}
        timeFormat="system"
      />
    </I18nextProvider>,
  );

  return { onClear, onEventClick, onJoinMeeting };
}

describe("day events table", () => {
  it("uses translated untitled fallback text", () => {
    renderTable({
      events: [createEvent({ id: "untitled", subject: "" })],
      language: "it",
    });

    expect(screen.getByText("Evento senza titolo")).toBeInTheDocument();
  });

  it("shows timed multi-day event on intermediate day", () => {
    renderTable({
      events: [
        createEvent({
          end: "2026-04-02T14:00:00.000Z",
          start: "2026-03-30T14:00:00.000Z",
          subject: "Multi-day timed event",
        }),
      ],
      selectedDay: "2026-04-01T12:00:00.000Z",
    });

    expect(screen.getByText("Multi-day timed event")).toBeInTheDocument();
  });

  it("opens event on row click without clearing table", () => {
    const event = createEvent({ subject: "Clickable" });
    const { onClear, onEventClick } = renderTable({ events: [event] });

    fireEvent.click(screen.getByText("Clickable"));

    expect(onEventClick).toHaveBeenCalledWith(event);
    expect(onClear).not.toHaveBeenCalled();
  });

  it("shows join button and calls onJoinMeeting when clicked", () => {
    const event = createEvent({
      subject: "Online Meeting Event",
      onlineMeeting: {
        joinUrl: "https://teams.example.com/meeting",
        conferenceId: null,
        phones: [],
        provider: "Teams",
      },
    });
    const { onJoinMeeting } = renderTable({ events: [event] });

    const joinButton = screen.getByRole("button", { name: "Join meeting" });
    expect(joinButton).toBeInTheDocument();

    fireEvent.click(joinButton);

    expect(onJoinMeeting).toHaveBeenCalledWith(event);
  });
});
