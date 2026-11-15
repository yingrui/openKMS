/**
 * A rule's condition, as rows — no nesting, but with the operand shapes the engine actually supports.
 *
 * A row is one comparison whose left side is an operand: a metric, a dataset aggregate, or a ratio /
 * difference of two operands. (The first version only allowed ratio-of-two-metrics, so the real rule
 * `分货额度 ÷ 分货明细.sum(gap) > 1` could not be shown at all — the editor silently displayed nothing.)
 *
 * Unsupported shapes (a ratio of a ratio, a nested `all`) are reported as `null` rather than approximated:
 * the page then shows the stored text and refuses to save, so an edit can never quietly rewrite the rule.
 */
import type { RuleCondition, RuleOperand } from '../../../data/rulesApi';

export const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type AggFn = (typeof AGG_FNS)[number];
// Filters reach us as stored JSON: the engine validates them, the label only reads them.
export type OperandFilter = { field?: string; column?: string; op?: string; value?: unknown; label?: string };

export const OPS = ['>', '>=', '<', '<=', '==', '!='] as const;

export type LeafOperandDraft =
  | { kind: 'metric'; metricId: string }
  | { kind: 'dataset_agg'; datasetId: string; aggFn: AggFn; aggColumn: string };

/** An operand, as the engine sees it: a leaf, or a ratio / difference of two operands. */
export type OperandDraft = LeafOperandDraft | { kind: 'ratio' | 'diff'; left: OperandDraft; right: OperandDraft };

export type ConditionRow = {
  id: string;
  operand: OperandDraft;
  op: string;
  value: string;
};

function newId() {
  return `row-${Math.random().toString(36).slice(2, 9)}`;
}

export function newOperand(seed: { metricId?: string; datasetId?: string } = {}): OperandDraft {
  if (seed.datasetId && !seed.metricId) {
    return { kind: 'dataset_agg', datasetId: seed.datasetId, aggFn: 'count', aggColumn: '' };
  }
  return { kind: 'metric', metricId: seed.metricId ?? '' };
}

export function newRow(seed: { metricId?: string; datasetId?: string } = {}): ConditionRow {
  return { id: newId(), operand: newOperand(seed), op: '>', value: '0' };
}

function operandOf(draft: OperandDraft): RuleOperand | null {
  if (draft.kind === 'metric') {
    return draft.metricId ? ({ metric: draft.metricId } as RuleOperand) : null;
  }
  if (draft.kind === 'dataset_agg') {
    if (!draft.datasetId) return null;
    const agg: Record<string, unknown> = { dataset_id: draft.datasetId, fn: draft.aggFn };
    if (draft.aggColumn.trim() && draft.aggFn !== 'count') agg.column = draft.aggColumn.trim();
    return { dataset_agg: agg } as RuleOperand;
  }
  const left = operandOf(draft.left);
  const right = operandOf(draft.right);
  if (!left || !right) return null;
  return { [draft.kind]: [left, right] } as RuleOperand;
}

function operandFromJson(node: unknown, depth = 0): OperandDraft | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (typeof record.metric === 'string') {
    return { kind: 'metric', metricId: record.metric };
  }
  const agg = record.dataset_agg as { dataset_id?: string; fn?: AggFn; column?: string } | undefined;
  if (agg?.dataset_id && agg.fn) {
    return { kind: 'dataset_agg', datasetId: agg.dataset_id, aggFn: agg.fn, aggColumn: agg.column ?? '' };
  }
  for (const pair of ['ratio', 'diff'] as const) {
    const parts = record[pair];
    if (Array.isArray(parts) && depth < 2) {
      const left = operandFromJson(parts[0], depth + 1);
      const right = operandFromJson(parts[1], depth + 1);
      if (left && right) return { kind: pair, left, right };
      return null; // deeper nesting: the editor does not draw it, and approximating would lose meaning
    }
  }
  return null;
}

/** Rows → the wire shape: one comparison, or `all` of them. Empty rows are dropped. */
export function conditionFromRows(rows: ConditionRow[]): RuleCondition | null {
  const comparisons = rows
    .map((row) => {
      const left = operandOf(row.operand);
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
 * (a nested group, an `any`, a ratio of a ratio) — the page then refuses to save instead of
 * rewriting the rule into whatever the empty editor happens to hold.
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
    const operand = operandFromJson(left);
    if (!operand) return null;
    const row = newRow(seed);
    row.op = cmp.op;
    row.value = String(cmp.right?.value ?? 0);
    row.operand = operand;
    rows.push(row);
  }
  return rows.length > 0 ? rows : [newRow(seed)];
}
