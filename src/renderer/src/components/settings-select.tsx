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
  "aria-label": ariaLabel,
}: SettingsSelectProps<T>): React.JSX.Element {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      className={`settings-select ${isOpen ? "settings-select--open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="settings-select__trigger"
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        type="button"
      >
        <span className="settings-select__value">{selectedOption?.label ?? ""}</span>
        <ChevronDownIcon
          className={`settings-select__chevron ${isOpen ? "settings-select__chevron--open" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="settings-select__menu" id={listboxId} role="listbox">
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
                }}
                role="option"
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
