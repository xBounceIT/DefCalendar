// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import SettingsDialog from "../src/renderer/src/components/settings-dialog";
import SettingsSelect from "../src/renderer/src/components/settings-select";
import SpellcheckOnboarding from "../src/renderer/src/components/spellcheck-onboarding";
import SpellcheckSettings from "../src/renderer/src/components/spellcheck-settings";
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
    spellcheck: {
      onDictionaryStatesChanged: vi.fn().mockReturnValue(() => undefined),
      addWord: vi.fn().mockResolvedValue(undefined),
      getDictionaries: vi.fn().mockResolvedValue({
        availableLanguages: ["en-US", "it", "fr"],
        dictionaryStates: { "en-US": "ready", it: "ready" },
        customWords: ["DefCalendar"],
        usesSystemLanguages: false,
      }),
      removeWord: vi.fn().mockResolvedValue(undefined),
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

function createTestI18n() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return i18n;
}

function renderDialog(
  releaseNotes: null | string,
  options?: {
    onSave?: (patch: UserSettingsPatch) => void | Promise<boolean>;
    settings?: UserSettings;
  },
) {
  const i18n = createTestI18n();

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

  it("selects by typing while the menu is closed", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={options}
        value="primary"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Calendar" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "B" });
    expect(onChange).toHaveBeenCalledWith("birthdays");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("focuses matching prefixes without committing an open-menu selection", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={[...options, { value: "business", label: "Business" }]}
        value="primary"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.keyDown(document.activeElement!, { key: "B" });
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "u" });
    expect(screen.getByRole("option", { name: "Business" })).toHaveFocus();
    expect(screen.getByRole("option", { name: "Primary Calendar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cycles through matching options when the same letter is repeated", () => {
    expect.hasAssertions();
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={vi.fn()}
        options={[...options, { value: "business", label: "Business" }]}
        value="primary"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.keyDown(document.activeElement!, { key: "b" });
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "b" });
    expect(screen.getByRole("option", { name: "Business" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "b" });
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
  });

  it("starts a new prefix after a typing pause", () => {
    expect.hasAssertions();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    onTestFinished(() => clock.mockRestore());
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={vi.fn()}
        options={[...options, { value: "business", label: "Business" }]}
        value="primary"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.keyDown(document.activeElement!, { key: "b" });
    fireEvent.keyDown(document.activeElement!, { key: "u" });
    expect(screen.getByRole("option", { name: "Business" })).toHaveFocus();
    clock.mockReturnValue(2001);
    fireEvent.keyDown(document.activeElement!, { key: "p" });
    expect(screen.getByRole("option", { name: "Primary Calendar" })).toHaveFocus();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }])(
    "does not intercept a modified or composing key: %j",
    (modifiers) => {
      expect.hasAssertions();
      const onChange = vi.fn();
      render(
        <SettingsSelect
          aria-label="Calendar"
          onChange={onChange}
          options={options}
          value="primary"
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
      expect(fireEvent.keyDown(document.activeElement!, { key: "b", ...modifiers })).toBe(true);
      expect(screen.getByRole("option", { name: "Primary Calendar" })).toHaveFocus();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("leaves selection unchanged and allows retrying after an unmatched prefix", () => {
    expect.hasAssertions();
    const onChange = vi.fn();
    render(
      <SettingsSelect
        aria-label="Calendar"
        onChange={onChange}
        options={options}
        value="primary"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.keyDown(document.activeElement!, { key: "z" });
    expect(screen.getByRole("option", { name: "Primary Calendar" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "b" });
    expect(screen.getByRole("option", { name: "Birthdays" })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("settings dialog", () => {
  it("keeps the native modal open while cancellation is being saved", async () => {
    expect.hasAssertions();
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onComplete = vi.fn(() => pending);
    const view = render(
      <I18nextProvider i18n={createTestI18n()}>
        <SpellcheckOnboarding onComplete={onComplete} />
      </I18nextProvider>,
    );
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog).toBeInstanceOf(HTMLDialogElement);
    expect(dialog).toHaveAttribute("open");
    expect(cancel.defaultPrevented).toBe(true);
    expect(onComplete).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => {
      finish();
    });
  });
  it("locks dictionary controls during a save and displays failed saves", async () => {
    expect.hasAssertions();
    let finish: (saved: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const onSave = vi.fn().mockReturnValue(pending);
    renderDialog(null, { onSave });
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    const italian = await screen.findByRole("button", { name: "Remove Italian dictionary" });
    fireEvent.click(italian);
    expect(screen.getByRole("button", { name: "Download French dictionary" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Enable spell check" })).toBeDisabled();
    await act(async () => {
      finish(false);
    });
    expect(
      await screen.findByText("Could not save your preference. Please try again."),
    ).toBeInTheDocument();
    expect(italian).not.toBeDisabled();
  });

  it("does not navigate from an onboarding completion after it is unmounted", async () => {
    expect.hasAssertions();
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onOpenSettings = vi.fn();
    const view = render(
      <I18nextProvider i18n={createTestI18n()}>
        <SpellcheckOnboarding onComplete={() => pending} onOpenSettings={onOpenSettings} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage dictionaries" }));
    view.unmount();
    await act(async () => {
      finish();
    });
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
  it("shows both default dictionaries and saves language and enabled preferences", async () => {
    expect.hasAssertions();
    const onSave = vi.fn();
    renderDialog(null, { onSave });
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    const english = await screen.findByRole("button", {
      name: "Remove American English dictionary",
    });
    const italian = screen.getByRole("button", { name: "Remove Italian dictionary" });
    expect(english).toBeEnabled();
    expect(italian).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Download French dictionary" }));
    expect(onSave).toHaveBeenLastCalledWith({ spellcheckLanguages: ["en-US", "it", "fr"] });
    await waitFor(() => expect(italian).not.toBeDisabled());
    fireEvent.click(italian);
    expect(onSave).toHaveBeenLastCalledWith({ spellcheckLanguages: ["en-US"] });
    await waitFor(() => expect(italian).not.toBeDisabled());
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable spell check" }));
    expect(onSave).toHaveBeenLastCalledWith({ spellcheckEnabled: false });
  });

  it("switches dictionary actions after saving additions and removals", async () => {
    installCalendarApi(createCalendarApiMock(null));
    const onSave = vi.fn();
    function Preferences() {
      const [settings, setSettings] = React.useState(createDefaultSettings());
      return (
        <SpellcheckSettings
          onSave={async (patch) => {
            onSave(patch);
            setSettings((previous) => ({ ...previous, ...patch }));
            return true;
          }}
          settings={settings}
        />
      );
    }
    render(
      <I18nextProvider i18n={createTestI18n()}>
        <Preferences />
      </I18nextProvider>,
    );
    const download = await screen.findByRole("button", { name: "Download French dictionary" });
    expect(download.textContent).toBe("");
    expect(download).toHaveAttribute("title", "Download French dictionary");
    fireEvent.click(download);
    const pendingDownload = await screen.findByRole("button", {
      name: "Downloading French dictionary",
    });
    expect(pendingDownload).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Remove French dictionary" }),
    ).not.toBeInTheDocument();
    act(() =>
      vi
        .mocked(calendarApi.spellcheck.onDictionaryStatesChanged)
        .mock.calls[0][0]({ "en-US": "ready", it: "ready", fr: "failed" }),
    );
    const retry = screen.getByRole("button", { name: "Retry downloading French dictionary" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not download one or more dictionaries.",
    );
    fireEvent.click(retry);
    expect(onSave).toHaveBeenLastCalledWith({ spellcheckLanguages: ["en-US", "it", "fr"] });
    act(() =>
      vi
        .mocked(calendarApi.spellcheck.onDictionaryStatesChanged)
        .mock.calls[0][0]({ "en-US": "ready", it: "ready", fr: "ready" }),
    );
    const remove = await screen.findByRole("button", { name: "Remove French dictionary" });
    expect(onSave).toHaveBeenLastCalledWith({ spellcheckLanguages: ["en-US", "it", "fr"] });
    await waitFor(() => expect(remove).toBeEnabled());
    fireEvent.click(remove);
    expect(
      await screen.findByRole("button", { name: "Download French dictionary" }),
    ).toBeInTheDocument();
    expect(onSave).toHaveBeenLastCalledWith({ spellcheckLanguages: ["en-US", "it"] });
  });

  it("preserves newer native states over an older initial response and cleans up its listener", async () => {
    expect.hasAssertions();
    const api = createCalendarApiMock(null);
    let finish: (value: Awaited<ReturnType<typeof api.spellcheck.getDictionaries>>) => void = () =>
      undefined;
    vi.mocked(api.spellcheck.getDictionaries).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const unsubscribe = vi.fn();
    vi.mocked(api.spellcheck.onDictionaryStatesChanged).mockReturnValue(unsubscribe);
    installCalendarApi(api);
    const view = render(
      <I18nextProvider i18n={createTestI18n()}>
        <SpellcheckSettings
          settings={{ ...createDefaultSettings(), spellcheckLanguages: ["fr"] }}
          onSave={vi.fn()}
        />
      </I18nextProvider>,
    );
    await act(async () => {
      vi.mocked(api.spellcheck.onDictionaryStatesChanged).mock.calls[0][0]({ fr: "ready" });
      finish({
        availableLanguages: ["fr"],
        customWords: [],
        dictionaryStates: { fr: "downloading" },
        usesSystemLanguages: false,
      });
    });
    expect(screen.getByRole("button", { name: "Remove French dictionary" })).toBeEnabled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("adds a trimmed word on form submission and prevents concurrent dictionary changes", async () => {
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    const remove = await screen.findByRole("button", {
      name: "Remove DefCalendar from dictionary",
    });
    const input = screen.getByRole("textbox", { name: "New word" });
    expect(screen.getByRole("button", { name: "Add word" })).toBeDisabled();
    let finish: () => void = () => undefined;
    vi.mocked(calendarApi.spellcheck.addWord).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.mocked(calendarApi.spellcheck.getDictionaries).mockResolvedValue({
      availableLanguages: ["en-US", "it", "fr"],
      dictionaryStates: { "en-US": "ready", it: "ready" },
      customWords: ["DefCalendar", "CaffèTech"],
      usesSystemLanguages: false,
    });
    fireEvent.change(input, { target: { value: "  CaffèTech  " } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    expect(calendarApi.spellcheck.addWord).toHaveBeenCalledExactlyOnceWith("CaffèTech");
    expect(input).toBeDisabled();
    expect(remove).toBeDisabled();
    await act(async () => finish());
    expect(
      await screen.findByRole("button", { name: "Remove CaffèTech from dictionary" }),
    ).toBeEnabled();
    expect(input).toHaveValue("");
  });

  it("keeps successful word additions visible when the follow-up refresh fails", async () => {
    expect.hasAssertions();
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    await screen.findByRole("button", { name: "Remove DefCalendar from dictionary" });
    vi.mocked(calendarApi.spellcheck.getDictionaries).mockRejectedValueOnce(
      new Error("Refresh failed"),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "New word" }), {
      target: { value: "Contoso" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    await expect(
      screen.findByRole("button", { name: "Remove Contoso from dictionary" }),
    ).resolves.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load or update the dictionary.");
  });

  it("keeps successful word removals visible when the follow-up refresh fails", async () => {
    expect.hasAssertions();
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    const remove = await screen.findByRole("button", {
      name: "Remove DefCalendar from dictionary",
    });
    vi.mocked(calendarApi.spellcheck.getDictionaries).mockRejectedValueOnce(
      new Error("Refresh failed"),
    );
    fireEvent.click(remove);
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Remove DefCalendar from dictionary" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No personal words added yet.")).toBeInTheDocument();
  });

  it("rejects phrases and duplicate words without changing the dictionary", async () => {
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    await screen.findByRole("button", { name: "Remove DefCalendar from dictionary" });
    const input = screen.getByRole("textbox", { name: "New word" });
    fireEvent.change(input, { target: { value: "two words" } });
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a single word without spaces or control characters.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "DefCalendar" } });
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This word is already in the dictionary.");
    expect(calendarApi.spellcheck.addWord).not.toHaveBeenCalled();
  });

  it("keeps the word after a failed addition and allows a retry", async () => {
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    await screen.findByRole("button", { name: "Remove DefCalendar from dictionary" });
    vi.mocked(calendarApi.spellcheck.addWord).mockRejectedValueOnce(new Error("Native failure"));
    const input = screen.getByRole("textbox", { name: "New word" });
    fireEvent.change(input, { target: { value: "Contoso" } });
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not add the word. Please try again.",
    );
    expect(input).toHaveValue("Contoso");
    expect(screen.getByRole("button", { name: "Add word" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(calendarApi.spellcheck.addWord).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("removes personal words and can replay the onboarding", async () => {
    expect.hasAssertions();
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Spelling" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove DefCalendar from dictionary" }),
    );
    expect(calendarApi.spellcheck.removeWord).toHaveBeenCalledWith("DefCalendar");
    fireEvent.click(screen.getByRole("button", { name: "Show introduction" }));
    expect(screen.getByRole("dialog", { name: "Spelling suggestions are here" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await screen.findByRole("button", { name: "Show introduction" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
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
