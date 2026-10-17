/**
 * Building a finding's query in the story (pure).
 *
 * Three shapes cover what a tile is usually for, and each maps onto a spec that already exists:
 * a dataset's **rows** (the grid's filters), a dataset's **summary** (group by + aggregates), and a
 * model's **metric** by some fields. Anything richer — joined fields, several orders, a window — is
 * a query built where it belongs (the Playground or the Data tab) and saved to a story.
 */

import type { DatasetAggregate, DatasetSummaryQuery } from '../../data/datasetsApi';
import { toApiFilters, type FilterRow } from './datasetRowsFilter';

export type FindingSourceKind = 'dataset' | 'semantic_model';
export type DatasetMode = 'rows' | 'summary';

export interface AggregateRow {
  fn: string;
  column: string;
}

export interface AddFindingForm {
  kind: FindingSourceKind;
  datasetId: string;
  modelId: string;
  datasetMode: DatasetMode;
  /** Rows mode: the grid's filter set, verbatim. */
  filters: FilterRow[];
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  /** Summary mode: one group column (optionally by a grain) and the aggregates over it. */
  groupBy: string;
  granularity: string;
  aggregates: AggregateRow[];
  /** Model mode. */
  metric: string;
  modelGroupBy: Array<{ field: string; granularity: string }>;
  modelLimit: number;
}

export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'] as const;
export const AGGREGATE_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;

export function emptyForm(limit = 100): AddFindingForm {
  return {
    kind: 'dataset',
    datasetId: '',
    modelId: '',
    datasetMode: 'rows',
    filters: [],
    sort: '',
    order: 'desc',
    limit,
    groupBy: '',
    granularity: '',
    aggregates: [{ fn: 'count', column: '' }],
    metric: '',
    modelGroupBy: [],
    modelLimit: 100,
  };
}

export type QueryResult =
  | { ok: true; kind: FindingSourceKind; id: string; query: Record<string, unknown> }
  | { ok: false; reason: 'no_source' | 'no_metric' | 'no_group_by' | 'no_aggregate' };

/** The spec this form describes — or why it cannot be run yet. */
export function toQuery(form: AddFindingForm): QueryResult {
  if (form.kind === 'semantic_model') {
    if (!form.modelId) return { ok: false, reason: 'no_source' };
    if (!form.metric) return { ok: false, reason: 'no_metric' };
    return {
      ok: true,
      kind: 'semantic_model',
      id: form.modelId,
      query: {
        metric: form.metric,
        group_by: form.modelGroupBy
          .filter((g) => g.field)
          .map((g) => (g.granularity ? { field: g.field, granularity: g.granularity } : { field: g.field })),
        filters: [],
        order_by: [],
        limit: form.modelLimit,
      },
    };
  }
  if (!form.datasetId) return { ok: false, reason: 'no_source' };
  if (form.datasetMode === 'rows') {
    return {
      ok: true,
      kind: 'dataset',
      id: form.datasetId,
      query: {
        filters: toApiFilters(form.filters),
        sort: form.sort || null,
        order: form.order,
        limit: form.limit,
        offset: 0,
      },
    };
  }
  if (!form.groupBy) return { ok: false, reason: 'no_group_by' };
  const aggregates: DatasetAggregate[] = form.aggregates
    .filter((a) => a.fn)
    .map((a) => (a.fn === 'count' ? { fn: a.fn } : { fn: a.fn, column: a.column }));
  if (aggregates.length === 0) return { ok: false, reason: 'no_aggregate' };
  const query: DatasetSummaryQuery = {
    group_by: form.granularity
      ? [{ column: form.groupBy, granularity: form.granularity }]
      : [{ column: form.groupBy }],
    aggregates,
    filters: toApiFilters(form.filters),
    order_by: [],
    limit: form.limit,
  };
  return { ok: true, kind: 'dataset', id: form.datasetId, query: { ...query } };
}
