/**
 * Condition ⇄ builder conversion.
 *
 * The builder covers everything the evaluator accepts for a *rule author*: one or more comparisons
 * joined by AND (`all`) or OR (`any`), where each left value is a metric, a dataset aggregate, or a
 * ratio/difference of those two. Anything else (an aggregate of an aggregate, a comparison whose right
 * side is not a constant) is not representable in a form — `toBuilder` returns `null` with a reason and
 * the editor keeps the JSON view, rather than dropping what it cannot draw.
 *
 * Pure functions on purpose: the shape rules live in one testable place, not in JSX.
 */

import type { RuleCondition, RuleOperand } from '../../data/rulesApi';

export type LeafOperand =
  | { kind: 'metric'; metricId: string }
  | { kind: 'dataset_agg'; datasetId: string; fn: string; column: string };

export type BuilderOperand =
  | LeafOperand
  | { kind: 'ratio' | 'diff'; left: LeafOperand; right: LeafOperand };

export type BuilderRow = { operand: BuilderOperand; op: string; value: string };
export type BuilderCondition = { mode: 'all' | 'any'; rows: BuilderRow[] };

export const BUILDER_OPS = ['<', '<=', '>', '>=', '==', '!='] as const;
export const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;

function toLeaf(operand: RuleOperand): LeafOperand | null {
  if ('metric' in operand) return { kind: 'metric', metricId: operand.metric };
  if ('dataset_agg' in operand) {
    const agg = operand.dataset_agg;
    return {
      kind: 'dataset_agg',
      datasetId: agg.dataset_id,
      fn: agg.fn,
      column: agg.column ?? '',
    };
  }
  return null;
}

function toOperand(operand: RuleOperand): BuilderOperand | null {
  const leaf = toLeaf(operand);
  if (leaf) return leaf;
  if ('ratio' in operand) {
    const left = toLeaf(operand.ratio[0]);
    const right = toLeaf(operand.ratio[1]);
    return left && right ? { kind: 'ratio', left, right } : null;
  }
  if ('diff' in operand) {
    const left = toLeaf(operand.diff[0]);
    const right = toLeaf(operand.diff[1]);
    return left && right ? { kind: 'diff', left, right } : null;
  }
  return null;
}

function fromOperand(operand: BuilderOperand | LeafOperand): RuleOperand {
  if (operand.kind === 'metric') return { metric: operand.metricId };
  if (operand.kind === 'dataset_agg') {
    return {
      dataset_agg: {
        dataset_id: operand.datasetId,
        fn: operand.fn as 'count' | 'sum' | 'avg' | 'min' | 'max',
        column: operand.fn === 'count' ? null : operand.column,
      },
    };
  }
  return { [operand.kind]: [fromOperand(operand.left), fromOperand(operand.right)] } as RuleOperand;
}

/** `null` when the condition has a shape the form cannot draw (the editor then shows JSON). */
export function toBuilder(condition: RuleCondition | null): { builder: BuilderCondition; reason?: undefined } | { builder: null; reason: string } {
  if (!condition) return { builder: null, reason: 'empty' };
  const isGroup = 'all' in condition || 'any' in condition;
  const comparisons = isGroup ? ('all' in condition ? condition.all : condition.any) : [condition];
  const rows: BuilderRow[] = [];
  for (const comparison of comparisons) {
    if (!('left' in comparison)) {
      // A nested group: the evaluator flattens these, but drawing them as one flat list would change
      // the meaning (mixed AND/OR), so the form declines and JSON stays.
      return { builder: null, reason: 'nested group' };
    }
    const operand = toOperand(comparison.left);
    if (!operand) return { builder: null, reason: 'unsupported operand' };
    const op = String(comparison.op);
    if (!BUILDER_OPS.includes(op as (typeof BUILDER_OPS)[number])) {
      return { builder: null, reason: 'unsupported operator' };
    }
    rows.push({ operand, op, value: String(comparison.right.value) });
  }
  return { builder: { mode: 'any' in condition ? 'any' : 'all', rows } };
}

export function fromBuilder(builder: BuilderCondition): RuleCondition {
  const comparisons = builder.rows.map((row) => ({
    left: fromOperand(row.operand),
    op: row.op,
    right: { value: Number(row.value) },
  }));
  if (comparisons.length === 1) return comparisons[0] as RuleCondition;
  return { [builder.mode]: comparisons } as RuleCondition;
}

/** Default row for "add comparison" — keeps the builder usable without opening a picker first. */
export function emptyRow(metricId: string, datasetId = ''): BuilderRow {
  return {
    operand: metricId ? { kind: 'metric', metricId } : { kind: 'dataset_agg', datasetId, fn: 'count', column: '' },
    op: '>',
    value: '0',
  };
}
