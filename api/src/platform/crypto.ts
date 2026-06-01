import crypto from 'crypto';

const SECRET_PREFIX = 'ship_sk_';
const CLIENT_PREFIX = 'ship_app_';
const TOKEN_PREFIX = 'ship_at_';

export function generateClientId(): string {
  return `${CLIENT_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
}

export function generateClientSecret(): string {
  return `${SECRET_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function generateAccessToken(): string {
  return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashSecret(secret: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const [scheme, salt, expected] = storedHash.split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(secret, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}
