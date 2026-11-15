/**
 * The dependency graph's geometry, kept out of the component so it can be asserted: rows are depths (a
 * metric sits one level above the metrics it is computed from), and every row is centred.
 */
import type { MetricGraph, MetricGraphEdge, MetricGraphNode } from '../../../data/metricsApi';

export const NODE_W = 168;
export const NODE_H = 44;
const COL_GAP = 40;
const ROW_GAP = 110;
const PAD = 32;

export type Placed = MetricGraphNode & { x: number; y: number; depth: number };

/** Longest path from a node to a metric that is computed from nothing — the row it belongs in. */
export function depths(nodes: MetricGraphNode[], edges: MetricGraphEdge[]): Map<string, number> {
  const components = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== 'derived') continue;
    components.set(edge.from, [...(components.get(edge.from) ?? []), edge.to]);
  }
  const memo = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) return 0; // a cycle cannot be laid out; treat it as a leaf rather than loop
    const next = stack.add(id);
    const children = components.get(id) ?? [];
    const depth = children.length === 0 ? 0 : 1 + Math.max(...children.map((child) => visit(child, next)));
    stack.delete(id);
    memo.set(id, depth);
    return depth;
  };
  for (const node of nodes) visit(node.id, new Set());
  return memo;
}

export function layout(graph: MetricGraph): { placed: Placed[]; width: number; height: number } {
  const depthOf = depths(graph.nodes, graph.edges);
  const rows = new Map<number, MetricGraphNode[]>();
  for (const node of graph.nodes) {
    const depth = depthOf.get(node.id) ?? 0;
    rows.set(depth, [...(rows.get(depth) ?? []), node]);
  }
  const maxDepth = Math.max(0, ...rows.keys());
  const widest = Math.max(1, ...[...rows.values()].map((row) => row.length));
  const width = Math.max(640, PAD * 2 + widest * NODE_W + (widest - 1) * COL_GAP);
  const height = PAD * 2 + (maxDepth + 1) * NODE_H + maxDepth * (ROW_GAP - NODE_H);

  const placed: Placed[] = [];
  for (const [depth, row] of rows) {
    // Base metrics (depth 0) sit at the bottom; each level above is computed from the one below.
    const y = PAD + (maxDepth - depth) * ROW_GAP;
    const rowWidth = row.length * NODE_W + (row.length - 1) * COL_GAP;
    const startX = (width - rowWidth) / 2;
    row.forEach((node, index) => {
      placed.push({ ...node, depth, x: startX + index * (NODE_W + COL_GAP), y });
    });
  }
  return { placed, width, height };
}
