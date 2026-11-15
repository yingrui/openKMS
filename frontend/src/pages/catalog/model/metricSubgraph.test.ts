import { describe, expect, it } from 'vitest';
import { neighborhood } from './metricSubgraph';
import type { MetricGraph, MetricGraphEdge, MetricGraphNode } from '../../../data/metricsApi';

const node = (id: string, name = id): MetricGraphNode => ({
  id,
  name,
  additivity: 'additive',
  base_dataset_id: 'ds',
  expression: null,
});

const derived = (from: string, to: string): MetricGraphEdge => ({
  from,
  to,
  kind: 'derived',
  weight: 1,
  tolerance: null,
  source: 'expression',
  rule_id: null,
  rule_object_id: null,
  health: null,
});

const assertion = (from: string, to: string): MetricGraphEdge => ({
  ...derived(from, to),
  kind: 'assertion',
  tolerance: { abs: 1 },
  source: 'rule',
  rule_id: 'r1',
  rule_object_id: 'obj-1',
  health: 'pass',
});

const graph = (edges: MetricGraphEdge[]): MetricGraph => {
  const ids = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
  return {
    nodes: ids.map((id) => node(id)),
    edges,
    derived_count: edges.filter((edge) => edge.kind === 'derived').length,
    assertion_count: edges.filter((edge) => edge.kind === 'assertion').length,
  };
};

// 满足率 ← 额度 · 需求；缺口率 ← 缺口 ← 额度 · 需求；额度 断言 方案额度
const LIVE = graph([
  derived('满足率', '额度'),
  derived('满足率', '需求'),
  derived('缺口', '需求'),
  derived('缺口', '额度'),
  derived('缺口率', '缺口'),
  derived('缺口率', '需求'),
  assertion('额度', '方案额度'),
]);

describe('metric subgraph', () => {
  it('no focus means the whole model — the picker holds both views', () => {
    const whole = neighborhood(LIVE, null);
    expect(whole.nodes.length).toBe(LIVE.nodes.length);
    expect(whole.edges.length).toBe(LIVE.edges.length);
  });

  it('keeps the focus, its components, its dependents and its assertion partners', () => {
    const view = neighborhood(LIVE, '缺口率');
    expect(view.nodes.map((node) => node.id).sort()).toEqual(['缺口', '缺口率', '需求'].sort());
    // The assertion between 额度 and 方案额度 is not in this neighborhood.
    expect(view.assertion_count).toBe(0);
    // Every derived edge with both ends kept: 缺口率→缺口, 缺口率→需求, 缺口→需求.
    expect(view.derived_count).toBe(3);
  });

  it('drops edges whose other end is outside the neighborhood', () => {
    const view = neighborhood(LIVE, '满足率');
    expect(view.edges.every((edge) => ['满足率', '额度', '需求'].includes(edge.from))).toBe(true);
    expect(view.derived_count).toBe(2);
  });

  it("draws one metric's neighborhood, not the whole model", () => {
    const view = neighborhood(LIVE, '额度');
    expect(view.nodes.length).toBeLessThan(LIVE.nodes.length);
  });

  it('returns the graph unchanged without a focus', () => {
    expect(neighborhood(LIVE, null)).toBe(LIVE);
  });
});
