import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toDateTimeInputValue } from "@shared/calendar";
import DatePicker from "./date-picker";
import { TIME_OPTIONS, TimeSelect } from "./event-editor-dialog";

interface PlaceholderEventRange {
  start: string;
  end: string;
}

interface PlaceholderEventMenuProps {
  range: PlaceholderEventRange;
  position: { x: number; y: number };
  onCreate: (range: PlaceholderEventRange) => Promise<void>;
  onDismiss: () => void;
}

function resolveInputInstant(value: string, original: string): string | null {
  if (!value) {
    return null;
  }
  if (value === toDateTimeInputValue(original, false)) {
    return original;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const iso = date.toISOString();
  return toDateTimeInputValue(iso, false) === value ? iso : null;
}

function PlaceholderEventMenu({ range, position, onCreate, onDismiss }: PlaceholderEventMenuProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(false);
  const [start, setStart] = React.useState(() => toDateTimeInputValue(range.start, false));
  const [end, setEnd] = React.useState(() => toDateTimeInputValue(range.end, false));
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const submittingRef = React.useRef(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const createButtonRef = React.useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = React.useState({ left: position.x, top: position.y });
  const startIso = resolveInputInstant(start, range.start);
  const endIso = resolveInputInstant(end, range.end);
  const validRange = Boolean(startIso && endIso && Date.parse(startIso) < Date.parse(endIso));
  const titleId = React.useId();

  React.useLayoutEffect(() => {
    function reposition(): void {
      const rect = menuRef.current!.getBoundingClientRect();
      const left = Math.max(8, Math.min(position.x, globalThis.innerWidth - rect.width - 8));
      const top = Math.max(8, Math.min(position.y, globalThis.innerHeight - rect.height - 8));
      setPlacement((current) =>
        current.left === left && current.top === top ? current : { left, top },
      );
    }
    reposition();
    globalThis.addEventListener("resize", reposition);
    return () => globalThis.removeEventListener("resize", reposition);
  }, [position.x, position.y, editing, errorMessage, validRange]);

  React.useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    createButtonRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [editing]);

  React.useEffect(() => {
    function dismiss(): void {
      if (!submittingRef.current) {
        onDismiss();
      }
    }
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        dismiss();
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
    }
    function handleScroll(event: Event): void {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }
      dismiss();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);
    globalThis.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
      globalThis.removeEventListener("resize", dismiss);
    };
  }, [onDismiss]);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!validRange || !startIso || !endIso || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onCreate({
        start: startIso,
        end: endIso,
      });
      if (menuRef.current) {
        onDismiss();
      }
    } catch (error) {
      submittingRef.current = false;
      if (menuRef.current) {
        setSubmitting(false);
        setErrorMessage(
          error instanceof Error ? error.message : t("calendarBoard.placeholderSaveFailed"),
        );
      }
    }
  }

  return createPortal(
    <div
      aria-labelledby={editing ? titleId : undefined}
      aria-label={editing ? undefined : t("calendarBoard.contextMenu")}
      className="placeholder-event-menu"
      ref={menuRef}
      role={editing ? "dialog" : "menu"}
      style={placement}
    >
      {!editing ? (
        <button
          className="placeholder-event-menu__item"
          onClick={() => setEditing(true)}
          ref={createButtonRef}
          role="menuitem"
          type="button"
        >
          {t("calendarBoard.createPlaceholder")}
        </button>
      ) : (
        <>
          <h3 id={titleId}>{t("calendarBoard.placeholderTitle")}</h3>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <div className="placeholder-event-menu__range">
              <div className="field">
                <label htmlFor={`${titleId}-start-date`}>{t("eventEditor.startDate")}</label>
                <DatePicker
                  id={`${titleId}-start-date`}
                  label={t("eventEditor.startDate")}
                  disabled={submitting}
                  onChange={(date) => setStart(`${date}T${start.slice(11)}`)}
                  value={start.slice(0, 10)}
                />
              </div>
              <label className="field">
                <span>{t("eventEditor.startTime")}</span>
                <TimeSelect
                  disabled={submitting}
                  floating
                  onChange={(time) => setStart(`${start.slice(0, 10)}T${time}`)}
                  options={TIME_OPTIONS}
                  scrollToSelected
                  value={start.slice(11)}
                />
              </label>
            </div>
            <div className="placeholder-event-menu__range">
              <div className="field">
                <label htmlFor={`${titleId}-end-date`}>{t("eventEditor.endDate")}</label>
                <DatePicker
                  id={`${titleId}-end-date`}
                  label={t("eventEditor.endDate")}
                  disabled={submitting}
                  onChange={(date) => setEnd(`${date}T${end.slice(11)}`)}
                  value={end.slice(0, 10)}
                />
              </div>
              <label className="field">
                <span>{t("eventEditor.endTime")}</span>
                <TimeSelect
                  disabled={submitting}
                  floating
                  onChange={(time) => setEnd(`${end.slice(0, 10)}T${time}`)}
                  options={TIME_OPTIONS}
                  scrollToSelected
                  value={end.slice(11)}
                />
              </label>
            </div>
            {!validRange && (
              <p role="alert">
                {startIso && endIso
                  ? t("calendarBoard.invalidPlaceholderRange")
                  : t("calendarBoard.invalidPlaceholderTime")}
              </p>
            )}
            {errorMessage && <p role="alert">{errorMessage}</p>}
            <div className="placeholder-event-menu__actions">
              <button
                className="ghost-button"
                disabled={submitting}
                onClick={onDismiss}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                className="primary-button"
                disabled={submitting || !validRange}
                ref={createButtonRef}
                type="submit"
              >
                {submitting ? t("common.saving") : t("calendarBoard.createPlaceholder")}
              </button>
            </div>
          </form>
        </>
      )}
    </div>,
    document.body,
  );
}

export default PlaceholderEventMenu;
export type { PlaceholderEventRange };
