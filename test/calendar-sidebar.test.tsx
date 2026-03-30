// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import CalendarSidebar from "../src/renderer/src/components/calendar-sidebar";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";

afterEach(() => {
  cleanup();
});

function renderSidebar({
  eventDayKeys = new Set<string>(),
  onMiniCalendarMonthChange = vi.fn(),
}: {
  eventDayKeys?: ReadonlySet<string>;
  onMiniCalendarMonthChange?: (month: Date) => void;
} = {}) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  render(
    <I18nextProvider i18n={i18n}>
      <CalendarSidebar
        accounts={[
          {
            color: "#5b7cfa",
            homeAccountId: "account-1",
            name: "Daniel",
            tenantId: "tenant-1",
            username: "daniel@example.com",
          },
          {
            color: "#34a853",
            homeAccountId: "account-2",
            name: "Ops",
            tenantId: "tenant-2",
            username: "ops@example.com",
          },
        ]}
        calendars={[
          {
            canEdit: true,
            canShare: false,
            color: "#5b7cfa",
            homeAccountId: "account-1",
            id: "calendar-1",
            isDefaultCalendar: true,
            isVisible: true,
            name: "Shared Team Calendar",
            ownerAddress: "shared-owner@example.com",
            ownerName: "Shared Owner",
          },
          {
            canEdit: true,
            canShare: false,
            color: "#34a853",
            homeAccountId: "account-2",
            id: "calendar-2",
            isDefaultCalendar: false,
            isVisible: true,
            name: "Operations",
            ownerAddress: "ops@example.com",
            ownerName: "Ops",
          },
        ]}
        canCreateEvent
        eventDayKeys={eventDayKeys}
        isRefreshing={false}
        onAccountAdd={vi.fn()}
        onCalendarToggle={vi.fn()}
        onCreateEvent={vi.fn()}
        onDateSelect={vi.fn()}
        onMiniCalendarMonthChange={onMiniCalendarMonthChange}
        onRefresh={vi.fn()}
        onSettingsClick={vi.fn()}
        onSignOut={vi.fn()}
        selectedDate="2026-03-30T09:00:00.000Z"
        syncStatus={{
          counts: null,
          lastSyncedAt: null,
          message: "Sign in to sync Exchange 365.",
          messageKey: "sync.signInToSync",
          state: "idle",
        }}
        timeFormat="system"
      />
    </I18nextProvider>,
  );
}

describe("calendar sidebar", () => {
  it("groups calendars by signed-in account without rendering a switch action", () => {
    renderSidebar();

    const firstAccount = screen.getByRole("button", { name: /daniel@example.com/i });
    const secondAccount = screen.getByRole("button", { name: /ops@example.com/i });

    fireEvent.click(firstAccount);
    fireEvent.click(secondAccount);

    const firstCard = firstAccount.closest(".account-card") as HTMLElement | null;
    const secondCard = secondAccount.closest(".account-card") as HTMLElement | null;

    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();

    expect(within(firstCard!).getByText("Shared Team Calendar")).not.toBeNull();
    expect(within(firstCard!).queryByText("Operations")).toBeNull();
    expect(within(secondCard!).getByText("Operations")).not.toBeNull();
    expect(within(secondCard!).queryByText("Shared Team Calendar")).toBeNull();
    expect(screen.queryByRole("button", { name: /switch/i })).toBeNull();
  });

  it("adds event markers to mini-calendar days with events", () => {
    renderSidebar({ eventDayKeys: new Set(["2026-03-30"]) });

    const dayWithEvents = screen.getByRole("button", { name: "30" });
    const dayWithoutEvents = screen.getByRole("button", { name: "29" });

    expect(dayWithEvents.className).toContain("has-events");
    expect(dayWithoutEvents.className).not.toContain("has-events");
  });

  it("reports mini-calendar month changes on mount and navigation", () => {
    const onMiniCalendarMonthChange = vi.fn();
    renderSidebar({ onMiniCalendarMonthChange });

    const initialMonth = onMiniCalendarMonthChange.mock.calls.at(-1)?.[0] as Date | undefined;
    expect(initialMonth?.getFullYear()).toBe(2026);
    expect(initialMonth?.getMonth()).toBe(2);
    expect(initialMonth?.getDate()).toBe(1);

    fireEvent.click(screen.getByLabelText(enTranslations.miniCalendar.nextMonth));

    const nextMonth = onMiniCalendarMonthChange.mock.calls.at(-1)?.[0] as Date | undefined;
    expect(nextMonth?.getFullYear()).toBe(2026);
    expect(nextMonth?.getMonth()).toBe(3);
    expect(nextMonth?.getDate()).toBe(1);
  });
});
