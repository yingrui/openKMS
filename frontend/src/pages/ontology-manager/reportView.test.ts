import { describe, expect, it } from 'vitest';
import {
  MAX_BAR_LIST_ROWS,
  MAX_CHART_SERIES,
  barListRows,
  chartFits,
  chartSeries,
  detectTemporal,
  isNumericColumn,
  looksTemporal,
  metricDelta,
  metricValue,
  numericValue,
  parseChartSpec,
  parseView,
  viewFits,
  xLabel,
} from './findingView';

const MONTHLY = [
  { trade_date: '2026-01-01T00:00:00+00:00', count: 1 },
  { trade_date: '2026-02-01T00:00:00+00:00', count: 2 },
];
const INDUSTRIES = [
  { industry: '银行', value: 6 },
  { industry: '保险', value: 7 },
];

const COLUMNS = ['trade_date', 'count', 'avg_pe', 'industry'];

describe('parseChartSpec', () => {
  it('takes a minimal spec and defaults the type to a line', () => {
    expect(parseChartSpec({ x: 'trade_date', y: 'count' })).toEqual({
      type: 'line',
      x: 'trade_date',
      y: ['count'],
      series: null,
    });
  });

  it('accepts several measures and a bar type', () => {
    expect(parseChartSpec({ type: 'bar', x: 'industry', y: ['count', 'avg_pe'] })?.y).toEqual([
      'count',
      'avg_pe',
    ]);
  });

  it('rejects what it cannot draw, so the table stands in', () => {
    expect(parseChartSpec(undefined)).toBeNull();
    expect(parseChartSpec('bar')).toBeNull();
    expect(parseChartSpec({ y: 'count' })).toBeNull();
    expect(parseChartSpec({ x: 'trade_date', y: [] })).toBeNull();
    expect(parseChartSpec({ x: 'trade_date', y: 'count', type: 'pie' })).toBeNull();
    // a grouping column with several measures has no defined drawing
    expect(parseChartSpec({ x: 'industry', y: ['count', 'avg_pe'], series: 'trade_date' })).toBeNull();
    expect(parseChartSpec({ x: 'industry', y: 'count', series: 42 })).toBeNull();
  });
});

describe('chartFits', () => {
  const spec = parseChartSpec({ x: 'trade_date', y: ['count'] });

  it('needs every column to be in the result', () => {
    expect(chartFits(spec, COLUMNS)).toBe(true);
    expect(chartFits(spec, ['trade_date'])).toBe(false);
    expect(chartFits(null, COLUMNS)).toBe(false);
    expect(chartFits(spec, undefined)).toBe(false);
  });

  it('also checks the grouping column', () => {
    expect(chartFits(parseChartSpec({ x: 'trade_date', y: 'count', series: 'industry' }), COLUMNS)).toBe(true);
    expect(chartFits(parseChartSpec({ x: 'trade_date', y: 'count', series: 'nope' }), COLUMNS)).toBe(false);
  });
});

describe('numericValue', () => {
  it('reads the numbers a database sends as strings', () => {
    expect(numericValue(12)).toBe(12);
    expect(numericValue('12.5')).toBe(12.5); // AVG(numeric) arrives as a string
    expect(numericValue(null)).toBeNull();
    expect(numericValue('')).toBeNull();
    expect(numericValue('n/a')).toBeNull();
    expect(numericValue(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('chartSeries', () => {
  it('plots one point per row with the measures as keys', () => {
    const spec = parseChartSpec({ x: 'trade_date', y: ['count', 'avg_pe'] })!;
    const series = chartSeries(
      [
        { trade_date: '2026-01-01', count: 3, avg_pe: '12.5' },
        { trade_date: '2026-02-01', count: 4, avg_pe: null },
      ],
      spec,
    );
    expect(series.keys).toEqual(['count', 'avg_pe']);
    expect(series.data).toEqual([
      { __x: '2026-01-01', count: 3, avg_pe: 12.5 },
      { __x: '2026-02-01', count: 4, avg_pe: null },
    ]);
    expect(series.truncated).toBe(false);
  });

  it('pivots a grouping column into one key per value, merged by x', () => {
    const spec = parseChartSpec({ x: 'trade_date', y: 'avg_pe', series: 'industry' })!;
    const series = chartSeries(
      [
        { trade_date: '2026-01-01', industry: '银行', avg_pe: '6.07' },
        { trade_date: '2026-01-01', industry: '保险', avg_pe: '6.65' },
        { trade_date: '2026-02-01', industry: '银行', avg_pe: '6.5' },
      ],
      spec,
    );
    expect(series.keys).toEqual(['银行', '保险']);
    expect(series.data).toEqual([
      { __x: '2026-01-01', 银行: 6.07, 保险: 6.65 },
      { __x: '2026-02-01', 银行: 6.5 },
    ]);
  });

  it('drops groups beyond the readable limit and says so', () => {
    const spec = parseChartSpec({ x: 'trade_date', y: 'count', series: 'industry' })!;
    const rows = Array.from({ length: MAX_CHART_SERIES + 3 }, (_, i) => ({
      trade_date: '2026-01-01',
      industry: `g${i}`,
      count: i,
    }));
    const series = chartSeries(rows, spec);
    expect(series.keys).toHaveLength(MAX_CHART_SERIES);
    expect(series.truncated).toBe(true);
  });

  it('keeps a null x as an empty label rather than dropping the point', () => {
    const spec = parseChartSpec({ x: 'trade_date', y: 'count' })!;
    expect(chartSeries([{ trade_date: null, count: 1 }], spec).data).toEqual([
      { __x: null, count: 1 },
    ]);
  });
});

describe('xLabel', () => {
  it('drops the time of day from a timestamp, and leaves anything else alone', () => {
    expect(xLabel('2026-01-01T00:00:00+00:00')).toBe('2026-01-01');
    expect(xLabel('2026-01-01 12:00:00')).toBe('2026-01-01');
    expect(xLabel('银行')).toBe('银行');
    expect(xLabel(null)).toBe('');
  });
});

describe('isNumericColumn', () => {
  it('accepts numbers and the strings a database sends for them', () => {
    expect(isNumericColumn([{ a: 1 }], 'a')).toBe(true);
    expect(isNumericColumn(MONTHLY, 'count')).toBe(true);
    expect(isNumericColumn([{ a: '12.5' }], 'a')).toBe(true); // AVG(numeric) arrives as a string
    expect(isNumericColumn(MONTHLY, 'trade_date')).toBe(false);
    expect(isNumericColumn([{ a: null }], 'a')).toBe(false);
    expect(isNumericColumn([], 'a')).toBe(false);
  });
});

describe('looksTemporal', () => {
  it('needs two date-like samples, and takes categories as they are', () => {
    expect(looksTemporal(MONTHLY, 'trade_date')).toBe(true);
    expect(looksTemporal(INDUSTRIES, 'industry')).toBe(false);
    expect(looksTemporal([{ d: '2026-01-01' }], 'd')).toBe(false);
  });
});

describe('parseView', () => {
  it('reads a v2 view, and a v1 chart shape as a chart', () => {
    expect(parseView({ kind: 'metric', column: '总市值', label: '总市值（元）' })).toEqual({
      kind: 'metric',
      column: '总市值',
      label: '总市值（元）',
      trend: null,
    });
    expect(parseView({ kind: 'bar_list', column: 'value' })).toEqual({
      kind: 'bar_list',
      column: 'value',
      labelColumn: null,
    });
    expect(parseView({ kind: 'bar_list', column: 'value', label_column: 'industry' })?.kind).toBe('bar_list');
    // the first release stored a bare chart
    expect(parseView({ type: 'line', x: 'trade_date', y: 'value' })).toEqual({
      kind: 'chart',
      type: 'line',
      x: 'trade_date',
      y: ['value'],
      series: null,
    });
  });

  it('rejects what it cannot draw, so the table stands in', () => {
    expect(parseView(undefined)).toBeNull();
    expect(parseView({ kind: 'metric' })).toBeNull();
    expect(parseView({ kind: 'bar_list', column: '' })).toBeNull();
    expect(parseView({ kind: 'bar_list', column: 'value', label_column: 42 })).toBeNull();
    expect(parseView({ kind: 'pie', column: 'value' })).toBeNull();
    expect(parseView({ kind: 'metric', column: 'a', label: '   ' })).toBeNull();
  });
});

describe('viewFits', () => {
  it('checks the columns each kind needs', () => {
    expect(viewFits({ kind: 'metric', column: 'total', label: null, trend: null }, ['total'])).toBe(true);
    expect(viewFits({ kind: 'metric', column: 'gone', label: null, trend: null }, ['total'])).toBe(false);
    expect(viewFits({ kind: 'bar_list', column: 'value', labelColumn: 'industry' }, ['value'])).toBe(false);
    expect(viewFits({ kind: 'bar_list', column: 'value', labelColumn: 'industry' }, ['value', 'industry'])).toBe(true);
    expect(viewFits(null, ['a'])).toBe(false);
  });
});

describe('metricValue', () => {
  it('shows the first row — a metric is what the query reduced to', () => {
    expect(metricValue([{ total: 1007340 }], { kind: 'metric', column: 'total', label: null, trend: null })).toBe(1007340);
    expect(metricValue([{ total: '6.07' }], { kind: 'metric', column: 'total', label: null, trend: null })).toBe('6.07');
    expect(metricValue([], { kind: 'metric', column: 'total', label: null, trend: null })).toBeNull();
    expect(metricValue([{ other: 1 }], { kind: 'metric', column: 'total', label: null, trend: null })).toBeNull();
  });
});

describe('barListRows', () => {
  const VIEW = { kind: 'bar_list', column: 'value', labelColumn: 'industry' } as const;

  it('ranks with each row’s share of the listed total', () => {
    const { rows, truncated } = barListRows(
      [
        { industry: '银行', value: 6 },
        { industry: '保险', value: 2 },
        { industry: '路桥', value: 2 },
      ],
      VIEW,
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['银行', 6],
      ['保险', 2],
      ['路桥', 2],
    ]);
    expect(rows[0].share).toBeCloseTo(0.6);
    expect(rows[1].share).toBeCloseTo(0.2);
    expect(truncated).toBe(false);
  });

  it('drops non-numeric rows, reads a numeric string, and caps the list', () => {
    const rows = Array.from({ length: MAX_BAR_LIST_ROWS + 4 }, (_, i) => ({
      industry: `g${i}`,
      value: `${i}`,
    }));
    const ranked = barListRows([...rows, { industry: 'n/a', value: '—' }], VIEW);
    expect(ranked.rows).toHaveLength(MAX_BAR_LIST_ROWS);
    expect(ranked.rows[0].value).toBe(MAX_BAR_LIST_ROWS + 3);
    expect(ranked.truncated).toBe(true);
  });

  it('infers the label from the first column that is not the value', () => {
    const { rows } = barListRows([{ ts_code: '688502.SH', pe_ttm: 150889.96 }], {
      kind: 'bar_list',
      column: 'pe_ttm',
      labelColumn: null,
    });
    expect(rows).toEqual([{ label: '688502.SH', value: 150889.96, share: 1 }]);
  });

  it('is an empty list when nothing is numeric', () => {
    expect(barListRows([{ a: 'x' }], { kind: 'bar_list', column: 'a', labelColumn: null }).rows).toEqual([]);
  });
});

describe('detectTemporal', () => {
  it('finds the date column, if there is one', () => {
    expect(detectTemporal(['trade_date', 'count'], MONTHLY)).toBe('trade_date');
    expect(detectTemporal(['industry', 'value'], INDUSTRIES)).toBeNull();
  });
});

describe('metricDelta with a compare distance', () => {
  const VIEW = (compare: number) =>
    ({ kind: 'metric', column: 'pe', label: null, trend: { x: 'month', compare } }) as const;
  const SERIES = Array.from({ length: 14 }, (_, i) => ({ month: `m${i}`, pe: i + 1 }));

  it('compares against the previous row by default', () => {
    expect(metricDelta(SERIES, VIEW(1))?.previous).toBe(13);
    expect(metricDelta(SERIES, VIEW(1))?.value).toBe(14);
  });

  it('compares against the same month last year when asked for 12 rows back', () => {
    // a monthly series of 14 points: the last (14) against the one 12 before it (2)
    expect(metricDelta(SERIES, VIEW(12))).toMatchObject({ value: 14, previous: 2, direction: 'up' });
  });

  it('says nothing when the series is shorter than the comparison', () => {
    const short = SERIES.slice(0, 12);
    expect(metricDelta(short, VIEW(12))).toBeNull();
    expect(metricDelta(SERIES.slice(0, 1), VIEW(1))).toBeNull();
  });

  it('skips nulls before counting rows back, so a gap does not shift the comparison', () => {
    const gappy = [
      { month: 'm1', pe: 10 },
      { month: 'm2', pe: null },
      { month: 'm3', pe: 30 },
    ];
    // with no nulls it would compare 30 against 10; the gap is skipped, not counted as a row
    expect(metricDelta(gappy, VIEW(2))).toBeNull(); // only two usable values
    expect(metricDelta(gappy, VIEW(1))).toMatchObject({ value: 30, previous: 10 });
  });
});

describe('combo charts', () => {
  it('parses bars plus lines, and accepts lines alone', () => {
    expect(parseView({ kind: 'chart', type: 'combo', x: 'trade_date', y: ['count'], lines: ['avg_pe'] })).toEqual({
      kind: 'chart',
      type: 'combo',
      x: 'trade_date',
      y: ['count'],
      lines: ['avg_pe'],
      series: null,
    });
    // a combo of only lines is a line chart, but it is still a usable spec
    const linesOnly = parseView({ kind: 'chart', type: 'combo', x: 'm', y: [], lines: 'share' });
    expect(linesOnly?.kind === 'chart' && linesOnly.lines).toEqual(['share']);
  });

  it('refuses a combo with nothing to draw, and keeps `lines` out of line/bar', () => {
    expect(parseView({ kind: 'chart', type: 'combo', x: 'm', y: [] })).toBeNull();
    expect(parseView({ kind: 'chart', type: 'line', x: 'm', y: ['a'], lines: ['b'] })).toEqual({
      kind: 'chart',
      type: 'line',
      x: 'm',
      y: ['a'],
      series: null,
    });
  });

  it('needs every column of both slots to exist', () => {
    const combo = parseView({ kind: 'chart', type: 'combo', x: 'm', y: ['a'], lines: ['b'] });
    expect(viewFits(combo, ['m', 'a', 'b'])).toBe(true);
    expect(viewFits(combo, ['m', 'a'])).toBe(false);
    expect(combo?.kind === 'chart' && chartFits(combo, ['m', 'a', 'b'])).toBe(true);
  });

  it('plots both slots as data keys', () => {
    const combo = parseChartSpec({ type: 'combo', x: 'm', y: ['a'], lines: ['b'] })!;
    const series = chartSeries([{ m: 'jan', a: 3, b: '0.5' }], combo);
    expect(series.keys).toEqual(['a', 'b']);
    expect(series.data).toEqual([{ __x: 'jan', a: 3, b: 0.5 }]);
  });
});

describe('scatter charts', () => {
  it('parses two measures: `x` is the horizontal measure, `y` the single vertical one', () => {
    expect(parseView({ kind: 'chart', type: 'scatter', x: 'total_mv', y: 'pe_ttm' })).toEqual({
      kind: 'chart',
      type: 'scatter',
      x: 'total_mv',
      y: ['pe_ttm'],
      series: null,
    });
  });

  it('refuses a scatter that is not a pair, or that groups by a category', () => {
    expect(parseView({ kind: 'chart', type: 'scatter', x: 'a', y: [] })).toBeNull();
    expect(parseView({ kind: 'chart', type: 'scatter', x: 'a', y: ['b', 'c'] })).toBeNull();
    expect(parseView({ kind: 'chart', type: 'scatter', x: 'a', y: ['b'], lines: ['c'] })).toBeNull();
    expect(parseView({ kind: 'chart', type: 'scatter', x: 'a', y: ['b'], series: 'industry' })).toBeNull();
  });

  it('puts numbers on both axes — a category on the horizontal one would line the points up', () => {
    const scatter = parseChartSpec({ type: 'scatter', x: 'total_mv', y: 'pe_ttm' })!;
    const series = chartSeries(
      [
        { total_mv: '1.2e10', pe_ttm: '12.5' },
        { total_mv: 'n/a', pe_ttm: '9' },
      ],
      scatter,
    );
    expect(series.data).toEqual([
      { __x: 12000000000, pe_ttm: 12.5 },
      { __x: null, pe_ttm: 9 },
    ]);
  });
});
