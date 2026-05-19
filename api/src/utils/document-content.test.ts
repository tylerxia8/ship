/**
 * Tests for document-content helpers.
 *
 * These helpers drive whether a weekly plan / retro is treated as "done" by
 * the accountability heatmap on the team-status page. A regression here is
 * directly user-visible (a docked plan would suddenly show as missing, or
 * vice versa) and the existing test suite had no coverage of either
 * function — the entire team-status badge logic depended on them with no
 * safety net.
 */
import { describe, it, expect } from 'vitest';
import { extractText, hasContent, TEMPLATE_HEADINGS } from './document-content.js';

describe('extractText', () => {
  it('returns text from a leaf text node', () => {
    // Mirrors what TipTap emits for a single text span. If this stops
    // returning the text content, every downstream "has the user written
    // anything?" check breaks.
    expect(extractText({ type: 'text', text: 'hello' })).toBe('hello');
  });

  it('recursively concatenates nested content', () => {
    // The real TipTap doc shape: doc → paragraph → text. Regression here
    // means hasContent() under-reports content on every multi-line doc,
    // which would flip the team-status heatmap to "missing" en masse.
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first ' }, { type: 'text', text: 'line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second line' }] },
      ],
    };
    expect(extractText(doc)).toBe('first linesecond line');
  });

  it('returns empty string for null, undefined, non-object, or shapeless input', () => {
    // The function takes `unknown` — any of these can hit it via the JSONB
    // round-trip from Postgres. It must NEVER throw, because the
    // accountability service walks all documents in a workspace.
    expect(extractText(null)).toBe('');
    expect(extractText(undefined)).toBe('');
    expect(extractText('a string, not a node')).toBe('');
    expect(extractText(42)).toBe('');
    expect(extractText({})).toBe('');
    expect(extractText({ type: 'paragraph' })).toBe(''); // content array missing
    expect(extractText({ type: 'paragraph', content: 'not-an-array' })).toBe('');
  });
});

describe('hasContent', () => {
  it('returns false for empty / shapeless docs', () => {
    // Defensive baseline — any of these can reach hasContent via the
    // heatmap's "is this doc done?" path.
    expect(hasContent(null)).toBe(false);
    expect(hasContent(undefined)).toBe(false);
    expect(hasContent({})).toBe(false);
    expect(hasContent({ type: 'doc', content: [] })).toBe(false);
  });

  it('returns false when the doc only contains template headings', () => {
    // This is the load-bearing case. A user opens a fresh weekly plan,
    // sees the scaffold headings, closes the page — the heatmap must NOT
    // mark this as "done" just because text exists. Regressing this
    // sends overdue plans silently green on the team-status page.
    const docWithOnlyTemplate = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: TEMPLATE_HEADINGS[0]! }] },
        { type: 'heading', content: [{ type: 'text', text: TEMPLATE_HEADINGS[1]! }] },
        { type: 'heading', content: [{ type: 'text', text: TEMPLATE_HEADINGS[2]! }] },
      ],
    };
    expect(hasContent(docWithOnlyTemplate)).toBe(false);
  });

  it('returns true when the doc contains real content beyond template headings', () => {
    // The complement of the case above. Real plan content under the
    // scaffold headings must register as "done".
    const docWithRealContent = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: TEMPLATE_HEADINGS[0]! }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ship the audit deliverable.' }] },
      ],
    };
    expect(hasContent(docWithRealContent)).toBe(true);
  });

  it('returns true for a plain non-template paragraph (no headings at all)', () => {
    // Sanity check: if there's no scaffold, the template-stripping logic
    // shouldn't accidentally strip useful content.
    const plainDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Just a note.' }] },
      ],
    };
    expect(hasContent(plainDoc)).toBe(true);
  });
});
