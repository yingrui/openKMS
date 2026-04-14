import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide } from 'd3-force';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Crosshair, Loader2, Network, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWikiSpace, fetchWikiSpaceGraph } from '../data/wikiSpacesApi';
import type { WikiLinkGraphResponse } from '../data/wikiSpacesApi';
import './WikiSpaceGraph.css';

type GNode = {
  id: string;
  name: string;
  /** Total incident edges (in + out) for hub sizing */
  deg: number;
};

type GLink = { source: string; target: string };

const COLORS = {
  light: {
    bg: '#fafaf9',
    node: '#a8a29e',
    nodeStroke: '#e7e5e4',
    nodeFocus: '#6366f1',
    nodeFocusStroke: '#818cf8',
    label: '#57534e',
    labelFocus: '#4338ca',
    link: 'rgba(87, 83, 78, 0.55)',
    linkArrow: 'rgba(87, 83, 78, 0.65)',
  },
  dark: {
    bg: '#0c0a09',
    node: '#78716c',
    nodeStroke: '#44403c',
    nodeFocus: '#818cf8',
    nodeFocusStroke: '#a5b4fc',
    label: '#d6d3d1',
    labelFocus: '#c7d2fe',
    link: 'rgba(214, 211, 209, 0.45)',
    linkArrow: 'rgba(214, 211, 209, 0.6)',
  },
} as const;

function truncateLabel(s: string, maxChars: number): string {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

function useDataTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light'
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

export function WikiSpaceGraph() {
  const { id: spaceId } = useParams();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus') ?? undefined;
  const navigate = useNavigate();
  const graphRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomedRef = useRef(false);
  /** Tracks when canvas was not yet mounted (size 0) so we can reset zoom after first layout. */
  const hadCanvasSizeRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [spaceName, setSpaceName] = useState<string | null>(null);
  const [data, setData] = useState<WikiLinkGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = useDataTheme();
  const palette = COLORS[theme];

  const { graphData, maxDeg } = useMemo(() => {
    if (!data) {
      return { graphData: { nodes: [] as GNode[], links: [] as GLink[] }, maxDeg: 1 };
    }
    const degree = new Map<string, number>();
    for (const l of data.links) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }
    const maxDeg = Math.max(1, ...Array.from(degree.values()));
    const nodes: GNode[] = data.nodes.map((n) => ({
      id: n.id,
      name: n.title || n.path,
      deg: degree.get(n.id) ?? 0,
    }));
    const links: GLink[] = data.links.map((l) => ({
      source: l.source,
      target: l.target,
    }));
    return { graphData: { nodes, links }, maxDeg };
  }, [data]);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    setLoading(true);
    zoomedRef.current = false;
    Promise.all([fetchWikiSpace(spaceId), fetchWikiSpaceGraph(spaceId)])
      .then(([sp, g]) => {
        if (!cancelled) {
          setSpaceName(sp.name);
          setData(g);
        }
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load graph');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  useEffect(() => {
    hadCanvasSizeRef.current = false;
  }, [spaceId]);

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
  }, [data]);

  useEffect(() => {
    if (graphData.nodes.length === 0 || size.width <= 0 || size.height <= 0) return;

    const fg = graphRef.current;
    if (!fg) return;

    const count = graphData.nodes.length;
    /** Strong repulsion; scales with √n (reduces central “hairball”). */
    const chargeMag = Math.min(1400, 220 + Math.sqrt(count) * 72);
    const charge = fg.d3Force('charge');
    if (charge && typeof charge.strength === 'function') {
      charge.strength(-chargeMag);
    }

    const linkDist = 115 + Math.min(140, count * 0.55);
    const linkF = fg.d3Force('link');
    if (linkF && typeof linkF.distance === 'function') {
      linkF.distance(linkDist);
    }
    if (linkF && typeof linkF.strength === 'function') {
      linkF.strength(0.32);
    }

    const center = fg.d3Force('center');
    if (center && typeof center.strength === 'function') {
      center.strength(0.04);
    }

    const maxD = Math.max(1, maxDeg);
    const coll = forceCollide<GNode & { x?: number; y?: number }>()
      .radius((d: GNode) => {
        const t = Math.log1p(d.deg) / Math.log1p(maxD);
        const dotR = 3.5 + t * 6.5;
        return 38 + dotR * 3.2;
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

  const handleNodeClick = useCallback(
    (node: GNode) => {
      if (!spaceId) return;
      navigate(`/wikis/${spaceId}/pages/${node.id}`);
    },
    [navigate, spaceId]
  );

  const handleEngineStop = useCallback(() => {
    const g = graphRef.current;
    if (!g || typeof g.zoomToFit !== 'function' || zoomedRef.current) return;
    zoomedRef.current = true;
    if (focusId) {
      g.zoomToFit(500, 72, (n: object) => (n as GNode).id === focusId);
    } else {
      g.zoomToFit(420, 56);
    }
  }, [focusId]);

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GNode & { x?: number; y?: number };
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const isFocus = n.id === focusId;
      const t = Math.log1p(n.deg) / Math.log1p(maxDeg);
      const radiusPx = 3.5 + t * 6.5;
      const r = radiusPx / globalScale;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isFocus ? palette.nodeFocus : palette.node;
      ctx.fill();
      ctx.strokeStyle = isFocus ? palette.nodeFocusStroke : palette.nodeStroke;
      ctx.lineWidth = isFocus ? 1.25 / globalScale : 0.85 / globalScale;
      ctx.stroke();

      const fontSize = Math.max(8.5, 10.5 / globalScale);
      ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.fillStyle = isFocus ? palette.labelFocus : palette.label;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const maxW = 140 / globalScale;
      let text = truncateLabel(n.name, 48);
      while (text.length > 2 && ctx.measureText(text).width > maxW) {
        text = `${text.slice(0, -2)}…`;
      }
      ctx.fillText(text, x, y + r + 3 / globalScale);
    },
    [focusId, maxDeg, palette]
  );

  if (!spaceId) {
    return <p className="wiki-space-graph-muted">Missing space id</p>;
  }

  return (
    <div className="wiki-space-graph">
      <div className="wiki-space-graph-toolbar">
        <Link to={`/wikis/${spaceId}`} className="wiki-space-graph-back">
          ← Back to space
        </Link>
        <h1 className="wiki-space-graph-title">
          <Network size={22} aria-hidden />
          {spaceName ? `${spaceName} — Graph View` : 'Graph View'}
        </h1>
      </div>
      {loading && (
        <p className="wiki-space-graph-status">
          <Loader2 className="wiki-space-graph-spin" size={18} aria-hidden />
          Loading graph…
        </p>
      )}
      {!loading && data && (
        <div className="wiki-space-graph-body">
          <div className="wiki-space-graph-controls" role="toolbar" aria-label="Graph controls">
            <button
              type="button"
              className="wiki-space-graph-icon-btn"
              onClick={() => graphRef.current?.d3ReheatSimulation?.()}
              title="Reheat layout"
              aria-label="Reheat layout"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              className="wiki-space-graph-icon-btn"
              onClick={() => graphRef.current?.centerAt(0, 0, 200)}
              title="Center view"
              aria-label="Center view"
            >
              <Crosshair size={16} />
            </button>
            <button
              type="button"
              className="wiki-space-graph-icon-btn"
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
              className="wiki-space-graph-icon-btn"
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
          <div ref={containerRef} className="wiki-space-graph-canvas-wrap">
            {size.width > 0 && size.height > 0 && graphData.nodes.length > 0 ? (
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                width={size.width}
                height={size.height}
                backgroundColor={palette.bg}
                nodeLabel={(n) => (n as GNode).name}
                linkColor={() => palette.link}
                linkWidth={1.15}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkDirectionalArrowColor={() => palette.linkArrow}
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
              !loading && (
                <p className="wiki-space-graph-hint wiki-space-graph-hint--empty">
                  No pages in this space yet. Add pages or import a vault to see links here.
                </p>
              )
            )}
          </div>
          {graphData.nodes.length > 0 && (
            <p className="wiki-space-graph-hint">
              Drag to pan, scroll to zoom. Click a note to open it. Larger dots are more connected.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
