import { describe, expect, it } from 'vitest';
import { depths, layout, NODE_W } from './metricGraphLayout';
import type { MetricGraph, MetricGraphEdge, MetricGraphNode } from '../../../data/metricsApi';

const node = (id: string): MetricGraphNode => ({
  id,
  name: id,
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

const graph = (ids: string[], edges: MetricGraphEdge[]): MetricGraph => ({
  nodes: ids.map(node),
  edges,
  derived_count: edges.filter((edge) => edge.kind === 'derived').length,
  assertion_count: edges.filter((edge) => edge.kind === 'assertion').length,
});

describe('metric graph layout', () => {
  it('puts a metric one level above the metrics it is computed from', () => {
    const d = depths([node('额度'), node('需求'), node('满足率')], [
      derived('满足率', '额度'),
      derived('满足率', '需求'),
    ]);
    expect(d.get('额度')).toBe(0);
    expect(d.get('满足率')).toBe(1);
  });

  it('uses the longest path, so a chain does not collide with its grandparent', () => {
    const d = depths([node('a'), node('b'), node('c')], [derived('c', 'b'), derived('b', 'a')]);
    expect(d.get('c')).toBe(2);
  });

  it('puts base metrics at the bottom and centres each row', () => {
    const { placed, width } = layout(
      graph(['额度', '需求', '满足率'], [derived('满足率', '额度'), derived('满足率', '需求')]),
    );
    const byName = new Map(placed.map((p) => [p.name, p]));
    const base = byName.get('额度')!;
    const top = byName.get('满足率')!;
    expect(base.y).toBeGreaterThan(top.y);
    // The single node in the top row is centred on the canvas.
    expect(top.x + NODE_W / 2).toBeCloseTo(width / 2, 5);
    // Two nodes in the bottom row are symmetric about the centre.
    const other = byName.get('需求')!;
    expect(base.x + other.x + NODE_W).toBeCloseTo(width, 5);
  });

  it('does not loop on a cycle', () => {
    const d = depths([node('a'), node('b')], [derived('a', 'b'), derived('b', 'a')]);
    expect(Number.isFinite(d.get('a'))).toBe(true);
    expect(Number.isFinite(d.get('b'))).toBe(true);
  });

  it('keeps a minimum canvas width for a single metric', () => {
    expect(layout(graph(['only'], [])).width).toBeGreaterThanOrEqual(640);
  });
});
