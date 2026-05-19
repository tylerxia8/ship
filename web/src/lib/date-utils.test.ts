/**
 * Tests for shared date-utils.
 *
 * These three helpers render in highly visible UI: every comment timestamp,
 * every standup feed entry, every week range in the sidebar. A regression
 * (negative diffs, wrong day-of-month, off-by-one across month boundaries)
 * is immediately user-visible. The audit found no existing tests covering
 * any of them.
 *
 * Uses vi.useFakeTimers() to pin "now" so relative-time assertions don't
 * flake. Each test documents what regression it catches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime, formatDate, formatDateRange } from './date-utils';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Pin "now" to a deterministic instant so the bucket boundaries are
    // crystal clear. Any test that fails here is a real bug, not a clock skew.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps in the last minute', () => {
    // Regression: if this returned "0m ago" or "-1m ago" the comment feed
    // would display nonsense for the most-common case (a comment you just
    // posted).
    const tenSecondsAgo = new Date('2026-05-18T11:59:50Z').toISOString();
    expect(formatRelativeTime(tenSecondsAgo)).toBe('just now');
  });

  it('returns "Xm ago" / "Xh ago" for sub-day, sub-week intervals', () => {
    // Regression: an off-by-one on the bucket boundaries (e.g. switching
    // to "1h ago" at the 59-minute mark) would make every conversation
    // timeline look jumpy and untrustworthy.
    expect(formatRelativeTime(new Date('2026-05-18T11:55:00Z').toISOString())).toBe('5m ago');
    expect(formatRelativeTime(new Date('2026-05-18T09:00:00Z').toISOString())).toBe('3h ago');
    expect(formatRelativeTime(new Date('2026-05-16T12:00:00Z').toISOString())).toBe('2d ago');
  });

  it('falls back to localeDateString for timestamps a week or older', () => {
    // Regression: if the comparison flipped (≥7 days returning "Xd ago"
    // forever), every comment thread older than a week would show
    // "1095d ago" instead of a real date.
    const tenDaysAgo = new Date('2026-05-08T12:00:00Z').toISOString();
    const result = formatRelativeTime(tenDaysAgo);
    expect(result).not.toMatch(/ago/);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatDate (capitalized "Just now")', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns "Unknown date" for null input rather than crashing', () => {
    // Regression: this is called on document.updated_at values that can
    // be null when a document hasn't been saved yet. A crash would blank
    // the sidebar.
    expect(formatDate(null)).toBe('Unknown date');
  });

  it('uses capitalized "Just now" (vs. formatRelativeTime\'s lowercase)', () => {
    // The two helpers exist on purpose — formatDate is used in card titles
    // (capital), formatRelativeTime in inline timestamps (lowercase). A
    // refactor that collapsed them would visually regress one place or
    // the other. Pin the contract here.
    const now = new Date('2026-05-18T11:59:50Z').toISOString();
    expect(formatDate(now)).toBe('Just now');
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('renders "Mon D" for dates older than a week', () => {
    // Regression: the audit found a recent commit (838375e) touched USWDS
    // icon a11y; a follow-up touch to this format could quietly switch to
    // "Wed, May 8" or similar, ruining narrow-column layouts. Lock the
    // format here.
    const result = formatDate(new Date('2026-05-08T12:00:00Z').toISOString());
    // "May 8" — short month + numeric day.
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('formatDateRange', () => {
  it('renders a same-month range compactly: "Jan 6-12"', () => {
    // Used in the week-window header. A regression to "Jan 6 - Jan 12"
    // would push the week selector into a second line on narrow viewports.
    expect(formatDateRange('2026-01-06', '2026-01-12')).toBe('Jan 6-12');
  });

  it('renders a cross-month range with both month names: "Jan 30 - Feb 5"', () => {
    // The boundary case the same-month shortcut must NOT take.
    expect(formatDateRange('2026-01-30', '2026-02-05')).toBe('Jan 30 - Feb 5');
  });

  it('handles ISO strings in UTC (avoids local-tz off-by-one)', () => {
    // Sprint start_date is stored as a YYYY-MM-DD string. JS Date()
    // interprets bare ISO dates as UTC midnight, but local timezones can
    // pull the "displayed" day back by one. The helper passes timeZone:
    // 'UTC' for string inputs; this test pins that behaviour.
    // "2026-03-01" should display as March 1 regardless of test runner TZ.
    const result = formatDateRange('2026-03-01', '2026-03-07');
    expect(result).toBe('Mar 1-7');
  });
});
