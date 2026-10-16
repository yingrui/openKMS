import { describe, expect, it } from 'vitest';
import {
  buildReportEntry,
  chartDraftFromSpec,
  chartSpec,
  datasetReportDraft,
  guessChart,
  isNumericColumn,
  looksTemporal,
  modelReportDraft,
  type ReportDraftInput,
} from './reportDraft';

const MONTHLY = [
  { trade_date: '2026-01-01T00:00:00+00:00', count: 109219, avg_pe: '148.70' },
  { trade_date: '2026-02-01T00:00:00+00:00', count: 76572, avg_pe: '149.47' },
];

const INDUSTRIES = [
  { industry: '银行', value: 6.07 },
  { industry: '保险', value: 6.65 },
];

const DRAFT: ReportDraftInput = {
  sourceKind: 'dataset',
  datasetId: 'd1',
  semanticModelId: null,
  query: { filters: [{ field: 'close', op: '>', value: 100 }] },
  columns: ['trade_date', 'count', 'avg_pe'],
  rows: MONTHLY,
  defaultTitle: 'tushare.daily_basic',
};

describe('isNumericColumn', () => {
  it('accepts numbers and the strings a database sends for them', () => {
    expect(isNumericColumn(MONTHLY, 'count')).toBe(true);
    expect(isNumericColumn(MONTHLY, 'avg_pe')).toBe(true); // AVG(numeric) arrives as a string
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

describe('guessChart', () => {
  it('offers a line over the date column with the numeric measures', () => {
    expect(guessChart(['trade_date', 'count', 'avg_pe'], MONTHLY)).toEqual({
      choice: 'line',
      x: 'trade_date',
      y: ['count', 'avg_pe'],
    });
  });

  it('offers bars when the first column is a category', () => {
    expect(guessChart(['industry', 'value'], INDUSTRIES)).toEqual({
      choice: 'bar',
      x: 'industry',
      y: ['value'],
    });
  });

  it('offers nothing to draw when there is no measure', () => {
    expect(guessChart(['ts_code', 'trade_date'], MONTHLY).choice).toBe('none');
    expect(guessChart([], []).choice).toBe('none');
  });

  it('keeps the chart readable: at most three measures', () => {
    const rows = [{ x: 'a', a: 1, b: 2, c: 3, d: 4 }];
    expect(guessChart(['x', 'a', 'b', 'c', 'd'], rows).y).toHaveLength(3);
  });
});

describe('chartSpec', () => {
  it('is null for a table or an unusable choice, and carries the pivot slot otherwise', () => {
    expect(chartSpec({ choice: 'none', x: 'trade_date', y: ['count'] })).toBeNull();
    expect(chartSpec({ choice: 'line', x: '', y: ['count'] })).toBeNull();
    expect(chartSpec({ choice: 'line', x: 'trade_date', y: [] })).toBeNull();
    expect(chartSpec({ choice: 'bar', x: 'industry', y: ['value'] })).toEqual({
      type: 'bar',
      x: 'industry',
      y: ['value'],
      series: null,
    });
  });
});

describe('buildReportEntry', () => {
  it('writes the source, the query it came from and the chart choice', () => {
    const entry = buildReportEntry(DRAFT, {
      title: '  月度行数与均值  ',
      insight: '  Sep 是高点  ',
      chart: { choice: 'line', x: 'trade_date', y: ['count'] },
    });
    expect(entry).toEqual({
      title: '月度行数与均值',
      insight: 'Sep 是高点',
      source_kind: 'dataset',
      dataset_id: 'd1',
      query: DRAFT.query,
      chart: { type: 'line', x: 'trade_date', y: ['count'], series: null },
    });
  });

  it('names the model for a model report, and falls back to the default title', () => {
    const entry = buildReportEntry(
      { ...DRAFT, sourceKind: 'semantic_model', datasetId: null, semanticModelId: 'm1' },
      { title: '   ', chart: { choice: 'none', x: '', y: [] } },
    );
    expect(entry.title).toBe('tushare.daily_basic');
    expect(entry.semantic_model_id).toBe('m1');
    expect(entry.dataset_id).toBeUndefined();
    expect(entry.chart).toBeUndefined();
    expect(entry.insight).toBeUndefined();
  });
});

describe('the two page drafts', () => {
  it('names the model and the metric the Playground ran', () => {
    const draft = modelReportDraft({
      modelId: 'm1',
      modelName: 'Stock',
      metricName: '平均市盈率',
      spec: { metric: 'mt1', group_by: [{ field: 'industry' }], filters: [], order_by: [], limit: 100 },
      result: { columns: ['industry', 'value'], rows: INDUSTRIES } as never,
    });
    expect(draft).toMatchObject({
      sourceKind: 'semantic_model',
      semanticModelId: 'm1',
      defaultTitle: 'Stock · 平均市盈率',
      columns: ['industry', 'value'],
    });
    expect(draft?.query.metric).toBe('mt1');
  });

  it('falls back to the metric id, and is null with nothing to save', () => {
    const base = { modelId: 'm1', modelName: 'Stock', metricName: null };
    expect(modelReportDraft({ ...base, spec: { metric: 'mt1', group_by: [], filters: [], order_by: [], limit: 100 }, result: { columns: [], rows: [] } as never })?.defaultTitle).toBe('Stock · mt1');
    expect(modelReportDraft({ ...base, spec: null, result: null })).toBeNull();
    expect(modelReportDraft({ ...base, spec: { metric: 'mt1', group_by: [], filters: [], order_by: [], limit: 100 }, result: null })).toBeNull();
  });

  it('writes a dataset slice the way the Data tab asked for it', () => {
    const draft = datasetReportDraft({
      datasetId: 'd1',
      tableLabel: 'tushare.daily_basic',
      query: { filters: [], limit: 100, offset: 0 },
      columns: ['trade_date', 'count'],
      rows: MONTHLY,
    });
    expect(draft).toMatchObject({ sourceKind: 'dataset', datasetId: 'd1', semanticModelId: null });
  });
});

describe('chartDraftFromSpec', () => {
  it('reads a stored spec back into the fields, and refuses one the result cannot satisfy', () => {
    expect(chartDraftFromSpec({ type: 'bar', x: 'industry', y: ['value'] }, ['industry', 'value'])).toEqual({
      choice: 'bar',
      x: 'industry',
      y: ['value'],
    });
    expect(chartDraftFromSpec(undefined, ['industry', 'value'])).toEqual({
      choice: 'none',
      x: 'industry',
      y: [],
    });
    // a column the result no longer has: the editor offers a table, not a broken chart
    expect(chartDraftFromSpec({ type: 'line', x: 'gone', y: ['value'] }, ['industry', 'value']).choice).toBe('none');
  });
});
