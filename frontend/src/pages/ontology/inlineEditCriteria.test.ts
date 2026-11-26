import { describe, expect, it } from 'vitest';
import { rowSatisfies } from './inlineEditCriteria';

describe('the pen appears only where the action applies', () => {
  const row = { status: 'proposed', fill_rate: 0.58, is_selected: false, tags: 'a,b' };

  it('compares text, numbers and null-ness', () => {
    expect(rowSatisfies(row, ['status:eq:proposed'])).toBe(true);
    expect(rowSatisfies(row, ['status:eq:confirmed'])).toBe(false);
    expect(rowSatisfies(row, ['fill_rate:ge:0.5'])).toBe(true);
    expect(rowSatisfies(row, ['fill_rate:gt:0.6'])).toBe(false);
    expect(rowSatisfies(row, ['missing:is_null'])).toBe(true);
    expect(rowSatisfies(row, ['status:is_not_null'])).toBe(true);
  });

  it('supports lists and substrings', () => {
    expect(rowSatisfies(row, ['status:in:confirmed,proposed'])).toBe(true);
    expect(rowSatisfies(row, ['tags:contains:b'])).toBe(true);
  });

  it('means "every row" when there are no criteria', () => {
    expect(rowSatisfies(row, [])).toBe(true);
  });

  it('does not block on a condition it cannot parse', () => {
    // The backend is the authority; a table that hid the pen on a parse it did not understand would hide it wrongly.
    expect(rowSatisfies(row, ['status:nonsense:x'])).toBe(true);
  });
});
