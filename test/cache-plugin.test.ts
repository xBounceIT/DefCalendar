import type { TokenCacheContext } from "@azure/msal-node";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SafeStorageTokenCache from "../src/main/auth/cache-plugin";

const { isEncryptionAvailableMock, encryptStringMock, decryptStringMock } = vi.hoisted(() => ({
  decryptStringMock: vi.fn(),
  encryptStringMock: vi.fn(),
  isEncryptionAvailableMock: vi.fn(),
}));

vi.mock("electron", () => ({
  safeStorage: {
    decryptString: decryptStringMock,
    encryptString: encryptStringMock,
    isEncryptionAvailable: isEncryptionAvailableMock,
  },
}));

let directory: string;
let cachePath: string;

function createTokenCacheContext(overrides?: {
  cacheHasChanged?: boolean;
  serializeReturn?: string;
}): TokenCacheContext {
  return {
    cacheHasChanged: overrides?.cacheHasChanged ?? false,
    tokenCache: {
      deserialize: vi.fn(),
      serialize: vi.fn().mockReturnValue(overrides?.serializeReturn ?? "{}"),
    },
  } as unknown as TokenCacheContext;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "defcalendar-cache-"));
  cachePath = join(directory, "cache.bin");
  vi.resetAllMocks();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("safeStorageTokenCache.beforeCacheAccess", () => {
  it.each(["missing", "empty"])("preserves the in-memory cache for a %s file", async (state) => {
    if (state === "empty") {
      writeFileSync(cachePath, "");
    }
    const ctx = createTokenCacheContext();
    await new SafeStorageTokenCache(cachePath).createPlugin().beforeCacheAccess(ctx);
    expect(ctx.tokenCache.deserialize).not.toHaveBeenCalled();
  });

  it("restores an encrypted payload", async () => {
    const cipher = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    writeFileSync(cachePath, Buffer.concat([Buffer.from("enc:"), cipher]));
    decryptStringMock.mockReturnValue('{"plaintext":true}');
    const ctx = createTokenCacheContext();

    await new SafeStorageTokenCache(cachePath).createPlugin().beforeCacheAccess(ctx);

    expect(decryptStringMock).toHaveBeenCalledWith(cipher);
    expect(ctx.tokenCache.deserialize).toHaveBeenCalledWith('{"plaintext":true}');
  });

  it.each(['plain:{"plain":true}', '{"plain":true}'])(
    "reads the saved plaintext format %s",
    async (stored) => {
      writeFileSync(cachePath, stored);
      const ctx = createTokenCacheContext();
      await new SafeStorageTokenCache(cachePath).createPlugin().beforeCacheAccess(ctx);
      expect(ctx.tokenCache.deserialize).toHaveBeenCalledWith('{"plain":true}');
    },
  );
});

describe("safeStorageTokenCache.afterCacheAccess", () => {
  it("preserves the saved cache when MSAL reports no change", async () => {
    writeFileSync(cachePath, "existing cache");
    const ctx = createTokenCacheContext({ cacheHasChanged: false });
    await new SafeStorageTokenCache(cachePath).createPlugin().afterCacheAccess(ctx);
    expect(readFileSync(cachePath, "utf8")).toBe("existing cache");
  });

  it("writes a prefixed encrypted file in a new cache directory", async () => {
    const path = join(directory, "account", "cache.bin");
    const cipher = Buffer.from([1, 2, 3]);
    isEncryptionAvailableMock.mockReturnValue(true);
    encryptStringMock.mockReturnValue(cipher);
    const ctx = createTokenCacheContext({
      cacheHasChanged: true,
      serializeReturn: '{"token":"secret"}',
    });

    await new SafeStorageTokenCache(path).createPlugin().afterCacheAccess(ctx);

    expect(encryptStringMock).toHaveBeenCalledWith('{"token":"secret"}');
    expect(readFileSync(path)).toEqual(Buffer.concat([Buffer.from("enc:"), cipher]));
  });

  it("writes the plaintext format when encryption is unavailable", async () => {
    isEncryptionAvailableMock.mockReturnValue(false);
    const ctx = createTokenCacheContext({
      cacheHasChanged: true,
      serializeReturn: '{"token":"fallback"}',
    });
    await new SafeStorageTokenCache(cachePath).createPlugin().afterCacheAccess(ctx);
    expect(readFileSync(cachePath, "utf8")).toBe('plain:{"token":"fallback"}');
  });
});
