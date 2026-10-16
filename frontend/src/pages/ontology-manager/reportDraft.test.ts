import { describe, expect, it } from 'vitest';
import {
  buildReportEntry,
  datasetReportDraft,
  guessView,
  modelReportDraft,
  viewDraftFromSpec,
  viewSpec,
  type ReportDraftInput,
} from './reportDraft';

const MONTHLY = [
  { trade_date: '2026-01-01T00:00:00+00:00', count: 109219, avg_pe: '148.70' },
  { trade_date: '2026-02-01T00:00:00+00:00', count: 76572, avg_pe: '149.47' },
];

const INDUSTRIES = [
  { industry: '银行', value: 6.07 },
  { industry: '保险', value: 6.65 },
  { industry: '路桥', value: 19.25 },
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

describe('guessView', () => {
  it('offers a line over the date column with the numeric measures', () => {
    expect(guessView(['trade_date', 'count', 'avg_pe'], MONTHLY)).toEqual({
      choice: 'line',
      x: 'trade_date',
      y: ['count', 'avg_pe'],
    });
  });

  it('offers a metric when the answer is a single row', () => {
    expect(guessView(['total'], [{ total: 1007340 }])).toEqual({
      choice: 'metric',
      x: 'total',
      y: [],
    });
  });

  it('offers a ranking for a short non-temporal result', () => {
    expect(guessView(['industry', 'value'], INDUSTRIES)).toEqual({
      choice: 'bar_list',
      x: 'value',
      y: [],
    });
  });

  it('offers bars when there are too many rows to rank, and nothing without a measure', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ts_code: `00000${i}.SZ`, pe_ttm: i }));
    expect(guessView(['ts_code', 'pe_ttm'], many)).toEqual({
      choice: 'bar',
      x: 'ts_code',
      y: ['pe_ttm'],
    });
    expect(guessView(['ts_code', 'trade_date'], MONTHLY).choice).toBe('none');
    expect(guessView([], []).choice).toBe('none');
  });

  it('keeps a chart readable: at most three measures', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ code: `c${i}`, a: 1, b: 2, c: 3, d: 4 }));
    expect(guessView(['code', 'a', 'b', 'c', 'd'], many).y).toHaveLength(3);
  });
});

describe('viewSpec', () => {
  it('builds each shape, and refuses an unusable choice', () => {
    expect(viewSpec({ choice: 'bar', x: 'industry', y: ['value'] })).toEqual({
      kind: 'chart',
      type: 'bar',
      x: 'industry',
      y: ['value'],
      series: null,
    });
    // a number and a ranking name their value column; the label is inferred when drawn
    expect(viewSpec({ choice: 'metric', x: 'total', y: [] })).toEqual({
      kind: 'metric',
      column: 'total',
      label: null,
    });
    expect(viewSpec({ choice: 'bar_list', x: 'value', y: [] })).toEqual({
      kind: 'bar_list',
      column: 'value',
      labelColumn: null,
    });
    expect(viewSpec({ choice: 'line', x: 'trade_date', y: [] })).toBeNull();
    expect(viewSpec({ choice: 'none', x: 'trade_date', y: ['count'] })).toBeNull();
    expect(viewSpec({ choice: 'metric', x: '', y: [] })).toBeNull();
  });
});

describe('viewDraftFromSpec', () => {
  it('reads a stored view back, and falls back to the table for one the result cannot satisfy', () => {
    expect(
      viewDraftFromSpec({ kind: 'chart', type: 'bar', x: 'industry', y: ['value'] }, ['industry', 'value']),
    ).toEqual({
      choice: 'bar',
      x: 'industry',
      y: ['value'],
    });
    expect(viewDraftFromSpec({ kind: 'metric', column: 'total' }, ['total'])).toEqual({
      choice: 'metric',
      x: 'total',
      y: [],
    });
    expect(viewDraftFromSpec(undefined, ['industry', 'value'])).toEqual({
      choice: 'none',
      x: 'industry',
      y: [],
    });
    expect(viewDraftFromSpec({ kind: 'metric', column: 'gone' }, ['industry']).choice).toBe('none');
  });
});

describe('buildReportEntry', () => {
  it('writes the source, the query it came from and the view', () => {
    const entry = buildReportEntry(DRAFT, {
      title: '  月度行数与均值  ',
      insight: '  Sep 是高点  ',
      view: { choice: 'line', x: 'trade_date', y: ['count'] },
    });
    expect(entry).toEqual({
      title: '月度行数与均值',
      insight: 'Sep 是高点',
      source_kind: 'dataset',
      dataset_id: 'd1',
      query: DRAFT.query,
      view: { kind: 'chart', type: 'line', x: 'trade_date', y: ['count'], series: null },
    });
  });

  it('names the model for a model report, and falls back to the default title', () => {
    const entry = buildReportEntry(
      { ...DRAFT, sourceKind: 'semantic_model', datasetId: null, semanticModelId: 'm1' },
      { title: '   ', view: { choice: 'none', x: '', y: [] } },
    );
    expect(entry.title).toBe('tushare.daily_basic');
    expect(entry.semantic_model_id).toBe('m1');
    expect(entry.dataset_id).toBeUndefined();
    expect(entry.view).toBeUndefined();
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
    const full = { metric: 'mt1', group_by: [], filters: [], order_by: [], limit: 100 };
    expect(modelReportDraft({ ...base, spec: full, result: { columns: [], rows: [] } as never })?.defaultTitle).toBe(
      'Stock · mt1',
    );
    expect(modelReportDraft({ ...base, spec: null, result: null })).toBeNull();
    expect(modelReportDraft({ ...base, spec: full, result: null })).toBeNull();
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
