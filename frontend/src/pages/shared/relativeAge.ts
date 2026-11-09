/**
 * How old a finding's numbers are — pure, so the boundaries are testable.
 *
 * A number without "as of when" is half a truth: the tile stores `ran_at`, and this turns it into a
 * bucket the UI can localize. It deliberately says **when we computed it**, never "the data has not
 * changed" — nothing here can know that (a source table is written outside this system; knowing it
 * would need a declared watermark, e.g. `max(trade_date)`, which is a follow-up, not a guess).
 */

export type AgeBucket = 'just_now' | 'minutes' | 'hours' | 'days';

export interface Age {
  bucket: AgeBucket;
  /** 0 for `just_now`; otherwise the count for the bucket. */
  count: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Under a minute reads as "just now", and a clock skew must not read as the future. */
const JUST_NOW = MINUTE;

/**
 * The i18n key for a bucket.
 *
 * Here, not at the call sites, because a built key escapes the static i18n check: the label looked up
 * `age_minutes` while the locale had `ageMinutes`, i18next rendered the key itself, and two pages
 * showed `dataInsights.age_days` instead of "3 days ago". One place to name it means one place to test.
 */
export function ageKey(bucket: AgeBucket): string {
  return bucket === 'just_now' ? 'shared.age_just_now' : `shared.age_${bucket}`;
}

export function ageOf(ranAt: string | null | undefined, now: number = Date.now()): Age | null {
  if (!ranAt) return null;
  const ran = Date.parse(ranAt);
  if (Number.isNaN(ran)) return null;
  const elapsed = now - ran;
  if (elapsed < JUST_NOW) return { bucket: 'just_now', count: 0 };
  if (elapsed < HOUR) return { bucket: 'minutes', count: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { bucket: 'hours', count: Math.floor(elapsed / HOUR) };
  return { bucket: 'days', count: Math.floor(elapsed / DAY) };
}

/** The absolute time for the tooltip — the reader decides if that is "old", not us. */
export function absoluteTime(ranAt: string | null | undefined): string {
  if (!ranAt) return '';
  const parsed = Date.parse(ranAt);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toLocaleString();
}
