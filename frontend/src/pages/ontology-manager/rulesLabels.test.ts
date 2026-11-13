import { describe, expect, it } from 'vitest';
import { conditionLabel, operandLabel, valueRows } from './rulesLabels';
import type { RuleCondition } from '../../data/rulesApi';

const SEL = 'a97503a9-52bd-4ea7-887c-892a1233e5ae';
const FILTER = [{ field: 'scenario_id', op: '=', value: SEL }];
const lookups = {
  metricName: (id: string) => ({ m1: '分货额度', m2: '仍缺货明细数' })[id] ?? id,
  datasetName: (id: string) => ({ d1: '分货明细' })[id] ?? id,
  and: '且',
  or: '或',
  scopePrefix: '范围',
};

describe('operandLabel', () => {
  it('names a metric without repeating its scope', () => {
    expect(operandLabel({ metric: 'm1', filters: FILTER }, lookups)).toBe('分货额度');
  });

  it('renders a dataset aggregate as dataset：fn(column)', () => {
    expect(operandLabel({ dataset_agg: { dataset_id: 'd1', fn: 'sum', column: 'gap' } }, lookups)).toBe(
      '分货明细：sum(gap)',
    );
    expect(operandLabel({ dataset_agg: { dataset_id: 'd1', fn: 'count' } }, lookups)).toBe('分货明细：count(*)');
  });

  it('draws a ratio as a division, in parentheses', () => {
    expect(
      operandLabel(
        { ratio: [{ metric: 'm1' }, { dataset_agg: { dataset_id: 'd1', fn: 'sum', column: 'gap' } }] },
        lookups,
      ),
    ).toBe('(分货额度 ÷ 分货明细：sum(gap))');
  });
});

describe('conditionLabel', () => {
  it('says a shared scope once, in front of the formula, with the id shortened', () => {
    const condition: RuleCondition = {
      all: [
        {
          left: {
            ratio: [
              { metric: 'm1', filters: FILTER },
              { dataset_agg: { dataset_id: 'd1', fn: 'sum', column: 'gap', filters: FILTER } },
            ],
          },
          op: '>',
          right: { value: 1 },
        },
        { left: { metric: 'm2', filters: FILTER }, op: '>', right: { value: 0 } },
      ],
    };
    expect(conditionLabel(condition, lookups)).toBe(
      '范围：scenario_id = a97503a9… ｜ (分货额度 ÷ 分货明细：sum(gap)) > 1 且 仍缺货明细数 > 0',
    );
  });

  it('shows a filter\'s label instead of its UUID when the author gave one', () => {
    const labelled = [{ field: 'scenario_id', op: '=', value: SEL, label: '推荐方案 · 2026-W46' }];
    const condition: RuleCondition = {
      all: [
        { left: { metric: 'm1', filters: labelled }, op: '>', right: { value: 1 } },
        { left: { metric: 'm2', filters: FILTER }, op: '>', right: { value: 0 } },
      ],
    };
    expect(conditionLabel(condition, lookups)).toBe(
      '分货额度（推荐方案 · 2026-W46） > 1 且 仍缺货明细数（scenario_id = a97503a9…） > 0',
    );
  });

  it('keeps per-operand filters (shortened) when they differ', () => {
    const other = [{ field: 'industry', op: '=', value: '半导体' }];
    const condition: RuleCondition = {
      all: [
        { left: { metric: 'm1', filters: FILTER }, op: '>', right: { value: 1 } },
        { left: { metric: 'm2', filters: other }, op: '>', right: { value: 0 } },
      ],
    };
    expect(conditionLabel(condition, lookups)).toBe(
      '分货额度（scenario_id = a97503a9…） > 1 且 仍缺货明细数（industry = 半导体） > 0',
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
  it('turns stored operand keys back into names, without ids', () => {
    const rows = valueRows(
      {
        [`{"metric": "m1", "filters": ${JSON.stringify(FILTER)}}`]: 19386,
        '{"ratio": [{"metric": "m1"}, {"metric": "m2"}]}': 1.1776,
      },
      lookups,
    );
    expect(rows).toEqual([
      { label: '分货额度', value: '19,386' },
      { label: '(分货额度 ÷ 仍缺货明细数)', value: '1.1776' },
    ]);
  });
});
