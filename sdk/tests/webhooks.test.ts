import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyWebhook } from '../src/webhooks.js';

function signedHeader(rawBody: string, secret: string, timestamp: number): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('verifyWebhook', () => {
  const secret = 'ship_whsec_sdk_test';
  const timestamp = 1_715_985_600;
  const rawBody = JSON.stringify({ type: 'document.created', data: { id: 'doc_123' } });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for a valid Ship-Signature header in one call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp * 1000));

    expect(verifyWebhook(
      { 'Ship-Signature': signedHeader(rawBody, secret, timestamp) },
      rawBody,
      secret,
    )).toBe(true);
  });

  it('returns false for a tampered body', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp * 1000));

    expect(verifyWebhook(
      { 'Ship-Signature': signedHeader(rawBody, secret, timestamp) },
      rawBody.replace('doc_123', 'doc_999'),
      secret,
    )).toBe(false);
  });

  it('returns false for an expired timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date((timestamp + 301) * 1000));

    expect(verifyWebhook(
      { 'Ship-Signature': signedHeader(rawBody, secret, timestamp) },
      rawBody,
      secret,
    )).toBe(false);
  });

  it('returns false when the v1 signature is missing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp * 1000));

    expect(verifyWebhook(
      { 'Ship-Signature': `t=${timestamp}` },
      rawBody,
      secret,
    )).toBe(false);
  });
});
