// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import WorkspacePanel from "../src/renderer/src/components/workspace-panel";

vi.mock<typeof import("@fullcalendar/react")>(import("@fullcalendar/react"), () => ({
  default: function FullCalendarMock() {
    return React.createElement("div", { "data-testid": "fullcalendar" });
  },
}));

vi.mock<typeof import("@fullcalendar/daygrid")>(import("@fullcalendar/daygrid"), () => ({
  default: {},
}));
vi.mock<typeof import("@fullcalendar/timegrid")>(import("@fullcalendar/timegrid"), () => ({
  default: {},
}));
vi.mock<typeof import("@fullcalendar/interaction")>(import("@fullcalendar/interaction"), () => ({
  default: {},
}));
vi.mock(import("../src/renderer/src/interaction-plugin"), () => ({ default: {} }));

afterEach(cleanup);

function renderPanel(overrides: Partial<React.ComponentProps<typeof WorkspacePanel>> = {}) {
  const props: React.ComponentProps<typeof WorkspacePanel> = {
    activeView: "dayGridMonth",
    bannerMessage: null,
    calendarEvents: [],
    calendarRef: { current: null },
    canCreateEvent: true,
    events: [],
    hasVisibleCalendars: true,
    onClearDaySelection: vi.fn(),
    onCreateEvent: vi.fn(),
    onDateClick: vi.fn(),
    onDatesSet: vi.fn(),
    onEventClick: vi.fn(),
    onEventCopy: vi.fn(),
    onEventDrop: vi.fn(),
    onEventResize: vi.fn(),
    onJoinMeeting: vi.fn(),
    onNext: vi.fn(),
    onOpenSearch: vi.fn(),
    onPrev: vi.fn(),
    onToday: vi.fn(),
    onViewSelect: vi.fn(),
    selectedDate: "2026-04-15T00:00:00.000Z",
    selectedDayForTable: null,
    timeFormat: "24h",
    ...overrides,
  };

  return {
    ...render(
      <I18nextProvider i18n={createTestI18n()}>
        <WorkspacePanel {...props} />
      </I18nextProvider>,
    ),
    props,
  };
}

describe("workspacePanel header", () => {
  it("renders the formatted month label for dayGridMonth view", () => {
    renderPanel();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/April 2026/);
  });

  it("renders today + prev + next navigation buttons", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("invokes onPrev / onNext / onToday callbacks", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(props.onPrev).toHaveBeenCalledOnce();
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onToday).toHaveBeenCalledOnce();
  });

  it("invokes onViewSelect when a view button is clicked", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /week/i }));
    expect(props.onViewSelect).toHaveBeenCalledWith("timeGridWeek");
  });
});

describe("workspacePanel new event + search", () => {
  it("invokes onCreateEvent when 'New' is clicked", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    expect(props.onCreateEvent).toHaveBeenCalledOnce();
  });

  it("disables 'New' when canCreateEvent=false", () => {
    renderPanel({ canCreateEvent: false });
    const newButton = screen.getByRole("button", { name: /new/i }) as HTMLButtonElement;
    expect(newButton.disabled).toBe(true);
  });

  it("invokes onOpenSearch when search icon is clicked", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(props.onOpenSearch).toHaveBeenCalledOnce();
  });

  it("disables search when no calendars are visible", () => {
    renderPanel({ hasVisibleCalendars: false });
    const search = screen.getByRole("button", { name: /search/i }) as HTMLButtonElement;
    expect(search.disabled).toBe(true);
  });
});

describe("workspacePanel banner", () => {
  it("renders the error banner when bannerMessage is set", () => {
    renderPanel({ bannerMessage: "Sync failed" });
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
  });

  it("renders nothing in place of the banner when message is null", () => {
    renderPanel();
    expect(document.querySelector(".banner--error")).toBeNull();
  });
});
