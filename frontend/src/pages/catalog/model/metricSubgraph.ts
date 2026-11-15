/**
 * Which part of a model's metric graph is worth drawing — always one metric's neighborhood.
 *
 * A semantic model can declare eleven metrics or a hundred; a hundred-node picture is a hairball either
 * way, and a threshold ("draw everything under N") is two behaviors to maintain and two pictures to
 * explain. One rule instead: the focused metric, everything it is computed from, everything computed from
 * it, and the assertions that touch it. Same at any size.
 */
import type { MetricGraph, MetricGraphEdge, MetricGraphNode } from '../../../data/metricsApi';

function incidentEdgeCount(nodes: MetricGraphNode[], edges: MetricGraphEdge[]): Map<string, number> {
  const counts = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

/** The most connected metric — the one whose neighborhood says the most about this model. */
export function defaultFocus(graph: MetricGraph): string | null {
  if (graph.nodes.length === 0) return null;
  const counts = incidentEdgeCount(graph.nodes, graph.edges);
  return [...graph.nodes]
    .sort((a, b) => {
      const delta = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      return delta !== 0 ? delta : a.name.localeCompare(b.name);
    })[0].id;
}

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
