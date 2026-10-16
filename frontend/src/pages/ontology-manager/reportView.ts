/**
 * How a report's result is presented — presentation only.
 *
 * A report owns its query and its result rows; the **view** says how to read them. Three shapes,
 * because a dashboard is not four line charts: a **trend** (line/bar), a **number** (metric) and a
 * **ranking** (bar list) — plus no view at all, which is the table.
 *
 * Kept pure and tested: a view the result cannot satisfy falls back to the table instead of
 * rendering something misleading.
 */

export type ExplorerChartType = 'line' | 'bar';
export type ReportViewKind = 'chart' | 'metric' | 'bar_list' | 'tracker';

export interface ExplorerChartSpec {
  /** `line` for a series over time, `bar` to compare categories. */
  type: ExplorerChartType;
  /** The column drawn along the category axis. */
  x: string;
  /** The measure column(s) drawn along the value axis. */
  y: string[];
  /** Optional grouping column: one line/bar per distinct value (a single `y` only). */
  series: string | null;
}

/** Beyond this many groups a chart stops being readable — the rest is dropped, and said so. */
export const MAX_CHART_SERIES = 8;
/** A tracker is a strip: past this many rows its blocks are too small to read. */
export const MAX_TRACKER_CELLS = 60;
/** A bar list is a ranking: past this many rows it is a table with bars on it. */
export const MAX_BAR_LIST_ROWS = 10;

/**
 * One number, named by the column it comes from.
 *
 * With a `trend` it is a **KPI**: the headline becomes the series' **last** row (order your query so
 * the row you want on top is last), the tile shows the change against the previous value, and a
 * sparkline gives the shape. Without one it is the **first** row — a query reduced to a single row.
 */
export interface ReportMetricView {
  kind: 'metric';
  column: string;
  label: string | null;
  trend: { x: string } | null;
}

/**
 * A strip of small blocks, one per row — coverage, missingness, streaks.
 *
 * Intensity is the value relative to the largest one, so it reads without thresholds (which this
 * layer does not declare); the value is on hover.
 */
export interface ReportTrackerView {
  kind: 'tracker';
  column: string;
  x: string;
  label: string | null;
}

/** A ranking: a value column, labelled by another column (the row's first text column by default). */
export interface ReportBarListView {
  kind: 'bar_list';
  column: string;
  labelColumn: string | null;
}

export interface ReportChartView extends ExplorerChartSpec {
  kind: 'chart';
}

export type ReportView = ReportChartView | ReportMetricView | ReportBarListView | ReportTrackerView;

/** The view a report declares, or `null` (the table). Accepts the v1 `{type,x,y}` chart shape. */
export function parseView(raw: unknown): ReportView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  if (kind === 'metric') {
    const column = asName(record.column);
    if (!column) return null;
    const label = record.label === undefined || record.label === null ? null : asName(record.label);
    if (record.label !== undefined && record.label !== null && !label) return null;
    // `trend` needs the column that orders the series; anything else is not a trend.
    const rawTrend = record.trend;
    if (rawTrend !== undefined && rawTrend !== null) {
      if (typeof rawTrend !== 'object' || Array.isArray(rawTrend)) return null;
      const x = asName((rawTrend as Record<string, unknown>).x);
      if (!x) return null;
      return { kind: 'metric', column, label, trend: { x } };
    }
    return { kind: 'metric', column, label, trend: null };
  }
  if (kind === 'tracker') {
    const column = asName(record.column);
    const x = asName(record.x);
    if (!column || !x) return null;
    const label = record.label === undefined || record.label === null ? null : asName(record.label);
    if (record.label !== undefined && record.label !== null && !label) return null;
    return { kind: 'tracker', column, x, label };
  }
  if (kind === 'bar_list') {
    const column = asName(record.column);
    if (!column) return null;
    const labelColumn =
      record.label_column === undefined || record.label_column === null
        ? null
        : asName(record.label_column);
    if (record.label_column !== undefined && record.label_column !== null && !labelColumn) return null;
    return { kind: 'bar_list', column, labelColumn };
  }
  // No `kind`: the v1 shape was a chart (`{type, x, y, series}`).
  const chart = parseChartSpec({ ...record, kind: undefined });
  return chart ? { kind: 'chart', ...chart } : null;
}

/** Whether the view's columns exist in the result the report returned. */
export function viewFits(view: ReportView | null, columns: string[] | undefined): boolean {
  if (!view || !columns || columns.length === 0) return false;
  const known = new Set(columns);
  if (view.kind === 'metric') {
    return known.has(view.column) && (!view.trend || known.has(view.trend.x));
  }
  if (view.kind === 'bar_list') {
    return known.has(view.column) && (!view.labelColumn || known.has(view.labelColumn));
  }
  if (view.kind === 'tracker') {
    return known.has(view.column) && known.has(view.x);
  }
  return chartFits(view, columns);
}

/**
 * The number a metric view shows: the **last** row with a `trend` (a KPI is the current value), the
 * **first** row without one (the query already reduced to a single row).
 */
export function metricValue(
  rows: Array<Record<string, unknown>>,
  view: ReportMetricView,
): number | string | null {
  const row = view.trend ? [...rows].reverse().find((r) => r[view.column] !== null && r[view.column] !== undefined) : rows[0];
  if (!row) return null;
  const value = row[view.column];
  return value === undefined ? null : (value as number | string | null);
}

export interface MetricDelta {
  /** The last value and the one before it, both numeric. */
  value: number;
  previous: number;
  /** `(value - previous) / |previous|`; `null` when the previous value was 0 (a ratio of zero). */
  ratio: number | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * The change a KPI shows: the last two numeric rows of the series (nulls skipped, so a gap in the
 * middle of a series does not swallow the comparison). `null` when there is nothing to compare.
 */
export function metricDelta(
  rows: Array<Record<string, unknown>>,
  view: ReportMetricView,
): MetricDelta | null {
  const values = [...rows]
    .map((row) => numericValue(row[view.column]))
    .filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const value = values[values.length - 1];
  const previous = values[values.length - 2];
  const change = value - previous;
  return {
    value,
    previous,
    ratio: previous === 0 ? null : change / Math.abs(previous),
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

export interface SparkPoint {
  label: string;
  value: number;
}

/** The series behind a KPI, in the query's order (nulls dropped: a sparkline has no gaps). */
export function metricSeries(
  rows: Array<Record<string, unknown>>,
  view: ReportMetricView,
): SparkPoint[] {
  const out: SparkPoint[] = [];
  for (const row of rows) {
    const value = numericValue(row[view.column]);
    if (value === null) continue;
    const raw = view.trend ? row[view.trend.x] : undefined;
    out.push({ label: raw === null || raw === undefined ? '' : String(raw), value });
  }
  return out;
}

export interface TrackerCell {
  label: string;
  value: number;
  /** Value relative to the largest in the strip (0–1) — the block's intensity. */
  intensity: number;
}

/** A tracker's blocks: one per numeric row, capped, with the intensity of each. */
export function trackerCells(
  rows: Array<Record<string, unknown>>,
  view: ReportTrackerView,
): { cells: TrackerCell[]; truncated: boolean } {
  const points = rows
    .map((row) => ({ label: row[view.x], value: numericValue(row[view.column]) }))
    .filter((p): p is { label: unknown; value: number } => p.value !== null);
  const kept = points.slice(-MAX_TRACKER_CELLS);
  const largest = kept.reduce((max, p) => Math.max(max, Math.abs(p.value)), 0);
  return {
    cells: kept.map((p) => ({
      label: p.label === null || p.label === undefined ? '' : String(p.label),
      value: p.value,
      intensity: largest > 0 ? Math.abs(p.value) / largest : 0,
    })),
    truncated: points.length > kept.length,
  };
}

export interface BarListRow {
  label: string;
  value: number;
  /** Share of the listed values (not of the underlying population). */
  share: number;
}

/**
 * A ranking: numeric rows sorted descending, capped, with each one's share of the listed total.
 *
 * `labelColumn` falls back to the first column that is not the value column — usually the category.
 */
export function barListRows(
  rows: Array<Record<string, unknown>>,
  view: ReportBarListView,
): { rows: BarListRow[]; truncated: boolean } {
  const labelColumn = view.labelColumn ?? null;
  const points: Array<{ label: string; value: number }> = [];
  for (const row of rows) {
    const value = numericValue(row[view.column]);
    if (value === null) continue;
    const raw = labelColumn ? row[labelColumn] : undefined;
    const label =
      raw === undefined || raw === null
        ? Object.entries(row).find(([k]) => k !== view.column)?.[1]
        : raw;
    points.push({ label: label === null || label === undefined ? '' : String(label), value });
  }
  points.sort((a, b) => b.value - a.value);
  const kept = points.slice(0, MAX_BAR_LIST_ROWS);
  const total = kept.reduce((sum, p) => sum + Math.abs(p.value), 0);
  return {
    rows: kept.map((p) => ({ ...p, share: total > 0 ? Math.abs(p.value) / total : 0 })),
    truncated: points.length > kept.length,
  };
}

function asName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Parse a stored spec; `null` when it is absent or malformed. */
export function parseChartSpec(raw: unknown): ExplorerChartSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const type = record.type === 'bar' ? 'bar' : record.type === undefined || record.type === 'line' ? 'line' : null;
  if (!type) return null;
  const x = asName(record.x);
  if (!x) return null;
  const rawY = Array.isArray(record.y) ? record.y : [record.y];
  const y = rawY.map(asName).filter((name): name is string => name !== null);
  if (y.length === 0) return null;
  const series = record.series === undefined || record.series === null ? null : asName(record.series);
  if (record.series !== undefined && record.series !== null && !series) return null;
  // A grouping column with several measures has no defined drawing — reject rather than guess.
  if (series && y.length > 1) return null;
  return { type, x, y, series };
}

/** Whether the chart's columns exist in the result the report returned. */
export function chartFits(spec: ExplorerChartSpec | null, columns: string[] | undefined): boolean {
  if (!spec || !columns || columns.length === 0) return false;
  const known = new Set(columns);
  return known.has(spec.x) && spec.y.every((name) => known.has(name)) && (!spec.series || known.has(spec.series));
}

/** The plotted value, or `null` when the cell is not numeric (a decimal arrives as a string). */
export function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

/** The first column that reads like dates, if any — a time series wants a line. */
export function detectTemporal(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string | null {
  return columns.find((c) => looksTemporal(rows, c)) ?? null;
}

/** A tick labels a point — it does not need a time of day: `2026-01-01T00:00:00+00:00` → `2026-01-01`. */
export function xLabel(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(text);
  return match ? match[1] : text;
}

export interface ChartSeries {
  /** The dataKeys to draw, in legend order. */
  keys: string[];
  /** One point per x value (one object per series value when grouping). */
  data: Array<Record<string, unknown>>;
  /** Whether grouping dropped values beyond `MAX_CHART_SERIES`. */
  truncated: boolean;
}

const X_KEY = '__x';

/** Rows → the points to draw. Grouping pivots the series column into one key per value. */
export function chartSeries(
  rows: Array<Record<string, unknown>>,
  spec: ExplorerChartSpec,
): ChartSeries {
  if (!spec.series) {
    return {
      keys: spec.y,
      data: rows.map((row) => {
        const point: Record<string, unknown> = { [X_KEY]: row[spec.x] };
        for (const name of spec.y) point[name] = numericValue(row[name]);
        return point;
      }),
      truncated: false,
    };
  }

  const measure = spec.y[0];
  const grouped = new Map<string, Record<string, unknown>>();
  const keys: string[] = [];
  let truncated = false;
  for (const row of rows) {
    const x = row[spec.x];
    const label = x === null || x === undefined ? '' : String(x);
    let point = grouped.get(label);
    if (!point) {
      point = { [X_KEY]: x };
      grouped.set(label, point);
    }
    const name = row[spec.series] === null || row[spec.series] === undefined ? '' : String(row[spec.series]);
    if (!keys.includes(name)) {
      if (keys.length >= MAX_CHART_SERIES) {
        truncated = true;
        continue;
      }
      keys.push(name);
    }
    point[name] = numericValue(row[measure]);
  }
  return { keys, data: [...grouped.values()], truncated };
}

/** The category-axis key recharts reads — never a data column, so a column may be called `x`. */
export const CHART_X_KEY = X_KEY;
