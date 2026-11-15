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

export type OperandDraft = {
  kind: 'metric' | 'dataset_agg';
  metricId: string;
  datasetId: string;
  aggFn: AggFn;
  aggColumn: string;
};

export type RowShape = 'single' | 'ratio' | 'diff';

export type ConditionRow = {
  id: string;
  shape: RowShape;
  left: OperandDraft;
  /** The right operand of a ratio / difference; unused for `single`. */
  right: OperandDraft;
  op: string;
  value: string;
};

function newId() {
  return `row-${Math.random().toString(36).slice(2, 9)}`;
}

export function newOperand(seed: { metricId?: string; datasetId?: string } = {}): OperandDraft {
  return {
    kind: 'metric',
    metricId: seed.metricId ?? '',
    datasetId: seed.datasetId ?? '',
    aggFn: 'count',
    aggColumn: '',
  };
}

export function newRow(seed: { metricId?: string; datasetId?: string } = {}): ConditionRow {
  return {
    id: newId(),
    shape: 'single',
    left: newOperand(seed),
    right: newOperand(seed),
    op: '>',
    value: '0',
  };
}

function operandOf(draft: OperandDraft): RuleOperand | null {
  if (draft.kind === 'metric') {
    return draft.metricId ? ({ metric: draft.metricId } as RuleOperand) : null;
  }
  if (!draft.datasetId) return null;
  const agg: Record<string, unknown> = { dataset_id: draft.datasetId, fn: draft.aggFn };
  if (draft.aggColumn.trim() && draft.aggFn !== 'count') agg.column = draft.aggColumn.trim();
  return { dataset_agg: agg } as RuleOperand;
}

function operandFromJson(node: unknown): OperandDraft | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  const draft = newOperand();
  if (typeof record.metric === 'string') {
    draft.kind = 'metric';
    draft.metricId = record.metric;
    return draft;
  }
  const agg = record.dataset_agg as { dataset_id?: string; fn?: AggFn; column?: string } | undefined;
  if (agg?.dataset_id && agg.fn) {
    draft.kind = 'dataset_agg';
    draft.datasetId = agg.dataset_id;
    draft.aggFn = agg.fn;
    draft.aggColumn = agg.column ?? '';
    return draft;
  }
  return null; // a nested ratio/diff, or an operand shape this editor does not draw
}

function leftOperand(row: ConditionRow): RuleOperand | null {
  const left = operandOf(row.left);
  if (!left) return null;
  if (row.shape === 'single') return left;
  const right = operandOf(row.right);
  if (!right) return null;
  return { [row.shape]: [left, right] } as RuleOperand;
}

/** Rows → the wire shape: one comparison, or `all` of them. Empty rows are dropped. */
export function conditionFromRows(rows: ConditionRow[]): RuleCondition | null {
  const comparisons = rows
    .map((row) => {
      const left = leftOperand(row);
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
    const row = newRow(seed);
    row.op = cmp.op;
    row.value = String(cmp.right?.value ?? 0);
    const direct = operandFromJson(left);
    if (direct) {
      row.shape = 'single';
      row.left = direct;
    } else {
      const pair = (['ratio', 'diff'] as const).find((key) => Array.isArray(left[key]));
      if (!pair) return null;
      const [a, b] = left[pair] as unknown[];
      const leftDraft = operandFromJson(a);
      const rightDraft = operandFromJson(b);
      if (!leftDraft || !rightDraft) return null;
      row.shape = pair;
      row.left = leftDraft;
      row.right = rightDraft;
    }
    rows.push(row);
  }
  return rows.length > 0 ? rows : [newRow(seed)];
}
