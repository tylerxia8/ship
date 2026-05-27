import { describe, expect, it } from 'vitest';
import { redactForPrompt, safePromptJson, safePromptText } from './redaction.js';

describe('redactForPrompt', () => {
  it('redacts common secret text patterns in strings', () => {
    const redacted = redactForPrompt(
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz and api_key=sk-ant-abcdefghijklmnopqrstuvwxyz',
    );

    expect(redacted).toContain('Bearer [redacted]');
    expect(redacted).toContain('api_key=[redacted]');
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('redacts sensitive object keys recursively while keeping safe project data', () => {
    const redacted = redactForPrompt({
      state: 'blocked',
      nested: {
        sessionCookie: 'ship_session=do-not-leak',
        note: 'Needs procurement review',
      },
      actions: [{ token: 'ship_12345678901234567890', title: 'Escalate blocker' }],
    });

    expect(redacted).toEqual({
      state: 'blocked',
      nested: {
        sessionCookie: '[redacted]',
        note: 'Needs procurement review',
      },
      actions: [{ token: '[redacted]', title: 'Escalate blocker' }],
    });
  });

  it('bounds long prompt text after redaction', () => {
    const bounded = safePromptText(`token=ship_12345678901234567890 ${'x'.repeat(100)}`, 20);

    expect(bounded).toBe('token=[redacted] xxx...[truncated 97 chars]');
    expect(bounded).not.toContain('ship_12345678901234567890');
  });

  it('bounds serialized prompt JSON', () => {
    const bounded = safePromptJson({ title: 'Status', content: 'a'.repeat(80) }, 40);

    expect(bounded).toBe('{"title":"Status","content":"aaaaaaaaaaa...[truncated 71 chars]');
  });
});
