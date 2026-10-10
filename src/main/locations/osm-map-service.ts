import { Buffer } from "node:buffer";
import {
  getMapTilePositions,
  locationCoordinatesSchema,
  MAP_PREVIEW_ZOOM,
  type LocationCoordinates,
  type LocationMapTile,
} from "@shared/locations";

const MAX_TILE_BYTES = 256_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

class OsmMapService {
  private active: {
    key: string;
    controller: AbortController;
    promise: Promise<LocationMapTile[]>;
  } | null = null;
  private unavailableUntil = 0;

  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  render(input: LocationCoordinates): Promise<LocationMapTile[]> {
    const coordinates = locationCoordinatesSchema.parse(input);
    const key = JSON.stringify(coordinates);
    if (this.active?.key === key && !this.active.controller.signal.aborted) {
      return this.active.promise;
    }
    this.active?.controller.abort();
    if (Date.now() < this.unavailableUntil) {
      return Promise.reject(new Error("Map preview is unavailable."));
    }
    const controller = new AbortController();
    const promise = this.renderTiles(coordinates, controller).finally(() => {
      if (this.active?.controller === controller) {
        this.active = null;
      }
    });
    this.active = { key, controller, promise };
    return promise;
  }

  private async renderTiles(
    coordinates: LocationCoordinates,
    controller: AbortController,
  ): Promise<LocationMapTile[]> {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    try {
      return await Promise.all(
        getMapTilePositions(coordinates).map(async (tile) => {
          const response = await this.fetcher(
            `https://tile.openstreetmap.org/${MAP_PREVIEW_ZOOM}/${tile.x}/${tile.y}.png`,
            {
              signal,
              redirect: "error",
              credentials: "omit",
              headers: {
                Accept: "image/png",
                "User-Agent": "DefCalendar (+https://github.com/xBounceIT/DefCalendar)",
              },
            },
          );
          signal.throwIfAborted();
          if (response.status === 429) {
            this.unavailableUntil = Date.now() + 60_000;
          }
          if (
            !response.ok ||
            response.headers.get("content-type")?.split(";")[0].trim() !== "image/png" ||
            Number(response.headers.get("content-length") ?? 0) > MAX_TILE_BYTES ||
            !response.body
          ) {
            throw new Error("Map preview is unavailable.");
          }
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              size += value.byteLength;
              if (size > MAX_TILE_BYTES) {
                throw new Error("Map tile is too large.");
              }
              chunks.push(value);
            }
          } finally {
            await reader.cancel();
          }
          signal.throwIfAborted();
          const image = Buffer.concat(chunks);
          if (!image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
            throw new Error("Map tile is invalid.");
          }
          return {
            src: `data:image/png;base64,${image.toString("base64")}`,
            left: tile.left,
            top: tile.top,
          };
        }),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        this.unavailableUntil = Math.max(this.unavailableUntil, Date.now() + 10_000);
      }
      controller.abort();
      throw error;
    }
  }
}

export default OsmMapService;
