import { describe, expect, it } from 'vitest';
import { emptyForm, toQuery } from './addFindingForm';

describe('toQuery', () => {
  it('refuses without a source, a metric, a group column or an aggregate', () => {
    expect(toQuery(emptyForm())).toEqual({ ok: false, reason: 'no_source' });
    expect(toQuery({ ...emptyForm(), kind: 'semantic_model', modelId: 'm1' })).toEqual({
      ok: false,
      reason: 'no_metric',
    });
    expect(toQuery({ ...emptyForm(), datasetId: 'd1', datasetMode: 'summary' })).toEqual({
      ok: false,
      reason: 'no_group_by',
    });
    expect(
      toQuery({
        ...emptyForm(),
        datasetId: 'd1',
        datasetMode: 'summary',
        groupBy: 'industry',
        aggregates: [{ fn: 'count', column: '' }],
      }),
    ).toMatchObject({ ok: true });
  });

  it('builds a dataset rows query from the grid vocabulary', () => {
    const form = {
      ...emptyForm(),
      datasetId: 'd1',
      filters: [{ id: 1, column: 'pe_ttm', op: 'between', value: '0.1', value2: '300' }],
      sort: 'trade_date',
      order: 'asc' as const,
      limit: 500,
    };
    expect(toQuery(form)).toEqual({
      ok: true,
      kind: 'dataset',
      id: 'd1',
      query: {
        filters: [{ field: 'pe_ttm', op: 'between', value: ['0.1', '300'] }],
        sort: 'trade_date',
        order: 'asc',
        limit: 500,
        offset: 0,
      },
    });
  });

  it('builds a dataset summary with a grain and a whitelisted aggregate list', () => {
    const form = {
      ...emptyForm(),
      datasetId: 'd1',
      datasetMode: 'summary' as const,
      groupBy: 'trade_date',
      granularity: 'month',
      aggregates: [
        { fn: 'count', column: '' },
        { fn: 'avg', column: 'pe_ttm' },
      ],
      limit: 12,
    };
    expect(toQuery(form)).toEqual({
      ok: true,
      kind: 'dataset',
      id: 'd1',
      query: {
        group_by: [{ column: 'trade_date', granularity: 'month' }],
        aggregates: [{ fn: 'count' }, { fn: 'avg', column: 'pe_ttm' }],
        filters: [],
        order_by: [],
        limit: 12,
      },
    });
  });

  it('builds a model query, dropping empty group-by rows and the grain on a plain field', () => {
    const form = {
      ...emptyForm(),
      kind: 'semantic_model' as const,
      modelId: 'm1',
      metric: 'mt1',
      modelGroupBy: [
        { field: 'trade_date', granularity: 'month' },
        { field: 'industry', granularity: '' },
        { field: '', granularity: '' },
      ],
    };
    expect(toQuery(form)).toEqual({
      ok: true,
      kind: 'semantic_model',
      id: 'm1',
      query: {
        metric: 'mt1',
        group_by: [{ field: 'trade_date', granularity: 'month' }, { field: 'industry' }],
        filters: [],
        order_by: [],
        limit: 100,
      },
    });
  });
});
