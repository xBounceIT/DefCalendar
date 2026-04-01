// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsDialog from "../src/renderer/src/components/settings-dialog";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { CalendarApi } from "../src/shared/ipc";
import { createDefaultSettings } from "../src/shared/schema-values";

const originalCalendarApiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "calendarApi");

function createCalendarApiMock(releaseNotes: null | string): CalendarApi {
  const status = {
    checkedAt: "2026-04-01T10:00:00.000Z",
    currentVersion: "v0.2.0",
    downloadPercent: null,
    error: null,
    latestVersion: "v0.3.0",
    releaseNotes,
    state: "available" as const,
  };

  return {
    app: {
      getVersion: vi.fn().mockResolvedValue("v0.2.0"),
    },
    updates: {
      check: vi.fn().mockResolvedValue(status),
      download: vi.fn().mockResolvedValue(status),
      getStatus: vi.fn().mockResolvedValue(status),
      install: vi.fn().mockResolvedValue(undefined),
      onStatus: vi.fn().mockReturnValue(() => undefined),
    },
  } as unknown as CalendarApi;
}

function installCalendarApi(calendarApi: CalendarApi): void {
  Object.defineProperty(globalThis, "calendarApi", {
    configurable: true,
    value: calendarApi,
    writable: true,
  });
}

function restoreCalendarApi(): void {
  cleanup();
  vi.clearAllMocks();

  if (originalCalendarApiDescriptor) {
    Object.defineProperty(globalThis, "calendarApi", originalCalendarApiDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "calendarApi");
}

function renderDialog(releaseNotes: null | string) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  installCalendarApi(createCalendarApiMock(releaseNotes));

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SettingsDialog
          calendars={[]}
          isOpen
          onClose={vi.fn()}
          onSave={vi.fn()}
          settings={createDefaultSettings()}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(() => {
  restoreCalendarApi();
});

describe("settings dialog", () => {
  it("renders HTML release notes instead of showing escaped markup", async () => {
    const releaseNotes = [
      "<h2>Highlights</h2>",
      '<p><strong>Security update</strong> with <a href="https://example.com/changelog">Read more</a>.</p>',
      "<ul><li>Fix tray refresh issues</li><li>Improve sync recovery</li></ul>",
      "<script>window.__releaseNotesInjected = true</script>",
      '<a href="javascript:alert(1)">Unsafe link</a>',
    ].join("");
    const { container } = renderDialog(releaseNotes);

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(await screen.findByText("Release notes"));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Highlights" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Security update")).toBeInTheDocument();
    expect(screen.getByText("Fix tray refresh issues")).toBeInTheDocument();
    expect(screen.getByText("Improve sync recovery")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read more" })).toHaveAttribute(
      "href",
      "https://example.com/changelog",
    );
    expect(screen.queryByText(/<h2>Highlights<\/h2>/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Unsafe link" })).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(
      (globalThis as typeof globalThis & { __releaseNotesInjected?: boolean })
        .__releaseNotesInjected,
    ).toBeUndefined();
  });
});
