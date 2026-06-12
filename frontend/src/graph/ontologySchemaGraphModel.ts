import type { LinkTypeResponse, ObjectTypeResponse } from '../data/ontologyApi';

export type OntologySchemaNode = {
  id: string;
  name: string;
  instanceCount: number;
  fx?: number;
  fy?: number;
};

export type OntologySchemaLink = {
  id: string;
  source: string;
  target: string;
  name: string;
  cardinality: string;
};

export type OntologySchemaGraphData = {
  nodes: OntologySchemaNode[];
  links: OntologySchemaLink[];
};

export type OntologyLayoutMode =
  | 'schema'
  | 'lr'
  | 'rl'
  | 'td'
  | 'bu'
  | 'radialout'
  | 'radialin';

const LAYER_SPACING = 200;
const NODE_SPACING = 112;
const COMPONENT_GAP = 240;
const ORPHAN_GAP = 160;
const ORPHAN_SPACING = 150;
const RADIAL_BASE = 72;
const RADIAL_RING = 108;

function linkedNodeIds(links: OntologySchemaLink[]): Set<string> {
  const linked = new Set<string>();
  for (const l of links) {
    linked.add(l.source);
    linked.add(l.target);
  }
  return linked;
}

function findComponents(nodeIds: Set<string>, links: OntologySchemaLink[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const l of links) {
    if (!nodeIds.has(l.source) || !nodeIds.has(l.target)) continue;
    adj.get(l.source)!.add(l.target);
    adj.get(l.target)!.add(l.source);
  }

  const components: string[][] = [];
  const seen = new Set<string>();
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) stack.push(next);
      }
    }
    components.push(comp);
  }
  return components;
}

/** Longest-path layering along directed edges (source → target). */
function assignDirectedLayers(nodeIds: Set<string>, links: OntologySchemaLink[]): string[][] {
  const layerOf = new Map<string, number>();
  for (const id of nodeIds) layerOf.set(id, 0);

  let changed = true;
  while (changed) {
    changed = false;
    for (const l of links) {
      if (!nodeIds.has(l.source) || !nodeIds.has(l.target)) continue;
      const next = (layerOf.get(l.source) ?? 0) + 1;
      if (next > (layerOf.get(l.target) ?? 0)) {
        layerOf.set(l.target, next);
        changed = true;
      }
    }
  }

  const maxLayer = Math.max(0, ...layerOf.values());
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of nodeIds) {
    layers[layerOf.get(id) ?? 0]!.push(id);
  }
  return layers;
}

function orderLayerNodes(layers: string[][], links: OntologySchemaLink[]): void {
  const prevPos = new Map<string, number>();
  layers[0]?.forEach((id, i) => prevPos.set(id, i));

  for (let li = 1; li < layers.length; li++) {
    const prev = layers[li - 1]!;
    const layer = layers[li]!;
    const scored = layer.map((id) => {
      const neighbors = links
        .filter((l) => l.target === id && prev.includes(l.source))
        .map((l) => prevPos.get(l.source))
        .filter((v): v is number => v != null);
      const score =
        neighbors.length > 0 ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : layer.indexOf(id);
      return { id, score };
    });
    scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    layers[li] = scored.map((s) => s.id);
    layers[li]!.forEach((id, i) => prevPos.set(id, i));
  }
}

type LocalPos = { id: string; x: number; y: number };

function layoutComponentLocal(
  compIds: string[],
  compLinks: OntologySchemaLink[],
  mode: OntologyLayoutMode
): LocalPos[] {
  const compSet = new Set(compIds);
  const layers = assignDirectedLayers(compSet, compLinks);
  orderLayerNodes(layers, compLinks);

  const direction = mode === 'schema' ? 'lr' : mode;
  const positions: LocalPos[] = [];

  if (direction === 'radialout' || direction === 'radialin') {
    const maxLayer = Math.max(0, layers.length - 1);
    layers.forEach((layer, layerIndex) => {
      const radius =
        direction === 'radialout'
          ? RADIAL_BASE + layerIndex * RADIAL_RING
          : RADIAL_BASE + (maxLayer - layerIndex) * RADIAL_RING;
      layer.forEach((nodeId, rowIndex) => {
        const angle = (2 * Math.PI * rowIndex) / Math.max(1, layer.length) - Math.PI / 2;
        positions.push({
          id: nodeId,
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        });
      });
    });
    return positions;
  }

  layers.forEach((layer, layerIndex) => {
    layer.forEach((nodeId, rowIndex) => {
      const centered = rowIndex - (layer.length - 1) / 2;
      let x = 0;
      let y = 0;
      switch (direction) {
        case 'lr':
          x = layerIndex * LAYER_SPACING;
          y = centered * NODE_SPACING;
          break;
        case 'rl':
          x = (layers.length - 1 - layerIndex) * LAYER_SPACING;
          y = centered * NODE_SPACING;
          break;
        case 'td':
          x = centered * NODE_SPACING;
          y = layerIndex * LAYER_SPACING;
          break;
        case 'bu':
          x = centered * NODE_SPACING;
          y = (layers.length - 1 - layerIndex) * LAYER_SPACING;
          break;
        default:
          x = layerIndex * LAYER_SPACING;
          y = centered * NODE_SPACING;
      }
      positions.push({ id: nodeId, x, y });
    });
  });

  return positions;
}

function componentBounds(positions: LocalPos[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  return {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, 0),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, 0),
  };
}

export function layoutOntologyGraph(
  nodes: OntologySchemaNode[],
  links: OntologySchemaLink[],
  mode: OntologyLayoutMode
): void {
  for (const n of nodes) {
    delete n.fx;
    delete n.fy;
  }

  const linked = linkedNodeIds(links);
  const linkedIds = new Set([...linked].filter((id) => nodes.some((n) => n.id === id)));
  const components = findComponents(linkedIds, links).sort((a, b) => b.length - a.length);

  let offsetY = 0;

  for (const compIds of components) {
    const compSet = new Set(compIds);
    const compLinks = links.filter((l) => compSet.has(l.source) && compSet.has(l.target));
    const local = layoutComponentLocal(compIds, compLinks, mode);
    const bounds = componentBounds(local);

    for (const pos of local) {
      const node = nodes.find((n) => n.id === pos.id);
      if (!node) continue;
      node.fx = pos.x - bounds.minX;
      node.fy = pos.y - bounds.minY + offsetY;
    }

    offsetY += bounds.maxY - bounds.minY + COMPONENT_GAP;
  }

  const positioned = nodes.filter((n) => n.fx != null && linkedIds.has(n.id));
  if (positioned.length > 0) {
    const cx = positioned.reduce((s, n) => s + (n.fx ?? 0), 0) / positioned.length;
    const cy = positioned.reduce((s, n) => s + (n.fy ?? 0), 0) / positioned.length;
    for (const n of positioned) {
      n.fx = (n.fx ?? 0) - cx;
      n.fy = (n.fy ?? 0) - cy;
    }
  }

  const orphans = nodes.filter((n) => !linked.has(n.id));
  if (orphans.length > 0) {
    const maxY = Math.max(0, ...nodes.map((n) => n.fy ?? 0));
    const orphanY = maxY + ORPHAN_GAP;
    const startX = -((orphans.length - 1) * ORPHAN_SPACING) / 2;
    orphans.forEach((node, index) => {
      node.fx = startX + index * ORPHAN_SPACING;
      node.fy = orphanY;
    });
  }
}

export function buildOntologySchemaGraph(
  objectTypes: ObjectTypeResponse[],
  linkTypes: LinkTypeResponse[]
): OntologySchemaGraphData {
  const nodes: OntologySchemaNode[] = objectTypes.map((ot) => ({
    id: ot.id,
    name: ot.name,
    instanceCount: ot.instance_count,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const links: OntologySchemaLink[] = [];
  for (const lt of linkTypes) {
    if (lt.source_object_type_id === lt.target_object_type_id) {
      continue;
    }
    if (!nodeIds.has(lt.source_object_type_id) || !nodeIds.has(lt.target_object_type_id)) {
      continue;
    }
    links.push({
      id: lt.id,
      source: lt.source_object_type_id,
      target: lt.target_object_type_id,
      name: lt.name,
      cardinality: lt.cardinality,
    });
  }

  return { nodes, links };
}

function linkEndpointId(endpoint: string | OntologySchemaNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

/** Fresh graph payload for ForceGraph2D — avoids stale link→node refs after layout switches. */
export function graphDataForLayoutMode(
  data: OntologySchemaGraphData,
  layoutMode: string
): OntologySchemaGraphData {
  const mode = (layoutMode === 'schema' ? 'schema' : layoutMode) as OntologyLayoutMode;
  const nodes: OntologySchemaNode[] = data.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    instanceCount: n.instanceCount,
  }));
  const links = data.links.map((l) => ({
    id: l.id,
    name: l.name,
    cardinality: l.cardinality,
    source: linkEndpointId(l.source as string | OntologySchemaNode),
    target: linkEndpointId(l.target as string | OntologySchemaNode),
  }));

  layoutOntologyGraph(nodes, links, mode);

  for (const n of nodes) {
    if (n.fx != null && n.fy != null) {
      (n as OntologySchemaNode & { x?: number; y?: number }).x = n.fx;
      (n as OntologySchemaNode & { x?: number; y?: number }).y = n.fy;
    }
  }

  return { nodes, links };
}

export const ONTOLOGY_SCHEMA_NODE_COLORS = [
  '#4f46e5',
  '#059669',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0d9488',
  '#be185d',
  '#2563eb',
  '#16a34a',
  '#ea580c',
] as const;

export function ontologySchemaNodeColor(index: number): string {
  return ONTOLOGY_SCHEMA_NODE_COLORS[index % ONTOLOGY_SCHEMA_NODE_COLORS.length];
}

export function zoomOntologySchemaGraph(
  g: { zoomToFit?: (ms?: number, padding?: number) => void },
  durationMs = 400,
  padding = 48
): void {
  g.zoomToFit?.(durationMs, padding);
}
