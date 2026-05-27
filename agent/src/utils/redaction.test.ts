import { describe, expect, it } from 'vitest';
import { redactForPrompt } from './redaction.js';

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
});
