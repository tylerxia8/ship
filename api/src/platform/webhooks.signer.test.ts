import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signWebhookPayload } from './crypto.js';

function verifiesSignedPayload(
  signatureHeader: string,
  rawBody: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(signatureHeader.split(',').map((part) => {
    const [key, value] = part.split('=');
    return [key, value];
  }));

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

describe('webhook signer focused suite', () => {
  const secret = 'ship_whsec_unit_secret';
  const timestamp = 1_715_985_600;
  const rawBody = JSON.stringify({
    type: 'document.created',
    data: { id: 'doc_123', title: 'hello' },
  });

  it('positive: emits a timestamped HMAC signature that verifies', () => {
    const header = signWebhookPayload(rawBody, secret, timestamp);

    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(verifiesSignedPayload(header, rawBody, secret, timestamp)).toBe(true);
  });

  it('negative: rejects a signature when verified with the wrong secret', () => {
    const header = signWebhookPayload(rawBody, secret, timestamp);

    expect(verifiesSignedPayload(header, rawBody, 'ship_whsec_wrong_secret', timestamp)).toBe(false);
  });

  it('replay: rejects a valid signature outside the replay tolerance window', () => {
    const header = signWebhookPayload(rawBody, secret, timestamp);

    expect(verifiesSignedPayload(header, rawBody, secret, timestamp + 301)).toBe(false);
  });

  it('tamper: rejects a signed delivery if the raw body changes', () => {
    const header = signWebhookPayload(rawBody, secret, timestamp);
    const tamperedBody = rawBody.replace('hello', 'goodbye');

    expect(verifiesSignedPayload(header, tamperedBody, secret, timestamp)).toBe(false);
  });
});
