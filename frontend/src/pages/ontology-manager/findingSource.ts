/**
 * Where a finding's numbers come from, named — for the tile and for the story's table of contents.
 *
 * One function, because the same resolution was written twice: the tile linked the source, and the
 * rail needed only its name.
 */

import type { StoryFinding } from '../../data/storiesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';
import { playgroundHrefFromDataQuery } from '../../data/catalogPlaygroundHref';
import { filtersToParam, type FilterRow } from './datasetRowsFilter';
import { datasetLabel } from './datasetLabel';

export interface FindingSource {
  label: string;
  /** The Catalog page for it, when there is one to open. */
  href: string | null;
  kind: 'dataset' | 'semantic_model';
}

function datasetDataHref(datasetId: string, query?: Record<string, unknown> | null): string {
  const base = `/datasets/${encodeURIComponent(datasetId)}/data`;
  const filters = query?.filters;
  if (!Array.isArray(filters) || filters.length === 0) return base;
  const rows: FilterRow[] = [];
  filters.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const f = raw as Record<string, unknown>;
    const column = typeof f.field === 'string' ? f.field : '';
    if (!column) return;
    const op = typeof f.op === 'string' ? f.op : '=';
    let value = '';
    let value2 = '';
    if (Array.isArray(f.value)) {
      value = f.value[0] == null ? '' : String(f.value[0]);
      value2 = f.value[1] == null ? '' : String(f.value[1]);
    } else if (f.value != null) {
      value = String(f.value);
    }
    rows.push({ id: index, column, op, value, value2 });
  });
  if (rows.length === 0) return base;
  const p = new URLSearchParams();
  p.set('f', filtersToParam(rows));
  return `${base}?${p.toString()}`;
}

function modelPlaygroundHref(modelId: string, query?: Record<string, unknown> | null): string {
  if (!query || typeof query !== 'object') {
    return `/data-model/${encodeURIComponent(modelId)}/playground`;
  }
  const sql = typeof query.sql === 'string' ? query.sql : '';
  const metric = typeof query.metric === 'string' ? query.metric : '';
  const expression =
    typeof query.expression === 'string'
      ? query.expression
      : query.expression && typeof query.expression === 'object'
        ? ''
        : '';
  if (sql || metric || expression) {
    return playgroundHrefFromDataQuery(modelId, {
      mode: sql ? 'sql' : metric ? 'metric' : 'expression',
      metric: metric || null,
      expression: expression || null,
      sql: sql || null,
    });
  }
  // Full Playground spec (group_by / filters / …) — same `?q=` the Playground already reads.
  const p = new URLSearchParams();
  p.set('mode', metric ? 'builder' : 'advanced');
  p.set('q', JSON.stringify(query));
  return `/data-model/${encodeURIComponent(modelId)}/playground?${p.toString()}`;
}

export function findingSource(
  finding: StoryFinding,
  datasets: DatasetResponse[],
  models: SemanticModelResponse[],
  missingLabel: string,
): FindingSource {
  if (finding.source_kind === 'semantic_model') {
    const model = models.find((m) => m.id === finding.semantic_model_id);
    return {
      kind: 'semantic_model',
      label: model?.name ?? missingLabel,
      href: finding.semantic_model_id
        ? modelPlaygroundHref(finding.semantic_model_id, finding.query)
        : null,
    };
  }
  const dataset = datasets.find((d) => d.id === finding.dataset_id);
  return {
    kind: 'dataset',
    label: dataset ? datasetLabel(dataset) : missingLabel,
    href: finding.dataset_id ? datasetDataHref(finding.dataset_id, finding.query) : null,
  };
}
