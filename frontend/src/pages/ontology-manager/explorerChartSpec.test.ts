import { describe, expect, it } from 'vitest';
import {
  MAX_CHART_SERIES,
  chartFits,
  chartSeries,
  numericValue,
  parseChartSpec,
  xLabel,
} from './explorerChartSpec';

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
