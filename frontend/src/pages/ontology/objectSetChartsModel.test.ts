import { describe, expect, it } from 'vitest';
import {
  dimensionalCharts,
  deltaLabel,
  diffCharts,
  isTimeline,
  formatMeasure,
  groupBySettings,
  intervalLabel,
  isHistogram,
  isIdentifierChart,
} from './objectSetChartsModel';

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

describe('chart settings group the requests', () => {
  it('one request per distinct metric/split, props kept in order', () => {
    const groups = groupBySettings([
      { prop: 'region' },
      { prop: 'tier' },
      { prop: 'region', split: 'tier' },
      { prop: 'lead_time_weeks', metric: 'avg', measure: 'lead_time_weeks' },
    ]);
    expect(groups.map((group) => group.props)).toEqual([
      ['region', 'tier'],
      ['region'],
      ['lead_time_weeks'],
    ]);
    expect(groups[2].settings).toEqual({ metric: 'avg', measure: 'lead_time_weeks' });
  });

  it('a metric of count carries no measure', () => {
    expect(groupBySettings([{ prop: 'region', metric: 'count', measure: 'x' }])[0].settings).toEqual({});
  });
});

describe('measure labels stay readable', () => {
  it('abbreviates and trims', () => {
    expect(formatMeasure(12345)).toBe('1.2万');
    expect(formatMeasure(1234567)).toBe('1.2M');
    expect(formatMeasure(7)).toBe('7');
    expect(formatMeasure(2.3456)).toBe('2.35');
  });
});

describe('a difference reads as a share', () => {
  it('signs, rounds, and survives a zero baseline', () => {
    expect(deltaLabel(36, 180)).toBe('-80%');
    expect(deltaLabel(12, 10)).toBe('+20%');
    expect(deltaLabel(5, 0)).toBe('+∞');
    expect(deltaLabel(0, 0)).toBe('0');
  });
});

describe('an action is verified against the numbers it changed', () => {
  const chart = (prop: string, values: [string, number][]) => ({
    prop,
    values: values.map(([value, count]) => ({ value, count })),
  });

  it('lists only the values that moved, biggest move first', () => {
    const changes = diffCharts(
      [chart('region', [['华东', 36], ['华北', 33]])],
      [chart('region', [['华东', 30], ['华北', 33]])]
    );
    expect(changes).toEqual([
      { prop: 'region', moved: [{ value: '华东', before: 36, after: 30 }] },
    ]);
  });

  it('treats a value that appeared or disappeared as 0, not as missing', () => {
    const changes = diffCharts(
      [chart('tier', [['A', 2]])],
      [chart('tier', [['A', 2], ['B', 1]])]
    );
    expect(changes[0].moved).toEqual([{ value: 'B', before: 0, after: 1 }]);
  });

  it('reports nothing when a chart did not move at all', () => {
    expect(
      diffCharts([chart('tier', [['A', 2]])], [chart('tier', [['A', 2]])])
    ).toEqual([]);
  });

  it('compares measures when the chart measures something', () => {
    const before = [{ prop: 'x', values: [{ value: 'p', count: 2, measure: 10 }] }];
    const after = [{ prop: 'x', values: [{ value: 'p', count: 2, measure: 7 }] }];
    expect(diffCharts(before, after)[0].moved).toEqual([{ value: 'p', before: 10, after: 7 }]);
  });
});

describe('a period axis is a timeline', () => {
  it('is a timeline only when the server said so, and it is neither a histogram nor a cross-tab', () => {
    expect(isTimeline({ prop: 'cycle', order: 'chronological', values: [] })).toBe(true);
    expect(isTimeline({ prop: 'cycle', values: [] })).toBe(false);
    expect(
      isTimeline({ prop: 'cycle', order: 'chronological', buckets: [{ from: 0, to: 1, count: 1 }] })
    ).toBe(false);
  });
});
