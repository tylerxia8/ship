/**
 * Redacts obvious secrets before Ship data is included in LLM prompts.
 *
 * This is intentionally conservative and deterministic: it catches common
 * token/key shapes and sensitive property names without trying to classify
 * every possible project-specific confidential value.
 */

export function redactForPrompt(value: string): string;
export function redactForPrompt<T>(value: T): T;
export function redactForPrompt(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecretText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForPrompt(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? '[redacted]' : redactForPrompt(item),
      ]),
    );
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  return /(?:api[_-]?key|token|secret|password|passwd|session|cookie|authorization|bearer)/i.test(key);
}

function redactSecretText(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|ant|claude|ship|ghp|github_pat)[_-][A-Za-z0-9._-]{16,}\b/gi, '[redacted secret]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted token]')
    .replace(
      /\b(api[_-]?key|token|secret|password|passwd|session|cookie|authorization)\b\s*[:=]\s*["']?[^"'\s,;}{]{8,}["']?/gi,
      '$1=[redacted]',
    );
}
