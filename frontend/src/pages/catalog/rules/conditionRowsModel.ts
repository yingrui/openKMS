/**
 * A rule's condition, as rows — no nesting.
 *
 * The nested editor (groups inside groups, OR, a raw-JSON view) was removed: in practice rules are one
 * comparison, or a few comparisons that must all hold. That is a flat list, and a flat list is also what the
 * validation accepts, so the editor cannot express something the server refuses.
 */
import type { RuleCondition, RuleOperand } from '../../../data/rulesApi';

export const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type AggFn = (typeof AGG_FNS)[number];
// Filters reach us as stored JSON: the engine validates them, the label only reads them.
export type OperandFilter = { field?: string; column?: string; op?: string; value?: unknown; label?: string };

export type OperandKind = 'metric' | 'dataset_agg' | 'ratio';

export type ConditionRow = {
  id: string;
  kind: OperandKind;
  metricId: string;
  datasetId: string;
  aggFn: AggFn;
  aggColumn: string;
  /** `ratio` only: numerator and denominator metrics. */
  numeratorId: string;
  denominatorId: string;
  op: string;
  value: string;
};

export const OPS = ['>', '>=', '<', '<=', '==', '!='] as const;

export function newRow(seed: { metricId?: string; datasetId?: string } = {}): ConditionRow {
  return {
    id: `row-${Math.random().toString(36).slice(2, 9)}`,
    kind: 'metric',
    metricId: seed.metricId ?? '',
    datasetId: seed.datasetId ?? '',
    aggFn: 'count',
    aggColumn: '',
    numeratorId: seed.metricId ?? '',
    denominatorId: '',
    op: '>',
    value: '0',
  };
}

function operandOf(row: ConditionRow): RuleOperand | null {
  if (row.kind === 'metric') {
    return row.metricId ? ({ metric: row.metricId } as RuleOperand) : null;
  }
  if (row.kind === 'dataset_agg') {
    if (!row.datasetId) return null;
    const agg: Record<string, unknown> = { dataset_id: row.datasetId, fn: row.aggFn };
    if (row.aggColumn.trim() && row.aggFn !== 'count') agg.column = row.aggColumn.trim();
    return { dataset_agg: agg } as RuleOperand;
  }
  if (!row.numeratorId || !row.denominatorId) return null;
  return { ratio: [{ metric: row.numeratorId }, { metric: row.denominatorId }] } as RuleOperand;
}

/** Rows → the wire shape: one comparison, or `all` of them. Empty rows are dropped. */
export function conditionFromRows(rows: ConditionRow[]): RuleCondition | null {
  const comparisons = rows
    .map((row) => {
      const left = operandOf(row);
      const value = Number(row.value);
      if (!left || !Number.isFinite(value)) return null;
      return { left, op: row.op, right: { value } };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (comparisons.length === 0) return null;
  return (comparisons.length === 1 ? comparisons[0] : { all: comparisons }) as RuleCondition;
}

/**
 * The wire shape → rows. Returns `null` when the stored condition is something this editor cannot show
 * (a nested group, an `any`, a chained operand) — the page then says so instead of silently rewriting it.
 */
export function rowsFromCondition(
  condition: RuleCondition | null | undefined,
  seed: { metricId?: string; datasetId?: string } = {},
): ConditionRow[] | null {
  if (!condition) return [newRow(seed)];
  const wrapped = condition as { all?: unknown[]; any?: unknown[]; left?: unknown };
  if (wrapped.any) return null;
  const list = Array.isArray(wrapped.all) ? wrapped.all : 'left' in wrapped ? [condition] : null;
  if (!list) return null;
  const rows: ConditionRow[] = [];
  for (const item of list) {
    const cmp = item as { left?: Record<string, unknown>; op?: string; right?: { value?: unknown } };
    const left = cmp.left;
    if (!left || typeof cmp.op !== 'string') return null;
    const row = newRow(seed);
    row.op = cmp.op;
    row.value = String(cmp.right?.value ?? 0);
    if ('metric' in left && typeof left.metric === 'string') {
      row.kind = 'metric';
      row.metricId = left.metric;
    } else if ('dataset_agg' in left && left.dataset_agg) {
      const agg = left.dataset_agg as { dataset_id?: string; fn?: AggFn; column?: string };
      if (!agg.dataset_id || !agg.fn) return null;
      row.kind = 'dataset_agg';
      row.datasetId = agg.dataset_id;
      row.aggFn = agg.fn;
      row.aggColumn = agg.column ?? '';
    } else if ('ratio' in left && Array.isArray(left.ratio)) {
      const [num, den] = left.ratio as Array<{ metric?: string }>;
      if (!num?.metric || !den?.metric) return null;
      row.kind = 'ratio';
      row.numeratorId = num.metric;
      row.denominatorId = den.metric;
    } else {
      return null;
    }
    rows.push(row);
  }
  return rows.length > 0 ? rows : [newRow(seed)];
}
