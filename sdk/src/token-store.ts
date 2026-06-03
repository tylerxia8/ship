import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ITokenStore, OAuthTokenResponse } from './types.js';

export class InMemoryTokenStore implements ITokenStore {
  private tokens: OAuthTokenResponse | null = null;

  get(): OAuthTokenResponse | null {
    return this.tokens;
  }

  set(tokens: OAuthTokenResponse): void {
    this.tokens = tokens;
  }

  clear(): void {
    this.tokens = null;
  }
}

export class FileTokenStore implements ITokenStore {
  constructor(private readonly path: string) {}

  async get(): Promise<OAuthTokenResponse | null> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as OAuthTokenResponse;
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async set(tokens: OAuthTokenResponse): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

export class BrowserLocalStorageTokenStore implements ITokenStore {
  constructor(
    private readonly key = 'ship.oauth.tokens',
    private readonly storage: Storage = globalThis.localStorage,
  ) {}

  get(): OAuthTokenResponse | null {
    const value = this.storage.getItem(this.key);
    return value ? JSON.parse(value) as OAuthTokenResponse : null;
  }

  set(tokens: OAuthTokenResponse): void {
    this.storage.setItem(this.key, JSON.stringify(tokens));
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}
