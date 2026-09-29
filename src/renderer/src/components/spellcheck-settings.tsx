import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faSpinner, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import type { SpellcheckDictionaries, SpellcheckDictionaryStates } from "@shared/ipc";
import type { UserSettings } from "@shared/schemas";
import { spellcheckWordSchema } from "@shared/schemas";
import SpellcheckOnboarding from "./spellcheck-onboarding";

interface SpellcheckSettingsProps {
  settings: UserSettings;
  onSave: (patch: Partial<UserSettings>) => void | Promise<boolean>;
}

function SpellcheckSettings({ settings, onSave }: SpellcheckSettingsProps) {
  const { t, i18n } = useTranslation();
  const [dictionaries, setDictionaries] = useState<SpellcheckDictionaries | null>(null);
  const [dictionaryStates, setDictionaryStates] = useState<SpellcheckDictionaryStates>({});
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [newWord, setNewWord] = useState("");
  const [adding, setAdding] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const wordMutationRef = useRef(false);
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);

  const save = async (patch: Partial<UserSettings>) => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      setSaveError((await onSave(patch)) === false);
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    let receivedStateUpdate = false;
    const unsubscribe = calendarApi.spellcheck.onDictionaryStatesChanged((states) => {
      receivedStateUpdate = true;
      if (active) {
        setDictionaryStates(states);
      }
    });
    void calendarApi.spellcheck
      .getDictionaries()
      .then((result) => {
        if (active) {
          setDictionaries(result);
          if (!receivedStateUpdate) {
            setDictionaryStates(result.dictionaryStates);
          }
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const languages = useMemo(() => {
    const names = new Intl.DisplayNames([i18n.resolvedLanguage ?? "en"], { type: "language" });
    return (dictionaries?.availableLanguages ?? [])
      .map((code) => ({
        code,
        label: names.of(code) ?? code,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label, i18n.resolvedLanguage));
  }, [dictionaries, i18n.resolvedLanguage]);

  const removeWord = async (word: string) => {
    if (wordMutationRef.current) {
      return;
    }
    wordMutationRef.current = true;
    setRemoving(word);
    setError(false);
    try {
      await calendarApi.spellcheck.removeWord(word);
      setDictionaries(
        (previous) =>
          previous && {
            ...previous,
            customWords: previous.customWords.filter((entry) => entry !== word),
          },
      );
      setDictionaries(await calendarApi.spellcheck.getDictionaries());
    } catch {
      setError(true);
    } finally {
      wordMutationRef.current = false;
      setRemoving(null);
    }
  };

  const addWord = async () => {
    if (wordMutationRef.current || !dictionaries) {
      return;
    }
    const parsed = spellcheckWordSchema.safeParse(newWord);
    if (!parsed.success) {
      setWordError(t("spellcheck.invalidWord"));
      return;
    }
    const word = parsed.data;
    if (dictionaries.customWords.includes(word)) {
      setWordError(t("spellcheck.duplicateWord"));
      return;
    }
    wordMutationRef.current = true;
    setAdding(true);
    setWordError(null);
    setError(false);
    try {
      await calendarApi.spellcheck.addWord(word);
    } catch {
      setWordError(t("spellcheck.addWordError"));
      wordMutationRef.current = false;
      setAdding(false);
      return;
    }
    setNewWord("");
    setDictionaries(
      (previous) =>
        previous && { ...previous, customWords: [...new Set([...previous.customWords, word])] },
    );
    try {
      setDictionaries(await calendarApi.spellcheck.getDictionaries());
    } catch {
      setError(true);
    } finally {
      wordMutationRef.current = false;
      setAdding(false);
    }
  };

  return (
    <div className="settings-panel-section">
      <h3>{t("spellcheck.title")}</h3>
      <p className="settings-description">{t("spellcheck.description")}</p>
      <div className="settings-fields">
        <div className="settings-group">
          <label className="toggle-field settings-group__row">
            <input
              checked={settings.spellcheckEnabled}
              disabled={saving}
              onChange={(event) => void save({ spellcheckEnabled: event.target.checked })}
              type="checkbox"
            />
            <span className="toggle-slider" />
            <span>{t("spellcheck.enabled")}</span>
          </label>
        </div>
        <h4>{t("spellcheck.dictionaries")}</h4>
        <p className="settings-description">
          {dictionaries?.usesSystemLanguages
            ? t("spellcheck.systemLanguages")
            : t("spellcheck.downloadHint")}
        </p>
        {!dictionaries && !error && <p role="status">{t("spellcheck.loading")}</p>}
        {dictionaries && !dictionaries.usesSystemLanguages && (
          <div className="settings-group spellcheck-languages">
            {languages.map(({ code, label }) => {
              const requested = settings.spellcheckLanguages.includes(code);
              const state = dictionaryStates[code];
              const installed = requested && state === "ready";
              const downloading =
                requested && state !== "ready" && state !== "failed" && settings.spellcheckEnabled;
              const action = downloading
                ? t("spellcheck.downloadingDictionary", { language: label })
                : installed
                  ? t("spellcheck.removeDictionary", { language: label })
                  : requested && state === "failed"
                    ? t("spellcheck.retryDictionary", { language: label })
                    : t("spellcheck.downloadDictionary", { language: label });
              return (
                <div className="settings-row settings-group__row" key={code}>
                  <span className="settings-row__label">{label}</span>
                  <button
                    aria-busy={downloading}
                    aria-label={action}
                    className={`spellcheck-language-action${installed ? " spellcheck-language-action--remove" : ""}`}
                    disabled={saving || downloading || !settings.spellcheckEnabled}
                    onClick={() =>
                      void save({
                        spellcheckLanguages: installed
                          ? settings.spellcheckLanguages.filter((language) => language !== code)
                          : [...new Set([...settings.spellcheckLanguages, code])],
                      })
                    }
                    title={action}
                    type="button"
                  >
                    <FontAwesomeIcon
                      aria-hidden="true"
                      icon={downloading ? faSpinner : installed ? faTrashCan : faDownload}
                      spin={downloading}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {settings.spellcheckLanguages.some(
          (language) => dictionaryStates[language] === "failed",
        ) && <p role="alert">{t("spellcheck.downloadError")}</p>}
        {!dictionaries?.usesSystemLanguages && settings.spellcheckLanguages.length === 0 && (
          <p role="status">{t("spellcheck.noLanguages")}</p>
        )}
        <h4>{t("spellcheck.customWords")}</h4>
        <p className="settings-description">{t("spellcheck.customWordsHint")}</p>
        <form
          className="spellcheck-word-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addWord();
          }}
        >
          <label htmlFor="spellcheck-new-word">{t("spellcheck.newWord")}</label>
          <div className="spellcheck-word-form__controls">
            <input
              aria-describedby={wordError ? "spellcheck-word-error" : undefined}
              aria-invalid={Boolean(wordError)}
              className="field-input"
              disabled={!dictionaries || adding || removing !== null}
              id="spellcheck-new-word"
              maxLength={256}
              onChange={(event) => {
                setNewWord(event.target.value);
                setWordError(null);
              }}
              spellCheck={false}
              type="text"
              value={newWord}
            />
            <button
              className="secondary-button"
              disabled={!dictionaries || adding || removing !== null || !newWord.trim()}
              type="submit"
            >
              {adding ? t("common.saving") : t("spellcheck.addWord")}
            </button>
          </div>
          {wordError && (
            <p id="spellcheck-word-error" role="alert">
              {wordError}
            </p>
          )}
        </form>
        {dictionaries?.customWords.length === 0 && <p>{t("spellcheck.noCustomWords")}</p>}
        {Boolean(dictionaries?.customWords.length) && (
          <div className="settings-group spellcheck-word-list">
            {dictionaries?.customWords.toSorted().map((word) => (
              <div className="settings-row settings-group__row" key={word}>
                <span className="settings-row__label">{word}</span>
                <button
                  aria-label={t("spellcheck.removeWord", { word })}
                  className="secondary-button spellcheck-word-remove"
                  disabled={adding || removing !== null}
                  onClick={() => void removeWord(word)}
                  type="button"
                >
                  {t("spellcheck.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert">{t("spellcheck.dictionaryError")}</p>}
        {saveError && <p role="alert">{t("spellcheck.saveError")}</p>}
        <button className="secondary-button" onClick={() => setShowHelp(true)} type="button">
          {t("spellcheck.showHelp")}
        </button>
      </div>
      {showHelp && <SpellcheckOnboarding onComplete={async () => setShowHelp(false)} />}
    </div>
  );
}

export default SpellcheckSettings;
