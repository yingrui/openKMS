import type { SemanticModelQuerySpec } from '../../../data/semanticModelsApi';

/**
 * The Playground's query spec: one object, shared by the editor, the `?q=` URL, `Copy query` and
 * (through that) the skill/agent. Kept out of the component so the parsing rules are testable.
 */

export const DEFAULT_LIMIT = 100;

export type PlaygroundMode = 'builder' | 'advanced' | 'sql';

const MODES = new Set<PlaygroundMode>(['builder', 'advanced', 'sql']);

/** Ops that need no value (`is_null` / `is_not_null`). */
export const NO_VALUE = new Set(['is_null', 'is_not_null']);

/** One editable filter row (two value inputs, so `between` works). */
export type FilterRow = { id: number; field: string; op: string; value: string; value2: string };

export const emptySpec = (metricId: string): SemanticModelQuerySpec => ({
  metric: metricId,
  group_by: [],
  filters: [],
  order_by: [],
  limit: DEFAULT_LIMIT,
});

/** Advanced starts from an expression + base dataset (no saved metric). */
export const emptyAdvancedSpec = (baseDatasetId = ''): SemanticModelQuerySpec => ({
  expression: '',
  base_dataset: baseDatasetId || null,
  joins: [],
  where: '',
  having: '',
  group_by: [],
  filters: [],
  order_by: [],
  limit: DEFAULT_LIMIT,
});

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

/** Every list present, so the editor can `.map` without guarding (the API defaults them too). */
export function normalize(spec: Partial<SemanticModelQuerySpec>): SemanticModelQuerySpec {
  const metric = typeof spec.metric === 'string' && spec.metric.trim() ? spec.metric : null;
  const expression =
    typeof spec.expression === 'string'
      ? spec.expression
      : spec.expression && typeof spec.expression === 'object'
        ? spec.expression
        : metric
          ? null
          : '';
  return {
    metric,
    expression,
    base_dataset: typeof spec.base_dataset === 'string' ? spec.base_dataset : null,
    joins: asStringList(spec.joins),
    where: typeof spec.where === 'string' ? spec.where : null,
    having: typeof spec.having === 'string' ? spec.having : null,
    group_by: Array.isArray(spec.group_by) ? spec.group_by : [],
    filters: Array.isArray(spec.filters) ? spec.filters : [],
    order_by: Array.isArray(spec.order_by) ? spec.order_by : [],
    limit: typeof spec.limit === 'number' && spec.limit > 0 ? spec.limit : DEFAULT_LIMIT,
  };
}

function hasQuerySeed(parsed: Partial<SemanticModelQuerySpec>): boolean {
  if (typeof parsed.metric === 'string' && parsed.metric.trim()) return true;
  if (typeof parsed.expression === 'string' && parsed.expression.trim()) return true;
  if (parsed.expression && typeof parsed.expression === 'object') return true;
  if (typeof parsed.base_dataset === 'string' && parsed.base_dataset.trim()) return true;
  if (typeof parsed.where === 'string' && parsed.where.trim()) return true;
  if (typeof parsed.having === 'string' && parsed.having.trim()) return true;
  return false;
}

/**
 * Parse the spec a URL carries. Partial specs are valid — a metric row links in with just
 * `{metric}`, and Advanced links with `{expression, base_dataset}` — so anything missing is
 * normalized here rather than handed to the editor as-is.
 */
export function specFromUrl(raw: string | null): SemanticModelQuerySpec | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SemanticModelQuerySpec> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!hasQuerySeed(parsed)) return null;
    return normalize(parsed);
  } catch {
    return null;
  }
}

export function modeFromUrl(raw: string | null): PlaygroundMode {
  if (raw && MODES.has(raw as PlaygroundMode)) return raw as PlaygroundMode;
  return 'builder';
}

/** Drop empty optional fields so Copy query / URL stay compact. */
export function compactSpec(spec: SemanticModelQuerySpec): SemanticModelQuerySpec {
  const next = normalize(spec);
  if (!next.metric) delete next.metric;
  if (
    next.expression == null ||
    next.expression === '' ||
    (typeof next.expression === 'object' && Object.keys(next.expression).length === 0)
  ) {
    delete next.expression;
  }
  if (!next.base_dataset) delete next.base_dataset;
  if (!next.joins?.length) delete next.joins;
  if (!next.where?.trim()) delete next.where;
  if (!next.having?.trim()) delete next.having;
  return next;
}

/** True when the run can call `/query` (metric XOR a non-empty expression). */
export function canRunQuery(spec: SemanticModelQuerySpec): boolean {
  const hasMetric = Boolean(spec.metric?.trim());
  const expr = spec.expression;
  const hasExpression =
    (typeof expr === 'string' && expr.trim().length > 0) ||
    (expr != null && typeof expr === 'object' && Object.keys(expr).length > 0);
  if (hasMetric === hasExpression) return false;
  if (hasExpression && !spec.base_dataset?.trim()) return false;
  return true;
}

/** Editor rows → the API's filter shape. */
export function toFilters(rows: FilterRow[]): SemanticModelQuerySpec['filters'] {
  return rows
    .filter((row) => row.field && row.op)
    .map((row) =>
      NO_VALUE.has(row.op)
        ? { field: row.field, op: row.op }
        : row.op === 'in'
          ? { field: row.field, op: row.op, value: row.value.split(',').map((v) => v.trim()).filter(Boolean) }
          : row.op === 'between'
            ? { field: row.field, op: row.op, value: [row.value, row.value2] }
            : { field: row.field, op: row.op, value: row.value },
    );
}
