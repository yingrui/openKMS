import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMIT, emptySpec, specFromUrl, toFilters } from './modelPlaygroundSpec';

describe('specFromUrl', () => {
  it('accepts a partial spec — a metric row links in with just the metric', () => {
    // Regression: the link was `{metric}` and the editor mapped over `filters` → crash.
    expect(specFromUrl('{"metric":"mkt-cap"}')).toEqual({
      metric: 'mkt-cap',
      group_by: [],
      filters: [],
      order_by: [],
      limit: DEFAULT_LIMIT,
    });
  });

  it('round-trips a full spec', () => {
    const spec = {
      metric: 'pe',
      group_by: [{ field: 'industry', granularity: null }],
      filters: [{ field: 'trade_date', op: 'between', value: ['2026-01-01', '2026-01-31'] }],
      order_by: [{ field: 'value', direction: 'desc' }],
      limit: 10,
    };
    expect(specFromUrl(JSON.stringify(spec))).toEqual(spec);
  });

  it('fills in shapes a hand-written URL got wrong', () => {
    const parsed = specFromUrl('{"metric":"m","group_by":null,"filters":"x","order_by":{},"limit":0}');
    expect(parsed).toEqual({
      metric: 'm',
      group_by: [],
      filters: [],
      order_by: [],
      limit: DEFAULT_LIMIT,
    });
  });

  it('ignores anything that is not a spec', () => {
    expect(specFromUrl(null)).toBeNull();
    expect(specFromUrl('')).toBeNull();
    expect(specFromUrl('not json')).toBeNull();
    expect(specFromUrl('[1,2]')).toBeNull();
    expect(specFromUrl('{"metric":42}')).toBeNull();
    expect(specFromUrl('{"group_by":[]}')).toBeNull();
  });
});

describe('emptySpec', () => {
  it('starts from one metric and nothing else', () => {
    expect(emptySpec('m')).toEqual({
      metric: 'm',
      group_by: [],
      filters: [],
      order_by: [],
      limit: DEFAULT_LIMIT,
    });
  });
});

describe('toFilters', () => {
  it('drops rows the user has not filled in', () => {
    expect(toFilters([{ id: 0, field: '', op: '=', value: 'x', value2: '' }])).toEqual([]);
    expect(toFilters([{ id: 0, field: 'industry', op: '', value: 'x', value2: '' }])).toEqual([]);
  });

  it('maps the shapes the API expects', () => {
    expect(
      toFilters([
        { id: 0, field: 'industry', op: '=', value: '银行', value2: '' },
        { id: 1, field: 'industry', op: 'in', value: '银行, 证券', value2: '' },
        { id: 2, field: 'trade_date', op: 'between', value: '2026-01-01', value2: '2026-01-31' },
        { id: 3, field: 'area', op: 'is_null', value: 'ignored', value2: '' },
      ]),
    ).toEqual([
      { field: 'industry', op: '=', value: '银行' },
      { field: 'industry', op: 'in', value: ['银行', '证券'] },
      { field: 'trade_date', op: 'between', value: ['2026-01-01', '2026-01-31'] },
      { field: 'area', op: 'is_null' },
    ]);
  });
});
