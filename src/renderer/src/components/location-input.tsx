import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_LOCATION_QUERY_LENGTH,
  MIN_LOCATION_QUERY_LENGTH,
  LOCATION_CACHE_TTL_MS,
  MAX_CACHED_LOCATION_SEARCHES,
  getLocationSearchKey,
  type LocationSuggestion,
  type SearchLocationsArgs,
} from "@shared/locations";

interface LocationInputProps {
  disabled: boolean;
  physical?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: LocationSuggestion) => void;
  onCompositionChange?: (composing: boolean) => void;
  onSearch: (args: SearchLocationsArgs) => Promise<LocationSuggestion[]>;
  resetToken: object;
}

function LocationInput({
  disabled,
  physical = true,
  value,
  onChange,
  onSelect,
  onCompositionChange,
  onSearch,
  resetToken,
}: LocationInputProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, { expires: number; items: LocationSuggestion[] }>());
  const pending = useRef<{ key: string; request: Promise<LocationSuggestion[]> } | null>(null);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [result, setResult] = useState<{
    query: string;
    language: string;
    status: "loading" | "ready" | "error";
    items: LocationSuggestion[];
  } | null>(null);
  const query = value.trim();
  const language = i18n.resolvedLanguage?.startsWith("it") ? "it" : "en";
  const key = getLocationSearchKey({ query, language });
  const searchable =
    physical &&
    !disabled &&
    !composing &&
    query.length >= MIN_LOCATION_QUERY_LENGTH &&
    query.length <= MAX_LOCATION_QUERY_LENGTH;
  const enabled = open && searchable;

  useEffect(() => {
    setOpen(false);
    setResult(null);
    setActiveIndex(-1);
    setComposing(false);
    onCompositionChange?.(false);
  }, [resetToken, onCompositionChange]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const cached = cache.current.get(key);
    if (cached && cached.expires > Date.now()) {
      setResult({ query, language, status: "ready", items: cached.items });
      return;
    }
    setResult((previous) => ({
      query,
      language,
      status: "loading",
      items: previous?.language === language ? previous.items : [],
    }));
    const remember = (items: LocationSuggestion[]) => {
      cache.current.delete(key);
      cache.current.set(key, { expires: Date.now() + LOCATION_CACHE_TTL_MS, items });
      if (cache.current.size > MAX_CACHED_LOCATION_SEARCHES) {
        cache.current.delete(cache.current.keys().next().value!);
      }
    };
    const search = async () => {
      try {
        let request = pending.current?.key === key ? pending.current.request : undefined;
        if (!request) {
          request = onSearch({ query, language })
            .then((items) => {
              if (items.length > 0) {
                remember(items);
              }
              return items;
            })
            .finally(() => {
              if (pending.current?.request === request) {
                pending.current = null;
              }
            });
          pending.current = { key, request };
        }
        const items = await request;
        if (!cancelled) {
          remember(items);
          setResult({ query, language, status: "ready", items });
          setActiveIndex(-1);
        }
      } catch {
        if (!cancelled) {
          setResult((previous) => ({
            query,
            language,
            status: "error",
            items: previous?.language === language ? previous.items : [],
          }));
        }
      }
    };
    const reusePending = pending.current?.key === key;
    const timer = reusePending
      ? undefined
      : setTimeout(() => {
          void search();
        }, 500);
    if (reusePending) {
      void search();
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, query, language, key, onSearch, resetToken]);

  const visible = enabled && result !== null && result.language === language;
  const loading = visible && (result.query !== query || result.status === "loading");
  const current = visible && result.query === query && result.status === "ready";
  const items = visible ? result.items : [];
  useEffect(() => {
    if (current && activeIndex >= 0) {
      listRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [current, activeIndex]);
  const select = (item: LocationSuggestion) => {
    onChange(item.label);
    onSelect?.(item);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div
      className="location-field"
      onBlur={(event) => {
        if (event.relatedTarget === null && !document.hasFocus()) {
          return;
        }
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <input
        aria-label={t("eventEditor.location")}
        aria-autocomplete={physical ? "list" : "none"}
        aria-expanded={Boolean(visible)}
        aria-controls={visible ? `${id}-list` : undefined}
        aria-activedescendant={current && items[activeIndex] ? `${id}-${activeIndex}` : undefined}
        aria-describedby={visible ? `${id}-source` : undefined}
        aria-busy={Boolean(loading)}
        autoComplete="off"
        className="field-input field-input--underline location-field__input"
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onCompositionStart={() => {
          setComposing(true);
          onCompositionChange?.(true);
        }}
        onCompositionEnd={() => {
          setComposing(false);
          onCompositionChange?.(false);
        }}
        onKeyDown={(event) => {
          if (!physical || event.nativeEvent.isComposing || composing) {
            return;
          }
          if (event.key === "Escape" && visible) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (
            current &&
            (event.key === "ArrowDown" || event.key === "ArrowUp") &&
            items.length > 0
          ) {
            event.preventDefault();
            setActiveIndex((current) =>
              event.key === "ArrowDown"
                ? (current + 1) % items.length
                : (current <= 0 ? items.length : current) - 1,
            );
          } else if (event.key === "ArrowDown" && !open && searchable) {
            event.preventDefault();
            setOpen(true);
          } else if (current && event.key === "Enter" && items[activeIndex]) {
            event.preventDefault();
            select(items[activeIndex]);
          }
        }}
        placeholder={t("eventEditor.location")}
        role="combobox"
        spellCheck
        type="text"
        value={value}
      />
      {visible && (
        <div className="event-toolbar__dropdown location-field__dropdown">
          <div
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            aria-label={t("eventEditor.locationSuggestions")}
          >
            {items.map((item, index) => (
              <button
                aria-selected={current && activeIndex === index}
                disabled={!current}
                className={`event-toolbar__dropdown-item location-field__option${current && activeIndex === index ? " event-toolbar__dropdown-item--selected" : ""}`}
                id={`${id}-${index}`}
                key={item.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                {item.label}{" "}
                {item.houseNumberVerified === false && (
                  <span className="location-field__precision">
                    {t("eventEditor.locationHouseNumberUnverified")}
                  </span>
                )}
              </button>
            ))}
          </div>
          {(!current || items.length === 0) && (
            <span className="location-field__status" role="status">
              {loading
                ? t("eventEditor.locationSearching")
                : result.status === "error"
                  ? t("eventEditor.locationUnavailable")
                  : t("eventEditor.locationNoResults")}
            </span>
          )}
          <span className="location-field__source" id={`${id}-source`}>
            <a href="https://photon.komoot.io" target="_blank" rel="noopener noreferrer">
              Photon
            </a>
            {" · © "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap
            </a>
          </span>
        </div>
      )}
    </div>
  );
}

export default LocationInput;
