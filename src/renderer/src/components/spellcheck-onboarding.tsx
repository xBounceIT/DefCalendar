import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";

interface SpellcheckOnboardingProps {
  onComplete: () => Promise<void>;
  onOpenSettings?: () => void;
}

function SpellcheckOnboarding({ onComplete, onOpenSettings }: SpellcheckOnboardingProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.focus();
    return () => {
      mountedRef.current = false;
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  const complete = async (openSettings: boolean) => {
    if (busyRef.current || !mountedRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onComplete();
      if (openSettings && mountedRef.current) {
        onOpenSettings?.();
      }
    } catch {
      if (mountedRef.current) {
        setFailed(true);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <dialog
      aria-describedby="spellcheck-onboarding-description"
      aria-labelledby="spellcheck-onboarding-title"
      aria-modal="true"
      className="spellcheck-onboarding"
      onCancel={(event) => {
        event.preventDefault();
        void complete(false);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (!busy) {
            void complete(false);
          }
        }
      }}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="spellcheck-onboarding__content">
        <span className="spellcheck-onboarding__eyebrow">
          {t("spellcheck.onboarding.newFeature")}
        </span>
        <h2 id="spellcheck-onboarding-title">{t("spellcheck.onboarding.title")}</h2>
        <p className="spellcheck-onboarding__intro">{t("spellcheck.onboarding.description")}</p>
        <p className="spellcheck-onboarding__instructions" id="spellcheck-onboarding-description">
          {t("spellcheck.onboarding.instructions")}
        </p>
        <div aria-hidden="true" className="spellcheck-onboarding__demo">
          <span className="spellcheck-onboarding__field-label">
            {t("spellcheck.onboarding.exampleLabel")}
          </span>
          <div className="spellcheck-onboarding__field">
            <span className="spellcheck-onboarding__typo">
              {t("spellcheck.onboarding.exampleTypo")}
            </span>{" "}
            {t("spellcheck.onboarding.exampleRest")}
            <FontAwesomeIcon className="spellcheck-onboarding__cursor" icon={faArrowPointer} />
          </div>
          <div className="spellcheck-onboarding__menu">
            <div className="spellcheck-onboarding__suggestion">
              {t("spellcheck.onboarding.exampleCorrection")}
            </div>
            <div className="spellcheck-onboarding__add-word">
              {t("spellcheck.onboarding.exampleAddWord")}
            </div>
            <div className="spellcheck-onboarding__menu-group">
              <div>{t("spellcheck.onboarding.exampleUndo")}</div>
              <div>{t("spellcheck.onboarding.exampleRedo")}</div>
            </div>
            <div className="spellcheck-onboarding__menu-group">
              <div>{t("spellcheck.onboarding.exampleCut")}</div>
              <div>{t("spellcheck.onboarding.exampleCopy")}</div>
              <div>{t("spellcheck.onboarding.examplePaste")}</div>
            </div>
            <div className="spellcheck-onboarding__menu-group">
              <div>{t("spellcheck.onboarding.exampleSelectAll")}</div>
            </div>
          </div>
          <p className="spellcheck-onboarding__demo-caption">
            {t("spellcheck.onboarding.exampleCaption")}
          </p>
        </div>
        <p className="spellcheck-onboarding__hint">{t("spellcheck.onboarding.settingsHint")}</p>
        {failed && (
          <p className="spellcheck-onboarding__error" role="alert">
            {t("spellcheck.saveError")}
          </p>
        )}
      </div>
      <div className="spellcheck-onboarding__actions">
        {onOpenSettings && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void complete(true)}
            type="button"
          >
            {t("spellcheck.onboarding.manage")}
          </button>
        )}
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void complete(false)}
          type="button"
        >
          {t("spellcheck.onboarding.done")}
        </button>
      </div>
    </dialog>
  );
}

export default SpellcheckOnboarding;
