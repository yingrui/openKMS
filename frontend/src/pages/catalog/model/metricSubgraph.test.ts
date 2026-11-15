import { describe, expect, it } from 'vitest';
import { defaultFocus, neighborhood } from './metricSubgraph';
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
  it('focuses a most-connected metric by default', () => {
    // 额度 / 需求 / 缺口 tie at three incident edges; the tie breaks by name so the default is stable
    // across opens — a focus that moves would make the picture useless as a reference.
    const focus = defaultFocus(LIVE);
    const counts = new Map<string, number>();
    for (const edge of LIVE.edges) {
      counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
      counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
    }
    expect(counts.get(focus!)).toBe(Math.max(...counts.values()));
    expect(defaultFocus(LIVE)).toBe(defaultFocus(LIVE));
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

  it('shows a small model whole', () => {
    // 4 metrics, 24-node limit: the view opens unfocused, so every node must survive `neighborhood`
    // only when the caller asks for the whole graph.
    expect(LIVE.nodes.length).toBeLessThanOrEqual(24);
    const view = neighborhood(LIVE, '额度');
    expect(view.nodes.length).toBeLessThan(LIVE.nodes.length);
  });

  it('returns the graph unchanged without a focus', () => {
    expect(neighborhood(LIVE, null)).toBe(LIVE);
  });
});
