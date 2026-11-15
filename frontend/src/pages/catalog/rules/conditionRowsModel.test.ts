import { describe, expect, it } from 'vitest';
import {
  conditionFromRows,
  newOperand,
  newRow,
  rowsFromCondition,
  type ConditionRow,
} from './conditionRowsModel';
import type { RuleCondition } from '../../../data/rulesApi';

// The condition of the live rule `分货额度错配`: ratio(metric, dataset aggregate) AND metric > 0.
const OVERCHECK = {
  all: [
    {
      left: {
        ratio: [
          { metric: 'alloc' },
          { dataset_agg: { dataset_id: 'lines', fn: 'sum', column: 'gap' } },
        ],
      },
      op: '>',
      right: { value: 1 },
    },
    { left: { metric: 'short' }, op: '>', right: { value: 0 } },
  ],
} as unknown as RuleCondition;

describe('condition rows', () => {
  it('represents a ratio of a metric and a dataset aggregate', () => {
    const rows = rowsFromCondition(OVERCHECK);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows![0].operand.kind).toBe('ratio');
    expect((rows![0].operand as { left: unknown }).left).toMatchObject({ kind: 'metric', metricId: 'alloc' });
    expect((rows![0].operand as { right: unknown }).right).toMatchObject({ kind: 'dataset_agg', datasetId: 'lines', aggFn: 'sum' });
    expect(rows![1].operand.kind).toBe('metric');
  });

  it('round-trips that condition without losing anything', () => {
    const rows = rowsFromCondition(OVERCHECK)!;
    expect(conditionFromRows(rows)).toEqual(OVERCHECK);
  });

  it('represents a difference of two metrics', () => {
    const condition = {
      left: { diff: [{ metric: 'demand' }, { metric: 'alloc' }] },
      op: '>',
      right: { value: 0 },
    } as unknown as RuleCondition;
    const rows = rowsFromCondition(condition)!;
    expect(rows[0].operand.kind).toBe('diff');
    expect(conditionFromRows(rows)).toEqual(condition);
  });

  it('draws one level of nesting, and refuses what is deeper', () => {
    // ratio(ratio(a, b), c) is two steps of the same rule — the editor recurses one level, as before.
    const nested = {
      left: { ratio: [{ ratio: [{ metric: 'a' }, { metric: 'b' }] }, { metric: 'c' }] },
      op: '>',
      right: { value: 1 },
    } as unknown as RuleCondition;
    expect(rowsFromCondition(nested)).not.toBeNull();

    const tooDeep = {
      left: {
        ratio: [
          { ratio: [{ ratio: [{ metric: 'a' }, { metric: 'b' }] }, { metric: 'c' }] },
          { metric: 'd' },
        ],
      },
      op: '>',
      right: { value: 1 },
    } as unknown as RuleCondition;
    expect(rowsFromCondition(tooDeep)).toBeNull();
  });

  it('refuses an `any` group, which rules do not have', () => {
    const any = { any: [{ left: { metric: 'a' }, op: '>', right: { value: 1 } }] } as unknown as RuleCondition;
    expect(rowsFromCondition(any)).toBeNull();
  });

  it('drops incomplete rows and reports an empty condition', () => {
    const row: ConditionRow = { ...newRow(), operand: newOperand(), value: '1' };
    expect(conditionFromRows([row])).toBeNull();
    const complete: ConditionRow = {
      ...newRow(),
      operand: { kind: 'metric', metricId: 'm1' },
      value: '2',
    };
    expect(conditionFromRows([complete])).toEqual({
      left: { metric: 'm1' },
      op: '>',
      right: { value: 2 },
    });
  });
});
