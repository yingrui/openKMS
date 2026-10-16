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
      valueColumn: 'count',
      axisColumn: 'trade_date',
      y: ['count', 'avg_pe'],
    });
  });

  it('offers a metric when the answer is a single row', () => {
    expect(guessView(['total'], [{ total: 1007340 }])).toEqual({
      choice: 'metric',
      valueColumn: 'total',
      axisColumn: '',
      y: [],
    });
  });

  it('offers a ranking for a short non-temporal result', () => {
    expect(guessView(['industry', 'value'], INDUSTRIES)).toEqual({
      choice: 'bar_list',
      valueColumn: 'value',
      axisColumn: 'industry',
      y: [],
    });
  });

  it('offers bars when there are too many rows to rank, and nothing without a measure', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ts_code: `00000${i}.SZ`, pe_ttm: i }));
    expect(guessView(['ts_code', 'pe_ttm'], many)).toEqual({
      choice: 'bar',
      valueColumn: 'pe_ttm',
      axisColumn: 'ts_code',
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
  it('builds each shape', () => {
    expect(
      viewSpec({ choice: 'bar', valueColumn: 'value', axisColumn: 'industry', y: ['value'] }),
    ).toEqual({ kind: 'chart', type: 'bar', x: 'industry', y: ['value'], series: null });
    expect(viewSpec({ choice: 'metric', valueColumn: 'total', axisColumn: '', y: [] })).toEqual({
      kind: 'metric',
      column: 'total',
      label: null,
      trend: null,
    });
    expect(
      viewSpec({ choice: 'bar_list', valueColumn: 'value', axisColumn: 'industry', y: [] }),
    ).toEqual({ kind: 'bar_list', column: 'value', labelColumn: null });
    expect(
      viewSpec({ choice: 'tracker', valueColumn: 'count', axisColumn: 'trade_date', y: [] }),
    ).toEqual({ kind: 'tracker', column: 'count', x: 'trade_date', label: null });
  });

  it('makes a KPI when a metric names an order column, and refuses an unusable choice', () => {
    expect(
      viewSpec({ choice: 'metric', valueColumn: 'avg_pe', axisColumn: 'trade_date', y: [] }),
    ).toEqual({ kind: 'metric', column: 'avg_pe', label: null, trend: { x: 'trade_date' } });
    // an order column that *is* the value column is not a trend
    expect(
      viewSpec({ choice: 'metric', valueColumn: 'avg_pe', axisColumn: 'avg_pe', y: [] }),
    ).toEqual({ kind: 'metric', column: 'avg_pe', label: null, trend: null });
    expect(viewSpec({ choice: 'line', valueColumn: 'v', axisColumn: 'trade_date', y: [] })).toBeNull();
    expect(viewSpec({ choice: 'tracker', valueColumn: 'count', axisColumn: 'count', y: [] })).toBeNull();
    expect(viewSpec({ choice: 'metric', valueColumn: '', axisColumn: '', y: [] })).toBeNull();
  });
});

describe('viewDraftFromSpec', () => {
  it('reads each stored shape back', () => {
    expect(
      viewDraftFromSpec({ kind: 'chart', type: 'bar', x: 'industry', y: ['value'] }, ['industry', 'value']),
    ).toEqual({ choice: 'bar', valueColumn: 'industry', axisColumn: 'industry', y: ['value'] });
    expect(viewDraftFromSpec({ kind: 'metric', column: 'total' }, ['total', 'other'])).toEqual({
      choice: 'metric',
      valueColumn: 'total',
      axisColumn: 'other',
      y: [],
    });
    expect(
      viewDraftFromSpec({ kind: 'metric', column: 'avg_pe', trend: { x: 'trade_date' } }, ['avg_pe', 'trade_date']),
    ).toEqual({ choice: 'metric', valueColumn: 'avg_pe', axisColumn: 'trade_date', y: [] });
    expect(
      viewDraftFromSpec({ kind: 'tracker', column: 'count', x: 'trade_date' }, ['count', 'trade_date']),
    ).toEqual({ choice: 'tracker', valueColumn: 'count', axisColumn: 'trade_date', y: [] });
  });

  it('falls back to the table for a view the result cannot satisfy', () => {
    const draft = viewDraftFromSpec(undefined, ['industry', 'value']);
    expect(draft.choice).toBe('none');
    expect(draft.valueColumn).toBe('industry');
    expect(viewDraftFromSpec({ kind: 'metric', column: 'gone' }, ['industry']).choice).toBe('none');
  });
});

describe('buildReportEntry', () => {
  it('writes the source, the query it came from and the view', () => {
    const entry = buildReportEntry(DRAFT, {
      title: '  月度行数与均值  ',
      insight: '  Sep 是高点  ',
      view: { choice: 'line', valueColumn: 'count', axisColumn: 'trade_date', y: ['count'] },
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
      { title: '   ', view: { choice: 'none', valueColumn: '', axisColumn: '', y: [] } },
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
