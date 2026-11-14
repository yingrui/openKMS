import { describe, expect, it } from 'vitest';
import {
  appendChild,
  countComparisons,
  fromTree,
  makeComparison,
  makeGroup,
  makeLeafDataset,
  makeLeafMetric,
  removeNode,
  replaceNode,
  setGroupMode,
  toTree,
} from './conditionModel';
import type { RuleCondition } from '../../../data/rulesApi';

const metric = (id: string) => ({ metric: id });

describe('toTree / fromTree', () => {
  it('reads a single comparison without wrapping it in a group', () => {
    const { tree } = toTree({ left: metric('m1'), op: '>', right: { value: 1 } });
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0]).toMatchObject({ kind: 'cmp', op: '>', value: '1' });
  });

  it('keeps the all/any of a group and nests groups recursively', () => {
    const condition: RuleCondition = {
      all: [
        { left: metric('a'), op: '>', right: { value: 1 } },
        { any: [{ left: metric('b'), op: '<', right: { value: 5 } }] },
      ],
    };
    const { tree } = toTree(condition);
    const group = tree?.children.find((child) => child.kind === 'group' && child.mode === 'any');
    expect(group).toMatchObject({ kind: 'group', mode: 'any' });
    expect(countComparisons(tree!)).toBe(2);
  });

  it('round-trips a real rule (all of a ratio and a comparison)', () => {
    const original: RuleCondition = {
      all: [
        { left: { ratio: [metric('a'), { dataset_agg: { dataset_id: 'd', fn: 'sum', column: 'gap' } }] }, op: '>', right: { value: 1 } },
        { left: metric('c'), op: '>', right: { value: 0 } },
      ],
    };
    const { tree } = toTree(original);
    expect(tree).not.toBeNull();
    expect(fromTree(tree!)).toEqual(original);
  });

  it('round-trips nested groups', () => {
    const original: RuleCondition = {
      all: [
        { any: [{ left: metric('a'), op: '>', right: { value: 1 } }] },
        { left: metric('b'), op: '<', right: { value: 9 } },
      ],
    };
    const { tree } = toTree(original);
    // A single-child `any` collapses when written back — the API accepts either shape.
    expect(fromTree(tree!)).toEqual({
      all: [
        { left: metric('a'), op: '>', right: { value: 1 } },
        { left: metric('b'), op: '<', right: { value: 9 } },
      ],
    });
  });

  it('keeps operand filters through the round trip (editing must not drop the scope)', () => {
    const filters = [{ field: 'scenario_id', op: '=', value: 'a97503a9' }];
    const condition: RuleCondition = {
      left: {
        ratio: [
          { metric: 'a', filters },
          { dataset_agg: { dataset_id: 'd', fn: 'sum', column: 'gap', filters } },
        ],
      },
      op: '>',
      right: { value: 1 },
    };
    const { tree } = toTree(condition);
    expect(fromTree(tree!)).toEqual(condition);
  });

  it('declines a non-constant right side instead of dropping it', () => {
    const { tree, reason } = toTree({ left: metric('a'), op: '>', right: { metric: 'b' } } as unknown as RuleCondition);
    expect(tree).toBeNull();
    expect(reason).toContain('constant');
  });

  it('declines an unknown operand kind', () => {
    const { tree } = toTree({
      left: { sql: 'select 1' },
      op: '>',
      right: { value: 1 },
    } as unknown as RuleCondition);
    expect(tree).toBeNull();
  });
});

describe('tree edits', () => {
  const tree = () => {
    let root = makeGroup('all', []);
    root = appendChild(root, root.id, makeComparison(makeLeafMetric('m1')));
    const nested = makeGroup('any', [makeComparison(makeLeafDataset('d1'))]);
    root = appendChild(root, root.id, nested);
    return { root, nested };
  };

  it('appends a child to a nested group', () => {
    const { root, nested } = tree();
    const next = appendChild(root, nested.id, makeComparison(makeLeafMetric('m2')));
    expect(countComparisons(next)).toBe(3);
  });

  it('removes a node by id without touching siblings', () => {
    const { root, nested } = tree();
    const next = removeNode(root, nested.id);
    expect(next.children).toHaveLength(1);
  });

  it('replaces a node by id', () => {
    const { root } = tree();
    const first = root.children[0];
    const next = replaceNode(root, first.id, makeComparison(makeLeafMetric('m9')));
    // Two children remain, so the tree still writes back as a group whose first entry is the edit.
    const written = fromTree(next) as { all: Array<{ left?: { metric?: string } }> };
    expect(written.all).toHaveLength(2);
    expect(written.all[0].left).toEqual({ metric: 'm9' });
  });

  it('flips a group between all and any', () => {
    const { root, nested } = tree();
    expect(setGroupMode(root, nested.id, 'all').children[1]).toMatchObject({ mode: 'all' });
  });
});
