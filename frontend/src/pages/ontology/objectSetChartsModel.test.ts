import { describe, expect, it } from 'vitest';
import { dimensionalCharts, intervalLabel, isHistogram, isIdentifierChart } from './objectSetChartsModel';

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

describe('a numeric property arrives as intervals', () => {
  const histogram = {
    prop: 'ic_ir',
    buckets: [
      { from: -1.03, to: -0.78, count: 4 },
      { from: -0.78, to: -0.53, count: 0 },
    ],
  };

  it('is a histogram, not a value distribution', () => {
    expect(isHistogram(histogram)).toBe(true);
  });

  it('survives the identifier filter that drops uuid charts', () => {
    expect(dimensionalCharts([histogram]).map((chart) => chart.prop)).toEqual(['ic_ir']);
  });

  it('labels a bar with its interval, without inventing precision', () => {
    expect(intervalLabel(-1.03, -0.78)).toBe('-1.03 – -0.78');
    expect(intervalLabel(0.5866666, 0.91)).toBe('0.587 – 0.91');
    expect(intervalLabel(3, 4)).toBe('3 – 4');
  });
});
