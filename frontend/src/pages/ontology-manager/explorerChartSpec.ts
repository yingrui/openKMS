/**
 * A report block's chart spec — presentation only.
 *
 * The block owns its query and its result rows; the chart says *how to read them*, so the same
 * block can be drawn or tabulated. Kept pure and tested: a spec the result cannot satisfy falls
 * back to the table instead of rendering a misleading picture.
 */

export type ExplorerChartType = 'line' | 'bar';

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

/** Whether the spec's columns exist in the result the block returned. */
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
