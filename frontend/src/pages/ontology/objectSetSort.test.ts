import { describe, expect, it } from 'vitest';
import { formatSortList, parseSortList, sortRank, toggleSortTerm } from './objectSetSort';

describe('sorting is a list, not a column', () => {
  it('parses the URL spelling in both directions', () => {
    expect(parseSortList('region,-tier')).toEqual([
      { prop: 'region', desc: false },
      { prop: 'tier', desc: true },
    ]);
    expect(parseSortList('')).toEqual([]);
  });

  it('cycles one column and keeps the others', () => {
    expect(toggleSortTerm('', 'region')).toBe('region');
    expect(toggleSortTerm('region', 'region')).toBe('-region');
    expect(toggleSortTerm('-region', 'region')).toBe('');
    expect(toggleSortTerm('region', 'tier')).toBe('region,tier');
  });

  it('reports the precedence of a column, 0 when it is not sorting', () => {
    expect(sortRank('region,tier', 'region')).toBe(1);
    expect(sortRank('region,tier', 'tier')).toBe(2);
    expect(sortRank('region', 'tier')).toBe(0);
  });

  it('round-trips through the URL', () => {
    expect(formatSortList(parseSortList('-a,b'))).toBe('-a,b');
  });
});
