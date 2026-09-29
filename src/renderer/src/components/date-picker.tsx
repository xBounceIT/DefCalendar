import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import MiniCalendar, { CalendarIcon } from "./mini-calendar";

interface DatePickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowClear?: boolean;
}

function parseDate(value: string, pattern: string): Date | null {
  const date = parse(value, pattern, new Date());
  return isValid(date) &&
    date.getFullYear() >= 1 &&
    date.getFullYear() <= 9999 &&
    format(date, pattern) === value
    ? date
    : null;
}

function DatePicker({
  id,
  label,
  value,
  onChange,
  disabled = false,
  allowClear = false,
}: DatePickerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("it") ? it : enUS;
  const pattern = locale === it ? "dd/MM/yyyy" : "MM/dd/yyyy";
  const date = parseDate(value, "yyyy-MM-dd");
  const displayValue = date ? format(date, pattern) : "";
  const [text, setText] = useState(displayValue);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    setText(displayValue);
  }, [displayValue]);
  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) {
      return;
    }
    const panel = panelRef.current;
    panel.showPopover?.();
    function position() {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) {
        return;
      }
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
      const below = anchor.bottom + 6;
      const top =
        below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 6);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function dismiss(event: MouseEvent | FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function select(next: string) {
    onChange(next);
    close();
  }

  const invalid = text !== "" && !parseDate(text, pattern) && !parseDate(text, "yyyy-MM-dd");

  return (
    <div
      role="group"
      className="date-picker"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className={`date-picker__field${disabled ? " date-picker__field--disabled" : ""}`}>
        <input
          id={id}
          aria-label={label}
          aria-invalid={invalid || undefined}
          className="date-picker__input"
          disabled={disabled}
          placeholder={pattern.toUpperCase()}
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = parseDate(next, pattern) ?? parseDate(next, "yyyy-MM-dd");
            if (parsed) {
              onChange(format(parsed, "yyyy-MM-dd"));
            } else if (next === "" && allowClear) {
              onChange("");
            }
          }}
          onBlur={() => setText(displayValue)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          className="date-picker__trigger"
          aria-label={t("datePicker.open", { label })}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-haspopup="dialog"
          onClick={() => setOpen((previous) => !previous)}
        >
          <CalendarIcon />
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          popover="auto"
          role="dialog"
          aria-label={label}
          className="date-picker__popover"
          onToggle={(event) => {
            if ((event.nativeEvent as ToggleEvent).newState === "closed") {
              setOpen(false);
            }
          }}
        >
          <MiniCalendar
            embedded
            focusOnOpen
            selectedDate={date}
            onDateSelect={(selected) => select(format(selected, "yyyy-MM-dd"))}
          />
          <div className="date-picker__footer">
            {allowClear && (
              <button type="button" onClick={() => select("")}>
                {t("datePicker.clear")}
              </button>
            )}
            <button type="button" onClick={() => select(format(new Date(), "yyyy-MM-dd"))}>
              {t("miniCalendar.today")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
