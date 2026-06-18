import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import { Expand, Loader2, RotateCcw } from 'lucide-react';
import type { KnowledgeMapNode, ResourceLink } from '../data/knowledgeMapApi';
import { type KMNode, type KMLink, resourceBadgeAndTitle, walkTree } from '../graph/knowledgeMapGraphModel';
import './KnowledgeMapForceGraph.scss';

const COLORS = {
  light: {
    bg: '#f3f2ef',
    nodeTax: '#0d9488',
    nodeTaxFocus: '#0f766e',
    nodeRes: '#78716c',
    resChannel: '#64748b',
    resWiki: '#7c3aed',
    resArticles: '#c2410c',
    linkTree: 'rgba(13, 148, 136, 0.55)',
    linkRef: 'rgba(87, 83, 78, 0.4)',
    linkArrowTree: 'rgba(13, 148, 136, 0.75)',
    linkArrowRef: 'rgba(87, 83, 78, 0.55)',
  },
  dark: {
    bg: '#2d2a27',
    nodeTax: '#2dd4bf',
    nodeTaxFocus: '#5eead4',
    nodeRes: '#a8a29e',
    resChannel: '#94a3b8',
    resWiki: '#a78bfa',
    resArticles: '#fb923c',
    linkTree: 'rgba(45, 212, 191, 0.45)',
    linkRef: 'rgba(214, 211, 209, 0.28)',
    linkArrowTree: 'rgba(94, 234, 212, 0.65)',
    linkArrowRef: 'rgba(214, 211, 209, 0.45)',
  },
} as const;

type Km3DPalette = (typeof COLORS)[keyof typeof COLORS];

/** Sphere radius = cbrt(nodeVal) * nodeRelSize (three-forcegraph). */
const NODE_REL_SIZE = 8.85;

const LABEL_FONT_PX = 28;
const LABEL_MAX_CHARS = 48;

const spriteLabelMaterialCache = new Map<string, THREE.SpriteMaterial>();

function truncateGraphLabel(s: string, max = LABEL_MAX_CHARS): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildNodeLabelText(node: KMNode): string {
  if (node.kind === 'resource') {
    const { badge, title } = resourceBadgeAndTitle(node);
    return badge ? `${badge}: ${title}` : title;
  }
  return node.name;
}

function getOrCreateLabelSpriteMaterial(textRaw: string, theme: 'light' | 'dark'): THREE.SpriteMaterial {
  const text = truncateGraphLabel(textRaw);
  const key = `${theme}|${LABEL_FONT_PX}|${text}`;
  const hit = spriteLabelMaterialCache.get(key);
  if (hit) return hit;

  const fontPx = LABEL_FONT_PX;
  const pad = 11;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
    spriteLabelMaterialCache.set(key, mat);
    return mat;
  }
  ctx.font = `500 ${fontPx}px system-ui, sans-serif`;
  const w = Math.min(Math.ceil(ctx.measureText(text).width + pad * 2), 900);
  const h = fontPx + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `500 ${fontPx}px system-ui, sans-serif`;
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  if (theme === 'dark') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#e7e5e4';
  } else {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#1c1917';
  }
  ctx.fillText(text, pad, h / 2);
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  spriteLabelMaterialCache.set(key, mat);
  return mat;
}

function coreNodeIdsForSpatialZoom3d(
  nodes: Array<{ id: string; x?: number; y?: number; z?: number }>,
  keepFraction = 0.82,
): Set<string> | null {
  const positioned = nodes.filter(
    (n) =>
      typeof n.x === 'number' &&
      typeof n.y === 'number' &&
      typeof n.z === 'number' &&
      Number.isFinite(n.x) &&
      Number.isFinite(n.y) &&
      Number.isFinite(n.z),
  );
  if (positioned.length < 8) return null;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const n of positioned) {
    cx += n.x!;
    cy += n.y!;
    cz += n.z!;
  }
  cx /= positioned.length;
  cy /= positioned.length;
  cz /= positioned.length;

  const scored = positioned.map((n) => ({
    id: n.id,
    d: Math.hypot(n.x! - cx, n.y! - cy, n.z! - cz),
  }));
  scored.sort((a, b) => a.d - b.d);

  const keep = Math.max(5, Math.ceil(positioned.length * keepFraction));
  if (keep >= positioned.length) return null;

  return new Set(scored.slice(0, keep).map((s) => s.id));
}

type Graph3ControlRef = ForceGraphMethods<KMNode, KMLink>;

function zoomToFitMainCluster3d(
  g: Graph3ControlRef,
  nodes: KMNode[],
  durationMs: number,
  paddingPx: number,
  focusId?: string | null,
): void {
  if (typeof g.zoomToFit !== 'function') return;
  if (!nodes?.length) {
    g.zoomToFit(durationMs, paddingPx);
    return;
  }

  const focusInGraph = Boolean(focusId && nodes.some((n) => n.id === focusId));
  const core = coreNodeIdsForSpatialZoom3d(nodes);

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

function nodeColor(n: KMNode, palette: Km3DPalette, selectedNodeId: string | null): string {
  if (n.kind === 'map_node') {
    return n.id === selectedNodeId ? palette.nodeTaxFocus : palette.nodeTax;
  }
  const rt = n.resourceType ?? '';
  if (rt === 'document_channel') return palette.resChannel;
  if (rt === 'wiki_space') return palette.resWiki;
  if (rt === 'articles' || n.name.startsWith('Articles: ')) return palette.resArticles;
  return palette.nodeRes;
}

function nodeVal(n: KMNode, maxDeg: number): number {
  if (n.kind === 'resource') {
    if (n.resourceType === 'wiki_space') return 2.95;
    if (n.resourceType === 'document_channel') return 2.65;
    if (n.resourceType === 'articles' || n.name.startsWith('Articles: ')) return 2.75;
    return 2.35;
  }
  const t = Math.log1p(n.deg) / Math.log1p(maxDeg);
  return 4.1 + t * 6.2;
}

export function KnowledgeMapForceGraph3D({
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
  const { t } = useTranslation('common');
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

    // Defer until three-forcegraph has assigned `state.layout` on the d3 simulation; calling
    // `d3Force` / `d3ReheatSimulation` in the same tick as mount can leave `engineRunning` true
    // while `layout` is still undefined → layoutTick throws on `layout.tick`.
    const frame = requestAnimationFrame(() => {
      const fg = graphRef.current;
      if (!fg) return;

      const count = graphData.nodes.length;
      const chargeMag = Math.min(1280, 200 + Math.sqrt(count) * 66) * 0.9;
      const charge = fg.d3Force('charge');
      if (charge && typeof charge.strength === 'function') {
        charge.strength(-chargeMag);
      }

      const linkDist = 120 + Math.min(140, count * 0.65);
      const linkF = fg.d3Force('link');
      if (linkF && typeof linkF.distance === 'function') {
        linkF.distance(linkDist);
      }
      if (linkF && typeof linkF.strength === 'function') {
        linkF.strength(0.45);
      }

      const center = fg.d3Force('center');
      if (center && typeof center.strength === 'function') {
        center.strength(0.08);
      }

      const firstCanvasLayout = !hadCanvasSizeRef.current;
      hadCanvasSizeRef.current = true;
      if (firstCanvasLayout) {
        zoomedRef.current = false;
      }
      fg.d3ReheatSimulation?.();
    });

    return () => cancelAnimationFrame(frame);
  }, [graphData, size.width, size.height]);

  const handleEngineStop = useCallback(() => {
    const g = graphRef.current;
    if (!g || typeof g.zoomToFit !== 'function' || zoomedRef.current) return;
    zoomedRef.current = true;
    zoomToFitMainCluster3d(g, graphData.nodes, 520, 48, selectedNodeId);
  }, [graphData.nodes, selectedNodeId]);

  const handleNodeClick = useCallback(
    (node: KMNode) => {
      if (node.kind === 'map_node') {
        onSelectNode(node.id);
        return;
      }
      if (node.kind === 'resource' && node.resourceType && node.resourceId) {
        if (node.resourceType === 'document_channel') {
          void navigate(`/documents/channels/${encodeURIComponent(node.resourceId)}`);
        } else if (node.resourceType === 'wiki_space') {
          void navigate(`/wikis/${encodeURIComponent(node.resourceId)}/pages/graph`);
        } else if (node.resourceType === 'article_channel') {
          void navigate(`/articles/channels/${encodeURIComponent(node.resourceId)}`);
        } else if (node.resourceType === 'media_channel') {
          void navigate(`/media/channels/${encodeURIComponent(node.resourceId)}`);
        } else {
          void navigate('/articles');
        }
      }
    },
    [navigate, onSelectNode],
  );

  const nodeColorCb = useCallback(
    (n: object) => nodeColor(n as KMNode, palette, selectedNodeId),
    [palette, selectedNodeId],
  );

  const nodeValCb = useCallback((n: object) => nodeVal(n as KMNode, maxDeg), [maxDeg]);

  const linkColor = useCallback(
    (l: object) => ((l as KMLink).kind === 'tree' ? palette.linkTree : palette.linkRef),
    [palette.linkRef, palette.linkTree],
  );

  const linkArrowColor = useCallback(
    (l: object) => ((l as KMLink).kind === 'tree' ? palette.linkArrowTree : palette.linkArrowRef),
    [palette.linkArrowRef, palette.linkArrowTree],
  );

  const nodeLabel = useCallback((n: object) => buildNodeLabelText(n as KMNode), []);

  const nodeThreeObjectCb = useCallback(
    (obj: object) => {
      const n = obj as KMNode;
      const labelText = buildNodeLabelText(n);
      const val = nodeVal(n, maxDeg);
      const radius = Math.cbrt(val) * NODE_REL_SIZE;
      const material = getOrCreateLabelSpriteMaterial(labelText, theme);
      const img = material.map?.image;
      const aspect =
        img && typeof img === 'object' && 'width' in img && 'height' in img && (img as HTMLCanvasElement).height > 0
          ? (img as HTMLCanvasElement).width / (img as HTMLCanvasElement).height
          : 2;
      const labelH = Math.max(radius * 1.58, 6.2);
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(labelH * aspect, labelH, 1);
      sprite.position.y = radius + labelH * 0.48;
      sprite.renderOrder = 2;
      return sprite;
    },
    [maxDeg, theme],
  );

  const scrollClass = ['km-map-graph-scroll', className].filter(Boolean).join(' ');

  if (!tree.length) {
    return null;
  }

  return (
    <div className={scrollClass} role="application" aria-label="Knowledge Map 3D graph">
      <p className="km-map-graph-hint">{t('graph3dHint')}</p>
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
              const g = graphRef.current;
              if (!g) return;
              zoomToFitMainCluster3d(g, graphData.nodes, 420, 44, selectedNodeId);
            }}
            title="Fit main cluster"
            aria-label="Fit main cluster"
          >
            <Expand size={16} />
          </button>
        </div>
        <div ref={containerRef} className="km-map-graph-canvas-wrap km-map-graph-canvas-wrap--3d">
          {size.width > 0 && size.height > 0 && graphData.nodes.length > 0 ? (
            <ForceGraph3D
              ref={graphRef}
              graphData={graphData}
              numDimensions={3}
              width={size.width}
              height={size.height}
              backgroundColor={palette.bg}
              nodeLabel={nodeLabel}
              nodeThreeObjectExtend
              nodeThreeObject={nodeThreeObjectCb}
              nodeColor={nodeColorCb}
              nodeVal={nodeValCb}
              nodeRelSize={NODE_REL_SIZE}
              nodeOpacity={0.92}
              nodeResolution={28}
              linkColor={linkColor}
              linkWidth={(l) => ((l as KMLink).kind === 'tree' ? 1.45 : 0.98)}
              linkDirectionalArrowLength={(l) => ((l as KMLink).kind === 'tree' ? 5.2 : 3.5)}
              linkDirectionalArrowRelPos={1}
              linkDirectionalArrowColor={linkArrowColor}
              linkDirectionalParticles={0}
              onNodeClick={handleNodeClick}
              enableNodeDrag={false}
              showNavInfo={false}
              warmupTicks={Math.min(100, 36 + graphData.nodes.length)}
              cooldownTicks={Math.min(420, 160 + graphData.nodes.length * 2)}
              d3VelocityDecay={0.28}
              onEngineStop={handleEngineStop}
            />
          ) : (
            <p className="km-map-graph-hint km-map-graph-loading km-map-graph-loading--padded">
              <Loader2 className="km-map-graph-spin" size={20} aria-hidden />
              Preparing graph…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
