/**
 * Rendering a condition as a sentence a person can check.
 *
 * Three rules, learned from a scope that repeated a 36-character id three times and became unreadable:
 *
 * 1. **Ids are noise.** A filter may carry a `label` (`"label": "推荐方案 · 2026-W46"`) — that is what a
 *    reader needs, and it is the author's own words. Without a label, a long value is shortened to
 *    `a97503a9…`, so at least the field is named honestly instead of printing 36 characters.
 * 2. **A shared scope is said once.** When every operand carries the same filters, they are hoisted in
 *    front of the formula (`范围：scenario_id = a97503a9…`) instead of printed per operand. When they
 *    differ, each operand keeps its own (shortened).
 * 3. **Business words, not call syntax.** A metric is its name; a dataset aggregate is
 *    `分货明细：sum(gap)`; a ratio is `a ÷ b` in parentheses; groups are `且` / `或` with parentheses only
 *    where a nested group's joiner differs.
 *
 * Everything here is derived from the stored JSON, so the sentence cannot drift from the rule.
 */

import type { RuleCondition, RuleOperand } from '../../data/rulesApi';
import { AGG_FNS, type AggFn, type OperandFilter } from './conditionModel';

export type LabelLookups = {
  metricName: (id: string) => string;
  datasetName?: (id: string) => string;
  /** Localised words; defaults keep the module usable outside React (tests, logs). */
  and?: string;
  or?: string;
  scopePrefix?: string;
  /** How a condition says "one object per run, picked when you run it" — a whole phrase, not a field name. */
  scopeAtRunTime?: string;
};

const MAX_ID_CHARS = 14;

function shortValue(value: unknown): string {
  const text = String(value ?? '');
  return text.length > MAX_ID_CHARS ? `${text.slice(0, 8)}…` : text;
}

function filtersOf(node: unknown): OperandFilter[] | undefined {
  const record = node as Record<string, unknown>;
  const own = record.filters as OperandFilter[] | undefined;
  if (own?.length) return own;
  const agg = record.dataset_agg as { filters?: OperandFilter[] } | undefined;
  return agg?.filters?.length ? agg.filters : undefined;
}

function filterParts(filters: OperandFilter[] | undefined): string[] {
  return (filters ?? []).map((filter) => {
    // `filter.label` is the author's words for the value ("推荐方案 · 2026-W46"); without it we can only
    // be precise (`field = a97503a9…`), never friendly.
    const label = typeof filter.label === 'string' ? filter.label.trim() : '';
    if (label) return label;
    const field = String(filter.field ?? filter.column ?? '?');
    const op = String(filter.op ?? '=');
    return `${field} ${op} ${shortValue(filter.value)}`;
  });
}

function filterText(filters: OperandFilter[] | undefined, show: boolean): string {
  if (!show) return '';
  const parts = filterParts(filters);
  return parts.length ? `（${parts.join('，')}）` : '';
}

type RenderCtx = LabelLookups & { showFilters: boolean };

function leafLabel(
  kind: 'metric' | 'dataset_agg',
  id: string,
  filters: OperandFilter[] | undefined,
  agg: { fn: AggFn; column: string } | null,
  ctx: RenderCtx,
): string {
  if (kind === 'metric') return `${ctx.metricName(id)}${filterText(filters, ctx.showFilters)}`;
  const dataset = ctx.datasetName?.(id) ?? shortValue(id);
  const call = agg ? `${dataset}：${agg.fn}(${agg.column || '*'})` : `${dataset}：*`;
  return `${call}${filterText(filters, ctx.showFilters)}`;
}

function operandLabelWith(operand: RuleOperand, ctx: RenderCtx): string {
  if ('metric' in operand) return leafLabel('metric', operand.metric, operand.filters, null, ctx);
  if ('dataset_agg' in operand) {
    const agg = operand.dataset_agg;
    return leafLabel(
      'dataset_agg',
      agg.dataset_id,
      agg.filters,
      { fn: (AGG_FNS.includes(agg.fn as AggFn) ? agg.fn : 'count') as AggFn, column: agg.column ?? '' },
      ctx,
    );
  }
  if ('ratio' in operand) {
    return `(${operandLabelWith(operand.ratio[0], ctx)} ÷ ${operandLabelWith(operand.ratio[1], ctx)})`;
  }
  if ('diff' in operand) {
    return `(${operandLabelWith(operand.diff[0], ctx)} − ${operandLabelWith(operand.diff[1], ctx)})`;
  }
  return '?';
}

/** One operand (`分货额度`, `分货明细：sum(gap)`, `(a ÷ b)`). Filters are hidden — they are a scope, not a term. */
export function operandLabel(operand: RuleOperand | { kind: string }, lookups: LabelLookups): string {
  const ctx: RenderCtx = { ...lookups, showFilters: false };
  return renderAnyOperand(operand, ctx);
}

function renderAnyOperand(operand: unknown, ctx: RenderCtx): string {
  const node = operand as Record<string, unknown>;
  // Tree/editor leaf (`{kind, metricId | datasetId}`) …
  if (typeof node.metricId === 'string') {
    return leafLabel('metric', node.metricId, node.filters as OperandFilter[] | undefined, null, ctx);
  }
  if (typeof node.datasetId === 'string') {
    return leafLabel(
      'dataset_agg',
      node.datasetId,
      node.filters as OperandFilter[] | undefined,
      { fn: node.fn as AggFn, column: String(node.column ?? '') },
      ctx,
    );
  }
  if (node.kind === 'ratio' || node.kind === 'diff') {
    const left = renderAnyOperand(node.left, ctx);
    const right = renderAnyOperand(node.right, ctx);
    return `(${left} ${node.kind === 'ratio' ? '÷' : '−'} ${right})`;
  }
  // … or a stored operand (`{metric}`, `{dataset_agg}`, `{ratio}`, `{diff}`).
  return operandLabelWith(operand as RuleOperand, ctx);
}

function comparisonsOf(condition: RuleCondition): RuleOperand[] {
  const out: RuleOperand[] = [];
  const walk = (node: RuleCondition): void => {
    if ('all' in node) node.all.forEach(walk);
    else if ('any' in node) node.any.forEach(walk);
    else if ('left' in node) out.push(node.left);
  };
  walk(condition);
  return out;
}

/** The single filter set every operand shares, or null when they differ. */
function sharedScope(condition: RuleCondition): string[] | null {
  const sets: string[][] = [];
  const collect = (operand: unknown): void => {
    const node = operand as Record<string, unknown>;
    const own = filtersOf(node);
    if (own) sets.push(filterParts(own));
    for (const key of ['ratio', 'diff'] as const) {
      const pair = node[key] as unknown[] | undefined;
      if (pair) pair.forEach(collect);
    }
    if (node.kind === 'ratio' || node.kind === 'diff') {
      collect(node.left);
      collect(node.right);
    }
  };
  comparisonsOf(condition).forEach(collect);
  if (sets.length === 0) return null;
  const [first] = sets;
  const key = first.join('|');
  return sets.every((set) => set.join('|') === key) ? first : null;
}

/**
 * The scope of a condition, as one line — `范围：每次运行针对一个方案` or `范围：推荐方案 · 2026-W46`.
 *
 * Both renderers (the tree and the one-line summary) show this line from the same function, so the two
 * views cannot describe a rule differently.
 */
export function conditionScopeNote(
  condition: RuleCondition | null,
  lookups: LabelLookups,
  param?: { field: string; label?: string | null } | null,
): string | null {
  if (!condition) return null;
  const prefix = lookups.scopePrefix ?? 'scope';
  // A run parameter is declared once, on the rule — that is the answer to "what does this apply to?".
  if (param?.field) {
    return `${prefix}：${lookups.scopeAtRunTime ?? 'one object per run, chosen when you run it'}`;
  }
  const shared = sharedScope(condition);
  return shared ? `${prefix}：${shared.join('，')}` : null;
}

/** A whole condition: shared scope first (said once), then the formula. */
export function conditionLabel(
  condition: RuleCondition | null,
  lookups: LabelLookups,
  param?: { field: string; label?: string | null } | null,
): string {
  const and = lookups.and ?? 'AND';
  const or = lookups.or ?? 'OR';
  if (!condition) return '—';

  const shared = sharedScope(condition);
  const ctx: RenderCtx = { ...lookups, showFilters: shared === null };

  const walk = (node: unknown, parentJoiner?: string): string => {
    const record = node as Record<string, unknown>;
    const mode = record.all ? 'all' : record.any ? 'any' : null;
    if (mode) {
      const joiner = mode === 'all' ? and : or;
      const entries = (record[mode] as unknown[]) ?? [];
      const inner = entries.map((entry) => walk(entry, joiner)).join(` ${joiner} `);
      return parentJoiner && parentJoiner !== joiner ? `(${inner})` : inner;
    }
    if ('left' in record) {
      const comparison = record as unknown as {
        left: RuleOperand;
        op: string;
        right: { value: number };
      };
      return `${renderAnyOperand(comparison.left, ctx)} ${comparison.op} ${comparison.right.value}`;
    }
    if (record.kind === 'cmp') {
      return `${renderAnyOperand(record.operand, ctx)} ${String(record.op)} ${String(record.value)}`;
    }
    if (record.kind === 'group') {
      const joiner = record.mode === 'any' ? or : and;
      const entries = (record.children as unknown[]) ?? [];
      const inner = entries.map((entry) => walk(entry, joiner)).join(` ${joiner} `);
      return parentJoiner && parentJoiner !== joiner ? `(${inner})` : inner;
    }
    return '?';
  };

  const formula = walk(condition);
  const note = conditionScopeNote(condition, lookups, param);
  return note ? `${note} ｜ ${formula}` : formula;
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
