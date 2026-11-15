/**
 * Which part of a model's metric graph is worth drawing.
 *
 * One control decides it, and it is the same control at any size: the picker holds "the whole model" and
 * every metric. No focus means everything; a focus means that metric's neighborhood — what it is computed
 * from, what is computed from it, and the assertions touching it. No thresholds, no second mode.
 */
import type { MetricGraph } from '../../../data/metricsApi';

/** A metric, its components, its dependents and its assertion partners — depth one, both ways. */
export function neighborhood(graph: MetricGraph, focusId: string | null): MetricGraph {
  if (!focusId) return graph;
  const keep = new Set<string>([focusId]);
  for (const edge of graph.edges) {
    if (edge.kind === 'derived' && (edge.from === focusId || edge.to === focusId)) {
      keep.add(edge.from);
      keep.add(edge.to);
    }
    if (edge.kind === 'assertion' && (edge.from === focusId || edge.to === focusId)) {
      keep.add(edge.from);
      keep.add(edge.to);
    }
  }
  const nodes = graph.nodes.filter((node) => keep.has(node.id));
  const edges = graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
  return {
    nodes,
    edges,
    derived_count: edges.filter((edge) => edge.kind === 'derived').length,
    assertion_count: edges.filter((edge) => edge.kind === 'assertion').length,
  };
}
