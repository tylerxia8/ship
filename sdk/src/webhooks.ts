import crypto from 'node:crypto';

export function verifyWebhook(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  secret: string,
  toleranceSec = 300,
): boolean {
  const signatureHeader = headers['ship-signature'] ?? headers['Ship-Signature'];
  const value = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!value) return false;

  const parts = Object.fromEntries(value.split(',').map((part) => {
    const [key, val] = part.split('=');
    return [key, val];
  }));

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSec) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
