import { describe, expect, it } from 'vitest';
import { fieldCoverage } from './fieldCoverage';

const field = (name: string, column_name: string | null): { name: string; column_name: string | null } => ({
  name,
  column_name,
});

describe('fieldCoverage', () => {
  it('names the columns no field references, and the fields no column backs', () => {
    expect(fieldCoverage(['ts_code', 'trade_date', 'close', 'pe_ttm'], [
      field('代码', 'ts_code'),
      field('日期', 'trade_date'),
      field('旧列', 'gone'),
    ])).toEqual({
      columnsWithoutFields: ['close', 'pe_ttm'],
      fieldsWithoutColumn: [field('旧列', 'gone')],
    });
  });

  it('treats a column-backed field as covering its column, whatever else it carries', () => {
    // column-backed fields also carry an expression (`"col"`), so that must not be the test
    expect(fieldCoverage(['a'], [field('A', 'a')]).columnsWithoutFields).toEqual([]);
  });

  it('ignores computed fields on both sides', () => {
    const computed = field('比值', null);
    expect(fieldCoverage(['a'], [computed, field('A', 'a')])).toEqual({
      columnsWithoutFields: [],
      fieldsWithoutColumn: [],
    });
  });

  it('counts a column as covered once, however many fields point at it', () => {
    expect(fieldCoverage(['a'], [field('A', 'a'), field('A again', 'a')]).columnsWithoutFields).toEqual([]);
  });

  it('is quiet when there is nothing to reconcile', () => {
    expect(fieldCoverage([], [])).toEqual({ columnsWithoutFields: [], fieldsWithoutColumn: [] });
  });
});
