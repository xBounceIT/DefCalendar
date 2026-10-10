import { z } from "zod";

export const MIN_LOCATION_QUERY_LENGTH = 3;
export const MAX_LOCATION_QUERY_LENGTH = 200;
export const LOCATION_CACHE_TTL_MS = 300_000;
export const MAX_CACHED_LOCATION_SEARCHES = 100;

export const MAX_MAP_LATITUDE = 85.051_128_78;
export const locationCoordinatesSchema = z.object({
  latitude: z.number().finite().min(-MAX_MAP_LATITUDE).max(MAX_MAP_LATITUDE),
  longitude: z.number().finite().min(-180).max(180),
});

export type LocationCoordinates = z.infer<typeof locationCoordinatesSchema>;
export const MAP_PREVIEW_WIDTH = 132;
export const MAP_PREVIEW_HEIGHT = 80;
export const MAP_PREVIEW_ZOOM = 15;
export interface LocationMapTile {
  src: string;
  left: number;
  top: number;
}

export function getMapTilePositions(coordinates: LocationCoordinates) {
  const point = locationCoordinatesSchema.parse(coordinates);
  const count = 2 ** MAP_PREVIEW_ZOOM;
  const latitude = (point.latitude * Math.PI) / 180;
  const x = ((point.longitude + 180) / 360) * count;
  const y = Math.max(
    0,
    Math.min(
      count - Number.EPSILON * count,
      ((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * count,
    ),
  );
  const originX = x * 256 - MAP_PREVIEW_WIDTH / 2;
  const originY = y * 256 - MAP_PREVIEW_HEIGHT / 2;
  const tiles = [];
  for (
    let row = Math.floor(originY / 256);
    row < Math.ceil((originY + MAP_PREVIEW_HEIGHT) / 256);
    row += 1
  ) {
    if (row < 0 || row >= count) {
      continue;
    }
    for (
      let column = Math.floor(originX / 256);
      column < Math.ceil((originX + MAP_PREVIEW_WIDTH) / 256);
      column += 1
    ) {
      tiles.push({
        x: ((column % count) + count) % count,
        y: row,
        left: column * 256 - originX,
        top: row * 256 - originY,
      });
    }
  }
  return tiles;
}

export const searchLocationsArgsSchema = z.object({
  query: z.string().trim().min(MIN_LOCATION_QUERY_LENGTH).max(MAX_LOCATION_QUERY_LENGTH),
  language: z.enum(["en", "it"]),
});

export const locationSuggestionSchema = z.object({
  label: z.string().trim().min(1).max(1500),
  houseNumberVerified: z.boolean().optional(),
  coordinates: locationCoordinatesSchema.optional(),
});

export type SearchLocationsArgs = z.infer<typeof searchLocationsArgsSchema>;
export type LocationSuggestion = z.infer<typeof locationSuggestionSchema>;

export function getLocationSearchKey(args: SearchLocationsArgs): string {
  return JSON.stringify([args.language, args.query.trim().toLowerCase()]);
}

export function preserveLocationDetails<
  T extends {
    location: string | null;
    isPhysicalLocation?: boolean;
    locationCoordinates?: LocationCoordinates | null;
  },
>(event: T, current: T | null): T {
  if (
    event.isPhysicalLocation !== undefined ||
    !current ||
    current.isPhysicalLocation === undefined ||
    event.location !== current.location
  ) {
    return event;
  }
  return {
    ...event,
    isPhysicalLocation: current.isPhysicalLocation,
    locationCoordinates: current.locationCoordinates,
  };
}
