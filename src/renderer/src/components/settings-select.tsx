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

function normalizeTypeaheadText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function getFocusedOptionIndex(items: HTMLButtonElement[]): number {
  return document.activeElement instanceof HTMLButtonElement
    ? items.indexOf(document.activeElement)
    : -1;
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
  const typeaheadRef = useRef<{ query: string; updatedAt: number; value: T } | null>(null);
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
      typeaheadRef.current = null;
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
          typeaheadRef.current = null;
        }
      }}
      onKeyDown={(event) => {
        if (disabled || options.length === 0 || event.nativeEvent.isComposing) {
          return;
        }
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          [...event.key].length === 1 &&
          event.key !== " "
        ) {
          const key = normalizeTypeaheadText(event.key);
          if (!key) {
            return;
          }
          event.preventDefault();
          const now = Date.now();
          const previous = typeaheadRef.current;
          const recent = previous && now - previous.updatedAt < 700 ? previous : null;
          const continuing = recent !== null && recent.query !== key;
          const query = continuing ? recent.query + key : key;
          const items = menuOpen
            ? [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')]
            : [];
          const focusedIndex = getFocusedOptionIndex(items);
          const currentIndex =
            focusedIndex !== -1
              ? focusedIndex
              : options.findIndex((option) => option.value === (recent?.value ?? value));
          const startIndex = continuing ? Math.max(currentIndex, 0) : currentIndex + 1;
          let matchIndex = -1;
          for (let offset = 0; offset < options.length; offset += 1) {
            const index = (startIndex + offset) % options.length;
            if (normalizeTypeaheadText(options[index].label).startsWith(query)) {
              matchIndex = index;
              break;
            }
          }
          const match = options[matchIndex];
          if (!match) {
            typeaheadRef.current = null;
            return;
          }
          typeaheadRef.current = {
            query,
            updatedAt: now,
            value: match.value,
          };
          if (menuOpen) {
            items[matchIndex]?.focus();
          } else if (match.value !== value) {
            onChange(match.value);
          }
          return;
        }
        typeaheadRef.current = null;
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
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
        ];
        const currentIndex = getFocusedOptionIndex(items);
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
          typeaheadRef.current = null;
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
