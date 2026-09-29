// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsDialog from "../src/renderer/src/components/settings-dialog";
import SettingsSelect from "../src/renderer/src/components/settings-select";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import type { CalendarApi } from "../src/shared/ipc";
import { createDefaultSettings } from "../src/shared/schema-values";
import type { UserSettings, UserSettingsPatch } from "../src/shared/schemas";

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

function renderDialog(
  releaseNotes: null | string,
  options?: {
    onSave?: (patch: UserSettingsPatch) => void;
    settings?: UserSettings;
  },
) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  installCalendarApi(createCalendarApiMock(releaseNotes));
  const onSave = options?.onSave ?? vi.fn();

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
          onSave={onSave}
          settings={options?.settings ?? createDefaultSettings()}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(() => {
  restoreCalendarApi();
});

describe("custom select lifecycle", () => {
  const options = [
    { value: "primary", label: "Primary Calendar" },
    { value: "birthdays", label: "Birthdays" },
  ];

  it.each(["disabled", "empty"])("does not reopen after becoming %s", (reason) => {
    expect.hasAssertions();
    const onChange = vi.fn();
    const element = (disabled: boolean, choices = options) => (
      <SettingsSelect
        aria-label="Calendar"
        disabled={disabled}
        onChange={onChange}
        options={choices}
        value="primary"
      />
    );
    const view = render(element(false));
    const trigger = screen.getByRole("button", { name: "Calendar" });
    fireEvent.click(trigger);
    view.rerender(element(reason === "disabled", reason === "empty" ? [] : options));
    expect(trigger).toBeDisabled();
    view.rerender(element(false));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps keyboard focus when the focused option disappears", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    const view = render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={options}
        value="primary"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Calendar" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("option", { name: "Primary Calendar" }), {
      key: "ArrowDown",
    });
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
    view.rerender(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={[options[0]]}
        value="primary"
      />,
    );
    const remaining = screen.getByRole("option", { name: "Primary Calendar" });
    expect(remaining).toHaveFocus();
    fireEvent.keyDown(remaining, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not display a different value when the selected option is unavailable", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={[options[0]]}
        value="birthdays"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Calendar" });
    expect(trigger).toHaveTextContent(/^$/);
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: "Primary Calendar" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves focus on the trigger during updates while the menu is open", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    const view = render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={options}
        value="primary"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Calendar" });
    fireEvent.click(trigger);
    trigger.focus();
    view.rerender(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={[...options]}
        value="primary"
      />,
    );
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces the selected value alongside the field label", () => {
    expect.hasAssertions();
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={vi.fn()}
        options={options}
        value="birthdays"
      />,
    );
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAccessibleDescription(
      "Birthdays",
    );
  });

  it("navigates upward from the trigger to the last option of an open menu", () => {
    expect.hasAssertions();
    render(
      <SettingsSelect aria-label="Calendar" onChange={vi.fn()} options={options} value="primary" />,
    );
    const trigger = screen.getByRole("button", { name: "Calendar" });
    fireEvent.click(trigger);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
  });

  it("preserves numeric values when choosing an option", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    render(
      <SettingsSelect
        aria-label="Interval"
        onChange={onChange}
        options={[
          { value: 5, label: "5 minutes" },
          { value: 15, label: "15 minutes" },
        ]}
        value={5}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Interval" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "15 minutes" }));
    expect(onChange).toHaveBeenCalledWith(15);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves focus when options are reordered during an update", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    const view = render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={options}
        value="primary"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.keyDown(screen.getByRole("option", { name: "Primary Calendar" }), {
      key: "ArrowDown",
    });
    view.rerender(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={options.toReversed()}
        value="primary"
      />,
    );
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
    expect(screen.getByRole("option", { name: "Primary Calendar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
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

    await expect(
      screen.findByRole("heading", { level: 2, name: "Highlights" }),
    ).resolves.toBeInTheDocument();
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

  it("saves the system invite notification setting", () => {
    const onSave = vi.fn();
    renderDialog(null, { onSave });

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(screen.getByLabelText("Show system notifications for new event invitations"));

    expect(onSave).toHaveBeenCalledWith({ systemInviteNotificationsEnabled: true });
  });

  it("saves the taskbar invite notification setting", () => {
    const onSave = vi.fn();
    renderDialog(null, { onSave });

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(screen.getByLabelText("Show taskbar badge for new event invitations"));

    expect(onSave).toHaveBeenCalledWith({ taskbarInviteNotificationsEnabled: false });
  });
});
