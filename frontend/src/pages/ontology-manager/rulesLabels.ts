/**
 * Rendering a condition and its computed values as words.
 *
 * The rendering must be readable *and* honest: it shows the operand structure (a ratio is drawn as a
 * division, a difference as a subtraction, nested ones in parentheses), the dataset a value aggregates,
 * and the filters that scope it — because a reader's first question is "is this the formula I meant?".
 * Anything the text leaves out is a lie about what the rule does.
 */

import type { RuleCondition, RuleOperand } from '../../data/rulesApi';
import { AGG_FNS, type AggFn, type OperandFilter } from './conditionModel';

export type LabelLookups = {
  metricName: (id: string) => string;
  datasetName?: (id: string) => string;
  /** Localised joiners; defaults keep the module usable outside React (tests, logs). */
  and?: string;
  or?: string;
};

function filterText(filters: OperandFilter[] | undefined): string {
  if (!filters?.length) return '';
  const parts = filters.map((filter) => {
    const field = String(filter.field ?? filter.column ?? '?');
    const op = String(filter.op ?? '=');
    return `${field} ${op} ${String(filter.value ?? '')}`.trim();
  });
  return `（${parts.join('，')}）`;
}

function leafLabel(
  kind: 'metric' | 'dataset_agg',
  id: string,
  filters: OperandFilter[] | undefined,
  agg: { fn: AggFn; column: string } | null,
  lookups: LabelLookups,
): string {
  if (kind === 'metric') return `${lookups.metricName(id)}${filterText(filters)}`;
  const dataset = lookups.datasetName?.(id) ?? id.slice(0, 8);
  const call = agg ? `${dataset}.${agg.fn}(${agg.column || '*'})` : `${dataset}.*`;
  return `${call}${filterText(filters)}`;
}

function operandLabelWith(operand: RuleOperand, lookups: LabelLookups, depth: number): string {
  if ('metric' in operand) return leafLabel('metric', operand.metric, operand.filters, null, lookups);
  if ('dataset_agg' in operand) {
    const agg = operand.dataset_agg;
    return leafLabel(
      'dataset_agg',
      agg.dataset_id,
      agg.filters,
      { fn: (AGG_FNS.includes(agg.fn as AggFn) ? agg.fn : 'count') as AggFn, column: agg.column ?? '' },
      lookups,
    );
  }
  if ('ratio' in operand) {
    return `(${operandLabelWith(operand.ratio[0], lookups, depth + 1)} ÷ ${operandLabelWith(operand.ratio[1], lookups, depth + 1)})`;
  }
  if ('diff' in operand) {
    return `(${operandLabelWith(operand.diff[0], lookups, depth + 1)} − ${operandLabelWith(operand.diff[1], lookups, depth + 1)})`;
  }
  return '?';
}

/** One operand: `分货额度`, `分货明细.sum(gap)（scenario_id = …）`, `(a ÷ b)`. */
export function operandLabel(operand: RuleOperand | { kind: string }, lookups: LabelLookups): string {
  // Builder/tree nodes (leaf with `metricId`) and stored operands (`{metric: id}`) both reach here.
  const node = operand as unknown as Record<string, unknown>;
  if (typeof node.metricId === 'string') {
    return leafLabel('metric', node.metricId, node.filters as OperandFilter[] | undefined, null, lookups);
  }
  if (typeof node.datasetId === 'string') {
    return leafLabel(
      'dataset_agg',
      node.datasetId,
      node.filters as OperandFilter[] | undefined,
      { fn: node.fn as AggFn, column: String(node.column ?? '') },
      lookups,
    );
  }
  if (node.kind === 'ratio' || node.kind === 'diff') {
    const left = operandLabel(node.left as RuleOperand, lookups);
    const right = operandLabel(node.right as RuleOperand, lookups);
    return `(${left} ${node.kind === 'ratio' ? '÷' : '−'} ${right})`;
  }
  return operandLabelWith(operand as RuleOperand, lookups, 0);
}

/** A whole condition, parenthesising a nested group whose joiner differs from its parent's. */
export function conditionLabel(condition: RuleCondition | null, lookups: LabelLookups): string {
  const and = lookups.and ?? 'AND';
  const or = lookups.or ?? 'OR';
  if (!condition) return '—';

  const walk = (node: RuleCondition | { kind: string }, parentJoiner?: string): string => {
    const anyNode = node as unknown as Record<string, unknown>;
    const group = anyNode.all ? 'all' : anyNode.any ? 'any' : null;
    if (group) {
      const joiner = group === 'all' ? and : or;
      const entries = (anyNode[group] as Array<RuleCondition | { kind: string }>) ?? [];
      const inner = entries.map((entry) => walk(entry, joiner)).join(` ${joiner} `);
      return parentJoiner && parentJoiner !== joiner ? `(${inner})` : inner;
    }
    if ('left' in (node as RuleCondition)) {
      const comparison = node as RuleCondition & { left: RuleOperand; op: string; right: { value: number } };
      return `${operandLabel(comparison.left, lookups)} ${comparison.op} ${comparison.right.value}`;
    }
    // Tree nodes: `{kind:'cmp', operand, op, value}`.
    if (anyNode.kind === 'cmp') {
      return `${operandLabel(anyNode.operand as RuleOperand, lookups)} ${String(anyNode.op)} ${String(anyNode.value)}`;
    }
    if (anyNode.kind === 'group') {
      const joiner = anyNode.mode === 'any' ? or : and;
      const entries = (anyNode.children as Array<{ kind: string }>) ?? [];
      const inner = entries.map((entry) => walk(entry as never, joiner)).join(` ${joiner} `);
      return parentJoiner && parentJoiner !== joiner ? `(${inner})` : inner;
    }
    return '?';
  };

  return walk(condition);
}

/** Whether a stored condition is something the tree editor can draw. */
export function isSimpleCondition(condition: RuleCondition | null): boolean {
  if (!condition || !('left' in condition)) return false;
  const left = condition.left;
  return 'metric' in left || 'dataset_agg' in left;
}

export function valueRows(
  lastValues: Record<string, number | null> | null,
  lookups: LabelLookups,
): Array<{ label: string; value: string }> {
  if (!lastValues) return [];
  const rows: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(lastValues)) {
    let label = key;
    try {
      label = operandLabel(JSON.parse(key) as RuleOperand, lookups);
    } catch {
      /* not an operand key (older row) — show it as-is rather than dropping the value */
    }
    rows.push({
      label,
      value: value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    });
  }
  return rows;
}
