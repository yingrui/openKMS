import { describe, expect, it } from 'vitest';
import { conditionLabel, operandLabel, valueRows } from './rulesLabels';
import type { RuleCondition } from '../../data/rulesApi';

const lookups = {
  metricName: (id: string) => ({ m1: '分货额度', m2: '仍缺货明细数' })[id] ?? id,
  datasetName: (id: string) => ({ d1: '分货明细' })[id] ?? id,
  and: '且',
  or: '或',
};

const FILTER = [{ field: 'scenario_id', op: '=', value: 'a97503a9' }];

describe('operandLabel', () => {
  it('names a metric and keeps its filter visible', () => {
    expect(operandLabel({ metric: 'm1', filters: FILTER }, lookups)).toBe('分货额度（scenario_id = a97503a9）');
  });

  it('renders a dataset aggregate as dataset.fn(column)', () => {
    expect(
      operandLabel({ dataset_agg: { dataset_id: 'd1', fn: 'sum', column: 'gap' } }, lookups),
    ).toBe('分货明细.sum(gap)');
    expect(operandLabel({ dataset_agg: { dataset_id: 'd1', fn: 'count' } }, lookups)).toBe('分货明细.count(*)');
  });

  it('draws a ratio as a division, in parentheses', () => {
    expect(
      operandLabel(
        { ratio: [{ metric: 'm1' }, { dataset_agg: { dataset_id: 'd1', fn: 'sum', column: 'gap' } }] },
        lookups,
      ),
    ).toBe('(分货额度 ÷ 分货明细.sum(gap))');
  });
});

describe('conditionLabel', () => {
  it('joins with the localised word and keeps the structure', () => {
    const condition: RuleCondition = {
      all: [
        {
          left: { ratio: [{ metric: 'm1' }, { dataset_agg: { dataset_id: 'd1', fn: 'sum', column: 'gap' } }] },
          op: '>',
          right: { value: 1 },
        },
        { left: { metric: 'm2' }, op: '>', right: { value: 0 } },
      ],
    };
    expect(conditionLabel(condition, lookups)).toBe(
      '(分货额度 ÷ 分货明细.sum(gap)) > 1 且 仍缺货明细数 > 0',
    );
  });

  it('parenthesises a nested group whose joiner differs', () => {
    const condition = {
      all: [
        { left: { metric: 'm1' }, op: '>', right: { value: 1 } },
        { any: [{ left: { metric: 'm2' }, op: '>', right: { value: 0 } }] },
      ],
    } as unknown as RuleCondition;
    expect(conditionLabel(condition, lookups)).toBe('分货额度 > 1 且 (仍缺货明细数 > 0)');
  });
});

describe('valueRows', () => {
  it('turns stored operand keys back into names', () => {
    const rows = valueRows(
      { '{"metric": "m1"}': 19386, '{"ratio": [{"metric": "m1"}, {"metric": "m2"}]}': 1.1776 },
      lookups,
    );
    expect(rows).toEqual([
      { label: '分货额度', value: '19,386' },
      { label: '(分货额度 ÷ 仍缺货明细数)', value: '1.1776' },
    ]);
  });
});
