/**
 * Turning a query someone just ran into a dashboard report (pure).
 *
 * The Playground (model) and the Data tab (dataset) both end with a result on screen; "save this"
 * means writing a **report** into a dashboard: its source, the query it came from, and — optionally —
 * how to draw it. The guesswork here is only a *default* the person can change in the dialog.
 */

import type { DashboardReport, ExplorerSourceKind } from '../../data/dashboardsApi';
import type { SemanticModelQueryResponse, SemanticModelQuerySpec } from '../../data/semanticModelsApi';
import type { ExplorerChartSpec } from './explorerChartSpec';

export type ChartChoice = 'none' | 'line' | 'bar';

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

export interface ChartDraft {
  choice: ChartChoice;
  x: string;
  y: string[];
}

/** Whether a column holds numbers in the rows we have (a database may send them as strings). */
export function isNumericColumn(rows: Array<Record<string, unknown>>, column: string): boolean {
  let seen = 0;
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') {
      seen += 1;
      continue;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      seen += 1;
      continue;
    }
    return false;
  }
  return seen > 0;
}

/** Whether a column reads like dates — a time series wants a line, not bars. */
export function looksTemporal(rows: Array<Record<string, unknown>>, column: string): boolean {
  let samples = 0;
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string' && !(value instanceof Date)) return false;
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(value))) return false;
    samples += 1;
    if (samples >= 2) return true;
  }
  return false;
}

/** A chart to offer by default: measures over the first date column, else over the first column. */
export function guessChart(columns: string[], rows: Array<Record<string, unknown>>): ChartDraft {
  const x = columns.find((c) => looksTemporal(rows, c)) ?? columns[0] ?? '';
  const y = columns.filter((c) => c !== x && isNumericColumn(rows, c)).slice(0, 3);
  if (!x || y.length === 0) return { choice: 'none', x, y: [] };
  return { choice: looksTemporal(rows, x) ? 'line' : 'bar', x, y };
}

/**
 * The report to append to a dashboard's `reports` — or `null` when the chart choice is unusable
 * (no axis columns), in which case the report is still saved, as a table.
 */
export function buildReportEntry(
  draft: ReportDraftInput,
  options: { title: string; insight?: string | null; chart: ChartDraft },
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
  const spec = chartSpec(options.chart);
  if (spec) entry.chart = spec;
  return entry;
}

/** A chart draft → the stored spec, or `null` for "table" / an unusable choice. */
export function chartSpec(chart: ChartDraft): ExplorerChartSpec | null {
  if (chart.choice === 'none' || !chart.x || chart.y.length === 0) return null;
  return { type: chart.choice, x: chart.x, y: chart.y, series: null };
}
