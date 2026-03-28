import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import { dirname } from 'pathe';
import fs from 'fs-extra';
import { safeStorage } from 'electron';

const ENCRYPTED_PREFIX = 'enc:';
const PLAIN_PREFIX = 'plain:';

class SafeStorageTokenCache {
  private readonly cachePath: string;

  constructor(cachePath: string) {
    this.cachePath = cachePath;
  }

  createPlugin(): ICachePlugin {
    return {
      beforeCacheAccess: async (cacheContext: TokenCacheContext) => {
        if (!fs.existsSync(this.cachePath)) {
          return;
        }

        const payload = fs.readFileSync(this.cachePath);
        if (!payload.length) {
          return;
        }

        cacheContext.tokenCache.deserialize(this.unwrap(payload));
      },
      afterCacheAccess: async (cacheContext: TokenCacheContext) => {
        if (!cacheContext.cacheHasChanged) {
          return;
        }

        fs.mkdirSync(dirname(this.cachePath), { recursive: true });
        fs.writeFileSync(this.cachePath, this.wrap(cacheContext.tokenCache.serialize()));
      },
    };
  }

  clear(): void {
    if (fs.existsSync(this.cachePath)) {
      fs.rmSync(this.cachePath, { force: true });
    }
  }

  private wrap(value: string): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
      return Buffer.concat([Buffer.from(ENCRYPTED_PREFIX, 'utf8'), safeStorage.encryptString(value)]);
    }

    return Buffer.from(`${PLAIN_PREFIX}${value}`, 'utf8');
  }

  private unwrap(payload: Buffer): string {
    const encryptedPrefix = Buffer.from(ENCRYPTED_PREFIX, 'utf8');
    if (payload.subarray(0, encryptedPrefix.length).equals(encryptedPrefix)) {
      return safeStorage.decryptString(payload.subarray(encryptedPrefix.length));
    }

    const plain = payload.toString('utf8');
    if (plain.startsWith(PLAIN_PREFIX)) {
      return plain.slice(PLAIN_PREFIX.length);
    }

    return plain;
  }
}

export default SafeStorageTokenCache;
