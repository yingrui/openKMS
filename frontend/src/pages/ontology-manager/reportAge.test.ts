import { describe, expect, it } from 'vitest';
import { absoluteTime, ageOf } from './reportAge';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('ageOf', () => {
  it('buckets the elapsed time at the boundaries', () => {
    expect(ageOf(ago(0), NOW)).toEqual({ bucket: 'just_now', count: 0 });
    expect(ageOf(ago(59_000), NOW)).toEqual({ bucket: 'just_now', count: 0 });
    expect(ageOf(ago(MINUTE), NOW)).toEqual({ bucket: 'minutes', count: 1 });
    expect(ageOf(ago(59 * MINUTE), NOW)).toEqual({ bucket: 'minutes', count: 59 });
    expect(ageOf(ago(HOUR), NOW)).toEqual({ bucket: 'hours', count: 1 });
    expect(ageOf(ago(23 * HOUR), NOW)).toEqual({ bucket: 'hours', count: 23 });
    expect(ageOf(ago(DAY), NOW)).toEqual({ bucket: 'days', count: 1 });
    expect(ageOf(ago(30 * DAY), NOW)).toEqual({ bucket: 'days', count: 30 });
  });

  it('treats a clock skew as just now, and nothing at all as nothing', () => {
    expect(ageOf(new Date(NOW + 5 * MINUTE).toISOString(), NOW)).toEqual({ bucket: 'just_now', count: 0 });
    expect(ageOf(null, NOW)).toBeNull();
    expect(ageOf(undefined, NOW)).toBeNull();
    expect(ageOf('not a date', NOW)).toBeNull();
  });
});

describe('absoluteTime', () => {
  it('renders the instant, and nothing for a missing one', () => {
    expect(absoluteTime('2026-10-16T12:00:00Z')).toMatch(/2026/);
    expect(absoluteTime(null)).toBe('');
    expect(absoluteTime('nope')).toBe('');
  });
});
