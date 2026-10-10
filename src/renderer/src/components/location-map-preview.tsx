import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  locationCoordinatesSchema,
  MAX_LOCATION_QUERY_LENGTH,
  MIN_LOCATION_QUERY_LENGTH,
  type LocationCoordinates,
  type LocationMapTile,
  type LocationSuggestion,
  type SearchLocationsArgs,
} from "@shared/locations";

interface LocationMapPreviewProps {
  location: string;
  coordinates: LocationCoordinates | null;
  composing?: boolean;
  onSearch: (args: SearchLocationsArgs) => Promise<LocationSuggestion[]>;
  onMap?: (coordinates: LocationCoordinates) => Promise<LocationMapTile[]>;
}

const loadMap = (coordinates: LocationCoordinates) =>
  globalThis.calendarApi.locations.map(coordinates);

function LocationMapPreview({
  location,
  coordinates,
  composing = false,
  onSearch,
  onMap = loadMap,
}: LocationMapPreviewProps) {
  const { t, i18n } = useTranslation();
  const query = location.trim();
  const href = `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`;
  const canPreview = query.length > 0 && href.length <= 2048;
  const language = i18n.resolvedLanguage?.startsWith("it") ? "it" : "en";
  const [result, setResult] = useState<{
    query: string;
    language: string;
    coordinates: LocationCoordinates | null;
  } | null>(null);
  const [map, setMap] = useState<{ key: string; tiles: LocationMapTile[] } | null>(null);
  const point = locationCoordinatesSchema.safeParse(
    coordinates ??
      (result?.query === query && result.language === language ? result.coordinates : null),
  );
  const latitude = point.success ? point.data.latitude : null;
  const longitude = point.success ? point.data.longitude : null;
  const mapKey = JSON.stringify([latitude, longitude]);
  useEffect(() => {
    if (!canPreview || latitude === null || longitude === null) {
      return;
    }
    let cancelled = false;
    void onMap({ latitude, longitude })
      .then((tiles) => {
        if (!cancelled) {
          setMap({ key: mapKey, tiles });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMap({ key: mapKey, tiles: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canPreview, latitude, longitude, mapKey, onMap]);
  useEffect(() => {
    if (
      coordinates ||
      composing ||
      query.length < MIN_LOCATION_QUERY_LENGTH ||
      query.length > MAX_LOCATION_QUERY_LENGTH
    ) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void onSearch({ query, language })
        .then((items) => {
          if (!cancelled) {
            setResult({ query, language, coordinates: items[0]?.coordinates ?? null });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResult({ query, language, coordinates: null });
          }
        });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, language, coordinates, composing, onSearch]);

  if (!query) {
    return null;
  }
  if (!canPreview) {
    return (
      <span className="location-maps-error" role="status">
        {t("eventEditor.locationTooLongForMaps")}
      </span>
    );
  }
  const tiles = map?.key === mapKey ? map.tiles : [];
  const loading =
    (!coordinates &&
      query.length >= MIN_LOCATION_QUERY_LENGTH &&
      query.length <= MAX_LOCATION_QUERY_LENGTH &&
      (result?.query !== query || result.language !== language)) ||
    (point.success && map?.key !== mapKey);

  return (
    <div className="location-map-preview">
      <a
        className="location-map-preview__link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("eventEditor.openInGoogleMaps")}
        title={t("eventEditor.openInGoogleMaps")}
      >
        {tiles.length > 0 ? (
          <span
            className="location-map-preview__map"
            role="img"
            aria-label={t("eventEditor.locationMapPreview")}
          >
            {tiles.map((tile) => (
              <img
                key={`${tile.left},${tile.top}`}
                src={tile.src}
                alt=""
                draggable={false}
                onError={() =>
                  setMap((current) =>
                    current?.key === mapKey ? { key: mapKey, tiles: [] } : current,
                  )
                }
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
            <svg
              className="location-map-preview__pin"
              width="18"
              height="24"
              viewBox="0 0 24 32"
              aria-hidden="true"
            >
              <path
                d="M12 31S1 18 1 12a11 11 0 1 1 22 0c0 6-11 19-11 19Z"
                fill="var(--accent)"
                stroke="var(--on-accent)"
                strokeWidth="2"
              />
              <circle cx="12" cy="12" r="3" fill="var(--on-accent)" />
            </svg>
          </span>
        ) : (
          <span className="location-map-preview__placeholder">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
            <span>
              {loading
                ? t("eventEditor.locationMapLoading")
                : t("eventEditor.locationMapUnavailable")}
            </span>
          </span>
        )}
        <span className="location-map-preview__overlay" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
          </svg>
        </span>
      </a>
      <a
        className="location-map-preview__source"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}

export default LocationMapPreview;
