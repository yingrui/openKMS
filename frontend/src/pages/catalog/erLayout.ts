/**
 * Layout for the catalog's ER diagram: layers follow the join direction.
 *
 * A registered join is a foreign key from many to one, so the dataset that owns the key (`from`) sits *below*
 * the dataset it points at (`to`). That puts dimension tables at the top and the tables that reference them
 * underneath — the arrangement a reader expects, instead of whichever order the API happened to return.
 *
 * Deterministic: the same catalog produces the same picture, and a cycle in the joins cannot hang it.
 */

export type LayoutNode = { id: string; columns?: string[] };
export type LayoutLink = { source: string; target: string };

export type LayoutOptions = {
  boxWidth: number;
  gapX: number;
  gapY: number;
  padding: number;
  /** A box's height, given how many column rows it shows. */
  height: (node: LayoutNode) => number;
};

export type LayoutResult = {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
};

/** Longest path from a parentless dataset, with cycles cut where they close. */
function assignLayers(nodes: LayoutNode[], links: LayoutLink[]): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id));
  const parents = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const link of links) {
    if (!ids.has(link.source) || !ids.has(link.target) || link.source === link.target) continue;
    parents.get(link.source)!.push(link.target);
  }

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const resolve = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // a cycle: stop descending, keep the layer it already has
    visiting.add(id);
    const own = parents.get(id) ?? [];
    const value = own.length === 0 ? 0 : Math.max(...own.map(resolve)) + 1;
    visiting.delete(id);
    layer.set(id, value);
    return value;
  };
  for (const node of nodes) resolve(node.id);
  return layer;
}

/**
 * One barycenter sweep: order a layer by the average position of its parents in the layer above, which is what
 * keeps a join from crossing three others on its way up. Ties keep the incoming order, so the result is stable.
 */
function orderLayer(layerNodes: string[], above: string[], parents: Map<string, string[]>): string[] {
  const index = new Map(above.map((id, i) => [id, i]));
  return [...layerNodes]
    .map((id, position) => {
      const anchors = (parents.get(id) ?? [])
        .map((parent) => index.get(parent))
        .filter((value): value is number => value !== undefined);
      const barycenter = anchors.length
        ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length
        : position;
      return { id, barycenter, position };
    })
    .sort((a, b) => a.barycenter - b.barycenter || a.position - b.position || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}

export function layoutEr(
  nodes: LayoutNode[],
  links: LayoutLink[],
  options: LayoutOptions,
): LayoutResult {
  const { boxWidth, gapX, gapY, padding, height } = options;
  if (nodes.length === 0) return { positions: {}, width: 0, height: 0 };

  const layers = assignLayers(nodes, links);
  const parents = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const link of links) {
    if (parents.has(link.source) && parents.has(link.target)) {
      parents.get(link.source)!.push(link.target);
    }
  }

  /* Dense: a catalog can skip a layer (a chain of three and a lone table), and a hole must not become a row. */
  const depth = Math.max(...nodes.map((node) => layers.get(node.id) ?? 0)) + 1;
  const byLayer: string[][] = Array.from({ length: depth }, () => []);
  for (const node of nodes) byLayer[layers.get(node.id) ?? 0].push(node.id);
  for (let i = depth - 1; i >= 0; i -= 1) {
    if (byLayer[i].length === 0) byLayer.splice(i, 1);
  }
  /* Every layer is ordered, the top one too: its tie-break is by id, so an API that reorders its list does not
     reorder the diagram. */
  byLayer[0] = [...byLayer[0]].sort((a, b) => a.localeCompare(b));
  for (let i = 1; i < byLayer.length; i += 1) {
    byLayer[i] = orderLayer(byLayer[i], byLayer[i - 1], parents);
  }

  const heights = new Map(nodes.map((node) => [node.id, height(node)]));
  const columnCount = Math.max(...byLayer.map((row) => row.length));
  const width = padding * 2 + columnCount * boxWidth + (columnCount - 1) * gapX;

  const positions: Record<string, { x: number; y: number }> = {};
  let y = padding;
  for (const row of byLayer) {
    const rowIds = row;
    const rowHeight = Math.max(...rowIds.map((id) => heights.get(id) ?? 0), 0);
    /* Each layer is centred, so a narrow layer reads as a column of the same diagram rather than a ragged edge. */
    const rowWidth = rowIds.length * boxWidth + (rowIds.length - 1) * gapX;
    const startX = padding + Math.max(0, (width - padding * 2 - rowWidth) / 2);
    rowIds.forEach((id, index) => {
      positions[id] = { x: startX + index * (boxWidth + gapX), y };
    });
    y += rowHeight + gapY;
  }

  return { positions, width, height: Math.max(0, y - gapY + padding) };
}
