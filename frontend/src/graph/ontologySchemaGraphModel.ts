import type { LinkTypeResponse, ObjectTypeResponse } from '../data/ontologyApi';
import type { OntologyActionTypeResponse, OntologyFunctionResponse } from '../data/ontologyFunctionsApi';

export type OntologySchemaNodeKind = 'object' | 'action' | 'function';
export type OntologySchemaLinkKind = 'linkType' | 'appliesTo' | 'bindsFunction' | 'affiliatedWith';

export type OntologySchemaNode = {
  id: string;
  name: string;
  instanceCount: number;
  kind?: OntologySchemaNodeKind;
  fx?: number;
  fy?: number;
};

export type OntologySchemaLink = {
  id: string;
  source: string;
  target: string;
  name: string;
  cardinality: string;
  kind?: OntologySchemaLinkKind;
};

export type OntologySchemaGraphData = {
  nodes: OntologySchemaNode[];
  links: OntologySchemaLink[];
};

export type OntologyLogicLayerOptions = {
  showActions?: boolean;
  showFunctions?: boolean;
  actions?: OntologyActionTypeResponse[];
  functions?: OntologyFunctionResponse[];
};

/** Satellites sit in a grid below the host OT so they do not collide with LR neighbors. */
const SATELLITE_OFFSET_Y = 96;
const SATELLITE_ROW_GAP = 56;
const SATELLITE_COL_GAP = 28;
const SATELLITE_MAX_COLS = 2;
const SATELLITE_MIN_LABEL_W = 96;
const SATELLITE_MAX_LABEL_W = 190;
const SATELLITE_CHAR_W = 7.2;

export type OntologyLayoutMode =
  | 'schema'
  | 'lr'
  | 'rl'
  | 'td'
  | 'bu'
  | 'radialout'
  | 'radialin';

const LAYER_SPACING = 360;
const NODE_SPACING = 180;
const COMPONENT_GAP = 420;
const ORPHAN_GAP = 220;
const ORPHAN_SPACING = 200;
const RADIAL_BASE = 100;
const RADIAL_RING = 140;

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

/** How many columns to use when packing disconnected type groups onto the canvas. */
function componentGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  return Math.ceil(Math.sqrt(count));
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

  type Packed = {
    local: LocalPos[];
    width: number;
    height: number;
  };

  const packed: Packed[] = components.map((compIds) => {
    const compSet = new Set(compIds);
    const compLinks = links.filter((l) => compSet.has(l.source) && compSet.has(l.target));
    const localRaw = layoutComponentLocal(compIds, compLinks, mode);
    const bounds = componentBounds(localRaw);
    const local = localRaw.map((p) => ({
      id: p.id,
      x: p.x - bounds.minX,
      y: p.y - bounds.minY,
    }));
    return {
      local,
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY),
    };
  });

  // Spread disconnected ontology groups across a 2D grid (not a single vertical stack).
  const cols = componentGridColumns(packed.length);
  const rows = Math.max(1, Math.ceil(packed.length / cols));
  const colWidths = Array.from({ length: cols }, () => 0);
  const rowHeights = Array.from({ length: rows }, () => 0);
  packed.forEach((p, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colWidths[c] = Math.max(colWidths[c]!, p.width);
    rowHeights[r] = Math.max(rowHeights[r]!, p.height);
  });

  const colOriginX: number[] = [];
  let xCursor = 0;
  for (let c = 0; c < cols; c++) {
    colOriginX[c] = xCursor;
    xCursor += colWidths[c]! + COMPONENT_GAP;
  }
  const rowOriginY: number[] = [];
  let yCursor = 0;
  for (let r = 0; r < rows; r++) {
    rowOriginY[r] = yCursor;
    yCursor += rowHeights[r]! + COMPONENT_GAP;
  }

  packed.forEach((p, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // Center each group inside its grid cell so small clusters do not hug the top-left.
    const cellW = colWidths[c]!;
    const cellH = rowHeights[r]!;
    const ox = colOriginX[c]! + (cellW - p.width) / 2;
    const oy = rowOriginY[r]! + (cellH - p.height) / 2;
    for (const pos of p.local) {
      const node = nodes.find((n) => n.id === pos.id);
      if (!node) continue;
      node.fx = pos.x + ox;
      node.fy = pos.y + oy;
    }
  });

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
    const maxY = Math.max(
      ...nodes.filter((n) => n.fy != null).map((n) => n.fy ?? 0),
      0,
    );
    const orphanY = maxY + ORPHAN_GAP;
    // Spread orphans in a row (or short multi-row) under the grid, not as another skinny column.
    const orphanCols = Math.min(orphans.length, Math.max(cols, 3));
    orphans.forEach((node, index) => {
      const c = index % orphanCols;
      const r = Math.floor(index / orphanCols);
      const rowLen = Math.min(orphanCols, orphans.length - r * orphanCols);
      const startX = -((rowLen - 1) * ORPHAN_SPACING) / 2;
      node.fx = startX + c * ORPHAN_SPACING;
      node.fy = orphanY + r * ORPHAN_SPACING;
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
    kind: 'object',
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
      kind: 'linkType',
    });
  }

  return { nodes, links };
}

function linkEndpointId(endpoint: string | OntologySchemaNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function estimatedLabelWidth(name: string): number {
  return Math.min(
    SATELLITE_MAX_LABEL_W,
    Math.max(SATELLITE_MIN_LABEL_W, name.length * SATELLITE_CHAR_W + 20),
  );
}

function satelliteBlockHalfWidth(satellites: OntologySchemaNode[]): number {
  if (satellites.length === 0) return 56;
  const cols = Math.min(SATELLITE_MAX_COLS, satellites.length);
  const row0 = satellites.slice(0, cols);
  const totalW =
    row0.reduce((sum, n) => sum + estimatedLabelWidth(n.name), 0) +
    SATELLITE_COL_GAP * Math.max(0, row0.length - 1);
  return totalW / 2 + 20;
}

/** Widen gaps between same-layer OTs so below-host satellite grids do not collide. */
function expandObjectSpacingForSatellites(
  otById: Map<string, OntologySchemaNode>,
  satellitesByOt: Map<string, OntologySchemaNode[]>,
): void {
  const ots = [...otById.values()].sort((a, b) => (a.fx ?? 0) - (b.fx ?? 0));
  for (let i = 1; i < ots.length; i++) {
    const left = ots[i - 1]!;
    const right = ots[i]!;
    if (Math.abs((left.fy ?? 0) - (right.fy ?? 0)) > NODE_SPACING) continue;
    const need =
      satelliteBlockHalfWidth(satellitesByOt.get(left.id) ?? []) +
      satelliteBlockHalfWidth(satellitesByOt.get(right.id) ?? []) +
      48;
    const gap = (right.fx ?? 0) - (left.fx ?? 0);
    if (gap >= need) continue;
    const shift = need - gap;
    const bandY = right.fy ?? 0;
    for (let j = i; j < ots.length; j++) {
      const ot = ots[j]!;
      if (Math.abs((ot.fy ?? 0) - bandY) <= NODE_SPACING) {
        ot.fx = (ot.fx ?? 0) + shift;
      }
    }
  }
}

/** Place Action/Function chips in rows under the host — keeps LR schema edges readable. */
function placeSatellitesBelowHost(host: OntologySchemaNode, satellites: OntologySchemaNode[]): void {
  const hx = host.fx ?? 0;
  const hy = host.fy ?? 0;
  const n = satellites.length;
  if (n === 0) return;

  const cols = Math.min(SATELLITE_MAX_COLS, n);
  const widths = satellites.map((s) => estimatedLabelWidth(s.name));

  for (let rowStart = 0; rowStart < n; rowStart += cols) {
    const row = satellites.slice(rowStart, rowStart + cols);
    const rowWidths = widths.slice(rowStart, rowStart + cols);
    const rowIndex = Math.floor(rowStart / cols);
    const totalW =
      rowWidths.reduce((sum, w) => sum + w, 0) + SATELLITE_COL_GAP * Math.max(0, row.length - 1);
    let x = hx - totalW / 2;
    row.forEach((node, col) => {
      const w = rowWidths[col]!;
      node.fx = x + w / 2;
      node.fy = hy + SATELLITE_OFFSET_Y + rowIndex * SATELLITE_ROW_GAP;
      x += w + SATELLITE_COL_GAP;
    });
  }
}

/** After satellites hang below OTs, push stacked schema components apart so they do not overlap. */
function separateStackedComponents(nodes: OntologySchemaNode[]): void {
  const objects = nodes
    .filter((n) => (n.kind ?? 'object') === 'object' && n.fy != null)
    .sort((a, b) => (a.fy ?? 0) - (b.fy ?? 0) || (a.fx ?? 0) - (b.fx ?? 0));
  if (objects.length < 2) return;

  // Group OTs that share roughly the same vertical band (same schema component after LR layout).
  const bands: OntologySchemaNode[][] = [];
  const BAND_Y = NODE_SPACING * 0.75;
  for (const ot of objects) {
    const last = bands[bands.length - 1];
    if (!last) {
      bands.push([ot]);
      continue;
    }
    const refY = last.reduce((s, n) => s + (n.fy ?? 0), 0) / last.length;
    if (Math.abs((ot.fy ?? 0) - refY) <= BAND_Y) last.push(ot);
    else bands.push([ot]);
  }

  if (bands.length < 2) return;

  const pad = 36;
  let prevMaxY = -Infinity;
  for (const band of bands) {
    const bandIds = new Set(band.map((n) => n.id));
    // Include satellites hosted under any OT in this band (below-host placement).
    const related = nodes.filter((n) => {
      if (bandIds.has(n.id)) return true;
      if ((n.kind ?? 'object') === 'object') return false;
      return band.some((ot) => {
        const dx = Math.abs((n.fx ?? 0) - (ot.fx ?? 0));
        const dy = (n.fy ?? 0) - (ot.fy ?? 0);
        return dy > 0 && dy < SATELLITE_OFFSET_Y + SATELLITE_ROW_GAP * 4 && dx < 420;
      });
    });
    const minY = Math.min(...related.map((n) => n.fy ?? 0));
    if (prevMaxY > -Infinity && minY < prevMaxY + pad) {
      const shift = prevMaxY + pad - minY;
      for (const n of related) {
        n.fy = (n.fy ?? 0) + shift;
      }
    }
    const newMax = Math.max(...related.map((n) => n.fy ?? 0));
    prevMaxY = Math.max(prevMaxY, newMax);
  }
}

/** Attach Action / Function nodes after schema OT+LT layout. */
export function attachLogicOverlay(
  schemaLaidOut: OntologySchemaGraphData,
  options: OntologyLogicLayerOptions,
): OntologySchemaGraphData {
  const showActions = Boolean(options.showActions);
  const showFunctions = Boolean(options.showFunctions);
  if (!showActions && !showFunctions) return schemaLaidOut;

  const nodes = [...schemaLaidOut.nodes];
  const links = [...schemaLaidOut.links];
  const otById = new Map(nodes.filter((n) => (n.kind ?? 'object') === 'object').map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const satellitesByOt = new Map<string, OntologySchemaNode[]>();

  const addSatellite = (otId: string, node: OntologySchemaNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
    const list = satellitesByOt.get(otId) ?? [];
    list.push(node);
    satellitesByOt.set(otId, list);
  };

  if (showActions) {
    for (const action of options.actions ?? []) {
      if (!otById.has(action.object_type_id)) continue;
      addSatellite(action.object_type_id, {
        id: action.id,
        name: action.display_name,
        instanceCount: 0,
        kind: 'action',
      });
      links.push({
        id: `action-applies-${action.id}`,
        source: action.id,
        target: action.object_type_id,
        name: action.api_name,
        cardinality: 'applies-to',
        kind: 'appliesTo',
      });
    }
  }

  if (showFunctions) {
    const functions = options.functions ?? [];
    const fnById = new Map(functions.map((fn) => [fn.id, fn]));

    for (const fn of functions) {
      if (!fn.object_type_id || !otById.has(fn.object_type_id)) continue;
      addSatellite(fn.object_type_id, {
        id: fn.id,
        name: fn.display_name,
        instanceCount: 0,
        kind: 'function',
      });
      links.push({
        id: `fn-affiliated-${fn.id}`,
        source: fn.id,
        target: fn.object_type_id,
        name: fn.api_name,
        cardinality: 'affiliated',
        kind: 'affiliatedWith',
      });
    }

    if (showActions) {
      for (const action of options.actions ?? []) {
        if (!action.function_id || !otById.has(action.object_type_id)) continue;
        const fn = fnById.get(action.function_id);
        if (!fn) continue;
        if (!nodeIds.has(fn.id)) {
          addSatellite(action.object_type_id, {
            id: fn.id,
            name: fn.display_name,
            instanceCount: 0,
            kind: 'function',
          });
        }
        if (nodeIds.has(action.id) && nodeIds.has(fn.id)) {
          links.push({
            id: `action-binds-${action.id}-${fn.id}`,
            source: action.id,
            target: fn.id,
            name: 'binds',
            cardinality: 'binds',
            kind: 'bindsFunction',
          });
        }
      }
    }
  }

  // Prefer stable order: actions then functions, by name.
  for (const [, satellites] of satellitesByOt) {
    satellites.sort((a, b) => {
      const ka = a.kind === 'action' ? 0 : 1;
      const kb = b.kind === 'action' ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });
  }

  expandObjectSpacingForSatellites(otById, satellitesByOt);

  for (const [otId, satellites] of satellitesByOt) {
    const host = otById.get(otId);
    if (!host) continue;
    placeSatellitesBelowHost(host, satellites);
  }

  separateStackedComponents(nodes);

  for (const n of nodes) {
    if (n.fx != null && n.fy != null) {
      (n as OntologySchemaNode & { x?: number; y?: number }).x = n.fx;
      (n as OntologySchemaNode & { x?: number; y?: number }).y = n.fy;
    }
  }

  return { nodes, links };
}

/** Fresh graph payload for ForceGraph2D — avoids stale link→node refs after layout switches. */
export function graphDataForLayoutMode(
  data: OntologySchemaGraphData,
  layoutMode: string,
  logic?: OntologyLogicLayerOptions,
): OntologySchemaGraphData {
  const mode = (layoutMode === 'schema' ? 'schema' : layoutMode) as OntologyLayoutMode;
  const schemaNodes = data.nodes.filter((n) => (n.kind ?? 'object') === 'object');
  const schemaLinks = data.links.filter((l) => (l.kind ?? 'linkType') === 'linkType');

  const nodes: OntologySchemaNode[] = schemaNodes.map((n) => ({
    id: n.id,
    name: n.name,
    instanceCount: n.instanceCount,
    kind: 'object' as const,
  }));
  const links = schemaLinks.map((l) => ({
    id: l.id,
    name: l.name,
    cardinality: l.cardinality,
    kind: 'linkType' as const,
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

  return attachLogicOverlay({ nodes, links }, logic ?? {});
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
