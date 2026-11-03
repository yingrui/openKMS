import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT,
  canRunQuery,
  compactSpec,
  emptyAdvancedSpec,
  emptySpec,
  modeFromUrl,
  specFromUrl,
  toFilters,
} from './modelPlaygroundSpec';

describe('specFromUrl', () => {
  it('accepts a partial spec — a metric row links in with just the metric', () => {
    // Regression: the link was `{metric}` and the editor mapped over `filters` → crash.
    expect(specFromUrl('{"metric":"mkt-cap"}')).toEqual({
      metric: 'mkt-cap',
      expression: null,
      base_dataset: null,
      joins: [],
      where: null,
      having: null,
      group_by: [],
      filters: [],
      order_by: [],
      limit: DEFAULT_LIMIT,
    });
  });

  it('accepts an Advanced seed with expression + base_dataset', () => {
    expect(specFromUrl('{"expression":"SUM(x)","base_dataset":"ds1"}')).toMatchObject({
      metric: null,
      expression: 'SUM(x)',
      base_dataset: 'ds1',
      limit: DEFAULT_LIMIT,
    });
  });

  it('round-trips a full Builder spec', () => {
    const spec = {
      metric: 'pe',
      group_by: [{ field: 'industry', granularity: null }],
      filters: [{ field: 'trade_date', op: 'between', value: ['2026-01-01', '2026-01-31'] }],
      order_by: [{ field: 'value', direction: 'desc' }],
      limit: 10,
    };
    expect(specFromUrl(JSON.stringify(spec))).toMatchObject(spec);
  });

  it('fills in shapes a hand-written URL got wrong', () => {
    const parsed = specFromUrl('{"metric":"m","group_by":null,"filters":"x","order_by":{},"limit":0}');
    expect(parsed).toMatchObject({
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

describe('modeFromUrl', () => {
  it('defaults to builder', () => {
    expect(modeFromUrl(null)).toBe('builder');
    expect(modeFromUrl('nope')).toBe('builder');
  });

  it('accepts known modes', () => {
    expect(modeFromUrl('advanced')).toBe('advanced');
    expect(modeFromUrl('sql')).toBe('sql');
  });
});

describe('emptySpec / emptyAdvancedSpec', () => {
  it('starts Builder from one metric and nothing else', () => {
    expect(emptySpec('m')).toMatchObject({
      metric: 'm',
      group_by: [],
      filters: [],
      order_by: [],
      limit: DEFAULT_LIMIT,
    });
  });

  it('starts Advanced from an expression slot + base dataset', () => {
    expect(emptyAdvancedSpec('ds')).toMatchObject({
      expression: '',
      base_dataset: 'ds',
      joins: [],
      where: '',
      having: '',
      limit: DEFAULT_LIMIT,
    });
  });
});

describe('canRunQuery / compactSpec', () => {
  it('requires metric XOR expression (+ base for expression)', () => {
    expect(canRunQuery(emptySpec('m'))).toBe(true);
    expect(canRunQuery(emptyAdvancedSpec('ds'))).toBe(false);
    expect(canRunQuery({ ...emptyAdvancedSpec('ds'), expression: 'SUM(1)' })).toBe(true);
    expect(canRunQuery({ ...emptyAdvancedSpec(''), expression: 'SUM(1)' })).toBe(false);
    expect(canRunQuery({ ...emptySpec('m'), expression: 'SUM(1)' })).toBe(false);
  });

  it('drops empty Advanced fields for copy/URL', () => {
    expect(compactSpec({ ...emptyAdvancedSpec('ds'), expression: 'SUM(1)' })).toEqual({
      expression: 'SUM(1)',
      base_dataset: 'ds',
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
