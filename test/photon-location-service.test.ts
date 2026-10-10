import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import PhotonLocationService from "../src/main/locations/photon-location-service";

function response(features: unknown[], status = 200): Response {
  return Response.json({ features }, { status });
}

const rome = { properties: { name: "Roma", city: "Roma", state: "Lazio", country: "Italia" } };

describe("Photon location service", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(["correct", "missing", "underreported"])(
    "rejects oversized response bodies before parsing them, declared length: %s",
    async (declaredLength) => {
      expect.hasAssertions();
      const cancel = vi.fn();
      const payload = new TextEncoder().encode(
        JSON.stringify({ features: [rome], padding: "x".repeat(1_000_001) }),
      );
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(payload.subarray(0, 500_000));
          controller.enqueue(payload.subarray(500_000));
          controller.enqueue(new TextEncoder().encode(" "));
          controller.close();
        },
        cancel,
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(body, {
          headers:
            declaredLength === "missing"
              ? {}
              : {
                  "content-length": declaredLength === "correct" ? String(payload.byteLength) : "1",
                },
        }),
      );
      const service = new PhotonLocationService(fetcher);
      await expect(service.search({ query: "Roma", language: "it" })).rejects.toThrow("large");
      await expect(service.search({ query: "Roma", language: "it" })).rejects.toThrow(
        "unavailable",
      );
      expect(cancel).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(10_000);
      fetcher.mockResolvedValue(Response.json({ features: [rome] }));
      await expect(service.search({ query: "Roma", language: "it" })).resolves.toStrictEqual([
        { label: "Roma, Lazio, Italia" },
      ]);
    },
  );

  it("accepts the byte limit and decodes Unicode split across response chunks", async () => {
    expect.hasAssertions();
    const envelope = { features: [{ properties: { name: "Caffè 日本" } }], padding: "" };
    const encoder = new TextEncoder();
    envelope.padding = "x".repeat(1_000_000 - encoder.encode(JSON.stringify(envelope)).byteLength);
    const payload = encoder.encode(JSON.stringify(envelope));
    const split = payload.indexOf(0xc3) + 1;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(payload.subarray(0, split));
            controller.enqueue(payload.subarray(split));
            controller.close();
          },
        }),
      ),
    );
    await expect(
      new PhotonLocationService(fetcher).search({ query: "Caffè", language: "it" }),
    ).resolves.toStrictEqual([{ label: "Caffè 日本" }]);
  });

  it("extracts validated GeoJSON coordinates while keeping usable labels from malformed points", async () => {
    expect.hasAssertions();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      response([
        { ...rome, geometry: { type: "Point", coordinates: [12.4922, 41.8902] } },
        {
          properties: { name: "Bad latitude" },
          geometry: { type: "Point", coordinates: [12, 100] },
        },
        {
          properties: { name: "Bad longitude" },
          geometry: { type: "Point", coordinates: [200, 41] },
        },
        {
          properties: { name: "Not a point" },
          geometry: { type: "LineString", coordinates: [12, 41] },
        },
      ]),
    );
    await expect(
      new PhotonLocationService(fetcher).search({ query: "Rome", language: "en" }),
    ).resolves.toStrictEqual([
      { label: "Roma, Lazio, Italia", coordinates: { latitude: 41.8902, longitude: 12.4922 } },
      { label: "Bad latitude" },
      { label: "Bad longitude" },
      { label: "Not a point" },
    ]);
  });

  it("uses keyless Photon requests, local names for Italian, and bounded deduplicated labels", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      response([
        rome,
        rome,
        {
          properties: {
            name: "Office",
            street: "Via Roma",
            housenumber: "3",
            postcode: "00100",
            city: "Roma",
            country: "Italia",
          },
        },
        { properties: { name: 123 } },
        {},
        { properties: {} },
      ]),
    );
    const service = new PhotonLocationService(fetcher);
    await expect(service.search({ query: "  Roma & Lazio  ", language: "it" })).resolves.toEqual([
      { label: "Roma, Lazio, Italia" },
      { label: "Office, Via Roma 3, 00100 Roma, Italia" },
    ]);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://photon.komoot.io/api/?q=Roma+%26+Lazio&limit=5");
    expect(options).toMatchObject({
      redirect: "error",
      headers: { Accept: "application/json", "User-Agent": "DefCalendar" },
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("coalesces identical requests, caches results, and refreshes after expiry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response([rome]));
    const service = new PhotonLocationService(fetcher);
    const first = service.search({ query: "Roma", language: "en" });
    expect(service.search({ query: "Roma", language: "en" })).toBe(first);
    await first;
    await service.search({ query: " ROMA ", language: "en" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("lang=en");
    await vi.advanceTimersByTimeAsync(300_001);
    await service.search({ query: "Roma", language: "en" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves Via Anco marzio 73 when only streets are indexed and marks the number unverified", async () => {
    expect.hasAssertions();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        response([
          { properties: { name: "Via Anco Marzio", city: "Milano", country: "Italia" } },
          { properties: { name: "Via Anco Marzio", city: "Napoli", country: "Italia" } },
          { properties: { street: "Via Anco Marzio", housenumber: "74", city: "Roma" } },
          { properties: { street: "Via Roma", housenumber: "73", city: "Roma" } },
        ]),
      );
    const service = new PhotonLocationService(fetcher);
    await expect(
      service.search({ query: "Via Anco marzio 73", language: "it" }),
    ).resolves.toStrictEqual([
      { label: "Via Anco Marzio 73, Milano, Italia", houseNumberVerified: false },
      { label: "Via Anco Marzio 73, Napoli, Italia", houseNumberVerified: false },
    ]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe("/structured");
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({
      street: "Via Anco marzio",
      housenumber: "73",
      limit: "10",
    });
  });

  it("prioritizes verified house numbers, rejects near matches, and deduplicates street fallbacks", async () => {
    expect.hasAssertions();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      response([
        { properties: { name: "Via del Corso", city: "Roma" } },
        {
          properties: {
            name: "Apple",
            street: "Via del Corso",
            housenumber: "184",
            city: "Roma",
          },
        },
        { properties: { street: "Via del Corso", housenumber: "18A", city: "Roma" } },
        { properties: { street: "Via del Corso", housenumber: "18", city: "Roma" } },
      ]),
    );
    const service = new PhotonLocationService(fetcher);
    await expect(
      service.search({ query: "Via del Corso 18, Roma", language: "it" }),
    ).resolves.toStrictEqual([{ label: "Via del Corso 18, Roma", houseNumberVerified: true }]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("city")).toBe("Roma");
  });

  it.each(["Via Roma 73/A, Milano", "Via Roma, 73/A, Milano"])(
    "preserves house-number suffixes in %s",
    async (query) => {
      expect.hasAssertions();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          response([
            { properties: { street: "Via Roma", housenumber: "73 / a", city: "Milano" } },
            { properties: { street: "Via Roma", housenumber: "73", city: "Milano" } },
          ]),
        );
      await expect(
        new PhotonLocationService(fetcher).search({ query, language: "it" }),
      ).resolves.toStrictEqual([{ label: "Via Roma 73/A, Milano", houseNumberVerified: true }]);
      const url = new URL(String(fetcher.mock.calls[0][0]));
      expect(url.searchParams.get("housenumber")).toBe("73/A");
      expect(url.searchParams.get("city")).toBe("Milano");
    },
  );

  it.each(["Studio 54, Roma", "Via XX Settembre", "Piazza 25 Aprile"])(
    "does not interpret names or dates as house numbers: %s",
    async (query) => {
      expect.hasAssertions();
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response([rome]));
      await new PhotonLocationService(fetcher).search({ query, language: "it" });
      const url = new URL(String(fetcher.mock.calls[0][0]));
      expect(url.pathname).toBe("/api/");
      expect(url.searchParams.get("q")).toBe(query);
    },
  );

  it("keeps distinct house numbers in separate cache entries", async () => {
    expect.hasAssertions();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        response([{ properties: { name: "Via Anco Marzio", city: "Milano" } }]),
      );
    const service = new PhotonLocationService(fetcher);
    await service.search({ query: "Via Anco marzio 73", language: "it" });
    const second = service.search({ query: "Via Anco marzio 74", language: "it" });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(second).resolves.toStrictEqual([
      { label: "Via Anco Marzio 74, Milano", houseNumberVerified: false },
    ]);
    await expect(
      service.search({ query: "Via Anco marzio 73", language: "it" }),
    ).resolves.toStrictEqual([{ label: "Via Anco Marzio 73, Milano", houseNumberVerified: false }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("throttles requests and replaces queued searches with the latest query", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response([rome]));
    const service = new PhotonLocationService(fetcher);
    await service.search({ query: "Roma", language: "it" });
    const superseded = service.search({ query: "Milan", language: "it" });
    const latest = service.search({ query: "Milano", language: "it" });
    await expect(superseded).resolves.toEqual([]);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await latest;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("q=Milano");
  });

  it("aborts a superseded in-flight request and does not cache its late response", async () => {
    let resolveFirst!: (value: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementation(async () => response([rome]));
    const service = new PhotonLocationService(fetcher);
    const first = service.search({ query: "Roma", language: "it" });
    const second = service.search({ query: "Milano", language: "it" });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    resolveFirst(response([rome]));
    await expect(first).resolves.toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    await second;
    const again = service.search({ query: "Roma", language: "it" });
    await vi.advanceTimersByTimeAsync(1000);
    await again;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("backs off when Photon throttles requests without caching failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([], 429))
      .mockImplementation(async () => response([rome]));
    const service = new PhotonLocationService(fetcher);
    await expect(service.search({ query: "Roma", language: "it" })).rejects.toThrow("unavailable");
    await expect(service.search({ query: "Roma", language: "it" })).rejects.toThrow("unavailable");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(service.search({ query: "Roma", language: "it" })).resolves.toEqual([
      { label: "Roma, Lazio, Italia" },
    ]);
  });

  it("serves cached locations during a network failure and isolates language caches", async () => {
    expect.hasAssertions();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([rome]))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockImplementation(async () =>
        response([{ properties: { name: "Rome", country: "Italy" } }]),
      );
    const service = new PhotonLocationService(fetcher);
    await service.search({ query: "Roma", language: "it" });
    const failure = service.search({ query: "Milano", language: "it" });
    await Promise.all([
      expect(failure).rejects.toThrow("Offline"),
      vi.advanceTimersByTimeAsync(1000),
    ]);
    await expect(service.search({ query: "Roma", language: "it" })).resolves.toStrictEqual([
      { label: "Roma, Lazio, Italia" },
    ]);
    await expect(service.search({ query: "Roma", language: "en" })).rejects.toThrow("unavailable");
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(service.search({ query: "Roma", language: "en" })).resolves.toStrictEqual([
      { label: "Rome, Italy" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("aborts timed-out requests instead of keeping location suggestions pending", async () => {
    expect.hasAssertions();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("Location request timeout")), milliseconds);
      return controller.signal;
    });
    onTestFinished(() => timeout.mockRestore());
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    const service = new PhotonLocationService(fetcher);
    const pending = service.search({ query: "Roma", language: "it" });
    await Promise.all([
      expect(pending).rejects.toThrow("timeout"),
      vi.advanceTimersByTimeAsync(5000),
    ]);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await expect(service.search({ query: "Roma", language: "it" })).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects invalid queries before contacting the service", () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new PhotonLocationService(fetcher);
    for (const query of ["", "ab", "x".repeat(201)]) {
      expect(() => service.search({ query, language: "it" })).toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("limits suggestions to five and rejects malformed response envelopes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        response(
          Array.from({ length: 10 }, (_, index) => ({ properties: { name: `Place ${index}` } })),
        ),
      );
    const service = new PhotonLocationService(fetcher);
    expect(await service.search({ query: "Place", language: "en" })).toHaveLength(5);
    fetcher.mockImplementation(async () => Response.json({ features: "invalid" }));
    const invalid = service.search({ query: "Other", language: "en" });
    await Promise.all([expect(invalid).rejects.toThrow(), vi.advanceTimersByTimeAsync(1000)]);
  });
});
