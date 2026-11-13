import { describe, expect, it } from 'vitest';
import { emptyRow, fromBuilder, toBuilder, type BuilderCondition } from './conditionModel';
import type { RuleCondition } from '../../data/rulesApi';

const METRIC = (id: string) => ({ metric: id });

describe('toBuilder', () => {
  it('reads a single comparison', () => {
    const condition: RuleCondition = { left: METRIC('m1'), op: '>', right: { value: 1 } };
    const result = toBuilder(condition);
    expect(result.builder).toEqual({
      mode: 'all',
      rows: [{ operand: { kind: 'metric', metricId: 'm1' }, op: '>', value: '1' }],
    });
  });

  it('reads an all/any group and keeps its mode', () => {
    const condition: RuleCondition = {
      any: [
        { left: METRIC('m1'), op: '>', right: { value: 1 } },
        { left: { dataset_agg: { dataset_id: 'd1', fn: 'count' } }, op: '<', right: { value: 10 } },
      ],
    };
    const result = toBuilder(condition);
    expect(result.builder?.mode).toBe('any');
    expect(result.builder?.rows).toHaveLength(2);
    expect(result.builder?.rows[1].operand).toEqual({
      kind: 'dataset_agg',
      datasetId: 'd1',
      fn: 'count',
      column: '',
    });
  });

  it('reads a ratio of a metric and a dataset aggregate', () => {
    const condition: RuleCondition = {
      left: { ratio: [METRIC('a'), { dataset_agg: { dataset_id: 'd', fn: 'sum', column: 'gap' } }] },
      op: '>',
      right: { value: 1 },
    };
    const result = toBuilder(condition);
    expect(result.builder?.rows[0].operand).toEqual({
      kind: 'ratio',
      left: { kind: 'metric', metricId: 'a' },
      right: { kind: 'dataset_agg', datasetId: 'd', fn: 'sum', column: 'gap' },
    });
  });

  it('declines a ratio of ratios instead of flattening it', () => {
    const nested = { ratio: [{ metric: 'a' }, { ratio: [{ metric: 'b' }, { metric: 'c' }] }] };
    const result = toBuilder({ left: nested, op: '>', right: { value: 1 } } as RuleCondition);
    expect(result.builder).toBeNull();
    expect(result.reason).toContain('unsupported operand');
  });

  it('declines a mixed group (all of a group) rather than changing its meaning', () => {
    const condition = {
      all: [
        { left: METRIC('a'), op: '>', right: { value: 1 } },
        { any: [{ left: METRIC('b'), op: '>', right: { value: 1 } }] },
      ],
    } as unknown as RuleCondition;
    expect(toBuilder(condition).builder).toBeNull();
  });
});

describe('fromBuilder', () => {
  it('round-trips a single comparison', () => {
    const builder: BuilderCondition = {
      mode: 'all',
      rows: [{ operand: { kind: 'metric', metricId: 'm1' }, op: '<=', value: '0.5' }],
    };
    expect(fromBuilder(builder)).toEqual({
      left: { metric: 'm1' },
      op: '<=',
      right: { value: 0.5 },
    });
  });

  it('emits `all` for several rows and `any` when the mode says so', () => {
    const builder: BuilderCondition = {
      mode: 'any',
      rows: [
        emptyRow('m1'),
        { operand: { kind: 'dataset_agg', datasetId: 'd', fn: 'sum', column: 'gap' }, op: '>', value: '3' },
      ],
    };
    const condition = fromBuilder(builder) as { any: Array<{ left: unknown }> };
    expect(condition.any).toHaveLength(2);
    expect(condition.any[1].left).toEqual({
      dataset_agg: { dataset_id: 'd', fn: 'sum', column: 'gap' },
    });
  });

  it('drops the column for a count aggregate', () => {
    const builder: BuilderCondition = {
      mode: 'all',
      rows: [{ operand: { kind: 'dataset_agg', datasetId: 'd', fn: 'count', column: 'ignored' }, op: '>', value: '0' }],
    };
    expect(fromBuilder(builder)).toEqual({
      left: { dataset_agg: { dataset_id: 'd', fn: 'count', column: null } },
      op: '>',
      right: { value: 0 },
    });
  });

  it('survives a toBuilder → fromBuilder round trip for a real rule', () => {
    const original: RuleCondition = {
      all: [
        { left: { ratio: [{ metric: 'a' }, { metric: 'b' }] }, op: '>', right: { value: 1 } },
        { left: { metric: 'c' }, op: '>', right: { value: 0 } },
      ],
    };
    const { builder } = toBuilder(original);
    expect(builder).not.toBeNull();
    expect(fromBuilder(builder!)).toEqual(original);
  });
});
