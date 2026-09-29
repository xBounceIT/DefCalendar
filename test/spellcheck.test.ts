import type {
  BrowserWindow,
  ContextMenuParams,
  MenuItemConstructorOptions,
  Session,
} from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  applySpellcheckSettings,
  getSpellcheckDictionaryStates,
  installSpellingContextMenu,
} from "../src/main/spellcheck";
import { createDefaultSettings } from "../src/shared/schemas";

const { buildFromTemplate, popup, showMessageBox } = vi.hoisted(() => {
  const popup = vi.fn();
  return {
    buildFromTemplate: vi.fn((_template: MenuItemConstructorOptions[]) => ({ popup })),
    popup,
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  };
});

vi.mock(import("@main/electron-runtime"), () => ({
  Menu: { buildFromTemplate } as never,
  dialog: { showMessageBox } as never,
}));

function createFixture() {
  const events = new EventEmitter();
  const session = {
    on: events.on.bind(events),
    availableSpellCheckerLanguages: ["en-US", "it", "fr"],
    setSpellCheckerLanguages: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
    isSpellCheckerEnabled: vi.fn().mockReturnValue(true),
    addWordToSpellCheckerDictionary: vi.fn().mockReturnValue(true),
  };
  let onContextMenu: (_event: unknown, params: ContextMenuParams) => void = () => undefined;
  const window = {
    isDestroyed: vi.fn().mockReturnValue(false),
    once: vi.fn(),
    webContents: {
      send: vi.fn(),
      session,
      replaceMisspelling: vi.fn(),
      on: vi.fn((_name: string, listener: typeof onContextMenu) => {
        onContextMenu = listener;
      }),
    },
  };
  const openMenu = (overrides: Partial<ContextMenuParams> = {}) => {
    onContextMenu({}, {
      isEditable: true,
      misspelledWord: "helo",
      dictionarySuggestions: ["hello", "help"],
      editFlags: {
        canUndo: true,
        canRedo: false,
        canCut: true,
        canCopy: true,
        canPaste: true,
        canSelectAll: true,
        canDelete: true,
        canEditRichly: false,
      },
      ...overrides,
    } as ContextMenuParams);
    return buildFromTemplate.mock.calls[0]?.[0] as unknown as MenuItemConstructorOptions[];
  };
  installSpellingContextMenu(window as unknown as BrowserWindow);
  return { session, window, openMenu, events };
}

describe("spelling integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies both default dictionaries and filters unavailable languages", () => {
    expect.hasAssertions();
    const { session } = createFixture();
    applySpellcheckSettings(session as unknown as Session, {
      ...createDefaultSettings(),
      spellcheckLanguages: ["en-US", "it", "xx"],
    });
    expect(session.setSpellCheckerLanguages.mock.calls).toStrictEqual(
      process.platform === "darwin" ? [] : [[["en-US", "it"]]],
    );
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledWith(true);
  });

  it("disables checking without dictionaries and respects the off switch", () => {
    expect.hasAssertions();
    const { session } = createFixture();
    applySpellcheckSettings(session as unknown as Session, {
      ...createDefaultSettings(),
      spellcheckLanguages: [],
    });
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(process.platform === "darwin");
    applySpellcheckSettings(session as unknown as Session, {
      ...createDefaultSettings(),
      spellcheckEnabled: false,
    });
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(false);
  });

  it.each(["uncached", "failed"])("does not download %s dictionaries while disabled", (state) => {
    const { session, events } = createFixture();
    const nativeSession = session as unknown as Session;
    if (state === "failed") {
      events.emit("spellcheck-dictionary-download-failure", {}, "fr");
    }
    const previousStates = getSpellcheckDictionaryStates(nativeSession);
    const settings = { ...createDefaultSettings(), spellcheckLanguages: ["fr"] };
    applySpellcheckSettings(nativeSession, { ...settings, spellcheckEnabled: false });
    expect(session.setSpellCheckerLanguages).not.toHaveBeenCalled();
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(false);
    expect(getSpellcheckDictionaryStates(nativeSession)).toStrictEqual(previousStates);
    applySpellcheckSettings(nativeSession, settings);
    expect(session.setSpellCheckerLanguages.mock.calls).toStrictEqual(
      process.platform === "darwin" ? [] : state === "failed" ? [[[]], [["fr"]]] : [[["fr"]]],
    );
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(true);
  });

  it("replaces misspellings and adds personal words from the native menu", () => {
    expect.hasAssertions();
    const { window, session, openMenu } = createFixture();
    const menu = openMenu();
    const click = (item: MenuItemConstructorOptions) =>
      item.click?.({} as never, {} as never, {} as never);
    click(menu[0]);
    click(menu[2]);
    expect(window.webContents.replaceMisspelling).toHaveBeenCalledWith("hello");
    expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("helo");
    expect(menu.map((item) => item.role).filter(Boolean)).toStrictEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll",
    ]);
    expect(popup).toHaveBeenCalledWith({ window });
  });

  it("keeps dictionary actions when there are no suggestions", () => {
    expect.hasAssertions();
    const { openMenu } = createFixture();
    const menu = openMenu({ dictionarySuggestions: [] });
    expect(menu[0]).toMatchObject({ enabled: false });
    expect(menu[1].click).toBeTypeOf("function");
  });

  it("reports failed additions from the context menu", () => {
    expect.hasAssertions();
    const { session, window, openMenu } = createFixture();
    session.addWordToSpellCheckerDictionary.mockReturnValue(false);
    openMenu()[2].click?.({} as never, {} as never, {} as never);
    expect(showMessageBox).toHaveBeenCalledWith(window, expect.objectContaining({ type: "error" }));
  });

  it("tracks native readiness, failures and retries without duplicating event listeners", () => {
    expect.hasAssertions();
    const { session, events } = createFixture();
    const nativeSession = session as unknown as Session;
    const settings = { ...createDefaultSettings(), spellcheckLanguages: ["fr"] };
    applySpellcheckSettings(nativeSession, settings);
    expect(getSpellcheckDictionaryStates(nativeSession)).toMatchObject(
      process.platform === "darwin" ? {} : { fr: "downloading" },
    );
    events.emit("spellcheck-dictionary-download-begin", {}, "fr");
    events.emit("spellcheck-dictionary-download-success", {}, "fr");
    expect(getSpellcheckDictionaryStates(nativeSession)).toMatchObject({ fr: "downloading" });
    events.emit("spellcheck-dictionary-download-failure", {}, "fr");
    expect(getSpellcheckDictionaryStates(nativeSession)).toMatchObject({ fr: "failed" });
    session.setSpellCheckerLanguages.mockClear();
    applySpellcheckSettings(nativeSession, settings);
    expect(session.setSpellCheckerLanguages.mock.calls).toStrictEqual(
      process.platform === "darwin" ? [] : [[[]], [["fr"]]],
    );
    events.emit("spellcheck-dictionary-initialized", {}, "fr");
    expect({
      states: getSpellcheckDictionaryStates(nativeSession),
      listenerCount: events.listenerCount("spellcheck-dictionary-initialized"),
    }).toStrictEqual({ states: { fr: "ready" }, listenerCount: 1 });
  });

  it("stops sending dictionary status after the main window is closed", () => {
    expect.hasAssertions();
    const { window, events } = createFixture();
    events.emit("spellcheck-dictionary-initialized", {}, "it");
    expect(window.webContents.send).toHaveBeenCalledOnce();
    const closed = window.once.mock.calls.find(([name]) => name === "closed")?.[1] as () => void;
    closed();
    events.emit("spellcheck-dictionary-download-failure", {}, "fr");
    expect(window.webContents.send).toHaveBeenCalledOnce();
  });

  it("only shows edit commands when checking is disabled", () => {
    expect.hasAssertions();
    const { session, openMenu } = createFixture();
    session.isSpellCheckerEnabled.mockReturnValue(false);
    expect(openMenu()[0]).toMatchObject({ role: "undo" });
  });

  it("does not show a spelling menu on non-editable content", () => {
    expect.hasAssertions();
    const { openMenu } = createFixture();
    openMenu({ isEditable: false });
    expect(buildFromTemplate).not.toHaveBeenCalled();
  });
});
