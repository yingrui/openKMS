import { describe, expect, it } from 'vitest';
import en from '../../i18n/locales/en/ontology.json';
import zh from '../../i18n/locales/zh-CN/ontology.json';
import { absoluteTime, ageKey, ageOf } from './reportAge';

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

/**
 * Every bucket the UI can render has to exist in **both** locales.
 *
 * A built key escapes the static i18n check, and a check that only looks at static prefixes cannot see
 * a *partial* mismatch (one plural form renamed, the rest intact). This test can, because `ageKey` is
 * the single place that names these keys.
 */
describe('ageKey', () => {
  const locales = { en, 'zh-CN': zh };
  // `just_now` is uncounted; the others are pluralized per i18next (`_one` / `_other`).
  const required: Record<string, string[]> = {
    just_now: ['shared.age_just_now'],
    minutes: ['shared.age_minutes_one', 'shared.age_minutes_other'],
    hours: ['shared.age_hours_one', 'shared.age_hours_other'],
    days: ['shared.age_days_one', 'shared.age_days_other'],
  };
  const lookup = (tree: unknown, key: string) =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree);

  it.each(['en', 'zh-CN'] as const)('names a key that exists for every bucket (%s)', (locale) => {
    for (const [bucket, keys] of Object.entries(required)) {
      expect(ageKey(bucket as Parameters<typeof ageKey>[0])).toBe(
        bucket === 'just_now' ? 'shared.age_just_now' : `shared.age_${bucket}`,
      );
      for (const key of keys) {
        expect(lookup(locales[locale], key), `${locale}: ${key}`).toEqual(expect.any(String));
      }
    }
  });
});
