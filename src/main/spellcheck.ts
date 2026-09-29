import type { BrowserWindow, MenuItemConstructorOptions, Session } from "electron";
import { dialog, Menu } from "@main/electron-runtime";
import { t } from "@main/i18n";
import type { UserSettings } from "@shared/schemas";
import {
  IPC_CHANNELS,
  type SpellcheckDictionaryState,
  type SpellcheckDictionaryStates,
} from "@shared/ipc";

interface DictionaryTracker {
  states: Map<string, SpellcheckDictionaryState>;
  listeners: Set<() => void>;
}

const dictionaryTrackers = new WeakMap<Session, DictionaryTracker>();

function getDictionaryTracker(session: Session): DictionaryTracker {
  const existing = dictionaryTrackers.get(session);
  if (existing) {
    return existing;
  }
  const tracker: DictionaryTracker = { states: new Map(), listeners: new Set() };
  dictionaryTrackers.set(session, tracker);
  const setState = (language: string, state: SpellcheckDictionaryState) => {
    if (tracker.states.get(language) === state) {
      return;
    }
    tracker.states.set(language, state);
    for (const listener of tracker.listeners) {
      listener();
    }
  };
  session.on("spellcheck-dictionary-download-begin", (_event, language) =>
    setState(language, "downloading"),
  );
  session.on("spellcheck-dictionary-initialized", (_event, language) =>
    setState(language, "ready"),
  );
  session.on("spellcheck-dictionary-download-failure", (_event, language) =>
    setState(language, "failed"),
  );
  return tracker;
}

function getSpellcheckDictionaryStates(session: Session): SpellcheckDictionaryStates {
  return Object.fromEntries(getDictionaryTracker(session).states);
}

function applySpellcheckSettings(session: Session, settings: UserSettings): void {
  if (!settings.spellcheckEnabled) {
    session.setSpellCheckerEnabled(false);
    return;
  }
  const languages = settings.spellcheckLanguages.filter((language) =>
    session.availableSpellCheckerLanguages.includes(language),
  );
  if (process.platform !== "darwin") {
    const tracker = getDictionaryTracker(session);
    const retries = languages.filter((language) => tracker.states.get(language) === "failed");
    if (retries.length > 0) {
      session.setSpellCheckerLanguages(languages.filter((language) => !retries.includes(language)));
    }
    session.setSpellCheckerLanguages(languages);
    let changed = false;
    for (const language of languages) {
      if (!tracker.states.has(language) || tracker.states.get(language) === "failed") {
        tracker.states.set(language, "downloading");
        changed = true;
      }
    }
    if (changed) {
      for (const listener of tracker.listeners) {
        listener();
      }
    }
  }
  session.setSpellCheckerEnabled(
    settings.spellcheckEnabled && (process.platform === "darwin" || languages.length > 0),
  );
}

function installSpellingContextMenu(window: BrowserWindow): void {
  const session = window.webContents.session;
  const tracker = getDictionaryTracker(session);
  const notify = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(
        IPC_CHANNELS.spellcheckDictionaryStatesChanged,
        getSpellcheckDictionaryStates(session),
      );
    }
  };
  tracker.listeners.add(notify);
  window.once("closed", () => tracker.listeners.delete(notify));
  window.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable) {
      return;
    }
    const template: MenuItemConstructorOptions[] = [];
    if (params.misspelledWord && window.webContents.session.isSpellCheckerEnabled()) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion),
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: t("spellingNoSuggestions"), enabled: false });
      }
      template.push(
        {
          label: t("spellingAddToDictionary"),
          click: () => {
            if (!session.addWordToSpellCheckerDictionary(params.misspelledWord)) {
              void dialog.showMessageBox(window, {
                type: "error",
                message: t("spellingAddWordError"),
              });
            }
          },
        },
        { type: "separator" },
      );
    }
    template.push(
      { role: "undo", enabled: params.editFlags.canUndo },
      { role: "redo", enabled: params.editFlags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    );
    Menu.buildFromTemplate(template).popup({ window });
  });
}

export { applySpellcheckSettings, getSpellcheckDictionaryStates, installSpellingContextMenu };
