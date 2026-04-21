import { useMemo } from 'react';
import type { KnowledgeMapNode, ResourceLink } from '../data/knowledgeMapApi';
import './KnowledgeMapMindMap.css';

const COL_W = 168;
const ROW_GAP = 10;
const PILL_H = 36;
const RES_LINE = 17;
const MAX_RES_SHOWN = 4;

function estimateWidth(label: string): number {
  return Math.min(220, Math.max(72, Math.round(7 * label.length + 28)));
}

function linksForNode(links: ResourceLink[], nodeId: string): ResourceLink[] {
  return links.filter((l) => l.taxonomy_node_id === nodeId);
}

function nodeBlockHeight(node: KnowledgeMapNode, links: ResourceLink[]): number {
  const n = linksForNode(links, node.id).length;
  const shown = Math.min(n, MAX_RES_SHOWN);
  const extra = n > 0 ? 8 + shown * RES_LINE + (n > MAX_RES_SHOWN ? RES_LINE : 0) : 0;
  return PILL_H + extra;
}

type Side = 'left' | 'right';

interface LayoutCell {
  node: KnowledgeMapNode;
  side: Side;
  depth: number;
  branchColor: number;
  parentId: string;
}

function collectSubtree(
  node: KnowledgeMapNode,
  side: Side,
  depth: number,
  branchColor: number,
  parentId: string,
  out: LayoutCell[],
): void {
  out.push({ node, side, depth, branchColor, parentId });
  const ch = node.children ?? [];
  ch.forEach((c, i) => {
    collectSubtree(c, side, depth + 1, (branchColor + i) % 4, node.id, out);
  });
}

interface Placed {
  id: string;
  kind: 'center' | 'node';
  label: string;
  node?: KnowledgeMapNode;
  cx: number;
  cy: number;
  w: number;
  h: number;
  side: 'center' | Side;
  branchColor: number;
  parentId?: string;
  resources: ResourceLink[];
  resolveLabel: (resourceType: string, resourceId: string) => string;
}

interface Edge {
  from: string;
  to: string;
  branchColor: number;
}

function buildLayout(
  tree: KnowledgeMapNode[],
  links: ResourceLink[],
  resolveLabel: (resourceType: string, resourceId: string) => string,
): { placed: Placed[]; edges: Edge[]; width: number; height: number; multiRoot: boolean } {
  const edges: Edge[] = [];
  const cells: LayoutCell[] = [];

  if (!tree.length) {
    return { placed: [], edges: [], width: 400, height: 200, multiRoot: false };
  }

  const multiRoot = tree.length > 1;
  const centerLabel = multiRoot ? 'Knowledge Map' : tree[0].name;
  const centerId = multiRoot ? '__km_center__' : tree[0].id;

  if (multiRoot) {
    tree.forEach((root, i) => {
      const side: Side = i % 2 === 0 ? 'left' : 'right';
      collectSubtree(root, side, 1, i % 4, centerId, cells);
    });
  } else {
    const root = tree[0];
    const ch = root.children ?? [];
    ch.forEach((c, i) => {
      const side: Side = i % 2 === 0 ? 'left' : 'right';
      collectSubtree(c, side, 1, i % 4, root.id, cells);
    });
  }

  for (const c of cells) {
    edges.push({ from: c.parentId, to: c.node.id, branchColor: c.branchColor });
  }

  const leftByDepth = new Map<number, KnowledgeMapNode[]>();
  const rightByDepth = new Map<number, KnowledgeMapNode[]>();
  const cellMeta = new Map<string, LayoutCell>();

  for (const c of cells) {
    const map = c.side === 'left' ? leftByDepth : rightByDepth;
    const arr = map.get(c.depth) ?? [];
    arr.push(c.node);
    map.set(c.depth, arr);
    cellMeta.set(c.node.id, c);
  }

  const centerX = 520;
  const centerY = 320;
  const placed: Placed[] = [];

  const centerW = estimateWidth(centerLabel);
  const centerH = multiRoot ? PILL_H + 4 : nodeBlockHeight(tree[0], links);

  placed.push({
    id: centerId,
    kind: 'center',
    label: centerLabel,
    node: multiRoot ? undefined : tree[0],
    cx: centerX,
    cy: centerY,
    w: centerW,
    h: centerH,
    side: 'center',
    branchColor: 0,
    parentId: undefined,
    resources: multiRoot ? [] : linksForNode(links, tree[0].id),
    resolveLabel,
  });

  const placeColumn = (side: Side, colMap: Map<number, KnowledgeMapNode[]>) => {
    const depths = [...colMap.keys()].sort((a, b) => a - b);
    for (const d of depths) {
      const nodes = colMap.get(d) ?? [];
      const totalH = nodes.reduce((sum, n) => sum + nodeBlockHeight(n, links) + ROW_GAP, -ROW_GAP);
      let y = centerY - totalH / 2;
      for (const n of nodes) {
        const h = nodeBlockHeight(n, links);
        const w = estimateWidth(n.name);
        const cx =
          side === 'left'
            ? centerX - centerW / 2 - 48 - d * COL_W - w / 2
            : centerX + centerW / 2 + 48 + d * COL_W + w / 2;
        const cy = y + h / 2;
        y += h + ROW_GAP;
        const meta = cellMeta.get(n.id)!;
        placed.push({
          id: n.id,
          kind: 'node',
          label: n.name,
          node: n,
          cx,
          cy,
          w,
          h,
          side,
          branchColor: meta.branchColor,
          parentId: meta.parentId,
          resources: linksForNode(links, n.id),
          resolveLabel,
        });
      }
    }
  };

  placeColumn('left', leftByDepth);
  placeColumn('right', rightByDepth);

  let minX = centerX - centerW / 2;
  let maxX = centerX + centerW / 2;
  let minY = centerY - centerH / 2;
  let maxY = centerY + centerH / 2;
  for (const p of placed) {
    minX = Math.min(minX, p.cx - p.w / 2 - 20);
    maxX = Math.max(maxX, p.cx + p.w / 2 + 20);
    minY = Math.min(minY, p.cy - p.h / 2 - 20);
    maxY = Math.max(maxY, p.cy + p.h / 2 + 20);
  }

  const pad = 56;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const ox = minX - pad;
  const oy = minY - pad;

  for (const p of placed) {
    p.cx -= ox;
    p.cy -= oy;
  }

  return { placed, edges, width, height, multiRoot };
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.5);
  const cx1 = x1 + (x2 > x1 ? dx : -dx);
  const cx2 = x2 + (x2 > x1 ? -dx : dx);
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

function edgeAnchors(a: Placed, b: Placed): { x1: number; y1: number; x2: number; y2: number } {
  const aR = a.cx + a.w / 2;
  const aL = a.cx - a.w / 2;
  const bR = b.cx + b.w / 2;
  const bL = b.cx - b.w / 2;
  if (b.cx > a.cx) {
    return { x1: aR, y1: a.cy, x2: bL, y2: b.cy };
  }
  return { x1: aL, y1: a.cy, x2: bR, y2: b.cy };
}

export function KnowledgeMapMindMap({
  tree,
  links,
  selectedNodeId,
  onSelectNode,
  resolveResourceLabel,
  className,
}: {
  tree: KnowledgeMapNode[];
  links: ResourceLink[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  resolveResourceLabel: (resourceType: string, resourceId: string) => string;
  /** Merged onto the scroll container (e.g. home page sizing). */
  className?: string;
}) {
  const { placed, edges, width, height, multiRoot } = useMemo(
    () => buildLayout(tree, links, resolveResourceLabel),
    [tree, links, resolveResourceLabel],
  );

  const placedById = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  if (!placed.length) {
    return null;
  }

  const scrollClass = ['km-mindmap-scroll', className].filter(Boolean).join(' ');

  return (
    <div className={scrollClass} role="application" aria-label="Knowledge Map mind map">
      <div className="km-mindmap-inner" style={{ width, height }}>
        <svg className="km-mindmap-svg" width={width} height={height} aria-hidden>
          {edges.map((e) => {
            const a = placedById.get(e.from);
            const b = placedById.get(e.to);
            if (!a || !b) return null;
            const { x1, y1, x2, y2 } = edgeAnchors(a, b);
            const d = bezierPath(x1, y1, x2, y2);
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={d}
                className={`km-mindmap-edge km-mindmap-edge--c${e.branchColor % 4}`}
                fill="none"
              />
            );
          })}
        </svg>
        {placed.map((p) => {
          const left = p.cx - p.w / 2;
          const top = p.cy - p.h / 2;
          const isSel = selectedNodeId === p.id;
          const overflow = p.resources.length - MAX_RES_SHOWN;
          const onActivate = () => {
            if (p.kind === 'center' && multiRoot) return;
            if (p.node) onSelectNode(p.node.id);
            else if (!multiRoot && tree[0]) onSelectNode(tree[0].id);
          };
          const nodeClass = `km-mindmap-node km-mindmap-node--${p.kind} km-mindmap-node--c${p.branchColor % 4}${isSel ? ' km-mindmap-node--selected' : ''}`;
          const nodeStyle = { left, top, width: p.w, minHeight: p.h } as const;
          const inner = (
            <>
              <span className="km-mindmap-node-title">{p.label}</span>
              {p.resources.length > 0 ? (
                <ul className="km-mindmap-res-list">
                  {p.resources.slice(0, MAX_RES_SHOWN).map((r) => (
                    <li key={r.id} className={`km-mindmap-res km-mindmap-res--${r.resource_type.replace(/_/g, '-')}`}>
                      <span className="km-mindmap-res-type">
                        {r.resource_type === 'document_channel'
                          ? 'Channel'
                          : r.resource_type === 'wiki_space'
                            ? 'Wiki'
                            : 'Articles'}
                      </span>
                      <span className="km-mindmap-res-label" title={p.resolveLabel(r.resource_type, r.resource_id)}>
                        {p.resolveLabel(r.resource_type, r.resource_id)}
                      </span>
                    </li>
                  ))}
                  {overflow > 0 ? (
                    <li className="km-mindmap-res km-mindmap-res--more">+{overflow} more</li>
                  ) : null}
                </ul>
              ) : null}
            </>
          );
          if (p.kind === 'center' && multiRoot) {
            return (
              <div key={p.id} className={nodeClass} style={nodeStyle} aria-label={p.label}>
                {inner}
              </div>
            );
          }
          return (
            <button
              key={p.id}
              type="button"
              className={nodeClass}
              style={nodeStyle}
              onClick={onActivate}
              aria-current={isSel ? 'true' : undefined}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
