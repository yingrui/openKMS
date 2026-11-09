import { describe, expect, it } from 'vitest';
import {
  QUICK_RANGE_IDS,
  isIsoDay,
  quickRange,
  rangeError,
  rangeToValues,
  valuesToRange,
  type DateRange,
} from './dateRange';

const at = (text: string) => new Date(`${text}T12:00:00Z`);

describe('quickRange', () => {
  it('counts the last N days inclusively', () => {
    expect(quickRange('last7', at('2026-10-16'))).toEqual({ from: '2026-10-10', to: '2026-10-16' });
    expect(quickRange('last30', at('2026-10-16'))).toEqual({ from: '2026-09-17', to: '2026-10-16' });
  });

  it('crosses a month and a year without arithmetic slips', () => {
    expect(quickRange('last7', at('2026-11-03'))).toEqual({ from: '2026-10-28', to: '2026-11-03' });
    expect(quickRange('last7', at('2027-01-02'))).toEqual({ from: '2026-12-27', to: '2027-01-02' });
  });

  it('takes this month from the 1st, and last month whole', () => {
    expect(quickRange('thisMonth', at('2026-10-16'))).toEqual({ from: '2026-10-01', to: '2026-10-16' });
    expect(quickRange('lastMonth', at('2026-10-16'))).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    // January: last month is December of the year before
    expect(quickRange('lastMonth', at('2026-01-15'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    // March: the month before is a leap February
    expect(quickRange('lastMonth', at('2028-03-02'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    // February: the month before is a 31-day January
    expect(quickRange('lastMonth', at('2028-02-01'))).toEqual({ from: '2028-01-01', to: '2028-01-31' });
  });

  it('takes this year up to today, and last year whole', () => {
    expect(quickRange('thisYear', at('2026-10-16'))).toEqual({ from: '2026-01-01', to: '2026-10-16' });
    expect(quickRange('lastYear', at('2026-10-16'))).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('offers every id it knows', () => {
    for (const id of QUICK_RANGE_IDS) {
      const range = quickRange(id, at('2026-10-16'));
      expect(isIsoDay(range.from) && isIsoDay(range.to)).toBe(true);
      expect(range.from <= range.to).toBe(true);
    }
  });
});

describe('isIsoDay', () => {
  it('accepts a real day and refuses a plausible-looking non-day', () => {
    expect(isIsoDay('2026-10-16')).toBe(true);
    expect(isIsoDay('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('2026-10-16T00:00:00Z')).toBe(false);
    expect(isIsoDay('')).toBe(false);
  });
});

describe('rangeError', () => {
  it('flags a reversed range, and stays quiet when a side is open', () => {
    expect(rangeError({ from: '2026-10-01', to: '2026-09-01' })).toBe('from_after_to');
    expect(rangeError({ from: '2026-10-01', to: '2026-10-01' })).toBeNull();
    expect(rangeError({ from: '', to: '2026-10-01' })).toBeNull();
    expect(rangeError({ from: '2026-10-01', to: '' })).toBeNull();
  });
});

describe('rangeToValues / valuesToRange', () => {
  it('collapses an equal range to one value, so the query says `=` not `between x and x`', () => {
    expect(rangeToValues({ from: '2026-10-01', to: '2026-10-01' })).toEqual({
      value: '2026-10-01',
      value2: '',
    });
    expect(rangeToValues({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      value: '2026-10-01',
      value2: '2026-10-31',
    });
    expect(rangeToValues({ from: '', to: '2026-10-31' })).toEqual({ value: '', value2: '2026-10-31' });
  });

  it('round-trips what the row holds', () => {
    const range: DateRange = { from: '2026-01-01', to: '2026-10-09' };
    const { value, value2 } = rangeToValues(range);
    expect(valuesToRange(value, value2)).toEqual(range);
  });
});
