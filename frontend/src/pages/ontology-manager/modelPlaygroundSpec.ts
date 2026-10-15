import type { SemanticModelQuerySpec } from '../../data/semanticModelsApi';

/**
 * The Playground's query spec: one object, shared by the editor, the `?q=` URL, `Copy query` and
 * (through that) the skill/agent. Kept out of the component so the parsing rules are testable.
 */

export const DEFAULT_LIMIT = 100;

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

/** Every list present, so the editor can `.map` without guarding (the API defaults them too). */
function normalize(spec: Partial<SemanticModelQuerySpec> & { metric: string }): SemanticModelQuerySpec {
  return {
    metric: spec.metric,
    group_by: Array.isArray(spec.group_by) ? spec.group_by : [],
    filters: Array.isArray(spec.filters) ? spec.filters : [],
    order_by: Array.isArray(spec.order_by) ? spec.order_by : [],
    limit: typeof spec.limit === 'number' && spec.limit > 0 ? spec.limit : DEFAULT_LIMIT,
  };
}

/**
 * Parse the spec a URL carries. Partial specs are valid — a metric row links in with just
 * `{metric}`, and the API fills in the lists — so anything missing is normalized here rather than
 * handed to the editor as-is.
 */
export function specFromUrl(raw: string | null): SemanticModelQuerySpec | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SemanticModelQuerySpec> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.metric !== 'string') return null;
    return normalize(parsed as Partial<SemanticModelQuerySpec> & { metric: string });
  } catch {
    return null;
  }
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
