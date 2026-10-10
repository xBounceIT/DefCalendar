import { describe, expect, it, onTestFinished, vi } from "vitest";
import OsmMapService from "../src/main/locations/osm-map-service";
import {
  getMapTilePositions,
  MAX_MAP_LATITUDE,
  MAP_PREVIEW_HEIGHT,
  MAP_PREVIEW_WIDTH,
  MAP_PREVIEW_ZOOM,
} from "../src/shared/locations";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const point = { latitude: 0, longitude: 0 };
function response() {
  return new Response(png, { headers: { "content-type": "image/png" } });
}

describe("osm map service", () => {
  it("covers fractional pixels at the right and bottom edges of the viewport", () => {
    expect.hasAssertions();
    const world = 256 * 2 ** MAP_PREVIEW_ZOOM;
    const x = 25_600 + 256 - MAP_PREVIEW_WIDTH / 2 + 0.5;
    const y = 25_600 + 256 - MAP_PREVIEW_HEIGHT / 2 + 0.5;
    const tiles = getMapTilePositions({
      latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI,
      longitude: (x / world) * 360 - 180,
    });
    const covered = [0, MAP_PREVIEW_WIDTH - 0.25].every((column) =>
      [0, MAP_PREVIEW_HEIGHT - 0.25].every((row) =>
        tiles.some(
          (tile) =>
            column >= tile.left &&
            column < tile.left + 256 &&
            row >= tile.top &&
            row < tile.top + 256,
        ),
      ),
    );
    expect(covered).toBe(true);
    expect(tiles).toHaveLength(4);
  });

  it("ignores a throttling response that arrives after its request was superseded", async () => {
    expect.hasAssertions();
    let complete: (value: Response) => void = () => {
      throw new Error("Map not started");
    };
    const pending = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(pending);
    const service = new OsmMapService(fetcher);
    const old = (async () => {
      await expect(service.render(point)).rejects.toThrow();
    })();
    fetcher.mockImplementation(async () => response());
    await service.render({ latitude: 41.8902, longitude: 12.4922 });
    complete(new Response(null, { status: 429 }));
    await old;
    await expect(service.render({ latitude: 48.8584, longitude: 2.2945 })).resolves.toHaveLength(
      getMapTilePositions({ latitude: 48.8584, longitude: 2.2945 }).length,
    );
  });

  it("times out stalled tile requests and permits a retry after the failure cooldown", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("Map request timeout")), milliseconds);
      return controller.signal;
    });
    onTestFinished(() => {
      timeout.mockRestore();
      vi.useRealTimers();
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    const service = new OsmMapService(fetcher);
    await Promise.all([
      expect(service.render(point)).rejects.toThrow("timeout"),
      vi.advanceTimersByTimeAsync(5000),
    ]);
    expect(fetcher.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
    await expect(service.render(point)).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(10_001);
    fetcher.mockImplementation(async () => response());
    await expect(service.render(point)).resolves.toHaveLength(4);
  });

  it("loads only viewport tiles with identifiable requests and coalesces concurrent requests", async () => {
    expect.hasAssertions();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const service = new OsmMapService(fetcher);
    const first = service.render(point);
    expect(service.render(point)).toBe(first);
    const tiles = await first;
    expect(tiles).toHaveLength(4);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toStrictEqual([
      "https://tile.openstreetmap.org/15/16383/16383.png",
      "https://tile.openstreetmap.org/15/16384/16383.png",
      "https://tile.openstreetmap.org/15/16383/16384.png",
      "https://tile.openstreetmap.org/15/16384/16384.png",
    ]);
    expect({ options: fetcher.mock.calls[0][1], image: tiles[0].src }).toMatchObject({
      options: {
        redirect: "error",
        credentials: "omit",
        headers: {
          Accept: "image/png",
          "User-Agent": "DefCalendar (+https://github.com/xBounceIT/DefCalendar)",
        },
      },
      image: "data:image/png;base64,iVBORw0KGgo=",
    });
  });

  it("rejects invalid coordinates before I/O and bounds tile indices at poles and the dateline", () => {
    expect.hasAssertions();
    const fetcher = vi.fn<typeof fetch>();
    const service = new OsmMapService(fetcher);
    for (const invalid of [
      { latitude: 90, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: Number.NaN, longitude: 0 },
    ]) {
      expect(() => service.render(invalid)).toThrow();
    }
    const tiles = [-MAX_MAP_LATITUDE, MAX_MAP_LATITUDE].flatMap((latitude) =>
      [-180, 180].flatMap((longitude) => getMapTilePositions({ latitude, longitude })),
    );
    expect(
      tiles.every(
        (tile) =>
          tile.x >= 0 &&
          tile.x < 32_768 &&
          tile.y >= 0 &&
          tile.y < 32_768 &&
          Number.isFinite(tile.left) &&
          Number.isFinite(tile.top),
      ),
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["html", "invalid png", "oversized header", "oversized stream", "throttled"])(
    "rejects %s tiles instead of rendering arbitrary or unbounded content",
    async (kind) => {
      expect.hasAssertions();
      const body =
        kind === "oversized stream"
          ? new Uint8Array(256_001)
          : kind === "invalid png"
            ? new Uint8Array(8)
            : png;
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(body, {
            status: kind === "throttled" ? 429 : 200,
            headers: {
              "content-type": kind === "html" ? "text/html" : "image/png",
              ...(kind === "oversized header" ? { "content-length": "256001" } : {}),
            },
          }),
      );
      const service = new OsmMapService(fetcher);
      await expect(service.render(point)).rejects.toThrow();
      await expect(service.render(point)).rejects.toThrow("unavailable");
      expect(fetcher).toHaveBeenCalledTimes(4);
    },
  );

  it("aborts superseded requests without poisoning the next preview with a failure cooldown", async () => {
    expect.hasAssertions();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    const service = new OsmMapService(fetcher);
    const old = (async () => {
      await expect(service.render(point)).rejects.toThrow();
    })();
    fetcher.mockImplementation(async () => response());
    const next = service.render({ latitude: 41.8902, longitude: 12.4922 });
    await old;
    await expect(next).resolves.toHaveLength(
      getMapTilePositions({ latitude: 41.8902, longitude: 12.4922 }).length,
    );
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
