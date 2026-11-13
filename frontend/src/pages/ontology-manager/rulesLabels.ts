/**
 * Rendering rule conditions and computed values as words.
 *
 * A condition is stored as operands (`{metric}`, `{dataset_agg}`, `{diff}`, `{ratio}`) and the last
 * run stores them as JSON keys. Showing either raw turns a rule into an id soup — this module is the
 * one place that turns an operand into `分货额度`, `sum(gap)`, or `ratio(分货额度 / sum(gap))`.
 */

import type { RuleCondition, RuleOperand } from '../../data/rulesApi';

export type LabelLookups = {
  metricName: (id: string) => string;
  datasetName?: (id: string) => string;
};

const OPS: Record<string, string> = {
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
};

export function operandLabel(operand: RuleOperand, lookups: LabelLookups): string {
  if ('metric' in operand) return lookups.metricName(operand.metric);
  if ('dataset_agg' in operand) {
    const agg = operand.dataset_agg;
    const target = agg.column ? agg.column : '*';
    const dataset = lookups.datasetName?.(agg.dataset_id);
    return dataset ? `${agg.fn}(${target}) · ${dataset}` : `${agg.fn}(${target})`;
  }
  if ('diff' in operand) {
    const pair = operand.diff;
    return `diff(${operandLabel(pair[0], lookups)} − ${operandLabel(pair[1], lookups)})`;
  }
  const pair = operand.ratio;
  return `ratio(${operandLabel(pair[0], lookups)} / ${operandLabel(pair[1], lookups)})`;
}

export function conditionLabel(condition: RuleCondition | null, lookups: LabelLookups): string {
  if (!condition) return '—';
  if ('all' in condition) {
    return condition.all.map((entry: RuleCondition) => conditionLabel(entry, lookups)).join(' AND ');
  }
  if ('any' in condition) {
    return condition.any.map((entry: RuleCondition) => conditionLabel(entry, lookups)).join(' OR ');
  }
  const op = OPS[condition.op] ?? condition.op;
  return `${operandLabel(condition.left, lookups)} ${op} ${condition.right.value}`;
}

/** Whether the form builder can represent this condition (one comparison, metric or dataset_agg left). */
export function isSimpleCondition(condition: RuleCondition | null): boolean {
  if (!condition || !('left' in condition)) return false;
  const left = condition.left;
  return 'metric' in left || 'dataset_agg' in left;
}

/**
 * `last_values` is keyed by the operand's canonical JSON. Rebuild a readable label from that key so a
 * reader sees `ratio(分货额度 / sum(gap)) = 1.1776` instead of a serialized object.
 */
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
      /* the key is not an operand (older row) — show it as-is rather than dropping the value */
    }
    rows.push({
      label,
      value: value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    });
  }
  return rows;
}
