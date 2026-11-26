import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { build } from "vite";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import electronViteConfig from "../electron.vite.config";
import type GraphCalendarService from "../src/main/graph/calendar-service";

async function compileService(): Promise<string> {
  const main = electronViteConfig.main;
  const bundle = await build({
    ...main,
    configFile: false,
    logLevel: "silent",
    build: {
      ...main?.build,
      ssr: true,
      write: false,
      rollupOptions: {
        ...main?.build?.rollupOptions,
        input: resolve(import.meta.dirname, "../src/main/graph/calendar-service.ts"),
      },
    },
  });
  if (Array.isArray(bundle) || !("output" in bundle)) {
    throw new Error("Expected a single calendar service build");
  }
  const entry = bundle.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
  if (!entry || entry.type !== "chunk") {
    throw new Error("Missing compiled calendar service");
  }
  return entry.code;
}

function createService(
  compiledService: string,
  fetchMock: typeof fetch,
  wait?: (ms: number) => Promise<void>,
): GraphCalendarService {
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  runInNewContext(compiledService, {
    require: (id: string) =>
      id === "node:timers/promises" && wait ? { setTimeout: wait } : require(id),
    module,
    exports: module.exports,
    fetch: fetchMock,
    Buffer,
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  const { default: Service } = module.exports as { default: typeof GraphCalendarService };
  return new Service(
    {
      getAccessTokenForAccount: async () => "test-token",
      getAccountUsername: () => "test@example.com",
    } as never,
    { timeZone: "UTC" } as never,
  );
}

async function abortAfterTurn(controller: AbortController): Promise<void> {
  await setImmediate();
  controller.abort();
}

describe("compiled Graph retries", () => {
  let compiledService = "";
  beforeAll(async () => {
    compiledService = await compileService();
  });

  afterEach(() => vi.useRealTimers());

  it.each([429, 503])("retries HTTP %i successfully in the CommonJS build", async (status) => {
    expect.hasAssertions();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(Response.json({ value: [] }));
    await expect(
      createService(compiledService, fetchMock).listCalendars("account-1"),
    ).resolves.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([429, 503])("stops retrying HTTP %i after three retries", async (status) => {
    expect.hasAssertions();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status, headers: { "Retry-After": "0" } }));
    await expect(
      createService(compiledService, fetchMock).listCalendars("account-1"),
    ).rejects.toMatchObject({
      name: "GraphRequestError",
      status,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([429, 503])("cancels the wait before retrying HTTP %i", async (status) => {
    expect.hasAssertions();
    const controller = new AbortController();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status, headers: { "Retry-After": "60" } }));
    const pending = createService(compiledService, fetchMock).searchPeople(
      "account-1",
      "alice",
      5,
      controller.signal,
    );
    await Promise.all([
      expect(pending).rejects.toMatchObject({ name: "AbortError" }),
      abortAfterTurn(controller),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([429, 503])(
    "does not retry HTTP %i early when Retry-After exceeds the timer limit",
    async (status) => {
      expect.hasAssertions();
      const controller = new AbortController();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(null, { status, headers: { "Retry-After": "2147484" } }),
        )
        .mockResolvedValueOnce(Response.json({ value: [] }));
      const pending = createService(compiledService, fetchMock).searchPeople(
        "account-1",
        "alice",
        5,
        controller.signal,
      );
      await Promise.all([
        expect(pending).rejects.toMatchObject({ name: "AbortError" }),
        (async () => {
          await delay(20);
          controller.abort();
        })(),
      ]);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { retryAfter: "2147484", waitMs: 2_147_484_000 },
    { retryAfter: null, waitMs: 1500 },
    { retryAfter: "invalid", waitMs: 1500 },
    { retryAfter: "-1", waitMs: 1500 },
    { retryAfter: "9".repeat(400), waitMs: 1500 },
  ])(
    "waits $waitMs ms before retrying with Retry-After $retryAfter",
    async ({ retryAfter, waitMs }) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 503,
            headers: retryAfter === null ? {} : { "Retry-After": retryAfter },
          }),
        )
        .mockResolvedValueOnce(Response.json({ value: [] }));

      const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const pending = createService(compiledService, fetchMock, wait).listCalendars("account-1");
      await setImmediate();
      await vi.advanceTimersByTimeAsync(waitMs - 1);
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await expect(pending).resolves.toEqual([]);
    },
  );
});
