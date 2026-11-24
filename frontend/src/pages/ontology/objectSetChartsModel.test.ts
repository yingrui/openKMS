import { describe, expect, it } from 'vitest';
import { dimensionalCharts, isIdentifierChart } from './objectSetChartsModel';

const chart = (values: [string, number][]) => ({
  prop: 'x',
  values: values.map(([value, count]) => ({ value, count })),
  truncated: false,
});

describe('an identifier is not a dimension', () => {
  it('drops a property that gives every object its own bar', () => {
    expect(isIdentifierChart(chart([['a', 1], ['b', 1], ['c', 1]]))).toBe(true);
  });

  it('keeps a property whose bars group the set', () => {
    expect(isIdentifierChart(chart([['华东', 36], ['华中', 33]]))).toBe(false);
    expect(isIdentifierChart(chart([['华东', 36], ['华中', 33]]))).toBe(false);
  });

  it('keeps a single-valued property: one bar still says "all of them"', () => {
    expect(isIdentifierChart(chart([['2026-W46', 7]]))).toBe(false);
    expect(isIdentifierChart(chart([]))).toBe(false);
  });

  it('keeps an identifier that happens to repeat once', () => {
    expect(isIdentifierChart(chart([['a', 1], ['b', 1], ['a', 2]]))).toBe(false);
  });

  it('filters the list without reordering what is left', () => {
    const charts = [
      { ...chart([['u1', 1], ['u2', 1]]), prop: 'id' },
      { ...chart([['华东', 36]]), prop: 'region' },
      { ...chart([['B', 80], ['C', 72]]), prop: 'tier' },
    ];
    expect(dimensionalCharts(charts).map((c) => c.prop)).toEqual(['region', 'tier']);
  });
});
