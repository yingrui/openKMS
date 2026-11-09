/**
 * Periods for a filter — pure, because the month and year boundaries are where this goes wrong.
 *
 * A date filter is two ISO days (`yyyy-mm-dd`) in the row's `value` / `value2`, which the shared
 * filter vocabulary already turns into `between` / `>=` / `<=`. What a person actually thinks in is
 * "last month", so the quick ranges are computed here, from a date the caller passes (never from
 * `new Date()` inside — that is how a test at midnight on the 1st starts failing).
 */

export interface DateRange {
  /** ISO `yyyy-mm-dd`; `''` means "open on that side". */
  from: string;
  to: string;
}

export type QuickRangeId = 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear';

export const QUICK_RANGE_IDS: QuickRangeId[] = [
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
];

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Days between two instants, ignoring the clock (a DST switch must not shift the count). */
function daysBack(today: Date, days: number): Date {
  const copy = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

/** A quick range, inclusive on both ends, from a reference day. */
export function quickRange(id: QuickRangeId, today: Date): DateRange {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (id) {
    case 'last7':
      return { from: iso(daysBack(today, 6)), to: iso(today) };
    case 'last30':
      return { from: iso(daysBack(today, 29)), to: iso(today) };
    case 'thisMonth':
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) };
    case 'lastMonth':
      // The month before this one, whole: the 1st to the last day. `Date.UTC(y, m, 0)` is that
      // last day, which is why this works in January and in a leap February.
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case 'thisYear':
      return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(today) };
    case 'lastYear':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(text: string): boolean {
  if (!ISO_DAY.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && iso(parsed) === text;
}

/** `'from_after_to'` when the range cannot match anything — shown, not silently empty. */
export function rangeError(range: DateRange): 'from_after_to' | null {
  if (!range.from || !range.to) return null;
  return range.from > range.to ? 'from_after_to' : null;
}

/** The row's two value slots for a range: equal ends become one, one end stays one-sided. */
export function rangeToValues(range: DateRange): { value: string; value2: string } {
  if (range.from && range.to && range.from === range.to) return { value: range.from, value2: '' };
  return { value: range.from, value2: range.to };
}

/** The range a row's two slots describe (what the inputs should show). */
export function valuesToRange(value: string, value2: string): DateRange {
  return { from: value ?? '', to: value2 ?? '' };
}
