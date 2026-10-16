import { describe, expect, it } from 'vitest';
import {
  columnKind,
  filtersFromParam,
  filtersToParam,
  operatorsFor,
  toApiFilters,
  type FilterRow,
} from './datasetRowsFilter';

const row = (partial: Partial<FilterRow>): FilterRow => ({
  id: 0,
  column: '',
  op: '=',
  value: '',
  value2: '',
  ...partial,
});

describe('toApiFilters', () => {
  it('drops rows that are not complete yet', () => {
    expect(toApiFilters([row({ column: 'close' })])).toEqual([]);
    expect(toApiFilters([row({ column: 'close', op: '>', value: '' })])).toEqual([]);
    expect(toApiFilters([row({ column: 'd', op: 'between', value: '2026-01-01' })])).toEqual([]);
  });

  it('passes plain comparisons through', () => {
    expect(toApiFilters([row({ column: 'close', op: '>', value: '100' })])).toEqual([
      { field: 'close', op: '>', value: '100' },
    ]);
  });

  it('turns the sugar operators into `like` patterns', () => {
    expect(toApiFilters([row({ column: 'name', op: 'contains', value: '银行' })])).toEqual([
      { field: 'name', op: 'like', value: '%银行%' },
    ]);
    expect(toApiFilters([row({ column: 'code', op: 'startsWith', value: '600' })])).toEqual([
      { field: 'code', op: 'like', value: '600%' },
    ]);
    expect(toApiFilters([row({ column: 'code', op: 'endsWith', value: 'SH' })])).toEqual([
      { field: 'code', op: 'like', value: '%SH' },
    ]);
  });

  it('splits `in` and pairs `between`', () => {
    expect(toApiFilters([row({ column: 'industry', op: 'in', value: '银行, 证券' })])).toEqual([
      { field: 'industry', op: 'in', value: ['银行', '证券'] },
    ]);
    expect(
      toApiFilters([row({ column: 'trade_date', op: 'between', value: '2026-01-01', value2: '2026-01-31' })]),
    ).toEqual([{ field: 'trade_date', op: 'between', value: ['2026-01-01', '2026-01-31'] }]);
  });

  it('sends no value for the null operators', () => {
    expect(toApiFilters([row({ column: 'close', op: 'isNull' })])).toEqual([
      { field: 'close', op: 'is_null' },
    ]);
  });

  it('AND-s everything the caller built, in order', () => {
    expect(
      toApiFilters([row({ column: 'close', op: '>', value: '100' }), row({ column: 'industry', op: '=', value: '银行' })]),
    ).toEqual([
      { field: 'close', op: '>', value: '100' },
      { field: 'industry', op: '=', value: '银行' },
    ]);
  });
});

describe('the URL round-trip', () => {
  it('keeps a filter set intact', () => {
    const rows = [
      row({ column: 'close', op: '>', value: '100' }),
      row({ column: 'trade_date', op: 'between', value: '2026-01-01', value2: '2026-01-31' }),
    ];
    expect(filtersFromParam(filtersToParam(rows))).toEqual([
      { id: 0, column: 'close', op: '>', value: '100', value2: '' },
      { id: 1, column: 'trade_date', op: 'between', value: '2026-01-01', value2: '2026-01-31' },
    ]);
  });

  it('ignores anything a hand-written URL got wrong', () => {
    expect(filtersFromParam(null)).toEqual([]);
    expect(filtersFromParam('')).toEqual([]);
    expect(filtersFromParam('not json')).toEqual([]);
    expect(filtersFromParam('{"column":"close"}')).toEqual([]);
    // an unknown operator falls back to `=`, a missing value to empty, an empty column is dropped
    expect(filtersFromParam('[["close","~",1],[null,"="]]')).toEqual([
      { id: 0, column: 'close', op: '=', value: '1', value2: '' },
    ]);
  });
});

describe('type-aware operators', () => {
  it('maps ontology types to browsing kinds', () => {
    expect(columnKind('number')).toBe('number');
    expect(columnKind('date')).toBe('date');
    expect(columnKind('datetime')).toBe('date');
    expect(columnKind('boolean')).toBe('boolean');
    expect(columnKind('uuid')).toBe('text');
    expect(columnKind(null)).toBe('text');
  });

  it('offers text operators that numbers do not get, and vice versa', () => {
    const text = operatorsFor('text').map((o) => o.id);
    const number = operatorsFor('number').map((o) => o.id);
    expect(text).toContain('contains');
    expect(text).not.toContain('between');
    expect(number).toContain('between');
    expect(number).not.toContain('contains');
    expect(operatorsFor('boolean').map((o) => o.id)).not.toContain('>');
  });
});
