import React, { useCallback, useEffect, useId, useRef, useState } from "react";

export interface SettingsSelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SettingsSelectProps<T extends string | number> {
  value: T;
  options: SettingsSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SettingsSelect<T extends string | number>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
}: SettingsSelectProps<T>): React.JSX.Element {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openingKeyRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const menuOpen = isOpen && !disabled && options.length > 0;

  const selectedOption = options.find((option) => option.value === value);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      setIsOpen(false);
      return;
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside, menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      openingKeyRef.current = null;
      return;
    }

    if (openingKeyRef.current === null && rootRef.current?.contains(document.activeElement)) {
      return;
    }
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const selected = rootRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    const target =
      openingKeyRef.current === "Home"
        ? items?.[0]
        : openingKeyRef.current === "End"
          ? items?.[items.length - 1]
          : (selected ?? items?.[0]);
    target?.focus();
    openingKeyRef.current = null;
  }, [menuOpen, options]);

  return (
    <div
      className={`settings-select ${menuOpen ? "settings-select--open" : ""} ${className}`.trim()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (disabled || options.length === 0) {
          return;
        }
        if (event.key === "Escape" && menuOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        if (!menuOpen) {
          openingKeyRef.current = event.key;
          setIsOpen(true);
          return;
        }
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
        );
        const currentIndex = items.findIndex((item) => item === document.activeElement);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : event.key === "ArrowDown"
                ? (currentIndex + 1) % items.length
                : (Math.max(currentIndex, 0) - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }}
      ref={rootRef}
      role="group"
    >
      <button
        aria-controls={menuOpen ? listboxId : undefined}
        aria-describedby={`${listboxId}-value`}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="settings-select__trigger"
        disabled={disabled || options.length === 0}
        ref={triggerRef}
        onClick={() => {
          openingKeyRef.current = "click";
          setIsOpen((open) => !open);
        }}
        type="button"
      >
        <span className="settings-select__value" id={`${listboxId}-value`}>
          {selectedOption?.label ?? ""}
        </span>
        <ChevronDownIcon
          className={`settings-select__chevron ${menuOpen ? "settings-select__chevron--open" : ""}`}
        />
      </button>
      {menuOpen && (
        <div aria-label={ariaLabel} className="settings-select__menu" id={listboxId} role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                aria-selected={isSelected}
                className={`settings-select__option ${isSelected ? "settings-select__option--selected" : ""}`}
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                role="option"
                tabIndex={-1}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SettingsSelect;
