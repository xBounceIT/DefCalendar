// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { CalendarSummary } from "@shared/schemas";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import CalendarSelectionScreen from "../src/renderer/src/components/calendar-selection-screen";

afterEach(cleanup);

function createCalendar(overrides?: Partial<CalendarSummary>): CalendarSummary {
  return {
    canEdit: true,
    canShare: false,
    color: "#5b7cfa",
    homeAccountId: "account-1",
    id: "calendar-1",
    isDefaultCalendar: false,
    isVisible: true,
    name: "Personal",
    ownerAddress: "user@example.com",
    ownerName: "Test User",
    userColor: null,
    ...overrides,
  };
}

function renderScreen(
  props: React.ComponentProps<typeof CalendarSelectionScreen>,
): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={createTestI18n()}>
      <CalendarSelectionScreen {...props} />
    </I18nextProvider>,
  );
}

describe(CalendarSelectionScreen, () => {
  it("renders title, account, and one row per calendar", () => {
    renderScreen({
      accountEmail: "owner@account.test",
      calendars: [
        createCalendar({ id: "c1", name: "Work" }),
        createCalendar({ id: "c2", name: "Family", isVisible: false }),
      ],
      errorMessage: null,
      isPending: false,
      onContinue: vi.fn(),
    });

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/owner@account\.test/)).toBeInTheDocument();
    expect(screen.getByLabelText("Work")).toBeInTheDocument();
    expect(screen.getByLabelText("Family")).toBeInTheDocument();
  });

  it("pre-selects calendars marked as visible", () => {
    renderScreen({
      accountEmail: null,
      calendars: [
        createCalendar({ id: "c1", name: "Visible", isVisible: true }),
        createCalendar({ id: "c2", name: "Hidden", isVisible: false }),
      ],
      errorMessage: null,
      isPending: false,
      onContinue: vi.fn(),
    });

    const visibleInput = screen.getByLabelText("Visible").querySelector("input")!;
    const hiddenInput = screen.getByLabelText("Hidden").querySelector("input")!;
    expect((visibleInput as HTMLInputElement).checked).toBe(true);
    expect((hiddenInput as HTMLInputElement).checked).toBe(false);
  });

  it("toggles selection when checkbox is clicked", () => {
    renderScreen({
      accountEmail: null,
      calendars: [createCalendar({ id: "c1", name: "Personal", isVisible: true })],
      errorMessage: null,
      isPending: false,
      onContinue: vi.fn(),
    });

    const input = screen.getByLabelText("Personal").querySelector("input")! as HTMLInputElement;
    expect(input.checked).toBe(true);
    fireEvent.click(input);
    expect(input.checked).toBe(false);
    fireEvent.click(input);
    expect(input.checked).toBe(true);
  });

  it("invokes onContinue with the selected calendar IDs", () => {
    const onContinue = vi.fn();
    renderScreen({
      accountEmail: null,
      calendars: [
        createCalendar({ id: "c1", name: "A", isVisible: true }),
        createCalendar({ id: "c2", name: "B", isVisible: true }),
      ],
      errorMessage: null,
      isPending: false,
      onContinue,
    });

    const continueButton = screen.getByRole("button");
    fireEvent.click(continueButton);

    expect(onContinue).toHaveBeenCalledOnce();
    const ids = onContinue.mock.calls[0]?.[0] as string[];
    expect(ids.toSorted()).toStrictEqual(["c1", "c2"]);
  });

  it("disables Continue when nothing is selected", () => {
    renderScreen({
      accountEmail: null,
      calendars: [createCalendar({ id: "c1", name: "A", isVisible: false })],
      errorMessage: null,
      isPending: false,
      onContinue: vi.fn(),
    });

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("disables Continue while isPending=true", () => {
    renderScreen({
      accountEmail: null,
      calendars: [createCalendar({ id: "c1", name: "A", isVisible: true })],
      errorMessage: null,
      isPending: true,
      onContinue: vi.fn(),
    });

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders an error banner when errorMessage is provided", () => {
    renderScreen({
      accountEmail: null,
      calendars: [createCalendar({ id: "c1", name: "A", isVisible: true })],
      errorMessage: "Something exploded",
      isPending: false,
      onContinue: vi.fn(),
    });

    expect(screen.getByText("Something exploded")).toBeInTheDocument();
  });

  it("renders an empty-state warning when no calendars are provided", () => {
    renderScreen({
      accountEmail: null,
      calendars: [],
      errorMessage: null,
      isPending: false,
      onContinue: vi.fn(),
    });

    // The empty banner appears
    const banner = document.querySelector(".banner--warning");
    expect(banner).not.toBeNull();
  });
});
