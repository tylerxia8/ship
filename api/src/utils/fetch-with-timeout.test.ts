import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchTimeoutError, fetchWithTimeout, parseTimeoutMs } from './fetch-with-timeout.js';

describe('fetch-with-timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('parses positive timeout values and falls back for invalid values', () => {
    expect(parseTimeoutMs('1500', 25_000)).toBe(1500);
    expect(parseTimeoutMs('0', 25_000)).toBe(25_000);
    expect(parseTimeoutMs('-5', 25_000)).toBe(25_000);
    expect(parseTimeoutMs('not-a-number', 25_000)).toBe(25_000);
    expect(parseTimeoutMs(undefined, 25_000)).toBe(25_000);
  });

  it('aborts slow fetches with a timeout-specific error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    );

    const request = fetchWithTimeout('https://example.test/slow', {}, 50);
    const assertion = expect(request).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(50);

    await assertion;
  });
});
