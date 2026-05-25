import type { TokenCacheContext } from "@azure/msal-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SafeStorageTokenCache from "../src/main/auth/cache-plugin";

const { existsSyncMock, readFileSyncMock, writeFileSyncMock, mkdirSyncMock, rmSyncMock } =
  vi.hoisted(() => ({
    existsSyncMock: vi.fn(),
    mkdirSyncMock: vi.fn(),
    readFileSyncMock: vi.fn(),
    rmSyncMock: vi.fn(),
    writeFileSyncMock: vi.fn(),
  }));

const { isEncryptionAvailableMock, encryptStringMock, decryptStringMock } = vi.hoisted(() => ({
  decryptStringMock: vi.fn(),
  encryptStringMock: vi.fn(),
  isEncryptionAvailableMock: vi.fn(),
}));

vi.mock(import("fs-extra"), () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    readFileSync: readFileSyncMock,
    rmSync: rmSyncMock,
    writeFileSync: writeFileSyncMock,
  },
}));

vi.mock(import("electron"), () => ({
  safeStorage: {
    decryptString: decryptStringMock,
    encryptString: encryptStringMock,
    isEncryptionAvailable: isEncryptionAvailableMock,
  },
}));

const CACHE_PATH = "/tmp/defcalendar/cache.bin";

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
  existsSyncMock.mockReset();
  readFileSyncMock.mockReset();
  writeFileSyncMock.mockReset();
  mkdirSyncMock.mockReset();
  rmSyncMock.mockReset();
  isEncryptionAvailableMock.mockReset();
  encryptStringMock.mockReset();
  decryptStringMock.mockReset();
});

describe("safeStorageTokenCache.beforeCacheAccess", () => {
  it("does nothing when cache file is missing", async () => {
    existsSyncMock.mockReturnValue(false);
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext();

    await plugin.beforeCacheAccess(ctx);

    expect(readFileSyncMock).not.toHaveBeenCalled();
    expect(ctx.tokenCache.deserialize).not.toHaveBeenCalled();
  });

  it("does nothing when cache file is empty", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(Buffer.alloc(0));
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext();

    await plugin.beforeCacheAccess(ctx);

    expect(ctx.tokenCache.deserialize).not.toHaveBeenCalled();
  });

  it("decrypts an encrypted payload before deserializing", async () => {
    existsSyncMock.mockReturnValue(true);
    const encryptedBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    readFileSyncMock.mockReturnValue(Buffer.concat([Buffer.from("enc:", "utf8"), encryptedBytes]));
    decryptStringMock.mockReturnValue('{"plaintext": true}');
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext();

    await plugin.beforeCacheAccess(ctx);

    expect(decryptStringMock).toHaveBeenCalledOnce();
    const passed = decryptStringMock.mock.calls[0]?.[0] as Buffer;
    expect(passed.equals(encryptedBytes)).toBe(true);
    expect(ctx.tokenCache.deserialize).toHaveBeenCalledWith('{"plaintext": true}');
  });

  it("strips the plain prefix and feeds the body to deserialize", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(Buffer.from('plain:{"plain": true}', "utf8"));
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext();

    await plugin.beforeCacheAccess(ctx);

    expect(decryptStringMock).not.toHaveBeenCalled();
    expect(ctx.tokenCache.deserialize).toHaveBeenCalledWith('{"plain": true}');
  });

  it("treats unprefixed legacy payloads as plain text", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(Buffer.from('{"legacy": true}', "utf8"));
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext();

    await plugin.beforeCacheAccess(ctx);

    expect(decryptStringMock).not.toHaveBeenCalled();
    expect(ctx.tokenCache.deserialize).toHaveBeenCalledWith('{"legacy": true}');
  });
});

describe("safeStorageTokenCache.afterCacheAccess", () => {
  it("does not write when cacheHasChanged is false", async () => {
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext({ cacheHasChanged: false });

    await plugin.afterCacheAccess(ctx);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  it("writes encrypted payload prefixed with enc: when encryption is available", async () => {
    isEncryptionAvailableMock.mockReturnValue(true);
    const cipher = Buffer.from([0x01, 0x02, 0x03]);
    encryptStringMock.mockReturnValue(cipher);
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext({
      cacheHasChanged: true,
      serializeReturn: '{"token": "secret"}',
    });

    await plugin.afterCacheAccess(ctx);

    expect(encryptStringMock).toHaveBeenCalledWith('{"token": "secret"}');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
    const written = writeFileSyncMock.mock.calls[0]?.[1] as Buffer;
    expect(written.subarray(0, 4).equals(Buffer.from("enc:", "utf8"))).toBe(true);
    expect(written.subarray(4).equals(cipher)).toBe(true);
  });

  it("writes plain prefix when encryption is unavailable", async () => {
    isEncryptionAvailableMock.mockReturnValue(false);
    const plugin = new SafeStorageTokenCache(CACHE_PATH).createPlugin();
    const ctx = createTokenCacheContext({
      cacheHasChanged: true,
      serializeReturn: '{"token": "fallback"}',
    });

    await plugin.afterCacheAccess(ctx);

    expect(encryptStringMock).not.toHaveBeenCalled();
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
    const written = writeFileSyncMock.mock.calls[0]?.[1] as Buffer;
    expect(written.toString("utf8")).toBe('plain:{"token": "fallback"}');
  });
});

describe("safeStorageTokenCache.clear", () => {
  it("removes the cache file when it exists", () => {
    existsSyncMock.mockReturnValue(true);
    const cache = new SafeStorageTokenCache(CACHE_PATH);

    cache.clear();

    expect(rmSyncMock).toHaveBeenCalledWith(CACHE_PATH, { force: true });
  });

  it("is a no-op when the cache file is missing", () => {
    existsSyncMock.mockReturnValue(false);
    const cache = new SafeStorageTokenCache(CACHE_PATH);

    cache.clear();

    expect(rmSyncMock).not.toHaveBeenCalled();
  });
});
