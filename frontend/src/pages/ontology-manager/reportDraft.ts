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

/** What a report can be presented as: a table, a trend, a number, a ranking, or a strip. */
export type ViewChoice = 'none' | 'line' | 'bar' | 'combo' | 'metric' | 'bar_list' | 'tracker';

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
  /** The column that is measured: a metric's number, a ranking's bar, a tracker's intensity. */
  valueColumn: string;
  /** The column that orders/labels: a chart's axis, a metric's trend, a tracker's strip order. */
  axisColumn: string;
  /** A chart's measures (a combo's **bars**). */
  y: string[];
  /** A combo's line measures (right axis) — ignored by every other kind. */
  lines?: string[];
  /** A KPI's comparison distance in rows (1 = previous, 12 = the same month last year). */
  compare?: number;
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
  const other = (column: string) => columns.find((c) => c !== column) ?? '';
  if (rows.length === 1 && numeric.length > 0) {
    return {
      choice: 'metric',
      valueColumn: numeric[0],
      axisColumn: other(numeric[0]),
      y: [],
      compare: 1,
    };
  }
  if (temporal) {
    const y = numeric.filter((c) => c !== temporal).slice(0, 3);
    return {
      choice: y.length > 0 ? 'line' : 'none',
      valueColumn: y[0] ?? numeric[0] ?? '',
      axisColumn: temporal,
      y,
      compare: 1,
    };
  }
  if (numeric.length > 0 && rows.length <= 12) {
    return {
      choice: 'bar_list',
      valueColumn: numeric[0],
      axisColumn: other(numeric[0]),
      y: [],
      compare: 1,
    };
  }
  const axis = columns.find((c) => !numeric.includes(c)) ?? columns[0] ?? '';
  const y = numeric.filter((c) => c !== axis).slice(0, 3);
  return {
    choice: axis && y.length > 0 ? 'bar' : 'none',
    valueColumn: y[0] ?? numeric[0] ?? '',
    axisColumn: axis,
    y,
    compare: 1,
  };
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

const EMPTY_DRAFT = (columns: string[]): ViewDraft => ({
  choice: 'none',
  valueColumn: columns[0] ?? '',
  axisColumn: columns[1] ?? columns[0] ?? '',
  y: [],
  compare: 1,
});

/** A stored view → the draft the view fields edit, falling back to a table. */
export function viewDraftFromSpec(raw: unknown, columns: string[]): ViewDraft {
  const view = parseView(raw);
  if (!view || !viewFits(view, columns)) return EMPTY_DRAFT(columns);
  if (view.kind === 'chart') {
    return {
      choice: view.type,
      valueColumn: columns[0] ?? '',
      axisColumn: view.x,
      y: view.y,
      lines: view.lines ?? [],
      compare: 1,
    };
  }
  if (view.kind === 'metric') {
    return {
      choice: 'metric',
      valueColumn: view.column,
      axisColumn: view.trend?.x ?? columns.find((c) => c !== view.column) ?? '',
      y: [],
      compare: view.trend?.compare ?? 1,
    };
  }
  if (view.kind === 'tracker') {
    return { choice: 'tracker', valueColumn: view.column, axisColumn: view.x, y: [], compare: 1 };
  }
  return { choice: 'bar_list', valueColumn: view.column, axisColumn: '', y: [], compare: 1 };
}

/** A view draft → the stored view, or `null` for "table" / an unusable choice. */
export function viewSpec(view: ViewDraft): ReportView | null {
  if (view.choice === 'metric') {
    if (!view.valueColumn) return null;
    const trend =
      view.axisColumn && view.axisColumn !== view.valueColumn
        ? { x: view.axisColumn, compare: view.compare || 1 }
        : null;
    return { kind: 'metric', column: view.valueColumn, label: null, trend };
  }
  if (view.choice === 'bar_list') {
    return view.valueColumn ? { kind: 'bar_list', column: view.valueColumn, labelColumn: null } : null;
  }
  if (view.choice === 'tracker') {
    if (!view.valueColumn || !view.axisColumn || view.axisColumn === view.valueColumn) return null;
    return { kind: 'tracker', column: view.valueColumn, x: view.axisColumn, label: null };
  }
  if (view.choice === 'none' || !view.axisColumn) return null;
  if (view.choice === 'combo') {
    const lines = view.lines ?? [];
    if (view.y.length + lines.length === 0) return null;
    return { kind: 'chart', type: 'combo', x: view.axisColumn, y: view.y, lines, series: null };
  }
  if (view.y.length === 0) return null;
  return { kind: 'chart', type: view.choice, x: view.axisColumn, y: view.y, series: null };
}
