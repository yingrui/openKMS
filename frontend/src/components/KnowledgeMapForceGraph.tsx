import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { forceCollide } from 'd3-force';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Expand, Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { KnowledgeMapNode, ResourceLink } from '../data/knowledgeMapApi';
import './KnowledgeMapForceGraph.css';

type KMNode = {
  id: string;
  name: string;
  deg: number;
  kind: 'taxonomy' | 'resource';
  resourceType?: string;
  resourceId?: string;
};

type KMLink = { source: string; target: string; kind: 'tree' | 'ref' };

const COLORS = {
  light: {
    bg: '#f3f2ef',
    nodeTax: '#0d9488',
    nodeTaxStroke: '#99f6e4',
    nodeTaxFocus: '#0f766e',
    nodeTaxFocusStroke: '#5eead4',
    nodeRes: '#78716c',
    nodeResStroke: '#d6d3d1',
    resChannelFill: '#e2e8f0',
    resChannelStroke: '#64748b',
    resChannelBar: '#475569',
    resWikiFill: '#ede9fe',
    resWikiStroke: '#7c3aed',
    resArticlesFill: '#ffedd5',
    resArticlesStroke: '#c2410c',
    resBadge: '#57534e',
    label: '#44403c',
    labelFocus: '#134e4a',
    linkTree: 'rgba(13, 148, 136, 0.38)',
    linkRef: 'rgba(87, 83, 78, 0.32)',
    linkArrowTree: 'rgba(13, 148, 136, 0.55)',
    linkArrowRef: 'rgba(87, 83, 78, 0.45)',
  },
  dark: {
    bg: '#2d2a27',
    nodeTax: '#2dd4bf',
    nodeTaxStroke: '#115e59',
    nodeTaxFocus: '#5eead4',
    nodeTaxFocusStroke: '#ccfbf1',
    nodeRes: '#a8a29e',
    nodeResStroke: '#57534e',
    resChannelFill: '#334155',
    resChannelStroke: '#94a3b8',
    resChannelBar: '#cbd5e1',
    resWikiFill: '#4c1d95',
    resWikiStroke: '#a78bfa',
    resArticlesFill: '#7c2d12',
    resArticlesStroke: '#fb923c',
    resBadge: '#a8a29e',
    label: '#e7e5e4',
    labelFocus: '#ccfbf1',
    linkTree: 'rgba(45, 212, 191, 0.35)',
    linkRef: 'rgba(214, 211, 209, 0.22)',
    linkArrowTree: 'rgba(94, 234, 212, 0.5)',
    linkArrowRef: 'rgba(214, 211, 209, 0.35)',
  },
} as const;

function resourceNodeId(r: ResourceLink): string {
  return `res:${r.resource_type}:${r.resource_id}`;
}

function walkTree(
  roots: KnowledgeMapNode[],
  links: ResourceLink[],
  resolveResourceLabel: (t: string, id: string) => string,
): { nodes: KMNode[]; links: KMLink[] } {
  const nodeById = new Map<string, KMNode>();
  const treeLinks: KMLink[] = [];

  function visit(n: KnowledgeMapNode, parentId: string | null) {
    nodeById.set(n.id, { id: n.id, name: n.name, deg: 0, kind: 'taxonomy' });
    if (parentId) {
      treeLinks.push({ source: parentId, target: n.id, kind: 'tree' });
    }
    for (const c of n.children ?? []) {
      visit(c, n.id);
    }
  }
  for (const root of roots) {
    visit(root, null);
  }

  const refLinks: KMLink[] = [];
  for (const r of links) {
    const rid = resourceNodeId(r);
    if (!nodeById.has(rid)) {
      const label = resolveResourceLabel(r.resource_type, r.resource_id);
      const name =
        r.resource_type === 'document_channel'
          ? `Document channel: ${label}`
          : r.resource_type === 'wiki_space'
            ? `Wiki space: ${label}`
            : `Articles: ${label}`;
      nodeById.set(rid, {
        id: rid,
        name,
        deg: 0,
        kind: 'resource',
        resourceType: r.resource_type,
        resourceId: r.resource_id,
      });
    }
    refLinks.push({ source: r.taxonomy_node_id, target: rid, kind: 'ref' });
  }

  const allLinks = [...treeLinks, ...refLinks];
  const deg = new Map<string, number>();
  for (const l of allLinks) {
    deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
    deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
  }
  const nodes = Array.from(nodeById.values()).map((n) => ({ ...n, deg: deg.get(n.id) ?? 0 }));
  return { nodes, links: allLinks };
}

function wrapLabelLines(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  const pushLongWord = (word: string) => {
    let chunk = '';
    for (const ch of word) {
      const next = chunk + ch;
      if (ctx.measureText(next).width <= maxWidth) {
        chunk = next;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    if (chunk) line = chunk;
    else line = '';
  };

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
    } else {
      pushLongWord(word);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function stripKnownResourceTitle(name: string, resourceType?: string): string {
  if (resourceType === 'document_channel' && name.startsWith('Document channel: ')) {
    return name.slice('Document channel: '.length);
  }
  if (resourceType === 'wiki_space' && name.startsWith('Wiki space: ')) {
    return name.slice('Wiki space: '.length);
  }
  if ((resourceType === 'articles' || name.startsWith('Articles:')) && name.startsWith('Articles: ')) {
    return name.slice('Articles: '.length);
  }
  return name;
}

function resourceBadgeAndTitle(n: KMNode): { badge: string; title: string } {
  if (n.resourceType === 'document_channel') {
    return { badge: 'Channel', title: stripKnownResourceTitle(n.name, n.resourceType) };
  }
  if (n.resourceType === 'wiki_space') {
    return { badge: 'Wiki', title: stripKnownResourceTitle(n.name, n.resourceType) };
  }
  if (n.resourceType === 'articles') {
    return { badge: 'Articles', title: stripKnownResourceTitle(n.name, n.resourceType) };
  }
  if (n.name.startsWith('Articles: ')) {
    return { badge: 'Articles', title: stripKnownResourceTitle(n.name, 'articles') };
  }
  return { badge: '', title: n.name };
}

function pathHexPointyTop(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 3) * i;
    const px = cx + R * Math.cos(angle);
    const py = cy + R * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  rx: number,
) {
  ctx.beginPath();
  ctx.moveTo(left + rx, top);
  ctx.lineTo(left + w - rx, top);
  ctx.quadraticCurveTo(left + w, top, left + w, top + rx);
  ctx.lineTo(left + w, top + h - rx);
  ctx.quadraticCurveTo(left + w, top + h, left + w - rx, top + h);
  ctx.lineTo(left + rx, top + h);
  ctx.quadraticCurveTo(left, top + h, left, top + h - rx);
  ctx.lineTo(left, top + rx);
  ctx.quadraticCurveTo(left, top, left + rx, top);
  ctx.closePath();
}

type SimNode = KMNode & { x?: number; y?: number; vx?: number; vy?: number };

function forceHubPull(baseStrength: number) {
  let nodes: SimNode[] = [];
  const force = (alpha: number) => {
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    for (const n of nodes) {
      const { x, y } = n;
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const w = 1 + Math.max(0, n.deg);
      wx += x * w;
      wy += y * w;
      wsum += w;
    }
    if (wsum < 1e-9) return;
    const cx = wx / wsum;
    const cy = wy / wsum;
    const k = baseStrength * alpha;
    for (const n of nodes) {
      const { x, y } = n;
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const dx = cx - x;
      const dy = cy - y;
      n.vx = (n.vx ?? 0) + dx * k;
      n.vy = (n.vy ?? 0) + dy * k;
    }
  };
  force.initialize = (init: SimNode[]) => {
    nodes = init;
  };
  return force;
}

type GraphControlRef = ForceGraphMethods<KMNode, KMLink> & {
  graphData?: () => { nodes: Array<KMNode & { x?: number; y?: number }> };
};

function coreNodeIdsForSpatialZoom(
  nodes: Array<{ id: string; x?: number; y?: number }>,
  keepFraction = 0.82,
): Set<string> | null {
  const positioned = nodes.filter(
    (n) => typeof n.x === 'number' && typeof n.y === 'number' && Number.isFinite(n.x) && Number.isFinite(n.y),
  );
  if (positioned.length < 8) return null;

  let cx = 0;
  let cy = 0;
  for (const n of positioned) {
    cx += n.x!;
    cy += n.y!;
  }
  cx /= positioned.length;
  cy /= positioned.length;

  const scored = positioned.map((n) => ({
    id: n.id,
    d: Math.hypot(n.x! - cx, n.y! - cy),
  }));
  scored.sort((a, b) => a.d - b.d);

  const keep = Math.max(5, Math.ceil(positioned.length * keepFraction));
  if (keep >= positioned.length) return null;

  return new Set(scored.slice(0, keep).map((s) => s.id));
}

function zoomToFitMainCluster(g: GraphControlRef, durationMs: number, paddingPx: number, focusId?: string | null): void {
  if (typeof g.zoomToFit !== 'function') return;
  const raw = g.graphData?.();
  const nodes = raw?.nodes;
  if (!nodes?.length) {
    g.zoomToFit(durationMs, paddingPx);
    return;
  }

  const focusInGraph = Boolean(focusId && nodes.some((n) => n.id === focusId));
  const core = coreNodeIdsForSpatialZoom(nodes);

  if (core && core.size >= 3) {
    g.zoomToFit(durationMs, paddingPx, (n: object) => {
      const id = (n as KMNode).id;
      if (core.has(id)) return true;
      if (focusInGraph && id === focusId) return true;
      return false;
    });
  } else {
    g.zoomToFit(durationMs, paddingPx);
  }
}

function useDataTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light',
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setTheme(el.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

export function KnowledgeMapForceGraph({
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
  className?: string;
}) {
  const navigate = useNavigate();
  const graphRef = useRef<ForceGraphMethods<KMNode, KMLink> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomedRef = useRef(false);
  const hadCanvasSizeRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const theme = useDataTheme();
  const palette = COLORS[theme];

  const { graphData, maxDeg } = useMemo(() => {
    const { nodes, links: graphLinks } = walkTree(tree, links, resolveResourceLabel);
    const maxDeg = Math.max(1, ...nodes.map((n) => n.deg));
    return { graphData: { nodes, links: graphLinks }, maxDeg };
  }, [tree, links, resolveResourceLabel]);

  useEffect(() => {
    hadCanvasSizeRef.current = false;
    zoomedRef.current = false;
  }, [tree, links, resolveResourceLabel]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (graphData.nodes.length === 0 || size.width <= 0 || size.height <= 0) return;

    const fg = graphRef.current;
    if (!fg) return;

    const count = graphData.nodes.length;
    const chargeMag = Math.min(1280, 200 + Math.sqrt(count) * 66) * 0.9;
    const charge = fg.d3Force('charge');
    if (charge && typeof charge.strength === 'function') {
      charge.strength(-chargeMag);
    }

    const linkDist = 95 + Math.min(110, count * 0.55);
    const linkF = fg.d3Force('link');
    if (linkF && typeof linkF.distance === 'function') {
      linkF.distance(linkDist);
    }
    if (linkF && typeof linkF.strength === 'function') {
      linkF.strength(0.5);
    }

    const center = fg.d3Force('center');
    if (center && typeof center.strength === 'function') {
      center.strength(0.1);
    }

    const hubStrength = Math.min(0.1, 0.032 + count * 0.00045);
    fg.d3Force('hubPull', forceHubPull(hubStrength));

    const maxD = Math.max(1, maxDeg);
    const coll = forceCollide<KMNode & { x?: number; y?: number }>()
      .radius((d: KMNode) => {
        if (d.kind === 'resource') {
          if (d.resourceType === 'wiki_space') return 52;
          if (d.resourceType === 'document_channel') return 48;
          if (d.resourceType === 'articles') return 50;
          return 44;
        }
        const t = Math.log1p(d.deg) / Math.log1p(maxD);
        const dotR = 3.5 + t * 6.5;
        return 48 + dotR * 3;
      })
      .strength(1)
      .iterations(4);
    fg.d3Force('collision', coll);

    const firstCanvasLayout = !hadCanvasSizeRef.current;
    hadCanvasSizeRef.current = true;
    if (firstCanvasLayout) {
      zoomedRef.current = false;
    }
    fg.d3ReheatSimulation?.();
  }, [graphData, maxDeg, size.width, size.height]);

  const handleEngineStop = useCallback(() => {
    const g = graphRef.current as GraphControlRef | undefined;
    if (!g || typeof g.zoomToFit !== 'function' || zoomedRef.current) return;
    zoomedRef.current = true;
    zoomToFitMainCluster(g, 480, 48, selectedNodeId);
  }, [selectedNodeId]);

  const handleNodeClick = useCallback(
    (node: KMNode) => {
      if (node.kind === 'taxonomy') {
        onSelectNode(node.id);
        return;
      }
      if (node.kind === 'resource' && node.resourceType && node.resourceId) {
        if (node.resourceType === 'document_channel') {
          void navigate(`/documents/channels/${encodeURIComponent(node.resourceId)}`);
        } else if (node.resourceType === 'wiki_space') {
          void navigate(`/wikis/${encodeURIComponent(node.resourceId)}`);
        } else if (node.resourceType === 'article_channel') {
          void navigate(`/articles/channels/${encodeURIComponent(node.resourceId)}`);
        } else {
          void navigate('/articles');
        }
      }
    },
    [navigate, onSelectNode],
  );

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as KMNode & { x?: number; y?: number };
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const isFocus = n.kind === 'taxonomy' && n.id === selectedNodeId;
      const fontSize = Math.max(8.5, 10.5 / globalScale);
      ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      if (n.kind === 'resource') {
        const s = 1 / globalScale;
        const rt = n.resourceType ?? '';
        const { badge, title } = resourceBadgeAndTitle(n);

        let shapeTop = y;
        let shapeBottom = y;
        const lw = 1 * s;

        const drawBadge = () => {
          if (!badge) return;
          ctx.save();
          const bs = Math.max(6.5, fontSize * 0.7);
          ctx.font = `${bs}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
          ctx.fillStyle = palette.resBadge;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(badge.toUpperCase(), x, shapeTop - 3 * s);
          ctx.restore();
        };

        if (rt === 'document_channel') {
          const w = 78 * s;
          const h = 26 * s;
          const rx = 8 * s;
          const left = x - w / 2;
          const top = y - h / 2;
          shapeTop = top;
          shapeBottom = top + h;
          pathRoundedRect(ctx, left, top, w, h, rx);
          ctx.fillStyle = palette.resChannelFill;
          ctx.fill();
          const bw = 4 * s;
          ctx.fillStyle = palette.resChannelBar;
          ctx.fillRect(left, top, Math.min(bw, w * 0.22), h);
          pathRoundedRect(ctx, left, top, w, h, rx);
          ctx.strokeStyle = palette.resChannelStroke;
          ctx.lineWidth = lw;
          ctx.stroke();
        } else if (rt === 'wiki_space') {
          const R = 17.5 * s;
          shapeTop = y - R;
          shapeBottom = y + R;
          pathHexPointyTop(ctx, x, y, R);
          ctx.fillStyle = palette.resWikiFill;
          ctx.fill();
          ctx.strokeStyle = palette.resWikiStroke;
          ctx.lineWidth = lw;
          ctx.stroke();
        } else if (rt === 'articles' || n.name.startsWith('Articles: ')) {
          const w = 24 * s;
          const h = 36 * s;
          const rx = 8 * s;
          const left = x - w / 2;
          const top = y - h / 2;
          shapeTop = top;
          shapeBottom = top + h;
          pathRoundedRect(ctx, left, top, w, h, rx);
          ctx.fillStyle = palette.resArticlesFill;
          ctx.fill();
          ctx.strokeStyle = palette.resArticlesStroke;
          ctx.lineWidth = lw;
          ctx.stroke();
        } else {
          const w = 70 * s;
          const h = 22 * s;
          const rx = 6 * s;
          const left = x - w / 2;
          const top = y - h / 2;
          shapeTop = top;
          shapeBottom = top + h;
          pathRoundedRect(ctx, left, top, w, h, rx);
          ctx.fillStyle = palette.nodeRes;
          ctx.fill();
          ctx.strokeStyle = palette.nodeResStroke;
          ctx.lineWidth = 0.9 * s;
          ctx.stroke();
        }

        drawBadge();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = palette.label;
        const maxW = 130 * s;
        const lines = wrapLabelLines(title, maxW, ctx);
        const lineHeight = fontSize * 1.12;
        const labelTop = shapeBottom + 5 * s;
        for (let i = 0; i < Math.min(lines.length, 3); i++) {
          ctx.fillText(lines[i], x, labelTop + i * lineHeight);
        }
        return;
      }

      const t = Math.log1p(n.deg) / Math.log1p(maxDeg);
      const radiusPx = 3.5 + t * 6.5;
      const r = radiusPx / globalScale;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isFocus ? palette.nodeTaxFocus : palette.nodeTax;
      ctx.fill();
      ctx.strokeStyle = isFocus ? palette.nodeTaxFocusStroke : palette.nodeTaxStroke;
      ctx.lineWidth = isFocus ? 1.25 / globalScale : 0.85 / globalScale;
      ctx.stroke();

      ctx.fillStyle = isFocus ? palette.labelFocus : palette.label;
      const maxW = 150 / globalScale;
      const lines = wrapLabelLines(n.name, maxW, ctx);
      const lineGap = 1.1;
      const lineHeight = fontSize * lineGap;
      const labelTop = y + r + 3 / globalScale;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, labelTop + i * lineHeight);
      }
    },
    [maxDeg, palette, selectedNodeId],
  );

  const linkColor = useCallback(
    (l: object) => ((l as KMLink).kind === 'tree' ? palette.linkTree : palette.linkRef),
    [palette.linkRef, palette.linkTree],
  );

  const linkArrowColor = useCallback(
    (l: object) => ((l as KMLink).kind === 'tree' ? palette.linkArrowTree : palette.linkArrowRef),
    [palette.linkArrowRef, palette.linkArrowTree],
  );

  const scrollClass = ['km-map-graph-scroll', className].filter(Boolean).join(' ');

  if (!tree.length) {
    return null;
  }

  return (
    <div className={scrollClass} role="application" aria-label="Knowledge Map graph">
      <p className="km-map-graph-hint">
        {
          'Drag to pan, scroll to zoom.'
        }
      </p>
      <div className="km-map-graph-body">
        <div className="km-map-graph-controls" role="toolbar" aria-label="Graph controls">
          <button
            type="button"
            className="km-map-graph-icon-btn"
            onClick={() => {
              zoomedRef.current = false;
              graphRef.current?.d3ReheatSimulation?.();
            }}
            title="Reheat layout"
            aria-label="Reheat layout"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className="km-map-graph-icon-btn"
            onClick={() => {
              const g = graphRef.current as GraphControlRef | undefined;
              if (!g) return;
              zoomToFitMainCluster(g, 420, 48, selectedNodeId);
            }}
            title="Fit main cluster"
            aria-label="Fit main cluster"
          >
            <Expand size={16} />
          </button>
          <button
            type="button"
            className="km-map-graph-icon-btn"
            onClick={() => {
              const g = graphRef.current;
              if (g && typeof g.zoom === 'function') g.zoom(g.zoom() * 1.3, 200);
            }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="km-map-graph-icon-btn"
            onClick={() => {
              const g = graphRef.current;
              if (g && typeof g.zoom === 'function') g.zoom(g.zoom() / 1.3, 200);
            }}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
        </div>
        <div ref={containerRef} className="km-map-graph-canvas-wrap">
          {size.width > 0 && size.height > 0 && graphData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={size.width}
              height={size.height}
              backgroundColor={palette.bg}
              nodeLabel={(n) => (n as KMNode).name}
              linkColor={linkColor}
              linkWidth={(l) => ((l as KMLink).kind === 'tree' ? 1.0 : 0.65)}
              linkDirectionalArrowLength={(l) => ((l as KMLink).kind === 'tree' ? 3.5 : 2.5)}
              linkDirectionalArrowRelPos={1}
              linkDirectionalArrowColor={linkArrowColor}
              linkDirectionalParticles={0}
              onNodeClick={handleNodeClick}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={paintNode}
              warmupTicks={Math.min(120, 40 + graphData.nodes.length)}
              cooldownTicks={Math.min(500, 180 + graphData.nodes.length * 2)}
              d3VelocityDecay={0.28}
              onEngineStop={handleEngineStop}
            />
          ) : (
            <p className="km-map-graph-hint km-map-graph-loading" style={{ padding: '2rem', justifyContent: 'center' }}>
              <Loader2 className="km-map-graph-spin" size={20} aria-hidden />
              Preparing graph…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
