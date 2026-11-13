/**
 * The condition as a tree — and the conversion to and from the stored JSON.
 *
 * A condition is a tree with two node kinds:
 *
 *   group        `{all: [...]}` / `{any: [...]}` — a node with children
 *   comparison   `{left: <operand tree>, op, right: {value}}`
 *
 * and an **operand** is itself a small tree (metric | dataset aggregate | diff of two | ratio of two).
 * The editor draws the whole thing recursively; this module is the only place that knows the JSON
 * shape, so the UI never has to think about `all`/`any` merging or about operand nesting.
 *
 * `fromTree` collapses a group with a single child (the API accepts either shape, and a one-child group
 * is noise). `toTree` returns `null` with a reason for anything the editor cannot draw — a right-hand
 * side that is not a constant, an unknown operand kind — and the editor then shows the JSON view rather
 * than flattening the condition into something else.
 */

import type { RuleCondition, RuleOperand } from '../../data/rulesApi';

export const BUILDER_OPS = ['<', '<=', '>', '>=', '==', '!='] as const;
export const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type AggFn = (typeof AGG_FNS)[number];

/**
 * The data layer's own filter shape — kept verbatim: editing it is a JSON-view job, losing it is not.
 *
 * Besides `field` / `op` / `value` the engine ignores extra keys, and `label` is the one that earns its
 * keep: it is what the reader sees instead of a UUID (`"label": "推荐方案 · 2026-W46"`).
 */
export type OperandFilter = Record<string, unknown>;

export type LeafOperand =
  | { kind: 'metric'; metricId: string; filters?: OperandFilter[] }
  | { kind: 'dataset_agg'; datasetId: string; fn: AggFn; column: string; filters?: OperandFilter[] };

export type OperandNode =
  | LeafOperand
  | { kind: 'ratio' | 'diff'; left: OperandNode; right: OperandNode };

export type ComparisonNode = {
  id: string;
  kind: 'cmp';
  operand: OperandNode;
  op: string;
  value: string;
};

export type GroupNode = {
  id: string;
  kind: 'group';
  mode: 'all' | 'any';
  children: ConditionNode[];
};

export type ConditionNode = ComparisonNode | GroupNode;

let nextId = 1;
function id(): string {
  nextId += 1;
  return `n${nextId}`;
}

export function makeComparison(operand: OperandNode): ComparisonNode {
  return { id: id(), kind: 'cmp', operand, op: '>', value: '0' };
}

export function makeGroup(mode: 'all' | 'any' = 'all', children: ConditionNode[] = []): GroupNode {
  return { id: id(), kind: 'group', mode, children };
}

export function makeLeafMetric(metricId: string): LeafOperand {
  return { kind: 'metric', metricId };
}

export function makeLeafDataset(datasetId: string): LeafOperand {
  return { kind: 'dataset_agg', datasetId, fn: 'count', column: '' };
}

// --- JSON → tree -------------------------------------------------------------

function toOperandNode(operand: RuleOperand): OperandNode | null {
  if ('metric' in operand) {
    return { kind: 'metric', metricId: operand.metric, filters: operand.filters };
  }
  if ('dataset_agg' in operand) {
    const agg = operand.dataset_agg;
    return {
      kind: 'dataset_agg',
      datasetId: agg.dataset_id,
      fn: (AGG_FNS.includes(agg.fn as AggFn) ? agg.fn : 'count') as AggFn,
      column: agg.column ?? '',
      filters: agg.filters,
    };
  }
  if ('ratio' in operand) {
    const left = toOperandNode(operand.ratio[0]);
    const right = toOperandNode(operand.ratio[1]);
    return left && right ? { kind: 'ratio', left, right } : null;
  }
  if ('diff' in operand) {
    const left = toOperandNode(operand.diff[0]);
    const right = toOperandNode(operand.diff[1]);
    return left && right ? { kind: 'diff', left, right } : null;
  }
  return null;
}

/** `null` when the condition has a shape the tree editor cannot draw. */
export function toTree(
  condition: RuleCondition | null,
): { tree: GroupNode; reason?: undefined } | { tree: null; reason: string } {
  if (!condition) return { tree: null, reason: 'empty' };

  const parseComparison = (node: RuleCondition): ComparisonNode | string => {
    if (!('left' in node)) return 'unsupported comparison';
    const operand = toOperandNode(node.left);
    if (!operand) return 'unsupported operand';
    const op = String(node.op);
    if (!BUILDER_OPS.includes(op as (typeof BUILDER_OPS)[number])) return 'unsupported operator';
    const right = node.right as { value?: unknown } | undefined;
    if (!right || typeof right.value !== 'number') return 'right side is not a constant';
    return { id: id(), kind: 'cmp', operand, op, value: String(right.value) };
  };

  const fill = (group: GroupNode, entries: RuleCondition[]): string | null => {
    for (const entry of entries) {
      if ('all' in entry || 'any' in entry) {
        const nested = makeGroup('all' in entry ? 'all' : 'any');
        const problem = fill(nested, 'all' in entry ? entry.all : entry.any);
        if (problem) return problem;
        group.children.push(nested);
        continue;
      }
      const parsed = parseComparison(entry);
      if (typeof parsed === 'string') return parsed;
      group.children.push(parsed);
    }
    return null;
  };

  if ('all' in condition || 'any' in condition) {
    const root = makeGroup('all' in condition ? 'all' : 'any');
    const problem = fill(root, 'all' in condition ? condition.all : condition.any);
    if (problem) return { tree: null, reason: problem };
    return root.children.length === 0 ? { tree: null, reason: 'empty' } : { tree: root };
  }

  const parsed = parseComparison(condition);
  if (typeof parsed === 'string') return { tree: null, reason: parsed };
  return { tree: makeGroup('all', [parsed]) };
}

// --- tree → JSON -------------------------------------------------------------

function fromOperandNode(operand: OperandNode): RuleOperand {
  if (operand.kind === 'metric') {
    return operand.filters?.length
      ? { metric: operand.metricId, filters: operand.filters }
      : { metric: operand.metricId };
  }
  if (operand.kind === 'dataset_agg') {
    return {
      dataset_agg: {
        dataset_id: operand.datasetId,
        fn: operand.fn,
        column: operand.fn === 'count' ? null : operand.column,
        ...(operand.filters?.length ? { filters: operand.filters } : {}),
      },
    };
  }
  return { [operand.kind]: [fromOperandNode(operand.left), fromOperandNode(operand.right)] } as RuleOperand;
}

function fromNode(node: ConditionNode): RuleCondition {
  if (node.kind === 'cmp') {
    return {
      left: fromOperandNode(node.operand),
      op: node.op,
      right: { value: Number(node.value) },
    };
  }
  const children = node.children.map(fromNode);
  if (children.length === 1) return children[0];
  return { [node.mode]: children } as RuleCondition;
}

export function fromTree(tree: GroupNode): RuleCondition {
  return fromNode(tree);
}

// --- tree utilities ----------------------------------------------------------

export function countComparisons(node: ConditionNode): number {
  if (node.kind === 'cmp') return 1;
  return node.children.reduce((total, child) => total + countComparisons(child), 0);
}

/** Replace a node anywhere in the tree; returns a new tree (no mutation). */
export function replaceNode(root: GroupNode, targetId: string, next: ConditionNode): GroupNode {
  const walk = (node: ConditionNode): ConditionNode => {
    if (node.id === targetId) return next;
    if (node.kind === 'group') return { ...node, children: node.children.map(walk) };
    return node;
  };
  return walk(root) as GroupNode;
}

/** Remove a node; the root group itself cannot be removed. */
export function removeNode(root: GroupNode, targetId: string): GroupNode {
  const walk = (node: ConditionNode): ConditionNode => {
    if (node.kind === 'group') {
      return { ...node, children: node.children.filter((child) => child.id !== targetId).map(walk) };
    }
    return node;
  };
  return walk(root) as GroupNode;
}

export function appendChild(root: GroupNode, groupId: string, child: ConditionNode): GroupNode {
  const walk = (node: ConditionNode): ConditionNode => {
    if (node.kind !== 'group') return node;
    if (node.id === groupId) return { ...node, children: [...node.children, child] };
    return { ...node, children: node.children.map(walk) };
  };
  return walk(root) as GroupNode;
}

export function setGroupMode(root: GroupNode, groupId: string, mode: 'all' | 'any'): GroupNode {
  const walk = (node: ConditionNode): ConditionNode => {
    if (node.kind !== 'group') return node;
    if (node.id === groupId) return { ...node, mode };
    return { ...node, children: node.children.map(walk) };
  };
  return walk(root) as GroupNode;
}
