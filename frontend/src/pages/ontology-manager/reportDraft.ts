/**
 * Turning a query someone just ran into a dashboard report (pure).
 *
 * The Playground (model) and the Data tab (dataset) both end with a result on screen; "save this"
 * means writing a **report** into a dashboard: its source, the query it came from, and — optionally —
 * how to draw it. The guesswork here is only a *default* the person can change in the dialog.
 */

import type { DashboardReport, ExplorerSourceKind } from '../../data/dashboardsApi';
import { parseView } from './reportView';
import type { SemanticModelQueryResponse, SemanticModelQuerySpec } from '../../data/semanticModelsApi';
import {
  detectTemporal,
  isNumericColumn,
  viewFits,
  type ReportView,
} from './reportView';

/** What a report can be presented as: a table, a trend, a number, or a ranking. */
export type ViewChoice = 'none' | 'line' | 'bar' | 'metric' | 'bar_list';

/** A model query the Playground just ran, and the model/metric that name it. */
export function modelReportDraft(args: {
  modelId: string;
  modelName: string;
  metricName?: string | null;
  spec: SemanticModelQuerySpec | null;
  result: SemanticModelQueryResponse | null;
}): ReportDraftInput | null {
  const { modelId, modelName, metricName, spec, result } = args;
  if (!spec || !result) return null;
  const metric = metricName ?? (typeof spec.metric === 'string' ? spec.metric : '');
  return {
    sourceKind: 'semantic_model',
    datasetId: null,
    semanticModelId: modelId,
    query: { ...spec },
    columns: result.columns,
    rows: result.rows,
    defaultTitle: metric ? `${modelName} · ${metric}` : modelName,
  };
}

/** A dataset slice the Data tab is showing: the filters it used, on the table's first page. */
export function datasetReportDraft(args: {
  datasetId: string;
  tableLabel: string;
  query: Record<string, unknown>;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}): ReportDraftInput {
  return {
    sourceKind: 'dataset',
    datasetId: args.datasetId,
    semanticModelId: null,
    query: args.query,
    columns: args.columns,
    rows: args.rows,
    defaultTitle: args.tableLabel,
  };
}

export interface ReportDraftInput {
  sourceKind: ExplorerSourceKind;
  datasetId: string | null;
  semanticModelId: string | null;
  /** The source's own query spec — exactly what the page just sent. */
  query: Record<string, unknown>;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** Prefilled title (a model + metric, or a table name). */
  defaultTitle: string;
}

export interface ViewDraft {
  choice: ViewChoice;
  /** A chart's category axis; a metric's or a ranking's **value** column. */
  x: string;
  /** A chart's measures (a metric/ranking infers its label column). */
  y: string[];
}

/**
 * The view to offer by default — a guess, never a decision:
 *
 * 1. **one row with a number** → a metric (a total is a number, not a chart);
 * 2. **a date column** → a line, with the numeric measures;
 * 3. **a short non-temporal result** → a bar list (a ranking reads better than bars);
 * 4. anything else → bars.
 */
export function guessView(columns: string[], rows: Array<Record<string, unknown>>): ViewDraft {
  const numeric = columns.filter((c) => isNumericColumn(rows, c));
  const temporal = detectTemporal(columns, rows);
  if (rows.length === 1 && numeric.length > 0) {
    return { choice: 'metric', x: numeric[0], y: [] };
  }
  if (temporal) {
    const y = numeric.filter((c) => c !== temporal).slice(0, 3);
    return y.length > 0 ? { choice: 'line', x: temporal, y } : { choice: 'none', x: temporal, y: [] };
  }
  if (numeric.length > 0 && rows.length <= 12) {
    return { choice: 'bar_list', x: numeric[0], y: [] };
  }
  const x = columns.find((c) => !numeric.includes(c)) ?? columns[0] ?? '';
  const y = numeric.filter((c) => c !== x).slice(0, 3);
  return x && y.length > 0 ? { choice: 'bar', x, y } : { choice: 'none', x, y: [] };
}

/**
 * The report to append to a dashboard's `reports` — or `null` when the chart choice is unusable
 * (no axis columns), in which case the report is still saved, as a table.
 */
export function buildReportEntry(
  draft: ReportDraftInput,
  options: { title: string; insight?: string | null; view: ViewDraft },
): DashboardReport {
  const entry: DashboardReport = {
    title: options.title.trim() || draft.defaultTitle,
    source_kind: draft.sourceKind,
    query: draft.query,
  };
  if (draft.sourceKind === 'semantic_model') {
    entry.semantic_model_id = draft.semanticModelId;
  } else {
    entry.dataset_id = draft.datasetId;
  }
  if (options.insight?.trim()) entry.insight = options.insight.trim();
  const view = viewSpec(options.view);
  if (view) entry.view = view;
  return entry;
}

/** A stored view → the draft the view fields edit, falling back to a table. */
export function viewDraftFromSpec(raw: unknown, columns: string[]): ViewDraft {
  const view = parseView(raw);
  if (!view || !viewFits(view, columns)) return { choice: 'none', x: columns[0] ?? '', y: [] };
  if (view.kind === 'chart') return { choice: view.type, x: view.x, y: view.y };
  return { choice: view.kind, x: view.column, y: [] };
}

/** A view draft → the stored view, or `null` for "table" / an unusable choice. */
export function viewSpec(view: ViewDraft): ReportView | null {
  if (!view.x) return null;
  if (view.choice === 'metric') return { kind: 'metric', column: view.x, label: null };
  if (view.choice === 'bar_list') return { kind: 'bar_list', column: view.x, labelColumn: null };
  if (view.choice === 'none' || view.y.length === 0) return null;
  return { kind: 'chart', type: view.choice, x: view.x, y: view.y, series: null };
}
